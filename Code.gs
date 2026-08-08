/**
 * 永芳特教教學資源網 — 後端 (Google Apps Script)
 * 功能：1) 網站流量記錄與統計  2) 私密留言板（暱稱＋密碼）
 *
 * 部署前只要做一件事：把下面 CONFIG 裡的 ADMIN_KEY 換成你自己的密碼。
 * 分頁會在第一次有人使用時自動建立，不必手動執行 setup()。
 */

/* ==========================================================
   ★★★ 只要改這裡 ★★★
   ========================================================== */
var CONFIG = {

  // 你的管理員密碼。把下面這行的內容換成自己想的一組。
  // 這支檔案只存在你的 Apps Script 專案裡，不會被網站訪客看到。
  ADMIN_KEY: '換成你的管理員密碼',

  // 加密用的亂數，已經幫你產好了。設定後永遠不要改
  // （改了所有留言者的密碼都會失效）。
  SALT: 'F_kqIVHsEBvTBPFTVLFveugoSnrIaarm'

};
/* ========================================================== */

var SHEET_HIT   = '流量';
var SHEET_DAY   = '流量彙總';
var SHEET_MSG   = '留言';
var SHEET_USER  = '留言者';
var SHEET_PAGE  = '頁面累計';

var MAX_BODY    = 1000;   // 留言最長字數
var MAX_NICK    = 20;     // 暱稱最長字數
var KEEP_DAYS   = 90;     // 流量原始資料保留天數，更舊的會被壓成每日彙總
var TZ          = 'Asia/Taipei';

/* ============================================================
   對外入口
   ============================================================ */

// 流量記錄走 GET（瀏覽器 no-cors 送出，不需要回應）
function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  try {
    if (p.act === 'hit') {
      logHit_(p);
      return text_('ok');
    }
    if (p.act === 'counts') {
      var data = pageCounts_();
      if (p.cb) {
        // JSONP：首頁用 <script> 載入，完全不需要 CORS
        return ContentService
          .createTextOutput(p.cb + '(' + JSON.stringify(data) + ');')
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return json_(data);
    }
    if (p.act === 'ping') {
      return json_({ ok: true, msg: '後端運作正常' });
    }
  } catch (err) {
    return text_('err');
  }
  return text_('永芳特教教學資源網 後端運作中');
}

// 其餘功能走 POST（content-type 用 text/plain 避開 CORS 預檢）
function doPost(e) {
  var req = {};
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, err: '資料格式錯誤' });
  }

  try {
    switch (req.act) {
      case 'post':   return json_(postMessage_(req));
      case 'mine':   return json_(myMessages_(req));
      case 'admin':  return json_(adminInbox_(req));
      case 'reply':  return json_(adminReply_(req));
      case 'stats':  return json_(adminStats_(req));
      default:       return json_({ ok: false, err: '不支援的動作' });
    }
  } catch (err) {
    return json_({ ok: false, err: '伺服器錯誤：' + err.message });
  }
}

/* ============================================================
   一、流量
   ============================================================ */

function logHit_(p) {
  var page = String(p.p || '').slice(0, 80);
  if (!page) return;
  var sh = sheet_(SHEET_HIT, ['時間', '日期', '頁面', '訪客', '來源', '裝置']);
  var now = new Date();
  sh.appendRow([
    now,
    Utilities.formatDate(now, TZ, 'yyyy-MM-dd'),
    page,
    String(p.vid || '').slice(0, 40),
    cleanRef_(String(p.ref || '')),
    String(p.dev || '').slice(0, 20)
  ]);
}

// 把來源網址縮成網域，站內導覽一律記成「站內」
function cleanRef_(ref) {
  if (!ref) return '直接開啟';
  var m = ref.match(/^https?:\/\/([^\/]+)/);
  if (!m) return '直接開啟';
  var host = m[1].toLowerCase();
  if (host.indexOf('wang2026378.github.io') >= 0) return '站內';
  return host.slice(0, 60);
}

function adminStats_(req) {
  if (!isAdmin_(req.key)) return { ok: false, err: '管理員密碼不正確' };

  var cache = CacheService.getScriptCache();
  var hit = cache.get('stats_v1');
  if (hit && !req.fresh) return JSON.parse(hit);

  var out = buildStats_();
  try { cache.put('stats_v1', JSON.stringify(out), 180); } catch (e) {}
  return out;
}

