"""
永樂北藏輸出驗收：一條指令核對使用者確認過的所有規格。

用法：python yb-verify.py [--out=ylz-image] [--csv=ylz-crop-pos] [--limit=N]

檢查項目
  1. zip 命名為 經號-卷號.zip（不含函號）
  2. zip 內只有折圖、store 模式（不壓縮）
  3. 折圖檔名為固定三位整數 001.jpg、002.jpg…且連續
  4. 折數是來源版面折數的倍數：永樂北藏原掃描一圖三折、yonglebeizang-fill 一頁二折
  5. 折圖尺寸一律 500×1105（1 : 2.21）
  6. 有座標 CSV（ylz-crop-pos/<卷>.csv），且不進 zip
  7. CSV 折數與 zip 折數一致

來源判定：卷名同時出現在 yonglebeizang 的來源 zip 前綴＝彩圖三折；
否則視為 yonglebeizang-fill 補漏卷＝黑白二折（見 ylz-image.csv）。
"""
import argparse
import csv
import glob
import io
import os
import re
import zipfile

import numpy as np
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('--out', default='ylz-image')
ap.add_argument('--csv', dest='csvdir', default='ylz-crop-pos')
ap.add_argument('--src', default='yonglebeizang', help='永樂北藏來源 zip 目錄（判三折用）')
ap.add_argument('--limit', type=int, default=0)
a = ap.parse_args()

# 永樂北藏來源的卷（前綴 編號-卷號）→ 這批是一圖三折
yb_src = set()
if os.path.isdir(a.src):
    for n in os.listdir(a.src):
        if n.lower().endswith('.zip'):
            m = re.match(r'^(\d{4}[a-z]?)-(\d{3})', n)
            if m:
                yb_src.add('%s-%s' % (m.group(1), m.group(2)))

NEED_COLS_YB = ['page', 'fold', 'file', 'src_file', 'src_w', 'src_h', 'out_w', 'out_h',
                'rot_deg', 'x0', 'x1', 'y0', 'y1'] + \
               ['col%d' % i for i in range(5)] + ['row%d' % i for i in range(17)] + \
               ['jpeg_q', 'kb', 'damaged', 'empty_cells']
NEED_COLS_QL = ['file', 'page', 'fold', 'src_x0', 'src_x1', 'src_y0', 'src_y1', 'skew_deg']

zips = sorted(glob.glob(os.path.join(a.out, '*.zip')))
if a.limit:
    zips = zips[:a.limit]

bad = []
n_yb, n_ql = 0, 0
folds_yb, folds_ql = 0, 0
rows_total = 0
for z in zips:
    name = os.path.basename(z)[:-4]
    if not re.fullmatch(r'\d{4}[a-z]?-\d{3}', name):
        bad.append('%s: zip 命名不符 經號-卷號' % name)
    from_yb = name in yb_src
    want_mod = 3 if from_yb else 2
    # 一定要關檔：開著不關會鎖住檔案，讓正在跑的批次寫不進去
    zf = zipfile.ZipFile(z)
    il = zf.infolist()
    if any(i.compress_type != 0 for i in il):
        bad.append('%s: 有非 store 的項目' % name)
    if any(i.filename.endswith('.csv') for i in il):
        bad.append('%s: zip 內含 CSV' % name)
    jpgs = [i for i in il if i.filename.endswith('.jpg')]
    if len(jpgs) % want_mod != 0:
        bad.append('%s: 折數 %d 不是 %d 的倍數（來源 %s）'
                   % (name, len(jpgs), want_mod, 'yonglebeizang' if from_yb else 'yonglebeizang-fill'))
    for k, i in enumerate(jpgs, 1):
        if i.filename != '%03d.jpg' % k:
            bad.append('%s: 第 %d 個檔名為 %s' % (name, k, i.filename))
            break
    if from_yb:
        n_yb += 1; folds_yb += len(jpgs)
    else:
        n_ql += 1; folds_ql += len(jpgs)
    if jpgs:
        # 尺寸抽驗第一個與最後一個
        for i in (jpgs[0], jpgs[-1]):
            im = Image.open(io.BytesIO(zf.read(i.filename)))
            if im.size != (500, 1105):
                bad.append('%s: %s 尺寸 %s' % (name, i.filename, im.size))
                break
    zf.close()

    cpath = os.path.join(a.csvdir, name + '.csv')
    if not os.path.exists(cpath):
        bad.append('%s: 缺座標 CSV' % name)
        continue
    with open(cpath, encoding='utf-8') as fh:
        rd = list(csv.DictReader(fh))
    rows_total += len(rd)
    need = NEED_COLS_YB if from_yb else NEED_COLS_QL
    miss = [c for c in need if c not in (rd[0] if rd else {})]
    if miss:
        bad.append('%s: CSV 缺欄位 %s' % (name, miss))
        continue
    if len(rd) != len(jpgs):
        bad.append('%s: CSV %d 列 vs 折圖 %d 張' % (name, len(rd), len(jpgs)))
    if from_yb:
        # 同一頁的三折應由右到左
        by_page = {}
        for r in rd:
            by_page.setdefault(r['page'], []).append(r)
        for pg, rs in by_page.items():
            rs = sorted(rs, key=lambda r: int(r['fold']))
            if len(rs) == 3:
                c0 = [float(r['col0']) for r in rs]
                if not (c0[0] > c0[1] > c0[2]):
                    bad.append('%s p%s: 三折順序不是由右到左 %s' % (name, pg, c0))

print('檢查 %d 卷、CSV %d 列' % (len(zips), rows_total))
print('  永樂北藏來源（彩圖三折）: %d 卷、%d 折' % (n_yb, folds_yb))
print('  乾隆藏補漏  （黑白二折）: %d 卷、%d 折' % (n_ql, folds_ql))
if bad:
    print('  不合格 %d 項：' % len(bad))
    for b in bad[:20]:
        print('    ' + b)
else:
    print('  全部合格 ✓')

