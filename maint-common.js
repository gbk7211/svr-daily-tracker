/* =====================================================================
   SVR Maintenance — shared helpers for maint.html, team.html, maint-admin.html
   ===================================================================== */

// ---- Server address. Change here only if the server moves. ----------
var MAINT_API = 'https://svr.oias-ops.online';
try { var _o = localStorage.getItem('maintApiOverride'); if (_o) MAINT_API = _o; } catch (e) {}

var M = {};   // namespace

M.esc = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
};
M.$ = function (id) { return document.getElementById(id); };
M.ls = function (k, v) {
  try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
  catch (e) { return null; }
};

// fetch with timeout; headers = auth headers; body = object (JSON) or FormData
M.call = function (method, path, headers, body, timeoutMs) {
  var ctrl = ('AbortController' in window) ? new AbortController() : null;
  var t = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 25000) : null;
  var opts = { method: method, headers: Object.assign({}, headers || {}) };
  if (ctrl) opts.signal = ctrl.signal;
  if (body instanceof FormData) opts.body = body;
  else if (body) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  return fetch(MAINT_API + path, opts).then(function (r) {
    if (t) clearTimeout(t);
    return r.json().catch(function () { return { ok: false, error: 'Server error (' + r.status + ')' }; });
  }, function (e) {
    if (t) clearTimeout(t);
    return { ok: false, error: 'offline', offline: true };
  });
};

M.toast = function (msg, bad) {
  var el = M.$('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.className = 'toast show' + (bad ? ' bad' : '');
  clearTimeout(M._tt); M._tt = setTimeout(function () { el.className = 'toast'; }, 3200);
};

M.STATUS = {
  'Pending Assignment':           { c: '#b45309', bg: '#fef3c7', short: 'Waiting to assign' },
  'Assigned':                     { c: '#1d4ed8', bg: '#dbeafe', short: 'Assigned' },
  'Accepted':                     { c: '#0e7490', bg: '#cffafe', short: 'Accepted' },
  'In Progress':                  { c: '#6d28d9', bg: '#ede9fe', short: 'In progress' },
  'Delayed':                      { c: '#b91c1c', bg: '#fee2e2', short: 'Delayed' },
  'Pending Manager Confirmation': { c: '#c2410c', bg: '#ffedd5', short: 'Waiting for outlet OK' },
  'Completed':                    { c: '#15803d', bg: '#dcfce7', short: 'Completed' }
};
M.PRI = { 'Emergency': '#b91c1c', 'High': '#c2410c', 'Medium': '#1d4ed8', 'Low': '#475569' };

M.pill = function (status) {
  var s = M.STATUS[status] || { c: '#334155', bg: '#e2e8f0', short: status };
  return '<span class="pill" style="color:' + s.c + ';background:' + s.bg + '">' + M.esc(s.short) + '</span>';
};
M.priTag = function (p) {
  return '<span class="pri" style="color:' + (M.PRI[p] || '#334155') + '">● ' + M.esc(p) + '</span>';
};

// "2026-10-26 14:05" -> "26 Oct, 2:05 PM"
M.when = function (s) {
  if (!s) return '';
  var m = String(s).match(/(\d{4})-(\d\d)-(\d\d)(?: (\d\d):(\d\d))?/);
  if (!m) return s;
  var mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m[2] - 1];
  var out = (+m[3]) + ' ' + mon;
  if (m[4]) { var h = +m[4], ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; out += ', ' + h + ':' + m[5] + ' ' + ap; }
  return out;
};

M.dueText = function (t) {
  if (t.status === 'Completed') return t.sla_met === false ? '<span class="late">Finished late</span>' : '<span class="ontime">On time</span>';
  if (t.overdue) return '<span class="late">⚠ Overdue — target was ' + M.esc(M.when(t.due_at)) + '</span>';
  return 'Target: ' + M.esc(M.when(t.due_at));
};

