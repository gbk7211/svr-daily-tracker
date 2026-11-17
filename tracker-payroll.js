/* =====================================================================
   SVR Tracker admin — PAYROLL check + OWNER REPORT
   Used by dashboard.html (Daily Report). Payroll numbers come from the
   OIAS server (svr.oias-ops.online), protected by the Maintenance admin PIN.
   Nothing here changes the Daily Tracker or the Google Sheet.
   ===================================================================== */
var PAY_API = 'https://svr.oias-ops.online';
try { if (localStorage.getItem('maintApiOverride')) PAY_API = localStorage.getItem('maintApiOverride'); } catch (e) {}
var PAY = {};            // date -> server answer
// Punch report for a day is only complete the next morning, so the payroll check
// for report date D always uses the punches of D-1.
function payDate(d) { var p = d.split('-'), t = new Date(+p[0], +p[1] - 1, +p[2] - 1);
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); }
var PAY_BUSY = {};

function payPin(ask) {
  var p = '';
  try { p = localStorage.getItem('maintAdminPin') || ''; } catch (e) {}
  if (!p && ask) {
    p = (prompt('Payroll uses your MAINTENANCE admin PIN (the one for the Maintenance admin page):') || '').trim();
    if (p) try { localStorage.setItem('maintAdminPin', p); } catch (e) {}
  }
  return p;
}
function payCall(method, path, bodyObj, isForm) {
  var opt = { method: method, headers: { 'X-Admin-Pin': payPin(true) } };
  if (bodyObj) {
    if (isForm) opt.body = bodyObj;
    else { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(bodyObj); }
  }
  return fetch(PAY_API + path, opt).then(function (r) { return r.json(); }).then(function (j) {
    if (!j.ok && j.error === 'wrong pin') { try { localStorage.removeItem('maintAdminPin'); } catch (e) {} }
    return j;
  });
}

// ---- fetch payroll for a date (once), then redraw the Daily Report
function payFor(d) {
  if (PAY[d]) return PAY[d];
  if (!payPin(false)) return { needPin: true };
  if (!PAY_BUSY[d]) {
    PAY_BUSY[d] = true;
    payCall('GET', '/api/m/admin/payroll/day?date=' + d).then(function (j) {
      PAY_BUSY[d] = false;
      PAY[d] = j.ok ? j : { error: j.error || 'error' };
      if (view === 'day' && payDate(reportDate) === d) draw();
    }).catch(function () { PAY_BUSY[d] = false; PAY[d] = { error: 'Cannot reach payroll server' }; if (view === 'day') draw(); });
  }
  return { loading: true };
}
function payConnect() { if (payPin(true)) { PAY = {}; draw(); } }

// ---- one outlet's payroll check for date d
// returns {na:true} when it should not count, else {done, pct, text, detail, device}
function payCheck(o, rd) {
  var d = payDate(rd), P = PAY[d];
  if (!P || !P.ok) return { na: true };
  var s = P.outlets[o];
  if (!s) return { na: true, nodata: true };
  var c = (DATA.grid[o] && DATA.grid[o][d]) || null;   // tracker attendance on the same (punch) day
  var issues = (s.issues || []).slice();
  var device = s.present === 0 && s.roll > 0;
  if (device && c && c.a) issues.push('Tracker shows attendance entered but payroll has 0 punches');
  var base = s.headcount ? s.present + '/' + s.headcount + ' present' : s.present + ' present (headcount not set)';
  var extra = issues.filter(function (x) { return !/^Payroll \d+%/.test(x); });   // % is already shown
  if (issues.length && s.pct < (PAY[d].target || 75) && !device) extra.unshift('Below ' + PAY[d].target + '% target');
  var detail = extra.join(' · ') + (extra.length ? ' · ' : '') + base +
               (s.errors ? ' · ' + s.errors + ' punch errors' : '') +
               (issues.length && s.red_days > 1 ? ' · ' + s.red_days + ' days in a row' : '');
  return { done: !issues.length, pct: s.pct, s: s, device: device, text: s.pct + '%', detail: detail, issues: issues, extra: extra };
}

