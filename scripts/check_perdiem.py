#!/usr/bin/env python3
"""Check the per diem data against the raw source files, using the page's own lookup code.

  python3 -I scripts/check_perdiem.py --src .perdiem-src --data data/perdiem-fy2027.json

Reads GSA's ZIP file, GeoNames and the Census name lists straight from --src, writes what
each lookup should give to --src/expect.json, then runs scripts/check_perdiem.mjs (Node),
which loads the pd-core block out of index.html and runs every ZIP and every place name through it.
"""
import argparse
import collections
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from xlsx import sheets  # noqa: E402
from build_perdiem import CONUS, clean, read_bar  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True)
    ap.add_argument('--data', required=True)
    a = ap.parse_args()
    src = lambda *p: os.path.join(a.src, *p)  # noqa: E731

    # GSA ZIP file, read directly: zip -> set of (area name, Oct..Sep lodging, M&IE)
    zrows = next(iter(sheets(src('gsa', 'zips.xlsx')).values()))
    gsa = collections.defaultdict(list)
    for r in zrows[1:]:
        t = ['standard' if r[0] == '0' else r[1].lower(), [int(float(x)) for x in r[7:19]], int(float(r[19]))]
        if t not in gsa[r[5]]:
            gsa[r[5]].append(t)

    geo_zips, geo_places = {}, set()
    for line in open(src('geonames', 'US.txt'), encoding='utf-8'):
        f = line.rstrip('\n').split('\t')
        if len(f) < 11:
            continue
        st = f[4] or 'MIL'
        if f[1] not in geo_zips or f[4]:
            geo_zips[f[1]] = st
        geo_places.add((f[2], st))

    census = set()
    for r in read_bar(src('census', 'place_by_county2020.txt')):
        if r['STATE'] in CONUS:
            census.add((clean(r['PLACENAME']), r['STATE']))
    for r in read_bar(src('census', 'cousub2020.txt')):
        if r['STATE'] in CONUS and r['FUNCSTAT'] in ('A', 'G') and not r['CLASSFP'].startswith('Z5'):
            census.add((clean(r['COUSUBNAME']), r['STATE']))
    for r in read_bar(src('census', 'county2020.txt')):
        if r['STATE'] in CONUS:
            census.add((r['COUNTYNAME'], r['STATE']))

    exp = {'gsa': gsa, 'geoZips': geo_zips, 'geoPlaces': sorted(geo_places), 'census': sorted(census), 'conus': sorted(CONUS)}
    out = src('expect.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(exp, f, ensure_ascii=False)
    print('expectations: %d GSA ZIPs, %d GeoNames ZIPs, %d GeoNames places, %d Census names' % (len(gsa), len(geo_zips), len(geo_places), len(census)))
    page = os.path.join(HERE, '..', 'index.html')
    sys.exit(subprocess.call(['node', os.path.join(HERE, 'check_perdiem.mjs'), page, a.data, out]))


if __name__ == '__main__':
    main()
