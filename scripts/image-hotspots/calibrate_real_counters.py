"""Calibra con OpenCV los factores de las fichas reales de images/ (Fase 25, AD-007).

Herramienta de desarrollo, offline. Las fichas reales están en images/ (fuera del repositorio: material del editor,
uso privado). Para cada ficha declarada en scripts/image-hotspots/profiles/real-counters.json:

1. Toma la plantilla de muestra de la misma clase (data/counters/factor-map.json) con sus zonas ya revisadas
   (data/image-hotspots/counters.json) y localiza el cuerpo de la ficha de muestra (la ficha blanca y gris dentro del
   recuadro de leyenda), para expresar cada zona en proporción de la ficha.
2. Proyecta esas proporciones sobre la ficha real (su cuerpo, sin el borde y la sombra).
3. Ajusta cada zona a los caracteres impresos de la ficha real: segmenta el texto claro sobre el fondo de la ficha
   (componentes conectados) y, si hay caracteres cuyo centro cae en la zona proyectada (ampliada), la zona pasa a ser su
   caja; si no hay ninguno, el factor se marca `notPrinted` (esa ficha no lo lleva impreso, p. ej. Pista).

Resultado: data/image-hotspots/real-counters.json (coordenadas normalizadas sobre la imagen de la ficha, sha256,
todo `needs_review`) e imágenes de control en images/review/real-counter-<plantilla>.png (fuera del repositorio).
Nunca produce `verified` (AGENTS.md §9.6). La imagen solo da posiciones: el significado de cada factor sale de
data/counters/ y data/image-hotspots/concepts.json.

Uso (ver requirements.txt):
  uv run --no-project --python 3.12 --with opencv-python-headless==5.0.0.93 --with numpy==2.5.3 \
    python scripts/image-hotspots/calibrate_real_counters.py
"""
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
PROFILE = ROOT / 'scripts/image-hotspots/profiles/real-counters.json'
FACTOR_MAP = ROOT / 'data/counters/factor-map.json'
SAMPLES = ROOT / 'data/image-hotspots/counters.json'
OUT = ROOT / 'data/image-hotspots/real-counters.json'
REVIEW_FILE = ROOT / 'scripts/image-hotspots/profiles/image-review.json'  # descargado desde #/revision
REVIEW_DIR = ROOT / 'images/review'
GROW = 0.6  # la zona proyectada se amplía un 60 % para buscar caracteres


def read_image(path):
    if path.suffix.lower() == '.gif':
        cap = cv2.VideoCapture(str(path))
        ok, img = cap.read()
        cap.release()
        return img if ok else None
    return cv2.imread(str(path))


def largest_box(mask):
    cnts, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    return cv2.boundingRect(max(cnts, key=cv2.contourArea))


