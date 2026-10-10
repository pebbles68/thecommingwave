"""Subzonas de los recortes de planes de ataque (ajuste_imagenes.md, IMG-006).

Para cada unidad de data/ammunition/source-pages/unit-regions.json localiza dentro de su recorte
las cabeceras de bloque (cian = antisuperficie, gris = ataque terrestre, etc.) y, con ellas, la
rejilla de planes A-E. Por cada plan que existe en los datos de data/ammunition/ genera las zonas:
cabecera (letra), iconos/munición, valor de unidad completa, valor de unidad dañada y rótulo.

La imagen solo aporta POSICIÓN; qué es cada plan (munición, iconos, valores) sale de los datos
transcritos y validados de data/ammunition/, que son la fuente del cálculo. Una unidad solo se
califica si la rejilla detectada cuadra con la estructura de sus datos (mismo número de bloques,
columnas de ancho coherente); en otro caso queda sin subzonas ("unmatched") y con el motivo,
en vez de aproximarlas.

Ejecución (ver requirements.txt):
  uv run --no-project --python 3.12 --with opencv-python-headless==5.0.0.93 --with numpy==2.5.3 \
      python scripts/image-hotspots/calibrate_ammo_plans.py
"""
import hashlib
import json
import os

import cv2
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
AMMO = os.path.join(ROOT, 'data', 'ammunition')
REGIONS = os.path.join(AMMO, 'source-pages', 'unit-regions.json')
OUT_JSON = os.path.join(ROOT, 'data', 'image-hotspots', 'ammo-plans.json')
QA_DIR = os.path.join(ROOT, 'docs', 'image-hotspots', 'review', 'ammo-plans')
REVIEW = os.path.join(ROOT, 'scripts', 'image-hotspots', 'profiles', 'ammo-review.json')
PLAN_FILES = ['attack-plans', 'naval-plans', 'special-unit-plans']
COUNTRIES = ['ch', 'jp', 'kp', 'kr', 'ru', 'us']
COLUMNS = 5            # columnas físicas A-E por bloque
CELL_W = 64.0            # ancho típico de una columna de plan en px (hojas a la misma resolución)
CELL_TOL = 0.2
# Alturas (px, relativas al borde inferior de la cabecera) de las filas de una celda de plan.
ROW_ICONS = (3, 35)
ROW_FULL = (35, 66)
ROW_DAMAGED = (66, 97)
ROW_LABEL = (99, 114)


def sha256(path):
    with open(path, 'rb') as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def _blocks_of(mask, kind):
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (31, 5)))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9)))
    n, _, stats, _ = cv2.connectedComponentsWithStats(mask)
    out = []
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        if bw >= CELL_W * 0.85 and 14 <= bh <= 45 and area > 0.6 * bw * bh:
            out.append((x, y, bw, bh, kind))
    return out


def header_blocks(crop):
    """Devuelve (y_top, y_bottom, [(x0, x1), ...]) de las cabeceras de bloque o None."""
    h, w = crop.shape[:2]
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    top = hsv[: int(h * 0.45)]
    cyan = ((top[:, :, 0] > 78) & (top[:, :, 0] < 106) & (top[:, :, 1] > 35) & (top[:, :, 2] > 120)).astype(np.uint8) * 255
    gray = ((top[:, :, 1] < 60) & (top[:, :, 2] > 95) & (top[:, :, 2] < 212)).astype(np.uint8) * 255
    blocks = _blocks_of(cyan, 'antiShip') + _blocks_of(gray, 'landAttack')
    # Una cabecera de planes tiene debajo celdas claras de valores; si debajo hay una tarjeta oscura
    # de identidad (icono de clase / ≤4 en hojas navales) no es una cabecera de planes.
    value = hsv[:, :, 2]
    blocks = [b for b in blocks if float(value[b[1] + b[3] + 6: b[1] + b[3] + 30, b[0]: b[0] + b[2]].mean()) > 150]
    if not blocks:
        return None
    blocks.sort(key=lambda b: b[1])
    y0 = blocks[0][1]
    row = [b for b in blocks if abs(b[1] - y0) <= 6]
    row.sort(key=lambda b: b[0])
    return (min(b[1] for b in row), max(b[1] + b[3] for b in row), [(b[0], b[0] + b[2], b[4]) for b in row])


