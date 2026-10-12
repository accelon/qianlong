"""列出「一個 PDF 裝了好幾卷」的部（來源標示 N 卷、實際只有 1 個 PDF）。

這些照使用者指定先做成一卷一個 zip，之後要拆卷時再處理；這裡把它們列成清單，
連同來源 PDF 的實際頁數，方便日後判斷卷界。
"""
import csv
import io
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from importlib import import_module
qlb = import_module('qlz-batch')


def main():
    rows, _ = qlb.build_map()
    counts = {}
    for name, rel, size in rows:
        dept = name[:4]
        counts.setdefault(dept, []).append((name, rel, size))

    csv_rows = {}
    with io.open(os.path.join(ROOT,'tables','乾隆藏.csv'), encoding='utf-8-sig') as fh:
        for r in csv.DictReader(fh):
            m = re.match(r'^(\d+)([a-z]?)$', (r['編號'] or '').strip())
            if not m:
                continue
            n = '%04d' % int(m.group(1))
            if n not in csv_rows:
                csv_rows[n] = r

    out = []
    for dept, vols in sorted(counts.items()):
        r = csv_rows.get(dept)
        want = (r['卷數'] or '').strip() if r else ''
        got = len(vols)
        if want.isdigit() and int(want) != got:
            out.append((dept, r['經名'], want, got, vols))

    print('卷數與 PDF 檔數不一致的經號：%d' % len(out))
    print('%-5s %-28s %-6s %-5s %s' % ('經號', '經名', 'csv卷', 'pdf', '來源'))
    for dept, name, want, got, vols in out:
        print('%-5s %-28s %-6s %-5s' % (dept, name[:26], want, got))
        for zname, rel, size in vols:
            print('        %s  %.1fMB  %s' % (zname, size / 1e6, rel))
    return out


if __name__ == '__main__':
    main()
