#!/usr/bin/env python3
"""Build the "taman barat" variant: data/house.json mirrored west<->east.

    python3 tools/mirror.py            # writes data/house-barat.json

The house strip (y < 8.5) is mirrored about x = 4.5, so the garden, wudhu and musholla move to the
side-street (west) and the studio / stair / genkan strip moves onto the east boundary. The front zone
(carport, corner garden, front fences), the roads and the neighbours stay where they are.
Things that depend on the compass rather than on the plan are fixed by hand below:
the qibla wall, mihrab, prayer mats and skylight keep facing west-north-west; windows that would
land on the east boundary wall are dropped; the side-street service gate goes; the east eave gets no
overhang; the master bedroom's AC outdoor unit moves to the carport wall.
Re-run after every change to house.json so the two variants stay comparable.
"""
import copy, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W = 9.0           # lot width
FRONT = 8.5       # y where the house ends and the carport / corner garden begin


def mx(x):
    return round(W - x, 4)


def mrect(r):
    a, b = mx(r[0]), mx(r[2])
    return [min(a, b), r[1], max(a, b), r[3]]


def trect(r, dx):
    return [round(r[0] + dx, 4), r[1], round(r[2] + dx, 4), r[3]]


def swap_words(s):
    if not isinstance(s, str):
        return s
    return re.sub(r'\b(barat|timur)\b', lambda m: 'timur' if m.group(1) == 'barat' else 'barat', s)


FLIP = {'+x': '-x', '-x': '+x'}


def front(rect_or_pt, level):
    y = min(rect_or_pt[1], rect_or_pt[3]) if len(rect_or_pt) == 4 else rect_or_pt[1]
    return level == 'site' and y >= FRONT - 1e-6


def mirror_wall(w):
    w = copy.deepcopy(w)
    horiz = abs(w['a'][1] - w['b'][1]) < 1e-6
    length = abs(w['b'][0] - w['a'][0]) if horiz else abs(w['b'][1] - w['a'][1])
    w['a'] = [mx(w['a'][0]), w['a'][1]]
    w['b'] = [mx(w['b'][0]), w['b'][1]]
    for o in w.get('open', []):
        if horiz:  # offsets run from the low-x end, which is now the other end
            o['at'] = round(length - o['at'] - o['w'], 4)
            if 'hinge' in o:
                o['hinge'] = 'end' if o['hinge'] == 'start' else 'start'
            if 'leaves' in o:
                o['leaves'] = list(reversed(o['leaves']))
        else:      # wall normal (+x) flips
            if 'side' in o:
                o['side'] = -o['side']
            if o.get('type') in ('sliding', 'swing', 'bifold'):
                o['out'] = -(o.get('out') or 1)
        o['note'] = swap_words(o.get('note'))
    w['note'] = swap_words(w.get('note'))
    if not w['note']:
        w.pop('note')
    return w