// ---- table cell for the Daily Report
function payCellHtml(o, rd, isHol) {
  var d = payDate(rd);
  var P = PAY[d] || payFor(d);
  if (P.needPin) return '<td><a href="#" onclick="payConnect();return false" style="font-size:12px">enter PIN</a></td>';
  if (P.loading) return '<td style="color:#999;font-size:12px">loading…</td>';
  if (P.error) return '<td style="color:#999;font-size:12px">' + esc(P.error) + '</td>';
  var k = payCheck(o, rd);
  if (k.na) return '<td style="color:#999;font-size:12px">' + (!Object.keys(P.outlets || {}).length ? 'no file for this date' : k.nodata ? 'not in payroll file' : '—') + '</td>';
  var s = k.s;
  return '<td class="' + (k.done ? 'okcell' : 'ncell') + '"><span class="' + (k.done ? 'y' : 'n') + '" style="font-size:15px">' + k.text + '</span>' +
    '<div style="font-size:11px;color:#555">' + s.present + '/' + (s.headcount || '?') + ' · ' + s.errors + ' err</div>' +
    (k.done ? '' : '<div style="font-size:11px;color:#b91c1c">' + esc(k.extra.join(' · ')) + '</div>') + '</td>';
}

// ---- bar at the top of the Daily Report
function payTopBar(rd) {
  var d = payDate(rd), P = PAY[d] || payFor(d), info;
  if (P.needPin) info = '<a href="#" onclick="payConnect();return false">Connect payroll (Maintenance admin PIN)</a>';
  else if (P.loading) info = 'loading…';
  else if (P.error) info = '<span style="color:#b91c1c">' + esc(P.error) + '</span>';
  else {
    var u = P.last_upload;
    var has = Object.keys(P.outlets).length;
    info = 'punches of <b>' + d + '</b> (day before the report date) · ' +
      (u ? 'Last file uploaded ' + esc(u.at) + ' (covers ' + esc(u.first_date) + ' to ' + esc(u.last_date) + ')' : 'No file uploaded yet');
    if (!has && u) info += '<br><b style="color:#b45309">⚠ The punch file has no data for ' + d + '.</b> It covers ' + esc(u.first_date) + ' to ' + esc(u.last_date) +
      ' — upload the newer punch report.';
    info += ' · target ' + P.target + '%';
  }
  return '<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #ddd">' +
    '<b>👥 Payroll:</b> <span style="font-size:13px">' + info + '</span><br>' +
    '<button class="btn btn2" style="margin-top:6px" onclick="payPickFile()">📤 Upload punch report</button> ' +
    '<button class="btn" style="margin-top:6px;background:#475569" onclick="payHeadcount()">👥 Staff headcount</button> ' +
    '<button class="btn" style="margin-top:6px;background:#1a1a2e" onclick="ownerReport()">📄 Owner report</button>' +
    '<input type="file" id="payfile" accept=".xlsx" style="display:none" onchange="payUpload(this)"></div>';
}

function payPickFile() { if (payPin(true)) document.getElementById('payfile').click(); }
function payUpload(inp) {
  var f = inp.files && inp.files[0]; if (!f) return;
  var fd = new FormData(); fd.append('file', f);
  var old = document.title; document.title = 'Uploading…';
  payCall('POST', '/api/m/admin/payroll/upload', fd, true).then(function (j) {
    document.title = old;
    if (!j.ok) { alert('Upload failed: ' + j.error); return; }
    var names = Object.keys(j.branches).map(function (k) { return '• ' + j.branches[k] + '  →  ' + k; }).join('\n');
    alert('✅ Punch report loaded: ' + j.rows + ' staff, ' + j.first_date + ' to ' + j.last_date + '\n\n' + names);
    PAY = {}; draw();
  }).catch(function () { document.title = old; alert('Cannot reach the payroll server.'); });
}

