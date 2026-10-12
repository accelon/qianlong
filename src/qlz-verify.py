"""乾隆藏輸出驗收：證明 qianlongzang/*.zip 就是 full-pdf 的原圖，規格一條一條核對。

用法：python qlz-verify.py [--dir=qianlongzang] [--limit=N] [--jobs=8] [--sample=25] [--deep]

檢查項目
  1. 檔名一律 經號(4)-卷號(3)[字母].zip，且與 _source-map.tsv 一對一
  2. zip 全部 store 模式（不壓縮）
  3. zip 內只有 p0001.jpg、p0002.jpg…且連續
  4. 每張 jpg 都是完整 JPEG（SOI 開頭、EOI 結尾），每卷首末兩張真的解得開
  5. 深度比對：把來源 PDF 重掃一次，逐頁與 zip 內的位元組完全相同（原圖零轉檔）
  6. 卷號連續性：同一經號的卷號應為 001..N（缺卷單獨列出，不當失敗）

--deep 逐位元組比對全部（要讀 33GB 來源 ＋ 30GB zip，約 10 分鐘，用 --jobs 平行）；
預設只抽驗 --sample 卷。整卷的結構檢查（1~4）一律全跑。
"""
import argparse
import io
import os
import re
import sys
import zipfile
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from importlib import import_module

_qlb = import_module('qlz-batch') if os.path.exists('qlz-batch.py') else None

NAME = re.compile(r'^(\d{4})-(\d{3})([a-z]?)$')
ROOT = 'full-pdf'
# 來源檔名的卷號：卷10／第10卷／10卷——`卷` 後面接數字這一個形式就涵蓋全部三種
# （`卷\s*0*(\d+)` 在「第539部 … 第02卷 （形）.pdf」上也會抓到 2）。
SRC_VOL = re.compile(r'卷\s*0*(\d+)')


def src_vol_of(rel):
    base = os.path.splitext(os.path.basename(rel))[0]
    m = SRC_VOL.search(base)
    return int(m.group(1)) if m else None


def jpeg_ranges(buf):
    if _qlb:
        return _qlb.jpeg_ranges(buf)
    raise SystemExit('需要 qlz-batch.py 在旁邊')