def build(src):
    d = copy.deepcopy(src)
    d['meta']['version'] = src['meta']['version'].split(' · ')[0] + ' · varian taman barat (cermin)'
    d['meta']['variant'] = 'barat'
    d['meta']['dims'] = {'lt2': {'x': [2, 5.5, 9]}}

    # floors / slabs / ceilings
    d['floors'] = [f if front(f['rect'], f['level']) else {**f, 'rect': mrect(f['rect'])} for f in src['floors']]
    d['slabs'] = [{**s, 'rect': mrect(s['rect'])} for s in src['slabs']]
    d['ceilings'] = [{**c, 'rect': mrect(c['rect'])} for c in src['ceilings']]

    # walls
    walls = []
    for w in src['walls']:
        ys = (w['a'][1], w['b'][1])
        horiz_at_front = abs(ys[0] - ys[1]) < 1e-6 and abs(ys[0] - FRONT) < 1e-6
        if w['level'] == 'site' and min(ys) >= FRONT - 1e-6 and not horiz_at_front:
            walls.append(copy.deepcopy(w))
            continue
        m = mirror_wall(w)
        on_east = abs(m['a'][0] - W) < 1e-6 and abs(m['b'][0] - W) < 1e-6
        if on_east and m.get('open'):
            # boundary wall: no windows, no side-street gate
            m['open'] = [o for o in m['open'] if o['type'] not in ('window', 'gate')]
            if not m['open']:
                m.pop('open')
            m['note'] = 'dinding batas timur: dinding mati tanpa jendela'
        on_west = abs(m['a'][0]) < 1e-6 and abs(m['b'][0]) < 1e-6
        if on_west and w['kind'] == 'boundary' and min(ys) >= 3.5 - 1e-6:
            # the old garden boundary is now the side-street wall: solid at the wudhu, roster with a tall plinth along the garden
            walls.append({'level': 'site', 'kind': 'boundary', 'a': [0, 3.5], 'b': [0, 4.5], 'h': 2.8,
                          'note': 'dinding wudhu sisi jalan samping, masif'})
            walls.append({'level': 'site', 'kind': 'roster', 'a': [0, 4.5], 'b': [0, 8.5], 'h': 2.8, 'plinth': 1.2,
                          'note': 'dinding taman sisi jalan samping: masif 1,2 m (privasi duduk + keamanan) + roster sampai 2,8 m'})
            continue
        if m['kind'] == 'roster' and m.get('level') == 'lt1':
            m['note'] = 'dinding timur musholla sisi service yard: roster + kaca mati buram di sisi dalam (dinding kiblat tetap masif, menghadap jalan)'
        walls.append(m)
    d['walls'] = walls

    d['facadeBands'] = [{'note': 'dasar andesit dinding musholla sisi jalan samping', 'rect': [-0.11, 0, -0.07, 3.5],
                         'z': 0, 'h': 1.0, 'mat': 'andesite'}]

    # stairs
    for st in d['stairs']:
        for f in st['flights']:
            f['rect'] = mrect(f['rect'])
            f['dir'] = FLIP.get(f['dir'], f['dir'])
        for l in st.get('landings', []):
            l['rect'] = mrect(l['rect'])

    # boxes (furniture and fixtures)
    MUSHOLLA_DX = -7.0          # musholla x 7..9 -> 0..2, translated so the mihrab stays on the qibla (west) wall
    boxes = []
    for b in src['boxes']:
        if front(b['rect'], b['level']) and b.get('type') != 'acOutdoor':
            boxes.append(copy.deepcopy(b))
            continue
        n = copy.deepcopy(b)
        if b.get('type') == 'mihrab':
            n['rect'] = trect(b['rect'], MUSHOLLA_DX)
            n['note'] = 'panel mihrab di dinding kiblat (barat, sisi jalan, masif)'
            boxes.append(n)
            continue
        if b.get('type') == 'acOutdoor' and 'kamar utama' in (b.get('note') or ''):
            boxes.append({'level': 'site', 'type': 'acOutdoor', 'rect': [5.55, 8.58, 6.25, 8.86], 'z': 2.0, 'h': 0.55,
                          'face': '+y', 'note': 'unit luar AC kamar utama, bracket dinding carport di samping unit ruang keluarga'})
            continue
        n['rect'] = mrect(b['rect'])
        for k in ('face', 'chair'):
            if k in n:
                n[k] = FLIP.get(n[k], n[k])
        n['note'] = swap_words(n.get('note'))
        if not n['note']:
            n.pop('note')
        boxes.append(n)
    d['boxes'] = boxes

    d['prayerMats'] = [{**p, 'c': [round(p['c'][0] + MUSHOLLA_DX, 4), p['c'][1]]} for p in src['prayerMats']]

    lights = []
    for l in src['lights']:
        n = copy.deepcopy(l)
        if front(l['at'], l['level']):
            lights.append(n)
            continue
        if 'mihrab' in (l.get('note') or ''):
            n['at'] = [round(l['at'][0] + MUSHOLLA_DX, 4), l['at'][1]]
        else:
            n['at'] = [mx(l['at'][0]), l['at'][1]]
        lights.append(n)
    d['lights'] = lights

    roofs = []
    for r in src['roofs']:
        n = copy.deepcopy(r)
        if r['id'] == 'kanopi-carport':
            roofs.append(n)
            continue
        n['rect'] = mrect(r['rect'])
        if r['id'] == 'dak-musholla' and 'skylight' in r:
            n['skylight'] = trect(r['skylight'], MUSHOLLA_DX)
        if r['type'] == 'gable':
            n['over'] = {**r.get('over', {}), 'east': 0.0}
            n['note'] = 'tanpa tritisan di sisi timur (dinding batas): talang + lisplang di garis dinding, air ke saluran sendiri'
        if 'posts' in n:
            n['posts'] = [[mx(p[0]), p[1]] for p in n['posts']]
        roofs.append(n)
    d['roofs'] = roofs

    d['plants'] = [p if front(p['c'], 'site') else {**p, 'c': [mx(p['c'][0]), p['c'][1]]} for p in src['plants']]

    # cars shift west so a 1.6 m path runs along the east side of the carport to the front door
    d['cars'] = [{**src['cars'][0], 'c': [3.3, 11.3]}, {**src['cars'][1], 'c': [6.25, 11.3]}]

    # walk spots: mirrored (yaw flips sign), musholla translated, a new arrival spot in the carport
    spots = []
    for s in src['walk']['spots']:
        n = copy.deepcopy(s)
        if s['label'] == 'Depan rumah':
            n.update({'level': 'site', 'at': [8.3, 13.3], 'yaw': 0})
        elif s['label'] == 'Musholla':
            n['at'] = [round(s['at'][0] + MUSHOLLA_DX, 4), s['at'][1]]
        else:
            n['at'] = [mx(s['at'][0]), s['at'][1]]
            n['yaw'] = -s.get('yaw', 0) if s.get('yaw') else 0
        spots.append(n)
    d['walk'] = {'start': spots[0], 'spots': spots}

    cams = copy.deepcopy(src['cameras'])
    for k in ('garden', 'living'):
        cams[k]['pos'][0] = mx(cams[k]['pos'][0])
        cams[k]['target'][0] = mx(cams[k]['target'][0])
    cams['musholla'] = {**cams['musholla'], 'pos': [1.8, 1.5, 3.3], 'target': [0.0, 1.7, 1.0]}
    d['cameras'] = cams

    d['notes'] = notes(src['notes'])
    return d