// ---- headcount editor (actual staff per outlet, per month)
function payHeadcount() {
  var month = reportDate.substring(0, 7);
  payCall('GET', '/api/m/admin/payroll/headcount?month=' + month).then(function (j) {
    if (!j.ok) { alert(j.error); return; }
    var names = DATA.outlets.slice();
    var h = '<div id="paybox" style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:50;overflow:auto">' +
      '<div class="card" style="max-width:460px;margin:40px auto"><h3 style="margin-top:0">👥 Actual staff — ' + month + '</h3>' +
      '<p style="font-size:13px;color:#555">Real headcount working at each outlet this month. Payroll % = present in punch report ÷ this number. ' +
      'Grey numbers are carried from an earlier month — save to confirm them for ' + month + '.</p><table>';
    names.forEach(function (o, i) {
      var v = j.headcount[o];
      h += '<tr><td class="left">' + esc(o) + '</td><td><input id="hc' + i + '" inputmode="numeric" style="width:90px' +
        (v && v.carried ? ';color:#999' : '') + '" value="' + (v ? v.staff : '') + '"></td></tr>';
    });
    h += '</table><p style="font-size:13px;margin:12px 0 4px">Payroll target %: <input id="hct" style="width:70px" value="' + j.target + '">' +
      ' &nbsp; Punch-error limit: <input id="hce" style="width:70px" value="' + j.err_limit + '"></p>' +
      '<button class="btn" onclick="paySaveHc(\'' + month + '\')">Save</button> ' +
      '<button class="btn" style="background:#999" onclick="document.getElementById(\'paybox\').remove()">Close</button></div></div>';
    document.body.insertAdjacentHTML('beforeend', h);
  }).catch(function () { alert('Cannot reach the payroll server.'); });
}
function paySaveHc(month) {
  var hc = {};
  DATA.outlets.forEach(function (o, i) { var v = document.getElementById('hc' + i).value.trim(); if (v) hc[o] = v; });
  payCall('POST', '/api/m/admin/payroll/headcount', { month: month, headcount: hc,
    target: document.getElementById('hct').value, err_limit: document.getElementById('hce').value }).then(function (j) {
    if (!j.ok) { alert(j.error); return; }
    document.getElementById('paybox').remove(); PAY = {}; draw();
  });
}

// =====================================================================
//  OWNER REPORT — same look as the "Sangeetha Outlet Tracker" report
// =====================================================================
var CHECKS = [
  { k: 'grn', label: 'Vendor Bill GRN', short: 'GRN' },
  { k: 'trf', label: 'Cost Center Transfer', short: 'CCT' },
  { k: 'a', label: 'Attendance', short: 'Attendance' },
  { k: 'g', label: 'Gas Reading & Consumption', short: 'Gas' },
  { k: 'e', label: 'EB Reading & Consumption', short: 'EB' },
  { k: 'pay', label: 'Payroll Punch (prev. day)', short: 'Payroll' }
];
var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function longDate(d) { var p = d.split('-'); return (+p[2]) + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0]; }
function shortDate(d) { var p = d.split('-'); return (+p[2]) + ' ' + MONTHS[+p[1] - 1].substring(0, 3); }
function prevDay(d) { var p = d.split('-'), t = new Date(+p[0], +p[1] - 1, +p[2] - 1); return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()); }

// is check k pending for outlet o on date d?  (null = not applicable)
function pendingOn(o, d, k) {
  var meta = DATA.meta[o], st = cellState(o, d);
  if (st.k === 'hol' || st.k === 'fut') return null;
  var c = (DATA.grid[o] && DATA.grid[o][d]) || null;
  var pp = DATA.petpooja[o + '|' + d] || { grn: false, transfer: false };
  if (k === 'a') return meta.att ? !(c && c.a) : null;
  if (k === 'g') return meta.gas ? !(c && c.g) : null;
  if (k === 'e') return meta.eb ? !(c && c.e) : null;
  if (k === 'grn') return !pp.grn;
  if (k === 'trf') return !pp.transfer;
  return null;
}
function streakOf(o, d, k) {
  var n = 0, x = d, month = DATA.month;
  while (x.substring(0, 7) === month) {
    var p = pendingOn(o, x, k);
    if (p === false) break;
    if (p === true) n++;
    x = prevDay(x);
  }
  return { n: n, fullMonth: x.substring(0, 7) !== month && n > 1 };
}
function displayName(o, d) {
  var P = PAY[payDate(d)], br = P && P.ok && P.outlets[o] && P.outlets[o].branch;
  return (br && /fast\s*foods/i.test(br) ? 'Sangeetha Fast Foods – ' : 'Sangeetha – ') + o;
}

