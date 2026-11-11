# 小麥的杖劍工具集｜GitHub Pages 上架與未來贊助規劃

## A. 新手：瀏覽器操作上架

1. 先下載網站完整原始碼 ZIP，**解壓縮**，確認資料夾內有 `index.html`、`app.js`、`data.js`、`styles.css`、`README.md`、`.nojekyll`。
2. 登入 GitHub，右上角 **+ → New repository**，範例名稱 `Kanstin-Cities-Tools`。選 **Public**，點 **Create repository**。
3. 在儲存庫主頁點 **Add file → Upload files**，把解壓縮後的檔案**放在儲存庫根目錄**，點 **Commit changes**。不要上傳 ZIP 本身來取代解壓縮檔案。
4. 開啟 **Settings → Pages**，在 **Build and deployment** 的 **Source** 選 **Deploy from a branch**，選 `main` 與 `/(root)`，按 **Save**。
5. 等部署流程完成，在 **Settings → Pages → Visit site** 開啟。網址通常是 `https://cities0809.github.io/Kanstin-Cities-Tools/`。
6. 在電腦及手機測試首頁、進入工具、切換角色、設定幻獸、匯出 JSON、操作手冊與問題回報。
7. 日後更新時，對照檔案版本，把變更的 `app.js`、`styles.css` 等重新上傳，GitHub Pages 會根據新的 commit 重新部署。

> 注意：GitHub Pages 適合發佈靜態網站。若 Repo 是 Public，前端程式碼將公開可讀。絕對不要上傳密碼、API 私密金鑰、個人備份 JSON、付款密鑰或其他敏感資料。

## B. 使用 Git 指令更新（熟悉 Git 時）

```bash
git clone https://github.com/cities0809/Kanstin-Cities-Tools.git
cd Kanstin-Cities-Tools
# 把新版本網站檔案複製到此資料夾，檢查內容後執行：
git add index.html app.js data.js styles.css README.md DEPLOY_GUIDE.md .nojekyll
git commit -m "Release tools hub v1.0.2"
git push origin main
```

## C. 多角色資料遷移

- 同一網站來源：新工具會讀取舊版 `fantasy-pet-planner-v1` 的快照建立角色 1。
- **本機 V1.9 → GitHub Pages**：網域不同，無法自動搬移。先從舊版匯出 JSON，再由新網站選擇角色→**匯入目前角色**。
- **不同電腦／瀏覽器**：從新網站**備份全部角色**，再在另一台裝置**匯入全部角色**。
- 匯入前先確認沒有選錯角色；「匯入全部角色」會取代目前儲存的所有角色，建議先匯出當前備份。

## D. 問題回報

「問題回報」按鈕使用 `mailto:cities0809@gmail.com`。它只是在使用者裝置開啟預先填寫好的電子郵件，**不代表郵件已發送**。使用者需有預設郵件程式（或設定 Gmail 連結處理程式）並自行按寄出。未設定時可直接複製 `cities0809@gmail.com` 到自己的郵件服務。

## E. 捐款與付費解鎖的可行架構

### 自願贊助（優先）

可在未來確認收款資格、費率及正式收款頁面後，增加導向第三方的贊助按鈕。台灣用戶可評估 **Ko-fi＋PayPal**（需確認當時 PayPal 帳戶的收款／提領資格）或 **綠界金流** 的合法商業收款方案。先完成金流商家申請與驗證，再加入經本人確認的 HTTPS 付款網址，不在前端自行處理卡號。

### 付費解鎖（下一階段）

建議採用：
1. 使用者登入（例如授權的 OAuth／帳號系統）。
2. 後端建立正式訂單，由金流商提供安全結帳頁。
3. 金流通知可信任後端並驗證付款真實性，寫入權限紀錄（`entitlements`）。
4. 付費功能由後端提供資料或計算資源／取得授權，再決定是否可使用。不要只在前端 `if(paid)` 控制隱藏按鈕。
5. 建立退款、到期、使用期限、權限停用與客服處理流程，並依實際營運評估稅務、個資及平台條款。

**GitHub Pages 的政策限制：** GitHub 官方表示，GitHub Pages 不是用來營運主要商業交易或商用 SaaS 的免費主機。如果工具集未來以付費交易為核心，應搬到適合商業用途的前端部署及後端服務。前端可保留目前的網站介面與幻獸演算法，但商業授權驗證必須另行設計。

## 官方參考

- GitHub Pages 設定：https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- GitHub Pages 使用限制：https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- Ko-fi 收款方式：https://help.ko-fi.com/hc/en-us/articles/115003980093-How-do-I-get-paid
- 綠界開發者平台：https://developers.ecpay.com.tw/