def cells_look_right(crop, ytop, ybot, cells, unit):
    """Comprobación independiente de la rejilla: bajo cada letra de plan debe haber la cabecera de
    color (cian/gris) y, debajo, la celda clara de iconos; si no, la fila no se califica."""
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    H, W = crop.shape[:2]
    for (bkey, bx0, cw, _n) in cells:
        for letter in unit['plans'][bkey].keys():
            col = 'ABCDE'.find(letter)
            x0 = int(bx0 + col * cw) + 4
            x1 = int(bx0 + (col + 1) * cw) - 4
            if x0 < 0 or x1 > W or ybot + ROW_LABEL[1] > H + 6:
                return False
            head = hsv[ytop + 3: ybot - 3, x0:x1]
            hue = head[:, :, 0]
            colored = (((hue > 78) & (hue < 106) & (head[:, :, 1] > 35)) | ((head[:, :, 1] < 45) & (head[:, :, 2] > 100) & (head[:, :, 2] < 205)))
            if colored.mean() < 0.4:
                return False
            body = hsv[ybot + 6: ybot + 30, x0:x1, 2]
            if body.size == 0 or body.mean() < 140:
                return False
    return True


def expected_blocks(unit):
    plans = unit.get('plans') or {}
    return [(k, sorted(v.keys())) for k, v in plans.items() if isinstance(v, dict) and v]


