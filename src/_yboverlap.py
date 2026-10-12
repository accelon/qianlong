"""比對相鄰掃瞄圖的欄：上一張最後一欄 vs 下一張第一欄，看是否重覆。
用正規化相關（灰階、同尺寸、允許小幅平移），輸出具體相似度。"""
import importlib.util
import sys
import numpy as np
from PIL import Image

spec = importlib.util.spec_from_file_location('yf', 'yb-frame.py')
Y = importlib.util.module_from_spec(spec)
sys.argv = ['x', '--limit=0']
spec.loader.exec_module(Y)

DP = r'yonglebeizang\0001-001天01\11725711_31'
PAGES = ['%06d' % i for i in range(4, 15)]


def page_data(name):
    gray = np.array(Image.open('%s/%s.jpg' % (DP, name)).convert('L'))
    r, why = Y.analyze(gray)
    if r is None:
        return None, why
    if abs(r['ang']) > 0.05:
        img = Image.open('%s/%s.jpg' % (DP, name)).convert('L')
        img = img.rotate(r['ang'], resample=Image.BICUBIC, fillcolor=255)
        gray = np.array(img)
    # 重新取一次框內資訊（旋轉後座標要一致）
    ink = Y.ink_mask(gray)
    H, W = ink.shape
    rf = ink.mean(axis=1)
    hl = [x for x in Y.runs(rf > 0.5, 2) if x[0] > 15 and x[1] < H - 15]
    core = ink[hl[0][1] + 1:hl[-1][0]]
    cols = []
    for fold in r['folds']:
        lo, hi = fold['cols']
        for i in range(lo, hi):
            cols.append(core[:, r['colruns'][i][0]:r['colruns'][i][1] + 1].astype(np.uint8))
    return cols, None


def corr(a, b):
    """把兩張欄圖縮到同尺寸後算相關係數（允許 ±8px 平移取最大）"""
    h = min(a.shape[0], b.shape[0])
    A = np.array(Image.fromarray(a[:h]).resize((60, 400))) > 0
    best = -2.0
    for dx in range(-8, 9, 2):
        for dy in range(-8, 9, 2):
            B = np.array(Image.fromarray(b[:h]).resize((60, 400))) > 0
            B = np.roll(np.roll(B, dx, axis=1), dy, axis=0)
            x = A.ravel().astype(float)
            y = B.ravel().astype(float)
            if x.std() < 1e-6 or y.std() < 1e-6:
                continue
            c = float(np.corrcoef(x, y)[0, 1])
            best = max(best, c)
    return best


prev = None
prev_name = None
for name in PAGES:
    cols, why = page_data(name)
    if cols is None:
        print('%s  略過（%s）' % (name, why))
        prev = None
        continue
    print('%s  欄數 %d' % (name, len(cols)))
    if prev is not None:
        # 上一張最左 3 欄（閱讀順序最後）vs 這一張最右 3 欄（閱讀順序最前）
        left_of_prev = prev[-3:]          # 閱讀順序的最後幾欄
        first_of_cur = cols[:3]           # 閱讀順序的最前幾欄
        print('    上一張最後 3 欄 × 這一張最前 3 欄 的相關係數：')
        for i, a in enumerate(left_of_prev):
            row = ['%+.2f' % corr(a, b) for b in first_of_cur]
            print('      上一張倒數第%d欄: %s' % (3 - i, row))
    prev = cols
    prev_name = name
