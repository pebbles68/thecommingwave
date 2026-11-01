"""Calibra con OpenCV la rejilla de las tablas de las páginas reales de «Tablas-de-combate 5.pdf» (Fase 25, AD-006).

Las páginas se generan antes en local con `node scripts/render-table-pages.js "<pdf>"` (images/tablas/, fuera del
repositorio). Para cada tabla declarada en scripts/image-hotspots/profiles/table-pages.json:

1. busca el marco grueso de la tabla (el rectángulo negro más grande de la zona indicada);
2. localiza los separadores gruesos interiores: el vertical entre la zona de condiciones y los valores, y el horizontal
   entre la cabecera y las filas de la tirada;
3. reparte las columnas de valores y las filas de la tirada a partes iguales y comprueba cada corte con las líneas finas
   detectadas (desviación máxima en píxeles en `fit`); si una línea no aparece cerca, la tabla queda sin calibrar.

Resultado: data/image-hotspots/table-pages.json (coordenadas normalizadas 0-1, sha256 y tamaño de la imagen, todo
`needs_review`) e imagen de control en images/review/table-page-NN-<tabla>.png (fuera del repositorio, como la página). Nunca produce `verified`
(AGENTS.md §9.6). La imagen solo da posiciones: el valor de cada celda sale de data/tables/.

Uso (ver requirements.txt):
  uv run --no-project --python 3.12 --with opencv-python-headless==5.0.0.93 --with numpy==2.5.3 \
    python scripts/image-hotspots/calibrate_table_pages.py
"""
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
PROFILE = ROOT / 'scripts/image-hotspots/profiles/table-pages.json'
OUT = ROOT / 'data/image-hotspots/table-pages.json'
REVIEW_FILE = ROOT / 'scripts/image-hotspots/profiles/image-review.json'  # descargado desde #/revision
REVIEW_DIR = ROOT / 'images/review'  # fuera del repositorio: es la página real con la rejilla dibujada
MAX_DEVIATION = 6  # píxeles a 150 ppp


def runs(flags):
    """Tramos consecutivos True de un vector booleano: [(inicio, fin)]."""
    out, start = [], None
    for i, f in enumerate(flags):
        if f and start is None:
            start = i
        if not f and start is not None:
            out.append((start, i - 1))
            start = None
    if start is not None:
        out.append((start, len(flags) - 1))
    return out


