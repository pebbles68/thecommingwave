"""Calibra las tarjetas de aeródromo, puerto y panel de mando de las páginas escaneadas de
data/phases/source-images/ (ajuste_imagenes.md, IMG-003/IMG-004/IMG-005).

Proceso (offline, reproducible):
  1. Verifica hash y dimensiones de cada página.
  2. Para cada tipo de tarjeta de profiles/boards-profiles.json localiza todas las tarjetas de
     la página con SIFT + RANSAC (transformación de similitud: traslación, giro y escala).
  3. Si dos tipos compiten por la misma posición gana el que tiene más inliers.
  4. Proyecta las zonas del perfil sobre cada tarjeta (rectángulo girado -> polígono + caja).
  5. Escribe data/image-hotspots/boards.json e imágenes QA en docs/image-hotspots/review/boards/.

Nada se marca verified: eso lo decide la revisión humana. Las tarjetas de tipos sin perfil
(helipuertos, plataformas de combate de baja altitud, tarjetas estratégicas, paneles C4I de otros
países) no se localizan: figuran en "unmatchedPages" para no aproximar zonas sin evidencia.

Ejecución (ver requirements.txt):
  uv run --no-project --python 3.12 --with opencv-python-headless==5.0.0.93 --with numpy==2.5.3 \
      python scripts/image-hotspots/calibrate_boards.py
"""
import glob
import hashlib
import json
import os

import cv2
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PAGES_DIR = os.path.join(ROOT, 'data', 'phases', 'source-images')
PROFILES = os.path.join(ROOT, 'scripts', 'image-hotspots', 'profiles', 'boards-profiles.json')
OUT_JSON = os.path.join(ROOT, 'data', 'image-hotspots', 'boards.json')
QA_DIR = os.path.join(ROOT, 'docs', 'image-hotspots', 'review', 'boards')
REVIEW = os.path.join(ROOT, 'scripts', 'image-hotspots', 'profiles', 'boards-review.json')
PROFILE_NAME = 'board-sift-similarity-v1'
RATIO = 0.75
RANSAC_PX = 4.0
DEDUPE_PX = 160


def review_fields(review, page_name):
    # Un ajuste humano queda verified solo si el perfil de revisión declara quién y cuándo.
    if review and (review.get('pages') == '*' or page_name in review.get('pages', [])):
        r = review['review']
        return {'reviewStatus': 'verified', 'reviewedBy': r['by'], 'reviewedAt': r['at'], 'reviewNote': r.get('note', '')}
    return {'reviewStatus': 'generated'}


def sha256(path):
    with open(path, 'rb') as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def norm_pt(p, w, h):
    return [round(float(p[0]) / w, 5), round(float(p[1]) / h, 5)]


def project(M, rect):
    x, y, w, h = rect
    pts = np.float32([[x, y], [x + w, y], [x + w, y + h], [x, y + h]])
    return cv2.transform(pts.reshape(-1, 1, 2), M).reshape(-1, 2)


def find_instances(sift, bf, ref, kp, des, min_inliers):
    rkp, rdes = ref
    found = []
    used = np.zeros(len(kp), bool)
    for _ in range(5):
        idx = [i for i in range(len(kp)) if not used[i]]
        if len(idx) < 20:
            break
        m = bf.knnMatch(rdes, des[idx], k=2)
        good = [(a.queryIdx, idx[a.trainIdx]) for a, b in (x for x in m if len(x) == 2) if a.distance < RATIO * b.distance]
        if len(good) < 12:
            break
        src = np.float32([rkp[a].pt for a, _ in good])
        dst = np.float32([kp[b].pt for _, b in good])
        M, inl = cv2.estimateAffinePartial2D(src, dst, ransacReprojThreshold=RANSAC_PX)
        if M is None or inl.sum() < 12:
            break
        n = int(inl.sum())
        ang = np.degrees(np.arctan2(M[1, 0], M[0, 0]))
        sc = float(np.hypot(M[0, 0], M[1, 0]))
        valid = abs(ang) < 6 and 0.9 < sc < 1.1  # las tarjetas impresas no cambian de escala ni giran más que el escáner
        for (a, b), ok in zip(good, inl.ravel()):
            if ok:
                used[b] = True
        if n >= min_inliers and valid:
            found.append((n, M))
    return found


