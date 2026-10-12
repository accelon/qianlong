# ylz-image 切圖完成記錄（合流版）

## 結果

| 項目 | 值 |
| --- | --- |
| 總卷數 | **6251 卷** |
| 總折數 | **602,958 折** |
| 來源 A | `yonglebeizang/`（永樂北藏原掃描，彩圖三折）：**3804 卷、375,504 折** |
| 來源 B | `yonglebeizang-fill/`（從乾隆藏補來的缺卷，黑白二折）：**2447 卷、227,454 折** |
| 折圖 | `ylz-image/<永樂北藏編號>-<卷號>.zip`，store 模式，內含 `001.jpg`…（500×1105） |
| 座標 | `ylz-crop-pos/<永樂北藏編號>-<卷號>.csv` |
| 逐卷來源 | `ylz-image.csv` |
| 驗收 | `yb-verify.py` 全部合格 ✓ |

驗收輸出：

```
檢查 6251 卷、CSV 602958 列
  永樂北藏來源（彩圖三折）: 3804 卷、375504 折
  乾隆藏補漏  （黑白二折）: 2447 卷、227454 折
  全部合格 ✓
```

## 兩條管線

| | 永樂北藏原掃描 | 乾隆藏補漏卷 |
| --- | --- | --- |
| 來源目錄 | `yonglebeizang/` | `yonglebeizang-fill/` |
| 掃描尺寸 | 3400×2411（彩圖） | 1064×1418（多為灰階） |
| 版面 | 一圖三折 | 一頁二折 |
| 程式 | `yb-frame.py` | `pdf-cuts-robust.py`（`pdf-cuts.py` 的容錯版） |
| 批次 | `yb-batch.ts` | `_q2/batch_ybfill.py` |
| 折圖來源 | 由 `yb-out-prefix/` 硬連結過來（內容相同） | 本次新切 |

> 一開始誤用 `yb-frame.py` 切補漏卷，2447 卷全部失敗
> （`fold gap not wider than line pitch`）——二折版的摺線幾何不同。
> 補漏卷必須走乾隆藏那條 `pdf-cuts.py`。

## 來源缺陷與處理

1. **`qianlongzang` 的 zip 卷號錯置**：`_source-map.tsv` 的 zip↔卷對應不可信。
   用 PDF 內嵌 JPEG 的位元組大小序列當指紋（`_q2/qlz_true_map.py`）比對 3557 卷：
   2738 相符、512 不符（大般若 卷110 以上整批位移）、307 多候選。
   補漏清單因此改用校正後的真卷號（`_q2/qlz-true-map.tsv`），**2447 卷的
   「真卷號 == 永樂卷號」達 100%**。
2. **41 張壞 JPEG**：`yonglebeizang-fill` 裡有 40 卷各含 1 張損壞 JPEG，
   原 `pdf-cuts.py` 會整卷中斷。改用 `pdf-cuts-robust.py` 跳過壞頁後重切，
   40 卷全部救回（`0675-042` 另計，共 41 卷重做）。

## 檔案

| 檔案 | 說明 |
| --- | --- |
| `_q2/batch_ybfill.py` | 補漏卷批次（解壓 → `pdf-cuts-robust.py` → store zip ＋ CSV） |
| `pdf-cuts-robust.py` | 容錯版二折切圖（壞 JPEG 跳過） |
| `_q2/qlz_true_map.py` | JPEG 指紋重建 `qianlongzang` 真實卷號 |
| `_q2/qlz-true-map.tsv` | 指紋校正結果（zip → 真實來源 PDF／真卷號／是否相符） |
| `_q2/refill_true.py` | 用真卷號重建補漏清單（`fill-final.json`、`yonglebeizang-fill/`） |
| `_q2/make_imagecsv.py` | 產生 `ylz-image.csv` |
| `_q2/diag_missing.py` | 診斷缺 CSV 的卷（找出壞圖） |
