#!/usr/bin/env python3
"""Build data/perdiem-fyYYYY.json for the Shift Hours per diem view.

Run once a year when GSA posts the new files (usually August). Stdlib only.

  python3 -I scripts/build_perdiem.py --fy 2027 --src .perdiem-src --out data/perdiem-fy2027.json

--src must hold (see HANDOFF.md for where each comes from):
  gsa/rates.xlsx                         GSA "FY20xx per diem rates" file
  gsa/zips.xlsx                          GSA "ZIP code file for developers"
  geonames/US.txt                        GeoNames US postal codes (CC BY 4.0)
  census/county2020.txt                  national_county2020.txt
  census/place_by_county2020.txt         national_place_by_county2020.txt
  census/cousub2020.txt                  national_cousub2020.txt
  census/tab20_zcta520_county20_natl.txt Census 2020 ZCTA relationship files
  census/tab20_zcta520_place20_natl.txt
  census/tab20_zcta520_cousub20_natl.txt

How a place gets its rate:
  ZIP    -> GSA's ZIP file (a ZIP can sit in more than one rate area; then the user picks).
  Town   -> the ZIP areas (ZCTAs) that overlap it, weighted by land area. A ZIP split
            between rate areas is settled by the town's own county. Areas under 5% of the
            town's land are dropped as slivers. "City limits" areas (Sedona, Santa Monica...)
            apply to the whole named city.
  County -> its ZIP areas, same way.
  Post office names that are not Census places -> their ZIPs.
"""
import argparse
import calendar
import collections
import datetime
import json
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from xlsx import sheets  # noqa: E402

