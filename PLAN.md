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
- [ ] 2. me 審 → commit、push、部署 → 使用者在 ?sfx=1 試聽 → 調整 → 再套魏、吳
- 11-20：體力條加粗採 A 版（寬 76、等比例，STAMINA_BAR_W/VSCALE 常數，B 版＝寬 60、垂直 1.5 倍）。
- 11-20：使用者試聽後「呼喊全部不夠兇」→ 重做 warCry（3 聲部、喉音、失真、沙啞、回音、shout bus），舊版保留為 X.shoutOld 供對照。
- 11-20：關羽／馬超／趙雲呼喊不行 → 各做 A 低沉吼、B 氣音喊、C 短促爆喝（X.shoutA/B/C）放試聽頁，待使用者挑選。