function buildStats_() {
  var sh = sheet_(SHEET_HIT, ['時間', '日期', '頁面', '訪客', '來源', '裝置']);
  var last = sh.getLastRow();
  var rows = [];
  if (last > 1) {
    var start = Math.max(2, last - 100000 + 1);
    rows = sh.getRange(start, 1, last - start + 1, 6).getValues();
  }

  var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var dayKeys = lastNDates_(30);
  var dayIdx = {};
  for (var i = 0; i < dayKeys.length; i++) dayIdx[dayKeys[i]] = i;

  var daily = [], dailyVis = [];
  for (var i = 0; i < dayKeys.length; i++) { daily.push(0); dailyVis.push({}); }

  var pages = {}, refs = {}, devs = {}, allVisitors = {};
  var total = 0;

  for (var r = 0; r < rows.length; r++) {
    var d = String(rows[r][1]);
    var page = String(rows[r][2] || '(未知)');
    var vid = String(rows[r][3] || '');
    total++;
    if (vid) allVisitors[vid] = 1;
    pages[page] = (pages[page] || 0) + 1;
    var rf = String(rows[r][4] || '直接開啟');
    refs[rf] = (refs[rf] || 0) + 1;
    var dv = String(rows[r][5] || '其他');
    devs[dv] = (devs[dv] || 0) + 1;
    if (dayIdx.hasOwnProperty(d)) {
      var k = dayIdx[d];
      daily[k]++;
      if (vid) dailyVis[k][vid] = 1;
    }
  }

  // 併入已壓縮的舊資料
  var oldTotal = 0, oldDays = 0;
  var dsh = optionalSheet_(SHEET_DAY);
  if (dsh && dsh.getLastRow() > 1) {
    var dv2 = dsh.getRange(2, 1, dsh.getLastRow() - 1, 3).getValues();
    for (var i = 0; i < dv2.length; i++) {
      oldTotal += Number(dv2[i][1] || 0);
      oldDays++;
    }
  }

  var dailyUniq = dailyVis.map(function (o) { return Object.keys(o).length; });
  var idxToday = dayIdx[today];
  var todayHits = (idxToday === undefined) ? 0 : daily[idxToday];
  var todayUniq = (idxToday === undefined) ? 0 : dailyUniq[idxToday];

  function sumLast(arr, n) {
    var s = 0;
    for (var i = Math.max(0, arr.length - n); i < arr.length; i++) s += arr[i];
    return s;
  }

  return {
    ok: true,
    today: todayHits,
    todayUniq: todayUniq,
    week: sumLast(daily, 7),
    month: sumLast(daily, 30),
    total: total + oldTotal,
    visitors: Object.keys(allVisitors).length,
    days: dayKeys,
    daily: daily,
    dailyUniq: dailyUniq,
    pages: topN_(pages, 20),
    refs: topN_(refs, 8),
    devs: topN_(devs, 5),
    archivedDays: oldDays
  };
}

/**
 * 各頁累計點閱數（公開，不需要密碼）。
 * = 頁面累計分頁（壓縮過的舊資料） + 流量分頁裡還沒壓縮的原始列
 */
function pageCounts_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('counts_v1');
  if (hit) return JSON.parse(hit);

  var counts = {};

  var psh = optionalSheet_(SHEET_PAGE);
  if (psh && psh.getLastRow() > 1) {
    var pv = psh.getRange(2, 1, psh.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < pv.length; i++) {
      var k = String(pv[i][0] || '');
      if (k) counts[k] = (counts[k] || 0) + Number(pv[i][1] || 0);
    }
  }

  var sh = sheet_(SHEET_HIT, ['時間', '日期', '頁面', '訪客', '來源', '裝置']);
  var last = sh.getLastRow();
  if (last > 1) {
    var vals = sh.getRange(2, 3, last - 1, 1).getValues();
    for (var j = 0; j < vals.length; j++) {
      var pg = String(vals[j][0] || '');
      if (pg) counts[pg] = (counts[pg] || 0) + 1;
    }
  }

  var out = { ok: true, counts: counts, at: Date.now() };
  try { cache.put('counts_v1', JSON.stringify(out), 300); } catch (e) {}
  return out;
}

function lastNDates_(n) {
  var out = [];
  var now = new Date();
  for (var i = n - 1; i >= 0; i--) {
    var d = new Date(now.getTime() - i * 86400000);
    out.push(Utilities.formatDate(d, TZ, 'yyyy-MM-dd'));
  }
  return out;
}

function topN_(obj, n) {
  var arr = Object.keys(obj).map(function (k) { return { k: k, v: obj[k] }; });
  arr.sort(function (a, b) { return b.v - a.v; });
  return arr.slice(0, n);
}

/**
 * 手動維護用：把 KEEP_DAYS 天以前的流量原始列壓成每日彙總，避免試算表無限長大。
 * 建議設一個每月執行一次的觸發程序。
 */
