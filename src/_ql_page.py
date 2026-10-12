"""從掃描 PDF 取出第 N 頁的原始 JPEG（用來肉眼核對卷題）。

用法：python _ql_page.py <pdf> <第幾頁> <輸出檔>
"""
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
    src, idx, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    with open(src, 'rb') as fh:
        buf = fh.read()
    rs = jpeg_ranges(buf)
    s, e = rs[idx - 1]
    with open(out, 'wb') as fh:
        fh.write(buf[s:e])
    print('wrote %s  pages=%d  bytes=%d' % (out, len(rs), e - s))
