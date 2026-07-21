import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  "https://lynmfbmiubxezcevwqfe.supabase.co",
  "sb_publishable_re0wZaw9fsq1OSm68jrJdg_lkxqxR51",
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }
);

const status = message => {
  const el = document.getElementById("leagueStatus");
  if (el) el.textContent = message;
};

const errorMessage = error => {
  const message = error?.message || "未知錯誤";
  if (/anonymous sign-ins are disabled/i.test(message)) {
    return "請到 Supabase 的 Authentication > Providers > Anonymous Sign-Ins，啟用後按 Save。";
  }
  return message;
};

const escapeHtml = value => String(value || "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
}[char]));

window.gyroLeague = {
  user: null,

  async ensureUser() {
    const current = await db.auth.getSession();
    let session = current.data.session;
    if (!session) {
      const created = await db.auth.signInAnonymously({ options: { data: { game: "gyro-clash" } } });
      if (created.error) throw created.error;
      session = created.data.session;
    }
    if (!session) throw new Error("無法建立排位帳號");
    this.user = session.user;
    return session.user;
  },

  async open() {
    show("scr-league");
    status("正在準備排位帳號...");
    try {
      await this.ensureUser();
      const profile = await db.from("gyro_players").select("display_name").eq("id", this.user.id).maybeSingle();
      if (profile.data) $("leagueName").value = profile.data.display_name || "";
      status(profile.data ? "已準備好，可建立或加入排位房。" : "請先設定戰螺暱稱。");
      await this.loadBoard();
    } catch (error) {
      console.warn("Gyro League sign-in failed:", error);
      status(`排位登入未完成：${errorMessage(error)}`);
    }
  },

  async saveName() {
    const name = $("leagueName").value.trim();
    if (name.length < 2) return status("暱稱至少要 2 個字。");
    try {
      await this.ensureUser();
      status("儲存中...");
      const result = await db.rpc("set_gyro_nickname", { p_display_name: name });
      if (result.error) throw result.error;
      status("暱稱已儲存，可以參加排位賽。");
      await this.loadBoard();
    } catch (error) {
      console.warn("Gyro League nickname save failed:", error);
      status(`暱稱儲存失敗：${errorMessage(error)}`);
    }
  },

  async startRanked() {
    try {
      await this.ensureUser();
      const name = $("leagueName").value.trim();
      if (name.length < 2) return status("請先設定並儲存暱稱。");
      const profile = await db.from("gyro_players").select("display_name").eq("id", this.user.id).maybeSingle();
      if (!profile.data) return status("請先按「儲存暱稱」。");
      net.ranked = true;
      net.playerId = this.user.id;
      show("scr-online");
      $("onlineStatus").innerHTML = "<b style='color:#ffd24d'>公開排位賽</b><br>建立房間或輸入房間代碼。對戰結束後，雙方確認相同比分才會計分。";
    } catch (error) {
      console.warn("Gyro League start failed:", error);
      status(`排位尚未準備好：${errorMessage(error)}`);
    }
  },

  async reportMatch(winner, score) {
    if (!net.matchId || !net.opponentId || !this.user) return;
    const myIndex = net.myIdx;
    const result = await db.rpc("report_gyro_rank_match", {
      p_match_id: net.matchId,
      p_opponent: net.opponentId,
      p_my_score: score[myIndex],
      p_opponent_score: score[1 - myIndex]
    });
    const detail = $("resDet");
    if (result.error) {
      if (detail) detail.textContent += "\n排位戰績暫未送出，請確認雙方都使用排位房。";
      return;
    }
    const message = result.data?.status === "verified"
      ? "\n排位戰績已確認，積分已更新！"
      : "\n已送出戰績，等待對手確認比分。";
    if (detail) detail.textContent += message;
  },

  async loadBoard() {
    const target = $("leagueBoard");
    if (!target) return;
    const result = await db.from("gyro_leaderboard")
      .select("display_name,rating,wins,losses,matches")
      .order("rating", { ascending: false })
      .order("wins", { ascending: false })
      .limit(50);
    if (result.error) {
      target.innerHTML = '<div class="league-row"><span class="league-rank">--</span><span>排行榜將在資料庫啟用後出現。</span><span></span><span></span></div>';
      return;
    }
    target.innerHTML = result.data.length
      ? result.data.map((row, index) => `<div class="league-row"><span class="league-rank">${index + 1}</span><span>${escapeHtml(row.display_name)}</span><span class="league-rating">${row.rating}</span><span class="league-record">${row.wins}勝 ${row.losses}敗</span></div>`).join("")
      : '<div class="league-row"><span class="league-rank">--</span><span>第一位排位戰士，等你上榜。</span><span></span><span></span></div>';
  }
};
