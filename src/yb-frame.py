import os
# 批次會同時跑多個 worker，這裡必須限制 numpy/BLAS 的執行緒數，
# 否則 10 個 worker × 多執行緒會互搶，實測反而慢好幾倍。
for _v in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "NUMEXPR_NUM_THREADS"):
    os.environ.setdefault(_v, "1")

"""
永樂北藏切圖（框線／折線版）。

流程照使用者的指示，不用固定值、不用均勻格線外推：
  1. 版框上下內緣 = 貫穿整頁的長橫線 → 文字區高度
  2. 用框線斜率修 skew
  3. 欄（x 方向）：框內欄向墨量分段 → 每一欄的實際範圍
  4. 折線 = 欄序列中最大的兩個「內部間距」（折與折之間比行距寬）
  5. 兩條折線之間、以及折線外側各 5 欄 = 三折
  6. 字（y 方向）：用該折的欄位取字向剖面 → 17 個字心
  7. 「5×17 格子多數有字」驗證正文
裁切邊界一律取「相鄰兩段之間空白的中心」，不碰框線、不碰隔壁折。
輸出彩色 500×1105（每格 100×65）。

用法：python yb-frame.py <頁面目錄> [輸出目錄] [--skip=N] [--limit=N]
"""
import glob
import os
import sys

import io
import math
import numpy as np
from PIL import Image
from PIL import ImageFilter

CHARS = 17
FOLD_COLS = 5
FOLDS = 3
CELL_W, CELL_H = 100, 65

args = [a for a in sys.argv[1:] if not a.startswith('--')]
src = args[0] if args else r'yonglebeizang\0001-001天01\11725711_31'
out_dir = args[1] if len(args) > 1 else 'yb-cuts'
skip = int(next((a.split('=')[1] for a in sys.argv if a.startswith('--skip=')), 1))
limit = int(next((a.split('=')[1] for a in sys.argv if a.startswith('--limit=')), 6))
csv_path = next((a.split('=')[1] for a in sys.argv if a.startswith('--csv=')), '')
KB_FIRST = int(next((a.split('=')[1] for a in sys.argv if a.startswith('--kb-first=')), 100))
KB_REST = int(next((a.split('=')[1] for a in sys.argv if a.startswith('--kb-rest=')), 50))
os.makedirs(out_dir, exist_ok=True)


def save_target(img, path, target_kb):
    """把圖存成大約 target_kb 的 JPEG：二分搜尋品質。

    使用者要求第一折約 100KB、其餘約 50KB。
    """
    lo, hi = 10, 95
    best = None
    for _ in range(8):
        q = (lo + hi) // 2
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=q, optimize=True)
        size = buf.tell() / 1024.0
        if best is None or abs(size - target_kb) < abs(best[2] - target_kb):
            best = (q, buf.getvalue(), size)   # 取最接近目標的一次，不是最後一次
        if size > target_kb:
            hi = q - 1
        else:
            lo = q + 1
        if abs(size - target_kb) <= 0.08 * target_kb:
            break
    q, data, size = best
    with open(path, 'wb') as fh:
        fh.write(data)
    return q, size


def white_out_lines(pil_img):
    """把落在第 1／第 17 格的版框橫線塗白。

    折是 17 等分、幾乎正好填滿框內，所以版框上下緣的橫線只會落在最上／最下一格
    （實測約 1% 的頁折）。框線覆蓋約整張寬，而文字最多的那一列（五欄同時有橫畫）
    實測到 0.46——所以除了「>45% 寬」以外，**還要限定在最上／最下 1.5 格內**，
    否則會在白到文字那一列（實測 81 折裡有 3 折會中）。
    乾隆藏那條線（`pdf-cuts.py`）用的是同一招，但那邊文字列最多只到 34%，不必加這個限制。
    """
    arr = np.array(pil_img)
    g = np.array(pil_img.convert('L'))
    h = g.shape[0]
    band = int(1.5 * CELL_H)
    near = np.zeros(h, dtype=bool)
    near[:band] = True
    near[h - band:] = True
    wide = ((g < 160).mean(axis=1) > 0.45) & near
    if not wide.any():
        return pil_img
    grow = np.zeros_like(wide)
    for dd in range(-3, 4):
        grow |= np.roll(wide, dd)
    arr[grow] = 255
    return Image.fromarray(arr)


def ink_mask(gray):
    bg = np.array(Image.fromarray(gray).filter(ImageFilter.GaussianBlur(25))).astype(np.int16)
    return (bg - gray.astype(np.int16)) > 18


def char_runs_in_range(ink, y0, y1, x0=None, x1=None):
    """在指定 y 範圍內，數「字向」的字塊（回傳 [(a,b)] 段清單）。

    框線抓錯時（頁面有貫穿的直線被當成版框），核心區高度會偏短，17 個字擠不進去。
    這裡用來驗證「這個 y 範圍數不數得出 17 個字」，數不出來就不該用這個框。
    """
    H, W = ink.shape
    y0 = max(0, int(y0)); y1 = min(H - 1, int(y1))
    x0 = 0 if x0 is None else max(0, int(x0))
    x1 = W if x1 is None else min(W, int(x1))
    if y1 <= y0 or x1 <= x0:
        return []
    band = ink[y0:y1 + 1, x0:x1].sum(axis=1).astype(float)
    if band.max() <= 0:
        return []
    best = []
    for thr in (0.20, 0.15, 0.25, 0.30, 0.10, 0.35, 0.40):
        rr = clean_runs(runs(band > thr * band.max(), 5))
        if len(rr) == CHARS:
            return rr
        if abs(len(rr) - CHARS) < abs(len(best) - CHARS):
            best = rr
    return best


