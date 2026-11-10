# 依賴漏洞修復報告 — 2026-11-10

## 範圍與時間定義

本次處理 agent-liaison 儲存庫的開發／CI 依賴，不代表正在運行的 Gateway 或已安裝外掛已升級，也不是遭入侵調查。GitHub 的警示是已知漏洞與鎖檔版本比對，不能據此推斷發生過攻擊或資料外洩。

16:20 前一次推送回報 23 項；本次約 16:40 API 完整盤點為 **26 項：8 high、15 medium、3 low**，全部位於 openclaw-plugin/package-lock.json，標示 transitive/development。新增／重新評估警示可能晚於推送摘要，故以本次 API 快照為基準。精確逐項公布與建立時間、版本引入 commit 見 inventory.json 與 TIMELINE.md。Git commit 日期是歷史證據，不等於實際安裝或部署時間；首次出現目前受影響版本也不一定是漏洞首次引入時間。

## 原因

1. 開發用 OpenClaw SDK 宣告為 latest，但鎖檔固定在 2026.9.4；npm ci 會忠實重現鎖檔，不會自動採用後來的修補。
2. SDK 與測試框架引入 HTTP、OAuth、路徑匹配與開發伺服器等間接依賴。漏洞涵蓋服務阻斷、TLS 驗證／權杖受眾邊界、重新導向洩漏、路徑限制繞過等，逐項原因保留在 inventory.json 的 summary。開發依賴仍可能在 CI／本機測試中執行，不能因 dev-only 而忽略。
3. 原 CI 只有測試與編譯，沒有 npm audit 閘門、定期重新掃描或 Dependabot 更新設定。功能測試通過不代表已知漏洞清零。
4. 新漏洞公告可能晚於已提交版本；本次沒有證據證明曾被利用。

## 修復與選擇

- Vitest 4.1.11 → 4.1.12；Vite 8.3.0 → 8.3.7。
- 保留相容 SDK 2026.9.4，將 latest 改為精確版本，並對該版本加上有限範圍 overrides：MCP SDK 1.32.1、undici 8.12.2、minimatch 11.0.5、Zod 4.6.7。這是儲存庫開發依賴修補，不是上游 SDK 全產品相容認證。
- 其他相容修補：Hono 4.13.17、@hono/node-server 2.1.6、fast-uri 3.1.9、qs 6.17.1、source-map-js 1.2.2；完整 resolved 版本以鎖檔為準。
- 未採用 npm audit fix --force，也沒有 dismiss、ignore 或降低掃描等級。
- 曾以 lock-only 嘗試 SDK 2026.11.2，但它引入 npm 12.2.0 的 bundled 舊依賴，掃描反增為 38 個受影響套件。尚未安裝／執行即撤回該候選，改採範圍明確的補丁；未以手改 node_modules 或鎖檔隱藏問題。
- 最終 lock-only npm audit 顯示 0 vulnerabilities；這與 GitHub 26 筆 advisory 的計數單位不同。乾淨安裝、測試、編譯與遠端解除狀態須另外驗證。

## 補強與預防

已配置：
- CI 使用 npm ci --ignore-scripts，減少安裝期第三方 lifecycle script 執行；明確執行專案測試與 build。
- 每次 push／PR 執行 npm audit --audit-level=low，任何已知等級均使此步失敗；保留開發依賴掃描。
- 每週一 02:17 UTC（台北 10:17）重跑 CI，避免只有新 commit 才發現新公告；支援手動觸發。排程啟動屬 GitHub 服務行為，不保證精確分鐘。
- 固定 ubuntu-24.04 runner，避免 latest OS 漂移令舊版相容性測試無法啟動；OS／Python 升級需檢查官方安裝包與 clean CI。
- Dependabot 每週檢查 npm 與 GitHub Actions，Vitest 家族合併更新；不啟用自動合併。

維護要求／尚非強制技術控制：
- 儲存庫維護者接到高風險警示應優先評估並修補；所有更新須經 clean install、測試、build、audit，不以零警示取代相容性驗證。
- 每次 SDK 更新重新檢查四項 overrides；上游採用修補且全套驗證通過後再移除，避免永久補丁漂移。minimatch 跨主版本需特別驗證使用介面。
- CI 失敗不等於 GitHub 已強制禁止直接推送；branch protection／required checks 未在本次擅自變更。建議設定必需通過此工作流程。
- 不對外暴露 Vitest／Vite 開發服務；部署版本要另行審核，不把本報告當成線上環境安全證明。

## 驗證

本機獨立暫存目錄（不使用原 node_modules/dist；不是 OS sandbox）：npm ci --ignore-scripts 成功，完整 audit 0；TypeScript build 成功；29/29 外掛測試與 4/4 overrides API 相容性 smoke tests 通過。MCP 使用 in-memory transport，undici 使用禁止外連的 MockAgent；這些不是完整上游產品驗收。npm pack --dry-run 顯示 7 個檔案、bundled=[]，沒有 SDK node_modules 或測試檔；runtime 仍透過 peer OpenClaw，不推論 host 安全。

獨立靜態審查指出的 clean-build 排序、測試產物打包、安裝腳本及最低相容版本宣告已處理：build 在 test 前，release 編譯排除測試且 files 明確列出入口檔（即使舊 dist 留有測試也不發布）；peer/pluginApi 最低版本從未驗證的 2026.5.17 收斂至本次測試的 2026.9.4。對未測試的其他 host 版本不宣稱驗收通過。

2026-11-10 16:47:32（Asia/Taipei），GitHub 將本次 26/26 警示全部標為 fixed；dismissed_at 全為 null，全儲存庫 open_count=0。逐項回執見 [github-closure.json](github-closure.json)。修復 commit：1d6608e7fc7faa2a9c5c3fd6870a2f153006a5ea。

[首輪遠端 CI](https://github.com/simon5530/agent-liaison/actions/runs/42785391087)：外掛 clean install、完整 audit、build、29 項測試及 4 項相容性測試均成功。Python 3.13 的 7 項測試及 demo 成功，但整體 workflow 失敗：ubuntu-latest 已指向 Ubuntu 26.04，setup-python 無 3.9 對應套件。查驗 actions/python-versions 官方 manifest 後，將 runner 固定為有 3.9.25 與 3.13.18 官方包的 ubuntu-24.04；沒有跳過測試或降低錯誤等級。Python 3.9 僅保留既有最低相容性測試，不建議作新部署版本。修正後 [完整 CI 42785736206](https://github.com/simon5530/agent-liaison/actions/runs/42785736206) 全部成功：Python 3.9、Python 3.13、外掛 audit/build/tests 三個 job 均通過。驗證程式碼 commit 為 e1a1a4064917d315d59894af286546087bfb7fb7；結案觀察見 [verification.json](verification.json)。

## 復原紀錄

盤點命令曾遇 shell glob 與多層引號解析錯誤；檢查實際退出狀態與已產出的 JSON 後，改用具名檔案／heredoc 與 chr(10) 重新執行讀取，不重跑已完成的依賴修改。成功寫檔與最後一個 shell 命令成功都不能替代逐步結果驗證。乾淨測試先出現 2/29 失敗，原因是原 CI 先 test 後 build，跨程序測試找不到 dist/index.js；調整順序後 29/29 通過。未刪除或忽略失敗測試。
