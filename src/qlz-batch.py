"""乾隆藏掃描 PDF → qianlongzang/<經號 4 位>-<卷號 3 位>.zip（一卷一個，store 不壓縮）。

做法
  * full-pdf/ 每卷是一個 PDF，內含的每一頁本來就是一張 DCTDecode（JPEG）影像，
    所以直接把 JPEG 位元組抽出來寫進 zip，**完全不重新編碼**（零轉檔、無世代損失）。
  * zip 用 store 模式（ZIP_STORED）：黑白的 jpg 再壓也小不了多少，使用者要求不壓縮。
  * zip 內檔名 p0001.jpg、p0002.jpg…（依原 PDF 頁序），與 lib/pdfpages.ts 的拆頁命名一致。

編號來源
  * 經號＝資料夾 `第N部 …` 的 N（乾隆藏編號去掉別本後綴；已對 乾隆藏.csv 全表驗過
    1669 筆「部號 ＝ 經號」無一例外）。
  * 卷號＝檔名的 卷NN／第NN卷／NN卷；分段資料夾（第539部）照檔名的卷號。

用法：
    python qlz-batch.py [--jobs=4] [--limit=N] [--only=0100-001] [--list]
"""
import argparse
import io
import os
import re
import sys
import zipfile
from concurrent.futures import ProcessPoolExecutor

ROOT = 'full-pdf'
OUT = 'qianlongzang'
MAP = os.path.join(OUT, '_source-map.tsv')

MIN_JPEG = 20 * 1024          # 小於這個大小的是 /Thumb 縮圖，不是頁面
VOL_PATTERNS = [
    re.compile(r'卷\s*0*(\d+)'),
    re.compile(r'第\s*0*(\d+)\s*卷'),
    re.compile(r'共\s*0*(\d+)\s*卷'),
    re.compile(r'\s0*(\d+)\s*卷'),
]
DEPT = re.compile(r'^第(\d+)部')


def jpeg_ranges(buf):
    """掃 SOI(FFD8FF)…EOI(FFD9)。不解析 PDF 字典：圖被壓在物件流裡時文字掃描看不到。"""
    out = []
    i = 0
    n = len(buf)
    while i + 3 < n:
        if buf[i] == 0xFF and buf[i + 1] == 0xD8 and buf[i + 2] == 0xFF:
            j = i + 3
            while j + 1 < n and not (buf[j] == 0xFF and buf[j + 1] == 0xD9):
                j += 1
            if j + 1 < n:
                if j + 2 - i >= MIN_JPEG:
                    out.append((i, j + 2))
                i = j + 2
                continue
        i += 1
    return out


def dept_of(path):
    cur = os.path.abspath(path)
    while True:
        m = DEPT.match(os.path.basename(cur))
        if m:
            return int(m.group(1))
        parent = os.path.dirname(cur)
        if parent == cur:
            return None
        cur = parent


def vol_of(name):
    base = os.path.splitext(name)[0]
    for p in VOL_PATTERNS:
        m = p.search(base)
        if m:
            return int(m.group(1))
    return None


