#!/usr/bin/env python3
"""Add Alaska, Hawaii and the U.S. territories to data/perdiem-fyYYYY.json using the Defense
Department's OCONUS per diem file (DTMO), so the lookup covers all of the domestic United States.

  python3 -I scripts/build_oconus.py --data data/perdiem-fy2027.json --src src-dod --out data/perdiem-fy2027.json

--src must hold (fetched on the Mac, see HANDOFF.md):
  MM-DD-YYoconus.txt       DTMO monthly ASCII file: country;location;season start;season end;lodging;
                           local meals;proportional meals;incidentals;footnote no;footnote rate;max per diem;effective date
  mie-breakdown.csv        State Dept FTR Appendix B: mie,breakfast,lunch,dinner,incidentals ($1..$265)
  geonames-AK-HI.txt       GeoNames US postal rows for AK and HI (tab-separated, GeoNames layout)
  PR.txt GU.txt VI.txt AS.txt MP.txt   GeoNames postal files for the territories

What it does:
  * one rate area per DoD location ("Anchorage, AK", "[Other], HI" becomes "Rest of Hawaii"), with
    lodging and M&IE per month taken from the DoD seasons (the rate in force on the 1st of the month;
    where a season changes mid-month, the area also carries the exact season dates so the trip total
    and a note can use them);
  * every GeoNames post-office name and ZIP in those states and territories points at a DoD area:
    by name, else by county/island, else the state's "[OTHER]" area;
  * M&IE breakdowns for every OCONUS total are added to the data's "mie" table (Appendix B up to
    $265, then 15% / 25% / 40% breakfast / lunch / dinner with the rest as incidentals, State's rule).
Stdlib only. Prints what it matched and what fell back to [OTHER] so a person can eyeball it.
"""
import argparse, calendar, collections, csv, datetime, glob, json, os, re, sys, unicodedata

NONFOREIGN = {  # DoD "country" text -> state code
    'ALASKA': 'AK', 'HAWAII': 'HI', 'PUERTO RICO': 'PR', 'GUAM': 'GU', 'VIRGIN ISLANDS': 'VI',
    'AMERICAN SAMOA': 'AS', 'NORTHERN MARIANA ISLANDS': 'MP',
}
ST_NAME = {'AK': 'Alaska', 'HI': 'Hawaii', 'PR': 'Puerto Rico', 'GU': 'Guam', 'VI': 'U.S. Virgin Islands', 'AS': 'American Samoa', 'MP': 'Northern Mariana Islands'}
# Hawaii's DoD areas are islands; GeoNames gives counties. Molokai and Lanai are in Maui County.
HI_ISLAND_BY_COUNTY = {'Honolulu': 'OAHU', 'Hawaii': 'HAWAII', 'Maui': 'MAUI', 'Kauai': 'KAUAI', 'Kalawao': 'MOLOKAI'}
MONTHS = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']

def key(s):
    s = unicodedata.normalize('NFKD', str(s))
    s = ''.join(c for c in s if not unicodedata.combining(c)).lower().replace('&', ' and ')
    s = re.sub(r"[.'’`]", '', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s).strip()
    s = re.sub(r'\bst\b', 'saint', s); s = re.sub(r'\bste\b', 'sainte', s)
    s = re.sub(r'\bft\b', 'fort', s); s = re.sub(r'\bmt\b', 'mount', s)
    return s

def title(s):
    small = {'of', 'the', 'and', 'on', 'at', 'in', 'de', 'del', 'la', 'las', 'los', 'y'}
    out = []
    for i, w in enumerate(re.split(r'(\s+|-|/)', s.lower())):
        if not w.strip() or w in ('-', '/'): out.append(w); continue
        if w in small and i: out.append(w); continue
        if w.startswith('(') and len(w) > 1: out.append('(' + w[1:].capitalize()); continue
        if w.startswith('mc') and len(w) > 2: out.append('Mc' + w[2:].capitalize()); continue
        out.append(w.capitalize())
    return ''.join(out)

def mmdd(s):
    m, d = s.split('/'); return int(m), int(d)

def in_season(month, day, start, end):
    """(m, d) inside start..end, seasons may wrap the year end."""
    a, b, x = start, end, (month, day)
    return a <= x <= b if a <= b else (x >= a or x <= b)

