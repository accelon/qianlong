"""
永樂北藏切圖：一張掃瞄圖 = 三折（經摺裝），每折 5 欄 × 17 字。

版面結構（使用者提供）：一折 5 欄，折與折之間有一條「版心」折線，
線內有千字文函號（如「天一」）與頁號（如「十三」）——這是分折的線索。
所以不能只沿著均勻格線取 15 欄，要用版心把欄序列切開。

經變圖、音釋、牌記等非正文頁，用「5×17 格子裡多數要有字」判斷後排除。

用法：python yb-cuts.py <頁面目錄> [輸出目錄] [--skip=N] [--limit=N]
"""
import glob
import os
import sys

import numpy as np
from PIL import Image

import gridfit

FOLD_COLS = 5             # 每折 5 欄
FOLDS = 3                 # 一張掃瞄圖 = 三折
CHARS = 17                # 每欄 17 字
CELL_W, CELL_H = 100, 65  # 輸出每格像素（500×1105，與乾隆藏一致）

args = [a for a in sys.argv[1:] if not a.startswith('--')]
src = args[0] if args else r'yonglebeizang\0001-001天01\11725711_31'
out_dir = args[1] if len(args) > 1 else 'yb-cuts'
skip = int(next((a.split('=')[1] for a in sys.argv if a.startswith('--skip=')), 1))
limit = int(next((a.split('=')[1] for a in sys.argv if a.startswith('--limit=')), 6))

os.makedirs(out_dir, exist_ok=True)


