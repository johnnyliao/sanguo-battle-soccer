# Goal
三國戰鬥足球原型：單機 1 真人 vs AI 的 5v5 亂鬥足球，能從選隊打到比賽結束（含 PK、音效）。設計細節見 CLAUDE.md。

# Constraints / decisions
- 見 CLAUDE.md「已定案的設計」。src/sim 純 TS、確定性（種子 PRNG、無 Math.random／Date），不 import Phaser。
- 新依賴（使用者已同意）：phaser@3.90、vite、typescript、vitest、zzfx。其他依賴先問。
- 測試在 122 跑，headless 最多 2 個。

# Steps
- [x] 1. 專案骨架：Vite + TS + Phaser 3.90，資料夾 src/sim、src/render、src/input、src/audio、src/data；vite base './'；空場景畫出 640×360 綠地 — worker — verify: `npm run build` 成功、`npx tsc --noEmit` 無錯
- [ ] 2. sim 核心：型別（GameState、Player、Ball、InputFrame）、種子 PRNG、60Hz step、場地與球門幾何、移動／衝刺、球物理（x,y,z、重力、彈跳、摩擦）、持球與碰撞 — worker — verify: vitest（同一輸入序列兩次 → 狀態 hash 相同；球落地會停）
- [ ] 3. 角色資料：15 武將表、每隊正規化到 150、體型參數 — worker — verify: vitest
- [ ] 4. 動作：傳球、射門、蓄力必殺（四種行為）、攻擊／鏟球／跳躍、體力與倒地、搶球 — worker — verify: vitest 各動作情境
- [ ] 5. 比賽流程：開球、進球判定、比分、上下半場計時、換邊、守門員撲救 — worker — verify: vitest
- [ ] 6. AI：依位置（GK/DF/MF/FW）輸出 InputFrame；回應 L 叫傳球 — worker — verify: vitest 全 AI 對打 2 分鐘不當機、有射門
- [ ] 7. Phaser 畫面：色塊人形＋名字、隊色、球影子與高度、鏡頭跟球、HUD（比分、時間、蓄力條、體力） — worker — verify: playwright 截圖
- [ ] 8. 輸入：鍵盤（WASD/J/K/L、雙擊衝刺）＋手把 → InputFrame — worker — verify: playwright 按鍵後角色移動
- [ ] 9. 選隊畫面（不可同國）→ 選操控武將 → 比賽 → 結算 — worker — verify: playwright 走完流程截圖
- [ ] 10. PK 大戰（6 區、時機、守門員猜方向、驟死） — worker — verify: vitest + 截圖
- [ ] 11. ZzFX 音效 — worker — verify: 事件觸發時呼叫音效（單元測試 mock）
- [ ] 12. 整合試玩、數值調整 — me + 使用者
- [ ] 13. GitHub Pages 上線（repo 已建、已 push） — me

# Lessons learned
