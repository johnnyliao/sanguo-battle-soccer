# Goal
關羽大招改為「騎士衝擊」：3 秒無敵、撞到敵人撞飛倒地、可帶球衝進球門線（門框內）直接得分、也可按攻擊遠射；火龍特效在關羽身上，不在球上。AI 更常放大招。做完 commit、push main、部署 gh-pages、正式網址 e2e，通知使用者。

# Constraints / decisions
- 進門得分與撞飛倒地套用所有 rampage 型武將（趙雲突進撞人共用 rampageBump，也會倒地）。
- commit 不加 Co-Authored-By；push 前先 git fetch；部署流程見 CLAUDE.md / 前次 session。
- 不碰 src/ai/zz_debug.test.ts（不在 git）。

# Steps
- [x] 1. sim：tickRampage 在門框內球門線得分（rampageAtGoalMouth + ballIntoGoal）；rampageBump 一律倒地、RAMPAGE_BUMP_SPEED 380、VZ 220 — files: src/sim/actions.ts, constants.ts
- [x] 2. 改名 騎士衝擊；specialText 文字 — files: src/data/characters.ts, specialText.ts
- [x] 3. 修測試：specialText 長度測試（縮短文字）、kick.test「straight only hitstuns」、lunge/rampage 改期待 down；新增 rampage 進門測試（得分／門柱外不得分／不會烏龍） — verify: npx vitest run
- [x] 4. AI：src/ai/ai.ts SHOT_FULL_CHANCE 0.005→0.02、SPECIAL_RANGE 400→480、rampage/lunge 去掉 nearestOpponent 淨空條件
- [x] 5. 渲染：MatchScene rampageStartFx 加 'dragon' 跟隨關羽（rampageOf、mirror）；移除球上的火龍（dragonShotFx/drawDragonBall/endDragon/clearDragon）
- [x] 6. CLAUDE.md 大招規則更新
- [x] 7. tsc、vitest、build、本機 e2e（preview/special）→ commit、push、部署 gh-pages、正式網址 e2e → 通知使用者

# Lessons learned
- 背景 worker 在 session 結束時會中斷；使用者關機前要提醒。

---
# Goal 2（2026-11-20 下午）
蜀國大招都不需持球；接觸扣體力改百分比（關羽 15%、趙雲 20%、馬超鐵騎 10%）；諸葛亮大招改為隨機打一名敵人（擊倒 1 秒、扣 30%）；張遼新大招「遼來了」（所有敵人恐懼定身 3 秒、扣 10%），新角色圖與紫色特效。完成後 commit、push、部署、正式網址 e2e。

# Constraints / decisions
- 扣 X% ＝ 最大體力的 X%。
- 關羽不持球也能衝撞，只是沒有射門；其他國家的 rampage 武將維持原本扣 8。
- 諸葛亮：不再限前半場；目標＝隨機一名未倒地的敵人（含守門員）。
- 張遼：不需持球；被定身的敵人持球則球掉出（鬆球），人恐懼不能動 3 秒。
- 圖：art-src/zhangliao-sheet.png（5×4 角色）、art-src/zhangliao-fx.png（5 排特效：X 斬、鬼臉爆、鎖鏈鬼手、驚嘆號恐懼、鎖鏈碎裂）。

# Steps 2
- [x] 1. sim：蜀國大招不需持球（資料旗標）＋接觸扣百分比 — worker — verify: vitest
- [x] 2. sim：諸葛亮新大招（隨機擊倒） — worker — verify: vitest
- [x] 3. sim：張遼「遼來了」恐懼定身 — worker — verify: vitest
- [x] 4. AI：新規則下的放招時機 — worker
- [x] 5. 張遼角色圖＋特效切圖、sprites.ts、MatchScene 特效 — worker（me 看截圖）
- [x] 6. specialText、CLAUDE.md、預覽 e2e 更新 — me/worker
- [x] 7. tsc、vitest、build、本機 e2e → commit、push、部署、正式網址 e2e — me＋worker

---
# Goal 3（2026-11-20 晚）
司馬懿新大招：後跳後往前飛一大段，落地小範圍扣 15% 體力＋沉默 2 秒（不能放大招、不能攻擊）。新角色圖（6 排）與綠色烏鴉特效。完成後 commit、push、部署、正式網址 e2e。

# Constraints / decisions
- 不需持球；持球則球跟著飛、落地仍在腳下。
- 後跳 ~30px（9 tick），前飛 ~320px（30 tick），全程無敵；落地半徑 ~70px。
- 沉默 120 tick：不能 L、J（攻擊／鏟球／撲救／射門／蓄力）、K（傳球／叫球）；只能移動（持球可帶球）。
- 圖：art-src/simayi-sheet.png（1024×1536，6×4：待機、走、扇攻擊、起跳 4 格、空中/落地/起身、受擊/倒地/起身）、art-src/simayi-fx.png（1122×1402，5×4：羽扇斬、黑煙後跳、烏鴉飛行尾跡、落地綠焰圈、命中爆）。

# Steps 3
- [x] 1. sim：mode 'leap' + 沉默狀態 + 測試 — worker — verify: vitest
- [x] 2. AI：放招時機 — worker（與 3 平行）
- [x] 3. 切圖、sprites.ts、MatchScene 特效、e2e — worker（me 看截圖）
- [x] 4. CLAUDE.md、tsc/vitest/build → commit、push、部署、正式網址 e2e — me＋worker

---
# Goal 4（2026-11-20 晚）
許褚（GK）新大招「惡虎吞天」：背後召喚虎頭，自動吞下一次射正球門的射門，吐出成超遠高飛球；砸到敵人扣 80%＋暈眩 3 秒；沒吞到則往前小範圍震退扣 10%。新角色圖（6 排）與火虎特效。完成後 commit、push、部署、正式網址 e2e。

# Constraints / decisions（未指定處由 me 先定，已告知使用者）
- 不需持球；按下後「虎守」最長 5 秒（300 tick），許褚倒地時不攔。
- 攔截：敵方射正球門的射門（含必殺球）進入許褚 150px 內 → 吞；不含帶球衝門。
- 吞後球留虎口 0.5 秒，往敵方方向吐出高飛球 ~450px；落下途中碰到敵人扣 80%、暈眩 180 tick。
- 5 秒內沒吞到：前方 ~90px 半圓震退、扣 10%。
- 圖：art-src/xuchu-sheet.png（6×4：待機、走、攻擊、撲救 4 格、吼叫/持錘、受擊/倒地/起身）、art-src/xuchu-fx.png（5×4：地面爆裂、火虎環、虎頭吞（張口/漩渦/閉口發光）、虎頭吐、火虎尾跡）。

# Steps 4
- [x] 1. sim：mode 'tiger' + 測試 — worker — verify: vitest
- [x] 2. AI：放招時機 — worker（與 3 平行）
- [x] 3. 切圖、sprites.ts、MatchScene 特效、e2e — worker（me 看截圖）
- [x] 4. CLAUDE.md、驗證 → commit、push、部署、正式網址 e2e — me＋worker