def build_map():
    """回傳 [(zip 名, 來源相對路徑, 頁數或 0)]，已去掉同部同卷的重複檔。"""
    rows = []
    seen = {}
    dropped = []
    for top in sorted(os.listdir(ROOT)):
        top_path = os.path.join(ROOT, top)
        if not os.path.isdir(top_path):
            continue
        for dirpath, dirnames, filenames in os.walk(top_path):
            pdfs = sorted(f for f in filenames if f.lower().endswith('.pdf'))
            if not pdfs:
                continue
            dept = dept_of(dirpath)
            if dept is None:
                raise SystemExit('找不到部號: %s' % dirpath)
            # 一定要用「檔名裡的卷號」排序，不能只按檔名字串排：
            # 字串序會把 卷100 排在 卷10 前面（大般若 600 卷就中過這個），
            # 再經過下面的單調修正就會把卷號整體位移（10 → 110）。
            # 沒有卷號的（1卷／N卷）用檔名字串序，排在最後。
            vols_all = [vol_of(f) for f in pdfs]
            order = sorted(range(len(pdfs)),
                           key=lambda i: (vols_all[i] is None,
                                          vols_all[i] if vols_all[i] is not None else 0,
                                          pdfs[i]))
            pdfs = [pdfs[i] for i in order]
            vols = [vols_all[i] for i in order]

            if all(v is None for v in vols):
                sec = re.search(r'(\d+)\s*卷?\s*[-–~～]\s*(\d+)\s*卷',
                                os.path.basename(dirpath))
                if sec:
                    vols = list(range(int(sec.group(1)), int(sec.group(2)) + 1))[:len(pdfs)]
                else:
                    vols = list(range(1, len(pdfs) + 1))
            else:
                # 只有真的缺卷號的才補；已經有卷號的**一律照來源**（亂改就是編號錯誤）
                nxt = 0
                for i, v in enumerate(vols):
                    if v is None:
                        vols[i] = nxt + 1
                    nxt = vols[i]
            for pdf, vol in zip(pdfs, vols):
                rel = os.path.relpath(os.path.join(dirpath, pdf), ROOT)
                size = os.path.getsize(os.path.join(dirpath, pdf))
                key = (dept, vol)
                if key in seen:
                    # 同部同卷的第二份（例如第539部 11-50 卷同時存在於上層與子資料夾）：
                    # 內容相同就丟掉，不同就加字母後綴保留
                    prev_rel, prev_size = seen[key]
                    if prev_size == size:
                        dropped.append('%s 與 %s 同大小，視為重複' % (rel, prev_rel))
                        continue
                    suffix = 'b'
                    while (dept, vol, suffix) in seen:
                        suffix = chr(ord(suffix) + 1)
                    seen[(dept, vol, suffix)] = (rel, size)
                    rows.append(('%04d-%03d%s' % (dept, vol, suffix), rel, size))
                    continue
                seen[key] = (rel, size)
                rows.append(('%04d-%03d' % (dept, vol), rel, size))
    rows.sort()
    return rows, dropped


def make_zip(job):
    name, rel, _size = job
    src = os.path.join(ROOT, rel)
    dst = os.path.join(OUT, name + '.zip')
    tmp = dst + '.tmp'
    with open(src, 'rb') as fh:
        buf = fh.read()
    ranges = jpeg_ranges(buf)
    if not ranges:
        raise RuntimeError('拆不出頁面: %s' % rel)
    pages = 0
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_STORED, allowZip64=True) as zf:
        for i, (s, e) in enumerate(ranges, 1):
            zi = zipfile.ZipInfo('p%04d.jpg' % i, date_time=(1980, 1, 1, 0, 0, 0))
            zi.compress_type = zipfile.ZIP_STORED
            zi.external_attr = 0o644 << 16
            zf.writestr(zi, buf[s:e])
            pages += 1
    os.replace(tmp, dst)
    return pages


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--only', default='')
    ap.add_argument('--list', action='store_true')
    a = ap.parse_args()

    os.makedirs(OUT, exist_ok=True)
    rows, dropped = build_map()
    if a.only:
        rows = [r for r in rows if a.only in r[0]]

    if a.list:
        for name, rel, size in rows[:a.limit or len(rows)]:
            print('%s\t%s\t%.1fMB' % (name, rel, size / 1e6))
        print('共 %d 卷（丟掉重複 %d 個檔案）' % (len(rows), len(dropped)))
        return

    with io.open(MAP, 'w', encoding='utf-8', newline='') as fh:
        fh.write('zip\t來源\t來源大小\n')
        for name, rel, size in rows:
            fh.write('%s\t%s\t%d\n' % (name, rel, size))
    with io.open(os.path.join(OUT, '_dropped.tsv'), 'w', encoding='utf-8', newline='') as fh:
        for d in dropped:
            fh.write(d + '\n')

    todo = []
    for name, rel, size in rows[:a.limit or len(rows)]:
        if os.path.exists(os.path.join(OUT, name + '.zip')):
            continue
        todo.append((name, rel, size))

    total_mb = sum(r[2] for r in todo) / 1e6
    print('清單 %d 卷，待做 %d 卷（%.1f GB），並行 %d' % (len(rows), len(todo), total_mb / 1000, a.jobs))
    sys.stdout.flush()

    done = 0
    pages = 0
    failed = []
    with ProcessPoolExecutor(max_workers=a.jobs) as ex:
        for r in ex.map(make_zip, todo, chunksize=1):
            if isinstance(r, int):
                pages += r
            done += 1
            if done % 50 == 0 or done == len(todo):
                print('  %d/%d  頁 %d' % (done, len(todo), pages))
                sys.stdout.flush()
    print('完成 %d 卷、%d 頁，失敗 %d' % (done, pages, len(failed)))


if __name__ == '__main__':
    main()
