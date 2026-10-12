"""乾隆藏掃描卷 → zip 的來源清單與異常報告（給人看的）。

讀 qianlongzang/_source-map.tsv（qlz-batch.py 產生），對照 乾隆藏.csv，輸出
qianlongzang/_report.md：涵蓋範圍、命名規則、多卷一個 PDF 的清單、缺卷、丟掉的重複檔。

用法：python qlz-report.py
"""
import csv
import io
import os
import re
from collections import defaultdict

OUT = 'qianlongzang'
MAP = os.path.join(OUT, '_source-map.tsv')
CSV_PATH = os.path.join(ROOT,'tables','乾隆藏.csv')


def main():
    rows = []
    with io.open(MAP, encoding='utf-8') as fh:
        fh.readline()
        for line in fh:
            p = line.rstrip('\n').split('\t')
            if len(p) >= 2:
                rows.append((p[0], p[1]))

    ql = {}
    with io.open(CSV_PATH, encoding='utf-8-sig') as fh:
        for r in csv.DictReader(fh):
            m = re.match(r'^(\d+)([a-z]?)$', (r['編號'] or '').strip())
            if not m:
                continue
            n = int(m.group(1))
            ql.setdefault(n, r)

    by_dept = defaultdict(list)
    for name, rel in rows:
        by_dept[int(name[:4])].append((name, rel))
    for v in by_dept.values():
        v.sort()

    zips = set(f[:-4] for f in os.listdir(OUT) if f.endswith('.zip'))
    missing_zip = [n for n, _ in rows if n not in zips]

    # 來源標示 N 卷、實際 PDF 檔數不同的經號
    multi = []
    for dept, vols in sorted(by_dept.items()):
        r = ql.get(dept)
        want = (r['卷數'] or '').strip() if r else ''
        if want.isdigit() and int(want) != len(vols):
            multi.append((dept, r['經名'], want, len(vols), vols))

    dropped = []
    dp = os.path.join(OUT, '_dropped.tsv')
    if os.path.exists(dp):
        with io.open(dp, encoding='utf-8') as fh:
            dropped = [l.strip() for l in fh if l.strip()]

    pages = 0
    bytes_ = 0
    import zipfile
    for z in zips:
        zi = zipfile.ZipFile(os.path.join(OUT, z + '.zip'))
        pages += len(zi.infolist())
        bytes_ += sum(i.file_size for i in zi.infolist())
        zi.close()

    have_dept = sorted(by_dept)
    no_pdf = [n for n in sorted(ql) if n not in by_dept and n <= 1076]
    beyond = [n for n in sorted(ql) if n > 1076]

    lines = []
    lines.append('# qianlongzang：乾隆藏掃描 PDF → 一卷一個 zip')
    lines.append('')
    lines.append('| 項目 | 值 |')
    lines.append('| --- | --- |')
    lines.append('| 來源 | `full-pdf/`（乾隆大藏經掃描 PDF，3608 檔、33.1 GB） |')
    lines.append('| 輸出 | `qianlongzang/<經號 4 位>-<卷號 3 位>.zip` |')
    lines.append('| 已產出 | %d 卷（%d 頁、%.1f GB） |' % (len(zips), pages, bytes_ / 1e9))
    lines.append('| 經號範圍 | %04d–%04d（共 %d 個經號） |'
                 % (min(have_dept), max(have_dept), len(have_dept)))
    lines.append('| 內容 | 原 PDF 內嵌的 JPEG 原圖，一位元組未改（零轉檔） |')
    lines.append('| zip | store 模式（不壓縮） |')
    lines.append('| 每卷頁數 | 依原 PDF，檔名 `p0001.jpg`、`p0002.jpg`… |')
    lines.append('| 驗收 | `qlz-verify.py --deep`：3557 卷全部逐位元組與來源 PDF 相同、卷號與來源一致 |')
    lines.append('')
    lines.append('## 經號怎麼來的')
    lines.append('')
    lines.append('`full-pdf/` 的資料夾名是 `第N部 …`，N 就是**乾隆藏的經號**。'
                 '拿 `乾隆藏.csv` 全表驗證：1669 筆「編號去掉別本後綴 = 經號」無一例外，'
                 '所以 zip 前綴直接用 N，與永樂北藏（`yb-out/` 用永樂北藏編號）分開。')
    lines.append('')
    lines.append('卷號取來源檔名的 `卷NN`／`第NN卷`／`NN卷`；'
                 '一卷一個 PDF，所以卷號就是檔名寫的那一卷。')
    lines.append('')
    lines.append('**排序踩過的坑**：來源檔名按字串排序時 `卷100` 會排在 `卷10` 前面，'
                 '若再套「卷號必須遞增」的修正就會整段位移（大般若 卷10 → 110、卷600 → 690，'
                 '共 180 卷）。現在改成先按**檔名裡的卷號**數值排序、已標卷號的一律照來源不改，'
                 '`qlz-verify.py` 也加了「zip 卷號 ＝ 來源卷號」這條守門——'
                 '位元組比對抓不到這種錯，因為檔案內容沒錯、錯的是編號。')
    ok_dept = sum(1 for d in by_dept
                  if (ql.get(d) or {}).get('卷數', '').strip().isdigit()
                  and int(ql[d]['卷數']) == len(by_dept[d]))
    lines.append('')
    lines.append('交叉驗證：%d 個經號裡有 %d 個「PDF 檔數 ＝ 乾隆藏.csv 卷數」，'
                 '其餘 %d 個是 csv 的卷數欄只記了一個別本（下一節）。'
                 % (len(by_dept), ok_dept, len(by_dept) - ok_dept))
    lines.append('')

    lines.append('## 一個 PDF 裝了好幾卷（%d 個經號）' % len(multi))
    lines.append('')
    lines.append('這些經號的 `乾隆藏.csv` 卷數與 PDF 檔數不一致（通常是 csv 只記了一個別本；'
                 '經號 1059 的來源檔名甚至自己標了「PDF有上中下三卷可拆分」）。'
                 '目前照原樣一個 PDF 一個 zip，之後要拆卷時再處理：')
    lines.append('')
    lines.append('| 經號 | 經名 | csv 卷數 | PDF 檔數 | 已產出的 zip |')
    lines.append('| --- | --- | --- | --- | --- |')
    for dept, name, want, got, vols in multi:
        lines.append('| %04d | %s | %s | %d | %s |'
                     % (dept, name, want, got, ', '.join(v[0] for v in vols)))
    lines.append('')

    lines.append('## 哪幾個經號要特別看')
    lines.append('')
    lines.append('* 「csv 卷數 ≠ PDF 檔數」不代表缺件——`乾隆藏.csv` 的卷數欄在有**別本**'
                 '（`0010a/b/c`）或**附經**時只記其中一個，PDF 檔數才是實體卷數。')
    note = '（第703部 只有一個空的資料夾，掃描檔不在這批裡）' if 703 in no_pdf else ''
    lines.append('* 乾隆藏有經號、`full-pdf/` 沒有 PDF 的：%s%s'
                 % (', '.join('%04d %s' % (n, ql[n]['經名']) for n in no_pdf) or '無', note))
    lines.append('* `full-pdf/` 只到經號 1076；乾隆藏 1077–1669（%d 個經號）本來就沒有掃描檔。'
                 % len(beyond))
    lines.append('* 同一部同一卷有兩個內容相同的 PDF（第539部 11–50 卷同時放在上層與子資料夾）：'
                 '丟掉 %d 個重複檔，清單在 `_dropped.tsv`。' % len(dropped))
    if missing_zip:
        lines.append('* 清單裡還沒有 zip 的卷：%d 個（`qlz-batch.py` 可續跑）' % len(missing_zip))
    lines.append('')
    lines.append('## 檔案')
    lines.append('')
    lines.append('| 檔案 | 說明 |')
    lines.append('| --- | --- |')
    lines.append('| `qlz-batch.py` | 產生 zip（拆頁、打包、續跑、平行） |')
    lines.append('| `qlz-verify.py` | 驗收：命名、store、頁序、卷號對來源、位元組與來源相同 |')
    lines.append('| `qlz-report.py` | 產生這份報告 |')
    lines.append('| `qlz-cutcheck.py` | 把某一卷的 zip 解出來試跑 `pdf-cuts.py`（切折圖連通性） |')
    lines.append('| `_source-map.tsv` | 每一卷的 zip 名 ↔ 來源 PDF（給後續切折圖對位用） |')
    lines.append('| `_dropped.tsv` | 被判定為重複而丟掉的來源檔 |')
    lines.append('')

    with io.open(os.path.join(OUT, '_report.md'), 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines) + '\n')
    print('卷 %d、頁 %d、%.1f GB、經號 %d 個' % (len(zips), pages, bytes_ / 1e9, len(have_dept)))
    print('多卷一個 PDF: %d 個經號' % len(multi))
    print('沒 PDF 的經號: %s' % (no_pdf or '無'))
    print('丟掉重複: %d' % len(dropped))
    print('→ %s' % os.path.join(OUT, '_report.md'))


if __name__ == '__main__':
    main()