---
# Goal 5（2026-11-20 晚）
曹操（MF）新大招「霸刀連斬」：5 秒內每秒 2 刀（共 10 刀），每刀朝前方最近敵人射出短程刀氣；命中扣對方 5%、曹操回 5%、對方硬直 0.3 秒。不需持球、可移動、持球時球留腳下。新角色圖（6 排）與七星刀氣特效。完成後 commit、push、部署、正式網址 e2e。

# Constraints / decisions（未指定處由 me 先定，已告知使用者）
- 刀氣射程 ~120px、命中第一個敵人即消失；目標＝面向那側最近敵人，沒有則正前方。
- 扣對方 5%（對方最大體力）、回曹操 5%（曹操最大體力，不超過上限）；硬直 18 tick。
- 不無敵；倒地／硬直中不出刀但 5 秒照算；J 照常。
- 體力歸零倒地改 1.5 秒（DOWN_TICKS_EXHAUSTED 150→90，使用者 11-20 決定），起身回 50% 不變；併入 sim worker。
- 圖：art-src/caocao-sheet.png（6×4：待機、跑、攻擊、第 4 排起手（舉刀×2、刺、架式）、第 5 排連斬循環、受擊/倒地/起身）、art-src/caocao-fx.png（5×4：藍色刀弧、七星點亮、刀氣飛行、紅色受傷火花、紅旋→藍金回復光圈）。

# Steps 5
- [x] 1. sim：mode 'slash' + 測試 — worker — verify: vitest
- [x] 2. AI：放招時機 — worker（與 3 平行）
- [x] 3. 切圖、sprites.ts、MatchScene 特效、e2e — worker（me 看截圖）
- [x] 4. CLAUDE.md、驗證 → commit、push、部署、正式網址 e2e — me＋worker

# Steps 5b（使用者 11-20：張遼太強）
- [x] 5. 張遼「遼來了」改成以自身為中心半徑 FEAR_RADIUS=200px（不再全體）；AI 改成範圍內有敵方持球者或 ≥2 人才放；preview e2e 的「5 人被定身」改成範圍內人數；特效爆圈大小對應範圍 — worker（已派；e2e 檢查由曹操畫面 worker 放寬為 ≥1）

---
# Goal 6（2026-11-20 晚）重做關羽
平常步行（新圖），大招才騎車：騎車往前衝一小段，上下有範圍，碰到的敵人被往外推擠、扣 20%；新特效。完成後 commit、push、部署、正式網址 e2e。