def detect(gray):
    """回傳 (lp, folds, cp, j0)；folds 是 3 折，每折 5 個 (g0, g1) 欄區間（rot 列座標）"""
    _, ink = gridfit.clean_page(gray)
    rot = np.rot90(ink, 1)
    h, w = rot.shape          # h = 欄方向（原圖 x），w = 字方向（原圖 y）
    rs = rot.sum(axis=1).astype(float)

    # 欄距用自相關量（比 comb 穩，comb 會貼在搜尋範圍邊界）
    rs0 = rs - rs.mean()
    ac = np.correlate(rs0, rs0, 'full')[len(rs0) - 1:]
    lp = float(int(np.argmax(ac[120:400])) + 120)
    if lp <= 0:
        return None

    def blobs(c):
        """這一欄裡有幾個字塊（文字欄約 17；版心只有函號與頁號幾個小字）"""
        b0, b1 = int(max(0, c - lp * 0.42)), int(min(h, c + lp * 0.42))
        prof = rot[b0:b1].sum(axis=0).astype(float)
        if prof.max() <= 0:
            return 0, []
        cut = max(2.0, 0.15 * float(np.median(prof[prof > 0])))
        o, segs, k = prof > cut, [], 0
        while k < len(o):
            if o[k]:
                m = k
                while m + 1 < len(o) and o[m + 1]:
                    m += 1
                if m - k + 1 >= 12:
                    segs.append((k + m) / 2)
                k = m + 1
            else:
                k += 1
        return len(segs), segs

    # 相位：讓格點落在墨最多的位置
    best = (-1.0, 0.0)
    for off in np.arange(0.0, lp, 2.0):
        ctr = np.arange(off, h, lp).astype(int)
        if len(ctr) < 8:
            continue
        s = float(rs[ctr].mean())
        if s > best[0]:
            best = (s, float(off))
    off = best[1]
    slots = [off + k * lp for k in range(40) if off + k * lp < h - lp * 0.2]

    # 分折用使用者給的規則：折與折之間的間距會比行距寬一些。
    # 先把整頁的文字欄排出來，算出相鄰間距，最大的兩個間距就是兩條折線所在；
    # 兩條折線之間正好 5 欄＝一折，折線外側（隔壁折的欄）一律不要。
    cols, gaps, meta = [], [], []
    for c in slots:
        ns, segs = blobs(c)
        if ns >= 8:
            cols.append(c)
            meta.append(segs)
    if len(cols) < FOLD_COLS + 2:
        return None
    diffs = [cols[i + 1] - cols[i] for i in range(len(cols) - 1)]
    order = sorted(range(len(diffs)), key=lambda i: -diffs[i])
    cuts = sorted(order[:2])                      # 兩個最大的間距 = 兩條折線
    # cols 依 rot 列遞增＝原圖由右而左，所以：
    # 折線左側 5 欄、兩折線之間 5 欄、第二條折線右側 5 欄
    folds, segs_all = [], []
    for lo, hi in ((cuts[0] + 1 - FOLD_COLS, cuts[0] + 1),
                   (cuts[0] + 1, cuts[0] + 1 + FOLD_COLS),
                   (cuts[1] + 1, cuts[1] + 1 + FOLD_COLS)):
        if lo < 0 or hi > len(cols) or hi - lo != FOLD_COLS:
            return None
        folds.append(cols[lo:hi])
        for g in range(lo, hi):
            segs_all.extend(np.diff(meta[g]).tolist())
    if len(folds) < FOLDS or len(segs_all) < 8:
        return None
    gaps = segs_all
    if len(folds) < FOLDS or len(gaps) < 8:
        return None
    cp = float(np.median(gaps))

    # 把每折的 5 個欄心換成「每一欄自己的墨跡左右緣」。
    # 用欄心加減固定值裁切會把版心折線（有小字函號與頁號）和隔壁折的最後一行吃進來，
    # 所以邊界要由實際墨跡決定。
    def col_extent(c):
        b0, b1 = int(max(0, c - lp * 0.5)), int(min(h, c + lp * 0.5))
        if b1 <= b0:
            return None
        prof = rs[b0:b1]
        if prof.max() <= 0:
            return None
        m = prof > 0.12 * prof.max()
        if m.sum() < 3:
            return None
        idx = np.arange(b0, b1)[m]
        return float(idx[0]), float(idx[-1])

    fold_ext = []
    for fold in folds:
        ext = [col_extent(c) for c in fold]
        ext = [e for e in ext if e]
        if len(ext) < FOLD_COLS:
            return None
        fold_ext.append(ext)
    folds = fold_ext


    if not (150 <= lp <= 420) or not (0.45 <= cp / lp <= 0.85):
        return None
    if cp * CHARS > 1.0 * gray.shape[1] or cp < 0.2 * lp:
        return None

    # 第一個字心（字方向）：先平滑找起點，再用原始剖面修正
    stack = rot.sum(axis=0).astype(float)
    win = max(3, int(cp * 0.5))
    pad = np.pad(stack, win, mode='edge')
    sm = np.convolve(pad, np.ones(2 * win) / (2 * win), mode='same')[win:win + len(stack)]
    raw = max(4.0, 0.15 * float(np.median(stack[stack > 0])))
    hit = np.where(sm > max(1.0, 0.5 * float(np.median(sm[sm > 0]))))[0]
    if not len(hit):
        return None
    first = int(hit[0])
    for j in range(max(0, first - win), len(stack)):
        if stack[j] > raw:
            first = j
            break
    j0 = first + cp / 2

    # 正文判準：5×17 的格子裡多數要有字（經變圖、牌記不會滿足）
    filled = 0
    centers = [(e[0] + e[1]) / 2 for fold in folds for e in fold]
    for c in centers:
        b0, b1 = int(max(0, c - lp * 0.45)), int(min(h, c + lp * 0.45))
        for k in range(CHARS):
            a0, a1 = int(j0 + (k - 0.45) * cp), int(j0 + (k + 0.45) * cp)
            if a0 < 0 or a1 > rot.shape[1] or a1 <= a0 or b1 <= b0:
                continue
            if rot[b0:b1, a0:a1].sum() >= 20:
                filled += 1
    if filled < 0.6 * len(centers) * CHARS:
        return None
    return lp, folds, cp, j0


