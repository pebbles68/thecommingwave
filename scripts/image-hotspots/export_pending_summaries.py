"""Exporta la lista de conceptos de fichas que aún no tienen resumen de uso (status needs_review en
data/image-hotspots/concepts.json) como una página HTML autocontenida con la imagen de la ficha y un
recuadro rojo sobre la zona, para que el mantenedor complete el texto.

Salida: docs/image-hotspots/pending-summaries/index.html (imágenes incrustadas, se abre sin servidor).

Ejecución (ver requirements.txt):
  uv run --no-project --python 3.12 --with opencv-python-headless==5.0.0.93 --with numpy==2.5.3 \
      python scripts/image-hotspots/export_pending_summaries.py
"""
import base64
import html
import json
import os

import cv2

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_DIR = os.path.join(ROOT, 'docs', 'image-hotspots', 'pending-summaries')
MAX_EXAMPLES = 2


def load(rel):
    with open(os.path.join(ROOT, rel), encoding='utf8') as fh:
        return json.load(fh)


def crop_with_box(sheet, inst, hotspot):
    h, w = sheet.shape[:2]
    x0, y0 = int(inst['rect']['x'] * w), int(inst['rect']['y'] * h)
    x1, y1 = x0 + int(inst['rect']['width'] * w), y0 + int(inst['rect']['height'] * h)
    crop = sheet[y0:y1, x0:x1].copy()
    r = hotspot['rect']
    bx0, by0 = int(r['x'] * w) - x0, int(r['y'] * h) - y0
    bx1, by1 = bx0 + int(r['width'] * w), by0 + int(r['height'] * h)
    crop = cv2.resize(crop, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    cv2.rectangle(crop, (bx0 * 3 - 3, by0 * 3 - 3), (bx1 * 3 + 3, by1 * 3 + 3), (0, 0, 255), 3)
    ok, buf = cv2.imencode('.jpg', crop, [cv2.IMWRITE_JPEG_QUALITY, 82])
    return base64.b64encode(buf.tobytes()).decode('ascii')


def main():
    concepts = load('data/image-hotspots/concepts.json')['concepts']
    counters = load('data/image-hotspots/counters.json')
    fm = load('data/counters/factor-map.json')
    titles = {t['id']: t['title'] for t in fm['counterTemplates']}
    sheets = {}
    pending = [c for c in concepts if c['status'] == 'needs_review']
    os.makedirs(OUT_DIR, exist_ok=True)

    parts = ['<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
             '<title>Conceptos de fichas pendientes de resumen</title>',
             '<style>body{font:16px/1.45 system-ui,sans-serif;max-width:1000px;margin:0 auto;padding:16px;background:#fafafa;color:#222}',
             'h1{font-size:1.4rem}h2{font-size:1.15rem;margin:0}section{background:#fff;border:1px solid #ccc;border-radius:10px;padding:14px;margin:18px 0}',
             '.ex{margin:10px 0}.ex img{max-width:100%;border:1px solid #bbb;border-radius:6px}.ex p{margin:4px 0;color:#555;font-size:.9rem}',
             '.ans{margin-top:10px;padding:10px;border:2px dashed #999;border-radius:8px;min-height:3.2em;color:#888}</style></head><body>',
             f'<h1>Conceptos de fichas pendientes de resumen ({len(pending)})</h1>',
             '<p>El Decision Book no define estos conceptos con ese nombre, así que no he redactado su resumen. '
             'En cada imagen, el recuadro rojo marca la zona. Escribe en cada caja qué significa o dónde se explica (documento y página) '
             'y se incorpora a <code>data/image-hotspots/concepts.json</code>.</p>']
    for c in pending:
        parts.append(f'<section><h2>{html.escape(c["label"])} <small>({html.escape(c["id"])})</small></h2>')
        shown = 0
        for inst in counters['instances']:
            hs = next((h for h in inst['hotspots'] if h['id'] == c['id'] and h['rect']), None)
            if not hs:
                continue
            if shown >= MAX_EXAMPLES:
                break
            img_name = inst['imageId']
            if img_name not in sheets:
                sheets[img_name] = cv2.imread(os.path.join(ROOT, counters['images'][img_name]['src']))
            b64 = crop_with_box(sheets[img_name], inst, hs)
            parts.append(f'<div class="ex"><img alt="Ficha {html.escape(inst["label"])}" src="data:image/jpeg;base64,{b64}">'
                         f'<p>Ficha: {html.escape(titles.get(inst["id"], inst["label"]))} · <code>{html.escape(inst["id"])}</code></p></div>')
            shown += 1
        total = sum(1 for inst in counters['instances'] if any(h['id'] == c['id'] for h in inst['hotspots']))
        if total > shown:
            parts.append(f'<p>Aparece en {total} fichas; se muestran {shown}.</p>')
        parts.append('<div class="ans">Resumen de uso y fuente (documento, sección, página):</div></section>')
    parts.append('</body></html>')
    out = os.path.join(OUT_DIR, 'index.html')
    with open(out, 'w', encoding='utf8') as fh:
        fh.write('\n'.join(parts))
    print(len(pending), 'conceptos pendientes ->', out, f'({os.path.getsize(out) // 1024} KB)')


if __name__ == '__main__':
    main()
