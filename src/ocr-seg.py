"""
掃描頁 -> 一行一張圖 + 每行字數。

直排的欄是垂直的：整頁逆時針轉 90 度後欄變成橫列，
由上到下 = 原書由右到左的閱讀順序，每一列由左到右讀。

刻本版面固定（本藏每葉 10 行、每行 17 字），所以用格線擬合，不靠「找白隙」：
  1. 去背二值化（GaussianBlur 相減），避開紙張明暗不均。
  2. 轉正後排除版面邊框（整條長黑線），取出文字區。
  3. 行：橫向投影做 comb 擬合求行距與相位；行距訊號很強。
  4. 字：以「最長行墨跡長度 / 17」定格距（讓它自由擬合會抓到大約 -5% 的倍頻），
     只用 comb 求格線相位，再數每一行有幾格帶墨 -> 每行字數。
輸出 ocr/rows/pNN-LNN.png（二值化、放大 2 倍、留白），給 Windows OCR 逐行辨識。
"""
import glob
import os
import numpy as np
from PIL import Image, ImageFilter, ImageOps

SRC = 'ocr/pages'
OUT = 'ocr/rows'          # 橫排（人看用）
OUT_COLS = 'ocr/cols'     # 直排欄（OCR 用：Windows OCR 對直排中文效果最好）
UPSCALE = 2
CHARS_PER_LINE = 17
os.makedirs(OUT, exist_ok=True)
os.makedirs(OUT_COLS, exist_ok=True)


def ink_mask(gray):
    bg = np.array(Image.fromarray(gray).filter(ImageFilter.GaussianBlur(25))).astype(np.int16)
    return (bg - gray.astype(np.int16)) > 18


def long_line_mask(mask, k, axis):
    """沿 axis 方向連續 k 個以上都是墨 -> 視為格線。

    刻本的四週邊框與版心摺線都是長直線；漢字的橫豎筆畫一個字最多約 70px，
    所以 k 取 200 只會選到格線，不會動到字。
    """
    m = mask if axis == 1 else mask.T
    rows, n = m.shape
    cs = np.zeros((rows, n + 1), dtype=np.int32)
    np.cumsum(m, axis=1, out=cs[:, 1:])
    out = np.zeros_like(m, dtype=bool)
    half = k // 2
    for j in range(half, n - half):
        out[:, j] = (cs[:, j + half + 1] - cs[:, j - half]) >= k
    return out if axis == 1 else out.T


def dilate(mask, r):
    out = mask.copy()
    for s in range(1, r + 1):
        out |= np.roll(mask, s, axis=0) | np.roll(mask, -s, axis=0)
        out |= np.roll(mask, s, axis=1) | np.roll(mask, -s, axis=1)
    return out


def clean_page(gray, k=120, grow=3):
    """去掉刻本格線：回傳（格線塗白的灰階圖, 去線後的墨跡遮罩）。

    k 是「連續多少像素才算格線」。本藏的一個字寬約 68px（最寬的橫畫約 100px），
    而版框在掃描後是斷成一段段的（實測最長約 188px），所以 k 取 120：
    抓得到框線，不會動到字的橫畫。
    裁圖一定要用塗白後的圖；否則格線雖然不參與切行，還是會留在 OCR 的圖裡被讀成「一」。
    """
    ink = ink_mask(gray)
    # 掃描有輕微傾斜，框線在單一列上的連續長度常常不到 k；
    # 先水平膨脹 4px 把斜掉的線接起來，再找長線（字的橫畫約 68px，膨脹後仍遠小於 k）。
    bridged = dilate(ink, 4)
    lines = dilate(long_line_mask(bridged, k, axis=1) | long_line_mask(bridged, k, axis=0), grow)
    gray_clean = gray.copy()
    gray_clean[lines] = 255
    return gray_clean, ink & ~lines


def fit_comb(profile, lo, hi, step=0.25):
    """在 [lo,hi] 找最佳週期與相位：讓格點落在墨跡上（平均墨量最大）"""
    n = len(profile)
    best = (-1.0, lo, 0.0)
    for p in np.arange(lo, hi + 1e-9, step):
        for off in np.arange(0.0, p, 1.0):
            centers = np.arange(off, n, p).astype(int)
            if len(centers) < 4:
                continue
            score = float(profile[centers].mean())
            if score > best[0]:
                best = (score, float(p), float(off))
    return best