function ownerReportData(d) {
  var rows = [];
  DATA.outlets.forEach(function (o) {
    var st = cellState(o, d);
    var pp = DATA.petpooja[o + '|' + d] || { reasons: {} }, rs = pp.reasons || {};
    var r = { o: o, name: displayName(o, d), checks: [], hol: st.k === 'hol', device: false };
    if (!r.hol) CHECKS.forEach(function (c) {
      if (c.k === 'pay') {
        var k = payCheck(o, d);
        if (k.na) return;
        r.checks.push({ c: c, done: k.done, label: c.label + ' — ' + k.text, reason: k.done ? '' : k.detail,
                        brief: k.device ? 'Payroll 0 punches' : 'Payroll ' + k.text });
        if (!k.done && k.device) r.device = true;
        return;
      }
      var p = pendingOn(o, d, c.k);
      if (p === null) return;
      var reason = '', brief = c.short;
      if (p) {
        var sk = streakOf(o, d, c.k), rk = { a: 'a', g: 'g', e: 'e', grn: 'grn', trf: 'trf' }[c.k];
        var span = sk.fullMonth ? 'not done since 1st of the month' : (sk.n > 1 ? 'not done for last ' + sk.n + ' days' : 'not updated');
        reason = (rs[rk] ? rs[rk] + ' · ' : '') + span.charAt(0).toUpperCase() + span.slice(1);
        brief = c.short + (sk.fullMonth ? ' (full month)' : sk.n > 1 ? ' (' + sk.n + ' days)' : '');
      }
      r.checks.push({ c: c, done: !p, label: c.label, reason: reason, brief: brief });
    });
    r.total = r.checks.length;
    r.pend = r.checks.filter(function (x) { return !x.done; });
    r.doneN = r.total - r.pend.length;
    r.sev = r.hol || !r.pend.length ? 'good' : (r.pend.length >= 3 || r.device ? 'crit' : 'warn');
    rows.push(r);
  });
  var order = { crit: 0, warn: 1, good: 2 };
  rows.sort(function (a, b) { return order[a.sev] - order[b.sev] || b.pend.length - a.pend.length || a.o.localeCompare(b.o); });
  return rows;
}