def sample_counter_box(sheet, region):
    """Caja (px de la hoja) del cuerpo de la ficha de muestra: blanco o gris neutro, no el fondo turquesa."""
    H, W = sheet.shape[:2]
    x0, y0 = int(region['x'] * W), int(region['y'] * H)
    x1, y1 = int((region['x'] + region['width']) * W), int((region['y'] + region['height']) * H)
    crop = sheet[y0:y1, x0:x1]
    b, g, r = [crop[:, :, i].astype(int) for i in range(3)]
    neutral = (abs(r - g) < 14) & (abs(g - b) < 14) & (r > 150)
    mask = cv2.morphologyEx(neutral.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    box = largest_box(mask)
    if not box:
        return None
    bx, by, bw, bh = box
    return (x0 + bx, y0 + by, bw, bh)


def real_counter_box(img):
    """Cuerpo de la ficha real: lo que no es fondo claro de la imagen (las esquinas)."""
    corner = np.median(np.vstack([img[:4, :4].reshape(-1, 3), img[-4:, -4:].reshape(-1, 3)]), axis=0)
    diff = np.abs(img.astype(int) - corner.astype(int)).sum(axis=2)
    box = largest_box(diff > 60)
    if not box:
        h, w = img.shape[:2]
        return (0, 0, w, h)
    x, y, w, h = box
    m = int(round(min(w, h) * 0.03))  # sin el bisel del borde
    return (x + m, y + m, w - 2 * m, h - 2 * m)


def text_components(img, box):
    """Caracteres impresos: píxeles claros (o muy saturados y luminosos) sobre el fondo de la ficha."""
    x, y, w, h = box
    roi = img[y:y + h, x:x + w]
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    bg = np.median(gray)
    light = gray > max(150, bg + 60)
    dark = gray < max(20, bg - 70)
    mask = (light | dark).astype(np.uint8)
    n, labels, stats, cents = cv2.connectedComponentsWithStats(mask, 8)
    comps = []
    for i in range(1, n):
        cx, cy, cw, ch, area = stats[i]
        if area < 6 or cw > 0.5 * w or ch > 0.5 * h:
            continue
        comps.append((x + cx, y + cy, cw, ch, x + cents[i][0], y + cents[i][1]))
    return comps


def main():
    profile = json.loads(PROFILE.read_text(encoding='utf-8'))
    review = json.loads(REVIEW_FILE.read_text(encoding='utf-8')) if REVIEW_FILE.exists() else None
    fmap = json.loads(FACTOR_MAP.read_text(encoding='utf-8'))
    samples = json.loads(SAMPLES.read_text(encoding='utf-8'))
    sheets = {}
    instances, unmatched = [], []
    for entry in profile['counters']:
        tpl = next(t for t in fmap['counterTemplates'] if t['id'] == entry['templateId'])
        sample = next((i for i in samples['instances'] if i['id'] == tpl['id']), None)
        src = ROOT / 'images' / entry['image']
        if not src.exists() or not sample:
            unmatched.append({'templateId': tpl['id'], 'image': entry['image'], 'reason': 'falta la imagen o la plantilla de muestra'})
            continue
        meta = samples['images'][sample['imageId']]
        sheet = sheets.setdefault(meta['src'], cv2.imread(str(ROOT / meta['src'])))
        SH, SW = sheet.shape[:2]
        sbox = sample_counter_box(sheet, sample['rect'])
        img = read_image(src)
        if img is None or sbox is None:
            unmatched.append({'templateId': tpl['id'], 'image': entry['image'], 'reason': 'no se pudo localizar la ficha'})
            continue
        H, W = img.shape[:2]
        rbox = real_counter_box(img)
        comps = text_components(img, rbox)
        sx, sy, sw, sh = sbox
        rx, ry, rw, rh = rbox
        review_img = cv2.resize(img, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
        hotspots = []
        seeds = entry.get('boxes')
        for hs in sample['hotspots']:
            item = {'id': hs['id'], 'conceptId': hs.get('conceptId', hs['id'])}
            if seeds is not None:
                # Zona colocada a mano (px de la ficha real, revisando la imagen con rejilla): OpenCV la ajusta a los
                # caracteres cuyo centro cae dentro; un factor sin zona declarada no está impreso en esta ficha.
                seed = seeds.get(hs['id'])
                if seed is None:
                    # «unidentified»: la ficha lleva cifras que no se sabe con seguridad a qué factor corresponden; no se
                    # marca ninguna zona en vez de suponerla (AGENTS.md §14).
                    flag = 'unidentified' if hs['id'] in entry.get('unidentified', []) else 'notPrinted'
                    item.update({flag: True, 'method': 'manual', 'confidence': 1, 'reviewStatus': 'needs_review'})
                    hotspots.append(item)
                    continue
                px, py, pw, ph = seed[0], seed[1], seed[2] - seed[0], seed[3] - seed[1]
                fixed = len(seed) > 4 and seed[4] == 'fixed'  # zona revisada a mano que el ajuste no debe tocar
                gx0, gy0, gx1, gy1 = px - 2, py - 2, px + pw + 2, py + ph + 2
            else:
                r = hs['rect']
                # Proporción dentro de la ficha de muestra → píxeles de la ficha real.
                px = rx + ((r['x'] * SW - sx) / sw) * rw
                py = ry + ((r['y'] * SH - sy) / sh) * rh
                pw = (r['width'] * SW / sw) * rw
                ph = (r['height'] * SH / sh) * rh
                gx0, gy0 = px - pw * GROW / 2, py - ph * GROW / 2
                gx1, gy1 = px + pw * (1 + GROW / 2), py + ph * (1 + GROW / 2)
            inside = [c for c in comps if gx0 <= c[4] <= gx1 and gy0 <= c[5] <= gy1]
            if seeds is not None and fixed:
                inside = []
            elif seeds is not None:
                # Con zona manual, el ajuste nunca se sale de ella.
                inside = [c for c in inside if c[0] >= gx0 and c[1] >= gy0 and c[0] + c[2] <= gx1 and c[1] + c[3] <= gy1]
                # Si el ajuste solo encuentra una parte pequeña (un hueco dentro de una cifra o un subrayado), se conserva
                # la zona manual: el ajuste solo sirve para ceñirla, no para cambiar de elemento.
                if inside:
                    ux0 = min(c[0] for c in inside); uy0 = min(c[1] for c in inside)
                    ux1 = max(c[0] + c[2] for c in inside); uy1 = max(c[1] + c[3] for c in inside)
                    if (ux1 - ux0) * (uy1 - uy0) < 0.3 * pw * ph:
                        inside = []
            if inside:
                x0 = min(c[0] for c in inside) - 1
                y0 = min(c[1] for c in inside) - 1
                x1 = max(c[0] + c[2] for c in inside) + 1
                y1 = max(c[1] + c[3] for c in inside) + 1
                item['rect'] = {'x': round(x0 / W, 4), 'y': round(y0 / H, 4), 'width': round((x1 - x0) / W, 4), 'height': round((y1 - y0) / H, 4)}
                item['method'] = 'manual+opencv-snap' if seeds is not None else 'sample-projection+opencv-snap'
                item['confidence'] = 0.8 if len(inside) <= 4 else 0.6
                color = (0, 0, 255)
            elif seeds is not None:
                item['rect'] = {'x': round(px / W, 4), 'y': round(py / H, 4), 'width': round(pw / W, 4), 'height': round(ph / H, 4)}
                item['method'] = 'manual'
                item['confidence'] = 0.7
                color = (0, 200, 255)
            else:
                item['rect'] = {'x': round(px / W, 4), 'y': round(py / H, 4), 'width': round(pw / W, 4), 'height': round(ph / H, 4)}
                item['method'] = 'sample-projection'
                item['notPrinted'] = True
                item['confidence'] = 0.3
                color = (0, 200, 255)
            item['reviewStatus'] = 'needs_review'
            hotspots.append(item)
            rr = item['rect']
            a = (int(rr['x'] * W * 3), int(rr['y'] * H * 3))
            b = (int((rr['x'] + rr['width']) * W * 3), int((rr['y'] + rr['height']) * H * 3))
            cv2.rectangle(review_img, a, b, color, 2)
            cv2.putText(review_img, hs['id'], (a[0], max(10, a[1] - 3)), cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1)
        REVIEW_DIR.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(REVIEW_DIR / f"real-counter-{tpl['id']}.png"), review_img)
        # Revisión del mantenedor: «ok» → verified; «wrong» → sigue needs_review con su nota.
        marks = ((review or {}).get('counters') or {}).get(tpl['id'], {})
        for h in hotspots:
            m = marks.get(h['id'])
            if m and m['status'] == 'ok':
                h.update({'reviewStatus': 'verified', 'reviewedBy': review['review']['by'], 'reviewedAt': review['review']['at']})
            elif m and m['status'] == 'wrong':
                h['reviewNote'] = m.get('note', 'Marcada como incorrecta en la revisión.')
        instances.append({
            'templateId': tpl['id'],
            'image': f"images/{entry['image']}",
            'unit': entry['unit'],
            'side': entry.get('side', 'completa'),
            'imageSize': [W, H],
            'sha256': hashlib.sha256(src.read_bytes()).hexdigest(),
            'hotspots': hotspots
        })
        printed = sum(1 for h in hotspots if not h.get('notPrinted') and not h.get('unidentified'))
        print(f"{tpl['id']} <- {entry['image']}: {printed}/{len(hotspots)} factores ajustados")
    out = {
        'id': 'real-counters-hotspots',
        'description': 'Fichas reales (images/, fuera del repositorio) con la zona de cada factor, calibradas con scripts/image-hotspots/calibrate_real_counters.py a partir de las zonas ya revisadas de la ficha de muestra. `notPrinted`: la ficha real no lleva ese factor impreso. Todo needs_review hasta la revisión del mantenedor; si la imagen no está en el servidor, la ayuda usa la ficha de muestra.',
        'sourceRefs': [{'document': 'Resumen counters - Español.pdf', 'description': 'Posición de cada factor en la ficha de muestra.'}],
        'instances': instances,
        'unmatched': unmatched
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
