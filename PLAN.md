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
- [~] 7. tsc、vitest、build、本機 e2e → commit、push、部署、正式網址 e2e — me＋worker
