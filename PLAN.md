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
- [ ] 4. CLAUDE.md、commit、部署、正式網址 e2e — me＋worker（與周瑜一起）

# Goal 17（2026-11-24）周瑜「赤壁東風」（中場；使用者要求沿用舊名，效果換新）
周瑜原本只有舊的持球必殺（赤壁東風蛇行球）、沒有角色圖。新大招：以施放位置為中心半徑 150px 東風陣（固定原地 3 秒）；施放瞬間範圍內敵人被吹到範圍外（擊退＋短暫硬直，持球者掉球）；之後 3 秒範圍內敵人速度剩 15%（緩速 85%，與冰雨／法陣取最慢）、每秒扣 10%（第 1、2、3 秒各一次，最多 30%）。持球不持球皆可。數值不變（5/6/5/10/4）。
- 圖：art-src/zhouyu-sheet.png（1122×1402，5×4：待機、走、劍攻擊、施法（舉手、按劍閉目、張臂、指劍）、受擊/倒地/躺/起身）；art-src/zhouyu-fx.png（1402×1122，5×4：火焰劍弧、龍捲成形、吹開爆環、東風陣循環、緩速下壓箭頭）。

# Steps 17
- [x] 1. sim：mode 'eastwind'＋測試 — worker（608 tests；靠邊者沿 170px 圈滑到場內）
- [x] 2. AI — worker（敵持球者 150px 內或 ≥2 敵；614 tests）
- [x] 3. 切圖、fx、render、e2e — worker（me 看截圖；拿掉過時的「需持球」e2e）
- [ ] 4. 文件、commit、部署（孫權＋周瑜一起）、正式網址 e2e

# Goal 18（2026-11-24）音效包整合（孫權、周瑜上線後）
- 來源：/home/safe3admin/150gameeffectsounds/（150 個 WAV，56 MB；LICENSES.txt：全部 CC0 1.0，不需標註；來源 CoMiGo、Kenney、Kronbits、lentikula）。分類：01 近戰（拳擊打擊、刀出鞘、刀切）、02 遠程（射擊、雷射）、03 爆炸破壞、04 魔法（火、冰、水、風、雷、土、植物、治療衝擊、充能）。
- 使用者要求：我自己配，先做試聽頁給他聽，確認後才接進比賽。舊 Sun Ce 合成音效 WIP 在 scratchpad/sunce-sounds-wip.patch（可能不再需要）。
- 做法草案：挑選的檔案轉 ogg/mp3（mono、短、裁靜音）放 public/sfx；15 名武將普攻、大招（分段：施放／命中／結束）＋通用（踢球、倒地、進球）對應表；?sfx=1 試聽頁改為播放檔案。
- 使用者提醒：有些檔案試聽聽不到聲音。挑選前先逐檔量峰值／RMS（含只有極低頻或極短的檔），過濾掉近乎無聲的，再挑。