def frame_height_ok(ink, y0f, y1f, x0=None, x1=None):
    """框高是否裝得下 17 個字——用「字距」判斷，而不是只數字塊數。

    為什麼不能只數：實測 0001-063 p0008，錯誤的框（548..2105，高 1557）也剛好能
    湊出 17 段，數字上「剛好 17」照樣會通過。但那種框的字距只有 91px，
    而同一頁欄寬約 212px（＝3400/16 欄），明代刻本的字距和欄寬同級（約 120~140），
    所以「框高 ÷ 17」明顯小於欄寬（<0.75 倍）就是框抓錯了。

    回傳 (ok, char_pitch, col_pitch)。
    """
    H, W = ink.shape
    y0f = max(0, int(y0f)); y1f = min(H - 1, int(y1f))
    if y1f <= y0f:
        return False, 0.0, 0.0
    rr = char_runs_in_range(ink, y0f, y1f, x0, x1)
    if len(rr) >= 2:
        centers = [(a + b) / 2.0 for a, b in rr]
        cp = (centers[-1] - centers[0]) / (len(centers) - 1)
    else:
        cp = (y1f - y0f) / float(CHARS)
    # 欄距：這一頁是 16 欄（永樂北藏正文每葉 16 欄），框又幾乎橫跨全寬，
    # 所以「框寬 ÷ 16」就是可靠的欄距（實測 3400/16 = 212.5）。
    # 先前用「框內有墨的欄」去估，會抓到欄內的筆畫而低估成 82（於是守門失效）。
    band = ink[y0f:y1f + 1]
    lp = band.shape[1] / 16.0 if band.shape[1] > 0 else 0.0
    return (lp <= 0 or cp >= 0.75 * lp), cp, lp


def best_y_range(ink, y0f, y1f, x0=None, x1=None):
    """回傳 (y0f, y1f, 字塊數)。框高不對（字距明顯小於欄寬）或數不到 17 個字，
    就把 y 範圍往外擴再試。

    往上下各擴 16%/32%/50%/70% 框高（框線誤判時真正的文字區通常就在框外一點），
    取第一個「字距合理且剛好 17 個字」的範圍；都不行就回傳原本的框。
    """
    H = ink.shape[0]
    ok, _cp, _lp = frame_height_ok(ink, y0f, y1f, x0, x1)
    rr0 = char_runs_in_range(ink, y0f, y1f, x0, x1)
    if ok and len(rr0) == CHARS:
        return y0f, y1f, len(rr0)
    h = max(1, y1f - y0f)
    for grow in (0.16, 0.32, 0.50, 0.70):
        for ny0, ny1 in ((max(0, int(y0f - grow * h)), min(H - 1, int(y1f + grow * h))),
                         (max(0, int(y0f - grow * h)), y1f),
                         (y0f, min(H - 1, int(y1f + grow * h)))):
            if (ny0, ny1) == (y0f, y1f):
                continue
            ok2, _c, _l = frame_height_ok(ink, ny0, ny1, x0, x1)
            rr = char_runs_in_range(ink, ny0, ny1, x0, x1)
            if ok2 and len(rr) == CHARS:
                return ny0, ny1, len(rr)
    return y0f, y1f, len(rr0)



    out, i = [], 0
    while i < len(on):
        if on[i]:
            j = i
            while j + 1 < len(on) and on[j + 1]:
                j += 1
            if j - i + 1 >= minlen:
                out.append((i, j))
            i = j + 1
        else:
            i += 1
    return out


def text_extent_y(ink, frame_top, frame_bot, fx0, fx1, thr=0.25):
    """量「文字真正的上下緣」（原圖 y），或回 None。

    為什麼需要：字心是用**高門檻**（0.20~0.35）的段落擬合的，會漏掉很淡的
    起筆／收筆。實測 0001-063 p0008 框內剖面：

        門檻 0.40 → 190..2214  ← 目前裁切框 190..2223 就是照這個擬合的
        門檻 0.30 → 188..2225
        門檻 0.25 → 181..2233  ← 文字實際範圍
        門檻 0.20 → 130..2237  ← 130 已是版框線，太寬

    兩個關鍵的排除動作（不做就會暴衝到整頁 0..H，實測過三次）：
      1. **只數「文字欄」**：x 限制在欄心 ± 0.5 欄距，不含摺線／版框花紋。
      2. **排除版框線那一列**：版框線在剖面上是最大值附近的尖峰。
         所以先取整個框算門檻，再把「貼著框線」的列（+/-4px 帶）從候選中剔除。
    """
    H, W = ink.shape
    a = int(max(0, frame_top)); b = int(min(H, frame_bot))
    x0 = int(max(0, fx0)); x1 = int(min(W, fx1))
    if b - a < 20 or x1 - x0 < 4:
        return None
    prof = ink[a:b, x0:x1].sum(axis=1).astype(float)
    if prof.max() <= 0:
        return None
    # 門檻基準用**第 90 百分位**，不是 max：框線／污點在剖面上是離群的尖峰，
    # 用 max 當基準會把門檻抬得過高而什麼都數不到，或反之讓尖峰主導（實測 frame 被
    # 放寬到整頁 0..2399 時，max 就是框線，0.20×max 完全失效）。
    base = float(np.percentile(prof, 90))
    if base <= 0:
        base = float(prof.max())
    on = prof > thr * base
    # 把貼著上下框線的列剔除（框線本身畫在框的內緣）
    for edge in (int(frame_top), int(frame_bot)):
        for d in range(-5, 6):
            k = edge + d - a
            if 0 <= k < len(on):
                on[k] = False
    idx = np.where(on)[0]
    if not len(idx):
        return None
    return a + int(idx[0]), a + int(idx[-1]) + 1


