# -*- coding: utf-8 -*-
"""數字數（給二折的乾隆藏頁用）：一折 5 欄 × 17 字。

`yb-frame.py`（永樂三折）本來就有做這件事（`len(rr) == CHARS`，而且湊不到 17 段會主動
併／切到剛好 17）。`pdf-cuts.py`（乾隆藏二折）**沒有**，只用均勻字距算
`y1 = j0 + 16.5*cp`，所以遇到字距不均的頁，第 17 字會被切掉
（實測 0506-001 切短 0.9~1.5 個字）。

這裡把「五欄合併的字向剖面」拿來數字塊，回傳 17 個字塊的實際位置。
"""
import numpy as np

import gridfit

CHARS = 17

# 門檻必須逐頁試：實測同一卷相鄰頁，得到 17 塊的門檻會不一樣
# （0420-001：p0012 要 0.30、p0009 要 0.35、p0010 要 0.40）。單一固定門檻行不通。
THRS = (0.30, 0.35, 0.25, 0.40, 0.45, 0.50, 0.20)


def _profile_ink(gray):
    return gridfit.clean_page(gray)


def frame_top(gray, y_from, min_run=250, min_rows=3):
    """回傳 `y_from` 之下**第一條版框線的上緣**（找不到回 None）。

    為什麼需要：`clean_page` 的 `long_line_mask(k=120)` 在**頁面中段的 x 視窗**裡
    接不起被印字切斷的框線（實測 0999-009 p0029：框線在 8% inset 裡只剩 53~57px
    的短段，全寬＋膨脹才看得到 309px 的連續段）。所以框線會殘留在 `ink` 裡，
    讓 `text_extent` 量到框線的位置而不是文字下緣。

    做法：全寬取每列的最長連續橫向墨段，>= `min_run` 視為框線列；
    連續 >= `min_rows` 列才算一條框線，回傳它的**上緣**。

    使用者已確認的準則（2026-10-12）：**裁切框下緣要切到版框線的上緣**
    （文字完整、框線幾乎不留）。
    """
    try:
        m = gridfit.ink_mask(gray)
        mb = gridfit.dilate(m, 4)          # 掃描有輕微傾斜／斷口，膨脹接起來
    except Exception:
        return None
    H = mb.shape[0]
    lo = max(0, int(y_from))
    cols_any = mb.any(axis=0)
    if not cols_any.any():
        return None
    hits = []
    for y in range(lo, H):
        cols = np.where(mb[y])[0]
        if not len(cols):
            continue
        best = cur = 1
        for i in range(1, len(cols)):
            cur = cur + 1 if cols[i] == cols[i - 1] + 1 else 1
            best = max(best, cur)
        hits.append(best >= min_run)
    # 找第一段連續的框線列
    run = 0
    for i, h in enumerate(hits):
        if h:
            run += 1
            if run >= min_rows:
                return lo + i - run + 1       # 這段框線的上緣
        else:
            run = 0
    return None


def _profile(gray, cp=None):
    _clean, ink = gridfit.clean_page(gray)
    H, W = ink.shape
    profs = []
    for k in range(5):
        x0, x1 = int(W * k / 5), int(W * (k + 1) / 5)
        if x1 <= x0:
            continue
        c = ink[:, x0:x1].mean(axis=1).astype(float)
        if c.max() > 0:
            c = c / c.max()
        profs.append(c)
    return (np.mean(profs, axis=0) if profs else np.zeros(H)), H


def _blocks_raw(prof, thr, min_h):
    on = prof > thr
    out = []
    i = 0
    while i < len(on):
        if on[i]:
            j = i
            while j + 1 < len(on) and on[j + 1]:
                j += 1
            if (j - i + 1) >= min_h:
                out.append((i, j))
            i = j + 1
        else:
            i += 1
    return out


