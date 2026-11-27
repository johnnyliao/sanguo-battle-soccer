# 第 4 批：主公養成

依需求清單第八節交付，共 32 張 PNG：流派卡 3、流派徽章 3、被動技能 3、武將武器 15、武器類型 4、營帳背景 2、裝備格 1、掉寶橫幅 1。

流派卡 512×768，下方 30% 預留文字。徽章、被動、武器、裝備框 256×256；武器類型 128×128。營帳背景 1920×1080，另附 `camp_bg_1024.png`（1024×576）；掉寶橫幅 1024×384。除背景外均保留透明 alpha，裝備框中心透明。

使用內建 `image_gen` 逐張生成。原生平面 PNG 位於 `art/source/generated/`，無分層 PSD。完整最終提示詞見 `art/source/batch4_manifest.json`，總覽見 `art/source/previews/batch4.jpg`，尺寸、透明像素抽樣與 SHA-256 見 `art/source/batch4_validation.json`。

重匯出與檢查（專案根目錄）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/export-art.ps1 -Manifest art/source/batch4_manifest.json
powershell -NoProfile -ExecutionPolicy Bypass -File tools/validate-art.ps1 -Manifest art/source/batch4_manifest.json -Report art/source/batch4_validation.json
```

流派卡預留區檢查容許不超過 3/255 的重採樣微量 alpha。驗證涵蓋 31 張主要素材與另附背景縮小版，共 32 張。
