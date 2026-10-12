#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Recover the text laozai.cn lacks, from the qldzj GitHub text edition.

lz-md is left untouched. Text that qldzj carries but laozai.cn does not is
written to qldzj-patch/, one Markdown file per 經.

qldzj splits its text by 品, not by 卷, so most recovered blocks cannot be cut
back into individual 卷 (only 1,186 of its 16,625 files name a 卷 at all).
Blocks are therefore emitted whole, separated by an explicit marker when the
source text is not contiguous, with the 卷 range recorded in the front matter.

A candidate block is only kept when at least 80% of its 40-character windows are
absent from the whole of lz-md — that separates genuine omissions from mere
edition/variant-character differences.

Run:  python lz-patch.py        (expects ./_qldzj to be cloned)
Out:  qldzj-patch/*.md , lz-patch-report.txt
"""
import csv
import difflib
import importlib.util
import os
import re
import sys
import collections

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.abspath(__file__))
QL = os.path.join(ROOT, "_qldzj")
OUT = os.path.join(ROOT, "qldzj-patch")
REPORT = os.path.join(ROOT, "lz-patch-report.txt")

spec = importlib.util.spec_from_file_location("lzm", os.path.join(ROOT, "lz-map.py"))
LZM = importlib.util.module_from_spec(spec)
spec.loader.exec_module(LZM)

LEAD = re.compile(r"^\d+\s*[-\.]\s*")
RANGE = re.compile(r"[（(]\s*第\s*(\d+)\s*卷\s*[～~-]\s*第\s*(\d+)\s*卷\s*[）)]")
KEEP = re.compile(r"[^\u3400-\u9fff0-9]")
EXTRA = {"萨昙分陀利经": "0132", "佛说人本欲生经": "0549", "佛说碱水喻经": "0554",
         "佛说阿耨颰经": "0564", "佛说梵摩喻经": "0604", "入大乘论": "1237",
         "唯识三十论": "1208", "高丽国普照禅师脩心诀": "1626", "杂譬喻经": "1361",
         "月灯三昧经": "0187"}
W, S = 40, 20
MIN_BLOCK = 300          # characters, after snapping to sentence boundaries
ABSENT_RATIO = 0.80      # share of windows that must be absent from all of lz-md
MARK = re.compile(r"卷第[一二三四五六七八九十百千〇零0-9]+")

rows = list(csv.DictReader(open(os.path.join(ROOT, "tables", "乾隆藏.csv"), encoding="utf-8")))
by_norm, by_norm_cat, by_bianhao = (collections.defaultdict(list),
                                    collections.defaultdict(list), {})
for r in rows:
    n = LZM.norm(r["經名"])
    by_norm[n].append(r)
    by_norm_cat[(n, LZM.cat_norm(r["類別"]))].append(r)
    by_bianhao[r["編號"]] = r


def match(name, cat):
    n = LZM.norm(name)
    if name in EXTRA:
        return by_bianhao[EXTRA[name]]
    if (cat, name) in LZM.CAT_ALIAS:
        return by_bianhao[LZM.CAT_ALIAS[(cat, name)]]
    if name in LZM.ALIAS:
        return by_bianhao[LZM.ALIAS[name]]
    for pool in (by_norm_cat.get((n, cat)), by_norm.get(n)):
        if pool:
            r2, _ = LZM.pick_row(pool, name, 0)
            if r2:
                return r2
            if len(pool) == 1:
                return pool[0]
    pool = [(k[0], v) for k, v in by_norm_cat.items() if k[1] == cat]
    if pool:
        best = difflib.get_close_matches(n, [p[0] for p in pool], n=1, cutoff=0.84)
        if best:
            c = dict(pool)[best[0]]
            r2, _ = LZM.pick_row(c, name, 0)
            if r2:
                return r2
            if len(c) == 1:
                return c[0]
    best = difflib.get_close_matches(n, list(by_norm), n=1, cutoff=0.88)
    return by_norm[best[0]][0] if best else None


def canon(t):
    from zhconv import convert
    t = convert(t, "zh-cn")
    for k, v in LZM.VARIANT.items():
        t = t.replace(k, v)
    return KEEP.sub("", t)


# ------------------------------------------------------------ qldzj text ---
qlraw = collections.defaultdict(str)
qlsrc = collections.defaultdict(list)
for g in sorted(os.listdir(QL)):
    gp = os.path.join(QL, g)
    if not os.path.isdir(gp) or g == ".git":
        continue
    for cat in sorted(os.listdir(gp)):
        cp = os.path.join(gp, cat)
        if not os.path.isdir(cp):
            continue
        catname = LEAD.sub("", cat)
        for w in sorted(os.listdir(cp)):
            wp = os.path.join(cp, w)
            if not os.path.isdir(wp):
                continue
            base = LEAD.sub("", w).strip()
            if RANGE.search(base):
                base = RANGE.sub("", base).strip()
            row = match(base, catname)
            if row is None:
                continue
            names = sorted(os.listdir(wp),
                           key=lambda s: int(re.match(r"(\d+)", s).group(1))
                           if re.match(r"(\d+)", s) else 9999)
            qlsrc[row["經號"]].append(f"{g}/{cat}/{w}")
            for fn in names:
                fp = os.path.join(wp, fn)
                if os.path.isdir(fp):
                    for f2 in sorted(os.listdir(fp)):
                        qlraw[row["經號"]] += open(os.path.join(fp, f2),
                                                   encoding="utf-8",
                                                   errors="replace").read()
                elif fn.endswith(".txt"):
                    qlraw[row["經號"]] += open(fp, encoding="utf-8",
                                               errors="replace").read()

# ------------------------------------------------------------- lz-md text ---
lztext = collections.defaultdict(str)
lzvol = collections.defaultdict(set)
for r in list(csv.reader(open(os.path.join(ROOT, "tables", "lz-index.csv"),
                              encoding="utf-8-sig")))[1:]:
    t = open(os.path.join(ROOT, "lz-md", r[0] + ".md"), encoding="utf-8").read()
    lztext[r[1]] += re.sub(r"^---.*?\n---\n", "", t, flags=re.S)
    if int(r[4]) > 0:
        lzvol[r[1]].add(int(r[4]))

GLOBAL = canon("".join(lztext.values()))

cat_juan, cat_name = {}, {}
for r in rows:
    cat_name.setdefault(r["經號"], r["經名"])
    if r["卷數"].strip().isdigit():
        cat_juan[r["經號"]] = max(cat_juan.get(r["經號"], 0), int(r["卷數"]))


def absent_ratio(text):
    """Share of 60-char windows of `text` that appear nowhere in lz-md."""
    if len(text) < 60:
        return 1.0
    n = min(400, max(1, len(text) // 30))
    step = max(1, (len(text) - 60) // n)
    probes = [text[i:i + 60] for i in range(0, max(1, len(text) - 60), step)][:n]
    return sum(1 for p in probes if p not in GLOBAL) / len(probes)


os.makedirs(OUT, exist_ok=True)
for old in os.listdir(OUT):
    if old.endswith(".md"):
        os.remove(os.path.join(OUT, old))

lines = ["qldzj text recovered into qldzj-patch/   (lz-md is NOT modified)",
         "=" * 76, ""]
written = []
for j in sorted(qlraw, key=lambda x: int(x) if x.isdigit() else 0):
    raw = qlraw[j]
    a = canon(lztext.get(j, ""))
    if len(a) < 200:
        continue
    buf, pos = [], []
    for i, ch in enumerate(raw):
        if not KEEP.match(ch):
            buf.append(ch)
            pos.append(i)
    b = "".join(buf)
    if len(b) <= len(a) + 200:
        continue

    idx = {a[i:i + W] for i in range(0, max(0, len(a) - W + 1))}
    spans, cur = [], None
    for i in range(0, max(0, len(b) - W + 1), S):
        if b[i:i + W] not in idx:
            cur = [i, i + W] if cur is None else [cur[0], i + W]
        else:
            if cur:
                spans.append(tuple(cur))
            cur = None
    if cur:
        spans.append(tuple(cur))

    # merge spans separated by a short matching stretch, then snap to sentences
    merged = []
    for s, e in spans:
        if merged and s - merged[-1][1] <= 300:
            merged[-1] = (merged[-1][0], e)
        else:
            merged.append((s, e))

    blocks = []
    for s, e in merged:
        rs, re_ = pos[s], pos[min(e, len(pos) - 1)]
        rs = raw.rfind("。", max(0, rs - 120), rs)
        rs = rs + 1 if rs != -1 else pos[s]
        re_ = raw.find("。", re_, re_ + 120)
        re_ = re_ + 1 if re_ != -1 else pos[min(e, len(pos) - 1)]
        chunk = raw[rs:re_].strip()
        if len(chunk) < MIN_BLOCK:
            continue
        if absent_ratio(canon(chunk)) < ABSENT_RATIO:
            continue
        blocks.append(chunk)

    if not blocks:
        continue

    lv = sorted(lzvol.get(j, []))
    missing = [v for v in range(1, cat_juan.get(j, 0) + 1) if v not in lv]
    name = cat_name.get(j, j)
    fname = re.sub(r'[<>:"/\\|?*]', "_", f"{int(j):04d}-{name}").rstrip(" .")
    span_txt = f"{(missing[0] if missing else '')}–{(missing[-1] if missing else '')}"
    total = sum(len(x) for x in blocks)

    fm = ["---",
          f"經號: {j}",
          f"經名: {name}",
          f"藏經卷數: {cat_juan.get(j, '')}",
          f"lz-md 已有卷: {(lv[0] if lv else '')}-{(lv[-1] if lv else '')} ({len(lv)} 卷)",
          (f"缺失卷: {missing[0]}-{missing[-1]} ({len(missing)} 卷)"
           if missing else "缺失卷: (無 — 缺的是卷內文字)"),
          f"補回字數: {total:,}",
          f"qldzj 來源: {', '.join(qlsrc[j][:3])}",
          "說明: 此段文字 laozai.cn 沒有，來自 qldzj 文字版。",
          "      qldzj 按品切檔，不保留卷界，故本檔未必能對應單一卷。",
          "---", ""]
    out = "\n".join(fm) + f"# {name} — qldzj 補文（{span_txt} 卷）\n\n"
    for n, chunk in enumerate(blocks):
        if n:
            out += ("<!-- 以下為另一段缺失文字；與上一段在原文中不相連 -->\n\n")
        for para in re.split(r"\n+", chunk):
            para = para.strip()
            if not para:
                continue
            # a surviving 卷第X marker inside the text can still delimit a 卷
            m = MARK.search(para)
            if m:
                head, tail = para[:m.start()].strip(), para[m.start():].strip()
                if head:
                    out += head + "\n\n"
                out += f"### {m.group(0)}\n\n{tail}\n\n"
            else:
                out += para + "\n\n"
    open(os.path.join(OUT, fname + ".md"), "w", encoding="utf-8").write(out)

    written.append((j, name, len(blocks), total, missing, fname))
    lines.append(f"{j:>5}  {name}")
    lines.append(f"       缺失卷 {missing[0] if missing else '-'}-"
                 f"{missing[-1] if missing else '-'} ({len(missing)})    "
                 f"補回 {total:>9,} 字  ({len(blocks)} 段)  -> {fname}.md")

lines += ["", f"總計 {len(written)} 部經，補回 {sum(w[3] for w in written):,} 字"]
txt = "\n".join(lines)
open(REPORT, "w", encoding="utf-8").write(txt)
print(txt)