function 壓縮舊流量() {
  var sh = sheet_(SHEET_HIT, ['時間', '日期', '頁面', '訪客', '來源', '裝置']);
  var last = sh.getLastRow();
  if (last < 2) return;

  var cutoff = Utilities.formatDate(
    new Date(Date.now() - KEEP_DAYS * 86400000), TZ, 'yyyy-MM-dd');
  var values = sh.getRange(2, 1, last - 1, 6).getValues();

  var agg = {}, cut = 0, pageAgg = {};
  for (var i = 0; i < values.length; i++) {
    var d = String(values[i][1]);
    if (d >= cutoff) break;
    cut++;
    if (!agg[d]) agg[d] = { hits: 0, vis: {} };
    agg[d].hits++;
    var vid = String(values[i][3] || '');
    if (vid) agg[d].vis[vid] = 1;
    var pg = String(values[i][2] || '');
    if (pg) pageAgg[pg] = (pageAgg[pg] || 0) + 1;
  }
  if (!cut) return;

  // 先把被刪掉那些列的頁面次數存進累計分頁，卡片上的點閱數才不會倒退
  var psh = sheet_(SHEET_PAGE, ['頁面', '累計次數']);
  var pkeys = Object.keys(pageAgg);
  if (pkeys.length) {
    var prow = pkeys.map(function (k) { return [k, pageAgg[k]]; });
    psh.getRange(psh.getLastRow() + 1, 1, prow.length, 2).setValues(prow);
  }

  var dsh = sheet_(SHEET_DAY, ['日期', '瀏覽次數', '不重複訪客']);
  var keys = Object.keys(agg).sort();
  var out = keys.map(function (d) {
    return [d, agg[d].hits, Object.keys(agg[d].vis).length];
  });
  dsh.getRange(dsh.getLastRow() + 1, 1, out.length, 3).setValues(out);
  sh.deleteRows(2, cut);
}

/* ============================================================
   二、私密留言板
   ============================================================ */

function postMessage_(req) {
  var nick = String(req.nick || '').trim().slice(0, MAX_NICK);
  var pw = String(req.pw || '');
  var body = String(req.body || '').trim().slice(0, MAX_BODY);

  if (nick.length < 2) return { ok: false, err: '暱稱至少 2 個字' };
  if (pw.length < 4) return { ok: false, err: '密碼至少 4 個字' };
  if (body.length < 1) return { ok: false, err: '請寫一點內容再送出' };

  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var auth = checkUser_(nick, pw, true);
    if (!auth.ok) return auth;

    // 簡單防洗版：同一個暱稱 30 秒內只能送一則
    var cache = CacheService.getScriptCache();
    var ck = 'rl_' + auth.key;
    if (cache.get(ck)) return { ok: false, err: '剛剛才送出過，請等 30 秒再留言' };
    cache.put(ck, '1', 30);

    var sh = sheet_(SHEET_MSG,
      ['編號', '時間', '暱稱', '身分碼', '內容', '管理員回覆', '回覆時間', '狀態']);
    var id = 'M' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    sh.appendRow([id, new Date(), nick, auth.key, body, '', '', '待回覆']);
    return { ok: true, id: id, isNew: auth.isNew };
  } finally {
    lock.releaseLock();
  }
}

function myMessages_(req) {
  var nick = String(req.nick || '').trim();
  var pw = String(req.pw || '');
  var auth = checkUser_(nick, pw, false);
  if (!auth.ok) return auth;

  var sh = sheet_(SHEET_MSG,
    ['編號', '時間', '暱稱', '身分碼', '內容', '管理員回覆', '回覆時間', '狀態']);
  var last = sh.getLastRow();
  if (last < 2) return { ok: true, list: [] };

  var rows = sh.getRange(2, 1, last - 1, 8).getValues();
  var list = [];
  for (var i = rows.length - 1; i >= 0; i--) {
    // 關鍵：只回傳身分碼吻合的留言，其他人的一律不送出瀏覽器
    if (String(rows[i][3]) !== auth.key) continue;
    list.push(rowToMsg_(rows[i]));
  }
  return { ok: true, nick: nick, list: list };
}

function adminInbox_(req) {
  if (!isAdmin_(req.key)) return { ok: false, err: '管理員密碼不正確' };

  var sh = sheet_(SHEET_MSG,
    ['編號', '時間', '暱稱', '身分碼', '內容', '管理員回覆', '回覆時間', '狀態']);
  var last = sh.getLastRow();
  if (last < 2) return { ok: true, list: [] };

  var rows = sh.getRange(2, 1, last - 1, 8).getValues();
  var list = [];
  for (var i = rows.length - 1; i >= 0; i--) {
    var m = rowToMsg_(rows[i]);
    m.nick = String(rows[i][2]);   // 管理員才看得到暱稱
    list.push(m);
  }
  return { ok: true, list: list };
}

