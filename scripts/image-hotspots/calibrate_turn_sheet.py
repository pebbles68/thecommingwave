"""Calibra con OpenCV las zonas de la hoja de turnos (Fase 24, TC-002).

Segmenta por color las columnas de la hoja (Aire rosa, Superficie cian, Tierra verde,
Submarino gris, etiquetas de Refuerzos doradas, pasos de Estrategia) y las asigna por
posicion a los IDs del modelo canonico. Las columnas que no se distinguen por color del
fondo del panel se colocan por la rejilla y se marcan `inferred-from-grid`. Resultado:
data/image-hotspots/turn-sheet.json (rectangulos normalizados, todos `needs_review`) e
imagen de control en docs/image-hotspots/review/. Nunca produce `verified` (AGENTS.md §9.6).

Uso (ver requirements.txt):
  uv run --no-project --python 3.12 --with opencv-python-headless==5.0.0.93 --with numpy==2.5.3 \
    python scripts/image-hotspots/calibrate_turn_sheet.py
"""
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'data/phases/source-images/hoja-de-turnos.jpg'
OUT = ROOT / 'data/image-hotspots/turn-sheet.json'
REVIEW = ROOT / 'docs/image-hotspots/review/turn-sheet-calibration.png'

img = cv2.imread(str(SRC))
H, W = img.shape[:2]
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def boxes(mask, min_w, min_h, max_w=None, max_h=None):
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    res = []
    for c in cnts:
        x, y, w, h = cv2.boundingRect(c)
        if w < min_w or h < min_h:
            continue
        if max_w and w > max_w:
            continue
        if max_h and h > max_h:
            continue
        res.append((x, y, w, h))
    return res


def rng(lo, hi):
    return cv2.inRange(hsv, np.array(lo), np.array(hi))


# Columnas por color (solo en la mitad inferior de la hoja, y > 640).
aire = rng((0, 25, 200), (14, 90, 255)) | rng((170, 25, 200), (180, 90, 255))
sup = rng((85, 25, 200), (100, 90, 255))
tierra = rng((35, 30, 190), (50, 110, 255))
sub = rng((0, 0, 190), (180, 22, 235))
cols = {}
for name, m in (('aire', aire), ('superficie', sup), ('tierra', tierra), ('submarino', sub)):
    cols[name] = [b for b in boxes(m, 90, 300, 220, 700) if b[1] > 640]

# Refuerzos: etiqueta dorada.
ref = [b for b in boxes(rng((15, 80, 150), (30, 255, 255)), 80, 25, 200, 70) if b[1] > 640]


def strip(m, parts):
    """Tira contigua de casillas de Estrategia: se detecta el bloque y se reparte en partes iguales."""
    bs = [b for b in boxes(m, 100, 120, None, 260) if 0.255 * H < b[1] < 0.36 * H and b[0] < 0.5 * W]
    if not bs:
        return []
    x0 = min(b[0] for b in bs)
    x1 = max(b[0] + b[2] for b in bs)
    y0 = min(b[1] for b in bs)
    y1 = max(b[1] + b[3] for b in bs)
    step = (x1 - x0) / parts
    return [(round(x0 + k * step), y0, round(step), y1 - y0) for k in range(parts)]


strat = strip(rng((0, 0, 100), (180, 25, 175)), 3)
n_strat_detected = len(strat)
# Logistica y Mantenimiento son casillas blancas sobre fondo casi blanco: no se segmentan por color
# y continuan la tira gris con el mismo paso.
if strat:
    sx0, sy, sw, sh = strat[0]
    strat += [(sx0 + k * sw, sy, sw, sh) for k in (3, 4)]

# Barras oscuras REC. MANDO. (una por dia): bandas de baja luminosidad a ancho casi completo.
dark_rows = np.where((gray[:, 250:1900] < 90).mean(axis=1) > 0.6)[0]
bands = []
for y in dark_rows:
    if bands and y - bands[-1][1] <= 3:
        bands[-1][1] = y
    else:
        bands.append([y, y])
bands = [b for b in bands if b[1] - b[0] > 15 and b[0] > 560]

zones = []
notes = []


def add(zid, kind, ref_, label, box, source):
    x, y, w, h = box
    zones.append({
        'id': zid, 'kind': kind, 'ref': ref_, 'label': label,
        'rect': [round(x / W, 5), round(y / H, 5), round(w / W, 5), round(h / H, 5)],
        'source': source, 'confidence': 0.9 if source == 'detected' else 0.6,
        'reviewStatus': 'needs_review',
    })


STEPS = [('crisis', 'Crisis'), ('espacio', 'Espacio'), ('diplomacia', 'Diplomacia'), ('logistica', 'Logística'), ('reparacion', 'Mantenimiento')]
for i, ((sid, label), b) in enumerate(zip(STEPS, sorted(strat))):
    add(f'strategy:{sid}', 'strategy-step', {'phase': 0, 'step': sid}, label, b, 'detected' if i < n_strat_detected else 'inferred-from-grid')
