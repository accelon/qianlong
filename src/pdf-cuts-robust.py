"""
把掃描頁切成「一折」＝ 5 行 × 17 字，一頁 PDF 切出二張圖。

（`pdf-cuts.py` 的容錯版：來源卷裡如果有壞掉的 JPEG，整卷不該因此失敗，
  跳過那一頁繼續切其餘頁。其餘邏輯與 pdf-cuts.py 完全相同。）

一葉（PDF 一頁）是 10 行 × 17 字、版心在正中間，所以一葉 = 二折：
    折 1 = 最右 5 行（閱讀順序在前）
    折 2 = 最左 5 行
命名 001.jpg, 002.jpg …（依閱讀順序），開頭的書皮（偵測不到標準版面的頁）直接跳過。

輸出統一尺寸 500 × 1105：
    寬 500 / 5  = 100px 一行
    高 1105 / 17 = 65px 一字
所以由像素座標反推「第幾行第幾字」就是 (x // 100, y // 65)；比例 1 : 2.21。

第一次跑會逐頁偵測格線與歪斜，並把結果寫成 <輸出>/grid.tsv；
之後只要 --grid=<輸出>/grid.tsv 就能跳過偵測，直接照著轉、照著切（快很多，而且兩版結果完全相同）。

用法：
    python pdf-cuts.py [輸出目錄] [--grid=grid.tsv]
"""
import glob
import io
import math
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

import gridfit

SRC = 'ocr/pages'    # 可用 --src= 指定（批次驗證時指向拆好的頁面目錄）
LINES_PER_CUT = 5
CELL_W, CELL_H = 100, 65
W_OUT, H_OUT = CELL_W * LINES_PER_CUT, CELL_H * gridfit.CHARS_PER_LINE
QUALITY = 92
# 大小約束（使用者規格）：首折 <= 100KB、其餘 50~60KB
KB_FIRST = 100
KB_REST = 50


def save_target(img, path, target_kb):
    """把圖存成「大約 target_kb」的 JPEG：二分搜尋品質。

    與 `yb-frame.py` 同一套做法（使用者要求首折約 100KB、其餘約 50KB）。
    """
    lo, hi = 10, 95
    best = None
    for _ in range(5):
        q = (lo + hi) // 2
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=q, optimize=True)
        size = buf.tell() / 1024.0
        if best is None or abs(size - target_kb) < abs(best[2] - target_kb):
            best = (q, buf.getvalue(), size)
        if size > target_kb:
            hi = q - 1
        else:
            lo = q + 1
        if abs(size - target_kb) <= 0.12 * target_kb:
            break
    q, data, size = best
    with open(path, 'wb') as fh:
        fh.write(data)
    return q, size

GRID_COLS = ['page', 'skew_deg', 'page_w', 'page_h', 'lp', 'cp', 'j0'] + [
    f'c{i}' for i in range(gridfit.LINES_PER_LEAF)]

out_dir = 'cuts'
grid_file = None
for arg in sys.argv[1:]:
    if arg.startswith('--grid='):
        grid_file = arg.split('=', 1)[1]
    elif arg.startswith('--src='):
        SRC = arg.split('=', 1)[1]
    elif arg.startswith('--'):
        raise SystemExit(f'unknown option: {arg}')
    else:
        out_dir = arg
os.makedirs(out_dir, exist_ok=True)


def read_grid(path):
    """讀回上次記下的座標與角度：page -> dict"""
    table = {}
    with open(path, encoding='utf-8') as fh:
        head = fh.readline().rstrip('\n').split('\t')
        for line in fh:
            v = line.rstrip('\n').split('\t')
            if len(v) != len(head):
                continue
            r = dict(zip(head, v))
            table[r['page']] = {
                'skew': float(r['skew_deg']),
                'lp': float(r['lp']),
                'cp': float(r['cp']),
                'j0': float(r['j0']),
                'centers': [float(r[f'c{i}']) for i in range(gridfit.LINES_PER_LEAF)],
                'page_w': int(r['page_w']),
                'page_h': int(r['page_h']),
            }
    return table


known = read_grid(grid_file) if grid_file else {}


def iround(v):
    """四捨五入（不是 Python 內建的四捨六入）——Go 的 math.Round 就是這個，
    兩版讀同一份 grid.tsv 才會切出一模一樣的座標。"""
    return int(math.floor(v + 0.5))


rows = []
skipped = []
broken = []
new_grid = {}
n = 0