function adminReply_(req) {
  if (!isAdmin_(req.key)) return { ok: false, err: '管理員密碼不正確' };
  var id = String(req.id || '');
  var body = String(req.body || '').trim().slice(0, MAX_BODY);
  if (!body) return { ok: false, err: '回覆內容是空的' };

  var sh = sheet_(SHEET_MSG,
    ['編號', '時間', '暱稱', '身分碼', '內容', '管理員回覆', '回覆時間', '狀態']);
  var last = sh.getLastRow();
  if (last < 2) return { ok: false, err: '找不到這則留言' };

  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) {
      var row = i + 2;
      sh.getRange(row, 6).setValue(body);
      sh.getRange(row, 7).setValue(new Date());
      sh.getRange(row, 8).setValue('已回覆');
      return { ok: true };
    }
  }
  return { ok: false, err: '找不到這則留言' };
}

function rowToMsg_(r) {
  return {
    id: String(r[0]),
    at: fmt_(r[1]),
    body: String(r[4]),
    reply: String(r[5] || ''),
    replyAt: r[6] ? fmt_(r[6]) : '',
    status: String(r[7] || '待回覆')
  };
}

/* ============================================================
   三、身分與工具
   ============================================================ */

// 身分碼 = SHA-256(SALT + 暱稱小寫 + 密碼)，試算表只存這串，不存明碼密碼
function userKey_(nick, pw) {
  var salt = prop_('SALT');
  return sha256_(salt + '|' + nick.toLowerCase() + '|' + pw);
}

function checkUser_(nick, pw, createIfMissing) {
  if (!nick || !pw) return { ok: false, err: '請填暱稱和密碼' };
  var key = userKey_(nick, pw);
  var sh = sheet_(SHEET_USER, ['暱稱', '身分碼', '建立時間']);
  var last = sh.getLastRow();
  var rows = (last > 1) ? sh.getRange(2, 1, last - 1, 2).getValues() : [];

  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).toLowerCase() === nick.toLowerCase()) {
      if (String(rows[i][1]) === key) return { ok: true, key: key, isNew: false };
      return { ok: false, err: '這個暱稱已經有人使用，密碼不正確。換一個暱稱或確認密碼。' };
    }
  }

  if (!createIfMissing) {
    return { ok: false, err: '查不到這個暱稱，或密碼不正確。' };
  }
  sh.appendRow([nick, key, new Date()]);
  return { ok: true, key: key, isNew: true };
}

function isAdmin_(key) {
  var real = prop_('ADMIN_KEY');
  if (!real) return false;
  return sha256_(String(key)) === sha256_(real);
}

function sha256_(s) {
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  var out = '';
  for (var i = 0; i < raw.length; i++) {
    out += ('0' + (raw[i] & 0xFF).toString(16)).slice(-2);
  }
  return out;
}

function prop_(k) {
  var v = CONFIG[k] || '';
  // 還沒改過預設值就當作沒設定，管理員功能會全部擋下
  if (v && v.indexOf('換成你的') !== 0) return v;
  // 也支援把密碼放在「專案設定 → 指令碼屬性」的舊做法
  return PropertiesService.getScriptProperties().getProperty(k) || '';
}

function fmt_(d) {
  if (!d) return '';
  try { return Utilities.formatDate(new Date(d), TZ, 'yyyy/MM/dd HH:mm'); }
  catch (e) { return String(d); }
}

function sheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function optionalSheet_(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function text_(s) {
  return ContentService.createTextOutput(s)
    .setMimeType(ContentService.MimeType.TEXT);
}

/* ============================================================
   四、第一次部署後手動執行這個
   ============================================================ */

function setup() {
  sheet_(SHEET_HIT, ['時間', '日期', '頁面', '訪客', '來源', '裝置']);
  sheet_(SHEET_DAY, ['日期', '瀏覽次數', '不重複訪客']);
  sheet_(SHEET_PAGE, ['頁面', '累計次數']);
  sheet_(SHEET_MSG, ['編號', '時間', '暱稱', '身分碼', '內容', '管理員回覆', '回覆時間', '狀態']);
  sheet_(SHEET_USER, ['暱稱', '身分碼', '建立時間']);

  if (!prop_('ADMIN_KEY')) {
    throw new Error('還沒改 CONFIG.ADMIN_KEY，請先把檔案最上面的「換成你的管理員密碼」換掉。');
  }
  if (!prop_('SALT')) {
    throw new Error('還沒設 CONFIG.SALT。');
  }
  Logger.log('設定完成，可以部署了。');
}
