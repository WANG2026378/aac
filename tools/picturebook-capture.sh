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
拖曳選取頁面範圍，或按空白鍵後點選視窗。" buttons {"完成", "開啟資料夾", "擷取此頁"} default button "擷取此頁" cancel button "完成" with title "繪本截圖工具"
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
    "擷取此頁")
      output="$OUT_DIR/$prefix-page-$page_text.jpg"
      if /usr/sbin/screencapture -i -t jpg "$output" && [[ -s "$output" ]]; then
        notify_saved "$page_text"
        page=$((page + 1))
      else
        rm -f "$output"
        dialog "這次沒有完成截圖，檔案未新增。" '"知道了"' "知道了" >/dev/null || true
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