function ownerReportHtml(d) {
  var rows = ownerReportData(d), today = todayStr();
  var n = { crit: 0, warn: 0, good: 0 }, tot = 0, done = 0;
  rows.forEach(function (r) { n[r.sev]++; tot += r.total; done += r.doneN; });
  var pct = tot ? Math.round(1000 * done / tot) / 10 : 100;
  var E = function (s) { return esc(s).replace(/&amp;/g, '&amp;'); };
  var h = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>Sangeetha Outlet Tracker — ' + shortDate(today) + ' ' + today.substring(0, 4) + '</title><style>' + OWNER_CSS + '</style></head><body>' +
    '<div class="topbar"><div><div class="topbar-title">🍽 SVR Sangeetha — Daily Compliance Tracker</div>' +
    '<div class="topbar-meta">Data: ' + longDate(d) + ' &nbsp;|&nbsp; Report: ' + longDate(today) + '</div></div>' +
    '<div class="topbar-badge">' + rows.length + ' Outlets</div></div><div class="container">' +
    '<div class="header-card"><span style="font-weight:700;font-size:.93rem">Today\'s Summary</span>' +
    '<span class="chip chip-crit">🔴 ' + n.crit + ' Critical</span><span class="chip chip-warn">🟡 ' + n.warn + ' Warning</span>' +
    '<span class="chip chip-good">✅ ' + n.good + ' All Done</span><span class="chip chip-info">📋 ' + shortDate(d) + ' data · ' + shortDate(today) + ' report</span></div>';
  rows.forEach(function (r) {
    if (r.sev === 'good') return;
    var all = r.pend.length === r.total;
    var txt = (all ? 'All ' + r.total + ' checks failing — ' : '') + r.pend.map(function (x) { return x.brief; }).join(' + ') +
      (r.sev === 'crit' && r.device ? '. Payroll punch device / sync needs checking.' : '') +
      (all ? ' Immediate management review required.' : '');
    h += '<div class="alert-bar alert-' + r.sev + '"><span class="icon">' + (r.sev === 'crit' ? '🚨' : '⚠️') + '</span><div><strong>' +
      (r.sev === 'crit' ? 'CRITICAL' : 'WARNING') + ' — ' + E(r.o) + ':</strong> ' + E(txt) + '</div></div>';
  });
  h += '<div class="summary-grid"><div class="scard s-total"><div class="num">' + rows.length + '</div><div class="lbl">Total Outlets</div></div>' +
    '<div class="scard s-crit"><div class="num">' + n.crit + '</div><div class="lbl">Critical</div></div>' +
    '<div class="scard s-warn"><div class="num">' + n.warn + '</div><div class="lbl">Warning</div></div>' +
    '<div class="scard s-good"><div class="num">' + n.good + '</div><div class="lbl">All Done</div></div>' +
    '<div class="scard s-total"><div class="num">' + (tot - done) + '</div><div class="lbl">Pending Checks</div></div></div>' +
    '<div class="progress-wrap"><div class="progress-label"><span>Overall Completion</span><span>' + done + ' / ' + tot +
    ' checks done &nbsp;<strong>' + pct + '%</strong></span></div><div class="progress-bg"><div class="progress-fill" style="width:' + pct + '%"></div></div></div>' +
    '<div class="controls"><button class="filter-pill fp-all active" onclick="filterCards(\'all\',this)">All (' + rows.length + ')</button>' +
    '<button class="filter-pill fp-crit" onclick="filterCards(\'crit\',this)">🔴 Critical (' + n.crit + ')</button>' +
    '<button class="filter-pill fp-warn" onclick="filterCards(\'warn\',this)">🟡 Warning (' + n.warn + ')</button>' +
    '<button class="filter-pill fp-good" onclick="filterCards(\'good\',this)">✅ Done (' + n.good + ')</button>' +
    '<input class="search-box" type="text" placeholder="Search outlet…" oninput="searchCards(this.value)">' +
    '<button class="expand-btn" onclick="toggleAll()">Expand All</button></div><div class="outlets-grid" id="cardsGrid">';
  var COL = { crit: ['#f5c6cb', '#c0392b', '#c0392b'], warn: ['#ffeeba', '#e6a817', '#b7770d'], good: ['#c8e6c9', '#2e7d32', '#2e7d32'] };
  rows.forEach(function (r, i) {
    var id = 'o' + i, col = COL[r.sev], frac = r.total ? r.doneN / r.total : 1, off = (138.2 * (1 - frac)).toFixed(1);
    var tag = r.hol ? 'Weekly Holiday' : !r.pend.length ? 'All Complete' : r.pend.length === r.total ? 'All ' + r.total + ' Checks Failing' :
      r.pend.map(function (x) { return x.c.short; }).join(' + ') + ' Pending';
    h += '<div class="outlet-card oc-' + r.sev + '" data-sev="' + r.sev + '" data-name="' + E(r.o.toLowerCase()) + '"><div class="oc-header"><div>' +
      '<div class="oc-name">' + E(r.name) + '</div><div class="oc-sub">' + (r.hol ? 'No checks — weekly holiday' : r.doneN + ' / ' + r.total + ' checks done') + '</div>' +
      '<span class="oc-tag otag-' + r.sev + '">' + E(tag) + '</span></div><div><svg width="52" height="52" viewBox="0 0 52 52">' +
      '<circle cx="26" cy="26" r="22" fill="none" stroke="' + col[0] + '" stroke-width="6"/>' +
      '<circle cx="26" cy="26" r="22" fill="none" stroke="' + col[1] + '" stroke-width="6" stroke-dasharray="138.2" stroke-dashoffset="' + off +
      '" stroke-linecap="round" transform="rotate(-90 26 26)"/><text x="26" y="31" text-anchor="middle" font-size="11" font-weight="700" fill="' + col[2] + '">' +
      (r.hol ? 'H' : r.doneN + '/' + r.total) + '</text></svg></div></div><div class="oc-checks" id="chk-' + id + '">';
    r.checks.forEach(function (x) {
      h += '<div class="check-row"><span class="cr-dot ' + (x.done ? 'd-y' : 'd-n') + '"></span><div><div class="cr-label' +
        (x.done ? '' : (r.sev === 'crit' ? ' rr-crit' : ' rr-warn')) + '">' + E(x.label) + '</div>' +
        (x.reason ? '<div class="cr-reason">' + E(x.reason) + '</div>' : '') + '</div></div>';
    });
    h += '</div><div class="toggle-btn-wrap"><button class="toggle-btn" onclick="toggleCard(\'' + id + '\')">▼ Show checks</button></div></div>';
  });
  h += '</div>';
  // payroll snapshot table
  var P = PAY[payDate(d)];
  if (P && P.ok && Object.keys(P.outlets).length) {
    var list = Object.keys(P.outlets).map(function (k) { return P.outlets[k]; }).sort(function (a, b) { return a.pct - b.pct; });
    h += '<div class="progress-wrap" style="margin-top:16px;overflow-x:auto"><div class="progress-label"><span>👥 Payroll Punch — ' + longDate(payDate(d)) + ' (previous day)' +
      '</span><span>target ' + P.target + '%</span></div><table class="pt"><tr><th>Outlet</th><th>Present / Staff</th><th>Payroll %</th>' +
      '<th>Punch errors</th><th>No record</th><th>7+ days absent</th></tr>';
    list.forEach(function (s) {
      var bad = s.issues && s.issues.length;
      h += '<tr><td style="text-align:left"><b>' + E(s.outlet) + '</b></td><td>' + s.present + ' / ' + (s.headcount || '?') + '</td>' +
        '<td><b style="color:' + (bad ? '#c0392b' : '#2e7d32') + '">' + s.pct + '%</b></td><td>' + s.errors + '</td><td>' + s.no_rec + '</td><td>' + s.long_abs + '</td></tr>';
    });
    h += '</table><div style="font-size:.72rem;color:#888;margin-top:8px">Payroll % = staff with punches on the day ÷ actual outlet headcount. Source: Petpooja Payroll punch report.</div></div>';
  }
  h += '<div class="footer">SVR Sangeetha Restaurant Group &nbsp;·&nbsp; MIS Compliance Dashboard &nbsp;·&nbsp; Data: ' + shortDate(d) + ' ' + d.substring(0, 4) +
    ' &nbsp;·&nbsp; Generated: ' + shortDate(today) + ' ' + today.substring(0, 4) + '</div></div><script>' + OWNER_JS + '<\/script></body></html>';
  return h;
}

