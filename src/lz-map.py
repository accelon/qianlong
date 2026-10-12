#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Map every laozai.cn volume page to its 乾隆藏 經號.

The site carries no 經號, so it is derived from 乾隆藏.csv by matching the work
(經名). Matching runs most-reliable-first:

  1. exact match on (normalised name, normalised category)
  2. explicit alias table
  3. exact match on normalised name alone
  4. same-category fuzzy / containment match
  5. same-category fuzzy acceptance is followed by a volume-count check

Names are normalised for traditional->simplified, CJK variant characters,
CBETA-style composite glyphs ([罩-卓+絹]) and bracketed suffixes the site adds
((二译), （80卷）).

Where several catalogue rows share one name, the row is chosen by the volume
count declared in the site's own work name, then by translator keyword, then by
the site's file count for that work. Anything still ambiguous is reported
rather than guessed.
"""
import csv
import json
import os
import re
import unicodedata
import difflib
from collections import OrderedDict, defaultdict

from zhconv import convert

ROOT = os.path.dirname(os.path.abspath(__file__))
SITEMAP = os.path.join(ROOT, "_lz_sitemap.json")
CSV_PATH = os.path.join(ROOT, "tables", "乾隆藏.csv")
OUT = os.path.join(ROOT, "_lz_map.json")
REPORT = os.path.join(ROOT, "lz-map-report.txt")

# ---------------------------------------------------------------- variants ---
VARIANT = {
    "犂": "犁", "毘": "毗", "瑠": "琉", "呪": "咒", "陁": "陀", "燄": "焰",
    "祕": "秘", "眞": "真", "徳": "德", "燈": "灯", "證": "证", "縁": "缘",
    "緣": "缘", "蘊": "蕴", "淨": "净", "樓": "楼", "薩": "萨", "囉": "啰",
    "薗": "园", "牀": "床", "塚": "冢",
}

# CBETA-style composite glyph notations, e.g. [罩-卓+絹] -> 絹 (不空羂索).
COMPOSITE = {
    "[罩-卓+絹]": "絹", "[罩-卓+绢]": "绢",
    "[羅-維+絹]": "絹", "[罗-维+绢]": "绢",
    "[口*縛]": "嚩", "[口*缚]": "嚩",
    "[陳-東+登]": "隥", "[陈-东+登]": "隥",
    "[木*患]": "槵", "[風*犮]": "颰", "[风*犮]": "颰",
    "[這-言+亦]": "迹", "[这-言+亦]": "迹",
    "[江-工+(止/(止*止))]": "澀", "[江-工+(止/(止*止))]": "涩",
    "[卄/幹]": "芉", "[卄/干]": "芉",
}

# Names the site spells differently from the catalogue (site work -> 編號).
ALIAS = {
    "小品般若波罗蜜经": "0006",              # 小品般若經
    "金刚能断般若波罗蜜多经": "0012",
    "金刚能断般若波罗蜜经": "0012",
    "大方广佛华严经": "0083",
    "药师瑠璃光如来本愿功德经": "0167",
    "药师瑠璃光七佛本愿功德经": "0168",
    "番字药师瑠璃光七佛功德经": "0169",
    "番字药师七佛本愿功德经": "0169",
    # different characters, not simple variants
    "辩正论": "1517",                        # 辨正論
    "解密显智成悲十明论": "1546",             # 華嚴十明論 (解迷顯智成悲十明論)
    "黄檗山断际禅师传心法要": "1567",          # 黃檗傳心法要
    "佛说泥犁经": "0571",                    # 佛說泥犂經
    "郁迦罗越问菩萨行经": "0031",             # 郁迦羅越問經
    "舍黎娑担摩经": "0862",                  # 大乘舍黎婆擔摩經
    "犍稚梵颂": "1076",                      # 犍椎梵讚
    "采华连王上佛受决经": "0269",             # 採華違王上佛授決經
    "佛说独证自誓三昧经": "0279",             # 如來獨證自誓三昧經
    "出家授近圆羯磨仪轨附苾刍习学略法": "1132",  # 出家授近圓羯磨儀範
    # this directory bundles three translations; the front matter belongs with
    # the 佛陀波利 version (0346), the unprefixed body file is 杜行顗 (0344)
    "佛顶尊胜陀罗尼经": "0346",
    "佛说佛顶尊胜陀罗尼经": "0345",   # 義淨譯, kept as its own site work
}

# Site pages with no catalogue row of their own: 《大清三藏聖教目錄》 is the
# catalogue of the 龍藏 itself. It keeps a reserved 經號 of 0000 so the file is
# still named and nothing is silently dropped.
SPECIAL = {
    "大清三藏圣教目录": {"jinghao": "0000", "bianhao": "0000", "bieben": "",
                         "csv_name": "(not in 乾隆藏.csv)",
                         "csv_category": "大乘般若部", "csv_juan": "1"},
}

VOL_SUFFIX = re.compile(r"[（(]\s*(\d+)\s*卷\s*[）)]")
# site keyword in the work name -> substring expected in the catalogue 作譯者
PERSON_HINTS = {
    "天亲": "天親", "世亲": "世親", "无著": "無著",
    "玄奘": "玄奘", "鸠摩罗什": "鳩摩羅什", "义净": "義淨", "不空": "不空",
    "法显": "法顯", "真谛": "真諦", "菩提流志": "菩提流志", "实叉难陀": "實叉難陀",
}

# aliases that only apply inside one site category: (site category, work) -> 編號
CAT_ALIAS = {
    # the site files the commentary (大乘百法明門論註) under the plain title
    ("此土著述", "大乘百法明门论"): "1629",
    # site content (住蘇州洞庭翠峰禪寺語, 舉古) is 雪竇重顯 = 明覺顯禪師語錄;
    # the catalogue's other 明覺 work (1652 明覺聰禪師語錄) is compiled by 寂空
    ("此土著述", "明觉禅师语录"): "1585",
}

# Per-file overrides for the few site directories that bundle several catalogue
# works together: (site category, work, site file name) -> 編號.
FILE_ALIAS = {
    ("大乘五大部外重译经", "佛顶尊胜陀罗尼经", "03. 佛顶尊胜陀罗尼经"): "0346",
    ("大乘五大部外重译经", "佛顶尊胜陀罗尼经", "佛顶尊胜陀罗尼经"): "0344",
    ("大乘五大部外重译经", "佛说佛顶尊胜陀罗尼经", "佛说佛顶尊胜陀罗尼经"): "0345",
    # 唯識三十論 sits inside the 大乘百法明門論註 directory as catalogue 1629-t1
    ("此土著述", "大乘百法明门论", "02. 唯识三十论颂"): "1629-t1",
}


def strip_marks(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn")


def norm(name: str) -> str:
    s = convert(name, "zh-cn")
    s = strip_marks(s)
    for k, v in COMPOSITE.items():
        s = s.replace(k, v)
    for k, v in VARIANT.items():
        s = s.replace(k, v)
    s = re.sub(r"\[[^\]]*\]", "", s)          # unmapped composite notations
    s = re.sub(r"[（(][^）)]*[）)]", "", s)      # parentheticals added by site
    s = re.sub(r"[\s\u3000·・,，.。、:：;；'\"“”‘’!！?？\-—_/／|]+", "", s)
    return s


cat_norm = norm


def pick_row(cands, work, nfiles):
    """Choose one catalogue row when several share a normalised name."""
    if len(cands) == 1:
        return cands[0], "single"
    # several rows that share one 經號 are 別本 (variant editions) of one work
    jinghaos = {r["經號"] for r in cands}
    if len(jinghaos) == 1:
        return cands[0], "bieben-multi"
    m = VOL_SUFFIX.search(work)
    if m:
        want = int(m.group(1))
        hit = [r for r in cands
               if r["卷數"].strip().isdigit() and int(r["卷數"]) == want]
        if len(hit) == 1:
            return hit[0], "vol-suffix"
    for kw, form in PERSON_HINTS.items():
        if kw in work:
            hit = [r for r in cands if form in r["作譯者"]]
            if len(hit) == 1:
                return hit[0], "translator"
    hit = [r for r in cands
           if r["卷數"].strip().isdigit() and int(r["卷數"]) == nfiles]
    if len(hit) == 1:
        return hit[0], "file-count"
    return None, None


def main():
    data = json.load(open(SITEMAP, encoding="utf-8"))
    rows = list(csv.DictReader(open(CSV_PATH, encoding="utf-8")))

    by_norm = defaultdict(list)
    by_norm_cat = defaultdict(list)
    by_bianhao = {}
    for r in rows:
        n = norm(r["經名"])
        by_norm[n].append(r)
        by_norm_cat[(n, cat_norm(r["類別"]))].append(r)
        by_bianhao[r["編號"]] = r

    # (category, work) -> list of items, so we know each work's file count
    works = OrderedDict()
    for cat, items in data.items():
        for it in items:
            w = it["path"].split("/")[3]
            works.setdefault((cat, w), []).append(it)

    resolved = {}
    stats = defaultdict(int)
    unmatched = []
    ambiguous = []
    review = []

    for (cat, work), items in works.items():
        n = norm(work)
        c = cat_norm(cat)
        nfiles = len(items)

        if work in SPECIAL:
            meta = dict(SPECIAL[work], match="special", category=cat, work=work,
                        site_files=nfiles, file_overrides={})
            stats["special"] += 1
            review.append(("special", cat, work, meta["csv_name"], meta["jinghao"]))
            resolved[f"{cat}\u0000{work}"] = meta
            continue

        row = how = None
        if work in ALIAS and ALIAS[work] in by_bianhao:
            row, how = by_bianhao[ALIAS[work]], "alias"
        elif (cat, work) in CAT_ALIAS:
            row, how = by_bianhao[CAT_ALIAS[(cat, work)]], "cat-alias"
        elif (n, c) in by_norm_cat:
            row, how = pick_row(by_norm_cat[(n, c)], work, nfiles)
            how = f"exact-cat/{how}" if how else None
        if row is None and n in by_norm:
            row, how = pick_row(by_norm[n], work, nfiles)
            how = f"exact/{how}" if how else None
        if row is None:
            pool = [(k[0], v) for k, v in by_norm_cat.items() if k[1] == c]
            if pool:
                best = difflib.get_close_matches(
                    n, [p[0] for p in pool], n=1, cutoff=0.82)
                if best:
                    cands = dict(pool)[best[0]]
                    row, sub = pick_row(cands, work, nfiles)
                    how = f"fuzzy/{sub}" if sub else None
                    if row is None and len(cands) == 1:
                        row, how = cands[0], "fuzzy"
                else:
                    cont = [(k0, v) for k0, v in pool if k0 and (k0 in n or n in k0)]
                    if len(cont) == 1:
                        row, how = cont[0][1][0], "contains"
        if row is None:
            unmatched.append((cat, work, nfiles))
            continue
        stats[how] += 1
        if not how.startswith("exact"):
            review.append((how, cat, work, row["經名"], row["經號"]))
        # per-file overrides for directories that bundle several catalogue works
        fov = {}
        for it in items:
            key = (cat, work, it["name"])
            if key in FILE_ALIAS:
                r2 = by_bianhao[FILE_ALIAS[key]]
                fov[it["name"]] = {"jinghao": r2["經號"], "bianhao": r2["編號"],
                                   "bieben": r2["別本"], "csv_name": r2["經名"],
                                   "csv_juan": r2["卷數"]}
        resolved[f"{cat}\u0000{work}"] = {
            "category": cat, "work": work,
            "jinghao": row["經號"], "bianhao": row["編號"],
            "bieben": row["別本"], "csv_name": row["經名"],
            "csv_category": row["類別"], "csv_juan": row["卷數"],
            "site_files": nfiles, "match": how, "file_overrides": fov,
        }

    json.dump(resolved, open(OUT, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    # ---- duplicate 經號 across different site works is the collision risk ----
    used = defaultdict(list)
    for v in resolved.values():
        used[(v["jinghao"], v["bieben"])].append((v["category"], v["work"]))

    lines = [f"site works: {len(works)}   resolved: {len(resolved)}   "
             f"unmatched: {len(unmatched)}", "",
             "=== match method ==="]
    for k, v in sorted(stats.items(), key=lambda kv: -kv[1]):
        lines.append(f"  {v:5d}  {k}")
    lines += ["", f"=== UNMATCHED site works ({len(unmatched)}) ==="]
    lines += [f"  [{c}] {w}  ({nf} files)" for c, w, nf in unmatched]
    lines += ["", f"=== REVIEW: non-exact matches ({len(review)}) ==="]
    for how, cat, work, csvname, jh in sorted(review, key=lambda x: x[0]):
        lines.append(f"  {how:22s} [{cat}] {work}  ->  {csvname}  (經號 {jh})")
    dupes = {k: v for k, v in used.items() if len(set(v)) > 1}
    lines += ["", f"=== duplicate 經號 across different works: {len(dupes)} ==="]
    for k, v in sorted(dupes.items(), key=lambda x: x[0][0]):
        lines.append(f"  經號={k[0]} 別本={k[1]!r}")
        for c, w in v:
            lines.append(f"       [{c}] {w}")
    lines += ["", "=== works with several files but no 卷 number in title (sample) ==="]
    sample = [f"  [{v['category']}] {v['work']} ({v['site_files']} files, "
              f"csv 卷={v['csv_juan']})"
              for v in list(resolved.values()) if v["site_files"] > 1
              and not re.search(r"卷", v["work"])][:15]
    lines += sample or ["  (none)"]

    # catalogue rows no site work points at: a large count would mean misses
    used_bh = {v["bianhao"] for v in resolved.values()}
    for v in resolved.values():
        for o in v["file_overrides"].values():
            used_bh.add(o["bianhao"])
    unused = [r for r in rows if r["編號"] not in used_bh]
    lines += ["", f"=== catalogue 編號 never used by any site page: {len(unused)} "
                  f"of {len(rows)} ==="]
    for r in unused:
        lines.append(f"   經號={r['經號']:>5} 編號={r['編號']:>8} [{r['類別']}] "
                     f"{r['經名']} 卷={r['卷數']}")
    txt = "\n".join(lines)
    open(REPORT, "w", encoding="utf-8").write(txt)
    print(f"resolved={len(resolved)} unmatched={len(unmatched)} "
          f"dupe_jinghao={len(dupes)}")


if __name__ == "__main__":
    main()