def notes(src_notes):
    out = [{'topic': 'Varian taman barat (cermin)', 'items': [
        'Varian perbandingan: denah dicerminkan barat–timur. Taman, wudhu, dan musholla pindah ke sisi jalan samping; studio, tangga, dan genkan menempel dinding batas timur. Carport dan taman pojok tetap.',
        'Dinding timur jadi dinding mati tanpa jendela: J3 (studio), J6 (kamar 2), dan J11 (KM dalam) ditiadakan. Kamar 2 tetap dapat cahaya dari J5 (utara), KM dalam dari J12 (selatan).',
        'Kaca besar ruang keluarga (PL1) dan jendela J8, J9, J10 lantai 2 menghadap barat ke taman dan jalan samping: kena matahari sore jam 14–17 sepanjang tahun.',
        'Atap pelana tanpa tritisan di sisi timur: talang + lisplang di garis dinding timur, air dibuang ke saluran sendiri.',
        'Pintu servis dari jalan samping (PK1) hilang karena pojok belakang dipakai musholla; service yard diakses lewat pintu dapur P5.',
        'Pintu utama P1 pindah ke ujung timur carport; posisi mobil digeser ke barat supaya ada jalur ±1,6 m ke pintu.',
    ]}]
    for n in src_notes:
        t, items = n['topic'], list(n['items'])
        if t == 'Musholla':
            items = ['Dak beton biasa dengan skylight 1 garis ±30 cm menempel dinding kiblat (barat): kaca laminated + film penahan panas, bibir beton keliling.',
                     'Dinding kiblat menghadap jalan samping, jadi masif (tenang, tidak terlihat dari jalan) dengan panel mihrab; roster + kaca mati buram pindah ke dinding timur sisi service yard.',
                     'Arah kiblat: sajadah diputar ±25° dari dinding barat (cek ulang dengan kompas kiblat di lokasi).']
        elif t == 'Taman & privasi':
            items = ['Dinding taman sisi jalan samping: masif 1,2 m (privasi saat duduk + keamanan) lalu roster sampai 2,8 m; dinding wudhu masif penuh.',
                     'Roster di depan taman (batas ke taman pojok): dinding masif 60 cm + roster sampai bawah kanopi carport (±2,8 m).',
                     'Peneduh sore wajib: pohon kecil atau bambu rumpun (tidak menjalar) di sepanjang roster jalan, kanopi/overhang ±1 m di atas PL1, kaca low-e atau film panas.',
                     'Kanopi kaca di atas deck: tempered laminated dengan rangka hitam dan kisi kayu di bawahnya.',
                     'Pojok taman (roster jalan + roster depan): bangku L tanam, dudukan WPC 45 cm dengan LED di bawahnya, bak tanaman 35–40 cm di belakang. Taman barat dapat ±5 jam matahari, cukup untuk strelitzia. Bak wajib waterproofing + pipa buang.']
        elif t == 'Tangga':
            items = [swap_words(i) for i in items]
        elif t == 'AC & listrik':
            items = [i.replace('ruang keluarga di dinding carport di bawah kanopi; kamar utama di dinding timur di atas taman.',
                               'ruang keluarga dan kamar utama di dinding carport di bawah kanopi.') for i in items]
            items.insert(1, 'Ruang keluarga menghadap barat: kalau PL1 tanpa peneduh, naikkan AC ruang keluarga ke 2½ PK; dengan roster + kanopi + kaca low-e, 2 PK cukup.')
        out.append({'topic': t, 'items': items})
    return out


def dump(d):
    """Same layout as house.json: one entry per line in lists, one key per line in dicts of dicts."""
    def one(v):
        return json.dumps(v, ensure_ascii=False)
    parts = []
    for k, v in d.items():
        if isinstance(v, list):
            body = ',\n'.join('    ' + one(i) for i in v)
            parts.append(f'  "{k}": [\n{body}\n  ]')
        elif isinstance(v, dict) and v and all(isinstance(x, dict) for x in v.values()) and k != 'meta':
            body = ',\n'.join(f'    "{kk}": {one(vv)}' for kk, vv in v.items())
            parts.append(f'  "{k}": {{\n{body}\n  }}')
        else:
            parts.append(f'  "{k}": {one(v)}')
    return '{\n' + ',\n\n'.join(parts) + '\n}\n'


if __name__ == '__main__':
    src = json.load(open(os.path.join(ROOT, 'data', 'house.json'), encoding='utf-8'))
    out = build(src)
    path = os.path.join(ROOT, 'data', 'house-barat.json')
    open(path, 'w', encoding='utf-8').write(dump(out))
    print('wrote', os.path.relpath(path, ROOT))
