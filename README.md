# 永芳特教 iPad 溝通版 AAC

王川銘老師 - iPad 輔助溝通系統

**正式網址**: https://wang2026378.github.io/aac/

## 功能
- 大按鈕中文 TTS 語音溝通板
- 10 大分類 120+ 預設詞彙
- 句子建構器
- 老師可編輯/上傳家人照片
- PWA 支援，可加到 iPad 主畫面離線使用

## 繪本匯入

新增繪本時，先把裁切好的頁面圖片放在同一個資料夾，檔名用頁碼排序，例如 `page-01.jpg`、`page-02.jpg`。

```bash
node tools/import-picturebook.mjs --source ~/Downloads/my-book --slug my-book --title "我的繪本" --theme emotion
```

常用指令：

```bash
node tools/import-picturebook.mjs --scan
node tools/import-picturebook.mjs --source ~/Downloads/my-book --slug my-book --title "我的繪本" --theme generic
node tools/import-picturebook.mjs --source ~/Downloads/food-book --slug food-book --title "食物繪本" --theme food
```

匯入後會產生：

- `assets/picturebooks/<slug>/page-01.jpg` 等圖片
- `assets/picturebooks/<slug>/lesson.js` 教學資料
- `assets/picturebooks/<slug>/import-summary.json` 匯入摘要

打開隱藏教學頁：

```text
picturebook-imported.html?lesson=<slug>
```

接著編輯 `assets/picturebooks/<slug>/lesson.js` 裡每一頁的 `title`、`text`、`companionLine`、`question`，就能保留同一套翻頁、TTS、題目、進度與大圖模式。
