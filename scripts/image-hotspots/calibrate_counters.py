#!/usr/bin/env python3
"""Calibración OFFLINE de los hotspots de las hojas de counters (ajuste_imagenes.md, IMG-009).

Herramienta de desarrollo: NO se ejecuta con `npm start` ni en el navegador. La
aplicación solo consume el JSON versionado que genera (data/image-hotspots/counters.json).

Qué hace, de forma determinista para la misma imagen y perfil:
  1. Verifica dimensiones y SHA-256 de cada hoja (rechaza si no coinciden con factor-map.json).
  2. Recorta cada plantilla de ficha (region de data/counters/factor-map.json).
  3. Segmenta por color los elementos de la ficha (cajas azules y marcas rojas de expansión),
     rellena el rayado con una operación morfológica y extrae contornos (findContours).
  4. Asigna cada elemento detectado al factor cuya posición genérica declarada
     (`position` + `positionBoxes`) queda más cerca (asignación voraz por distancia). La
     semántica la dan los datos ya transcritos; la imagen solo aporta la posición.
  5. Escribe candidatos con confianza y reviewStatus `generated` (o `needs_review` si el número
     de elementos no cuadra con el de factores o la asignación es dudosa) y una imagen de
     control (QA) por plantilla para la revisión humana.

Uso (desde la raíz del repositorio):
  uv run --no-project --python 3.12 --with opencv-python-headless==5.0.0.93 --with numpy==2.5.3 \
      python scripts/image-hotspots/calibrate_counters.py

Nunca marca `verified`: esa marca es de la revisión humana.
"""
import hashlib
import json
import math
import os
import sys

import cv2
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FACTOR_MAP = os.path.join(ROOT, 'data', 'counters', 'factor-map.json')
OUT_JSON = os.path.join(ROOT, 'data', 'image-hotspots', 'counters.json')
OVERRIDES = os.path.join(ROOT, 'scripts', 'image-hotspots', 'profiles', 'counters-overrides.json')
QA_DIR = os.path.join(ROOT, 'docs', 'image-hotspots', 'review', 'counters')
PROFILE = 'counter-sheet-v1'
MIN_AREA_PX = 90          # área mínima de un elemento (px² de la hoja original)
MAX_AREA_FRAC = 0.2       # un elemento no puede ocupar más del 20 % del recorte
CONF_OK = 0.8             # por debajo de esto, el candidato pasa a needs_review


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        h.update(f.read())
    return h.hexdigest()


