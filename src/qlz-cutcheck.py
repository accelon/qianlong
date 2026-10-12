"""折圖那條線怎麼從 qianlongzang 拿頁面（先做一次連通性試跑）。

pdf-cuts.py 讀的是「一個放 p####.jpg 的目錄」，qianlongzang 的 zip 裡就是這個結構，
所以只要把一卷的 zip 解到暫存目錄就能直接餵進去。

用法：python qlz-cutcheck.py [卷號，預設 0001-001] [--out=cuts-check]
"""
import argparse
import os
import shutil
import subprocess
import sys
import zipfile

OUT = 'qianlongzang'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('vol', nargs='?', default='0001-001')
    ap.add_argument('--out', default='_scratch/cuts-check')
    ap.add_argument('--keep', action='store_true')
    a = ap.parse_args()

    zp = os.path.join(OUT, a.vol + '.zip')
    if not os.path.exists(zp):
        raise SystemExit('沒有 %s' % zp)
    pages = os.path.join('_scratch', 'qlz-pages', a.vol)
    shutil.rmtree(pages, ignore_errors=True)
    os.makedirs(pages, exist_ok=True)
    with zipfile.ZipFile(zp) as zf:
        names = [i.filename for i in zf.infolist()]
        zf.extractall(pages)
    print('%s：%d 頁 → %s' % (a.vol, len(names), pages))

    py = sys.executable
    subprocess.run([py, 'pdf-cuts.py', a.out, '--src=' + pages], check=True)
    print('折圖 →', a.out)


if __name__ == '__main__':
    main()
