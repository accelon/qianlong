"""找長直線：垂直線（折線、折框左右邊）與水平線（版框上下邊）。
先不修 skew，看覆蓋率能不能直接分出來。"""
import sys
import numpy as np
from PIL import Image
import gridfit

for path in sys.argv[1:]:
    gray = np.array(Image.open(path).convert('L'))
    ink = gridfit.ink_mask(gray)
    h, w = ink.shape
    colfrac = ink.mean(axis=0)
    rowfrac = ink.mean(axis=1)

    def runs(mask, minlen=3):
        out, i = [], 0
        while i < len(mask):
            if mask[i]:
                j = i
                while j + 1 < len(mask) and mask[j + 1]:
                    j += 1
                if j - i + 1 >= minlen:
                    out.append((i, j, float(mask[i:j + 1].mean())))
                i = j + 1
            else:
                i += 1
        return out

    v = runs(colfrac > 0.45, 2)
    hz = runs(rowfrac > 0.45, 2)
    print('=== %s  %dx%d' % (path.split('\\')[-1], w, h))
    print('  垂直線（x 範圍, 平均覆蓋率）:')
    for a, b, m in v:
        print('     %5d-%-5d  %.2f' % (a, b, m))
    print('  水平線（y 範圍, 平均覆蓋率）:')
    for a, b, m in hz:
        print('     %5d-%-5d  %.2f' % (a, b, m))
    # 兩個最寬的空白帶＝折線所在（折線兩側間距比行距寬）
    print('  欄向墨量最低的幾個位置（候選折線）:')
    order = np.argsort(colfrac)[:400]
    grp, cur = [], [order[0]]
    for k in order[1:]:
        if k - cur[-1] <= 30:
            cur.append(k)
        else:
            grp.append(cur)
            cur = [k]
    grp.append(cur)
    for g in sorted(grp, key=lambda g: colfrac[int(np.mean(g))])[:6]:
        c = int(np.mean(g))
        print('     x≈%5d  覆蓋率 %.3f  寬 %d' % (c, colfrac[c], g[-1] - g[0] + 1))
