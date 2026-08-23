# 王川銘｜解冤結真言 108 計數器

## GitHub Pages 部署

1. 在 GitHub 建立新的 repository，例如 `mantra-counter`。
2. 把本資料夾內的所有檔案與 `icons` 資料夾上傳到 repository 的根目錄，再提交（commit）。
3. 到 repository 的 **Settings → Pages**，在 **Build and deployment** 選擇 **Deploy from a branch**；Branch 選擇 `main` 與 `/ (root)`，按 **Save**。
4. 等待約一分鐘，GitHub Pages 顯示的網址就是手機版 App 網址。以 iPhone Safari 開啟後，按分享按鈕 → **加入主畫面**，即可像 App 一樣使用並離線開啟。

## 語音功能說明

語音自動計數依賴瀏覽器內建的網頁語音辨識。Chrome／Android 通常支援較完整；iPhone Safari 與部分瀏覽器可能不提供、或服務暫時無法使用。App 會顯示具體原因，手動的「＋1／－1」不受影響。第一次使用時請允許麥克風。

## 姓名與三學精舍回報連結

第一次開啟時，持誦者可輸入自己的姓名，姓名只會儲存在自己的裝置。請將三學精舍提供的「報告圈數」完整網址填入 `app.js` 最上方的 `REPORT_URL`，網站便會顯示該連結。
