"""
刻本格線偵測：從掃描頁求出「每葉 10 行 × 每行 17 字」的格線幾何。

座標系約定（後面切圖與 OCR 都靠這個換算）：
    rot = np.rot90(ink, 1)          # 欄 -> 橫列
    rot[i][j] = ink[j][W0-1-i]      # W0 = 原圖寬度
所以：
    rot 的列 i  <->  原圖 x = W0-1-i   （i 越小 = 越右邊 = 越先讀）
    rot 的行 j  <->  原圖 y = j
"""
import numpy as np
from PIL import Image, ImageFilter

CHARS_PER_LINE = 17
LINES_PER_LEAF = 10


def ink_mask(gray, delta=18, blur=25):
    """去背二值化：紙張明暗不均，用大範圍模糊當背景再相減。"""
    bg = np.array(Image.fromarray(gray).filter(ImageFilter.GaussianBlur(blur))).astype(np.int16)
    return (bg - gray.astype(np.int16)) > delta


def dilate(mask, r):
    out = mask.copy()
    for s in range(1, r + 1):
        out |= np.roll(mask, s, axis=0) | np.roll(mask, -s, axis=0)
        out |= np.roll(mask, s, axis=1) | np.roll(mask, -s, axis=1)
    return out


def long_line_mask(mask, k, axis):
    """沿 axis 方向連續 k 個以上都是墨 -> 格線（版框、摺線）。"""
    m = mask if axis == 1 else mask.T
    rows, n = m.shape
    cs = np.zeros((rows, n + 1), dtype=np.int32)
    np.cumsum(m, axis=1, out=cs[:, 1:])
    out = np.zeros_like(m, dtype=bool)
    half = k // 2
    for j in range(half, n - half):
        out[:, j] = (cs[:, j + half + 1] - cs[:, j - half]) >= k
    return out if axis == 1 else out.T


def clean_page(gray, k=120, grow=3):
    """去掉刻本格線，回傳（格線塗白的灰階圖, 去線後的墨跡遮罩）。"""
    ink = ink_mask(gray)
    bridged = dilate(ink, 4)  # 掃描有輕微傾斜，先膨脹把斷掉的框線接起來
    lines = dilate(long_line_mask(bridged, k, axis=1) | long_line_mask(bridged, k, axis=0), grow)
    gray_clean = gray.copy()
    gray_clean[lines] = 255
    return gray_clean, ink & ~lines


def fit_comb(profile, lo, hi, step=0.25):
    """找最佳週期與相位：讓格點落在墨跡上（平均墨量最大）。"""
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


def tilt(grid):
    """量歪斜：每一欄裡「墨跡的列重心 vs 字位置」的直線斜率。

    不用逐字開窗算重心——那種做法依賴字心估計，兩個實作只要 j0/cp 差一點（實測差 14px/0.7px）
    斜率就會差一倍。這裡只用行心（行心很穩），所以 Python 與 Go 量出來會一致。
    回傳 tan(角度)：值代表「rot 列座標（= 原圖 x 的鏡射）隨字位置（原圖 y）的變化率」。
    """
    if not grid.get('ok'):
        return None
    rot = grid['rot']
    height, width = rot.shape
    lp = grid['lp']
    slopes = []
    for c in grid['centers']:
        y0, y1 = int(max(0, c - lp * 0.45)), int(min(height, c + lp * 0.45))
        if y1 - y0 < 10:
            continue
        band = rot[y0:y1].astype(np.float64)
        prof = band.sum(axis=0)
        if prof.max() <= 0:
            continue
        idx = np.arange(y0, y1, dtype=np.float64)
        cen = (band * idx[:, None]).sum(axis=0) / np.maximum(prof, 1e-6)
        ok = prof > 0.2 * prof.max()
        if ok.sum() < 200:
            continue
        js = np.arange(width, dtype=np.float64)[ok]
        slopes.append(float(np.polyfit(js, cen[ok], 1)[0]))
    if not slopes:
        return None
    return float(np.median(slopes))


def skew_degrees(grid):
    """回傳要交給 PIL `Image.rotate()` 的角度（度）：正值代表逆時針轉。"""
    t = tilt(grid)
    return 0.0 if t is None else float(np.degrees(np.arctan(t)))