for path in sorted(glob.glob(f'{SRC}/p*.jpg')):
    page = os.path.basename(path)[:-4]
    try:
        img = Image.open(path).convert('L')
        page_w, page_h = img.size
        img.load()
    except Exception as e:
        # 來源掃描裡有壞掉的 JPEG（實測 41 張）：跳過這一頁，整卷繼續切
        broken.append((page, str(e)[:60]))
        continue

    if page in known:
        # 上次已量好：直接照著轉（旋轉不改變尺寸，所以座標可以沿用）
        g = known[page]
        if abs(g['skew']) >= 0.05:
            img = img.rotate(g['skew'], resample=Image.BICUBIC, fillcolor=255)
    else:
        if grid_file:
            # 有給座標表就嚴格照表：表上沒有的頁（當初被判非標準版面）不要自作聰明重偵測，
            # 否則 Python 與 Go 會因為各自重新偵測的結果不同而切出不同張數。
            skipped.append((page, 'not in grid'))
            continue
        # 掃描頁常有一點歪斜，先偵測一次量出角度，擺正後再偵測一次（旋轉後格線位置會變）。
        # 角度小於 0.05 度就不重取樣，免得白白讓圖變糊。
        grid = gridfit.detect_grid(np.array(img))
        skew = gridfit.skew_degrees(grid)
        if abs(skew) >= 0.05:
            img = img.rotate(skew, resample=Image.BICUBIC, fillcolor=255)
            grid = gridfit.detect_grid(np.array(img))
        if not grid['ok']:
            skipped.append((page, grid.get('reason', '?')))
            continue
        g = {'skew': skew, 'lp': grid['lp'], 'cp': grid['cp'], 'j0': grid['j0'],
             'centers': list(grid['centers']), 'page_w': page_w, 'page_h': page_h}
        new_grid[page] = g

    gray = np.array(img)
    lp, cp, j0 = g['lp'], g['cp'], g['j0']
    centers = g['centers']

    # y 範圍：17 個字心加兩側各半格（rot 的行座標 = 原圖 y）
    y0 = max(0, iround(j0 - cp / 2))
    y1 = min(gray.shape[0], iround(j0 + (gridfit.CHARS_PER_LINE - 0.5) * cp))
    # 均勻字距會低估下緣（實測 0506-001 最後一字被切掉 0.9~1.5 個字）；
    # 只修下緣又會讓上方留白過多、下方貼底（實測 0420-001 p0010 上 45px／下 0px）。
    # 所以：數字數，剛好 17 塊就取文字實際上下緣、維持框高置中。
    import charcount
    y0, y1, _nblk, _how = charcount.refine_range(gray, cp, j0, y0, y1)

    # ---- 最後一道保險：把裁切範圍夾到「文字實際上下緣」之外 ----
    # 實測 0999-009 p0029：refine_range 後 y1=1224，但 text_extent 量到 1320，
    # 而把裁切下緣畫在來源圖上（_q2/_chk/probe_0999-009_p0029.png）可見
    # **紅線穿過最後一列字的中間** —— 字的下半真的被切掉。
    # 使用者已同意「可以包進框線」，所以直接撐到 ext 是可接受的。
    # 注意：這只在既有結果上「夾下限」，不放寬 refine_range 的判斷
    #（第 7 次嘗試失敗是因為同時放寬了「整頁 vs 一折」的比例，讓整頁 ext 被接受）。
    _ext = charcount.text_extent(gray)
    if _ext is not None:
        # 只用「合理」的 ext：二折頁的整頁文字範圍不該遠大於一折高度。
        # 實測 0024-002 有些頁 ext 量到整頁（0..1417），夾下去反而把裁切框拉爆
        # （涵蓋率由 82% 掉到 8.8%）。所以加這道比例守門。
        _h = max(1, y1 - y0)
        _sp = _ext[1] - _ext[0]
        # 排除「量到整頁」的 ext：實測 0024-002 有頁面的 ext 是 0..1417（整頁），
        # 夾下去會把裁切框拉爆，涵蓋率由 82% 掉到 8.8%。
        # 判準：跨度 < 全頁 88%，且不兩端同時貼到頁緣。
        _H = gray.shape[0]
        _ok = (0.5 * _h <= _sp <= 2.4 * _h
               and _sp < 0.88 * _H
               and not (_ext[0] <= 3 and _ext[1] >= _H - 4))
        if _ok:
            y0 = min(y0, _ext[0])
            y1 = max(y1, _ext[1])

    # ---- 最後定案：下緣切到「版框線的上緣」----
    # 使用者 2026-10-12 確認的準則：文字要完整，但**不要把整條框線與下方白邊切進來**。
    # 實測 0999-009 p0029：ext 量到 1320（框線殘留），框線上緣在 1314~1319
    # —— 把裁切下緣畫在來源圖上比對後，確認「切到框線上緣」才是正確位置。
    # 之所以會偏下：clean_page 的 k=120 在頁面中段的 x 視窗裡接不起被印字切斷的框線
    #（全寬＋膨脹才看得到 309px 的連續段），框線因此殘留在 ink 裡。
    _ft = charcount.frame_top(gray, int(_H * 0.5))
    if _ft is not None and y0 < _ft <= y1:
        y1 = _ft

    for half in range(2):                      # 折 1 = 右半, 折 2 = 左半
        first = half * LINES_PER_CUT
        last = first + LINES_PER_CUT - 1
        i_top = centers[first] - lp / 2         # rot 列（原圖 x 的鏡射）
        i_bot = centers[last] + lp / 2
        x_left = max(0, iround(page_w - i_bot))
        x_right = min(page_w, iround(page_w - i_top))

        n += 1
        name = f'{n:03d}.jpg'
        # 註：曾試過「切完量邊緣墨量、不合格就往外擴重切」的迭代法，但**反而更差**
        # （實測 0085-002 由 32 折變 42 折貼邊）。原因是往外擴會把版框線與頁面邊緣
        # 帶進畫面，而貼邊的墨跡很多時候本來就是框線。所以維持單次裁切。
        cut = img.crop((x_left, y0, x_right, y1)).resize((W_OUT, H_OUT), Image.LANCZOS)

        # 把版框的上／下緣塗白。框線橫貫整張圖（覆蓋 67~100% 寬），
        # 而文字最多的那一列也只有 ~34%（五欄同時有橫畫），用 45% 當門檻不會誤刪字畫。
        arr = np.array(cut)
        wide = (arr < 160).mean(axis=1) > 0.45
        grow = np.zeros_like(wide)              # 邊緣列較窄，往上下各擴 3 列一起塗掉
        for d in range(-3, 4):
            grow |= np.roll(wide, d)
        if grow.any():
            arr[grow] = 255
            cut = Image.fromarray(arr)

        # 大小約束（使用者規格）：首折 <= 100KB、其餘 50~60KB。
        # 先前用固定 quality=92，實測中位 163KB/折、單卷 19MB（比永樂彩圖大 3 倍），
        # 所以改成和 yb-frame.py 一樣「二分搜尋品質」逼近目標大小。
        save_target(cut, os.path.join(out_dir, name), KB_FIRST if n == 1 else KB_REST)
        rows.append((name, page, half + 1, x_left, x_right, y0, y1, f"{g['skew']:.3f}"))

