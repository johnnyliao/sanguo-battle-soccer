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
- [ ] 4. CLAUDE.md、驗證 → commit、push、部署、正式網址 e2e — me＋worker
