# 第 1 批：商店門面

依 `docs/art/README.md` 製作，2026-11-27 交付。

- `icon_game.png`：512×512 關羽＋火焰足球遊戲圖示。
- `thumb_1.png`、`thumb_2.png`、`thumb_3.png`：1920×1080 無字宣傳圖；分別為三國搶球、小主公招募名將、三格大招展示。
- `bg_menu.png`：1920×1080 黃昏古代球場背景，中央留空。
- 上述四張橫圖另附 `_1024.png`（1024×576），供 Roblox 使用。
- `logo.png`：1024×512，透明背景標題。
- `btn_red.png`、`btn_blue.png`、`btn_gold.png`：512×160 無字按鈕，各附 `_pressed.png`。

縮圖全部為無字版，因此沒有內容相同的 `_notext` 複本。按鈕九宮格起始建議：`SliceCenter = Rect.new(96, 48, 416, 112)`；接入時依實際按鈕比例確認四角。

產圖使用內建 image_gen。完整提示詞、原始尺寸平面 PNG 位於 `art/source/`。原生輸出是平面圖片，沒有偽造 PSD 或分層原稿。此資料夾供開發者審查，未將素材自動接入遊戲或上架 Roblox。