function ownerReport() {
  var d = reportDate, P = PAY[payDate(d)];
  if (!P || !P.ok) {
    if (!confirm('Payroll data is not loaded for ' + payDate(d) + ' — make the report without the Payroll check?')) return;
  } else if (!Object.keys(P.outlets).length) {
    if (!confirm('The uploaded punch report has no data for ' + payDate(d) + '. Make the report without Payroll?')) return;
  }
  var html = ownerReportHtml(d);
  var name = 'Sangeetha_Outlet_Tracker_' + d + '.html';
  var blob = new Blob([html], { type: 'text/html' });
  try {
    var file = new File([blob], name, { type: 'text/html' });
    if (navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      navigator.share({ files: [file], title: 'Sangeetha Outlet Tracker ' + d }).catch(function () {});
      return;
    }
  } catch (e) {}
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  window.open(url, '_blank');
}

var OWNER_CSS = "*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',system-ui,sans-serif;background:#f0f2f5;color:#1a1a2e;min-height:100vh}" +
  ".topbar{background:linear-gradient(135deg,#1a1a2e 0%,#16213e 60%,#0f3460 100%);color:#fff;padding:18px 28px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px}" +
  ".topbar-title{font-size:1.1rem;font-weight:700}.topbar-meta{font-size:.78rem;opacity:.75;margin-top:3px}.topbar-badge{background:rgba(255,255,255,.15);border-radius:20px;padding:6px 14px;font-size:.8rem;font-weight:600}" +
  ".container{max-width:1200px;margin:0 auto;padding:20px 16px}.header-card{background:#fff;border-radius:12px;padding:18px 22px;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,.08);display:flex;align-items:center;gap:12px;flex-wrap:wrap}" +
  ".chip{border-radius:20px;padding:5px 13px;font-size:.78rem;font-weight:600}.chip-crit{background:#fde8e8;color:#c0392b}.chip-warn{background:#fef3cd;color:#b7770d}.chip-good{background:#e8f5e9;color:#2e7d32}.chip-info{background:#e3f2fd;color:#1565c0}" +
  ".alert-bar{border-radius:10px;padding:12px 16px;margin-bottom:9px;font-size:.86rem;font-weight:600;display:flex;align-items:flex-start;gap:10px;line-height:1.45}" +
  ".alert-crit{background:#fde8e8;border-left:4px solid #c0392b;color:#7b1a1a}.alert-warn{background:#fef3cd;border-left:4px solid #e6a817;color:#7a4f00}.alert-bar .icon{font-size:1rem;margin-top:1px;flex-shrink:0}" +
  ".summary-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:16px 0}.scard{background:#fff;border-radius:10px;padding:15px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.07)}" +
  ".scard .num{font-size:1.9rem;font-weight:800;line-height:1}.scard .lbl{font-size:.72rem;color:#666;margin-top:5px;text-transform:uppercase;letter-spacing:.4px}" +
  ".s-crit .num{color:#c0392b}.s-warn .num{color:#e6a817}.s-good .num{color:#2e7d32}.s-total .num{color:#1a1a2e}" +
  ".progress-wrap{background:#fff;border-radius:10px;padding:15px 20px;margin-bottom:16px;box-shadow:0 1px 4px rgba(0,0,0,.07)}.progress-label{display:flex;justify-content:space-between;font-size:.82rem;font-weight:600;margin-bottom:8px;gap:8px}" +
  ".progress-bg{background:#e9ecef;border-radius:8px;height:13px;overflow:hidden}.progress-fill{height:100%;border-radius:8px;background:linear-gradient(90deg,#2e7d32,#43a047)}" +
  ".controls{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:14px}.filter-pill{border:none;border-radius:20px;padding:6px 14px;font-size:.79rem;font-weight:600;cursor:pointer}" +
  ".fp-all{background:#e9ecef;color:#333}.fp-all.active{background:#1a1a2e;color:#fff}.fp-crit{background:#fde8e8;color:#c0392b}.fp-crit.active{background:#c0392b;color:#fff}" +
  ".fp-warn{background:#fef3cd;color:#b7770d}.fp-warn.active{background:#e6a817;color:#fff}.fp-good{background:#e8f5e9;color:#2e7d32}.fp-good.active{background:#2e7d32;color:#fff}" +
  ".search-box{flex:1;min-width:150px;max-width:240px;padding:7px 13px;border:1px solid #ddd;border-radius:20px;font-size:.82rem;outline:none}" +
  ".expand-btn{margin-left:auto;background:#fff;border:1px solid #ddd;border-radius:20px;padding:6px 14px;font-size:.79rem;cursor:pointer;font-weight:600}" +
  ".outlets-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:13px}.outlet-card{background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:hidden}" +
  ".oc-crit{border-top:4px solid #c0392b}.oc-warn{border-top:4px solid #e6a817}.oc-good{border-top:4px solid #2e7d32}.oc-header{padding:13px 15px 9px;display:flex;align-items:flex-start;justify-content:space-between;gap:8px}" +
  ".oc-name{font-size:.91rem;font-weight:700;line-height:1.3}.oc-sub{font-size:.71rem;color:#888;margin-top:2px}.oc-tag{display:inline-block;border-radius:12px;padding:3px 9px;font-size:.71rem;font-weight:700;margin-top:5px}" +
  ".otag-crit{background:#fde8e8;color:#c0392b}.otag-warn{background:#fef3cd;color:#b7770d}.otag-good{background:#e8f5e9;color:#2e7d32}.oc-checks{padding:0 15px 4px;display:none}.oc-checks.expanded{display:block}" +
  ".check-row{display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-bottom:1px solid #f5f5f5;font-size:.81rem}.check-row:last-child{border-bottom:none}" +
  ".cr-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:4px}.d-y{background:#2e7d32}.d-n{background:#c0392b}.cr-label{flex:1;font-weight:500}.cr-reason{font-size:.73rem;color:#888;margin-top:1px}" +
  ".rr-crit{color:#c0392b;font-weight:700}.rr-warn{color:#e6a817;font-weight:700}.toggle-btn-wrap{padding:2px 15px 12px}.toggle-btn{background:none;border:none;font-size:.77rem;color:#999;cursor:pointer}" +
  ".pt{width:100%;border-collapse:collapse;font-size:.8rem}.pt th{font-size:.7rem;color:#666;text-transform:uppercase;letter-spacing:.3px;padding:6px;text-align:center;border-bottom:1px solid #eee}" +
  ".pt td{padding:6px;text-align:center;border-bottom:1px solid #f3f3f3}.footer{text-align:center;padding:22px;font-size:.75rem;color:#aaa;margin-top:8px}@media(max-width:600px){.outlets-grid{grid-template-columns:1fr}}";