def char_blocks(gray, cp=None, thr=None):
    """回傳 ([(y_top, y_bottom)], cp)。

    `cp` 不從 `gridfit.detect_grid` 拿——實測那一頁偵測失敗時 cp 會變成
    pageH/17（如 83.4，實際 63），於是 0.3*cp 的合併門檻太寬、字全被黏在一起。
    這裡**只用剖面自己推 cp**：先不設 min_h 取原始段，再用段數反推字距。
    thr=None 時逐個門檻試，優先回傳剛好 17 塊的那一組。
    """
    prof, H = _profile(gray)
    if thr is not None:
        return _blocks_raw(prof, thr, max(8, int(H * 0.02))), H / float(CHARS)

    best = None
    for t in THRS:
        raw = _blocks_raw(prof, t, 8)
        if not raw:
            continue
        # 二階段：先用「段數反推 cp」，再用 0.3*cp 當最短字高與合併門檻重取一次
        cp = (raw[-1][1] - raw[0][0] + 1) / float(CHARS)
        min_h = max(8, int(0.30 * cp))
        blocks = _blocks_raw(prof, t, min_h)
        merged = []
        for b in blocks:
            if merged and b[0] - merged[-1][1] <= 0.3 * cp:
                merged[-1] = (merged[-1][0], b[1])
            else:
                merged.append(b)
        blocks = [b for b in merged if (b[1] - b[0] + 1) >= min_h]
        # 丟掉遠離文字主體的孤塊（頁面污點、版心雜點）：與前一段的間隔超過 1.5*cp 就不算
        if len(blocks) > 3:
            keep = [blocks[0]]
            for b in blocks[1:]:
                if b[0] - keep[-1][1] <= 1.5 * cp:
                    keep.append(b)
            blocks = keep
        cp_final = (blocks[-1][1] - blocks[0][0] + 1) / float(CHARS) if blocks else cp
        if len(blocks) == CHARS:
            return blocks, cp_final
        if best is None or abs(len(blocks) - CHARS) < abs(len(best[0]) - CHARS):
            best = (blocks, cp_final)
    return (best[0] if best else []), (best[1] if best else H / float(CHARS))


def refine_y(gray, cp, j0, y1, quiet=True):
    """用字塊修正上下緣。回傳 (new_y1, n_blocks, method)。

    三種情況：
      * 剛好 17 塊 → 直接把下緣放到第 17 塊的底部（最可靠）。
      * 塊數不對（<17 或 >17）→ 退回 `gridfit.text_bottom`（沿墨跡延伸）。
      * 都沒有墨 → 原樣回傳。
    """
    blocks, cp2 = char_blocks(gray, cp)
    n = len(blocks)
    if n == CHARS:
        return min(gray.shape[0], blocks[-1][1] + 1 + 3), n, 'blocks17'
    ny1, _ext = gridfit.text_bottom(gray, j0, cp, y1)
    return ny1, n, 'text_bottom'


def text_extent(gray, thr=0.10):
    """用**極低門檻**量文字真正的上下緣（回傳 (top, bottom) 或 None）。

    為什麼需要：`char_blocks()` 的門檻（0.30×cp 的塊高）會**漏掉很淡的起筆／收筆**，
    所以字塊看起來在框內，視覺上卻被切掉。實測 0001-063 p0008：

        門檻 0.30 → 文字 205..2200（裁切 190..2223，看起來有留白）
        門檻 0.10 → 文字 175..2239 ← 真正的墨跡，**上下各被切掉約 15px**

    使用者看到的就是這種「單字的一部份不見了」。
    """
    _clean, ink = _profile_ink(gray)
    H, W = ink.shape
    if H == 0:
        return None
    # **x 邊界要多試幾個**：留 8% 會漏掉延伸到頁面近邊的字（實測 0024-002 p0002
    # 就是這樣被切）；但留 2% 又會抓到頁面邊緣暗帶／摺線（實測 0085-002 p0002
    # 量到 185..1417，幾乎整頁）。
    # 所以依序試 8% / 4% / 2%，取**跨度最小**的那個 —— 跨度最小＝最貼近文字本體、
    # 最少雜訊（雜訊只會讓跨度變大，不會變小）。
    cands = []
    for frac in (0.08, 0.04, 0.02):
        x0, x1 = int(W * frac), int(W * (1.0 - frac))
        if x1 - x0 < 8:
            continue
        prof = ink[:, x0:x1].mean(axis=1)
        if prof.max() <= 0:
            continue
        # 門檻基準用第 90 百分位，不是 max —— 版框線／污點是離群尖峰。
        # 但**純相對門檻不夠**：實測 1028-001 p0001 的 prof.max 只有 0.086、
        # 第90百分位只有 0.0235，於是相對門檻低到 0.0024，**稀疏雜訊也會過關**，
        # 結果量到整頁 0..1417。
        # 所以再加一道**絕對下限**：一列至少要有 2% 寬度的墨才算「有字」。
        base = float(np.percentile(prof, 90)) or float(prof.max())
        floor = 0.02
        on = np.where(prof > max(thr * base, floor))[0]
        if not len(on):
            continue
        # **剔除版框線**：版框線是「很長的連續橫向墨段」（實測 320px），
        # 文字筆畫是短段。不剔除的話會把框線當成文字，覆蓋率數字全是假的
        # （實測 0999-009 p0029：ext 下緣 1320 其實是框線，真正的文字只到約 1220）。
        # 判準與 `_q2/final_check.py` 的 edge() 相同。
        seg = ink[:, x0:x1]
        keep = []
        for y in on:
            cols = np.where(seg[y])[0]
            if not len(cols):
                continue
            best = cur = 1
            for i in range(1, len(cols)):
                cur = cur + 1 if cols[i] == cols[i - 1] + 1 else 1
                best = max(best, cur)
            if best < 200:                      # >=200px 連續墨段 ⇒ 版框線
                keep.append(int(y))
        if keep:
            cands.append((keep[-1] - keep[0], keep[0], keep[-1]))
    if not cands:
        return None
    cands.sort()
    return cands[0][1], cands[0][2]


