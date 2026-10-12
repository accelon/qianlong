# 永樂北藏切圖 — 狀態與交接

> **目錄已改名**（本文件其餘段落保留當時的舊名，對照如下）：
> `yb-out-prefix/` → `ylz-image/`、`yb-csv-prefix/` → `ylz-crop-pos/`。
> 現在 `ylz-image/` 已合流為 **6251 卷**（永樂北藏 3804 ＋ 乾隆藏補漏 2447），
> 逐卷來源見 `ylz-image.csv`，詳見 `ylz-image-report.md`。
> 舊目錄仍留在磁碟上作為來源備份。

## 產出規格（依使用者確認）

| 項目 | 規格 |
| --- | --- |
| 輸出 zip | `ylz-image/<永樂北藏編號>-<卷號>.zip`（**不含函號**），store 模式（不壓縮），只放折圖 |
| 折圖命名 | `0001.jpg`、`0002.jpg`…（固定「0＋三位整數」），**每圖三折由右到左**：最右＝001、中間＝002、最左＝003，第二圖最右＝004… |
| 折圖尺寸 | 一律 500×1105（1 : 2.21，手機近全屏） |
| 檔案大小 | 整卷**第一折**約 100KB，其餘全部 50~60KB（二分搜尋 JPEG 品質達成） |
| CSV | `ylz-crop-pos/<永樂北藏編號>-<卷號>.csv`，**不放入 zip** |
| 來源清單 | `ylz-image.csv`：逐卷記錄來源（`yonglebeizang` 彩圖三折／`yonglebeizang-fill` 黑白二折）、折數、經名 |
| CSV 欄位 | `page, fold, file, src_file, src_w, src_h, out_w, out_h, rot_deg, frame_top, frame_bottom, x0, x1, y0, y1, col0..col4, row0..row16, jpeg_q, kb, damaged, short_cols, dark_frac, frame_gaps, paper_med` |
| 重製能力 | 對原圖套 `rot_deg` 旋轉、裁 `x0,x1,y0,y1`、縮到任意尺寸，再把橫貫整張圖的列塗白（版框線，見下）即可重製，無需重算；`col*`／`row*` 是字心原圖座標 |

## 演算法（不用固定值、不用均勻格線外推）

1. 版框上下內緣＝貫穿整頁的長橫線（rowfrac > 0.5）
2. skew＝上框線斜率（逐頁不同，實測 −0.47°~+0.52°），雙線性轉正
3. 框內欄向墨量分段 → 每欄實際範圍。過寬的段（>1.3 倍欄寬）切開成多欄，
   **切開後的子段要通過 `is_text_col()` 才算文字欄**：要有字塊，且沿字方向不能有
   一整條連續的墨（實測文字欄最長 0.065 框高、磨損的摺線 0.08~0.12、花紋 0.2~1.0）。
   版框花紋與版心摺線因此不會變成候選欄
4. 折界＝**貫穿框內的摺線**（版心長直線：>0.35 框高、寬 ≤0.3 倍欄寬、最長墨段 ≥0.08 框高、
   相隔 <2 倍欄寬者併為一條、頁緣 2% 內丢掉）。一折的寬度用幾何線索算：
   **一折 ≈ 0.47 × 框高**（一折 5 行、17 字填滿框高，行距 ≈ 1.66 字距；全庫實測 0.470），
   再把摺線配成一條等距鏈（只抓到兩條也能成鏈）；
   摺線不足或鏈的折寬不合理（不在 0.65~1.5 倍）時，退回「最大的兩個內部間距」，
   再不行才整頁略過
5. **折寬＝該折欄距 × 5、五格等分**：把該折的欄放進最接近的格、整格平移讓五格對準五欄；
   裁切框不越過摺線。右緣＝最後一個真文字欄右緣＋小邊距（空欄和文字欄一樣寬）
