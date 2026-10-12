"""量折圖的格內對位：每格墨跡重心相對格心的 x 偏移。

用法：python _align.py <目錄或zip> [第二個]
"""
import glob
import io
import os
import sys
import zipfile

import numpy as np
from PIL import Image

CELL_W, CELL_H = 100, 65
COLS, CHARS = 5, 17


def load(path):
    if path.lower().endswith('.zip'):
        z = zipfile.ZipFile(path)
        return [(n, Image.open(io.BytesIO(z.read(n)))) for n in sorted(z.namelist())
                if n.lower().endswith('.jpg')]
    return [(os.path.basename(p), Image.open(p)) for p in sorted(glob.glob(os.path.join(path, '*.jpg')))]


def offsets(img):
    a = np.array(img.convert('L')) < 160
    out = []
    for c in range(COLS):
        sub = a[:, c * CELL_W:(c + 1) * CELL_W]
        for r in range(CHARS):
            cell = sub[r * CELL_H:(r + 1) * CELL_H]
            ys, xs = np.nonzero(cell)
            if len(xs) >= 15:
                out.append(float(xs.mean() - CELL_W / 2.0))
    return out


for path in sys.argv[1:]:
    allv = []
    ncell = 0
    for name, img in load(path):
        v = offsets(img)
        allv += v
        ncell += len(v)
    v = np.array(allv)
    if not len(v):
        print('%s：沒有有字的格' % path)
        continue
    print('%-34s 有字格 %6d  偏移中位 %+6.1f  平均 %+6.1f  |偏移| 中位 %5.1f  p90 %5.1f  >25px %4.1f%%'
          % (path, ncell, np.median(v), v.mean(), np.median(np.abs(v)),
             np.percentile(np.abs(v), 90), 100.0 * (np.abs(v) > 25).mean()))