// Shrink a camera photo before upload (max 1280px, JPEG) — saves mobile data.
M.shrinkPhoto = function (file) {
  return new Promise(function (resolve) {
    if (!file) return resolve(null);
    var img = new Image(), url = URL.createObjectURL(file);
    img.onload = function () {
      var max = 1280, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
      var cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      cv.toBlob(function (b) { resolve(b); }, 'image/jpeg', 0.8);
    };
    img.onerror = function () { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
};

// Ticket card used in every list
M.card = function (t, actionsHtml, opts) {
  opts = opts || {};
  return '<div class="tcard' + (t.overdue ? ' over' : '') + '">' +
    '<div class="trow" onclick="openTicket(\'' + M.esc(t.id) + '\')">' +
      '<div class="tl"><div class="tid">' + M.esc(t.id) + (opts.showOutlet ? ' · <b>' + M.esc(t.outlet) + '</b>' : '') + '</div>' +
      '<div class="ttitle">' + M.esc(t.title) + '</div>' +
      '<div class="tmeta">' + M.priTag(t.priority) + ' · ' + M.esc(t.category) +
        (t.photo_count ? ' · 📷 ' + t.photo_count : '') + '</div>' +
      '<div class="tmeta">' + (t.technician ? '👷 ' + M.esc(t.technician) + ' · ' : '') + 'Raised ' + M.esc(M.when(t.raised_at)) + '</div>' +
      (t.status === 'Delayed' && t.delay_reason ? '<div class="tdelay">⏳ ' + M.esc(t.delay_reason) + (t.expected_at ? ' — expected ' + M.esc(M.when(t.expected_at)) : '') + '</div>' : '') +
      '<div class="tdue">' + M.dueText(t) + '</div></div>' +
      '<div class="tr">' + M.pill(t.status) + '</div>' +
    '</div>' + (actionsHtml ? '<div class="tact">' + actionsHtml + '</div>' : '') + '</div>';
};

// Full ticket detail (timeline + photos) inside the sheet
M.detail = function (t, extraHtml) {
  var h = '<div class="dh"><div><div class="tid">' + M.esc(t.id) + ' · ' + M.esc(t.outlet) + '</div>' +
    '<div class="dtitle">' + M.esc(t.title) + '</div></div>' + M.pill(t.status) + '</div>';
  h += '<div class="dgrid">' +
    '<div><span>Priority</span>' + M.priTag(t.priority) + ' (' + t.sla_hours + 'h target)</div>' +
    '<div><span>Category</span>' + M.esc(t.category) + '</div>' +
    (t.location ? '<div><span>Where</span>' + M.esc(t.location) + '</div>' : '') +
    '<div><span>Raised by</span>' + M.esc(t.raised_by) + ' · ' + M.esc(M.when(t.raised_at)) + '</div>' +
    '<div><span>Technician</span>' + (t.technician ? M.esc(t.technician) : '<i>Not assigned yet</i>') + '</div>' +
    '<div><span>Target</span>' + M.dueText(t) + '</div></div>';
  if (t.description) h += '<div class="ddesc">' + M.esc(t.description) + '</div>';
  if (t.photos && t.photos.length) {
    h += '<div class="photos">' + t.photos.map(function (p) {
      var src = /^(data|blob):/.test(p.url) ? p.url : MAINT_API + p.url;
      return '<a href="' + M.esc(src) + '" target="_blank" rel="noopener"><img src="' + M.esc(src) + '" alt="">' +
        '<span>' + (p.kind === 'after' ? 'After repair' : 'Problem') + '</span></a>';
    }).join('') + '</div>';
  }
  if (extraHtml) h += extraHtml;
  h += '<div class="tlh">Timeline</div><div class="timeline">' + (t.events || []).map(function (e) {
    return '<div class="ev ev-' + M.esc(e.role) + '"><div class="evw">' + M.esc(M.when(e.at)) + ' · <b>' + M.esc(e.actor) + '</b></div>' +
      '<div class="eva">' + M.esc(e.action) + '</div>' + (e.note ? '<div class="evn">' + M.esc(e.note) + '</div>' : '') + '</div>';
  }).reverse().join('') + '</div>';
  return h;
};

M.openSheet = function (html) {
  var s = M.$('sheet');
  if (!s) {
    s = document.createElement('div'); s.id = 'sheet';
    s.innerHTML = '<div class="sbg" onclick="M.closeSheet()"></div><div class="sbox"><button class="sx" onclick="M.closeSheet()">✕</button><div id="sbody"></div></div>';
    document.body.appendChild(s);
  }
  M.$('sbody').innerHTML = html; s.className = 'open';
  document.body.style.overflow = 'hidden';
};
M.closeSheet = function () {
  var s = M.$('sheet'); if (s) s.className = '';
  document.body.style.overflow = '';
};

// Shared CSS, injected once
(function () {
  var css = "" +
  ":root{--brand:#7c2d12;--ink:#1f2937;--muted:#64748b;--line:#e2e8f0;--bg:#f4f5f7;--m:#1e293b}" +
  "*{box-sizing:border-box}body{margin:0;font-family:'Segoe UI',system-ui,Arial,sans-serif;background:var(--bg);color:var(--ink)}" +
  "header{background:var(--m);color:#fff;padding:14px 16px;padding-top:calc(14px + env(safe-area-inset-top));position:sticky;top:0;z-index:5}" +
  "header .t{font-size:19px;font-weight:800}header .s{font-size:13px;color:#cbd5e1;margin-top:2px}header a{color:#fde68a}" +
  ".wrap{max-width:720px;margin:0 auto;padding:14px 14px 110px}" +
  ".big{display:block;width:100%;border:none;border-radius:12px;padding:16px;font-size:17px;font-weight:800;color:#fff;background:var(--m);cursor:pointer;margin:6px 0 14px}" +
  ".big.brand{background:var(--brand)}.big:disabled{opacity:.55}" +
  ".btn{border:none;border-radius:9px;padding:11px 14px;font-size:14.5px;font-weight:700;color:#fff;background:var(--m);cursor:pointer}" +
  ".btn.g{background:#15803d}.btn.r{background:#b91c1c}.btn.o{background:#c2410c}.btn.b{background:#1d4ed8}.btn.l{background:#fff;color:var(--ink);border:1.5px solid var(--line)}" +
  ".btn:disabled{opacity:.5}" +
  ".sec{font-size:13px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:var(--muted);margin:18px 2px 8px}" +
  ".tcard{background:#fff;border-radius:12px;margin-bottom:10px;box-shadow:0 1px 4px rgba(0,0,0,.07);border-left:5px solid #cbd5e1;overflow:hidden}" +
  ".tcard.over{border-left-color:#b91c1c}" +
  ".trow{display:flex;gap:10px;padding:12px 12px 10px;cursor:pointer}.tl{flex:1;min-width:0}.tr{flex:0 0 auto}" +
  ".tid{font-size:12px;color:var(--muted);font-weight:600}.ttitle{font-size:16.5px;font-weight:800;margin:2px 0 4px}" +
  ".tmeta{font-size:13px;color:#475569;margin-top:2px}.tdelay{font-size:13px;color:#b91c1c;font-weight:600;margin-top:4px}" +
  ".tdue{font-size:12.5px;color:var(--muted);margin-top:4px}.late{color:#b91c1c;font-weight:700}.ontime{color:#15803d;font-weight:700}" +
  ".tact{display:flex;gap:8px;flex-wrap:wrap;padding:0 12px 12px}.tact .btn{flex:1;min-width:120px}" +
  ".pill{display:inline-block;font-size:12px;font-weight:800;padding:4px 10px;border-radius:999px;white-space:nowrap}" +
  ".pri{font-weight:700}" +
  "label{display:block;font-size:13.5px;color:#475569;margin:12px 0 4px;font-weight:600}" +
  "input,textarea,select{width:100%;border:1.5px solid #cbd5e1;border-radius:10px;padding:12px;font-size:16px;background:#fff;font-family:inherit}" +
  "textarea{min-height:84px;resize:vertical}" +
  ".chips{display:flex;flex-wrap:wrap;gap:8px}.chip{border:1.5px solid #cbd5e1;background:#fff;border-radius:999px;padding:9px 13px;font-size:14px;font-weight:600;cursor:pointer}" +
  ".chip.on{background:var(--m);color:#fff;border-color:var(--m)}" +
  ".prichip{flex:1 1 45%;border-radius:12px;text-align:left;padding:10px 12px}.prichip b{display:block;font-size:15px}.prichip span{font-size:12px;opacity:.85}" +
  ".card{background:#fff;border-radius:12px;padding:14px;margin-bottom:14px;box-shadow:0 1px 4px rgba(0,0,0,.07)}" +
  ".empty{text-align:center;color:var(--muted);padding:26px 10px;font-size:14.5px}" +
  ".note{background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:12px;font-size:14px;margin-bottom:12px}" +
  ".toast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%) translateY(30px);background:#111827;color:#fff;padding:12px 18px;border-radius:12px;font-weight:600;font-size:14.5px;opacity:0;transition:.25s;z-index:100;max-width:90%;text-align:center}" +
  ".toast.show{opacity:1;transform:translateX(-50%) translateY(0)}.toast.bad{background:#b91c1c}" +
  "#sheet{display:none}#sheet.open{display:block}.sbg{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:50}" +
  ".sbox{position:fixed;left:0;right:0;bottom:0;max-height:92vh;overflow:auto;background:#fff;border-radius:18px 18px 0 0;z-index:51;padding:18px 16px calc(28px + env(safe-area-inset-bottom));max-width:720px;margin:0 auto}" +
  ".sx{position:absolute;right:12px;top:10px;border:none;background:#f1f5f9;border-radius:50%;width:36px;height:36px;font-size:16px;cursor:pointer}" +
  ".dh{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding-right:40px}.dtitle{font-size:19px;font-weight:800;margin-top:2px}" +
  ".dgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin:14px 0;font-size:14px}.dgrid span{display:block;font-size:11.5px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.4px}" +
  ".ddesc{background:#f8fafc;border-radius:10px;padding:12px;font-size:14.5px;white-space:pre-wrap}" +
  ".photos{display:flex;gap:10px;overflow-x:auto;margin:12px 0}.photos a{flex:0 0 auto;text-decoration:none;color:var(--muted);font-size:12px;text-align:center}" +
  ".photos img{width:120px;height:120px;object-fit:cover;border-radius:10px;display:block;margin-bottom:3px;border:1px solid var(--line)}" +
  ".tlh{font-weight:800;margin:16px 0 8px}.timeline{border-left:3px solid var(--line);padding-left:12px}" +
  ".ev{margin-bottom:12px}.evw{font-size:12.5px;color:var(--muted)}.eva{font-weight:700;font-size:14.5px}.evn{font-size:14px;color:#334155;white-space:pre-wrap}" +
  ".ev-outlet .eva{color:var(--brand)}.ev-technician .eva{color:#6d28d9}.ev-head .eva{color:#1d4ed8}.ev-system .eva{color:#15803d}" +
  ".tabbar{position:fixed;left:0;right:0;bottom:0;z-index:20;display:flex;background:#fff;border-top:1px solid var(--line);box-shadow:0 -2px 10px rgba(0,0,0,.06);padding-bottom:env(safe-area-inset-bottom)}" +
  ".tabbar a{flex:1;text-align:center;padding:14px 6px;font-weight:800;font-size:15px;text-decoration:none;color:#64748b}" +
  ".tabbar a.on{color:var(--m);box-shadow:inset 0 3px 0 var(--m)}" +
  ".tabs{display:flex;gap:6px;overflow-x:auto;margin:4px 0 6px;padding-bottom:4px}" +
  ".tab{flex:0 0 auto;border:1.5px solid var(--line);background:#fff;border-radius:999px;padding:9px 14px;font-weight:700;font-size:14px;cursor:pointer;color:#334155}" +
  ".tab.on{background:var(--m);color:#fff;border-color:var(--m)}.tab .n{display:inline-block;min-width:20px;padding:0 6px;margin-left:6px;border-radius:999px;background:#ef4444;color:#fff;font-size:12px}" +
  "@media(max-width:420px){.dgrid{grid-template-columns:1fr}}";
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
})();