def month_aligned(seasons):
    for a, b, _, _, _ in seasons:
        if a[1] != 1: return False
        if b[1] != calendar.monthrange(2027 if b[0] <= 9 else 2026, b[0])[1]: return False
    return True

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', required=True); ap.add_argument('--src', required=True); ap.add_argument('--out', required=True)
    args = ap.parse_args()
    D = json.load(open(args.data, encoding='utf-8'))
    fy = int(D['fy'])

    # ---- DoD file ----
    files = sorted(glob.glob(os.path.join(args.src, '*oconus.txt')))
    if not files: sys.exit('no *oconus.txt in ' + args.src)
    rows = []
    for line in open(files[-1], encoding='utf-8', errors='replace'):
        f = line.rstrip('\n').split(';')
        if len(f) < 12 or not f[0].strip(): continue
        rows.append(f)
    print('DoD rows', len(rows), 'from', os.path.basename(files[-1]))
    by_loc = collections.OrderedDict()  # (st, LOCATION) -> list of (start, end, lodging, mie, eff)
    for f in rows:
        country = f[0].strip().upper()
        st = None
        for k, v in NONFOREIGN.items():
            if country.startswith(k): st = v; break
        if not st: continue
        loc = f[1].strip().upper()
        lodging, meals, inc = int(f[4]), int(f[5]), int(f[7])
        by_loc.setdefault((st, loc), []).append((mmdd(f[2]), mmdd(f[3]), lodging, meals + inc, f[11].strip()))
    print('non-foreign locations', len(by_loc), collections.Counter(st for st, _ in by_loc))

    # ---- M&IE breakdowns ----
    mie = {int(k): v for k, v in D['mie'].items()}
    appb = {}
    with open(os.path.join(args.src, 'mie-breakdown.csv'), newline='', encoding='utf-8') as fh:
        for r in csv.DictReader(fh):
            appb[int(r['mie'])] = [int(r['breakfast']), int(r['lunch']), int(r['dinner']), int(r['incidentals'])]
    def breakdown(total):
        if total in appb: return appb[total]
        b, l, d = round(total * .15), round(total * .25), round(total * .40)
        return [b, l, d, total - b - l - d]

    # ---- areas ----
    areas = D['areas']
    area_idx = {}      # (st, LOCATION) -> index
    seasonal_note = 0
    for (st, loc), seasons in by_loc.items():
        seasons.sort(key=lambda x: x[0])
        lodging = []; mies = []
        for mi, mname in enumerate(MONTHS):
            m = (mi + 9) % 12 + 1
            hit = [s for s in seasons if in_season(m, 1, s[0], s[1])] or seasons
            lodging.append(hit[0][2]); mies.append(hit[0][3])
        name = 'Rest of ' + ST_NAME[st] if loc == '[OTHER]' else title(loc)
        extra = {'dod': 1}
        if len(seasons) > 1 and not month_aligned(seasons):
            extra['seasons'] = [['%02d/%02d' % a, '%02d/%02d' % b, lg, mv] for a, b, lg, mv, _ in seasons]; seasonal_note += 1
        if len(set(mies)) > 1: extra['mie'] = mies   # M&IE that changes with the season
        rec = [name, st, 'Defense Department rate area', mies[0], lodging, extra]
        area_idx[(st, loc)] = len(areas); areas.append(rec)
        for v in set(mies):
            if v not in mie: mie[v] = breakdown(v)
    print('areas now', len(areas), '| seasons not on month edges:', seasonal_note)
    D['mie'] = {str(k): v for k, v in sorted(mie.items())}
    other = {}
    for st in ST_NAME:   # the fallback area: [OTHER], else the state's only area (Guam), else its first one (flagged below)
        mine = [(loc, i) for (s2, loc), i in area_idx.items() if s2 == st]
        other[st] = area_idx.get((st, '[OTHER]'))
        if other[st] is None and mine:
            other[st] = mine[0][1]
            print('NOTE', st, 'has no [OTHER] row; unmatched places fall back to', mine[0][0], '' if len(mine) == 1 else '(CHECK: %d areas)' % len(mine))
    print('[OTHER] areas', other)
    loc_keys = {st: {key(loc): i for (s2, loc), i in area_idx.items() if s2 == st and loc != '[OTHER]'} for st in ST_NAME}

    # ---- GeoNames rows for these states ----
    gn = []  # (st, zip, place, county)
    for path in [os.path.join(args.src, 'geonames-AK-HI.txt')] + [os.path.join(args.src, st + '.txt') for st in ['PR', 'GU', 'VI', 'AS', 'MP']]:
        if not os.path.exists(path): print('missing', path); continue
        base = os.path.basename(path)
        for line in open(path, encoding='utf-8'):
            f = line.rstrip('\n').split('\t')
            if len(f) < 6: continue
            # GeoNames layout: country, postal code, place, admin1 name, admin1 code, admin2 name (county), ...
            st = f[4].strip() if base.startswith('geonames') else base[:2]
            if st not in ST_NAME: continue
            z = f[1].strip()[:5]
            if not re.fullmatch(r'\d{5}', z): continue
            gn.append((st, z, f[2].strip(), f[5].strip()))
    print('GeoNames rows', len(gn), collections.Counter(r[0] for r in gn))

    def area_for(st, place, county):
        """DoD area for a post-office name: its own name, else its county/island, else the state's rest."""
        k = key(place)
        if k in loc_keys[st]: return loc_keys[st][k], 'name'
        # "Joint Base Elmendorf-Richardson" style and "Kailua Kona" vs "KAILUA-KONA": word-set match
        for lk, i in loc_keys[st].items():
            if lk and (lk == k or (len(lk) > 5 and (k.startswith(lk + ' ') or lk.startswith(k + ' ')))): return i, 'prefix'
        if st == 'HI':
            isl = HI_ISLAND_BY_COUNTY.get(county)
            if isl and key(isl) in loc_keys[st]: return loc_keys[st][key(isl)], 'island'
        ck = key(county)
        if ck and ck in loc_keys[st]: return loc_keys[st][ck], 'county'
        if other[st] is None: sys.exit('no DoD area at all for ' + st)
        return other[st], 'other'

    # ---- places: rewrite these states' place lists with an area spec ----
    places = D['places']
    def heads(txt):
        out = []
        for rec in (txt or '').split('|'):
            if not rec: continue
            head = rec.split('=')[0]; r = 0
            if '~' in head: head, r = head.rsplit('~', 1); r = int(r)
            out.append((head, r))
        return out
    OLD_P = [(st, h) for st, txt in places.items() for h, _ in heads(txt)]  # the page's place order before the rewrite
    how = collections.Counter(); fell = collections.defaultdict(list)
    place_area = {}
    for st in ST_NAME:
        names = collections.OrderedDict()
        old = {}
        for h, r in heads(places.get(st)):
            old[h] = r; names.setdefault(h, [])   # keep every name the GSA build knew, in its order
        for s2, z, place, county in gn:
            if s2 != st: continue
            names.setdefault(place, []).append(county)
        recs = []
        for place, counties in names.items():
            county = collections.Counter(counties).most_common(1)[0][0] if counties else ''
            a, h = area_for(st, place, county); how[(st, h)] += 1
            if h == 'other': fell[st].append(place)
            place_area[(st, place)] = a
            r = old.get(place, 0)
            recs.append(place + ('~%d' % r if r else '') + '=%d' % a)
        # a DoD location with no post office of that name (Guam, Oahu, Maui, Kauai) becomes a searchable place itself
        have = {key(n) for n in names}
        for lk, i in loc_keys[st].items():
            if lk and lk not in have:
                nm = title(next(loc for (s2, loc), j in area_idx.items() if j == i))
                recs.append(nm + '~1=%d' % i); place_area[(st, nm)] = i; how[(st, 'area-name')] += 1
        places[st] = '|'.join(recs)
        print(st, 'places', len(recs))
    print('how places matched', dict(how))
    for st, lst in fell.items(): print('  ->', st, 'rest-of-state:', ', '.join(lst[:12]) + (' ...' if len(lst) > 12 else ''))

    # ---- ZIPs: rebuild the fixed-width string with these states pointing at DoD areas ----
    W = 11
    P = []  # rebuild the page's place index order: states in dict order, records in order
    for st, txt in places.items():
        if not txt: continue
        for rec in txt.split('|'):
            head = rec.split('=')[0]
            if '~' in head: head = head.rsplit('~', 1)[0]
            P.append((st, head))
    pidx = {p: i for i, p in enumerate(P)}
    def b36(n, w): 
        s = ''; 
        while n: s = '0123456789abcdefghijklmnopqrstuvwxyz'[n % 36] + s; n //= 36
        return (s or '0').rjust(w, '0')
    zips = D['zips']; recs = {}
    moved = 0
    for i in range(0, len(zips), W):
        r = zips[i:i + W]; pr = r[5:9]
        if pr != 'zzzz':   # the place index may have moved: re-point it through the old order
            np = pidx[OLD_P[int(pr, 36)]]
            if np != int(pr, 36): moved += 1
            r = r[:5] + b36(np, 4) + r[9:]
        recs[r[:5]] = r
    print('zip records re-pointed after the place rewrite:', moved)
    changed = 0; added = 0
    for st, z, place, county in gn:
        a = place_area[(st, place)]
        pi = pidx.get((st, place))
        if pi is None: continue
        new = z + b36(pi, 4) + b36(a, 2)
        if z in recs:
            if recs[z] != new: changed += 1
        else: added += 1
        recs[z] = new
    D['zips'] = ''.join(recs[z] for z in sorted(recs))
    print('zips', len(recs), 'changed', changed, 'added', added)

    assert len(P) < 36 ** 4 and len(areas) < 36 * 34, 'index width'
    D['oconus'] = {'source': 'DTMO OCONUS per diem file ' + os.path.basename(files[-1]) + '; M&IE breakdown FTR Appendix B (State Dept)', 'states': sorted(ST_NAME)}
    D['v'] = int(D.get('v', 1)) + 1
    json.dump(D, open(args.out, 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
    print('wrote', args.out, os.path.getsize(args.out), 'bytes, v', D['v'])

if __name__ == '__main__':
    main()