def refine_range(gray, cp, j0, y0, y1, fold=None, nfold=None):
    """同時修正上下緣，**把文字實際範圍置中並確保不被切到**。

    做法：
      1. 用字塊（門檻 0.30）取文字範圍 → 維持原本框高把它置中。
      2. 再用**極低門檻**（0.10）量真正的墨跡範圍；若超出第 1 步的框，
         就把框撐開到「墨跡 + 0.25 字留白」（寧可框高一點，也不要切掉筆畫）。

    `fold`/`nfold` 參數保留但**目前不使用**：曾試過把整頁 ext 依頁型切成
    nfold 段、每折只取自己那段，結果**反而更差**（實測 0024-002 由 7 折變 76 折貼邊），
    因為切段的邊界會落在字列中間。所以仍採整頁 ext（搭配下面的安全閥）。
    """
    H = gray.shape[0]
    blocks, _ = char_blocks(gray, cp)
    n = len(blocks)
    if not blocks:
        return y0, y1, 0, 'none'
    top = blocks[0][0]
    bot = blocks[-1][1]
    want = y1 - y0                          # 原本的框高（＝一折的高度）
    span = bot - top + 1
    # 頁型推斷：一折高 ~1079 ⇒ 10 行（二折頁，整頁 20 行）；~2014 ⇒ 15 行（三折頁）
    if nfold is None:
        nfold = 2 if want <= 1500 else 3
    rows_per_leaf = 10.0 if want <= 1500 else 15.0
    # 安全閥：字塊數太少、或「量到的文字範圍」遠大於框高 → 只沿墨跡修下緣，
    # **但仍要跑下面的低門檻複驗**（先前這裡直接 return，導致上方淡筆畫被切）。
    if n < 10 or span > 1.15 * want:
        ny1, _ext = gridfit.text_bottom(gray, j0, cp, y1)
        new_y0, new_y1 = y0, ny1
    elif span >= want:
        new_y0, new_y1 = top - 3, bot + 3
    else:
        mid = (top + bot) // 2
        new_y0 = mid - want // 2
        new_y1 = new_y0 + want
        new_y0 = max(0, new_y0)
        new_y1 = min(H, max(new_y1, bot + 3))
        if new_y1 - new_y0 < want:
            new_y0 = max(0, new_y1 - want)
    # ---- 低門檻複驗：把淡筆畫也包進來（上下都要）----
    ext = text_extent(gray)
    if ext is not None:
        et, eb = ext
        _span = eb - et
        # 安全閥：ext 是**整頁**文字範圍（二折頁約 20 行），want 是**一折**高度（10 行），
        # 所以容許到 (整頁行數 / 一折行數) 倍。
        _rows_per_leaf = 10.0 if want <= 1500 else 15.0
        _page_rows = 20.0 if _rows_per_leaf == 10.0 else 15.0
        if 0.9 * want <= _span <= 1.20 * want * (_page_rows / _rows_per_leaf):
            q = int(round(0.25 * cp))
            nt, nb = max(0, et - q), min(H, eb + q)
            if nt < new_y0 or nb > new_y1:
                new_y0 = max(0, min(new_y0, nt))
                new_y1 = min(H, max(new_y1, nb))
                return int(new_y0), int(new_y1), n, 'extent'
    return int(new_y0), int(new_y1), n, 'center'

