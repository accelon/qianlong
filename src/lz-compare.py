#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Compare qldzj (github.com/liaoran123/qldzj) against lz-md (laozai.cn scrape).

Both corpora are matched to 乾隆藏.csv, the authority for what the 乾隆大藏經
contains, so the comparison is per catalogue 經號 rather than per folder name.

Run:  python lz-compare.py            (expects ./_qldzj to be cloned)
Out:  lz-compare-report.txt
"""
import csv, os, re, sys, json, importlib.util, collections, difflib
sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.abspath(__file__))
QL = os.path.join(ROOT, "_qldzj")
REPORT = os.path.join(ROOT, "lz-compare-report.txt")

spec = importlib.util.spec_from_file_location("lzm", os.path.join(ROOT, "lz-map.py"))
LZM = importlib.util.module_from_spec(spec); spec.loader.exec_module(LZM)

RANGE = re.compile(r"[（(]\s*第\s*(\d+)\s*卷\s*[～~-]\s*第\s*(\d+)\s*卷\s*[）)]")
LEAD = re.compile(r"^\d+\s*[-\.]\s*")

# extra name variants that appear only in the qldzj tree
EXTRA = {"萨昙分陀利经": "0132", "佛说人本欲生经": "0549", "佛说碱水喻经": "0554",
         "佛说阿耨颰经": "0564", "佛说梵摩喻经": "0604", "入大乘论": "1237",
         "唯识三十论": "1208", "高丽国普照禅师脩心诀": "1626", "杂譬喻经": "1361",
         "月灯三昧经": "0187"}

rows = list(csv.DictReader(open(os.path.join(ROOT, "tables", "乾隆藏.csv"), encoding="utf-8")))
by_norm, by_norm_cat, by_bianhao = collections.defaultdict(list), collections.defaultdict(list), {}
for r in rows:
    n = LZM.norm(r["經名"]); by_norm[n].append(r)
    by_norm_cat[(n, LZM.cat_norm(r["類別"]))].append(r); by_bianhao[r["編號"]] = r


def match(name, cat):
    n = LZM.norm(name)
    if name in EXTRA:
        return by_bianhao[EXTRA[name]], "extra-alias"
    if (cat, name) in LZM.CAT_ALIAS:
        return by_bianhao[LZM.CAT_ALIAS[(cat, name)]], "cat-alias"
    if name in LZM.ALIAS:
        return by_bianhao[LZM.ALIAS[name]], "alias"
    for pool in (by_norm_cat.get((n, cat)), by_norm.get(n)):
        if pool:
            r2, how = LZM.pick_row(pool, name, 0)
            if r2:
                return r2, how or "exact"
            if len(pool) == 1:
                return pool[0], "exact"
    pool = [(k[0], v) for k, v in by_norm_cat.items() if k[1] == cat]
    if pool:
        best = difflib.get_close_matches(n, [p[0] for p in pool], n=1, cutoff=0.84)
        if best:
            c = dict(pool)[best[0]]
            r2, _ = LZM.pick_row(c, name, 0)
            if r2:
                return r2, "fuzzy"
            if len(c) == 1:
                return c[0], "fuzzy"
    best = difflib.get_close_matches(n, list(by_norm), n=1, cutoff=0.88)
    return (by_norm[best[0]][0], "fuzzy-global") if best else (None, None)


# ---------------------------------------------------------------- qldzj -----
ql = collections.defaultdict(lambda: {"chars": 0, "txt": 0, "juan": 0,
                                      "juan_known": True, "folders": 0})
unmatched = []
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
            m = RANGE.search(base)
            juan = (int(m.group(2)) - int(m.group(1)) + 1) if m else 1
            if m:
                base = RANGE.sub("", base).strip()
            row, how = match(base, catname)
            if row is None:
                unmatched.append((cat, base))
                continue
            e = ql[row["經號"]]
            e["folders"] += 1
            e["juan"] += juan
            if not m:
                e["juan_known"] = False
            for dp, _, fs in os.walk(wp):
                for f in fs:
                    if f.endswith(".txt"):
                        e["txt"] += 1
                        e["chars"] += len(open(os.path.join(dp, f),
                                               encoding="utf-8", errors="replace").read())

# ---------------------------------------------------------------- lz-md -----
lz = collections.defaultdict(lambda: {"chars": 0, "files": 0, "juan": 0})
for r in list(csv.reader(open(os.path.join(ROOT, "tables", "lz-index.csv"), encoding="utf-8-sig")))[1:]:
    e = lz[r[1]]
    e["files"] += 1
    if int(r[4]) > 0:
        e["juan"] += 1
    t = open(os.path.join(ROOT, "lz-md", r[0] + ".md"), encoding="utf-8").read()
    e["chars"] += len(re.sub(r"^---.*?\n---\n", "", t, flags=re.S))

csv_juan = {}
rows_by_j = {}
for r in rows:
    rows_by_j.setdefault(r["經號"], r)
    if r["卷數"].strip().isdigit():
        csv_juan[r["經號"]] = max(csv_juan.get(r["經號"], 0), int(r["卷數"]))

cat_j = sorted({int(j) for j in rows_by_j if j.isdigit()})
L = [f"{'經號':>6} {'經名':<26}{'csv卷':>6}{'lz卷':>7}{'ql卷':>7}{'lz字':>11}{'ql字':>11}  較多"]
table = []
for j in cat_j:
    js = str(j)
    a, b = lz.get(js), ql.get(js)
    rec = {"j": js, "name": rows_by_j[js]["經名"],
           "csvj": csv_juan.get(js, 0),
           "lzj": a["juan"] if a else 0, "lzc": a["chars"] if a else 0,
           "qlj": b["juan"] if b else 0, "qlc": b["chars"] if b else 0,
           "qljk": b["juan_known"] if b else False}
    table.append(rec)

tl, tq = sum(x["lzc"] for x in table), sum(x["qlc"] for x in table)
lz_j = {x["j"] for x in table if x["lzc"]}
ql_j = {x["j"] for x in table if x["qlc"]}
cat_all = {x["j"] for x in table}

out = []
out.append("qldzj (GitHub) vs lz-md (laozai.cn) — coverage against 乾隆藏.csv")
out.append("=" * 78)
out.append("")
out.append("catalogue 經號                        : " + f"{len(cat_all)}")
out.append("lz-md   works with text               : " + f"{len(lz_j)}")
out.append("qldzj   works with text               : " + f"{len(ql_j)}")
out.append("present in both                       : " + f"{len(lz_j & ql_j)}")
out.append("only in lz-md                         : " + f"{len(lz_j - ql_j)}")
out.append("only in qldzj                         : " + f"{len(ql_j - lz_j)}")
out.append("in neither (absent from both)         : " + f"{len(cat_all - lz_j - ql_j)}")
out.append("")
out.append("lz-md   total scripture characters    : " + f"{tl:,}")
out.append("qldzj   total scripture characters    : " + f"{tq:,}")
out.append("lz-md / qldzj                         : " + f"{tl/tq:.3f}")
out.append("")
out.append("經號 where lz-md has more text         : " + f"{sum(1 for x in table if x['lzc'] > x['qlc'])}")
out.append("經號 where qldzj has more text         : " + f"{sum(1 for x in table if x['qlc'] > x['lzc'])}")
out.append("")
out.append(f"qldzj work folders that could not be matched to the catalogue: {len(unmatched)}")
for c, b in unmatched[:20]:
    out.append(f"    [{c}] {b}")
out.append("")

out.append("--- works present ONLY in lz-md ---")
for x in table:
    if x["lzc"] and not x["qlc"]:
        out.append(f"   {x['j']:>5}  {x['name']}  ({x['lzc']:,} 字, csv 卷={x['csvj']})")
out.append("")
out.append("--- works present ONLY in qldzj ---")
for x in table:
    if x["qlc"] and not x["lzc"]:
        out.append(f"   {x['j']:>5}  {x['name']}  ({x['qlc']:,} 字)")
if not any(x["qlc"] and not x["lzc"] for x in table):
    out.append("   (none)")
out.append("")

out.append("--- where qldzj carries MORE text (top 20 by difference) ---")
for x in sorted((x for x in table if x["qlc"] > x["lzc"]),
                key=lambda z: z["qlc"] - z["lzc"], reverse=True)[:20]:
    out.append(f"   {x['j']:>5}  {x['name'][:26]:<28} lz={x['lzc']:>9,}  "
               f"ql={x['qlc']:>9,}  diff=+{x['qlc']-x['lzc']:,}")
out.append("")

out.append("--- 卷 shortfall against the catalogue ---")
miss_lz = sum(max(0, x["csvj"] - x["lzj"]) for x in table if x["lzc"] or x["qlc"])
lz_short = [x for x in table
            if (x["lzc"] or x["qlc"]) and x["csvj"] and x["lzj"] < x["csvj"]]
out.append(f"   catalogue 卷 total (comparable works) : "
           f"{sum(x['csvj'] for x in table if x['lzc'] or x['qlc']):,}")
out.append(f"   lz-md 卷 shortfall                    : {miss_lz:,} 卷 "
           f"across {len(lz_short)} works")
out.append(f"   qldzj 卷 shortfall                    : "
           f"{sum(max(0, x['csvj'] - x['qlj']) for x in table if x['qljk'] and x['csvj']):,} 卷 "
           f"(only {sum(1 for x in table if x['qljk'])} works state 卷 in folder names)")
out.append("")
out.append(f"   {'經號':>6} {'經名':<28}{'csv卷':>6}{'lz卷':>6}{'ql卷':>6}{'缺':>5}")
for x in sorted(lz_short, key=lambda z: z["csvj"] - z["lzj"], reverse=True)[:20]:
    out.append(f"   {x['j']:>6} {x['name'][:26]:<28}{x['csvj']:>6}{x['lzj']:>6}"
               f"{x['qlj']:>6}{x['csvj']-x['lzj']:>5}")
out.append("")
out.append("Note: for several 此土著述 works laozai.cn and the catalogue divide the text")
out.append("into a different number of 卷, so a 卷 shortfall there is a numbering")
out.append("difference rather than missing text (character counts are near-equal).")
out.append("")
out.append("Note: qldzj keeps both 大方廣佛華嚴經 translations (60卷 and 80卷) under one")
out.append("folder series, so its 1,275,507 字 are attributed to 經號 83 while lz-md")
out.append("splits them: 83 = 592,806 字 and 84 = 703,532 字. Combined, lz-md has")
out.append("1,296,338 字 against qldzj's 1,275,507 — i.e. lz-md is not short here.")

txt = "\n".join(out)
open(REPORT, "w", encoding="utf-8").write(txt)
print(txt)
