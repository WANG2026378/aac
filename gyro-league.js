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
  if (/gyro_matchmaking|join_gyro_matchmaking|get_gyro_matchmaking_status/i.test(message)) {
    return "自動配對尚未啟用：請在 Supabase SQL Editor 執行 gyro-matchmaking.sql。";
  }
  return message;
};

const escapeHtml = value => String(value || "").replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
}[char]));

window.gyroLeague = {
  user: null,
  matchmakingTimer: null,
  matchmakingPoll: null,
  matchmakingExpiresAt: 0,

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
      status(profile.data ? "已準備好，按「開始自動配對」即可找對手。" : "請先設定戰螺暱稱。");
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

  stopMatchmaking() {
    clearInterval(this.matchmakingTimer);
    clearInterval(this.matchmakingPoll);
    this.matchmakingTimer = null;
    this.matchmakingPoll = null;
    const panel = $("matchmakingPanel");
    if (panel) panel.classList.remove("on");
  },

  renderMatchmakingCountdown() {
    const seconds = Math.max(0, Math.ceil((this.matchmakingExpiresAt - Date.now()) / 1000));
    const count = $("matchmakingCountdown");
    const copy = $("matchmakingCopy");
    if (count) count.textContent = seconds;
    if (copy) copy.textContent = seconds > 10
      ? "正在尋找積分接近的對手"
      : "正在放寬積分範圍，快要配到了";
    if (seconds === 0) {
      this.stopMatchmaking();
      status("本輪沒有對手，請再按一次開始配對。");
    }
  },

  async startMatchmaking() {
    try {
      await this.ensureUser();
      const name = $("leagueName").value.trim();
      if (name.length < 2) return status("請先設定並儲存暱稱。");
      const profile = await db.from("gyro_players").select("display_name").eq("id", this.user.id).maybeSingle();
      if (!profile.data) return status("請先按「儲存暱稱」。");
      this.stopMatchmaking();
      status("正在加入配對池...");
      const result = await db.rpc("join_gyro_matchmaking");
      if (result.error) throw result.error;
      await this.handleMatchmakingStatus(result.data);
    } catch (error) {
      console.warn("Gyro League matchmaking start failed:", error);
      status(`配對尚未準備好：${errorMessage(error)}`);
    }
  },

  async cancelMatchmaking() {
    this.stopMatchmaking();
    const result = await db.rpc("cancel_gyro_matchmaking");
    status(result.error ? `取消失敗：${errorMessage(result.error)}` : "已取消配對。");
  },

  async pollMatchmaking() {
    const result = await db.rpc("get_gyro_matchmaking_status");
    if (result.error) {
      this.stopMatchmaking();
      status(`配對連線中斷：${errorMessage(result.error)}`);
      return;
    }
    await this.handleMatchmakingStatus(result.data);
  },

  async handleMatchmakingStatus(data) {
    if (!data || data.status === "idle") return;
    if (data.status === "waiting") {
      this.matchmakingExpiresAt = new Date(data.expires_at).getTime();
      $("matchmakingPanel")?.classList.add("on");
      this.renderMatchmakingCountdown();
      this.matchmakingTimer ||= setInterval(() => this.renderMatchmakingCountdown(), 250);
      this.matchmakingPoll ||= setInterval(() => this.pollMatchmaking(), 1200);
      return;
    }
    if (data.status === "expired") {
      this.stopMatchmaking();
      status("本輪沒有對手，請再按一次開始配對。");
      return;
    }
    if (data.status === "matched") this.enterMatchedRoom(data);
  },

  enterMatchedRoom(data) {
    this.stopMatchmaking();
    net.ranked = true;
    net.playerId = this.user.id;
    net.opponentId = data.opponent_id;
    net.matchId = data.match_id;
    show("scr-online");
    $("onlineTitle").textContent = "🏆 自動配對成功";
    $("onlineStatus").innerHTML = `<b style='color:#7dffa9'>已找到對手${data.challenge ? " · 越級挑戰" : ""}</b><br>正在建立對戰連線...`;
    if (data.is_host) {
      net.host(data.room_code, data.match_id, data.opponent_id);
    } else {
      this.joinMatchedRoom(data, 0);
    }
  },

  joinMatchedRoom(data, attempt) {
    setTimeout(() => {
      if (net.conn?.open) return;
      net.join(data.room_code, data.match_id, data.opponent_id);
      if (attempt < 3) setTimeout(() => {
        if (!net.conn?.open) this.joinMatchedRoom(data, attempt + 1);
      }, 1400);
    }, attempt === 0 ? 900 : 0);
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
