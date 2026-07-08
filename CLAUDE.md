# CLAUDE.md — 路由中心
版本：v1.0（2026-07-05）｜維護規則見 rules/F_knowledge_iteration.md
原則：本檔只放「架構、紅線摘要、路由表」。任何超過 10 行的規則一律外移獨立檔。本檔超過 120 行即違規，須依 F 協議精簡。

## 0. 你是誰、現在該做什麼
你是本機開發環境的工作模型（Opus / Sonnet / Haiku）。開工前依序做三件事：
1. 讀本檔（已在 context）。
2. 依下方路由表，只讀「與本次任務相關」的規則檔。禁止一次讀完所有 rules/。
3. 任務屬於「委派型」→ 先讀 rules/C_model_dispatch.md 決定派工。

## 1. 環境架構（30 秒版）
- 機器：M4 Pro Mac（帳號 charm）；舊機 2017 Intel MBA 僅跑 Lite 版工具。
- 主要 repo：
  - `aac`（wang2026378.github.io/aac/）：特教教學工具，全部單檔 HTML + vanilla JS。
  - `stocks`（wang2026378.github.io/stocks/）：台美股追蹤系統。
- 部署：桌面 `aac_inbox` → `急件立刻上線.command`（GitHub Contents API + PAT）。**部署管線有安全掃描器**，見紅線 §2-1。
- 使用者：Charm，特教老師＋indie dev＋投資人，溝通用繁體中文，偏好簡潔直接。

## 2. 絕對紅線（違反 = 立即停止，不得合理化）
完整條文與正反例 → rules/redlines.md。摘要：
1. 任何檔案禁止出現 `localStorage.clear()` 或 `removeItem(`——部署掃描器會擋，且會毀學生/持股資料。有 PreToolUse hook 物理攔截，被拒絕時不要繞過，改設計。
2. `seed_class.html` 屬 CODEX 維護，永不覆寫；Claude 的版本是 `seed_class_claude.html`。
3. stocks 專案：不改 localStorage key 名、不改 `loadMarket`、不改 `TW_DEFAULTS`/`US_DEFAULTS` 結構。
4. IEP 文件：只走「解包 document.xml → 原地替換 → 重打包」，禁止任何程式化重繪版面。
5. 即時股價一律以使用者截圖為準；Yahoo 爬蟲資料視為陳舊，不得當即時數據。
6. 修改既有檔案前先建 `.bak` 副本。
7. 注音聲調標位規則必須遵守 → rules/redlines.md §7。

## 3. 路由表（按任務找檔案）
| 任務類型 | 先讀 |
|---|---|
| 要派 subagent／決定用哪個模型 | rules/C_model_dispatch.md |
| 判斷「該不該停、算不算完成、該不該問人」 | rules/D_judgment_matrix.md |
| 撰寫派工 prompt | rules/E_delegation_templates.md |
| 想修改本套 harness 檔案 | rules/F_knowledge_iteration.md |
| 踩坑了，要記錄教訓 | lessons/LESSONS.md（格式在 F §3） |
| aac 新工具／改工具 | rules/redlines.md + 該 HTML 檔的 scout 掃描報告 |
| IEP 文件 | rules/redlines.md §4 全文 |
| 股票工具（import/index/lite） | rules/redlines.md §3 全文 |
| 環境哪裡怪怪的 | docs/A_harness_diagnosis.md |
| 接手新 session、不知道從哪開始 | docs/G_handoff_letter.md |

## 4. 通用工作節奏（所有模型）
1. 大檔（>300 行）不直接整讀 → 派 scout。
2. 實作者不自驗 → 派 fresh-context verifier（C §4）。
3. 同一錯誤修兩輪未解 → 停，走 D 檔升級路徑。
4. 每完成一個交付物立即寫檔落盤，不堆 buffer。
5. 踩坑（被 hook 擋、驗收退回、方向重來）→ 10 行內記入 lessons/LESSONS.md。

## 5. 本檔的修改權限
只有 User 明示同意才能改本檔（F §2）。模型可自由修改的只有 lessons/LESSONS.md。