6. 字心：字方向剖面，門檻自調取「剛好 17 段」
7. 正文驗證：5×17 有字率 ≥ 60%（經變圖／音釋／牌記自然淘汰）；逐格量墨，五格等分
8. **版框橫線塗白**：折是 17 等分、幾乎正好填滿框內，所以版框上下緣的橫線會落在
   第 1／第 17 格裡（實測約 1% 的頁折）。把「墨跡橫貫 >45% 寬」的列塗白，
   但**只限最上／最下 1.5 格內**——實測文字最密的一列可到 46%，不設限會誤塗到字
   （81 折裡中 3 折）。乾隆藏那條線用的同一招，但那邊文字列最多只到 34%。
9. 破損記錄（水漬／蟲蛀）：`paper_med < 175`、`dark_frac > 30%`、`frame_gaps ≥ 5`、`short_cols ≥ 3`

## 執行

```powershell
# 批次（獨立行程，關掉 session 也會繼續）
$env:YB_PYTHON="...python.exe"
Start-Process bun -ArgumentList 'run','yb-batch.ts','--jobs=10','--out=yb-out','--csv-out=yb-csv',
  '--cool-every=50','--cool-seconds=30','--pause-every=10','--pause-seconds=30' `
  -WorkingDirectory <專案> -WindowStyle Hidden `
  -RedirectStandardOutput yb-stdout.log -RedirectStandardError yb-stderr.log

# 進度
Get-Content yb-out\_progress.log -Tail 20
(Get-ChildItem yb-out -Filter *.zip).Count

# 單卷重跑（覆蓋）
python yb-frame.py <頁面目錄> <輸出目錄> --skip=1 --limit=999 --csv=<csv路徑>
```

## 進度與已知事項

- 進度：見 `yb-out/_progress.log` 最後一行；`yb-out/*.zip` 數量＝已完成卷數
- 續跑：輸出目錄已有同名 zip＋csv 就自動跳過
- **重覆行**：曾用影像相關比對相鄰掃瞄圖的邊緣欄（實測相關係數 0.04~0.14＝無重覆），判定邏輯保留、本卷無需去重
- **破損比例偏高**（約 12% 的頁被標記）✗：可能是 `frame_gaps` 門檻偏敏感；折圖不受影響，要調整只需重寫 CSV，不必重切
- Go 版（`go/ybcuts/`）可跑但只快約 7% ✗、且少收數頁 ✗，故未採用；真正瓶頸是 JPEG 品質二分搜尋（每折最多 8 次編碼），不是語言
- 效能關鍵：`Bun.spawnSync` 會阻塞事件迴圈（10 並行變 1 並行，3.4 卷/分 ✗）；改用非同步 `Bun.spawn` 後為 25 卷/分 ✓

## 折圖 ↔ 文字鏈結（工具鏈在 `yblink/`，技術細節見 `README.md`）

**這條線的程式已經完成，但先停在這裡——`yb-out` 還在重切（舊的已改名成
`yb-out-prefix`，新的 `yb-out` 還沒長出來），等它完工再跑一次就好。**
標記與對位都是可續跑的，不需要重做已完成的部分。

已經做完的：

| 產出 | 內容 |
| --- | --- |
| `yb-txt/` | `qianlong-fixed/` 2171 個 `.txt` 整理成 1461 個 `<乾隆藏編號>-<卷號>.txt`（717 個略過：序／目錄／索引）。**0 個檔名重複**。已完成對位的卷加了 `^pg` 標記 |
| `yb-md/` | **永樂北藏 markdown**：把龍藏 `lz-md/` 的軟折行段落，按 OCR 得到的原書分欄資訊疊上 `^pgNNN` 折圖錨點（**124 卷**，錨點位置平均相似度 0.9979） |
| `yb-link/ocr-fix.tsv` | OCR 校正對照表 4277 條（1 字 172、2 字 2342、3 字 1763） |
| `yb-link/number-map.tsv` | 永樂北藏編號 → 乾隆藏編號，1619 筆 |
| `yb-link/<卷>.tsv` `.json` | 逐折對照表（折圖 → 純文字行號區間、OCR 文字、校正後文字） |
| `yb-link/index.tsv` | 各卷統計彙總 |
| `yb-link/normalize.tsv` | 改名對照表（來源路徑 → 經名 → 卷號 → 新檔名） |