def white_out_lines(pil_img):
    """塗掉橫貫整張圖的列（上下的版框線）。

    框線覆蓋約整張寬，而一個字的橫畫最多只占 40% 左右，用 45% 當門檻不會誤刪字畫。
    乾隆藏用的是同一招。
    """
    arr = np.array(pil_img)
    # 彩色輸出：用灰階判斷哪幾列是橫貫的框線（框線覆蓋約整張寬，字的橫畫最多 40%）
    g = np.array(pil_img.convert('L'))
    wide = (g < 160).mean(axis=1) > 0.45
    if not wide.any():
        return pil_img
    grow = np.zeros_like(wide)
    for dd in range(-3, 4):
        grow |= np.roll(wide, dd)
    arr[grow] = 255
    return Image.fromarray(arr)


def cell_centroids(pil_img):
    """五欄各自的墨跡重心（x 方向，相對格心）"""
    a = np.array(pil_img.convert('L')) < 160
    out = []
    for c in range(FOLD_COLS):
        ys, xs = np.nonzero(a[:, c * CELL_W:(c + 1) * CELL_W])
        if len(xs) >= 20:
            out.append(float(xs.mean() - CELL_W / 2))
    return out


files = sorted(glob.glob(os.path.join(src, '*.jpg')))
print('目錄 %s：%d 張圖（跳過前 %d 張書皮／經變圖）' % (os.path.basename(src), len(files), skip))
n_out = 0
for f in files[skip:skip + limit]:
    gray = np.array(Image.open(f).convert('L'))
    r = detect(gray)
    name = os.path.basename(f)[:-4]
    if r is None:
        print('  %s  %dx%d  不是三折 15 欄版式 -> 略過' % (name, gray.shape[1], gray.shape[0]))
        continue
    lp, folds, cp, j0 = r
    page_w, page_h = gray.shape[1], gray.shape[0]
    y0 = max(0, int(round(j0 - cp / 2)))
    y1 = min(page_h, int(round(j0 + (CHARS - 0.5) * cp)))
    img = Image.open(f).convert('RGB')
    for k, fold in enumerate(folds):
        # 一折 5 欄，用均勻格心裁切（維持格內對位）；
        # fold[0] 是最右欄（閱讀順序第一欄），fold[-1] 是最左欄
        # rot 列 i 對應原圖 x = page_w-1-i；取這一折 5 欄墨跡的聯集，兩側各留 0.1 欄距
        m = int(lp * 0.10)
        x_left = max(0, int(round(page_w - (max(e[1] for e in fold) + m))))
        x_right = min(page_w, int(round(page_w - (min(e[0] for e in fold) - m))))

        def cut_fold(xl_, xr_):
            c = img.crop((xl_, y0, xr_, y1)).resize((CELL_W * FOLD_COLS, CELL_H * CHARS), Image.LANCZOS)
            return white_out_lines(c)

        cut = cut_fold(x_left, x_right)
        # 輸出域相位修正：量出五欄重心，整折平移後重切一次（有些頁整排偏 15–25px）
        cs = cell_centroids(cut)
        if cs:
            d = float(np.median(cs))
            scale = (x_right - x_left) / float(CELL_W * FOLD_COLS)
            shift = int(round(d * scale))
            if 0 < abs(shift) < lp * 0.5:
                xl2, xr2 = x_left + shift, x_right + shift
                if xl2 >= 0 and xr2 <= page_w:
                    cut2 = cut_fold(xl2, xr2)
                    cs2 = cell_centroids(cut2)
                    if cs2 and max(abs(v) for v in cs2) < max(abs(v) for v in cs):
                        cut = cut2
        p = os.path.join(out_dir, '%s-f%d.jpg' % (name, k + 1))
        cut.save(p, quality=92)
        n_out += 1
    print('  %s  %dx%d  欄距 %.0f、字距 %.1f -> 3 折（每折 5 欄 x 17 字）' %
          (name, page_w, page_h, lp, cp))
print('輸出 %d 張 -> %s' % (n_out, out_dir))
