# 果蠅腦 Windows 建置包

目前已上傳核心程式、Windows 建置腳本與完整資料 ZIP。**尚未產生可執行 EXE，雲端建置工作流程尚未啟用。**

[下載完整建置包（含三份腦資料）](../../downloads/fly-brain-windows-build-kit.zip?raw=true)

本資料夾的 `fly-brain-windows.workflow.yml` 是待啟用的 GitHub Actions 工作流程：登入 GitHub 網頁，在此分支新增 `.github/workflows/fly-brain-windows.yml`，將其完整內容貼入並提交，即會觸發 Windows 建置。
建置成功後，到 Actions 的 **Fly Brain Windows Portable** 紀錄下載 **fly-brain-windows-x64** artifact。
解開下載檔及內層 ZIP，把整個「啟動果蠅腦」資料夾放到 Windows x64 電腦，雙擊「啟動果蠅腦.exe」。使用端不需另裝 Python。

也可在 Windows 原始碼建置，詳見 `使用說明.txt`；建置端需要 Python 3.12 與 Visual Studio C++ Build Tools。
雲端建置時從官方來源下载資料並校驗 SHA-256，重建圖譜後逐陣列比對 Mac 基準。