還沒做完的：`yb-md/` 目前 124 卷。`yb-txt` ∩ `lz-md` ＝ 1461，所以折圖切完後
理論上可以做滿 1461 卷；`yb-link/` 也只做到當初那批折圖為止。

**等 `yb-out`（與 `yb-csv`）就位後要跑的**：

```powershell
python yblink/normalize.py                       # 若 qianlong-fixed 有變才需要重跑
python yblink/batch.py --jobs=5 --mode=auto --watch=600
```

`batch.py` 每跑完一卷就會：寫 `yb-link/<卷>.tsv`／`.json` → 把 `^pg` 標記寫進
`yb-txt/<卷>.txt` → 把錨點疊進 `yb-md/<卷>.md`。已有 `yb-link/<卷>.json` 的卷會跳過，
所以直接跑就是續傳；`--watch=600` 讓它跑完一輪後每 10 分鐘重掃一次，追上新切出來的卷。
跑完再 `python yblink/ocrtable.py --build` 用更多樣本重建校正表。

資料夾位置不寫死在程式裡，見 `yblink/paths.py`（`YB_ZIP_DIR`、`YB_CSV_DIR`、
`YB_TXT_DIR`、`YB_LINK_DIR`、`YB_MD_DIR`、`YB_OUT_MD`）；目前切圖那條線的輸出在
`yb-out-prefix`／`yb-csv-prefix`，所以現階段要驗切圖品質時得帶
`--out=yb-out-prefix --csv-dir=yb-csv-prefix`。

實測速度：算術模型路徑（預設）一卷約 6 秒（4 次 OCR），
逐折 OCR + DP 一卷約 100 秒（80 次 OCR）。3807 卷全走模型路徑約 40 分鐘（5 並行）。

### 兩個要記得的事

1. **`yb-out/0001-001.zip` 原本是壞的**（早期實驗留下的：只收了第 4–27 頁、
   而且每頁三折的順序是反的）。已用 `yblink/recut.py 0001-001` 重切過，
   現在與 `yblink/model.py` 的算術模型完全一致（72/72）。
   `0084-074`、`0117-002` 有 zip 但 CSV 沒寫成，也一併重切了。
2. **`yb-frame.py` 會把正常的正文葉判成非正文而排除** ✗→**已修（2026-10-10）**：
   主因是折界用「最大的兩個欄心間距」猜，卷首／版心不規則時就推出界（`fold out of range`）
   或把正文葉判成非正文。現在折界改由貫穿框內的摺線定（見上面「演算法」4、5），
   實測大量正文葉被救回：`1113-020` 17 頁→43 頁、`1116-002` 11 頁→39 頁、
   `1094-001` 21 頁→23 頁；`1113-020` 的有字格由 4245 增到 10757（2.5 倍）。
   剩下的排除理由是刻意的守門條件（經變圖／封面／卷末音釋頁）。

   **然後照 `--start=1094-001` 的順序重跑全藏**（舊演算法切的 118 卷已改名為
   `yb-out-prefix-oldcode`／`yb-csv-prefix-oldcode`，重跑時不會被跳過）：

   ```powershell
   $env:YB_PYTHON="C:\Users\yapch\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe"
   Start-Process bun -ArgumentList 'run','yb-batch.ts','--jobs=10',
     '--out=yb-out-prefix','--csv-out=yb-csv-prefix',
     '--cool-every=50','--cool-seconds=30','--pause-every=0' `
     -WorkingDirectory 'D:\2023\qianlong' -WindowStyle Hidden `
     -RedirectStandardOutput yb-stdout.log -RedirectStandardError yb-stderr.log
   ```

   `--start` 預設就是 `1094-001`（先跑 1094-001 之後的卷，再跑 0001-001…）；
   進行中的進度看 `yb-out-prefix/_progress.log`。
