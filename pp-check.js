/* =====================================================================
   SVR — Petpooja GRN & Transfer check  (runs as a Chrome bookmark)
   Open any inventory.petpooja.com page (logged in), click the bookmark.
   It reads the Purchase List and Transfer list of every outlet for
   YESTERDAY, then opens the Tracker admin with the results to apply.
   Read-only on Petpooja: it only searches lists, never edits anything.
   Rules:  GRN done      = at least 1 vendor bill dated yesterday or later
           Transfer done = at least 3 transfers dated yesterday
   ===================================================================== */
(function () {
  var OUTLETS = __OUTLETS__;            // [{id:'112218', name:'Guindy'}, …]  filled by pp-setup.html
  var MIN_TRANSFERS = __MINTRF__;
  var TRACKER = 'https://gbk7211.github.io/svr-daily-tracker/dashboard.html';
  if (location.hostname.indexOf('petpooja.com') < 0) { alert('Open Petpooja (inventory.petpooja.com) first, then click this bookmark.'); return; }

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); return x; }
  function pp(d) { return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear(); }          // "16 Nov 2026"
  function iso(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function dmy(d) { return ('0' + d.getDate()).slice(-2) + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }
  var TODAY = new Date(); TODAY = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());
  var Y = addDays(TODAY, -1);

  function post(path, fields) {
    var body = Object.keys(fields).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(fields[k]); }).join('&');
    return fetch('https://inventory.petpooja.com/inventories/' + path + '/', {
      method: 'POST', credentials: 'include', body: body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }
    }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
  }
  // switch the selected outlet exactly like Petpooja's top dropdown does
  function switchTo(id) {
    return fetch('https://inventory.petpooja.com/', {
      method: 'POST', credentials: 'include', redirect: 'manual',      // Petpooja answers with a redirect; no need to follow it
      body: 'header_changed_rest_id=' + encodeURIComponent(id),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }
    }).then(function (r) { if (r.status >= 400) throw new Error('outlet switch HTTP ' + r.status); });
  }
  var START_ID = ((document.body.textContent || '').match(/RestId\s*-\s*(\d+)/) || [])[1] || '';
  // read dates of all rows + "of N records"
  var RX = /\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{4})\b/;
  function parseList(html) {
    if (/login/i.test(html) && !/<table/i.test(html)) throw new Error('Not logged in to Petpooja');
    var doc = new DOMParser().parseFromString(html, 'text/html'), dates = [];
    Array.prototype.forEach.call(doc.querySelectorAll('tr'), function (tr) {
      if (tr.querySelector('th')) return;
      var cells = tr.querySelectorAll('td');                 // look cell by cell for the first date
      for (var k = 0; k < cells.length; k++) {
        var m = (cells[k].textContent || '').trim().match(RX);
        if (m) { dates.push(new Date(+m[3], MON.indexOf(m[2].substring(0, 3)), +m[1])); break; }
      }
    });
    var t = (doc.body.textContent || '').match(/of\s+(\d+)\s+records?/i);
    return { dates: dates, total: t ? +t[1] : dates.length };
  }
  function purchases(id, from, to) {
    return post('purchaselist', {
      'data[Purchase][invoice_start_date]': pp(from), 'data[Purchase][invoice_end_date]': pp(to),
      'data[Purchase][receiver_type]': '', 'data[Purchase][receiver_id_s]': '', 'data[Purchase][receiver_id_r]': '',
      'data[Purchase][receiver_id_c]': '', 'data[Purchase][invoice_no]': '', 'data[Purchase][payment_flag]': '',
      'data[Purchase][record_status]': '', 'data[Purchase][type]': '', 'data[Purchase][receiver_id]': '',
      'data[restaurant_id]': id, 'data[current_page_url]': ''
    }).then(parseList);
  }
  function transfers(id, from, to) {
    return post('saleslist', {
      'data[Sale][invoice_start_date]': pp(from), 'data[Sale][invoice_end_date]': pp(to),
      'data[Sale][sender_type]': '', 'data[Sale][sender_id_s]': '', 'data[Sale][sender_id_r]': '', 'data[Sale][sender_id_c]': '',
      'data[Sale][invoice_number]': '', 'data[Sale][payment_flag]': '', 'data[Sale][record_status]': '', 'data[Sale][type]': '',
      'data[Sale][rest_sap_group_master_id]': '', 'data[Sale][sender_id]': '', 'data[Sale][is_rm_transfer_screen]': '1',
      'data[restaurant_id]': id, 'data[current_page_url]': ''
    }).then(parseList);
  }

  // ---- progress box
  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:20px;z-index:2147483647;background:#fff;border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.35);' +
    'font:14px Segoe UI,Arial,sans-serif;color:#222;overflow:auto;padding:18px 20px';
  document.body.appendChild(box);
  function show(h) { box.innerHTML = '<div style="font-size:18px;font-weight:800;margin-bottom:6px">SVR — GRN &amp; Transfer check for ' + dmy(Y) +
    '<span id="svrppx" style="float:right;cursor:pointer">✕</span></div>' + h;
    document.getElementById('svrppx').addEventListener('click', function () { box.remove(); }); }

  var results = {}, rowsHtml = '', i = 0;
  function rowOf(o, r) {
    var c = function (ok, t) { return '<td style="padding:6px 8px;border-bottom:1px solid #eee;color:' + (ok ? '#15803d' : '#b91c1c') + '">' + (ok ? '✔ ' : '✘ ') + t + '</td>'; };
    return '<tr><td style="padding:6px 8px;border-bottom:1px solid #eee"><b>' + o.name + '</b></td>' +
      (r.error ? '<td colspan="2" style="color:#b45309;padding:6px 8px">Could not check: ' + r.error + '</td>' :
        c(r.grn, r.grnText) + c(r.transfer, r.trfText)) + '</tr>';
  }
  function table(extra) {
    return '<table style="border-collapse:collapse;width:100%;margin-top:10px"><tr style="background:#f3f4f6"><th style="text-align:left;padding:6px 8px">Outlet</th>' +
      '<th style="text-align:left;padding:6px 8px">Vendor Bill GRN</th><th style="text-align:left;padding:6px 8px">Cost Center Transfer (min ' + MIN_TRANSFERS + ')</th></tr>' +
      rowsHtml + '</table>' + (extra || '');
  }

  function checkOutlet(o) {
    var r = {};
    // select the outlet first, then GRN: latest vendor bill in the last 31 days
    return switchTo(o.id).then(function () { return purchases(o.id, addDays(Y, -30), TODAY); }).then(function (p) {
      var last = p.dates.length ? p.dates.reduce(function (a, b) { return a > b ? a : b; }) : null;
      r.grn = !!(last && last >= Y);
      r.grnLast = last ? iso(last) : '';
      if (r.grn) r.grnText = 'latest bill ' + dmy(last);
      else if (last) { var n = Math.round((Y - last) / 864e5); r.grnText = 'No GRN since ' + dmy(last) + ' (' + n + ' day' + (n > 1 ? 's' : '') + ')'; }
      else r.grnText = 'No GRN in the last 30 days';
      return transfers(o.id, Y, Y);
    }).then(function (t) {
      r.trfCount = t.total;
      r.transfer = t.total >= MIN_TRANSFERS;
      if (r.transfer) { r.trfText = t.total + ' transfers'; return r; }
      // how many days in a row below the minimum? look back up to 14 days
      var back = 1, sum = t.total;
      function words(days, plus) {
        var tr = function (n) { return n + ' transfer' + (n === 1 ? '' : 's'); };
        if (days === 1) return sum ? 'Only ' + tr(sum) + ' done on ' + dmy(Y) : 'No transfer on ' + dmy(Y);
        var span = (plus ? days + '+' : days) + ' days';
        return sum ? 'Only ' + tr(sum) + ' done in last ' + span : 'No transfer for last ' + span;
      }
      function step() {
        if (back > 14) { r.trfText = words(15, true); return r; }
        var d = addDays(Y, -back);
        return transfers(o.id, d, d).then(function (x) {
          if (x.total >= MIN_TRANSFERS) { r.trfText = words(back, false); return r; }
          sum += x.total; back++; return step();
        });
      }
      return step();
    });
  }

  function next() {
    if (i >= OUTLETS.length) {
      show(table('<p style="margin-top:12px">Switching back to your outlet…</p>'));
      return (START_ID ? switchTo(START_ID) : Promise.resolve()).catch(function () {}).then(done);
    }
    var o = OUTLETS[i++];
    show(table('<p style="margin-top:12px">Checking <b>' + o.name + '</b> (' + i + ' of ' + OUTLETS.length + ')…</p>'));
    checkOutlet(o).catch(function (e) { return { error: e.message || String(e) }; }).then(function (r) {
      results[o.name] = r; rowsHtml += rowOf(o, r); next();
    });
  }
  function done() {
    var payload = { date: iso(TODAY), checked: iso(Y), min: MIN_TRANSFERS, results: results };
    var url = TRACKER + '#ppauto=' + encodeURIComponent(JSON.stringify(payload));
    show(table('<p style="margin-top:14px">Done. (Reload the Petpooja page before you keep working there.) These go into Tracker admin for <b>' + iso(TODAY) + '</b> (the report day). Outlets that could not be checked are left as they are.</p>' +
      '<a href="' + url + '" target="_blank" style="display:inline-block;margin-top:6px;background:#7c2d12;color:#fff;padding:12px 18px;border-radius:10px;font-weight:800;text-decoration:none">✅ Send to Tracker admin</a>'));
  }
  next();
})();