var OWNER_JS = "function toggleCard(id){var el=document.getElementById('chk-'+id),btn=el.nextElementSibling.querySelector('button');" +
  "if(el.classList.contains('expanded')){el.classList.remove('expanded');btn.textContent='\\u25BC Show checks';}else{el.classList.add('expanded');btn.textContent='\\u25B2 Hide checks';}}" +
  "var allExpanded=false;function toggleAll(){allExpanded=!allExpanded;document.querySelectorAll('.oc-checks').forEach(function(el){el.classList.toggle('expanded',allExpanded);" +
  "var b=el.nextElementSibling.querySelector('button');b.textContent=allExpanded?'\\u25B2 Hide checks':'\\u25BC Show checks';});" +
  "document.querySelector('.expand-btn').textContent=allExpanded?'Collapse All':'Expand All';}" +
  "function filterCards(sev,btn){document.querySelectorAll('.filter-pill').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');" +
  "document.querySelectorAll('.outlet-card').forEach(function(c){c.style.display=(sev==='all'||c.dataset.sev===sev)?'':'none';});}" +
  "function searchCards(v){var q=v.toLowerCase();document.querySelectorAll('.outlet-card').forEach(function(c){c.style.display=(!q||c.dataset.name.indexOf(q)>=0)?'':'none';});}";