def runs(on, minlen=1):
    """把布林序列切成連續為真的區段 [(a, b)]，只留長度 >= minlen 的。"""
    out, i = [], 0
    while i < len(on):
        if on[i]:
            j = i
            while j + 1 < len(on) and on[j + 1]:
                j += 1
            if j - i + 1 >= minlen:
                out.append((i, j))
            i = j + 1
        else:
            i += 1
    return out


def clean_runs(rr, lo_frac=0.40, hi_frac=1.7, merge_frac=0.02):
    """濾掉雜訊窄段，再合併被切開的字。

    直接用中位寬過濾會失敗：雜訊段（1–14px）數量多，會把中位寬拉低，
    反而把真正的字（約 110px）濾掉。
    """
    if not rr:
        return []
    wmax = max(b - a + 1 for a, b in rr)
    keep = [r for r in rr if lo_frac * wmax <= r[1] - r[0] + 1 <= hi_frac * wmax]
    if not keep:
        return []
    wm = float(np.median([b - a + 1 for a, b in keep]))
    out = [keep[0]]
    for r in keep[1:]:
        if r[0] - out[-1][1] <= merge_frac * wm:
            out[-1] = (out[-1][0], r[1])
        else:
            out.append(r)
    return out


def analyze(gray, src_name='', W0=0, H0=0):
    ink = ink_mask(gray)
    H, W = ink.shape

    # ---- 1. 版框上下內緣 ----
    rowfrac = ink.mean(axis=1)
    hl = [r for r in runs(rowfrac > 0.5, 2) if r[0] > 15 and r[1] < H - 15]
    if len(hl) < 2:
        return None, 'no frame'
    top, bot = hl[0], hl[-1]
    if bot[0] - top[1] < 0.5 * H:
        return None, 'frame too short'
    # 記住**原始框線**的內緣：後面 6b 可能把框放寬到整頁，
    # 但「量文字真正的上下緣」必須針對原始框（否則量到的是整頁，包含頁面邊緣暗帶）。
    orig_ft, orig_fb = top[1] + 1, bot[0] - 1

    # ---- 2. skew：用上框線的斜率 ----
    band0, band1 = max(0, top[0] - 20), min(H, top[1] + 20)
    xs = np.arange(int(W * 0.1), int(W * 0.9), max(1, W // 60))
    ys = []
    for x in xs:
        idx = np.where(ink[band0:band1, x])[0]
        ys.append(idx.mean() + band0 if len(idx) else np.nan)
    ys = np.array(ys, dtype=float)
    ok = ~np.isnan(ys)
    if ok.sum() < 10:
        return None, 'skew unmeasurable'
    ang = float(np.degrees(np.arctan(float(np.polyfit(xs[ok], ys[ok], 1)[0]))))
    if abs(ang) > 5:
        return None, 'skew too large'
    if abs(ang) > 0.05:
        gray = np.array(Image.fromarray(gray).rotate(ang, resample=Image.BICUBIC, fillcolor=255))
        ink = ink_mask(gray)
        rowfrac = ink.mean(axis=1)
        hl = [r for r in runs(rowfrac > 0.5, 2) if r[0] > 15 and r[1] < H - 15]
        # 轉正會重新取樣，框線可能就抓不到了。上面（未轉正）有守門，這裡漏了，
        # 後果是 IndexError 讓整個 yb-frame.py 當掉：該卷 CSV 沒寫成、後面幾頁也沒切
        # （實測全藏 23 卷中招，含 0084-074、0117-002、1113-035）。
        if len(hl) < 2:
            return None, 'no frame after rotate'
        top, bot = hl[0], hl[-1]

    y0f, y1f = top[1] + 1, bot[0] - 1
    core = ink[y0f:y1f + 1]                    # (y, x)
    Hc, Wc = core.shape

    # ---- 3. 欄：x 方向的墨量分段 ----
    colprof = core.sum(axis=0).astype(float)   # 長度 Wc
    if colprof.max() <= 0:
        return None, 'no ink'
    cr = runs(colprof > max(2.0, 0.10 * colprof.max()), 3)
    if not cr:
        return None, 'no column runs'
    cw = float(np.percentile([b - a + 1 for a, b in cr], 75))   # 用第 75 百分位：窄的界行線會把中位數拉低，卷首頁因此湊不到 15 欄

    def yprof(x0, x1):
        return core[:, int(max(0, x0)):int(min(Wc, x1))].sum(axis=1).astype(float)

    # 摺線（版心的長直線）：貫穿整個框高、而且很窄。版框的花紋比它寬，不算。
    # 不能只看墨量：字的長豎畫在這一欄也能累積到 0.4 框高（實測），
    # 但它的墨是斷斷續續的（最長一段只有 0.05 框高），摺線則是一路貫穿。
    # 門檻取 0.08 框高：實測文字欄最長只到 0.065，磨損的摺線仍有 0.08~0.12。
    def longest_run_at(x):
        p = np.concatenate(([False], core[:, x], [False]))
        d = np.flatnonzero(p[1:] != p[:-1])
        return int((d[1::2] - d[::2]).max()) if len(d) >= 2 else 0

    line_runs = []
    for a, b in runs(colprof > 0.35 * Hc, 1):
        if (a + b) / 2.0 < 0.02 * Wc or (a + b) / 2.0 > 0.98 * Wc:
            continue                        # 掃描頁緣／書皮邊，不是摺線
        if b - a + 1 > max(6, 0.3 * cw):
            continue                        # 太寬的是一片花紋，不是線
        if max(longest_run_at(x) for x in range(a, min(b + 1, a + 12))) < 0.08 * Hc:
            continue                        # 只是一欄裡斷斷續續的長豎畫
        if line_runs and a - line_runs[-1][1] < 2.0 * cw:
            # 兩條摺線相隔一折（約 5 欄），不可能只差 2 欄寬；靠這麼近的是同一條線
            # 被磨損切成兩段，或是小字音釋的界行線，一律併成一條。
            line_runs[-1] = (line_runs[-1][0], b)
        else:
            line_runs.append((a, b))

    def on_fold_line(a, b):
        return any(not (b < la or a > lb) for la, lb in line_runs)

    def is_text_col(sa, sb):
        """這一段像不像一個「文字欄」：要有字塊，而且不能是一整條連續的墨。

        版框的花紋、版心的摺線都會被墨量分段切成跟欄一樣寬的段，
        但沿字方向是連續不斷的紋樣（花紋）或一條貫穿的長線（摺線），
        而文字欄的墨是一個個分開的字塊（最長的一段就是一個字的高度）。
        使用者指定：切開後的子段要先通過這一關才准當候選欄，
        否則右緣的花紋會混進「最右 5 欄」，第一折就整折切歪。
        """
        pad = max(0, int((0.6 * cw - (sb - sa + 1)) / 2))     # 太窄的段補寬一點再判斷
        prof = yprof(sa - pad, sb + 1 + pad)
        if prof.max() <= 0:
            return False
        rr = runs(prof > 0.15 * prof.max(), 8)
        if not rr:
            return False                       # 字塊數 0
        if max(b - a + 1 for a, b in rr) > 0.25 * Hc:
            return False                       # 連續紋樣／貫穿的長線
        return True

    # 過寬的段要「切開」而不是丟掉：卷首的經題欄（例如「二經同卷」「佛說法律三昧經」
    # 「佛說十善業道經」）字大又靠得近，會被黏成一段（實測 177px，約 2~3 欄），
    # 先前因為超過 1.7 倍上限被整段濾掉，於是再也找不到最右欄，第一折就左移成正文。
    # 多經合在一卷時，卷首的經題欄更多，這個情況更明顯。
    # 經題欄比正文欄窄得多（實測正文 121px、經題約 59px），
    # 用 round(wd/cw) 會算成 1（177/121=1.46）等於沒切，所以用向上取整、
    # 且以 0.6 倍欄寬當「一欄至少要有多寬」的保守估計。
    # 只有「明顯過寬」的段才是多欄被黏在一起（經題欄約 59px，正文欄約 121px）。
    # 界線取 1.3 倍：單一正文欄不會被切開；177px 的經題段會切成 3 欄。
    colruns = []
    for a, b in cr:
        wd = b - a + 1
        if wd < 0.4 * cw:
            continue                        # 界行線之類的窄段丟掉
        n = 1 if wd <= 1.3 * cw else max(2, int(round(wd / (0.5 * cw))))
        if n == 1:
            if on_fold_line(a, b) and not is_text_col(a, b):
                continue                    # 摺線本身（版心的長直線＋小字函號）不是欄
            colruns.append((a, b))
            continue
        step = wd / float(n)
        for k in range(n):
            sa, sb = int(a + k * step), int(a + (k + 1) * step) - 1
            if sb < sa:
                continue
            if is_text_col(sa, sb):         # 切開的子段要驗證是文字欄
                colruns.append((sa, sb))
    if len(colruns) < FOLD_COLS + 2:
        return None, 'too few columns (%d)' % len(colruns)
    cents = [(a + b) / 2 for a, b in colruns]

    gaps_all = np.diff(cents)
    page_pitch = float(np.median(gaps_all)) if len(gaps_all) else cw * 1.5
    keep_g = gaps_all[(gaps_all > 0.7 * page_pitch) & (gaps_all < 1.4 * page_pitch)]
    if len(keep_g) >= 3:                    # 去掉版心的大間距與切開子段的窄間距再取一次
        page_pitch = float(np.median(keep_g))

    def nblobs(xc):
        """這一欄沿字方向（y）有幾個字塊：正文約 17，折線上的小字只有幾個"""
        w0 = max(2, int(cw * 0.35))
        x0, x1 = int(max(0, xc - w0)), int(min(Wc, xc + w0))
        prof = core[:, x0:x1].sum(axis=1).astype(float)
        if prof.max() <= 0:
            return 0
        return sum(1 for a, b in runs(prof > 0.15 * prof.max(), 8))

    nb = [nblobs(c) for c in cents]
    med_nb = float(np.median([v for v in nb if v > 0]))

    # ---- 5. 三折：兩條摺線之間＝一折（5 欄） ----
    # 折界用「貫穿框內的摺線」定，不用猜：摺線是版面自己的尺規（實測每頁都有，
    # 間距 1000±25px＝5 欄）。卷首那一折有兩個空欄、根本沒有墨，
    # 用「最大的欄心間距」推折界會把隔壁折的正文欄吃進來。
    fold_spans = []
    if len(line_runs) >= 2:
        lcent = [(a + b) / 2.0 for a, b in line_runs]
        # 一折＝5 欄。欄數本身不可靠（雙行小字會把子欄算成欄、磨損的欄會漏檢），
        # 所以用幾何線索：一折 ≈ 5 行 × 行距，而 17 個字填滿框高，
        # 實測行距 ≈ 1.66 × 字距 → 折寬 ≈ 5 × 1.66 × 框高/17 ≈ 0.47 × 框高
        # （全庫實測 1008/2145 = 0.470；行距/字距 1.5~1.9 都還不會取整到別的折數）。
        us = []
        for i in range(len(lcent) - 1):
            g = lcent[i + 1] - lcent[i]
            us.append(g / max(1.0, round(g / (0.47 * Hc))))
        unit = float(np.median(us))
        if unit >= 2.5 * cw:                  # 一折至少幾欄寬；比這窄的不是折界
            k0 = [round((c - lcent[0]) / unit) for c in lcent]
            # 只抓到兩條摺線也能成鏈：間距用「中間有幾欄」換算成一個折的寬度
            if min(k0) == 0 and len(set(k0)) == len(k0) and max(k0) >= 1:
                kk = np.array(k0, dtype=float)
                A = np.vstack([kk, np.ones_like(kk)]).T
                s_fit, b_fit = np.linalg.lstsq(A, np.array(lcent), rcond=None)[0]
                if 0.6 * unit <= s_fit <= 1.5 * unit:
                    edges = []
                    k = int(np.ceil((0.0 - b_fit) / s_fit))
                    while True:
                        x = b_fit + k * s_fit
                        if x >= Wc:
                            break
                        if x > 0:
                            near = min(line_runs, key=lambda r: abs((r[0] + r[1]) / 2.0 - x))
                            snapped = abs((near[0] + near[1]) / 2.0 - x) <= 0.25 * s_fit
                            edges.append((x, near if snapped else None))
                        k += 1
                    fold_spans = [((edges[i][0], edges[i][1]), (edges[i + 1][0], edges[i + 1][1]), None)
                                  for i in range(len(edges) - 1)
                                  if 0.75 * s_fit <= edges[i + 1][0] - edges[i][0] <= 1.25 * s_fit]
                    # 鏈推出來的折太寬或太窄＝摺線間距換算錯了，退回下面的保守做法
                    wref = Wc / float(FOLDS)
                    if any(not 0.4 * wref <= sp[1][0] - sp[0][0] <= 1.6 * wref for sp in fold_spans):
                        fold_spans = []
    if len(fold_spans) < FOLDS:
        # 退路：摺線抓不到時，用「最大的兩個內部間距」當折界（界在兩欄中間的空隙）。
        gaps = [cents[i + 1] - cents[i] for i in range(len(cents) - 1)]
        inner = sorted(range(1, len(cents) - 2), key=lambda i: -gaps[i])[:2]
        if len(inner) < 2:
            return None, 'no inner gaps'
        typical = float(np.median(gaps))
        if min(gaps[inner[0]], gaps[inner[1]]) < 1.15 * typical:
            return None, 'fold gap not wider than line pitch'
        bounds = [0.0] + [(cents[i] + cents[i + 1]) / 2.0 for i in sorted(inner)] + [float(Wc)]
        fold_spans = [((bounds[i], None), (bounds[i + 1], None), None)
                      for i in range(len(bounds) - 1)]
        # 摺線抓不到、只能靠猜時，折寬必須和「一折 ≈ 0.47 × 框高」相符；
        # 卷末的音釋頁（小字雙行＋大印章）欄被切得很細，這裡一定推出離譜的折界，
        # 寧可判成非標準版面，也不要寫下一定切錯的座標（音釋本來就不是正文）。
        fw = 0.47 * Hc
        if any(not 0.65 * fw <= (sp[1][0] - sp[0][0]) <= 1.5 * fw for sp in fold_spans):
            return None, 'fold span implausible'
    if len(fold_spans) < FOLDS:
        return None, 'fold out of range'
    fold_spans = fold_spans[-FOLDS:]        # 只要最右邊三折（＝閱讀順序的前三折）

    # ---- 6b. 框線守門 ----
    # 頁面若有貫穿的直線（摺痕、水漬、版心長線）被當成版框，框高會偏短，
    # 17 個字擠不進去——就是「每行前幾個字被切掉」的原因（實測 0001-063 p0008：
    # 框高 1557 vs 鄰頁 2014~2077）。
    # 所以：框內數不到 17 個字，就把 y 範圍往外擴再數；取數到最接近 17 個字的那個範圍。
    y0f2, y1f2, _nch = best_y_range(ink, y0f, y1f)
    if (y0f2, y1f2) != (y0f, y1f):
        y0f, y1f = y0f2, y1f2
        core = ink[y0f:y1f + 1]
        Hc, Wc = core.shape
    # 差 1 段不算失败：卷首頁（經題／譯者／品題那幾欄字距不均）常少一段，
    # 下面 6c 會做併／切微調。差太多（>1）才是版面破碎，整頁略過。
    if abs(_nch - CHARS) > 1:
        return None, 'char count %d != %d after widening' % (_nch, CHARS)

    # ---- 6. 字心：整頁取一次 ----
    # 不能每折各自切：卷首那折是標題欄（只有幾個字），剖面本來就湊不到 17 段。
    # 整頁框內全寬的剖面一定齊，取到的 17 個字心三折共用。
    band_all = core.sum(axis=1).astype(float)
    if band_all.max() <= 0:
        return None, 'no band'
    cc = None
    bestn, best_runs = 0, []
    for thr in (0.20, 0.15, 0.25, 0.30, 0.10, 0.35):
        rr = clean_runs(runs(band_all > thr * band_all.max(), 5))
        if len(rr) == CHARS:
            cc = [(a + b) / 2 for a, b in rr]
            break
        if len(rr) > bestn:
            bestn, best_runs = len(rr), rr
    if cc is None and best_runs:
        # 湊不到剛好 17 段就主動調整：多則併最接近的一對，少則把最寬的一段切兩半。
        # 卷首頁（經題／譯者／品題那幾欄字距不均）常少一段，先前直接判退、整頁丟失，
        # 結果「大般若波羅蜜多經卷第X」那一頁就不見了。
        rr = list(best_runs)
        while len(rr) > CHARS:
            k = min(range(len(rr) - 1), key=lambda i: rr[i + 1][0] - rr[i][1])
            rr[k] = (rr[k][0], rr[k + 1][1])
            del rr[k + 1]
        while 0 < len(rr) < CHARS:
            k = max(range(len(rr)), key=lambda i: rr[i][1] - rr[i][0])
            a, b = rr[k]
            m = (a + b) // 2
            rr[k] = (a, m)
            rr.insert(k + 1, (m + 1, b))
        if len(rr) == CHARS:
            cc = [(a + b) / 2 for a, b in rr]
    if cc is None:
        return None, 'char split failed: %d chars' % bestn

    # ---- 6c. 字心守門（真正的關鍵）----
    # 上面的框線守門只看「框夠不夠高」，但實測 0001-063 p0008：框高 2117 明明夠，
    # 字心卻被擬合到一小段（字距 93.7，而同一頁欄距是 212）——於是裁切框只有 1557 高，
    # 17 個字塞不下，上下各被切掉。所以**必須直接檢查字距**：
    # 明代刻本的字距和欄距同級（約 0.5~0.7 倍），字距 < 0.45 倍欄距就是擬合錯了。
    # 處理方式：把 y 範圍往外擴再重新擬合字心，仍不對就整頁略過（寧可少切，不要切錯）。
    #
    # 已知例外：**雙行小字版面**（實測 0020-071 全卷 56 頁）。
    # 那種頁行內是「並排兩段短句」，字向剖面只切得出 9~11 段，永遠湊不到 17，
    # 所以整卷會被這裡略過。`_q2/recut_yb.py` 對此有保護：整卷 0 折時會還原
    # `yb-out-prefix` 的舊輸出，不會讓該卷變成空的。要真正支援雙行版需要另外的
    # 切法（目前尚未實作）。
    def _col_pitch(core_shape_w):
        return core_shape_w / 16.0

    def _fit_cc(band):
        bn, br = 0, []
        for thr in (0.20, 0.15, 0.25, 0.30, 0.10, 0.35):
            rr = clean_runs(runs(band > thr * band.max(), 5))
            if len(rr) == CHARS:
                return [(a + b) / 2 for a, b in rr]
            if len(rr) > bn:
                bn, br = len(rr), rr
        if not br or abs(len(br) - CHARS) > 1:
            return None
        rr = list(br)
        while len(rr) > CHARS:
            k = min(range(len(rr) - 1), key=lambda i: rr[i + 1][0] - rr[i][1])
            rr[k] = (rr[k][0], rr[k + 1][1]); del rr[k + 1]
        while 0 < len(rr) < CHARS:
            k = max(range(len(rr)), key=lambda i: rr[i][1] - rr[i][0])
            a, b = rr[k]; m = (a + b) // 2
            rr[k] = (a, m); rr.insert(k + 1, (m + 1, b))
        return [(a + b) / 2 for a, b in rr] if len(rr) == CHARS else None

    for grow in (0.0, 0.16, 0.32, 0.50, 0.70):
        if grow > 0:
            ny0 = max(0, int(y0f - grow * (y1f - y0f)))
            ny1 = min(H - 1, int(y1f + grow * (y1f - y0f)))
            if (ny0, ny1) == (y0f, y1f):
                continue
            y0f, y1f = ny0, ny1
            core = ink[y0f:y1f + 1]
            Hc, Wc = core.shape
            band_all = core.sum(axis=1).astype(float)
            if band_all.max() <= 0:
                return None, 'no band'
            cc2 = _fit_cc(band_all)
            if cc2 is not None:
                cc = cc2
        cp_cc = (cc[-1] - cc[0]) / (CHARS - 1)
        span_cc = cc[-1] - cc[0]
        lp_now = _col_pitch(Wc)
        # 不只要字距合理，**總跨度也要夠**：17 個字的跨度至少要有 9 倍欄距。
        # 門檻校準：正常頁實測 4000/16=212.5 欄距 ↔ 跨度 ~2064（＝9.7×）；
        # 中招頁 0001-034 p0002 跨度只有 1538（＝7.2×，等於只塞得下 13 個字）。
        if cp_cc >= 0.45 * lp_now and span_cc >= 9.0 * lp_now:
            break
    else:
        return None, 'char span %.0f too small (cp %.1f, col %.1f)' % (span_cc, cp_cc, lp_now)

    # ---- 7. 一折的裁切框：折寬＝該折欄距 × 5，五格等分 ----
    # 使用者規格：「空欄和有字的欄一樣寬」。所以折寬取這一折自己的欄距 × 5、五格等分；
    # 右緣停在最後一個真文字欄的右緣（＝格子邊界），不會切進版框花紋或摺線。
    folds = []
    for (xL, lrun), (xR, rrun), forced in fold_spans:
        inside = forced if forced is not None else [i for i, c in enumerate(cents) if xL <= c <= xR]
        if not inside:
            return None, 'empty fold range'
        cs = [cents[i] for i in inside]
        w = max(1.0, xR - xL) / FOLD_COLS
        if len(cs) > FOLD_COLS:
            # 欄被切得比 5 欄還細（卷末小字、界行線），欄距不可信，用摺線的格寬
            pitch_f = w
        elif len(cs) >= 3:
            pitch_f = (cs[-1] - cs[0]) / (len(cs) - 1)
        else:
            pitch_f = page_pitch
        pitch_f = float(min(max(pitch_f, 0.85 * w), 1.15 * w))
        # 把這一折的欄放進最接近的格，再整格平移，讓五格對準五欄
        slots = [min(max(int(round((c - xL) / w - 0.5)), 0), FOLD_COLS - 1) for c in cs]
        phi = float(np.median([c - pitch_f * (s + 0.5) for c, s in zip(cs, slots)]))
        x_left = max(0.0, phi)
        x_right = min(float(Wc), phi + FOLD_COLS * pitch_f)
        if lrun is not None:                # 不切進左邊的摺線
            x_left = max(x_left, lrun[1] + 2)
        if rrun is not None:                # 不切進右邊的摺線（版框花紋就在摺線外）
            x_right = min(x_right, rrun[0] - 2)
        x_left = max(x_left, xL)            # 也不超出這一折的範圍（否則兩折會重疊）
        x_right = min(x_right, xR)
        if x_right - x_left < 2.5 * pitch_f:
            return None, 'fold too narrow'
        cell = (x_right - x_left) / FOLD_COLS
        edges = [x_left + cell * k for k in range(FOLD_COLS + 1)]
        # cc 是在「框內」座標系算的（core = ink[y0f:y1f+1]），裁切要加回框內原點 y0f，
        # 否則整折會往下偏（實測第 1 列重心偏 +17~+30px）
        y_top = int(max(0, y0f + cc[0] - (cc[1] - cc[0]) / 2))
        y_bot = int(min(H, y0f + cc[-1] + (cc[-1] - cc[-2]) / 2))
        folds.append({'cols': inside, 'x': (int(round(x_left)), int(round(x_right))),
                      'edges': edges,
                      'cells': [x_left + cell * (k + 0.5) for k in range(FOLD_COLS)],
                      'pitch': pitch_f, 'y': (y_top, y_bot)})

    # 裁切框的寬度也要和一折的幾何相符（0.7~1.3 × 0.47 × 框高）。
    # 捲末音釋頁偶爾會通過前面的檢查、卻被摺線夾成一個很窄的框（實測 498/995），
    # 那種圖字會被壓扁，不如整頁略過。
    fold_w_ref = 0.47 * Hc
    if any(not 0.7 * fold_w_ref <= (f['x'][1] - f['x'][0]) <= 1.3 * fold_w_ref for f in folds):
        return None, 'fold width implausible'

    # ---- 7b. 淡筆畫複驗：把裁切框撐到文字真正的上下緣 ----
    # 字心是用**高門檻**（0.20~0.35）的段落擬合的，會漏掉很淡的起筆／收筆，
    # 於是「字數正確、頂邊底邊卻切掉單字的一部份」。
    # 實測 0001-063 p0008：裁切框 190..2223，而文字實際到 154..2238。
    # 使用者已同意：**寧可把版框線一起包進來，也不要切到文字**。
    #
    # 量測要點（前四次都失敗的教訓）：
    #   1. 用**原始框線內緣**（`orig_ft/orig_fb`）量，不是被 6b 放寬後的框
    #      —— 放寬到整頁時剖面會被紙張邊緣暗帶主導。
    #   2. x 只取「這一折 5 個欄心 ± 0.5 欄距」，不含摺線／版框花紋。
    #   3. 門檻基準用第 90 百分位（不是 max —— 框線是離群尖峰）。
    pitch_c = max(1.0, (y1f - y0f) / float(CHARS))
    xs = [(c - 0.5 * pitch_c, c + 0.5 * pitch_c) for f in folds for c in f['cells']]
    if xs:
        fx0 = int(max(0, min(a for a, _ in xs)))
        fx1 = int(min(W, max(b for _, b in xs)))
        ext = text_extent_y(ink, orig_ft, orig_fb, fx0, fx1, thr=0.20)
        # 安全閥：只接受「與框同量級」的結果，防止剖面失控變成整頁。
        # 上限放到 1.15 ⇒ 允許結果略大於框（也就是容許把框線包進來）。
        if ext is not None:
            _fh = float(orig_fb - orig_ft)
            if not (0.4 * _fh <= (ext[1] - ext[0]) <= 1.20 * _fh):
                ext = None
        if ext is not None:
            # 再留一點安全邊（0.12 字）：實測 016.jpg 即使撐到量測到的範圍，
            # 最後一列仍貼在最下列（墨量 0.32），因為淡筆畫比門檻再外面一點。
            # 使用者已同意「寧可包進框線，也不要切到文字」，所以這裡給足。
            _m = int(round(0.12 * pitch_c))
            et, eb = max(0, ext[0] - _m), min(H, ext[1] + _m)
            for f in folds:
                a, b = f['y']
                f['y'] = (min(a, et), max(b, eb))
            # 裁切框變了，字心要跟著重新分佈（`row0..row16` 是「這一折 17 格的中心」）
            ny0 = min(f['y'][0] for f in folds)
            ny1 = max(f['y'][1] for f in folds)
            step = (ny1 - ny0) / float(CHARS)
            cc = [ny0 + step * (k + 0.5) for k in range(CHARS)]

    # ---- 8. 正文驗證 ----
    # 破損記錄（水淹、蟲蛀）：照正常版面切，但要把可疑的頁記下來。
    # 三個便宜但具體的指標：
    #   short_cols：字塊數明顯偏少的欄數（缺字／糊掉）
    #   dark_frac ：框內「很暗」的像素比例（水漬、霉斑）
    #   frame_gaps：上下框線的斷裂處數（紙張破損、裁切不良）
    dark_frac = 0.0
    paper_med = 255.0
    band = gray[y0f:y1f + 1]
    if band.size:
        dark_frac = float((band < 80).mean())
        paper_med = float(np.median(band))
    gap_count = 0
    for rr in (top, bot):
        if rr[1] < rr[0]:
            continue
        line = ink[rr[0]:rr[1] + 1].mean(axis=0) > 0.5
        i = 0
        while i < len(line):
            if not line[i]:
                j = i
                while j + 1 < len(line) and not line[j + 1]:
                    j += 1
                if j - i + 1 >= 25:          # 連續 25px 以上的空白＝斷裂
                    gap_count += 1
                i = j + 1
            else:
                i += 1
    short_cols = sum(1 for v in nb if v < 12)
    # 使用者定義：只有「格子內有缺漏字」才算破損，框線斷裂不算。
    # 所以破損與否由 5×17 的空格數決定（下面 filled 算完才知道）。

    filled = 0
    pitch = cc[1] - cc[0]
    for fold in folds:
        xe = fold['edges']
        for k in range(CHARS):
            y0 = int(max(0, cc[k] - 0.45 * pitch))
            y1 = int(min(Hc, cc[k] + 0.45 * pitch))
            if y1 <= y0:
                continue
            # 5×17 的每一格都量：五格等分，空格也算一格（不能拿偵測到的欄來數，
            # 一欄被切成好幾段時會重複計算）
            for c in range(FOLD_COLS):
                x0, x1 = int(xe[c]), int(min(Wc, xe[c + 1]))
                if x1 > x0 and core[y0:y1, x0:x1].sum() >= 20:
                    filled += 1
    total = FOLDS * FOLD_COLS * CHARS
    empty_cells = total - filled
    # 缺漏字：一般正文頁實測 0 格；卷首頁（經題／譯者／品題欄）天然有 8~12 格，
    # 所以門檻提高到 15 格，才不會把每一卷的卷首都誤標成破損。
    damaged = empty_cells >= 15
    if filled < 0.6 * total:
        return None, 'not main text (%d/%d)' % (filled, total)

    return {
        'src_file': src_name, 'src_w': W0, 'src_h': H0,
        'ang': ang, 'y0': y0f, 'y1': y1f, 'folds': folds, 'cw': cw,
        'filled': filled, 'total': total, 'colruns': colruns,
        'n_lines': len(line_runs), 'med_blobs': med_nb,
        'frame_y': (top, bot), 'cc': cc,
        'damaged': damaged, 'empty_cells': empty_cells, 'short_cols': short_cols,
        'dark_frac': dark_frac, 'frame_gaps': gap_count, 'paper_med': paper_med,
    }, 'ok'


files = sorted(glob.glob(os.path.join(src, '*.jpg')))
print('目錄 %s：%d 張圖（跳過前 %d 張）' % (os.path.basename(src), len(files), skip))
n_out = 0
seq = 0
damaged_pages = []
csv_rows = []
csv_head = (['page', 'fold', 'file', 'src_file', 'src_w', 'src_h',
             'out_w', 'out_h', 'rot_deg', 'frame_top', 'frame_bottom', 'x0', 'x1', 'y0', 'y1']
            + ['col%d' % i for i in range(FOLD_COLS)]
            + ['row%d' % i for i in range(CHARS)]
            + ['jpeg_q', 'kb', 'damaged', 'short_cols', 'dark_frac', 'frame_gaps', 'paper_med',
               'empty_cells'])
for f in files[skip:skip + limit]:
    gray = np.array(Image.open(f).convert('L'))
    r, why = analyze(gray, os.path.basename(f), gray.shape[1], gray.shape[0])
    name = os.path.basename(f)[:-4]
    if r is None:
        print('  %s  略過：%s' % (name, why))
        continue
    img = Image.open(f)
    if abs(r['ang']) > 0.05:
        img = img.rotate(r['ang'], resample=Image.BICUBIC, fillcolor=(255, 255, 255))
    W, H = img.size
    # 使用者指定：每圖三折由右到左編號（最右邊＝0001.jpg、中間 0002、左邊 0003）
    for k, fold in enumerate(reversed(r['folds'])):
        x0, x1 = fold['x']
        y0, y1 = fold['y']
        cut = img.crop((x0, y0, x1, y1)).resize((CELL_W * FOLD_COLS, CELL_H * CHARS), Image.LANCZOS)
        cut = white_out_lines(cut)          # 去掉落在第 1／17 格的版框橫線
        seq += 1
        # 只有整卷的第一折是 100KB，其餘（含每一頁的第一折）都 50~60KB
        target = KB_FIRST if seq == 1 else KB_REST
        fname = '%03d.jpg' % seq            # 使用者指定：固定三位整數（001.jpg、002.jpg…）
        q, kb = save_target(cut, os.path.join(out_dir, fname), target)
        n_out += 1
        # col0..col4＝這一折五個等分格的中心（原圖座標）：五格等分，空欄也佔一格。
        colc = [round(v, 1) for v in fold['cells']]
        if k == 0 and r['damaged']:
            damaged_pages.append('%s(缺字%d格)' % (name, r['empty_cells']))
        csv_rows.append([name, k + 1, fname, r['src_file'], r['src_w'], r['src_h'],
                         CELL_W * FOLD_COLS, CELL_H * CHARS, '%.3f' % r['ang'], r['frame_y'][0][0], r['frame_y'][1][1],
                         x0, x1, y0, y1] + colc + [round(v, 1) for v in r['cc']]
                        + [q, round(kb, 1), 1 if r['damaged'] else 0,
                           r['short_cols'], round(r['dark_frac'], 4), r['frame_gaps'],
                           round(r['paper_med'], 1), r['empty_cells']])
    print('  %s  skew %+.2f°  框 y %d-%d  欄寬 %.0f  欄數 %d  摺線 %d  這折欄數 %s  5×17 %d/%d' %
          (name, r['ang'], r['frame_y'][0][0], r['frame_y'][1][1], r['cw'], len(r['colruns']),
           r['n_lines'], '+'.join(str(len(f['cols'])) for f in reversed(r['folds'])),
           r['filled'], r['total']))
if csv_path and csv_rows:
    with io.open(csv_path, 'w', encoding='utf-8', newline='') as fh:
        fh.write(','.join(csv_head) + '\n')
        for row in csv_rows:
            fh.write(','.join(str(v) for v in row) + '\n')
    print('座標／旋轉參數 -> %s（%d 列）' % (csv_path, len(csv_rows)))
if damaged_pages:
    print('破損頁（格子有缺漏字，照正常版面切並記錄）: %s' % ' '.join(sorted(set(damaged_pages))))
print('輸出 %d 張 -> %s' % (n_out, out_dir))
