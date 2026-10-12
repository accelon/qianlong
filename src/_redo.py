"""重切清單裡的卷（CSV 沒寫成、或整卷沒切出圖）。

用法：python _redo.py            # 讀 _redo.txt
      python _redo.py 1113-035
"""
import io
import sys

sys.path.insert(0, 'yblink')
sys.stdout.reconfigure(encoding='utf-8')
import recut                                                     # noqa: E402

vols = sys.argv[1:]
if not vols:
    vols = [l.strip() for l in io.open('_redo.txt', encoding='utf-8') if l.strip()]

for v in vols:
    try:
        print('%-10s %s' % (v, recut.recut(v, out='yb-out-prefix', csv_dir='yb-csv-prefix')), flush=True)
    except Exception as e:
        print('%-10s 例外：%s' % (v, e), flush=True)
