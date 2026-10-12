"""掃折圖的「有字欄數」，用來找切歪或版面異常的折。

規則（實測 675 折得到的界線）：
  * 每一折正常都該是 5 欄都有字（實測 98%）
  * 只有**卷首第一折**（經題面板：3 欄＋2 空欄）與**卷末／經末那幾折**
    （音釋、尾題，字本來就稀）會少於 5 欄
所以「不在卷首、也不在卷末，卻少於 5 欄」就是可疑的折，要人工看。

用法：
  python _foldcols.py                      # 掃 yb-out-prefix 前 25 卷
  python _foldcols.py --n=100 --out=yb-out-prefix
"""
import argparse
import glob
import io
import os
import sys
import zipfile

import numpy as np
from PIL import Image

CELL_W = 100
# 要看**整格**：欄裡的字可能只有兩三個、落在最上面（實測「尸沙」只有 2 字、在第 1 格頂端），
# 只掃中段會把短欄誤判成空欄（40 卷裡誤報了 40 折）。只避開最外緣（塗白過的版框線）。
BAND = (8, 1097)
INK = 0.002              # 這一格算「有字」的墨量門檻

ap = argparse.ArgumentParser()
ap.add_argument('--out', default='yb-out-prefix')
ap.add_argument('--n', type=int, default=25)
ap.add_argument('--first', type=int, default=1, help='卷首前幾折不列入可疑')
ap.add_argument('--last', type=int, default=6, help='卷末後幾折不列入可疑')
a = ap.parse_args()

zips = sorted(glob.glob(os.path.join(a.out, '*.zip')))[:a.n]
dist = {}
susp = []
total = 0
for zp in zips:
    vol = os.path.basename(zp)[:-4]
    z = zipfile.ZipFile(zp)
    names = sorted(n for n in z.namelist() if n.lower().endswith('.jpg'))
    for i, nm in enumerate(names):
        g = np.array(Image.open(io.BytesIO(z.read(nm))).convert('L'))
        band = g[BAND[0]:BAND[1]] < 160
        inked = sum(1 for c in range(5) if band[:, c * CELL_W:(c + 1) * CELL_W].mean() > INK)
        dist[inked] = dist.get(inked, 0) + 1
        total += 1
        interior = a.first <= i < len(names) - a.last
        if inked < 5 and interior:
            susp.append((vol, nm, inked, i + 1, len(names)))
    z.close()

print('掃 %d 卷、%d 折' % (len(zips), total))
print('  有字欄數分布：%s' % dict(sorted(dist.items())))
print('  五欄都有字：%d（%.1f%%）' % (dist.get(5, 0), 100.0 * dist.get(5, 0) / max(1, total)))
print('  不在卷首／卷末、卻少於 5 欄的可疑折：%d' % len(susp))
for v, nm, k, idx, n in susp[:20]:
    print('    %s %s 有字欄 %d（第 %d/%d 折）' % (v, nm, k, idx, n))