def check_one(job):
    """回傳 (zip 名, 頁數, 位元組數, [問題], 部號, 卷號, 是否有做深度比對)"""
    z, zp, src_rel, deep = job
    bad = []
    name = z[:-4]
    m = NAME.match(name)
    with zipfile.ZipFile(zp) as zf:
        il = zf.infolist()
        if any(i.compress_type != 0 for i in il):
            bad.append('%s: 有非 store 的項目' % z)
        for k, i in enumerate(il, 1):
            if i.filename != 'p%04d.jpg' % k:
                bad.append('%s: 第 %d 個檔名為 %s' % (z, k, i.filename))
                break
        if not il:
            return (z, 0, 0, bad + ['%s: 空的 zip' % z], None, None, False)
        data = [zf.read(i.filename) for i in il]

    # 卷號一定要與來源檔名寫的一致。
    # 這條是踩過的坑：來源檔名用字串排序（卷100 排在卷10 前面）＋單調遞增修正，
    # 會把整段卷號位移（大般若 卷10 → 110、卷600 → 690），而位元組比對完全看不出來
    # ——檔案內容沒錯，錯的是編號。
    src_vol = src_vol_of(src_rel)
    if src_vol is not None and m and int(m.group(2)) != src_vol:
        bad.append('%s: zip 卷號 %d != 來源卷號 %d（%s）'
                   % (z, int(m.group(2)), src_vol, os.path.basename(src_rel)))

    for k, d in enumerate(data, 1):
        if not (d[:3] == b'\xff\xd8\xff' and d[-2:] == b'\xff\xd9'):
            bad.append('%s: p%04d.jpg 不是完整 JPEG' % (z, k))
            break
        if len(d) < 20 * 1024:
            bad.append('%s: p%04d.jpg 只有 %d bytes（疑似縮圖）' % (z, k, len(d)))
            break
    for k in {1, len(data)}:
        try:
            im = Image.open(io.BytesIO(data[k - 1]))
            im.load()
            if im.width < 500 or im.height < 500:
                bad.append('%s: p%04d.jpg 尺寸只有 %s' % (z, k, im.size))
        except Exception as exc:                       # noqa: BLE001
            bad.append('%s: p%04d.jpg 解不開（%s）' % (z, k, exc))

    if deep:
        with open(os.path.join(ROOT, src_rel), 'rb') as fh:
            buf = fh.read()
        ranges = jpeg_ranges(buf)
        if len(ranges) != len(data):
            bad.append('%s: 頁數 %d != 來源 %d' % (z, len(data), len(ranges)))
        else:
            for (s, e), d in zip(ranges, data):
                if buf[s:e] != d:
                    bad.append('%s: 有頁面與來源不同（不是原圖）' % z)
                    break

    return (z, len(data), sum(len(d) for d in data), bad,
            m.group(1) if m else None, int(m.group(2)) if m else None, deep)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', default='qianlongzang')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--sample', type=int, default=25)
    ap.add_argument('--jobs', type=int, default=8)
    ap.add_argument('--deep', action='store_true')
    a = ap.parse_args()

    src_map = {}
    with io.open(os.path.join(a.dir, '_source-map.tsv'), encoding='utf-8') as fh:
        fh.readline()
        for line in fh:
            p = line.rstrip('\n').split('\t')
            if len(p) >= 2:
                src_map[p[0]] = p[1]

    zips = sorted(f for f in os.listdir(a.dir) if f.endswith('.zip'))
    if a.limit:
        zips = zips[:a.limit]

    jobs = []
    skipped = []
    for idx, z in enumerate(zips):
        name = z[:-4]
        if not NAME.match(name):
            skipped.append('%s: 檔名不符 經號-卷號' % z)
            continue
        if name not in src_map:
            skipped.append('%s: _source-map.tsv 沒有對應來源' % z)
            continue
        deep = a.deep or idx < a.sample
        jobs.append((z, os.path.join(a.dir, z), src_map[name], deep))
    n_deep = sum(1 for j in jobs if j[2])

    print('檢查 %d 卷（其中 %d 卷逐頁與來源比對），並行 %d' % (len(jobs), n_deep, a.jobs))
    sys.stdout.flush()

    bad = list(skipped)
    pages = 0
    bytes_ = 0
    per_dept = {}
    done = 0
    with ThreadPoolExecutor(max_workers=a.jobs) as ex:
        for z, n, nb, problems, dept, vol, _ in ex.map(check_one, jobs):
            done += 1
            pages += n
            bytes_ += nb
            bad.extend(problems)
            if dept:
                per_dept.setdefault(dept, []).append(vol)
            if done % 250 == 0 or done == len(jobs):
                print('  %d/%d  頁 %d  %.1f GB  不合格 %d'
                      % (done, len(jobs), pages, bytes_ / 1e9, len(bad)))
                sys.stdout.flush()

    gaps = []
    for dept, vols in sorted(per_dept.items()):
        base = sorted(set(vols))
        miss = [v for v in range(1, base[-1] + 1) if v not in set(base)]
        if miss:
            shown = ', '.join(str(v) for v in miss[:12]) + ('…' if len(miss) > 12 else '')
            gaps.append('%s: 1..%d 之中缺 %d 卷（%s）' % (dept, base[-1], len(miss), shown))

    print('檢查 %d 卷、%d 頁、%.1f GB' % (len(jobs), pages, bytes_ / 1e9))
    print('逐位元組與來源比對：%s' % ('全部 %d 卷' % n_deep if n_deep else '無'))
    print('卷號不連續的經號 %d 個' % len(gaps))
    for g in gaps[:15]:
        print('   ', g)
    if bad:
        print('不合格 %d 項：' % len(bad))
        for b in bad[:25]:
            print('    ' + b)
    else:
        print('全部合格 ✓')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
