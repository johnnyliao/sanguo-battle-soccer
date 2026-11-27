# 三國戰鬥足球：2D 美術交付

依 [需求清單](../docs/art/README.md) 製作，日期 2026-11-27。交付分支為 `art-delivery`，供開發者審查後合併。

| 資料夾 | 內容 | PNG 數量 |
|---|---|---:|
| [第 1 批](incoming/batch1/) | 商店圖示、三張無字縮圖、Logo、選單背景、三色按鈕與按下版、四張 1024 寬橫圖 | 16 |
| [第 2 批](incoming/batch2/) | 39 項基本素材、兩張 1024 寬背景、九關編號參考圖與其 1024 寬版 | 43 |
| [第 3 批](incoming/batch3/) | 比賽介面、三種操作按鈕與暗版、18 張大招圖示、經驗素材與教學 | 33 |
| [第 4 批](incoming/batch4/) | 主公流派、徽章、被動、15 把武器、武器類型、營帳、裝備框與掉寶橫幅 | 32 |

合計 124 張交付 PNG，另有地圖座標 JSON。18 張頭像為基本表情；需求中的選配生氣表情未包含。三張商店縮圖均沒有文字，因此未複製相同內容為 `_notext`。

第 4 批的完整提示詞、檢查與重匯出指令見 [交付說明](incoming/batch4/README.md)。

## 原稿、提示詞與預覽

- [產圖清單與完整提示詞](source/generation_manifest.json)：每個檔案的尺寸、批次、透明背景要求與產圖提示詞。
- [原尺寸平面 PNG](source/generated/)：內建 `image_gen` 原生輸出，保留 alpha。沒有分層 PSD／Figma 原稿。
- [檢查總覽](source/previews/)：供快速檢查造型與介面元素的 JPEG，正式使用請取 incoming 的獨立 PNG。
- [檔案檢查紀錄](source/validation.json)：尺寸、透明像素抽樣與 SHA-256。
- [地圖點位](incoming/batch2/bg_map_ch1_nodes.json)：9 個關卡中心點，另附編號參考圖。

## 重匯出與檢查

在 Windows PowerShell、專案根目錄執行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/export-art.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools/validate-art.ps1
```

匯出工具使用 Windows System.Drawing 做尺寸輸出，採高品質縮放與邊界鏡射避免透明邊緣。1920×1080 橫圖附 1024×576 版本。遊戲程式與 Roblox 資產 ID 接入由開發者審查後處理。