def split_touching(mask):
    """Separa elementos que se tocan (p.ej. iconos apilados) con transformada de distancia + watershed."""
    dist = cv2.distanceTransform(mask, cv2.DIST_L2, 3)
    if dist.max() <= 0:
        return mask
    # Núcleos seguros: cada elemento tiene su máximo de distancia; los cuellos entre elementos no.
    seeds = (dist > 0.62 * dist.max()).astype(np.uint8)
    # Los elementos pequeños tienen un máximo menor que el global: se añaden sus propios máximos locales.
    local = cv2.dilate(dist, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    seeds |= ((dist >= local - 1e-6) & (dist > 2.0)).astype(np.uint8)
    seeds = cv2.morphologyEx(seeds, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    n, markers = cv2.connectedComponents(seeds)
    if n <= 2:
        return mask
    markers = markers + 1
    markers[mask == 0] = 0
    bgr = cv2.cvtColor(mask * 255, cv2.COLOR_GRAY2BGR)
    ws = cv2.watershed(bgr, markers.astype(np.int32))
    out = mask.copy()
    out[ws == -1] = 0  # las fronteras entre elementos separan los contornos
    return out


def segment_elements(crop_bgr):
    """Cajas azules y marcas rojas de la ficha (no texto negro, no líneas, no cuerpo gris)."""
    blur = cv2.GaussianBlur(crop_bgr, (3, 3), 0)
    hsv = cv2.cvtColor(blur, cv2.COLOR_BGR2HSV)
    h, s, v = cv2.split(hsv)
    # Azul acero de las cajas (OpenCV: H 0-179). El fondo de la hoja es un cian muy pálido
    # (baja saturación); el cuerpo de la ficha, gris (saturación ~0).
    blue = cv2.inRange(hsv, (92, 90, 60), (112, 255, 235))
    red = cv2.bitwise_or(cv2.inRange(hsv, (0, 110, 70), (10, 255, 255)), cv2.inRange(hsv, (170, 110, 70), (179, 255, 255)))
    mask = cv2.bitwise_or(blue, red)
    # El rayado deja huecos blancos: se cierran para obtener la caja completa.
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=1)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    mask = split_touching(mask)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    h_img, w_img = mask.shape
    found = []
    for c in contours:
        x, y, w, hh = cv2.boundingRect(c)
        area = cv2.contourArea(c)
        if area < MIN_AREA_PX or w * hh > MAX_AREA_FRAC * w_img * h_img:
            continue
        fill = area / float(w * hh)
        is_red = bool(np.count_nonzero(red[y:y + hh, x:x + w]) > 0.3 * area)
        comp = np.zeros(mask.shape, np.uint8)
        cv2.drawContours(comp, [c], -1, 1, thickness=cv2.FILLED)
        found.append({'x': x, 'y': y, 'w': w, 'h': hh, 'fill': fill, 'red': is_red, 'mask': comp[y:y + hh, x:x + w]})
    return found


def tighten(mask_part, ox, oy, red):
    ys, xs = np.nonzero(mask_part)
    if len(xs) < MIN_AREA_PX // 3:
        return None
    x0, x1, y0, y1 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
    return {'x': ox + x0, 'y': oy + y0, 'w': x1 - x0, 'h': y1 - y0, 'fill': 1.0, 'red': red,
            'mask': mask_part[y0:y1, x0:x1], 'split': True}


def auto_split(el, depth=0):
    """Separa elementos apilados que se tocan: los huecos de 1-2 px entre iconos dejan un valle
    profundo en el perfil de la máscara a lo largo de un eje (los rayados son diagonales y no lo
    producen). Recursivo sobre las partes resultantes."""
    if depth > 4:
        return [el]
    m = el['mask']
    best = None
    for axis in (1, 0):  # axis=1: perfil por filas (corte horizontal); axis=0: perfil por columnas
        prof = m.sum(axis=axis).astype(float)
        n = len(prof)
        for i in range(3, n - 3):
            if prof[i] > prof[i - 1] or prof[i] > prof[i + 1]:
                continue
            left, right = prof[:i].max(), prof[i + 1:].max()
            ref = min(left, right)
            if ref >= 6 and prof[i] <= 0.4 * ref:
                score = prof[i] / ref
                if best is None or score < best[0]:
                    best = (score, axis, i)
    if best is None:
        return [el]
    _, axis, i = best
    if axis == 1:
        parts = [tighten(m[:i, :], el['x'], el['y'], el['red']), tighten(m[i + 1:, :], el['x'], el['y'] + i + 1, el['red'])]
    else:
        parts = [tighten(m[:, :i], el['x'], el['y'], el['red']), tighten(m[:, i + 1:], el['x'] + i + 1, el['y'], el['red'])]
    if any(p is None for p in parts):
        return [el]
    out = []
    for part in parts:
        out.extend(auto_split(part, depth + 1))
    return out


def split_merged(found, targets_xy):
    out = []
    for el in found:
        out.extend(auto_split(el))
    return out


def center(box):
    return (box['x'] + box['w'] / 2.0, box['y'] + box['h'] / 2.0)


def assign(found, factors, position_boxes, crop_w, crop_h):
    """Asignación voraz elemento -> factor por distancia al centro de su posición genérica."""
    targets = []
    for f in factors:
        pb = position_boxes[f['position']]
        targets.append((f, (pb['xPct'] + pb['wPct'] / 2.0) / 100.0 * crop_w, (pb['yPct'] + pb['hPct'] / 2.0) / 100.0 * crop_h))
    pairs = []
    for i, el in enumerate(found):
        cx, cy = center(el)
        for j, (f, tx, ty) in enumerate(targets):
            pairs.append((math.hypot(cx - tx, cy - ty), i, j))
    pairs.sort()
    used_e, used_f, result = set(), set(), {}
    diag = math.hypot(crop_w, crop_h)
    for dist, i, j in pairs:
        if i in used_e or j in used_f:
            continue
        used_e.add(i)
        used_f.add(j)
        result[j] = (i, dist / diag)
    return targets, result


def review_fields(review):
    # Un ajuste humano queda verified solo si el fichero de ajustes declara quién lo revisó y cuándo.
    if review:
        return {'reviewStatus': 'verified', 'reviewedBy': review['by'], 'reviewedAt': review['at'], 'reviewNote': review.get('note', '')}
    return {'reviewStatus': 'generated'}


def main():
    with open(FACTOR_MAP, encoding='utf8') as fh:
        fm = json.load(fh)
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    os.makedirs(QA_DIR, exist_ok=True)

    images = {}
    for name, dims in fm['sourceImages'].items():
        path = os.path.join(ROOT, 'data', 'counters', name)
        img = cv2.imread(path)
        if img is None:
            sys.exit('No se puede leer ' + path)
        hh, ww = img.shape[:2]
        if (ww, hh) != (dims['widthPx'], dims['heightPx']):
            sys.exit('Dimensiones distintas de factor-map.json para ' + name)
        images[name] = {'path': path, 'bgr': img, 'width': ww, 'height': hh, 'sha256': sha256(path)}

    output = {
        'schemaVersion': 1,
        'kind': 'counter-sheets',
        'calibration': {
            'tool': 'opencv', 'toolVersion': cv2.__version__, 'profile': PROFILE,
            'script': 'scripts/image-hotspots/calibrate_counters.py',
            'note': 'Candidatos generados; ninguno es verified hasta su revisión humana con la imagen QA.'
        },
        'images': {},
        'instances': []
    }
    for name, info in images.items():
        output['images'][name] = {'src': 'data/counters/' + name, 'width': info['width'], 'height': info['height'], 'sha256': info['sha256']}

    overrides = {}
    review = None
    if os.path.exists(OVERRIDES):
        with open(OVERRIDES, encoding='utf8') as fh:
            loaded = json.load(fh)
            overrides = loaded.get('templates', {})
            review = loaded.get('review')

    summary = []
    for tpl in fm['counterTemplates']:
        info = images[tpl['region']['sourceImage']]
        r = tpl['region']
        x0 = int(round(r['xPct'] / 100.0 * info['width']))
        y0 = int(round(r['yPct'] / 100.0 * info['height']))
        cw = int(round(r['wPct'] / 100.0 * info['width']))
        ch = int(round(r['hPct'] / 100.0 * info['height']))
        crop = info['bgr'][y0:y0 + ch, x0:x0 + cw]
        found = segment_elements(crop)
        targets_xy = [((fm['positionBoxes'][f['position']]['xPct'] + fm['positionBoxes'][f['position']]['wPct'] / 2.0) / 100.0 * cw,
                       (fm['positionBoxes'][f['position']]['yPct'] + fm['positionBoxes'][f['position']]['hPct'] / 2.0) / 100.0 * ch) for f in tpl['factors']]
        found = split_merged(found, targets_xy)
        targets, result = assign(found, tpl['factors'], fm['positionBoxes'], cw, ch)
        count_ok = len(found) == len(tpl['factors'])

        hotspots = []
        qa = crop.copy()
        tpl_over = overrides.get(tpl['id'], {})
        for j, (f, tx, ty) in enumerate(targets):
            ov = tpl_over.get(f['factor'])
            if ov and 'det' in ov:
                # Ajuste humano por índice: el revisor indica qué elemento detectado (número
                # magenta de la imagen QA) corresponde a este factor.
                el = found[ov['det']]
                rect = {'x': round((x0 + el['x']) / float(info['width']), 5), 'y': round((y0 + el['y']) / float(info['height']), 5),
                        'width': round(el['w'] / float(info['width']), 5), 'height': round(el['h'] / float(info['height']), 5)}
                cv2.rectangle(qa, (el['x'], el['y']), (el['x'] + el['w'], el['y'] + el['h']), (0, 160, 0), 1)
                cv2.putText(qa, f['factor'], (el['x'], max(el['y'] - 3, 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.33, (0, 120, 0), 1, cv2.LINE_AA)
                hotspots.append({'id': f['factor'], 'conceptId': f['factor'], 'rect': rect, 'confidence': 1.0, **review_fields(review), 'method': 'opencv-detection+manual-adjust', 'adjustNote': ov.get('note', '')})
                continue
            if ov:
                # Ajuste humano (revisión): rectángulo en píxeles del recorte de la plantilla.
                ox, oy, ow, oh = ov['px']
                rect = {'x': round((x0 + ox) / float(info['width']), 5), 'y': round((y0 + oy) / float(info['height']), 5),
                        'width': round(ow / float(info['width']), 5), 'height': round(oh / float(info['height']), 5)}
                cv2.rectangle(qa, (int(ox), int(oy)), (int(ox + ow), int(oy + oh)), (0, 160, 0), 1)
                cv2.putText(qa, f['factor'], (int(ox), max(int(oy) - 3, 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.33, (0, 120, 0), 1, cv2.LINE_AA)
                hotspots.append({'id': f['factor'], 'conceptId': f['factor'], 'rect': rect, 'confidence': 1.0, **review_fields(review), 'method': 'opencv-detection+manual-adjust', 'adjustNote': ov.get('note', '')})
                continue
            if j in result and not count_ok:
                # El número de elementos no cuadra con el de factores: la asignación sería una
                # suposición. Sin geometría propia hasta que haya ajuste humano.
                hotspots.append({'id': f['factor'], 'conceptId': f['factor'], 'rect': None, 'confidence': 0.0, 'reviewStatus': 'needs_review',
                                 'note': 'Detección ambigua (elementos detectados distintos de factores): sin geometría propia.'})
            elif j in result:
                i, rel_dist = result[j]
                el = found[i]
                conf = max(0.0, min(1.0, 1.0 - rel_dist * 3.0))
                if not count_ok:
                    conf = min(conf, 0.6)
                status = 'generated' if conf >= CONF_OK else 'needs_review'
                rect = {
                    'x': round((x0 + el['x']) / float(info['width']), 5), 'y': round((y0 + el['y']) / float(info['height']), 5),
                    'width': round(el['w'] / float(info['width']), 5), 'height': round(el['h'] / float(info['height']), 5)
                }
                color = (0, 160, 0) if status == 'generated' else (0, 165, 255)
                cv2.rectangle(qa, (el['x'], el['y']), (el['x'] + el['w'], el['y'] + el['h']), color, 2)
                cv2.putText(qa, f['factor'], (el['x'], max(el['y'] - 3, 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.35, color, 1, cv2.LINE_AA)
                hotspots.append({'id': f['factor'], 'conceptId': f['factor'], 'rect': rect, 'confidence': round(conf, 3), 'reviewStatus': status})
            else:
                hotspots.append({'id': f['factor'], 'conceptId': f['factor'], 'rect': None, 'confidence': 0.0, 'reviewStatus': 'needs_review',
                                 'note': 'No se detectó un elemento para este factor; sin geometría propia.'})
        for idx, el in enumerate(found):
            cv2.putText(qa, str(idx), (el['x'] + 2, el['y'] + el['h'] - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.3, (200, 0, 200), 1, cv2.LINE_AA)
        qa_big = cv2.resize(qa, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
        cv2.imwrite(os.path.join(QA_DIR, tpl['id'] + '.png'), qa_big)
        output['instances'].append({
            'id': tpl['id'], 'type': 'counter-template', 'label': tpl['title'], 'imageId': tpl['region']['sourceImage'],
            'rect': {'x': round(x0 / float(info['width']), 5), 'y': round(y0 / float(info['height']), 5), 'width': round(cw / float(info['width']), 5), 'height': round(ch / float(info['height']), 5)},
            'detected': len(found), 'expected': len(tpl['factors']), 'hotspots': hotspots
        })
        summary.append((tpl['id'], len(found), len(tpl['factors'])))

    with open(OUT_JSON, 'w', encoding='utf8') as fh:
        json.dump(output, fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    for tid, got, exp in summary:
        print(f"{tid:34s} detectados {got:2d} / factores {exp:2d} {'OK' if got == exp else '<-- REVISAR'}")


if __name__ == '__main__':
    main()