CONUS = set('AL AZ AR CA CO CT DE DC FL GA ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split())
FIPS_ST = {}  # '01' -> 'AL', filled from county2020
SLIVER = 0.05
MONTHS = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']
ALIASES = [('NY', 'New York City', 'New York'), ('NY', 'NYC', 'New York'), ('NY', 'The Bronx', 'Bronx')]
MIE = {68: [16, 19, 28, 5], 74: [18, 20, 31, 5], 80: [20, 22, 33, 5], 86: [22, 23, 36, 5], 92: [23, 26, 38, 5]}  # gsa.gov M&IE breakdowns


def die(msg):
    sys.exit('BUILD FAILED: ' + msg)


def key(name):
    """Search key: lower case, no accents or punctuation, Saint/Fort/Mount spelled out."""
    s = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower()
    s = s.replace('&', ' and ')
    s = re.sub(r"[.'’`]", '', s)
    s = re.sub(r'[^a-z0-9]+', ' ', s).strip()
    s = re.sub(r'\bst\b', 'saint', s)
    s = re.sub(r'\bste\b', 'sainte', s)
    s = re.sub(r'\bft\b', 'fort', s)
    s = re.sub(r'\bmt\b', 'mount', s)
    return s


LSAD = re.compile(r'\s+(city and borough|consolidated government|metropolitan government|metro government|unified government|'
                  r'urban county|charter township|city|town|village|borough|CDP|municipality|township|plantation|corporation|'
                  r'gore|grant|location|purchase|county)$')


def clean(name):
    n = re.sub(r'\s*\(balance\)$', '', name.strip())
    return LSAD.sub('', n).strip()


def read_bar(path):
    with open(path, encoding='utf-8-sig') as f:
        head = f.readline().rstrip('\n').split('|')
        for line in f:
            yield dict(zip(head, line.rstrip('\n').split('|')))


def parse_date(s):
    return datetime.datetime.strptime(s.strip(), '%B %d, %Y').date()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--fy', type=int, required=True)
    ap.add_argument('--src', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--report', help='optional JSON file listing every place with a choice of areas, and why')
    a = ap.parse_args()
    src = lambda *p: os.path.join(a.src, *p)  # noqa: E731
    fy = a.fy
    fy_start, fy_end = datetime.date(fy - 1, 10, 1), datetime.date(fy, 9, 30)
    month_starts = [datetime.date(fy - 1 if m >= 10 else fy, m, 1) for m in (10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9)]

    # ---- GSA rates file: seasons -> monthly lodging ----
    rows = sheets(src('gsa', 'rates.xlsx'))
    rows = next(iter(rows.values()))
    hi = next(i for i, r in enumerate(rows) if r and r[0].upper() == 'STATE')
    head = [h.upper() for h in rows[hi]]
    if head[:5] != ['STATE', 'DESTINATION', 'COUNTY/LOCATION DEFINED', 'SEASON BEGIN', 'SEASON END']:
        die('rates file columns changed: %r' % head)
    rate_areas = collections.OrderedDict()
    for r in rows[hi + 1:]:
        if len(r) < 7 or not r[3]:
            continue
        st, dest, defined = r[0], r[1], r[2]
        b, e = parse_date(r[3]), parse_date(r[4])
        if b.day != 1 or e.day != calendar.monthrange(e.year, e.month)[1]:
            die('season does not run whole months: %r' % r)
        if b < fy_start or e > fy_end:
            die('season outside FY %d: %r' % (fy, r))
        k = (st, dest, defined)
        ar = rate_areas.setdefault(k, {'st': st, 'name': dest, 'defined': defined, 'l': [None] * 12, 'm': set()})
        for i, ms in enumerate(month_starts):
            if b <= ms <= e:
                if ar['l'][i] is not None:
                    die('overlapping seasons: %r' % r)
                ar['l'][i] = int(float(r[5]))
        ar['m'].add(int(float(r[6])))
    for k, ar in rate_areas.items():
        if None in ar['l']:
            die('months missing for %r' % (k,))
        if len(ar['m']) != 1:
            die('M&IE changes by season for %r' % (k,))
        ar['m'] = ar['m'].pop()
        if ar['m'] not in MIE:
            die('M&IE tier %s has no breakdown; update MIE from gsa.gov' % ar['m'])
    std = [ar for k, ar in rate_areas.items() if k[0] == '']
    if len(std) != 1 or len(set(std[0]['l'])) != 1:
        die('standard rate row not found or not flat')
    std = std[0]
    print('rates file: %d areas incl. standard; standard $%d lodging / $%d M&IE' % (len(rate_areas), std['l'][0], std['m']))

    # ---- GSA ZIP file ----
    zrows = next(iter(sheets(src('gsa', 'zips.xlsx')).values()))
    zh = zrows[0]
    want = ['DestinationID', 'Name', 'County', 'LocationDefined', 'State', 'ZIP', 'FiscalYear'] + MONTHS + ['Meals']
    if zh[:len(want)] != want:
        die('ZIP file columns changed: %r' % zh)
    dest = {}   # DestinationID -> area dict from the rates file
    gzip = collections.defaultdict(list)   # zip -> [(dest id, GSA county text)]
    gzst = {}
    for r in zrows[1:]:
        did, name, cty, loc, st, z = r[0], r[1], r[2], r[3], r[4], r[5]
        if r[6] != str(fy):
            die('ZIP file is for FY %s' % r[6])
        if not re.fullmatch(r'\d{5}', z):
            die('bad ZIP %r' % z)
        months = [int(float(x)) for x in r[7:19]]
        meals = int(float(r[19]))
        if did == '0':
            ar = std
        else:
            cand = [v for k, v in rate_areas.items() if k[1] == name and k[2] == loc and k[0] != '']
            if len(cand) > 1:  # same name in two states (Dallas IA / TX)
                cand = [v for v in cand if v['st'] == st]
            if len(cand) != 1:
                die('ZIP-file area %s %r / %r matches %d rates-file areas' % (did, name, loc, len(cand)))
            ar = cand[0]
        if ar['l'] != months or ar['m'] != meals:
            die('ZIP-file rates for %s %s differ from rates file: %r vs %r' % (did, name, months, ar['l']))
        if dest.setdefault(did, ar) is not ar:
            die('DestinationID %s maps to two areas' % did)
        if did not in [d for d, _ in gzip[z]]:
            gzip[z].append((did, re.sub(r',\s*[A-Z]{2}$', '', cty)))
        gzst[z] = st
    unused = [k for k, v in rate_areas.items() if not any(v is d for d in dest.values())]
    if unused:
        die('rates-file areas with no ZIPs: %r' % unused)

    # area index: 0 = standard, then by state + name
    order = sorted((d for d in dest if d != '0'), key=lambda d: (dest[d]['st'], dest[d]['name']))
    aidx = {'0': 0}
    areas = [['Standard rate', '', 'Any county not listed by GSA', std['m'], std['l']]]
    for d in order:
        ar = dest[d]
        aidx[d] = len(areas)
        areas.append([ar['name'], ar['st'], ar['defined'], ar['m'], ar['l']])
    zip_areas = {z: [aidx[d] for d, _ in v] for z, v in gzip.items()}
    print('ZIP file: %d rows, %d ZIPs, %d split across 2+ areas' % (len(zrows) - 1, len(gzip), sum(len(v) > 1 for v in gzip.values())))

    # city-limits areas: (state, city key) -> area
    city_limit = {}
    for i, ar in enumerate(areas[1:], 1):
        for m in re.finditer(r'(less the )?[Cc]ity (?:[Ll]imits )?of ([A-Z][A-Za-z. ]+?)(?=$|[,/;)])', ar[2]):
            if not m.group(1):
                city_limit[(ar[1], key(m.group(2)))] = i
    print('city-limits areas:', sorted('%s %s' % k for k in city_limit))
    zip_trust = {i for i, ar in enumerate(areas) if re.match(r'City limits of', ar[2], re.I) or 'AFB' in ar[2]}
    print('areas where the ZIP file decides:', sorted(areas[i][0] for i in zip_trust))

    # ---- Census: counties, ZCTA overlaps ----
    county = {}  # GEOID5 -> (st, name)
    for r in read_bar(src('census', 'county2020.txt')):
        FIPS_ST[r['STATEFP']] = r['STATE']
        county[r['STATEFP'] + r['COUNTYFP']] = (r['STATE'], r['COUNTYNAME'])
    zland = {}
    zcounty = collections.defaultdict(dict)  # zcta -> {county: land}
    for r in read_bar(src('census', 'tab20_zcta520_county20_natl.txt')):
        z, c = r['GEOID_ZCTA5_20'], r['GEOID_COUNTY_20']
        if not z:
            continue
        zland[z] = int(r['AREALAND_ZCTA5_20'] or 0)
        zcounty[z][c] = zcounty[z].get(c, 0) + int(r['AREALAND_PART'] or 0)

    # county -> primary rate area, voted by land of single-area ZIPs that sit mostly in the county
    votes = collections.defaultdict(collections.Counter)
    for z, parts in zcounty.items():
        if z not in zip_areas or len(zip_areas[z]) != 1 or not zland.get(z):
            continue
        for c, land in parts.items():
            if land / zland[z] >= 0.5:
                votes[c][zip_areas[z][0]] += land
    county_area = {}
    for c, (st, _) in county.items():
        if st not in CONUS:
            continue
        if votes[c]:
            county_area[c] = votes[c].most_common(1)[0][0]
        else:  # tiny county-equivalents (e.g. Virginia cities): any ZIP touching it that is not split
            v = collections.Counter()
            for z, parts in zcounty.items():
                if c in parts and z in zip_areas:
                    for ai in zip_areas[z]:
                        v[ai] += parts[c]
            county_area[c] = v.most_common(1)[0][0] if v else 0
    # check: a county put in a named area should be named in that area's definition
    bad = []
    for c, ai in county_area.items():
        if ai == 0:
            continue
        base = key(re.sub(r'\s+(County|Parish|city|City and Borough|Borough)$', '', county[c][1]))
        if base not in key(areas[ai][2]) and base not in key(areas[ai][0]):
            bad.append('%s %s -> %s (%s)' % (county[c][0], county[c][1], areas[ai][0], areas[ai][2]))
    print('counties mapped: %d; named-area counties not in that area\'s definition: %d' % (len(county_area), len(bad)))
    for b in bad:
        print('   ', b)

    def resolve_zip_part(z, counties):
        """Rate areas for the part of ZIP z that lies in the given counties."""
        al = zip_areas.get(z)
        if not al:
            return []
        if len(al) == 1:
            return al
        hit = [ai for ai in al if ai in {county_area.get(c) for c in counties}]
        return hit if len(hit) == 1 else []

    # ---- Census places and county subdivisions ----
    ents = {}  # geoid -> dict(st, name, counties set, kind)
    for r in read_bar(src('census', 'place_by_county2020.txt')):
        if r['STATE'] not in CONUS:
            continue
        g = 'P' + r['STATEFP'] + r['PLACEFP']
        e = ents.setdefault(g, {'st': r['STATE'], 'raw': r['PLACENAME'], 'name': clean(r['PLACENAME']), 'counties': set(), 'z': {}})
        e['counties'].add(r['STATEFP'] + r['COUNTYFP'])
    for r in read_bar(src('census', 'cousub2020.txt')):
        if r['STATE'] not in CONUS or r['FUNCSTAT'] not in ('A', 'G') or r['CLASSFP'].startswith('Z5'):
            continue
        g = 'S' + r['STATEFP'] + r['COUNTYFP'] + r['COUSUBFP']
        ents[g] = {'st': r['STATE'], 'raw': r['COUSUBNAME'], 'name': clean(r['COUSUBNAME']), 'counties': {r['STATEFP'] + r['COUNTYFP']}, 'z': {}}
    for fn, col, pre in (('tab20_zcta520_place20_natl.txt', 'GEOID_PLACE_20', 'P'), ('tab20_zcta520_cousub20_natl.txt', 'GEOID_COUSUB_20', 'S')):
        for r in read_bar(src('census', fn)):
            g = pre + r[col]
            if g in ents and r['GEOID_ZCTA5_20']:
                ents[g]['z'][r['GEOID_ZCTA5_20']] = int(r['AREALAND_PART'] or 0)

    def ent_choices(e):
        """[(area, set of counties)] for a Census place / town, slivers dropped."""
        cl = city_limit.get((e['st'], key(e['name'])))
        if cl:
            return [(cl, set(), max(1, len(e['z'])))]
        w = collections.Counter()
        cw = collections.defaultdict(collections.Counter)  # area -> county -> land
        for z, land in e['z'].items():
            land = max(land, 1)
            parts = {c: l for c, l in zcounty.get(z, {}).items() if c in e['counties']} or {c: 1 for c in e['counties']}
            tot = sum(parts.values()) or 1
            al = zip_areas.get(z, [])
            for c, l in parts.items():
                # GSA defines rates by county, so the county decides; the ZIP file (which puts a whole
                # ZIP in one area) only decides for city-limits / base areas that cut across counties
                ai = al[0] if len(al) == 1 and al[0] in zip_trust else county_area.get(c, 0)
                share = land * l / tot
                w[ai] += share
                cw[ai][c] += share
        total = sum(w.values())
        if not total:  # no ZIP data: go by county
            out = collections.defaultdict(set)
            for c in e['counties']:
                out[county_area.get(c, 0)].add(c)
            return [(ai, cs, len(cs)) for ai, cs in sorted(out.items(), key=lambda x: -len(x[1]))]
        keep = [ai for ai, v in w.most_common() if v / total >= SLIVER] or [w.most_common(1)[0][0]]
        size = max(1, len(e['z']))
        return [(ai, {c for c, v in cw[ai].items() if v / total >= SLIVER / 2} or set(cw[ai]), size * w[ai] / total) for ai in keep]

    # ---- GeoNames ----
    geo = {}
    for line in open(src('geonames', 'US.txt'), encoding='utf-8'):
        f = line.rstrip('\n').split('\t')
        if len(f) < 11:
            continue
        if f[1] in geo and not f[4]:
            continue  # a few ZIPs are listed twice, once as a military FPO row with no state; keep the real place
        geo[f[1]] = {'name': f[2], 'st': f[4] or 'MIL', 'cfips': f[6], 'cname': f[5], 'lat': float(f[9] or 0), 'lon': float(f[10] or 0)}

    def zip_county(z):
        parts = zcounty.get(z)
        if parts:
            return max(parts, key=parts.get)
        g = geo.get(z)
        if g and g['st'] != 'CT' and g['cfips']:
            fp = [k for k, v in FIPS_ST.items() if v == g['st']]
            if fp and fp[0] + g['cfips'] in county:
                return fp[0] + g['cfips']
        return None

    # ZIPs GeoNames knows in CONUS but GSA's file doesn't list: same-name ZIPs, else nearest listed ZIP
    inferred = {}
    listed = [(z, g) for z, g in geo.items() if z in zip_areas and len(zip_areas[z]) == 1]
    byname = collections.defaultdict(set)
    for z, g in geo.items():
        if z in zip_areas:
            byname[(g['st'], g['name'])].update(zip_areas[z])
    for z, g in geo.items():
        if g['st'] not in CONUS or z in zip_areas:
            continue
        s = byname.get((g['st'], g['name']))
        if s and len(s) == 1:
            inferred[z] = (sorted(s), 'same')
        else:
            near = min(listed, key=lambda x: (x[1]['lat'] - g['lat']) ** 2 + (x[1]['lon'] - g['lon']) ** 2)
            inferred[z] = (zip_areas[near[0]], 'near:' + near[0])
    print('GeoNames CONUS ZIPs missing from GSA file: %d (same-name %d, nearest %d)' % (
        len(inferred), sum(v[1] == 'same' for v in inferred.values()), sum(v[1] != 'same' for v in inferred.values())))

    # ---- places: group by (state, key) ----
    def county_label(cs):
        return ', '.join(sorted(county[c][1] for c in cs if c in county))

    groups = collections.defaultdict(lambda: {'names': collections.Counter(), 'members': [], 'rank': 0, 'census': False, 'ents': 0})
    for g, e in ents.items():
        if not e['name']:
            continue
        gr = groups[(e['st'], key(e['name']))]
        gr['names'][e['name']] += 1000  # Census spelling wins ("St. Louis", not "Saint Louis")
        gr['census'] = True
        gr['ents'] += 1
        gr['rank'] = max(gr['rank'], len(e['z']))
        for ai, cs, wt in ent_choices(e):
            gr['members'].append((ai, cs or set(e['counties']), wt))
    geo_by_place = collections.defaultdict(list)
    for z, g in geo.items():
        geo_by_place[(g['st'], g['name'])].append(z)
    for (st, name), zs in geo_by_place.items():
        gr = groups[(st, key(name))]
        gr['names'][name] += len(zs)
        gr['rank'] = max(gr['rank'], len(zs))
        if st not in CONUS:
            gr['members'] = [(-1, set(), 1)]
            continue
        if gr['census']:
            continue  # a real Census place/town: go by its land, not by ZIPs that share its mailing name
        for z in zs:
            c = zip_county(z)
            al = zip_areas.get(z) or inferred.get(z, ([], ''))[0]
            part = resolve_zip_part(z, {c}) if (c and len(al) > 1) else al
            for ai in (part or al):
                gr['members'].append((ai, {c} if c else set(), 1))

    # counties as places too ("Queens County, NY"): the county's rate plus any city-limits area inside it
    cl_in = collections.defaultdict(set)
    for e in ents.values():
        ai = city_limit.get((e['st'], key(e['name'])))
        if ai:
            for c in e['counties']:
                cl_in[c].add((ai, e['name']))
    nz = collections.Counter(c for parts in zcounty.values() for c in parts)
    for c, (st, cname) in county.items():
        if st not in CONUS:
            continue
        gr = groups[(st, key(cname))]
        gr['names'][cname] += 1000
        gr['rank'] = max(gr['rank'], max(1, nz[c] // 3))
        gr['members'].append((county_area[c], set(), 1000))
        for ai, nm in sorted(cl_in[c]):
            if ai != county_area[c]:
                gr['members'].append((ai, set(), 1, 'City of ' + nm))

    by_state = collections.defaultdict(list)
    report = []
    for (st, k), gr in groups.items():
        if not gr['members']:
            continue
        merged = collections.OrderedDict()
        for m in gr['members']:
            ai, cs, wt = m[:3]
            x = merged.setdefault(ai, {'c': set(), 'w': 0, 'l': ''})
            x['c'] |= cs
            x['w'] += wt
            if len(m) > 3:
                x['l'] = m[3]
        name = gr['names'].most_common(1)[0][0]
        if re.search(r'[|=;:~]', name):
            die('place name has a reserved character: %r' % name)
        ch = sorted(merged.items(), key=lambda x: -x[1]['w'])
        if len(ch) == 1:
            spec = '' if ch[0][0] == 0 or ch[0][0] == -1 else '=%d' % ch[0][0]
        else:
            labs = []
            for ai, x in ch:
                lab = x['l'] or county_label(x['c'])
                if re.search(r'[|=;:]', lab):
                    die('label has a reserved character: %r' % lab)
                labs.append('%d:%s' % (ai, lab))
            spec = '=' + ';'.join(labs)
        by_state[st].append((gr['rank'], name, spec, k))
        if len(ch) > 1:
            why = 'same-name' if gr['ents'] > 1 else 'county-line' if gr['census'] else 'zip-name'
            report.append({'place': name + ', ' + st, 'why': why, 'choices': [[areas[ai][0], x['l'] or county_label(x['c'])] for ai, x in ch]})
    # a few names people type that are not Census or postal names
    for st, alias, target in ALIASES:
        hit = [x for x in by_state[st] if x[3] == key(target)]
        if not hit:
            die('alias target missing: %s %s' % (target, st))
        by_state[st].append((hit[0][0], alias, hit[0][2], key(alias)))
    pidx = {}
    places = {}
    n = 0
    for st in sorted(by_state):
        lst = sorted(by_state[st], key=lambda x: (-x[0], x[1]))
        # '~n' = size rank (number of ZIP areas), only for bigger places, so 'Portland' puts OR before ME
        places[st] = '|'.join(nm + ('~%d' % rk if rk >= 4 else '') + spec for rk, nm, spec, _ in lst)
        for _, _, _, k in lst:
            pidx[(st, k)] = n
            n += 1
    n_multi = sum(';' in p for st in places for p in places[st].split('|'))

    # ---- ZIPs: fixed-width records zip(5) + place index (4, base 36) + area (2, base 36) ----
    def b36(v, w):
        digits = '0123456789abcdefghijklmnopqrstuvwxyz'
        out = ''
        while v:
            v, r = divmod(v, 36)
            out = digits[r] + out
        out = out.rjust(w, '0')
        if len(out) > w:
            die('base36 overflow')
        return out

    recs, zx, zinf = [], {}, []
    for z in sorted(set(zip_areas) | set(geo)):
        g = geo.get(z)
        pi = pidx.get((g['st'], key(g['name']))) if g else None
        pref = b36(pi, 4) if pi is not None else 'zzzz'
        if z in zip_areas:
            al = zip_areas[z]
            if len(al) == 1:
                recs.append(z + pref + b36(al[0], 2))
                continue
            # label each area with GSA's county, or for Standard the ZIP's other counties
            named = {key(gc) for d, gc in gzip[z] if d != '0'}
            labs = []
            for d, gc in gzip[z]:
                if d != '0':
                    labs.append([aidx[d], gc])
                else:
                    others = [county[c][1] for c in sorted(zcounty.get(z, {}), key=lambda c: -zcounty[z][c])
                              if key(county[c][1]) not in named and county_area.get(c) == 0]
                    labs.append([0, ', '.join(others)])
            zx[z] = labs
            recs.append(z + pref + 'zz')
        elif g and g['st'] in CONUS:
            al = inferred[z][0]
            zinf.append(z)
            if len(al) == 1:
                recs.append(z + pref + b36(al[0], 2))
            else:
                zx[z] = [[ai, ''] for ai in al]
                recs.append(z + pref + 'zz')
        elif g:
            recs.append(z + pref + 'yy')

    out = {
        'v': 1, 'fy': fy, 'start': str(fy_start), 'end': str(fy_end), 'built': str(datetime.date.today()),
        'months': MONTHS, 'mie': {str(k): v for k, v in MIE.items()},
        'areas': areas, 'places': places, 'zips': ''.join(recs), 'zx': zx, 'zinf': ' '.join(zinf),
    }
    if a.report:
        with open(a.report, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=0)
        print('multi-area places by cause:', dict(collections.Counter(r['why'] for r in report)))
    os.makedirs(os.path.dirname(a.out) or '.', exist_ok=True)
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('wrote %s: %d bytes; %d areas, %d places (%d with a choice of areas), %d ZIPs (%d split, %d inferred)' % (
        a.out, os.path.getsize(a.out), len(areas), n, n_multi, len(recs), len(zx), len(zinf)))


if __name__ == '__main__':
    main()
