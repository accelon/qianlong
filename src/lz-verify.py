#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Verify the lz-md output against the downloaded HTML and 乾隆藏.csv.

Checks: 1:1 coverage of the scraped pages, unique and well-formed file names,
every 編號 token resolvable in the catalogue, volume-number provenance, and
source pages that are empty on laozai.cn itself.
"""
import csv
import glob
import json
import os
import re
import sys
import collections

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.abspath(__file__))
MD = os.path.join(ROOT, "lz-md")
ok = True


def fail(msg):
    global ok
    ok = False
    print("   FAIL:", msg)


idx = list(csv.reader(open(os.path.join(ROOT, "tables", "lz-index.csv"), encoding="utf-8-sig")))[1:]
manifest = [json.loads(l) for l in open(os.path.join(ROOT, "_lz_manifest.jsonl"), encoding="utf-8")]
disk = [f for f in os.listdir(MD) if f.endswith(".md")]

print("=== coverage ===")
print(f"   scraped html pages : {len(manifest)}")
print(f"   markdown files     : {len(disk)}")
print(f"   index rows         : {len(idx)}")
if len(manifest) != len(disk) or len(idx) != len(disk):
    fail("counts differ")
if len({r[0] for r in idx}) != len(idx):
    fail("duplicate names in index")

print("\n=== file names ===")
bad = [r[0] for r in idx if not re.fullmatch(r"\d{4}[a-z]?-\d{3}[b-z]?", r[0])]
print(f"   conforming to NNNN[a]-VVV[b] : {len(idx) - len(bad)}/{len(idx)}")
if bad:
    fail(f"malformed: {bad[:5]}")
missing = [r[0] for r in idx if not os.path.exists(os.path.join(MD, r[0] + ".md"))]
if missing:
    fail(f"missing on disk: {missing[:5]}")

print("\n=== 編號 tokens vs 乾隆藏.csv ===")
rows = list(csv.DictReader(open(os.path.join(ROOT, "tables", "乾隆藏.csv"), encoding="utf-8")))
by_j = collections.defaultdict(set)
for r in rows:
    by_j[r["經號"]].add(r["編號"])
bad_tok = 0
for r in idx:
    tok, jh = r[0].split("-")[0], r[1]
    if jh not in by_j:
        continue
    valid = {b.replace("-", "").lstrip("0") for b in by_j[jh]}
    if tok.lstrip("0") not in valid:
        bad_tok += 1
        if bad_tok <= 5:
            print(f"   token {tok} not a 編號 of 經號 {jh} ({sorted(by_j[jh])})")
print(f"   tokens resolving to a catalogue 編號 : {len(idx) - bad_tok}/{len(idx)}")
if bad_tok:
    fail(f"{bad_tok} tokens unresolved")

print("\n=== 卷數 provenance ===")
for k, v in collections.Counter(r[7] for r in idx).most_common():
    print(f"   {v:6d}  {k}")

print("\n=== pages empty on the source site ===")
empty = []
for p in glob.glob(os.path.join(ROOT, "lz-html", "**", "*.html"), recursive=True):
    t = open(p, encoding="utf-8", errors="replace").read()
    m = re.search(r'<div class="article-content">(.*?)</div>', t, re.S)
    txt = re.sub(r"\s+", "", re.sub(r"<[^>]+>", "", m.group(1) if m else ""))
    if not txt:
        empty.append(os.path.relpath(p, ROOT))
print(f"   {len(empty)} page(s) contain no text at all (nothing to convert)")
for p in empty:
    print("     ", p)

size = sum(os.path.getsize(os.path.join(MD, f)) for f in disk)
print(f"\n=== total markdown size: {size / 1048576:.1f} MB ===")
print("\nRESULT:", "ALL CHECKS PASSED" if ok else "PROBLEMS FOUND")
sys.exit(0 if ok else 1)