summary = []
for path in sorted(glob.glob(f'{SRC}/p*.jpg')):
    page = os.path.basename(path)[:-4]
    gray = np.array(Image.open(path).convert('L'))
    gray_clean, ink_clean = clean_page(gray)
    rot = np.rot90(ink_clean, 1)                # 欄 -> 橫列（已去掉刻本格線）
    rot_gray = np.rot90(gray, 1)                # 裁圖用原始灰階：不做去線，免得誤刪字畫
    H, W = rot.shape

    colsum = rot.sum(axis=0)
    xs = np.where(colsum < 0.75 * H)[0]        # 排除邊框
    cx0, cx1 = int(xs[0]), int(xs[-1]) + 1
    core = rot[:, cx0:cx1]
    core_w = core.shape[1]

    rowsum = core.sum(axis=1).astype(float)
    _, lp, off = fit_comb(rowsum, 85, 120)

    # 刻本固定每葉 10 行。文字區（已去格線）的高度若約等於 10 個行距，
    # 就直接用 10 行均分文字區——墨少的那幾行（卷題、譯者行）才不會被行距外的雜訊濾掉。
    on = rowsum > max(2, int(core_w * 0.02))
    ys = np.where(on)[0]
    if len(ys) and lp > 0 and 8.5 <= (ys[-1] - ys[0] + 1) / lp <= 11.5:
        lp = float(ys[-1] - ys[0] + 1) / 10.0
        centers = [int(ys[0] + lp * (k + 0.5)) for k in range(10)]
    else:
        centers = [c for c in np.arange(off, H, lp).astype(int) if 0 <= c < H]
        centers = [c for c in centers if rowsum[max(0, c - 5):c + 6].sum() > core_w * 3]

    spans = []
    for c in centers:
        y0, y1 = max(0, int(c - lp * 0.40)), min(H, int(c + lp * 0.40))
        nz = np.where(core[y0:y1].sum(axis=0) > 0)[0]
        if len(nz):
            spans.append(int(nz[-1]) - int(nz[0]) + 1)

    # 格距：以「行墨跡長度的第 90 百分位 / 17」為準（用最大值會被雜點拉大）；
    # 只用 comb 求格線相位，不讓它去改格距（自由擬合會抓到大約 -5% 的倍頻）。
    cp = (float(np.percentile(spans, 90)) / CHARS_PER_LINE) if spans else 64.0
    stack = np.zeros(core_w)
    for c in centers:
        y0, y1 = max(0, int(c - lp * 0.40)), min(H, int(c + lp * 0.40))
        stack += core[y0:y1].sum(axis=0)
    best_off, best_ratio = 0.0, 0.0
    for coff in np.arange(0, cp, 1.0):
        ctr = np.arange(coff, core_w, cp).astype(int)
        mid = np.arange(coff + cp / 2, core_w, cp).astype(int)
        if len(ctr) < 8 or len(mid) < 8:
            continue
        ratio = float(stack[ctr].mean() / (stack[mid].mean() + 1e-6))
        if ratio > best_ratio:
            best_ratio, best_off = ratio, float(coff)

    chars_per_line = []
    for i, c in enumerate(centers, 1):
        y0, y1 = max(0, int(c - lp * 0.40)), min(H, int(c + lp * 0.40))
        prof = core[y0:y1].sum(axis=0)
        nz = np.where(prof > 0)[0]
        if len(nz) == 0:
            chars_per_line.append(0)
            continue
        x0, x1 = int(nz[0]), int(nz[-1]) + 1

        # 格點對齊全頁共用格線：x0 是首字左緣，取它右邊第一個格心
        slot0 = best_off + np.ceil((x0 + cp * 0.4 - best_off) / cp) * cp
        sums = []
        k = 0
        while True:
            sc = slot0 + k * cp
            if sc - cp * 0.5 > x1:
                break
            lo, hi = int(max(0, sc - cp * 0.3)), int(min(core_w, sc + cp * 0.3))
            sums.append(int(prof[lo:hi].sum()))
            k += 1
        nz_sums = [s for s in sums if s > 0]
        thr = max(15.0, 0.2 * float(np.median(nz_sums))) if nz_sums else 15.0
        chars_per_line.append(len([s for s in sums if s > thr]))

        # 交叉方向收緊到字身墨跡：行距帶裡常夾到版心的千字文頁碼（「天一」被讀成「一」）
        band = core[y0:y1]
        rowink = band.sum(axis=1)
        nzy = np.where(rowink > 0)[0]
        if len(nzy):
            y0 = y0 + int(nzy[0])
            y1 = y0 + (int(nzy[-1]) - int(nzy[0]) + 1)

        pad = 8
        # 裁圖：x 範圍用「去線後」的墨跡範圍（框線不在裡面，自然被排除），
        # 但像素取自原始灰階（不塗白任何東西，免得誤刪「一一」這種連續橫畫）。
        crop = rot_gray[max(0, y0 - pad):min(H, y1 + pad), max(0, cx0 + x0 - pad):min(W, cx0 + x1 + pad)]
        img = Image.fromarray(crop).resize((crop.shape[1] * UPSCALE, crop.shape[0] * UPSCALE), Image.LANCZOS)
        img.point(lambda v: 0 if v < 140 else 255).save(f'{OUT}/{page}-L{i:02d}.png')
        # OCR 用：轉回直排、保留原始灰階（二值化會切斷細筆畫）、四周補白邊
        # OCR 用：轉回直排、保留原始灰階（二值化會切斷細筆畫）、四周補白邊。
        # 最後把「橫貫整欄」的列塗白——那是格線；一個字的橫畫最多只占全欄寬約 40%，
        # 用 50% 當門檻不會誤刪字畫，也不必去塗掉長橫線（塗了會誤刪「一一」）。
        vimg = Image.fromarray(np.rot90(crop, -1))
        va = np.array(vimg)
        bar = (va < 160).mean(axis=1) > 0.5
        if bar.any():
            va[bar] = 255
            vimg = Image.fromarray(va)
        ImageOps.expand(vimg, border=(40, 60), fill=255).save(f'{OUT_COLS}/{page}-L{i:02d}.png')

    summary.append((page, len(centers), chars_per_line, lp, cp, best_ratio))

print('page lines linepitch charpitch(ratio)  chars_per_line')
for page, n, cpl, lp, cp, cr in summary:
    print(f'{page}   {n:2d}   {lp:5.1f}   {cp:5.1f}({cr:4.1f})   {" ".join(str(c) for c in cpl)}')

allc = [c for s in summary for c in s[2]]
body = [c for s in summary if 'p03' <= s[0] <= 'p38' for c in s[2]]
print(f'\nrows: {sum(s[1] for s in summary)}')
print(f'chars/line all : median {int(np.median(allc))} mean {np.mean(allc):.1f} n={len(allc)}')
print(f'chars/line body: median {int(np.median(body))} mean {np.mean(body):.1f} n={len(body)}')
