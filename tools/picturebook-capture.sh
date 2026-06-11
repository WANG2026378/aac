#!/bin/zsh
set -u

APP_TITLE="繪本截圖工具"
OUT_DIR="$HOME/Desktop/繪本截圖"
mkdir -p "$OUT_DIR"

dialog() {
  /usr/bin/osascript -e "display dialog \"$1\" buttons {$2} default button \"$3\" with title \"$APP_TITLE\"" 2>/dev/null
}

prompt_prefix() {
  /usr/bin/osascript <<'APPLESCRIPT' 2>/dev/null
display dialog "請輸入這本書的檔名前綴：" default answer "picturebook" buttons {"開始"} default button "開始" with title "繪本截圖工具"
text returned of result
APPLESCRIPT
}

choose_action() {
  local page="$1"
  /usr/bin/osascript <<APPLESCRIPT 2>/dev/null
display dialog "準備擷取第 $page 頁

操作方式：
請先把電子書視窗打開在畫面上。
如果只截到桌面，請到系統設定允許螢幕錄製權限。" buttons {"完成", "開啟資料夾", "下一步"} default button "下一步" cancel button "完成" with title "繪本截圖工具"
button returned of result
APPLESCRIPT
}

choose_mode() {
  /usr/bin/osascript <<'APPLESCRIPT' 2>/dev/null
display dialog "請選擇擷取方式：

框選範圍：拖曳選書頁範圍。
選取視窗：點選 Safari / Chrome 電子書視窗。
整個螢幕：截目前主螢幕。" buttons {"框選範圍", "選取視窗", "整個螢幕"} default button "框選範圍" with title "繪本截圖工具"
button returned of result
APPLESCRIPT
}

permission_help() {
  /usr/bin/osascript <<'APPLESCRIPT' 2>/dev/null
display dialog "如果截圖只出現桌面或空白，請設定權限：

1. 打開「系統設定」
2. 隱私權與安全性
3. 螢幕與系統音訊錄製（或螢幕錄製）
4. 允許「繪本截圖工具」
5. 關掉工具後重新打開" buttons {"開啟系統設定", "知道了"} default button "知道了" with title "繪本截圖工具"
button returned of result
APPLESCRIPT
}

notify_saved() {
  local page="$1"
  /usr/bin/osascript -e "display notification \"已儲存第 $page 頁\" with title \"$APP_TITLE\"" 2>/dev/null || true
}

sanitize_name() {
  local raw="$1"
  raw="${raw// /-}"
  raw="${raw//\//-}"
  raw="${raw//:/-}"
  raw="${raw//\\/-}"
  print -r -- "$raw"
}

prefix="$(prompt_prefix || true)"
if [[ -z "${prefix:-}" ]]; then
  exit 0
fi
prefix="$(sanitize_name "$prefix")"
if [[ -z "$prefix" ]]; then
  prefix="picturebook"
fi

page=1
while true; do
  page_text="$(printf "%02d" "$page")"
  action="$(choose_action "$page_text" || true)"
  case "$action" in
    "下一步")
      mode="$(choose_mode || true)"
      output="$OUT_DIR/$prefix-page-$page_text.jpg"
      case "$mode" in
        "選取視窗")
          capture_args=(-i -w -t jpg)
          ;;
        "整個螢幕")
          capture_args=(-m -t jpg)
          ;;
        *)
          capture_args=(-i -s -t jpg)
          ;;
      esac
      if /usr/sbin/screencapture "${capture_args[@]}" "$output" && [[ -s "$output" ]]; then
        notify_saved "$page_text"
        page=$((page + 1))
      else
        rm -f "$output"
        help_action="$(permission_help || true)"
        if [[ "$help_action" == "開啟系統設定" ]]; then
          /usr/bin/open "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture" || true
        fi
      fi
      ;;
    "開啟資料夾")
      /usr/bin/open "$OUT_DIR"
      ;;
    *)
      /usr/bin/open "$OUT_DIR"
      exit 0
      ;;
  esac
done