# Constraints / decisions（未指定處由 me 先定，已告知使用者）
- 新 mode 'ride'（取代關羽的 rampage；其他國家 rampage 不變）：不需持球；衝刺 260px／30 tick，全程無敵；持球則球跟著，門框內過球門線直接得分（同 lunge）。
- 碰撞帶：路徑上下 ±45px；碰到的敵人往遠離關羽路徑的方向推開（側向為主＋往前），扣 20%（bumpPct 0.2），硬直 18 tick，不倒地；每人一次。
- 舊 3 秒 rampage、J 必殺球拿掉。舊圖移到 art-src/old/*-v2.png。切圖：--rows 6 --keep-white --clear-pockets。
- 圖：art-src/guanyu-sheet.png（1024×1536，6×4：待機、走、攻擊、第 4 排（吼、上車、跳上、騎）、第 5 排（翹孤輪、騎刀前指、騎、下車）、受擊/倒地/起身）；art-src/guanyu-fx.png（1024×1536，6×4，256px 格：綠色刀弧、綠焰圈、排氣火焰、綠龍環、地面火痕、命中爆）。

# Steps 6
- [x] 1. sim：mode 'ride' + 測試 — worker — verify: vitest
- [x] 2. AI — worker（與 3 平行）
- [x] 3. 切圖、fx、sprites.ts、MatchScene、e2e — worker（me 看截圖）
- [x] 4. CLAUDE.md、驗證 → commit、push、部署、正式網址 e2e — me＋worker

---
# Goal 7（2026-11-20 晚）曹操自動揮刀
大招 5 秒內每 0.3 秒（18 tick）自動揮一刀（共 16 刀）：每刀＝前方近身攻擊判定（效果同普通攻擊）＋射一道刀氣（命中扣 5%、回 5%、硬直 0.3 秒）。揮刀不鎖移動、可帶球。每刀播一輪第 5 排揮刀動畫（約 0.3 秒）。

# Steps 7
- [x] 1. sim＋render＋e2e — worker — verify: vitest、e2e
- [x] 2. CLAUDE.md、commit、push、部署、正式網址 e2e — me＋worker
- 11-20：許褚 preview e2e「spits the ball」偶發失敗＝讀取時機太晚（吐球只飛約 0.9 秒）；已改為逐格記錄（已修）。

---
# Goal 8（2026-11-20 晚）
趙雲突進每撞到 1 敵人回自己 20%；張飛 AI 敵方射門時能放就放怒吼，怒吼能把範圍內的球震開（含高球、必殺球）；己方每人頭上顯示龍頭體力條（敵方不顯示，左上主角體力條移除）；大招不再在畫面中間顯示招式名。

# Constraints / decisions
- 怒吼範圍維持（中心前 30px、半徑 105px：站門中央時兩門柱距圓心約 50px，已全覆蓋），只新增震球。
- 體力條顏色：>60% 綠、30~60% 黃、<30% 紅。素材 art-src/stamina-bar.png（1448×1086 RGBA，三條：綠滿、黃半、紅少）。

# Steps 8
- [x] 1. sim＋AI（趙雲回血、怒吼震球、張飛 AI）— worker A — verify: vitest
- [x] 2. render（頭上體力條、移除中央招式名、移除左上體力條）＋e2e — worker B（與 1 平行）
- [x] 3. CLAUDE.md、commit、push、部署、正式網址 e2e — me＋worker
- [x] 4. 許褚顯示放大：displayHeight 60→84（縮放比 0.21→0.29，張飛 0.28、關羽 0.27），只動畫面 — me

---
# Goal 9（2026-11-20 晚）甄姬
魏國陣容改為 許褚 GK／曹操 DF／甄姬 MF／司馬懿 MF／張遼 FW（典韋下場，列入未入選）。甄姬大招「冰雨招來」：以施放位置為中心半徑 110px 的冰雨＋冰刺圈，持續 4 秒，固定在原地；範圍內敵人速度剩 15%（離開即恢復），每 0.5 秒扣 5%（最多 8 次）；持球不持球皆可。

# Constraints / decisions
- 甄姬：體型 S，能力 4/6/5/9/5（技巧型中場）；曹操改 DF 能力 7/5/7/6/8（使用者要求依位置調整）；每隊總和自動正規化 150。
- 圖：art-src/zhenji-sheet.png（1122×1402，5×4：待機、走、鏈攻擊、施法姿勢（甩鏈、舉鏈旋、閉眼施法、收）、受擊/倒地/起身）、art-src/zhenji-fx.png（1122×1402，5×4：冰弧（攻擊）、冰雨（循環）、冰刺圈（地面）、雪花爆（施放）、冰晶碎（命中/結束））。

# Steps 9
- [x] 1. data＋sim：陣容、mode 'icefield'＋測試 — worker — verify: vitest
- [x] 2. AI — worker（與 3 平行）
- [x] 3. 切圖、fx、sprites.ts、MatchScene、e2e — worker（me 看截圖）
- [ ] 4. CLAUDE.md、commit、push、部署、正式網址 e2e — me＋worker
- 11-20：諸葛亮 e2e 偶發失敗的真因＝擊倒後才截圖、受害者已起身；改成每格記錄是否有人倒地。e2e/sprite-machao.mjs、sprite-zhaoyun.mjs 截圖路徑仍指向舊 session，待改。

---
# Goal 10（2026-11-20 晚）角色音效（先蜀國 5 人）
每人：普攻音、大招音（依大招事件分段）、無字吶喊（formant 合成）。Web Audio 程式合成，不用音檔、不加套件。網址 ?sfx=1 試聽頁。非蜀國維持原通用音效。

# Steps 10
- [x] 1. synth.ts、characterSounds.ts、AudioPlayer 依角色、試聽頁、測試、WAV 檢查 — worker
- [x] 2. me 審 → commit、push、部署 → 使用者在 ?sfx=1 試聽 → 調整 → 再套魏、吳
- 11-20：體力條加粗採 A 版（寬 76、等比例，STAMINA_BAR_W/VSCALE 常數，B 版＝寬 60、垂直 1.5 倍）。
- 11-20：使用者試聽後「呼喊全部不夠兇」→ 重做 warCry（3 聲部、喉音、失真、沙啞、回音、shout bus），舊版保留為 X.shoutOld 供對照。
- 11-20：關羽／馬超／趙雲呼喊不行 → 各做 A 低沉吼、B 氣音喊、C 短促爆喝（X.shoutA/B/C）放試聽頁，待使用者挑選。
- 11-20：使用者選定 關羽 C、馬超 C、趙雲 C（短促爆喝）為遊戲內呼喊；張飛、諸葛亮維持 warCry 版。下一步：魏、吳角色音效。

---
# Goal 11（2026-11-20 晚）魏國五人音效
同蜀國：普攻、大招分段、呼喊（預設：許褚低沉長吼、其餘短促爆喝；每人另有 A/B/C 候選），試聽頁加魏國區。

# Steps 11
- [x] 1. 魏國 recipes、STAGES、試聽頁、測試、WAV 檢查 — worker
- [ ] 2. me 審 → commit、push、部署 → 使用者試聽挑呼喊 → 套用
- 11-20：魏國音效完成待試聽。已知：冰雨背景音固定 4 秒，提前結束（換場）時不會跟著停，只在離開比賽時停。
- 11-20：使用者選定魏國五人全部用 C 短促爆喝（含許褚）。

---
# Goal 12（2026-11-20 晚）
- [x] 1. 手機選角後黑畫面：原因＝比賽開始一次載入全部 15 人＋特效約 28MB、無載入畫面（舊版同樣慢，非退化）；已加載入進度條
- [x] 2. 曹操霸刀：普攻/鏟球/蓄力時照樣自動揮刀；0.3→0.2 秒一刀（25 刀）— worker
- [x] 3. 吶喊全部移除（遊戲內與試聽頁；未用到的 shout recipe/warCry 一併清掉）— 等 1 完成再派（避免同改 src/audio）
- [ ] 4. 部署（含 0202ddb 魏國呼喊 C）＋正式網址 e2e
- [x] 5. 載入優化：只載上場兩國角色、角色圖縮到 2.2× displayHeight、fx 180→120 格、選角後背景預載（SheetLoadScene）；首次 27.7→14 MB，慢 3G 137→68 s
- 待辦：machao-cavalry 與 181px fx（趙雲/諸葛亮/馬超/張飛）還沒縮；體力條圖片仍在比賽開始時才載（約 2 秒）。

---
# Goal 13（2026-11-24）孫策「揚帆起航」
孫策（吳 FW）大招：上船滑行 4 秒、移速 +50%；碰到敵人→下船（大招結束），該敵人被擊飛空中再落地共 1 秒；滑行中碰到的第一名隊友上船同行；持球不持球皆可，持球時球跟著船。新角色圖（大鎚）與水花特效。

# Constraints / decisions（未指定處 me 先定，已告知使用者）
- 持續 4 秒；船上孫策與乘客無敵；玩家照常操控方向（1.5 倍速），J/K 照常（射門、傳球不會結束航行）。
- 撞敵：只擊飛第一個碰到的敵人（不扣體力，可再調），持球者掉球；孫策下船、乘客一起下船。
- 乘客：第一個碰到、未倒地的隊友；上船後位置跟船走、不能自己動，下船後恢復。
- 圖：art-src/sunce-sheet.png（1122×1402，5×4：待機、跑、鎚擊、船（跳上、航行×2、跳下）、受擊/倒地/起身）；art-src/sunce-fx.png（1402×1122 橫式，5×4：地面爆裂、水花圈（召船）、浪花尾跡、水爆木屑（撞擊）、星星爆（擊飛落地））。

# Steps 13
- [x] 1. sim：mode 'sail'＋測試 — worker
- [x] 2. AI — worker（與 3 平行）
- [x] 3. 切圖、fx、sprites.ts、MatchScene（乘客上船繪製）、e2e — worker（me 看截圖）
- [x] 5. CLAUDE.md、commit、部署、正式網址 e2e — me＋worker
- [-] 4. 音效：使用者 11-24 喊停（要改用網路素材包整合）。孫策合成音效半成品備份在 scratchpad/sunce-sounds-wip.patch，src/audio 已還原。

---
# Goal 14（2026-11-24）小喬「吹飛」
吳國陣容：黃蓋 GK／太史慈 DF／周瑜 MF／小喬 MF／孫策 FW（甘寧下場，列入未入選）。小喬（S，3/6/5/9/5）大招：瞄準面向方向最近敵人（≤300px，沒有則前方 150px）腳下放櫻花陣，0.5 秒後原地櫻花龍捲風，半徑 90px 內敵人擊飛 1 秒、扣 50%、持球者掉球；施放點固定；持球不持球皆可。音效暫不做。

# Constraints
- 圖：art-src/xiaoqiao-sheet.png（1122×1402，5×4：待機、走、扇攻擊、施法（甩扇、舉扇、揮扇、收）、受擊/倒地/起身）；art-src/xiaoqiao-fx.png（1122×1402，5×4：櫻花扇弧、櫻花陣、櫻花龍捲、落地花圈、花爆）。

# Steps 14
- [x] 1. data＋sim：陣容、mode 'gust'＋測試 — worker
- [x] 2. AI — worker（與 3 平行）
- [x] 3. 切圖、fx、sprites、MatchScene、e2e — worker（me 看截圖）
- [x] 4. CLAUDE.md、commit、部署、正式網址 e2e — me＋worker（preview.mjs 首跑一次失敗：孫策預覽 pageerror「drawImage of null」，重跑 PASS；疑似預覽啟動競態，待觀察）
- 11-24：擊飛（孫策撞船、小喬吹飛）改為空中 0.6 秒（LAUNCH_AIR_TICKS 36，最高約 40px）＋落地躺 0.4 秒，總 1 秒；原本 1 秒全在空中會飛到約 116px 出畫面。

# Goal 15（2026-11-24）大喬「時空之門」
吳國陣容：黃蓋 GK／大喬 DF／周瑜 MF／小喬 MF／孫策 FW（太史慈下場，列入未入選）。大喬（M，5/6/7/6/8）大招：施放點開大範圍法陣（半徑 140px，固定原地，持續 2 秒）；施放後 0.5 秒把場上隊友（不含守門員；倒地、無敵、坐船中的不拉）瞬移到她身邊一圈約 50px，持球隊友帶球過來；法陣內敵人速度剩 30%，每 0.5 秒扣 5%（最多 4 次）。持球不持球皆可。武器花舞扇。音效暫不做。

# Constraints
- 圖：art-src/daqiao-sheet.png（1122×1402，5×4：待機、走、扇攻擊、施法（蹲、舉扇、張口、持扇）、受擊/倒地/跪/起身）；art-src/daqiao-fx.png（1448×1086，6 列×4：扇弧、法陣成形、法陣煙霧循環、召喚光柱、落地爆、鎖鏈）。
- 範本：甄姬冰雨（iceFields）＝固定法陣＋緩速＋DoT。

# Steps 15
- [x] 1. data＋sim：陣容、mode 'portal'＋測試 — worker（556 tests）
- [x] 2. AI — worker（與 3 平行）（敵持球者在 140px 內或 140px 內 ≥2 敵就放；563 tests）
- [x] 3. 切圖、fx、sprites、MatchScene、e2e — worker（me 看截圖；法陣 ADD 疊草地變黃白 → fx 轉透明圖＋法陣 NORMAL 混合）
- [x] 4. CLAUDE.md、commit（dfa5977）、部署（index-CQNt4CXb.js）、正式網址 e2e 7 支全 PASS — me＋worker

# Goal 16（2026-11-24）孫權「受箭回舟」（守門員）
吳國陣容：孫權 GK／大喬 DF／周瑜 MF／小喬 MF／孫策 FW（黃蓋下場，列入未入選）。孫權（M，6/5/7/6/9）大招：自家球門前召喚戰船橫擋門口（固定），持續 2 秒；期間擋下所有朝球門的球（射門、必殺球、傳球皆彈回成鬆球）、敵人穿不過船身、孫權無敵；每擋下一次（擋球或打孫權）船上多插一支箭（只是畫面）；第 2 秒戰船回轉射箭（沒擋到也射）：船前方約 300px×寬 240px 敵人擊退、扣 30%、持球者掉球。持球不持球皆可。音效暫不做。

# Constraints
- 圖：art-src/sunquan-sheet.png（1402×1122，5×4：待機、走、劍攻擊、施法（舉劍、指劍喊、收劍、指劍）、受擊/倒地/跪/起身）；art-src/sunquan-fx.png（1402×1122，5×4：箭矢、戰船浮現（水圈→出船）、戰船插箭 1～4 階、回轉萬箭齊發、箭落地爆）。

# Steps 16
- [x] 1. data＋sim：陣容、mode 'arrowship'＋測試 — worker（579 tests；球 z≤60 才擋；擋攻擊掛在 applyHit/applySpecialHit）
- [x] 2. AI — worker（與 3 平行）（敵方射門 |vx|≥200 且離門 250px 內，或敵持球者離門中心 200px 內；586 tests）
- [x] 3. 切圖、fx、sprites、MatchScene、e2e — worker（me 看截圖；戰船改 NORMAL 混合、放大 230px 並往場內偏；預覽改在門前）
- [x] 4. CLAUDE.md、commit、部署、正式網址 e2e — me＋worker（與周瑜一起；f55e2e1，index-DgV2ZIE1.js，正式網址 8 支全 PASS）

# Goal 17（2026-11-24）周瑜「赤壁東風」（中場；使用者要求沿用舊名，效果換新）
周瑜原本只有舊的持球必殺（赤壁東風蛇行球）、沒有角色圖。新大招：以施放位置為中心半徑 150px 東風陣（固定原地 3 秒）；施放瞬間範圍內敵人被吹到範圍外（擊退＋短暫硬直，持球者掉球）；之後 3 秒範圍內敵人速度剩 15%（緩速 85%，與冰雨／法陣取最慢）、每秒扣 10%（第 1、2、3 秒各一次，最多 30%）。持球不持球皆可。數值不變（5/6/5/10/4）。
- 圖：art-src/zhouyu-sheet.png（1122×1402，5×4：待機、走、劍攻擊、施法（舉手、按劍閉目、張臂、指劍）、受擊/倒地/躺/起身）；art-src/zhouyu-fx.png（1402×1122，5×4：火焰劍弧、龍捲成形、吹開爆環、東風陣循環、緩速下壓箭頭）。

# Steps 17
- [x] 1. sim：mode 'eastwind'＋測試 — worker（608 tests；靠邊者沿 170px 圈滑到場內）
- [x] 2. AI — worker（敵持球者 150px 內或 ≥2 敵；614 tests）
- [x] 3. 切圖、fx、render、e2e — worker（me 看截圖；拿掉過時的「需持球」e2e）
- [x] 4. 文件、commit、部署（孫權＋周瑜一起）、正式網址 e2e（f55e2e1，8 支全 PASS）

# Goal 18（2026-11-24）音效包整合（孫權、周瑜上線後）
- 來源：/home/safe3admin/150gameeffectsounds/（150 個 WAV，56 MB；LICENSES.txt：全部 CC0 1.0，不需標註；來源 CoMiGo、Kenney、Kronbits、lentikula）。分類：01 近戰（拳擊打擊、刀出鞘、刀切）、02 遠程（射擊、雷射）、03 爆炸破壞、04 魔法（火、冰、水、風、雷、土、植物、治療衝擊、充能）。
- 使用者要求：我自己配，先做試聽頁給他聽，確認後才接進比賽。舊 Sun Ce 合成音效 WIP 在 scratchpad/sunce-sounds-wip.patch（可能不再需要）。
- 做法草案：挑選的檔案轉 ogg/mp3（mono、短、裁靜音）放 public/sfx；15 名武將普攻、大招（分段：施放／命中／結束）＋通用（踢球、倒地、進球）對應表；?sfx=1 試聽頁改為播放檔案。
- 使用者提醒：有些檔案試聽聽不到聲音。挑選前先逐檔量峰值／RMS（含只有極低頻或極短的檔），過濾掉近乎無聲的，再挑。
- 掃描結果（scratchpad/sfx/scan.tsv）：沒有完全無聲的檔；排除 29 個重低音（手機／筆電喇叭聽不到，最可能是使用者說的「沒聲音」）＋3 個極小聲拔刀聲。
# Steps 18
- [x] 1. 候選素材＋試聽頁 ?sfx=pack（每格 A/B/C，音量拉齊）— worker；已部署（99 檔 5.6 MB）
- [x] 2. 使用者挑選 → 接進比賽 — worker（33 格；hit_punch=Break_01、hit_heavy=BlastImpact_03＋impact_punch_heavy_003@0.8）
- [x] 3. 文件、commit（1f8828b）、部署、正式網址 e2e（sfx 33 檔全 200、special、mobile PASS）

- 2026-11-24 使用者第一輪選擇（v2 試聽頁）：
  - kick_pass = B：SmallImpact_02_s01.wav
  - kick_shot = A：Impact_01_s01.wav
  - down = C：Break_02_s01.wav
  - goal = C：Retro Explosion Short 01_s05.wav
  - swing_heavy = C：ShootShort_s01.wav
  - swing_blade = A：knife_slice_48kHz_16bit_0.51s_9438a1db_s03.wav
  - swing_fan = C：Healing Spell Impact 9_s08.wav
  - zhangfei_roar = B：explosion_crunch_002_48kHz_16bit_1.26s_e0852ce0_s04.wav
  - guanyu_ride = A：Retro Explosion Swoshes 04_s05.wav
  - zhugeliang_charge = B：Healing Spell Impact 6_s08.wav
  - zhugeliang_hit = C：Healing Spell Impact 12_s08.wav
  - machao_cavalry = C：explosion_crunch_002_48kHz_16bit_1.26s_e0852ce0_s04.wav
  - zhaoyun_lunge = A：ZapLauncher_01_s01.wav
  - xuchu_guard = B：Earth Spell Impact 2_s07.wav
  - xuchu_swallow = A：EnergyZap_s01.wav
  - xuchu_spit = B：Shoot_04_s01.wav
  - caocao_wave = C：Shoot_03_s01.wav
  - zhenji_ice = B：Ice Spell Impact 2_s06.wav
  - zhenji_pulse = B：BreakGlass_01_s01.wav
  - simayi_leap = B：Retro Charge Off 11_s05.wav
  - simayi_land = A：EMP_02_s01.wav
  - zhangliao_fear = B：explosion_crunch_002_48kHz_16bit_1.26s_e0852ce0_s04.wav
  - sunce_sail = A：Water Spell Impact 2_s06.wav
  - sunce_crash = B：BlastImpact_03_s01.wav
  - xiaoqiao_gust = B：Wind Spell Impact 1_s07.wav
  - daqiao_portal = A：Healing Spell Impact 6_s08.wav
  - daqiao_summon = A：Healing Spell Impact 4_s08.wav
  - sunquan_ship = B：Water Spell Impact 2_s06.wav
  - sunquan_block = A：Impact_02_s01.wav
  - sunquan_volley = A：Laser Rifle 2_s09.wav
  - zhouyu_wind = B：Wind Spell Impact 3_s07.wav
  - hit_punch：重找（三個 impact_punch_medium 都不要）；hit_heavy：A（impact_punch_heavy_000）暫留但要再找更好的。
- 720b69b 部署後正式網址 e2e：sfx/preview/sprite/mobile/stamina PASS；special 首跑 waitForFunction 逾時一次、重跑 PASS（未查，待觀察）。

# Goal 19（2026-11-24）Roblox demo（規劃書 docs/roblox-rpg-plan.md）
- 使用者要求：先做一個 Roblox demo 給他看。
- 做法：另開 ~/sanguo-roblox（不動網頁版）；roblox-ts 把 src/sim 複本編譯成 Luau；Rojo 在 122 build 出 .rbxlx，使用者在筆電 Studio 開啟按 Play。Lune（Luau 執行器）在 122 跑 AI 對 AI 驗證規則。
- demo 範圍：色塊／方塊角色＋名字（圖片要上傳 Roblox 才能用，先不做）、斜側固定鏡頭、1 真人＋AI 5v5、鍵盤＋手機按鈕。
# Steps 19
- [ ] 1. 工具＋R0 可行性：裝 roblox-ts、Rojo、Lune；編譯 sim 複本、列不相容處並修到能編譯；Lune 跑 AI 對 AI 一場 — worker
- [ ] 2. 遊戲腳本：伺服器 60Hz 跑 step、客戶端送按鍵、畫面同步、鏡頭、UI — worker
- [ ] 3. rojo build → .rbxlx，交給使用者在 Studio 試玩 — me

---
# Goal R0（2026-11-24）Roblox 可行性試驗
src/sim（＋ai、data）用 roblox-ts 編譯成 Luau，在 Roblox 伺服器跑一場 AI 對 AI，結果（比分、最終狀態 hash）跟網頁版（Node）一致。

# Constraints / decisions
- 開發全在 Windows 這台；Roblox 專案在 roblox/（roblox-ts 3.0 + Rojo 7.7.1）。
- 唯一來源是 ../src/{sim,ai,data}：roblox/scripts/sync-game.mjs 把非 test 的 .ts 複製到 roblox/src/shared/game/（gitignore），不在 roblox/ 裡手改規則。
- 相容性修改改在 ../src，網頁版行為與 vitest 必須不變（亂數、hash 結果要跟原本逐位元相同）。
- 實作、編譯、跑測試一律派 Haiku 打工仔；me 只規劃、審查 diff。
- 平台差異集中在 src/sim/num.ts（PI、INF、abs/sqrt/min/max/floor/sign/sin/cos/atan2、round、len、fail、sortBy、imulU）；Roblox 版用 roblox/overrides/ 的同名檔覆蓋（sync 時蓋上）。sim/ai/data 不得直接用 Math、Infinity、陣列/字串 .length、throw new Error、Array.sort、Array.from、flatMap、null。
- 亂數：imulU 用純算術（16 位元拆半），兩邊同一份程式；web 結果須跟 Math.imul 版逐位元相同（測試比對）。
- round：web 用 Math.round；Roblox 用 floor(x+0.5)。sortBy 回新陣列且穩定（Luau table.sort 不穩定，Roblox 版自己寫插入排序）。
- hash.ts（JSON/structuredClone）只給 web；Roblox 版覆蓋，跨平台比對用第 3 步的正規化摘要（數字比 64 位元原始位元）。
- sync 改成只寫有變的檔、刪多的檔，不整個資料夾刪（整個刪會讓 rojo serve 當掉）。

# Steps R0
- [x] 1. sync 腳本 ＋ 首次 rbxtsc 編譯，分類統計錯誤（不修）：235 錯，見 roblox/R0-SURVEY.md — worker
- [x] 2a. src：新增 num.ts，sim/ai/data 全改用它＋null→undefined＋rng 改 imulU — worker — verify: 根目錄 vitest＋tsc
- [x] 2b. roblox：overrides（num、hash）、sync 支援覆蓋與增量寫入 — worker（與 2a 平行）
- [x] 2c. 合併後 rbxtsc 第二輪錯誤清到 0（只剩 `next` 是 Luau 保留字，已改名）— worker
- [x] 3. 對答案（web：25 checkpoints，蜀 1:0 魏，tick 14851 結束）：num.ts 加 f64hex/entriesSorted/kindOf/fnv1aUtf8；src/sim/digest.ts 正規化摘要；src/ai/selfplay.ts 可分段跑的 AI 對 AI；web 產生 golden（每 600 tick 比分＋摘要）寫成 roblox/src/server/golden.ts；Roblox 伺服器腳本分段跑（每段 task.wait）並自動比對，印 R0 PASS / 第一個不一致的 checkpoint — worker（me 定介面）
- [x] 3b. Luau 200 local 上限：actions.ts 改 `import * as C`、constants 拆 3 檔、build 加 check-locals — worker
- [x] 3c. 修 -0 語意（sign/min/max/round 照 JS，src/sim/jsmath.ts）＋ fdlibm sin/cos/atan2 純 TS 移植（src/sim/fdlibm.ts，Roblox 用；web 仍用 Math，測試比對 ~180 萬組逐位元相同）— worker；-0 字面值改成執行期算（Luau 可能把 -0 常數折成 +0）— me
- [x] 4. Studio 實跑：**2026-11-24 R0 PASS**（25 checkpoints 全一致，tick 14851，蜀 1:0 魏，Roblox 2.6s 含每段 task.wait）→ 結論已寫進 docs/roblox-rpg-plan.md

# 下次接續（R0 完成後）
- 還沒 commit（使用者沒要求；這台的 push 權限也還沒設）。下次先問要不要 commit／怎麼設 push。
- roblox/overrides/sim/hash.ts 還是舊版（hashState 會 error、多一個 cloneState）；web 的 hash.ts 已改成 hashState＝stateDigest。之後讓 Roblox 版也改成 stateDigest。
- 下一階段 R1（單人可玩）：斜側鏡頭、2D 看板角色、球場、手機搖桿＋按鈕、1 真人 vs AI。開工前先跟使用者確認範圍。

# Lessons learned（R0）
- Luau 每個函式（含模組最外層）最多 200 個 local；roblox-ts 把每個具名 import 和頂層 const/function 都變成 local。大檔用 `import * as C`，常數檔拆小；build 加 check-locals（>180 報錯）。
- Rojo 只能在 Studio 編輯模式 Connect（Play 中按會出現 "Http requests can only be executed by game server"）。
- 整個刪掉被同步的資料夾會讓 rojo serve 當掉 → sync 用增量寫入。

---
# Goal R1a（2026-11-25）Roblox 單人可玩（2.5D：3D 場景＋色塊角色）
在 Studio（含手機模擬）能 1 真人 vs AI 5v5 打完一場（含 PK）。R1b 再換 2D 看板角色圖。

# Constraints / decisions
- 使用者定案：3D 場景＋2D 看板角色（不做 3D 模型）；R1a 先用色塊＋名字。
- 伺服器權威：server 60Hz 跑 step（Heartbeat 累積，單幀最多補 4 tick）；client 只送原始按鍵；server 端做按鍵 latch（兩 tick 間按下又放開不漏）。
- 介面合約在 roblox/src/shared/net.ts（me 寫）：Remote 名稱、Setup/Snapshot/ClientInput/Command 型別、座標換算（1px = 0.2 stud；sim x→World X、y→World Z、z→World Y）。
- 快照 30Hz（每 2 tick）用 RemoteEvent（可靠）；client 內插。事件（goal 等）跟快照一起送。
- R1a 選國家：開場 GUI 選蜀／魏／吳，對手隨機另一國；真人操作前鋒（idx 4）。PK 順序兩隊都自動（autoPkOrders(state, -1)）。
- R0 檢查改成只在 Workspace 屬性 RunR0=true 時跑。
- 不加音效（R1b 以後）。共用規則不動 src/sim/ai/data。

# Steps R1a
- [x] 1. shared/net.ts 介面合約 — me
- [x] 2. server：match.server.ts 比賽迴圈、Remote、輸入 latch、快照、R0 開關 — worker A — verify: cd roblox; npm run build
- [x] 3. client：場地／球門／看台、色塊角色、球、特效區域、鏡頭、快照內插（render.ts、world.ts、camera.ts、main.client.ts）— worker B（與 2、4 平行）
- [x] 4. client：鍵盤（WASD/方向鍵、J/K/L、雙擊衝刺＋Shift）、手機搖桿＋三按鈕、HUD（比分、時間、階段橫幅、大招冷卻、PK 提示）、選國家畫面（input.ts、touch.ts、hud.ts）— worker C
- [ ] 5. 整合 build、審 diff、使用者 Studio 試玩 — me
- [ ] 6. overrides/sim/hash.ts 改成 hashState＝stateDigest — worker

# 下次接續（R1a，2026-11-25）
- 步驟 1–4 完成、build 過。已修：world.ts colourOf 先用後定義；input.ts 等 PlayerModule 卡住；main.client.ts 關掉聊天視窗與玩家清單（蓋住國家卡）。
- **Studio MCP 自動測試通過（邏輯面）**：選國家→開賽、快照 30Hz、WASD 移動（D 2 秒 +263px）、L 大招（遼來了）、AI 進球與各大招、上下半場換邊、平手進 PK、PK 打完（人類輪到時 5 秒自動踢）、結束畫面、再來一場 全部正常；輸出無錯誤（只有 Studio 預設的 rbxassetid://203785492 警告，非本專案）。
- **待使用者肉眼確認**：screen_capture 在這台拍不到 3D 視窗（Edit 模式預設底板也是全白，GUI 拍得到），所以場地、鏡頭角度、色塊角色、球、特效圈要使用者看。另：J/K 手感、手機觸控（Device Simulator）未測。
- rojo serve 在背景，新 session 要重開（cd roblox; rojo serve；若埠被占＝已在跑）。

# R1c（2026-11-25）改 3D 角色
- 使用者看過 2D 看板張遼覺得突兀，試做 3D 張遼後決定全部改 3D。15 武將用 Studio MCP generate_avatar（pipeline npc，文字描述，無武器）生成 R15 模型，存在 roblox/sanguo.rbxl 的 ServerStorage.Avatars（以 charId 命名）。
- 模型沒有整體資產 ID（只有各 MeshPart 的 MeshId），所以靠 sanguo.rbxl 進 git；ServerStorage 不歸 Rojo 管，不會被同步清掉。
- 生成會在 client 端 timeout，但 Studio 內仍會跑完（約 1.5～3 分）；要一個一個做、輪詢 Workspace。許褚第一次失敗（描述含裸露字眼），改皮背心後成功。
- 下一步：比賽中把色塊換成 3D 模型＋動作（跑、攻擊、倒地…，generate_animation）；再做武器（generate_mesh 綁手上）；特效沿用原 fx 圖做粒子序列圖／地面貼圖，戰船、鐵騎、虎等做 3D。

# Lessons learned（R1a）
- roblox-ts：頂層 const 呼叫「後面才定義」的 function 會是 nil（JS 有提升、Luau 沒有）。helper 函式放在最上面。build 後可掃 out/ 找 `local X` 前置宣告後頂層先呼叫。
- 沒有 avatar 時 PlayerScripts.PlayerModule 可能不出現，不要無限 WaitForChild 擋住啟動。
- 不用 @rbxts/services（沒裝）；用 game.GetService("...")。
- Studio MCP：user_mouse_input 的座標是 GUI 座標（扣掉頂欄 58px），截圖座標要減 58 才點得到；或先用 execute_luau 讀按鈕 AbsolutePosition。
- Studio MCP：screen_capture 這台抓不到 3D（全白），只能驗 GUI；邏輯用 execute_luau 在 Client 掛 Snapshot 監聽讀數據驗證。

# R1d 計畫（2026-11-25，待使用者確認）武器／普攻／受傷／大招／載具／特效，先做在武將展示
## 展示場
- 介面小視窗（ViewportFrame）不能顯示粒子、光束特效 → 新增 3D「展示場」（場外一塊平台＋木樁靶子＋環繞鏡頭）；格狀總覽保留。
- 每位武將按鈕：待機／跑步／普攻（打木樁，顯示刀光＋命中火花）／受擊／倒地起身／大招（含特效、載具）＋慢動作。
- 驗證：數據（動作幅度、位移、物件存在、跟手）＋介面小視窗截圖看武器與載具外型；粒子特效只能使用者肉眼看。
## 武器（generate_mesh，綁右手握點；雙持左右手）
- 劍：曹操（寶劍）、孫權（長劍）、周瑜（長劍）
- 長槍：張飛（銀頭紅纓蛇矛）、趙雲（銀槍紅纓）、馬超（長槍紅纓）
- 偃月刀：關羽（綠桿金刃）
- 雙月牙戟：張遼（雙持）
- 錘／棒：孫策（金龍頭錘）、許褚（鐵刺狼牙棒＋鐵鍊）
- 扇：諸葛亮（白羽扇）、司馬懿（黑摺扇）、大喬（紅金大摺扇）、小喬（粉色花扇）
- 鞭：甄姬（水晶珠鏈鞭）
## 動作（generate_animation，依武器類共用）
- 普攻 7 種：劍斬、槍刺、大刀橫掃、雙戟交叉砍、重錘砸、扇揮、鞭甩
- 受傷 4 種共用：受擊後仰、被擊飛倒地、起身、暈眩／恐懼發抖
- 大招 15 個：每人一個專屬施放動作
## 特效
- 普攻：武器刀光軌跡（Trail，依角色配色）＋命中火花（沿用原版 slash/impact 圖）
- 大招：沿用原版 fx 圖（重排成 Roblox 粒子序列圖上傳）＋地面法陣貼圖＋發光；每人對應原版事件
## 載具／召喚物（generate_mesh）
- 關羽：坐騎車（騎乘衝刺）；孫策：小船（可載隊友）；孫權：門前戰船＋箭；馬超：鐵騎（騎兵 ×5）；許褚：虎口
## 分批（每批做完先給使用者看）
- B1：展示場＋15 把武器＋7 普攻動作＋4 受傷動作＋刀光／火花
- B2：魏 5 人大招（許褚虎口、曹操霸刀連斬、甄姬冰雨、司馬懿鷹視狼顧、張遼遼來了）
- B3：蜀 5 人大招（張飛怒吼、關羽騎車、諸葛亮光彈、馬超鐵騎、趙雲遊龍穿刺）
- B4：吳 5 人大招（孫權戰船萬箭、大喬時空之門、周瑜東風、小喬櫻花龍捲、孫策揚帆）
- B5：接進正式比賽（依伺服器事件播放）
## R1d 進度（2026-11-25 使用者外出期間一次做完）
- [x] 展示場（3D 舞台＋木樁＋環繞鏡頭）、特效引擎 fx.ts、15 人大招表演（specialsWei/Shu/Wu.ts）— worker（sonnet）
- [x] 77 段原版特效重排 2×2 序列圖並上傳 → fxIds.ts（來源 roblox/fx-upload/fx-ids.json）
- [x] 15 把武器（ServerStorage.Weapons，RightGrip/LeftGrip 握點；幾何檢查 12/15 過，周瑜、許褚、司馬懿桿與前臂角度待目視）
- [x] 動作 25/26：普攻 7 類、受傷 4 種、大招 14（趙雲大招借用槍刺）
- [x] 載具／召喚物 6 個（ServerStorage.Props；關羽車、孫策船、箭的朝向待目視）
- [x] 整合測試 15×7 按鈕全過；修 3 處特效殘留；展示畫面改不蓋 Roblox 頂欄
- [ ] 待使用者回來螢幕開啟後：截圖目視武器握法、載具朝向、特效效果

# R1e（2026-11-25 夜）規格對齊＋實裝進比賽，目標：使用者起床時有可玩 demo
## 大招演出規格（依 CLAUDE.md 規則；展示場與比賽都照這個，驗收逐條比對）
| 武將 | 必須的演出順序（關鍵點） |
|---|---|
| 張飛 當陽怒吼 | 原地怒吼姿勢 → 從他「前方」擴散衝擊波環＋塵土 → 範圍內敵人被震退＋頭上暈眩星星；球被震開 |
| 關羽 騎士衝擊 | 立刻騎上摩托車（坐在座位、手握把手、車頭朝前）→ 0.5 秒往面向方向衝刺一段 → 路徑上下的敵人被往兩側推開、硬直；衝完下車 |
| 趙雲 遊龍穿刺 | 按下「立刻」往前突進（不先攻擊幾下）0.25 秒、槍朝前、龍形螺旋殘影 → 撞到的敵人被撞飛倒地 → 結束球在腳下 |
| 諸葛亮 破魔光彈 | 原地集氣 0.5 秒（手中光球變大發光）→ 光彈「水平往前飛」直線/追蹤飛向目標敵人（不是往上再掉下）→ 命中爆炸，敵人倒地 1 秒 |
| 馬超 西涼鐵騎 | 揮手召喚＋煙塵 → 5 名鐵騎從他身後衝出、各自衝向敵人（朝行進方向）→ 撞倒敵人；馬超本人照常行動 |
| 張遼 遼來了 | 戰吼姿勢 → 以自己為中心大範圍紫色鬼影/恐懼波擴散 → 範圍內敵人被鎖鏈定住、頭上驚嘆號、發抖 3 秒 |
| 司馬懿 鷹視狼顧 | 先「往後」小跳 → 往前飛撲一大段（烏鴉殘影）→ 落地圓形衝擊 → 附近敵人硬直＋頭上沉默符號 |
| 許褚 惡虎吞天（守門） | 身上出現虎形氣場（虎頭）→ 球飛來被虎口吞下 → 0.5 秒後吐出高吊火球砸向敵人 → 敵人暈眩；（沒吞到則前方小範圍震退） |
| 曹操 霸刀連斬 | 5 秒內自動連續揮刀（不停的斬擊）→ 每刀朝最近敵人飛出刀氣 → 命中硬直＋曹操身上綠色回血光 |
| 甄姬 冰雨招來 | 以施放點為中心地面冰霜圓陣＋天降冰雨＋冰刺 → 圈內敵人變慢、結霜、間歇受傷（不是整個冰封） |
| 孫策 揚帆起航 | 站在船甲板上（船頭朝前）滑行、浪花尾跡 → 撞到第一個敵人擊飛 → 下船 |
| 小喬 吹飛 | 最近敵人腳下出現櫻花印記 → 0.5 秒後原地捲起櫻花龍捲 → 敵人被捲上天再落下 |
| 大喬 時空之門 | 她腳下開大法陣 → 0.5 秒後隊友化光柱傳送到她身邊 → 陣內敵人變慢、被鎖鏈纏住 |
| 孫權 受箭回舟（守門） | 自家門前升起戰船橫擋 → 飛來的球被彈開、船上插箭 → 第 2 秒萬箭齊發射向前方敵人 → 擊退 |
| 周瑜 赤壁東風 | 施放點周圍風圈 → 敵人被吹出圈外 → 原地留下東風陣（風線旋轉）3 秒、陣內敵人變慢 |
## 步驟
- [x] E1 展示場依規格修正（關羽待機握刀、許褚狼牙棒過大、全員待機握武器、趙雲普攻＋大招、諸葛亮光彈、15 大招逐條比對）— sonnet＋截圖
- [x] E2 比賽實裝：比賽中普攻動作＋武器揮擊、受擊／倒地／起身／暈眩動作、15 大招依伺服器事件與區域播放特效與載具 — sonnet（純程式，與 E1 平行，不改 E1 的檔案）
- [x] E3 比賽實測：三國各打一場、截圖大招與普攻、修 bug — sonnet＋截圖
- [ ] E4 commit（push 需使用者同意）

## R1e 結果（2026-11-26 清晨）
- 比賽：普攻／受傷動作、15 大招特效與載具全部接進正式比賽；整場含 PK 無錯誤、60 FPS、特效清理正常。
- 測試開關（Workspace 屬性，預設關）：DebugSpecialIdx、DebugMatchSpeed、DebugNoAISpecial、DebugShootAtGoal（server）、DebugCamFocusIdx（client）；展示場 DebugSpeed、DebugCamScale。
- 教訓：新上傳圖片要等 Roblox 處理完（期間畫成方框／空白），測特效前先確認 ImageLabel 能顯示；程式產生的大光球、平板是蓋住球員的主因。

# 交接（2026-11-26，開新對話從這裡接）
## 現況
- 正式比賽可玩：普攻／受傷／15 大招／載具都在比賽裡；整場到 PK 無錯誤、60 FPS。
- 普攻已加快 2 倍（a8496d8）：比賽普攻 0.15 秒、鏟球 0.21 秒（avatars.ts startCur、render.ts PUNCH_SWING/TACKLE_SWING，速度上限 8）；展示場 stage.ts doAttack 以 2 倍播放。等使用者試玩回饋。
- 2026-11-26 下午：起跑滑步修正＋跑步動畫約 2 倍（84037d0，avatars.ts START_HOLD/RUN_START_FADE/RUN_REF_SPEED）；場地畫面放大 1.5 倍（dab20d2，STUDS_PER_PX 0.2→0.3，只改畫面不改 sim；大招範圍、鏡頭邊界跟著換算）。待使用者試玩：普攻／大招會不會看起來隔空打人；不行再考慮真的改 sim 場地（會影響網頁版與 AI 平衡）。
- 跑步動畫注意：8 個角色的跑步 clip 約 5.9 秒，頭尾有起跑／減速靜止段 → avatars.ts RUN_LOOP 只循環中段（接點用 KeyframeSequence 比對姿勢算出）。換新跑步動畫要重算接點。
- 本機 commit 領先 origin 5 個（93c0b27、7f04102、60a9caf、a8496d8、063ba64 交接文件），**未 push**；使用者在同一則訊息說「推上去」才 push。
- Studio id 重開會變，先 list_roblox_studios。Rojo serve 埠 34872；改完 build 後要「停止再 Play」才會載到新程式（Play 中的副本是舊的）。
- 已知無害訊息：ContentId rbxassetid://203785492 "Asset type does not match"。

## 省 token 規則（使用者要求）
- 截圖檢查一律派 `studio-checker`（Haiku，~/.claude/agents/studio-checker.md）：給它「怎麼進到畫面」＋逐條 YES/NO 檢查單，它只回文字。我只對 NO/UNSURE 自己截圖。
- 能用 execute_luau 量數字就不截圖（例：量 AnimationTrack Length/Speed）。
- 幾行的數值調整自己改，大量修改才派 implementer。

## 待確認（還沒親眼看過）
1. 大招後段：張飛暈眩星星、張遼鎖鏈＋「!」、司馬懿落地「沉默」、周瑜把敵人吹出圈、孫權萬箭箭矢飛行。
2. 比賽中：錘／狼牙棒砸地、劍扇揮擊、倒地起身的特寫。
3. 大喬展示場只有光柱沒有隊友模型；趙雲大招借用普攻突刺動作。
→ 下一步：派 studio-checker 逐條檢查，NO 的再修。

# R1f 場地放大 1.5 倍（Roblox only，2026-11-26）
## Goal
Roblox 版遊戲場地真的放大 1.5 倍（sim FIELD 1200×260 → 1800×390），速度不變；畫面比例改回 STUDS_PER_PX 0.2。網頁版不變。
## Decisions
- src/sim/constants-core.ts 加 `FIELD_SCALE = 1`；FIELD_W/FIELD_D 由它算。sync-game.mjs 複製時把這一行改成 1.5（找不到就讓 sync 失敗）。網頁版 ×1 結果完全不變。
- 只放大「位置／區域」：FIELD_W/D、隊形 DF/MF/FW 的 x（GK 不動）、AI DF_BEHIND。射程、傳球、大招範圍、GK_AREA_DEPTH、PK 站位都不放大（跟球速／招式有關）。
- R0 golden（roblox/src/server/golden.ts，只給 Roblox 用）改用 FIELD_SCALE 1.5 產生（vitest vi.mock constants-core）。
## Steps
- [ ] 1. sim/ai 倍率＋sync patch＋Roblox golden — files: src/sim/constants-core.ts, src/sim/field.ts, src/ai/ai.ts, roblox/scripts/sync-game.mjs, src/ai/selfplay*.test.ts — verify: npx vitest run; cd roblox && npm run build — worker A
- [ ] 2. Roblox 畫面端 — files: roblox/src/shared/net.ts, client/world.ts, client/camera.ts, server/match.server.ts — verify: cd roblox && npm run build — worker B
- [ ] 3. 審 diff、Studio 實測（需使用者重連 Rojo）、commit — me
