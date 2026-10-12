"""探測 full-pdf 每卷 PDF 內嵌 JPEG 張數（不寫檔，只看頁數）。

用法：python _ql_probe.py <pdf 路徑...>
"""
import os
import sys

MIN = 20 * 1024


def jpeg_ranges(buf):
    out = []
    i = 0
    n = len(buf)
    while i + 3 < n:
        if buf[i] == 0xFF and buf[i + 1] == 0xD8 and buf[i + 2] == 0xFF:
            j = i + 3
            while j + 1 < n and not (buf[j] == 0xFF and buf[j + 1] == 0xD9):
                j += 1
            if j + 1 < n:
                if j + 2 - i >= MIN:
                    out.append((i, j + 2))
                i = j + 2
                continue
        i += 1
    return out


if __name__ == '__main__':
    total = 0
    for path in sys.argv[1:]:
        with open(path, 'rb') as fh:
            buf = fh.read()
        rs = jpeg_ranges(buf)
        total += len(rs)
        print('%3d pages  %8.1f MB  %s' % (len(rs), len(buf) / 1048576.0, os.path.basename(path)))
    print('total pages %d' % total)