// =====================================================================
//  PETPOOJA AUTO-CHECK — results arrive from the "SVR Petpooja check"
//  bookmark as  dashboard.html#ppauto=<json>  and are applied here
// =====================================================================
var PPAUTO = null;
try {
  var _m = location.hash.match(/ppauto=([^&]+)/);
  if (_m) PPAUTO = JSON.parse(decodeURIComponent(_m[1]));
} catch (e) { PPAUTO = null; }

function ppAutoMaybe() {
  if (!PPAUTO || PPAUTO.shown) return;
  var d = PPAUTO.date;
  if (DATA.month !== d.substring(0, 7)) { reportDate = d; load(d.substring(0, 7), 'day'); return; }
  PPAUTO.shown = true;
  if (reportDate !== d || view !== 'day') { reportDate = d; view = 'day'; draw(); }
  var R = PPAUTO.results, rows = '';
  Object.keys(R).forEach(function (o) {
    var r = R[o], known = DATA.outlets.indexOf(o) >= 0;
    var c = function (ok, t) { return '<td style="text-align:left;color:' + (ok ? '#15803d' : '#b91c1c') + '">' + (ok ? '✔ ' : '✘ ') + esc(t) + '</td>'; };
    rows += '<tr><td class="left"><b>' + esc(o) + '</b>' + (known ? '' : ' <span style="color:#b45309">(not in tracker)</span>') + '</td>' +
      (r.error ? '<td colspan="2" style="color:#b45309">not checked: ' + esc(r.error) + '</td>' : c(r.grn, r.grnText) + c(r.transfer, r.trfText)) + '</tr>';
  });
  var h = '<div id="ppbox" style="position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:50;overflow:auto">' +
    '<div class="card" style="max-width:820px;margin:30px auto"><h3 style="margin-top:0">🔄 Petpooja check — apply to ' + esc(d) + '</h3>' +
    '<p style="font-size:13px;color:#555">Checked Petpooja for <b>' + esc(PPAUTO.checked) + '</b>: GRN = at least 1 vendor bill on or after that day · ' +
    'Transfer = at least ' + PPAUTO.min + ' transfers that day. Applying ticks GRN / Transfer for each outlet and writes the reason when not done. ' +
    'Your other reasons (Attendance / Gas / EB) are kept.</p>' +
    '<table><tr><th class="left">Outlet</th><th class="left">Vendor Bill GRN</th><th class="left">Cost Center Transfer</th></tr>' + rows + '</table>' +
    '<p id="ppmsg" style="font-weight:700"></p>' +
    '<button class="btn" id="ppgo" onclick="ppAutoApply()">✅ Apply to ' + esc(d) + '</button> ' +
    '<button class="btn" style="background:#999" onclick="ppAutoClose()">Cancel</button></div></div>';
  document.body.insertAdjacentHTML('beforeend', h);
}
function ppAutoClose() {
  var b = document.getElementById('ppbox'); if (b) b.remove();
  try { history.replaceState(null, '', location.pathname); } catch (e) {}
}
function ppAutoApply() {
  var d = PPAUTO.date, R = PPAUTO.results;
  var list = Object.keys(R).filter(function (o) { return !R[o].error && DATA.outlets.indexOf(o) >= 0; });
  var btn = document.getElementById('ppgo'), msg = document.getElementById('ppmsg'), n = 0, fail = [];
  btn.disabled = true;
  function next() {
    if (n >= list.length) {
      msg.textContent = fail.length ? '⚠ Saved, except: ' + fail.join(', ') + ' — tick those by hand.' : '✅ Saved for all ' + list.length + ' outlets.';
      msg.style.color = fail.length ? '#b45309' : '#15803d';
      btn.textContent = 'Done'; btn.disabled = false; btn.onclick = function () { ppAutoClose(); draw(); };
      return;
    }
    var o = list[n++], r = R[o];
    msg.textContent = 'Saving ' + o + ' (' + n + ' of ' + list.length + ')…'; msg.style.color = '#555';
    var prev = DATA.petpooja[o + '|' + d] || {}, pr = prev.reasons || {};
    var reasons = { a: pr.a || '', g: pr.g || '', e: pr.e || '',
                    grn: r.grn ? '' : r.grnText, trf: r.transfer ? '' : r.trfText };
    apiPost({ action: 'petpooja', pin: PIN, date: d, outlet: o, grn: !!r.grn, transfer: !!r.transfer, reasons: reasons }).then(function (j) {
      if (!j.ok) fail.push(o); else DATA.petpooja[o + '|' + d] = { grn: !!r.grn, transfer: !!r.transfer, reasons: reasons };
      next();
    }).catch(function () { fail.push(o); next(); });
  }
  next();
}
