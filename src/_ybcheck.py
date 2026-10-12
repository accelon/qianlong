"""量切好的折圖：左右／上下留白、85 格裡有幾格有字。"""
import sys
import numpy as np
from PIL import Image

CW, CH = 100, 65
for f in sys.argv[1:]:
    a = np.array(Image.open(f).convert('L')) < 160
    h, w = a.shape
    cols = a.sum(axis=0)
    rows = a.sum(axis=1)
    nzc = np.where(cols >= 3)[0]
    nzr = np.where(rows >= 3)[0]
    left = nzc[0] if len(nzc) else -1
    right = w - 1 - nzc[-1] if len(nzc) else -1
    top = nzr[0] if len(nzr) else -1
    bot = h - 1 - nzr[-1] if len(nzr) else -1
    filled = 0
    for r in range(17):
        for c in range(5):
            if a[r * CH:(r + 1) * CH, c * CW:(c + 1) * CW].sum() >= 20:
                filled += 1
    print('%-22s 左留白 %3d  右 %3d  上 %3d  下 %3d   有字格 %2d/85' %
          (f.split('/')[-1].split('\\')[-1], left, right, top, bot, filled))