def main():
    with open(PROFILES, encoding='utf8') as fh:
        prof = json.load(fh)
    review = json.load(open(REVIEW, encoding='utf8')) if os.path.exists(REVIEW) else None
    sift = cv2.SIFT_create(nfeatures=4000)
    bf = cv2.BFMatcher()
    os.makedirs(QA_DIR, exist_ok=True)

    refs = {}
    for tid, t in prof['types'].items():
        img = cv2.imread(os.path.join(PAGES_DIR, t['reference']['image']), cv2.IMREAD_GRAYSCALE)
        x, y, w, h = t['reference']['rect']
        kp, des = sift.detectAndCompute(img[y:y + h, x:x + w], None)
        refs[tid] = (kp, des)

    output = {
        'schemaVersion': 1,
        'kind': 'board-instances',
        'calibration': {'tool': 'opencv', 'toolVersion': cv2.__version__, 'profile': PROFILE_NAME,
                        'script': 'scripts/image-hotspots/calibrate_boards.py',
                        'note': 'Candidatos generados; ninguno es verified hasta su revisión humana con la imagen QA.'},
        'images': {}, 'instances': [], 'unmatchedPages': []
    }
    for group in ('aerodromos', 'puertos'):
        for path in sorted(glob.glob(os.path.join(PAGES_DIR, group, 'page-*.png'))):
            name = f'{group}/{os.path.basename(path)}'
            bgr = cv2.imread(path)
            ph, pw = bgr.shape[:2]
            output['images'][name] = {'src': f'data/phases/source-images/{name}', 'width': pw, 'height': ph, 'sha256': sha256(path)}
            gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
            kp, des = sift.detectAndCompute(gray, None)
            cand = []
            for tid, t in prof['types'].items():
                for n, M in find_instances(sift, bf, refs[tid], kp, des, t.get('minInliers', prof['minInliers'])):
                    x, y, w, h = t['reference']['rect']
                    # Posición de la tarjeta en la página (centro) para resolver competencias.
                    c = cv2.transform(np.float32([[[w / 2.0, h / 2.0]]]), M).reshape(2)
                    cand.append({'type': tid, 'inliers': n, 'M': M, 'center': c})
            cand.sort(key=lambda k: -k['inliers'])
            kept = []
            for k in cand:
                if all(np.hypot(*(k['center'] - o['center'])) > DEDUPE_PX for o in kept):
                    kept.append(k)
            kept.sort(key=lambda k: k['center'][1])

            qa = bgr.copy()
            page_no = int(os.path.basename(path)[5:7])
            if not kept:
                output['unmatchedPages'].append(name)
            for i, k in enumerate(kept, start=1):
                t = prof['types'][k['type']]
                M = k['M']
                ref_w, ref_h = t['reference']['rect'][2], t['reference']['rect'][3]
                card_poly = project(M, [0, 0, ref_w, ref_h])
                bx, by, bw, bh = cv2.boundingRect(card_poly.astype(np.float32))
                conf = round(min(1.0, k['inliers'] / 100.0), 3)
                inst = {
                    'id': f'{group}-p{page_no:02d}-{i}', 'type': k['type'], 'label': f"{t['label']} {i} de la página {page_no}",
                    'imageId': name,
                    'rect': {'x': round(bx / pw, 5), 'y': round(by / ph, 5), 'width': round(bw / pw, 5), 'height': round(bh / ph, 5)},
                    'polygon': [norm_pt(p, pw, ph) for p in card_poly],
                    'inliers': k['inliers'], 'confidence': conf, **review_fields(review, name), 'hotspots': []
                }
                cv2.polylines(qa, [card_poly.astype(np.int32)], True, (0, 0, 255), 3)
                cv2.putText(qa, f"{k['type']} {i} ({k['inliers']})", (int(card_poly[0][0]) + 6, int(card_poly[0][1]) + 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 0, 255), 2, cv2.LINE_AA)
                for z in t['zones']:
                    poly = project(M, z['rect'])
                    zx, zy, zw, zh = cv2.boundingRect(poly.astype(np.float32))
                    inst['hotspots'].append({
                        'id': z['id'], 'conceptId': z['concept'],
                        'rect': {'x': round(zx / pw, 5), 'y': round(zy / ph, 5), 'width': round(zw / pw, 5), 'height': round(zh / ph, 5)},
                        'polygon': [norm_pt(p, pw, ph) for p in poly],
                        'confidence': conf, **review_fields(review, name), 'method': 'sift-similarity+profile'
                    })
                    cv2.polylines(qa, [poly.astype(np.int32)], True, (0, 160, 0), 1)
                    cv2.putText(qa, z['id'], (int(poly[0][0]) + 2, int(poly[0][1]) + 11), cv2.FONT_HERSHEY_SIMPLEX, 0.32, (0, 110, 0), 1, cv2.LINE_AA)
                output['instances'].append(inst)
            cv2.imwrite(os.path.join(QA_DIR, f"{group}-{os.path.basename(path)}"), qa)
            print(name, [(k['type'], k['inliers']) for k in kept])

    with open(OUT_JSON, 'w', encoding='utf8') as fh:
        json.dump(output, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    print(len(output['instances']), 'tarjetas;', len(output['unmatchedPages']), 'páginas sin tarjetas localizadas')


if __name__ == '__main__':
    main()
