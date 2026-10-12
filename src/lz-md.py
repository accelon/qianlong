#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Convert the downloaded laozai.cn volume pages into Markdown.

Output:  lz-md/<編號>-<卷數>.md  e.g. 0001-001.md, 1165a-001.md

Naming
------
<編號> is the 乾隆藏.csv identifier: the 經號 zero-padded to 4 digits, plus the
別本 letter when the catalogue lists several translations under one 經號
(1165a/b/c/d). <卷數> is the volume as a 3-digit number.

卷數 comes from the page title (卷第X / 卷X / 卷上中下). A 卷 split into
上/中/下 keeps one number and disambiguates with a letter suffix
(0010-001, 0010-001b, 0010-001c). Pages carrying no volume number are front or
back matter and take 000 (000b, 000c, ... when a work has several); a body text
with no volume number takes a sequential number inside its work.

Each file starts with a front-matter block recording the 經號, the catalogue row
it was cross-checked against, and the source URL.
"""
import csv as _csv
import json
import os
import re
import sys
from collections import defaultdict

from bs4 import BeautifulSoup
from markdownify import markdownify as md

ROOT = os.path.dirname(os.path.abspath(__file__))
HTMLDIR = os.path.join(ROOT, "lz-html")
OUTDIR = os.path.join(ROOT, "lz-md")
MAP = os.path.join(ROOT, "_lz_map.json")
MANIFEST = os.path.join(ROOT, "_lz_manifest.jsonl")
CSV_PATH = os.path.join(ROOT, "tables", "乾隆藏.csv")
REPORT = os.path.join(ROOT, "lz-md-report.txt")
INDEX = os.path.join(ROOT, "tables", "lz-index.csv")
BASE = "https://laozai.cn"

CN_DIGITS = {"〇": 0, "零": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
             "六": 6, "七": 7, "八": 8, "九": 9, "两": 2}
CN_UNITS = {"十": 10, "百": 100, "千": 1000, "万": 10000}
NUM = r"[一二三四五六七八九十百千〇零0-9]+"
LETTERS = "abcdefghijklmnopqrstuvwxyz"


def cn2int(s: str):
    s = s.strip()
    if s.isdigit():
        return int(s)
    if not s or any(c not in CN_DIGITS and c not in CN_UNITS for c in s):
        return None
    total = section = number = 0
    for ch in s:
        if ch in CN_DIGITS:
            number = CN_DIGITS[ch]
        elif ch in CN_UNITS:
            unit = CN_UNITS[ch]
            if unit == 10000:
                section = (section + number) * unit
                total += section
                section = number = 0
            else:
                section += (number or 1) * unit
                number = 0
    return total + section + number


RE_JUAN = re.compile(r"卷\s*(?:第)?\s*(" + NUM + r")")
RE_SHANG = re.compile(r"卷\s*(?:第\s*" + NUM + r"\s*)?([上中下])")
RE_TAIL = re.compile(r"第\s*(" + NUM + r")\s*$")
RE_PREFIX = re.compile(r"^\s*\d+\s*[\.\、]\s*")
SHANG = {"上": 1, "中": 2, "下": 3}

AUX_WORDS = ["序", "目錄", "目录", "品目", "翻譯記", "翻译记", "譯記", "译记",
             "後序", "后序", "讚", "赞", "銘", "铭", "附", "音釋", "音释",
             "緣由", "缘由", "緣起", "缘起", "行狀", "行状", "塔銘", "塔铭",
             "批答", "欽錄", "钦录", "願文", "愿文", "題", "题", "詩", "诗",
             "御製", "御制", "敕", "並序", "并序", "述", "記", "记", "傳", "传",
             "表", "碑", "謝", "谢", "疏", "偈", "頌", "颂"]


def norm_name(s: str) -> str:
    s = re.sub(r"[（(][^）)]*[）)]", "", s)
    return re.sub(r"[\s\u3000·・,，.。、:：;；'\"“”‘’!！?？\-—_/／|]+", "", s)


def classify(work: str, title: str):
    """(volume or None, sub-order, kind)."""
    base = RE_PREFIX.sub("", title).strip()
    m = RE_JUAN.search(base)
    if m:
        v = cn2int(m.group(1))
        if v:
            s = RE_SHANG.search(base)
            return v, (SHANG[s.group(1)] if s else 0), "juan"
    m = RE_SHANG.search(base)
    if m:
        return SHANG[m.group(1)], 0, "juan-shang"

    nw, nb = norm_name(work), norm_name(base)
    if nw and nw not in nb:
        return None, 0, "aux-foreign"
    leftover = nb.replace(nw, "", 1) if nw else nb
    if any(w in leftover for w in AUX_WORDS):
        return None, 0, "aux-word"
    m = RE_TAIL.search(base)
    if m:
        v = cn2int(m.group(1))
        if v:
            return v, 0, "tail-number"
    return None, 0, "body-unnumbered"


def main():
    mapping = json.load(open(MAP, encoding="utf-8"))
    manifest = [json.loads(l) for l in open(MANIFEST, encoding="utf-8")]

    rows_by_jinghao = defaultdict(list)
    for r in _csv.DictReader(open(CSV_PATH, encoding="utf-8")):
        rows_by_jinghao[r["經號"]].append(r)
    for v in rows_by_jinghao.values():
        v.sort(key=lambda r: r["編號"])

    os.makedirs(OUTDIR, exist_ok=True)
    for old in os.listdir(OUTDIR):
        if old.endswith(".md"):
            os.remove(os.path.join(OUTDIR, old))

    groups = defaultdict(list)
    for rec in manifest:
        groups[(rec["category"], rec["path"].split("/")[3])].append(rec)

    stats = defaultdict(int)
    collisions = []
    bieben_notes = []
    seen_names = {}
    planned = []

    for (cat, work), recs in groups.items():
        info = mapping.get(f"{cat}\u0000{work}")
        if info is None:
            stats["UNMAPPED-WORK"] += 1
            continue
        overrides = info.get("file_overrides", {})

        # split files by the 經號 they belong to (a few dirs bundle works)
        by_jinghao = defaultdict(list)
        for rec in recs:
            ov = overrides.get(rec["name"])
            if ov:  # file overrides use English keys; normalise to CSV keys
                ov = {"經號": ov["jinghao"], "編號": ov["bianhao"],
                      "經名": ov["csv_name"], "別本": ov.get("bieben", "")}
            jh = ov["經號"] if ov else info["jinghao"]
            by_jinghao[jh].append((rec, ov))

        for jh, entries in by_jinghao.items():
            csv_rows = rows_by_jinghao.get(jh) or [None]
            # only rows that actually carry a 別本 letter make a work 別本;
            # a bare -t1/-h1 附經 row shares the 經號 but not its identity
            is_bieben = len(csv_rows) > 1 and any(
                r and r["別本"].strip() for r in csv_rows)

            # --- split into 別本 groups when the catalogue lists several ---
            grp = {}
            kind_of = {}
            cur = 0
            last_key = None
            group_has_body = False
            max_group = 0
            for rec, ov in entries:
                vol, sub, kind = classify(work, rec["name"])
                kind_of[rec["path"]] = (vol, sub, kind)
                if kind.startswith("aux"):
                    grp[rec["path"]] = cur
                else:
                    if vol is None:
                        if group_has_body:
                            cur += 1
                            last_key = None
                            group_has_body = False
                    else:
                        key = (vol, sub)
                        if group_has_body and last_key is not None and key <= last_key:
                            cur += 1
                            group_has_body = False
                        last_key = key
                    group_has_body = True
                    grp[rec["path"]] = cur
                    max_group = max(max_group, cur)

            # A work always contains scripture: if every file looked like front
            # or back matter (the site's directory name often differs slightly
            # from the page title), promote the closest match to the body.
            if not any(not k.startswith("aux") for _, _, k in kind_of.values()):
                nw = norm_name(work)

                def score(rec):
                    nb = norm_name(RE_PREFIX.sub("", rec["name"]).strip())
                    common = 0
                    for a, b in zip(nw, nb):
                        if a != b:
                            break
                        common += 1
                    return (common, os.path.getsize(os.path.join(ROOT, rec["local"])))

                best = max(entries, key=lambda e: score(e[0]))[0]
                kind_of[best["path"]] = (None, 0, "body-unnumbered")
                stats["promoted-to-body"] += 1
            n_groups = max_group + 1
            if is_bieben and n_groups != len(csv_rows):
                bieben_notes.append(
                    f"  [{cat}] {work} (經號 {jh}): site splits into {n_groups} "
                    f"group(s), catalogue has {len(csv_rows)} 別本 rows")
            # --- assign volumes and name tokens ---
            body_seq = defaultdict(int)
            for rec, ov in entries:
                row = ov if ov else (
                    csv_rows[min(grp[rec["path"]], len(csv_rows) - 1)]
                    if is_bieben else csv_rows[0])
                jh_i = row["經號"] if row else jh
                bh = row["編號"] if row else jh
                cname = row["經名"] if row else info["csv_name"]
                vol, sub, kind = kind_of[rec["path"]]
                g = grp[rec["path"]]
                if vol is None:
                    if kind.startswith("aux"):
                        vol = 0
                    else:
                        body_seq[g] += 1
                        vol = body_seq[g]
                stats[kind] += 1

                if is_bieben:
                    letter = csv_rows[min(g, len(csv_rows) - 1)]["別本"] or ""
                    num = re.match(r"\d+", bh)
                    token = (num.group(0).zfill(4) if num else bh) + letter
                else:
                    num = re.match(r"\d+", bh)
                    token = (num.group(0).zfill(4) if num else bh.replace("-", ""))

                planned.append({
                    "rec": rec, "token": token, "vol": vol, "sub": sub,
                    "kind": kind, "jinghao": jh_i, "bianhao": bh,
                    "csv_name": cname, "grp": g, "category": cat,
                    "work": work, "is_bieben": is_bieben, "info": info,
                })

    # ---- resolve names: order by volume then 上中下 then site order ----
    planned.sort(key=lambda p: (p["rec"]["category"], p["work"],
                                p["token"], p["vol"], p["sub"]))
    index_rows = []
    for p in planned:
        base = f"{p['token']}-{p['vol']:03d}"
        name = base
        if name in seen_names:
            k = 1
            while f"{base}{LETTERS[k]}" in seen_names:
                k += 1
            name = f"{base}{LETTERS[k]}"
            collisions.append((name + ".md", p["rec"]["path"],
                               seen_names[base]))
        seen_names[name] = p["rec"]["path"]
        p["name"] = name

    # ---- render ----
    ok = fail = 0
    for p in planned:
        rec = p["rec"]
        src = os.path.join(ROOT, rec["local"])
        try:
            raw = open(src, encoding="utf-8", errors="replace").read()
        except OSError as e:
            fail += 1
            print("READ-FAIL", e, src)
            continue
        soup = BeautifulSoup(raw, "lxml")
        t = soup.select_one(".article-title h1") or soup.find("h1")
        page_title = t.get_text(strip=True) if t else ""
        body_el = soup.select_one(".article-content")
        if body_el is None:
            fail += 1
            print("NO-CONTENT", rec["path"])
            continue
        for junk in body_el.select("script, style, .controls, .article-nav"):
            junk.decompose()
        text = md(body_el.decode_contents(), heading_style="ATX",
                  bullets="-", strip=["a"]).strip()
        text = re.sub(r"\n{3,}", "\n\n", text)

        url = BASE + rec["path"]
        fm = ["---",
              f"經號: {p['jinghao']}",
              f"編號: \"{p['bianhao']}\"",
              f"經名: {p['csv_name']}",
              f"卷數: {p['vol']}",
              f"卷名: {page_title}",
              f"分類: {rec['category']}",
              f"來源: {url}",
              "---", ""]
        out = "\n".join(fm) + f"# {page_title}\n\n" + text + "\n"
        with open(os.path.join(OUTDIR, p["name"] + ".md"), "w",
                  encoding="utf-8") as f:
            f.write(out)
        ok += 1
        index_rows.append([p["name"], p["jinghao"], p["bianhao"], p["csv_name"],
                           p["vol"], page_title, rec["category"], p["kind"],
                           "別本" if p["is_bieben"] else "", url])

    # ---- reports ----
    index_rows.sort(key=lambda r: r[0])
    with open(INDEX, "w", encoding="utf-8-sig", newline="") as f:
        w = _csv.writer(f)
        w.writerow(["檔名", "經號", "編號", "經名", "卷數", "卷名", "分類",
                    "卷數來源", "別本", "來源網址"])
        w.writerows(index_rows)

    lines = [f"converted: {ok}   failed: {fail}   distinct names: {len(seen_names)}",
             "", "=== 卷數 source ==="]
    for k, v in sorted(stats.items(), key=lambda kv: -kv[1]):
        lines.append(f"  {v:6d}  {k}")
    lines += ["", f"=== files sharing a 卷數, letter-suffixed: {len(collisions)} ==="]
    for n, path, first in collisions:
        lines.append(f"  {n}  <- {path}   (already used by {first})")
    lines += ["", f"=== 別本 works where the site split != catalogue rows "
                  f"({len(bieben_notes)}) ==="] + bieben_notes
    txt = "\n".join(lines)
    open(REPORT, "w", encoding="utf-8").write(txt)
    print(txt.splitlines()[0])
    for k, v in sorted(stats.items(), key=lambda kv: -kv[1]):
        print(f"   {v:6d}  {k}")
    print(f"letter-suffixed files: {len(collisions)}")
    print(f"別本 works with split mismatch: {len(bieben_notes)}")


if __name__ == "__main__":
    main()
