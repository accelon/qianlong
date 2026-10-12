"""回歸比對：把指定的卷用目前的 yb-frame.py 重切到 _regress/，跟既有 yb-csv-prefix 的結果比。

用法：python _regress.py 1094-001 1112-003 ...
"""
import csv
import io
import os
import sys

sys.path.insert(0, 'yblink')
sys.stdout.reconfigure(encoding='utf-8')
import recut                                                    # noqa: E402

OUT, CSV = '_regress/out', '_regress/csv'


def rows(path):
    if not os.path.exists(path):
        return None
    return list(csv.DictReader(io.open(path, encoding='utf-8')))


def pages(rs):
    """{(page, fold): row}"""
    return {(r['page'], r['fold']): r for r in rs}


print('%-10s %8s %8s   %s' % ('卷', '舊折', '新折', '差異'))
for vol in sys.argv[1:]:
    old = rows(os.path.join('yb-csv-prefix', vol + '.csv'))
    recut.recut(vol, out=OUT, csv_dir=CSV)
    new = rows(os.path.join(CSV, vol + '.csv'))
    if old is None or new is None:
        print('%-10s %8s %8s   缺 CSV' % (vol, len(old) if old else '-', len(new) if new else '-'))
        continue
    po, pn = pages(old), pages(new)
    only_old = sorted(set(po) - set(pn))
    only_new = sorted(set(pn) - set(po))
    note = []
    if only_old:
        note.append('舊有新無 %d 頁折 %s' % (len(only_old), only_old[:4]))
    if only_new:
        note.append('新有舊無 %d 頁折 %s' % (len(only_new), only_new[:4]))
    # 兩邊都有的頁折，比折寬
    w = []
    for k in sorted(set(po) & set(pn)):
        w.append(int(pn[k]['x1']) - int(pn[k]['x0']) - (int(po[k]['x1']) - int(po[k]['x0'])))
    if w:
        w.sort()
        note.append('折寬差中位 %+d（範圍 %+d~%+d）' % (w[len(w) // 2], w[0], w[-1]))
    print('%-10s %8d %8d   %s' % (vol, len(old), len(new), '；'.join(note) or '一致'))