if len(strat) != 5:
    notes.append(f'Estrategia: se esperaban 5 casillas y se obtuvieron {len(strat)}.')

DAYS = ['day-odd', 'day-even']
SEG = [('air-1', 'Aire I'), ('surface', 'Superficie'), ('air-2', 'Aire II'), ('ground', 'Tierra'), ('submarine', 'Submarino')]
HAS_GROUND = {0: True, 1: False, 2: True}  # por panel dentro del dia: 1.ª/4.ª, 2.ª/5.ª, 3.ª/6.ª
aire_all = sorted(cols['aire'], key=lambda b: b[0])
col_w = int(np.median([b[2] for b in cols['aire']]))
row_y = []
for r in range(2):
    ys = [b for b in cols['aire'] if (b[1] < 1000) == (r == 0)]
    row_y.append((int(np.median([b[1] for b in ys])), int(np.median([b[3] for b in ys]))))
panel_x = []
for k, guess in enumerate([190, 945, 1553]):
    panel_x.append(int(np.median([b[0] for b in aire_all if abs(b[0] - guess) < 80])))


def find(colname, r, near, tol=60):
    cand = [b for b in cols[colname] if (b[1] < 1000) == (r == 0) and abs(b[0] - near) < tol and b[3] < 420]
    return cand[0] if cand else None


for r in range(2):
    y, h = row_y[r]
    for k in range(3):
        phase = r * 3 + k + 1
        ax = panel_x[k]
        a1 = find('aire', r, ax)
        a2 = next((b for b in aire_all if (b[1] < 1000) == (r == 0) and 260 < b[0] - ax < 320), None)
        a2x = a2[0] if a2 else ax + 288
        s = find('superficie', r, ax + 150)
        sx = s[0] if s else round(ax + 0.52 * (a2x - ax))
        if HAS_GROUND[k]:
            t = find('tierra', r, a2x + 145)
            tx = t[0] if t else a2x + 148
            sb = find('submarino', r, tx + 146)
            bx = sb[0] if sb else tx + 146
        else:
            t, tx = None, None
            sb = find('submarino', r, a2x + 138)
            bx = sb[0] if sb else a2x + 138
        placed = {'air-1': (ax, a1), 'surface': (sx, s), 'air-2': (a2x, a2), 'ground': (tx, t), 'submarine': (bx, sb)}
        for sid, label in SEG:
            if sid == 'ground' and not HAS_GROUND[k]:
                continue
            xx, det = placed[sid]
            add(f'phase-{phase}:{sid}', 'segment', {'phase': phase, 'segment': sid}, label, (xx, y, col_w, h), 'detected' if det else 'inferred-from-grid')
        ry = 1184 if r == 1 else 672
        rb = next((b for b in ref if abs(b[0] - ax) < 40 and abs(b[1] - ry) < 25), None)
        add(f'phase-{phase}:reinforcements', 'segment', {'phase': phase, 'segment': 'reinforcements'}, 'Refuerzos', rb if rb else (ax, ry, 140, 40), 'detected' if rb else 'inferred-from-grid')

for r, day in enumerate(DAYS):
    if r < len(bands):
        y0, y1 = bands[r]
        add(f'command-recovery:{day}', 'command-recovery', {'day': day}, 'Recuperación de Mando', (panel_x[0] + 4, y0 + 2, 165, y1 - y0 - 4), 'detected')
    else:
        notes.append(f'REC. MANDO. del día {r + 1}: no detectada.')

n_det = sum(1 for z in zones if z['source'] == 'detected')
print('zonas', len(zones), 'detectadas', n_det, 'inferidas', len(zones) - n_det, notes)

ctl = img.copy()
for z in zones:
    x, y, w, h = z['rect']
    p0, p1 = (int(x * W), int(y * H)), (int((x + w) * W), int((y + h) * H))
    col = (0, 160, 0) if z['source'] == 'detected' else (0, 0, 220)
    cv2.rectangle(ctl, p0, p1, col, 3)
    cv2.putText(ctl, z['id'].split(':')[1][:6], (p0[0] + 4, p0[1] + 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, col, 2)
REVIEW.parent.mkdir(parents=True, exist_ok=True)
cv2.imwrite(str(REVIEW), ctl)

data = {
    'schemaVersion': 1,
    'kind': 'turn-sheet-zones',
    'calibration': {
        'tool': 'opencv', 'toolVersion': cv2.__version__, 'profile': 'turn-sheet-color-grid-v1',
        'script': 'scripts/image-hotspots/calibrate_turn_sheet.py',
        'note': 'Zonas candidatas por color y rejilla; ninguna es verified hasta su revision humana con la imagen de control. source=inferred-from-grid indica que la columna no se detecto por color y se coloco por la rejilla.',
        'issues': notes,
    },
    'image': {'src': 'data/phases/source-images/hoja-de-turnos.jpg', 'width': W, 'height': H,
              'sha256': hashlib.sha256(SRC.read_bytes()).hexdigest()},
    'zones': zones,
}
OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf8')
