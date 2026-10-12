#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Download all 乾隆大藏經 volume pages from laozai.cn, preserving site structure.

Raw HTML is stored under lz-html/<category>/<work>/<file>.html mirroring the
remote path, so the scrape is reproducible and re-runnable (resumes by skipping
already-complete files).
"""
import json
import os
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote

import requests

ROOT = os.path.dirname(os.path.abspath(__file__))
SITEMAP = os.path.join(ROOT, "_lz_sitemap.json")
OUTDIR = os.path.join(ROOT, "lz-html")
MANIFEST = os.path.join(ROOT, "_lz_manifest.jsonl")
BASE = "https://laozai.cn"

WORKERS = 8
RETRIES = 4
TIMEOUT = 45

_lock = threading.Lock()
_done = 0
_fail = []
_total = 0


def safe_name(name: str) -> str:
    """Strip characters Windows forbids in file names."""
    for ch in '<>:"/\\|?*':
        name = name.replace(ch, "_")
    name = name.rstrip(" .")
    return name or "_"


def encode_path(path: str) -> str:
    # path is like /longzang/<cat>/<work>/<file>.html  (already unicode)
    return BASE + quote(path, safe="/")


def rel_target(path: str) -> str:
    # drop the leading /longzang/ so we root directly at lz-html/
    parts = [safe_name(p) for p in path.strip("/").split("/")]
    if parts and parts[0] == "longzang":
        parts = parts[1:]
    return os.path.join(OUTDIR, *parts)


def fetch_one(sess: requests.Session, item):
    global _done
    path = item["path"]
    url = encode_path(path)
    dest = rel_target(path)

    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        with _lock:
            _done += 1
        return

    os.makedirs(os.path.dirname(dest), exist_ok=True)
    last = None
    for attempt in range(RETRIES):
        try:
            r = sess.get(url, timeout=TIMEOUT)
            if r.status_code == 200 and r.content:
                tmp = dest + ".part"
                with open(tmp, "wb") as f:
                    f.write(r.content)
                os.replace(tmp, dest)
                with _lock:
                    _done += 1
                    if _done % 250 == 0:
                        print(f"  {_done}/{_total} downloaded", flush=True)
                return
            last = f"HTTP {r.status_code}"
        except Exception as e:  # noqa: BLE001
            last = f"{type(e).__name__}: {e}"
        time.sleep(1.5 * (attempt + 1))

    with _lock:
        _fail.append({"path": path, "name": item["name"], "error": last})


def main():
    global _total
    data = json.load(open(SITEMAP, encoding="utf-8"))
    items = []
    for cat, lst in data.items():
        for it in lst:
            it = dict(it)
            it["category"] = cat
            items.append(it)
    # de-duplicate by path (the site repeats some entries across categories)
    seen = set()
    uniq = []
    for it in items:
        if it["path"] in seen:
            continue
        seen.add(it["path"])
        uniq.append(it)

    _total = len(uniq)
    print(f"targets: {len(items)} entries, {_total} unique paths", flush=True)
    os.makedirs(OUTDIR, exist_ok=True)

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        sessions = []

        def worker(chunk):
            s = requests.Session()
            s.headers["User-Agent"] = (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
            )
            sessions.append(s)
            for it in chunk:
                fetch_one(s, it)

        n = WORKERS
        chunks = [uniq[i::n] for i in range(n)]
        list(ex.map(worker, chunks))

    with open(MANIFEST, "w", encoding="utf-8") as f:
        for it in uniq:
            f.write(json.dumps({
                "path": it["path"],
                "name": it["name"],
                "category": it["category"],
                "local": os.path.relpath(rel_target(it["path"]), ROOT),
            }, ensure_ascii=False) + "\n")

    print(f"DONE ok={_done} fail={len(_fail)} total={_total}", flush=True)
    if _fail:
        with open(os.path.join(ROOT, "_lz_failures.json"), "w", encoding="utf-8") as f:
            json.dump(_fail, f, ensure_ascii=False, indent=1)
        for x in _fail[:20]:
            print("  FAIL", x["error"], x["path"], flush=True)


if __name__ == "__main__":
    main()