def calibrate(profile):
    src = ROOT / 'images/tablas' / f"page-{profile['page']:02d}.png"
    if not src.exists():
        return None, f'no existe {src.relative_to(ROOT)} (genera antes las páginas con scripts/render-table-pages.js)'
    img = cv2.imread(str(src))
    H, W = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    y0, y1 = int(profile['searchY'][0] * H), int(profile['searchY'][1] * H)
    dark = (gray < 70).astype(np.uint8)
    # Marco: contornos exteriores de la zona de búsqueda.
    sx0, sx1 = (int(profile['searchX'][0] * W), int(profile['searchX'][1] * W)) if 'searchX' in profile else (0, W)
    sub = dark[y0:y1, sx0:sx1].copy()
    cnts, _ = cv2.findContours(sub, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None, 'sin marco de tabla'
    # La tabla puede dibujarse en varios bloques con marco propio (cabecera y cuerpo): se unen los rectángulos anchos
    # que comparten la anchura del mayor.
    rects = [cv2.boundingRect(c) for c in cnts]
    widest = max(r[2] for r in rects)
    parts = [r for r in rects if r[2] >= 0.9 * widest]
    x = min(r[0] for r in parts) + sx0
    y = min(r[1] for r in parts) + y0
    w = max(r[0] + r[2] for r in parts) + sx0 - x
    h = max(r[1] + r[3] for r in parts) + y0 - y
    box = dark[y:y + h, x:x + w]
    # Separadores gruesos: columnas/filas casi enteramente oscuras (≥ 85 % del alto/ancho del marco), sin los bordes.
    vthick = [r for r in runs(box.sum(axis=0) >= 0.85 * h) if 6 < r[0] < w - 6]
    hthick = [r for r in runs(box.sum(axis=1) >= 0.85 * w) if 6 < r[0] < h - 6]
    if not vthick or not hthick:
        return None, 'sin separadores gruesos interiores'
    # `separatorIndex`: qué separador grueso vertical marca el inicio de los valores (por defecto el primero; la página 27
    # tiene dos columnas de etiquetas separadas también por una línea gruesa).
    vx = x + vthick[profile.get('separatorIndex', 0)][1] + 1           # inicio de la zona de valores
    hy = y + hthick[-1][1] + 1          # inicio de las filas de la tirada
    right, bottom = x + w - 3, y + h - 3
    ncols, nrows = profile['columns'], profile['rows']
    col_edges = [vx + (right - vx) * i / ncols for i in range(ncols + 1)]
    row_edges = [hy + (bottom - hy) * i / nrows for i in range(nrows + 1)]
    # Comprobación con las líneas finas dentro de la zona de valores: algo más oscuras que el fondo de la tabla (blanco,
    # rosa o verde), sin el texto negro.
    zone = gray[hy:bottom, vx:right]
    bg = float(np.median(zone))
    area = (np.abs(zone.astype(int) - bg) > 10).astype(np.uint8)  # líneas finas claras u oscuras (también negras)
    vlines = [vx + (a + b) / 2 for a, b in runs(area.sum(axis=0) >= 0.6 * area.shape[0])]
    hlines = [hy + (a + b) / 2 for a, b in runs(area.sum(axis=1) >= 0.6 * area.shape[1])]
    def worst(edges, lines):
        inner = edges[1:-1]
        if not inner:
            return 0
        if not lines:
            return 999
        return max(min(abs(e - l) for l in lines) for e in inner)
    if profile.get('columnEdges') == 'detected':
        # Columnas de anchos distintos (p. ej. página 33): los bordes son las líneas detectadas, finas o gruesas.
        # Con fondos de varios tonos por columna, una línea se ve como un salto de intensidad vertical (Sobel x).
        gx = np.abs(cv2.Sobel(zone.astype(np.float32), cv2.CV_32F, 1, 0, ksize=3))
        edge_x = [vx + (a + b) / 2 for a, b in runs((gx > 25).sum(axis=0) >= 0.6 * zone.shape[0])]
        thick_x = [x + (a + b) / 2 for a, b in vthick if x + a > vx]
        lines = sorted(vlines + thick_x + edge_x)
        lines = [l for l in lines if vx + 4 < l < right - 4]
        merged = []
        for l in lines:
            if not merged or l - merged[-1] > 9:
                merged.append(l)
        # Un trazo de cifra alineado en vertical (p. ej. una columna de «1» y «4») cae a mitad de una celda: se
        # descarta la línea que queda a menos de 0,6 veces la separación típica de sus dos vecinas.
        # `skipLines`: líneas de etiquetas que quedan entre el separador grueso y los valores (página 5: columna del icono).
        skip = profile.get('skipLines', 0)
        if skip:
            vx = merged[skip - 1]
            merged = merged[skip:]
            zone = gray[hy:bottom, int(vx):right]
        if len(merged) > 2:
            gaps = sorted(b - a for a, b in zip([vx] + merged, merged + [right]))
            typical = gaps[len(gaps) // 2]
            pts = [vx] + merged + [right]
            merged = [pts[i] for i in range(1, len(pts) - 1) if not (pts[i] - pts[i - 1] < 0.6 * typical and pts[i + 1] - pts[i] < 0.6 * typical)]
        if len(merged) != ncols - 1:
            return None, f'se esperaban {ncols - 1} líneas de columna y se detectaron {len(merged)}: {[round(m) for m in merged]}'
        col_edges = [vx] + merged + [right]
        vlines = merged
        gy = np.abs(cv2.Sobel(zone.astype(np.float32), cv2.CV_32F, 0, 1, ksize=3))
        hlines = [hy + (a + b) / 2 for a, b in runs((gy > 25).sum(axis=1) >= 0.6 * zone.shape[1])]
    fit = {'columns': round(worst(col_edges, vlines), 1), 'rows': round(worst(row_edges, hlines), 1)}
    if fit['columns'] > MAX_DEVIATION or fit['rows'] > MAX_DEVIATION:
        return None, f'la rejilla no coincide con las líneas de la imagen (desviación {fit})'
    # Cabeceras de columna: una banda por esquema de columnas, entre el separador horizontal superior y el de la tirada.
    head_top = y + (hthick[0][1] + 1 if len(hthick) > 1 else 0)
    # Cada entrada es un esquema o {"schemes": [...], "span": n} cuando varios esquemas comparten una fila de cabecera
    # de n líneas impresas (p. ej. página 16: «Intercepción / DdE*» y «CAPs + AWACS» en la misma fila).
    entries = [e if isinstance(e, dict) else {'schemes': [e], 'span': 1} for e in profile.get('headerSchemes', [])]
    header_bands = {}
    total = sum(e['span'] for e in entries)
    if total:
        unit = (hy - head_top) / total
        pos = head_top
        for e in entries:
            top, bottom_band = pos, pos + unit * e['span']
            for name in e['schemes']:
                header_bands[name] = [round(top / H, 5), round(bottom_band / H, 5)]
            pos = bottom_band
    norm = {
        'page': profile['page'],
        'tableId': profile['tableId'],
        'image': f"images/tablas/page-{profile['page']:02d}.png",
        'imageSize': [W, H],
        'sha256': hashlib.sha256(src.read_bytes()).hexdigest(),
        'frame': [round(x / W, 5), round(y / H, 5), round((x + w) / W, 5), round((y + h) / H, 5)],
        'columnEdges': [round(c / W, 5) for c in col_edges],
        'rowEdges': [round(r / H, 5) for r in row_edges],
        'valuesTop': round(head_top / H, 5),
        'headerBands': header_bands,
        'fit': fit,
        'confidence': 'grid-checked',
        'reviewStatus': 'needs_review'
    }
    review = img.copy()
    for c in col_edges:
        cv2.line(review, (int(c), int(head_top)), (int(c), int(bottom)), (255, 0, 0), 2)
    for r in row_edges:
        cv2.line(review, (int(vx), int(r)), (int(right), int(r)), (0, 0, 255), 2)
    REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(REVIEW_DIR / f"table-page-{profile['page']:02d}-{profile['tableId']}.png"), review)
    return norm, None


def main():
    profiles = json.loads(PROFILE.read_text(encoding='utf-8'))['tables']
    review = json.loads(REVIEW_FILE.read_text(encoding='utf-8')) if REVIEW_FILE.exists() else None
    tables, unmatched = [], []
    for p in profiles:
        result, reason = calibrate(p)
        if result:
            # Revisión del mantenedor: «ok» → verified; «wrong» → sigue needs_review con su nota.
            m = (((review or {}).get('tables') or {}).get(f"page-{p['page']:02d}") or {}).get(p['tableId'])
            if m and m['status'] == 'ok':
                result.update({'reviewStatus': 'verified', 'reviewedBy': review['review']['by'], 'reviewedAt': review['review']['at']})
            elif m and m['status'] == 'wrong':
                result['reviewNote'] = m.get('note', 'Marcada como incorrecta en la revisión.')
            tables.append(result)
            print(f"página {p['page']} {p['tableId']}: ajuste {result['fit']}")
        else:
            unmatched.append({'page': p['page'], 'tableId': p['tableId'], 'reason': reason})
            print(f"página {p['page']} {p['tableId']}: SIN CALIBRAR — {reason}")
    out = {
        'id': 'table-pages-hotspots',
        'description': 'Rejilla de las tablas sobre las páginas reales de Tablas-de-combate 5.pdf (images/tablas/, fuera del repositorio), calibrada con scripts/image-hotspots/calibrate_table_pages.py. Coordenadas normalizadas: columnEdges (bordes de las columnas de valores, en x), rowEdges (bordes de las filas de la tirada, en y), headerBands (banda vertical de la cabecera de cada esquema de columnas). Solo sirve para marcar en la imagen la columna, la fila y la celda que el cálculo ya ha elegido con data/tables/; nunca para leer valores (AGENTS.md §3.4, §9.6).',
        'sourceRefs': [{'document': 'Tablas-de-combate 5.pdf', 'description': 'Páginas renderizadas a 150 ppp con pdftoppm.'}],
        'tables': tables,
        'unmatched': unmatched
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