def detect_grid_any(gray, core, cx0, ys):
    """一般化版面：欄距與字距都放寬搜尋，欄數／字數由墨跡量出來。

    實測有另一種版本（現代排印）：每頁仍是 10 欄，但欄距 160px（木刻是 105）、
    每欄 21 字（木刻是 17）。這一類用『欄距 85–120』去找會鎖到錯的週期（算出 13 欄），
    所以先放寬再回頭數欄數。
    """
    height, width = core.shape
    rowsum = core.sum(axis=1).astype(float)
    dec = 4
    small = rowsum[:len(rowsum) // dec * dec].reshape(-1, dec).sum(axis=1)
    y_lo, y_hi = float(ys[0]), float(ys[-1])
    block = y_hi - y_lo + 1
    # 依序試三段欄距範圍：標準木刻 85–120、放大版 60–200、大頁掃描 150–400
    # （3192×4252 是 1596×2126 的兩倍，欄距約 320）。只試一段會在大頁上鎖到諧波。
    last_why = 'no pitch'
    centers = None
    for lo, hi in ((85, 120), (60, 200), (150, 400)):
        _, lp_s, off_s = fit_comb(small, lo / dec, hi / dec)
        lp, off = lp_s * dec, off_s * dec
        if lp <= 0:
            continue
        ratio = block / lp
        # 一定要 10 欄：後面切「一折」（左右各 5 欄）就是照這個假設寫的
        if int(round(ratio)) != LINES_PER_LEAF or not (8.5 <= ratio <= 11.5):
            last_why = 'column count %.2f (lp=%.1f)' % (ratio, lp)
            continue
        k0 = int(np.ceil((y_lo - off) / lp))
        comb = [off + k * lp for k in range(k0, k0 + LINES_PER_LEAF)]
        if all(y_lo - 0.6 * lp <= c <= y_hi + 0.6 * lp for c in comb):
            centers = comb
        else:
            lp = block / LINES_PER_LEAF
            centers = [y_lo + lp * (k + 0.5) for k in range(LINES_PER_LEAF)]
        break
    if centers is None:
        return {'ok': False, 'reason': last_why}
    ncol = LINES_PER_LEAF

    # 字距／字數：看中間那一欄沿長度方向的剖面
    mid = centers[len(centers) // 2]
    b0, b1 = int(max(0, mid - lp * 0.45)), int(min(height, mid + lp * 0.45))
    prof = core[b0:b1].sum(axis=0).astype(float)
    if prof.max() <= 0:
        return {'ok': False, 'reason': 'no glyph'}
    _, cp, _ = fit_comb(prof, 40, 100)
    nz = np.where(prof > max(4.0, 0.15 * np.median(prof[prof > 0])))[0]
    if not len(nz) or cp <= 1:
        return {'ok': False, 'reason': 'no glyph span'}
    span = float(nz[-1] - nz[0] + 1)
    nchar = int(round(span / cp))
    if not (6 <= nchar <= 40) or abs(span / cp - nchar) > 0.6:
        return {'ok': False, 'reason': 'char count %.1f' % (span / cp)}

    return {
        'ok': True,
        'layout': 'general',
        'lp': lp,
        'centers': centers,
        'cp': cp,
        'nchar': nchar,
        'j0': cx0 + float(nz[0]) + cp / 2,
        'cx0': cx0,
        'rot': core,
        'rot_h': height,
        'rot_w': width,
        'page_w': int(gray.shape[1]),
        'page_h': int(gray.shape[0]),
    }


def text_bottom(gray, j0, cp, y1, margin=3):
    """回傳「文字實際的下緣」——用來修正均勻字距算出來的 y1。

    為什麼需要：`y1 = j0 + 16.5*cp` 假設字心等距，但實測（0506-001）
    最後一個字會被切掉 **0.9~1.5 個字（58~93px）**。原因是墨跡沿字方向不是等距排列
    （同一欄的字會擠在一起，實測有的字間隔只有 6~13px），所以「17 × 字距」會低估下緣。

    做法：把文字區的墨跡投影到 y 軸，從 y1 往後延伸——中斷不超過 `cp/2` 就繼續
    （容忍字與字的空隙），連續空白超過就停，再往後留 `margin` 列。

    **一定要先 clean_page 去背**：不去背的話紙張明暗會被當成墨，投影幾乎整欄都是 1，
    延伸就會暴衝。

    回傳 (new_y1, 延伸了幾個字)。文字區沒有墨時原樣回傳。
    """
    _clean, ink = clean_page(gray)
    core_w = ink.shape[1]
    x0, x1 = int(core_w * 0.05), int(core_w * 0.95)   # 左右各留 5% 避開版框
    prof = ink[:, x0:x1].mean(axis=1)
    H = len(prof)
    thr = 0.02
    last_ink = None
    j = max(0, int(y1))
    gap = 0
    limit = max(4, int(cp / 2))
    while j < H:
        if prof[j] > thr:
            last_ink = j
            gap = 0
        else:
            gap += 1
            if last_ink is not None and gap > limit:
                break
            if last_ink is None and gap > limit * 3:
                break
        j += 1
    if last_ink is None:
        return int(y1), 0.0
    new_y1 = min(H, last_ink + 1 + margin)
    return max(int(y1), new_y1), (new_y1 - int(y1)) / max(1.0, float(cp))


def detect_grid(gray):
    """回傳這一葉的格線幾何（rot 座標）。

    ok=False 表示這頁不是「10 行 × 17 字」的標準版面（例如空白書皮、卷末小字頁）。
    """
    gray_clean, ink_clean = clean_page(gray)
    rot = np.rot90(ink_clean, 1)
    height, width = rot.shape
    colsum = rot.sum(axis=0)
    xs = np.where(colsum < 0.75 * height)[0]
    if len(xs) == 0:
        return {'ok': False, 'reason': 'no ink'}
    cx0, cx1 = int(xs[0]), int(xs[-1]) + 1
    core = rot[:, cx0:cx1]
    core_w = core.shape[1]

    rowsum = core.sum(axis=1).astype(float)
    # 擬合很花時間（每個候選期距 × 每個相位都要算一次平均），先縮小 4 倍再擬合，
    # 求出來的期距與相位再放大回原尺度——誤差約 2px，對切圖沒有影響。
    dec = 4
    small = rowsum[:len(rowsum) // dec * dec].reshape(-1, dec).sum(axis=1)
    _, lp_s, off_s = fit_comb(small, 85 / dec, 120 / dec)
    lp, off = lp_s * dec, off_s * dec
    on = rowsum > max(2, int(core_w * 0.02))
    ys = np.where(on)[0]
    if not len(ys) or lp <= 0:
        return {'ok': False, 'reason': 'no text band'}
    ratio = (ys[-1] - ys[0] + 1) / lp
    if not (8.5 <= ratio <= 11.5):
        # 不是「10 欄 × 17 字」的木刻版面（例如現代排印版：欄距 160、每欄 21 字），
        # 走一般化的路徑，欄數與字數都由墨跡量出來。
        return detect_grid_any(gray, core, cx0, ys)

    # 欄心：優先用 comb 擬合出來的期距與相位（格點真的落在每一欄上）。
    # 用「文字區均分」的話，文字區邊緣若沒頂到最後一欄的字，整排欄心就會偏掉（009.jpg 偏 +14px）。
    y_lo, y_hi = float(ys[0]), float(ys[-1])
    k0 = int(np.ceil((y_lo - off) / lp))
    comb = [off + k * lp for k in range(k0, k0 + LINES_PER_LEAF)]
    if all(y_lo - 0.6 * lp <= c <= y_hi + 0.6 * lp for c in comb):
        centers = comb
    else:
        block = float(y_hi - y_lo + 1)
        lp = block / LINES_PER_LEAF
        centers = [y_lo + lp * (k + 0.5) for k in range(LINES_PER_LEAF)]

    # 字距：行墨跡長度的第 90 百分位 / 17。
    # 取墨跡範圍時要濾掉淡墨（框線殘影），否則字距會被撐大，17 格累積下來最後一格就跑掉。
    spans = []
    for ci, c in enumerate(centers):
        # 最外側兩欄最容易含到版框的左右邊框（實測污染就在第 0 與第 9 帶），
        # 字距全頁一致，不需要用到外側欄。
        if len(centers) > 6 and (ci == 0 or ci == len(centers) - 1):
            continue
        y0, y1 = int(max(0, c - lp * 0.40)), int(min(height, c + lp * 0.40))
        prof = core[y0:y1].sum(axis=0).astype(float)
        if prof.max() <= 0:
            continue
        nz = np.where(prof > max(4.0, 0.25 * prof.max()))[0]
        if len(nz):
            spans.append(int(nz[-1]) - int(nz[0]) + 1)
    if not spans:
        return {'ok': False, 'reason': 'no glyph span'}
    # 先剔除被版框污染的那幾條：污染後長度會暴增到接近整頁高（≥ 中位數 1.25 倍），
    # 留下乾淨的再取第 90 百分位。10 條帶裡有 2 條被污染時，不剔除就會挑中污染的
    # （第 90 百分位＝第 9 名，正好是污染那兩個之一），cp 變成 pageH/17 這種不可能的值。
    med = float(np.median(spans))
    keep = [v for v in spans if v <= 1.25 * med] or spans
    # 備援用：第 90 百分位（欄末的字常排不滿，取中位數會低估字距）
    cp_span = float(np.percentile(keep, 90)) / CHARS_PER_LINE

    # 主用「數字塊量間距」：把每一欄的墨跡切成字塊，量字與字的間距中位數。
    # 細線（頁眉、版框）會形成很窄的段，被最小寬度濾掉，天生不受污染；
    # 實測與人工判定的真值完全一致（63.000/63.000/64.000 對真值 63.00/63.50/63.50）。
    gaps = []
    for ci, c in enumerate(centers):
        if len(centers) > 6 and (ci == 0 or ci == len(centers) - 1):
            continue
        y0, y1 = int(max(0, c - lp * 0.40)), int(min(height, c + lp * 0.40))
        prof = core[y0:y1].sum(axis=0).astype(float)
        if prof.max() <= 0:
            continue
        cut = max(2.0, 0.15 * float(np.median(prof[prof > 0])))
        on = prof > cut
        segs = []
        i = 0
        while i < len(on):
            if on[i]:
                j = i
                while j + 1 < len(on) and on[j + 1]:
                    j += 1
                if j - i + 1 >= 8:      # 太窄的不算字
                    segs.append((i + j) / 2)
                i = j + 1
            else:
                i += 1
        gaps.extend(np.diff(segs).tolist())
    cp = float(np.median(gaps)) if len(gaps) >= 8 else cp_span

    # 格線相位（只用來對齊字心，不改字距）
    stack = core[int(ys[0]):int(ys[-1]) + 1].sum(axis=0).astype(float)
    best_off, best_ratio = 0.0, 0.0
    for coff in np.arange(0, cp, 1.0):
        ctr = np.arange(coff, core_w, cp).astype(int)
        mid = np.arange(coff + cp / 2, core_w, cp).astype(int)
        if len(ctr) < 8 or len(mid) < 8:
            continue
        r = float(stack[ctr].mean() / (stack[mid].mean() + 1e-6))
        if r > best_ratio:
            best_ratio, best_off = r, float(coff)
    # 第一個字心：先用滑動視窗（約半個字距）平滑再找。頁眉、框線那類細線平滑後會被抹掉，
    # 真正的字（寬約 0.6 個字距）會留下來；不平滑的話細線會被當成第一個字，
    # j0 落到頁首，整欄的字全部錯位（實測約 20% 的列）。
    win = max(3, int(cp * 0.5))
    pad = np.pad(stack, win, mode='edge')
    sm = np.convolve(pad, np.ones(2 * win) / (2 * win), mode='same')[win:win + len(stack)]
    sm_med = float(np.median(sm[sm > 0])) if (sm > 0).any() else 1.0
    hit = np.where(sm > max(1.0, 0.5 * sm_med))[0]
    # 平滑會把起點往後推約半個視窗，所以從「平滑起點 - 視窗」回頭用原始剖面找真正的起點
    # （頁眉細線在平滑起點之前，不會被找回來）。
    if len(hit):
        j_start, raw_cut = int(hit[0]), max(4.0, 0.15 * float(np.median(stack[stack > 0])))
        first = j_start
        for j in range(max(0, j_start - win), len(stack)):
            if stack[j] > raw_cut:
                first = j
                break
        j0_local = float(first) + cp / 2
    else:
        j0_local = best_off

    # 守門（下限）：字距不可能小於欄距的 40%。取樣帶幾乎沒墨時 cp 會退化到接近 0
    # （實測出現 0.118），那種列也是垃圾。
    if lp > 0 and cp < 0.4 * lp:
        return {'ok': False, 'reason': 'char pitch %.2f too small (lp=%.1f)' % (cp, lp)}
    # 守門（上限）：17 個字不可能填滿整頁高度（木刻實測只佔 81%、現代排印 80%）。
    if cp * CHARS_PER_LINE > 0.93 * gray.shape[0]:
        return {'ok': False, 'reason': 'char pitch %.1f fills the page (%d px)'
                % (cp, gray.shape[0])}

    return {
        'ok': True,
        'lp': lp,                       # 行距（rot 列方向）
        'centers': centers,             # 10 個行心（rot 列座標）
        'cp': cp,                       # 字距（rot 行方向）
        'j0': cx0 + float(j0_local),    # 第一字字心（rot 行座標，已加回邊框偏移）
        'cx0': cx0,                     # rot 遮罩的左緣（tilt 換算座標用）
        'rot': core,                    # 去線、去邊框後的旋轉遮罩（量歪斜用）
        'rot_h': height,
        'rot_w': width,
        'page_w': int(gray.shape[1]),
        'page_h': int(gray.shape[0]),
    }