def main():
    regions = json.load(open(REGIONS, encoding='utf8'))['units']
    units = {}
    for cc in COUNTRIES:
        for f in PLAN_FILES:
            p = os.path.join(AMMO, f, f'{cc}.json')
            if os.path.exists(p):
                data = json.load(open(p, encoding='utf8'))
                for key in ('units', 'surfaceShips', 'submarines'):
                    for u in data.get(key, []):
                        units[u['id']] = {'unit': u, 'file': f'{f}/{cc}.json'}

    review = json.load(open(REVIEW, encoding='utf8')) if os.path.exists(REVIEW) else None

    def review_fields(uid):
        if review and (review.get('rows') == '*' or uid in review.get('rows', [])):
            r = review['review']
            return {'reviewStatus': 'verified', 'reviewedBy': r['by'], 'reviewedAt': r['at'], 'reviewNote': r.get('note', '')}
        return {'reviewStatus': 'generated'}

    sheets = {}
    os.makedirs(QA_DIR, exist_ok=True)
    out = {
        'schemaVersion': 1, 'kind': 'ammo-plan-rows',
        'calibration': {'tool': 'opencv', 'toolVersion': cv2.__version__, 'profile': 'ammo-plan-grid-v1',
                        'script': 'scripts/image-hotspots/calibrate_ammo_plans.py',
                        'note': 'Solo posiciones. La semántica (munición, iconos, valores) sale de data/ammunition/. Nada es verified hasta su revisión humana.'},
        'images': {}, 'instances': [], 'unmatched': []
    }
    qa_sheets = {}
    rows = []          # filas con su geometría (primer pase) o sin ella
    for uid, r in regions.items():
        name = r['sourceImage']
        if name not in sheets:
            path = os.path.join(AMMO, 'source-pages', name)
            sheets[name] = cv2.imread(path)
            qa_sheets[name] = sheets[name].copy()
            out['images'][name] = {'src': f'data/ammunition/source-pages/{name}', 'width': sheets[name].shape[1], 'height': sheets[name].shape[0], 'sha256': sha256(path)}
        im = sheets[name]
        H, W = im.shape[:2]
        x0, y0 = int(round(r['xPct'] / 100 * W)), int(round(r['yPct'] / 100 * H))
        w, h = int(round(r['wPct'] / 100 * W)), int(round(r['hPct'] / 100 * H))
        crop = im[y0:y0 + h, x0:x0 + w]
        info = units.get(uid)
        if not info:
            out['unmatched'].append({'id': uid, 'reason': 'sin datos en data/ammunition'})
            continue
        want = expected_blocks(info['unit'])
        hb = header_blocks(crop)
        row = {'uid': uid, 'name': name, 'info': info, 'want': want, 'box': (x0, y0, w, h), 'size': (W, H), 'hb': hb, 'geom': None, 'method': None}
        if hb is not None:
            ytop, ybot, blocks = hb
            cells = []
            by_kind = {}
            for (bx0, bx1, kind) in blocks:
                by_kind.setdefault(kind, (bx0, bx1))
            # En las hojas de aviones los dos bloques de 5 columnas son contiguos; si solo se detectó el
            # cian, el gris es el bloque de igual ancho que le sigue (se valida después con la imagen).
            if 'antiShip' in by_kind and 'landAttack' not in by_kind:
                ax0, ax1 = by_kind['antiShip']
                if int(round((ax1 - ax0) / CELL_W)) == COLUMNS:
                    by_kind['landAttack'] = (ax1 + 1, ax1 + 1 + (ax1 - ax0))
            if 'landAttack' in by_kind and 'antiShip' not in by_kind:
                lx0, lx1 = by_kind['landAttack']
                if int(round((lx1 - lx0) / CELL_W)) == COLUMNS:
                    by_kind['antiShip'] = (lx0 - 1 - (lx1 - lx0), lx0 - 1)
            # Cada bloque de datos (antiShip/landAttack) se empareja con la cabecera de su color.
            if want and all(bkey in by_kind for bkey, _ in want):
                for bkey, letters in want:
                    bx0, bx1 = by_kind[bkey]
                    ncols = max(1, int(round((bx1 - bx0) / CELL_W)))
                    cw = (bx1 - bx0) / float(ncols)
                    need = max('ABCDE'.find(l) for l in letters) + 1
                    if abs(cw - CELL_W) > CELL_W * CELL_TOL or ncols < need:
                        cells = []
                        break
                    # Solo se acepta la disposición sin prefijo: bloque de 5 columnas (A-E) o con exactamente
                    # las columnas de sus letras. La cabecera de los buques de superficie lleva delante el
                    # icono de clase y el ≤4 y su correspondencia con los bloques de datos aún no está
                    # resuelta: esas filas se dejan sin subzonas en vez de aproximarlas.
                    if ncols != COLUMNS and ncols != need:
                        cells = []
                        break
                    cells.append((bkey, bx0, cw, ncols))
            if cells and cells_look_right(crop, ytop, ybot, cells, info['unit']):
                row['geom'] = (ytop, ybot, cells)
                row['method'] = 'opencv-grid+data'
        rows.append(row)

    for row in rows:
        uid, name, info, want = row['uid'], row['name'], row['info'], row['want']
        x0, y0, w, h = row['box']
        W, H = row['size']
        if not row['geom']:
            if row['hb'] is None:
                out['unmatched'].append({'id': uid, 'reason': 'no se detectó cabecera de planes'})
            else:
                out['unmatched'].append({'id': uid, 'reason': f"rejilla detectada ({len(row['hb'][2])} bloques) no cuadra con los datos ({len(want)} bloques)"})
            continue
        ytop, ybot, cells = row['geom']
        hotspots = []
        qa = qa_sheets[name]
        for (bkey, bx0, cw, _ncols) in cells:
            for letter in sorted(info['unit']['plans'][bkey].keys()):
                col = 'ABCDE'.find(letter)
                if col < 0:
                    continue
                cx = bx0 + col * cw
                zones = [
                    ('header', (ytop, ybot)),
                    ('icons', (ybot + ROW_ICONS[0], ybot + ROW_ICONS[1])),
                    ('full', (ybot + ROW_FULL[0], ybot + ROW_FULL[1])),
                    ('damaged', (ybot + ROW_DAMAGED[0], ybot + ROW_DAMAGED[1])),
                    ('label', (ybot + ROW_LABEL[0], ybot + ROW_LABEL[1]))
                ]
                for kind, (ya, yb) in zones:
                    gx, gy, gw, gh = x0 + cx + 1, y0 + ya, cw - 2, yb - ya
                    hotspots.append({
                        'id': f'{bkey}-{letter}-{kind}', 'block': bkey, 'plan': letter, 'kind': kind,
                        'rect': {'x': round(gx / W, 5), 'y': round(gy / H, 5), 'width': round(gw / W, 5), 'height': round(gh / H, 5)},
                        'confidence': 0.9 if row['method'] == 'opencv-grid+data' else 0.7, **review_fields(uid), 'method': row['method']
                    })
                    cv2.rectangle(qa, (int(gx), int(gy)), (int(gx + gw), int(gy + gh)), (0, 150, 0) if kind != 'header' else (0, 0, 220), 1)
        out['instances'].append({
            'id': uid, 'type': 'attack-plan-row', 'imageId': name, 'dataFile': info['file'],
            'rect': {'x': round(x0 / W, 5), 'y': round(y0 / H, 5), 'width': round(w / W, 5), 'height': round(h / H, 5)},
            **review_fields(uid), 'hotspots': hotspots
        })

    for name, qa in qa_sheets.items():
        cv2.imwrite(os.path.join(QA_DIR, name), qa)
    with open(OUT_JSON, 'w', encoding='utf8') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    print(f"{len(out['instances'])} filas calibradas de {len(regions)}; sin calibrar: {len(out['unmatched'])}")
    by = {}
    for u in out['unmatched']:
        by[u['reason']] = by.get(u['reason'], 0) + 1
    for k, v in sorted(by.items(), key=lambda kv: -kv[1]):
        print(v, k)


if __name__ == '__main__':
    main()