with open(os.path.join(out_dir, 'cuts.tsv'), 'w', encoding='utf-8') as fh:
    fh.write('file\tpage\tfold\tsrc_x0\tsrc_x1\tsrc_y0\tsrc_y1\tskew_deg\n')
    for r in rows:
        fh.write('\t'.join(str(v) for v in r) + '\n')

if new_grid:
    with open(os.path.join(out_dir, 'grid.tsv'), 'w', encoding='utf-8') as fh:
        fh.write('\t'.join(GRID_COLS) + '\n')
        for page in sorted(new_grid):
            g = new_grid[page]
            fh.write('\t'.join([page, f"{g['skew']:.3f}", str(g['page_w']), str(g['page_h']),
                                f"{g['lp']:.2f}", f"{g['cp']:.3f}", f"{g['j0']:.2f}"] +
                               [f'{c:.1f}' for c in g['centers']]) + '\n')

print(f'cuts: {n}  ({W_OUT}x{H_OUT}, cell {CELL_W}x{CELL_H}, ratio 1:{H_OUT / W_OUT:.2f})')
if known:
    print(f'格線來源: {grid_file}（跳過偵測）')
elif new_grid:
    print(f'已記下 {len(new_grid)} 頁的座標與角度 -> {os.path.join(out_dir, "grid.tsv")}')
print(f'skipped pages: {skipped}')
if broken:
    print(f'壞圖 {len(broken)} 張已跳過: {broken[:5]}')
