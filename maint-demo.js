/* =====================================================================
   SVR Maintenance — DEMO MODE (for showing managers how it works)
   Active ONLY when the page address has ?demo=...  e.g.
     maint.html?demo=1        outlet manager view
     team.html?demo=head      maintenance head view
     team.html?demo=tech      technician view
   In demo mode NOTHING is sent anywhere. Sample data lives only on
   this phone (localStorage key "maintDemoDB") and never touches the
   Daily Tracker or the real maintenance server.
   ===================================================================== */
(function () {
  var q = (location.search.match(/[?&]demo=([a-z0-9]+)/i) || [])[1];
  if (!q) return;                                     // normal mode: do nothing

  var KEY = 'maintDemoDB';
  function rd(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  var OUTLET = rd('outlet') || 'Ramapuram';           // read-only: the phone's own outlet if activated
  var PERSON = rd('person') || 'Outlet Manager';
  var TECHS = [{ id: 1, name: 'Ravi (Technician)', mobile: '9800000001', code: 'TECH-DEMO1', active: 1 },
               { id: 2, name: 'Kumar (Technician)', mobile: '9800000002', code: 'TECH-DEMO2', active: 1 }];
  var HEAD = 'Senthil (Maintenance Head)';

  window.MDEMO = {
    out: { code: 'DEMO', outlet: OUTLET, person: PERSON, mobile: '' },
    code: q === 'head' ? 'DEMO-HEAD' : (q === 'tech' ? 'DEMO-TECH' : '')
  };

  // ------------------------------------------------------------- time
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmt(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function parse(s) { var m = String(s || '').match(/(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d)/); return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) : null; }
  function ago(h) { return fmt(new Date(Date.now() - h * 3600000)); }
  function plus(s, h) { return fmt(new Date(parse(s).getTime() + h * 3600000)); }

  var META = {
    ok: true,
    categories: ['Electrical', 'HVAC / Air Conditioning', 'Plumbing & Drainage', 'Kitchen / Heavy Machinery',
                 'Refrigeration & Cold Storage', 'POS & IT Hardware', 'Civil & Building Work'],
    priorities: [['Emergency', 2, 'Production stopped or safety risk'], ['High', 6, 'Urgent — affects operations'],
                 ['Medium', 24, 'Standard maintenance issue'], ['Low', 72, 'Minor, not blocking work']],
    delay_reasons: ['Spare Parts Unavailable', 'External Vendor Dependency', 'Manpower / Resource Constraint',
                    'Site Access / Electrical Shutdown Restricted', 'Technical Complexity / Diagnostics Pending',
                    'Equipment Replacement Required', 'Other']
  };
  function hrs(p) { for (var i = 0; i < META.priorities.length; i++) if (META.priorities[i][0] === p) return META.priorities[i][1]; return 24; }

  // ------------------------------------------------------------- sample data
  function ev(at, actor, role, action, note) { return { at: at, actor: actor, role: role, action: action, note: note || '' }; }
  function T(o) {
    var t = { id: o.id, seq: o.seq, outlet: o.outlet, title: o.title, description: o.description || '', category: o.category,
      priority: o.priority, location: o.location || '', status: o.status, sla_hours: hrs(o.priority),
      raised_by: o.raised_by || PERSON, raised_at: o.raised_at, due_at: plus(o.raised_at, hrs(o.priority)),
      assigned_to: o.assigned_to || null, delay_reason: o.delay_reason || null, expected_at: o.expected_at || null,
      tech_done_at: o.tech_done_at || null, tech_done_note: o.tech_done_note || null, parts_replaced: o.parts || '',
      mgr_confirmed_at: o.mgr_confirmed_at || null, completed_at: o.completed_at || null, reopen_count: 0,
      events: o.events || [], photos: [] };
    return t;
  }
  function seed() {
    var r1 = ago(50), r2 = ago(30), r3 = ago(9), r4 = ago(3), r5 = ago(1);
    return { next: 6, techs: TECHS.slice(), tickets: [
      T({ id: 'MT-0001', seq: 1, outlet: OUTLET, title: 'Dining hall tube light not working', category: 'Electrical', priority: 'Low',
          location: 'Dining hall, near cash counter', status: 'Completed', raised_at: r1, assigned_to: 2,
          tech_done_at: ago(40), tech_done_note: 'Replaced choke and tube light', parts: 'Tube light 1, choke 1',
          mgr_confirmed_at: ago(38), completed_at: ago(38),
          events: [ev(r1, PERSON, 'outlet', 'Raised'), ev(ago(49), HEAD, 'head', 'Assigned', 'To Kumar (Technician)'),
                   ev(ago(48), 'Kumar (Technician)', 'technician', 'Accepted job'), ev(ago(42), 'Kumar (Technician)', 'technician', 'Started work'),
                   ev(ago(40), 'Kumar (Technician)', 'technician', 'Technician marked work done', 'Replaced choke and tube light  | Parts: Tube light 1, choke 1'),
                   ev(ago(38), PERSON, 'outlet', 'Manager confirmed work done', 'Working fine'),
                   ev(ago(38), 'System', 'system', 'Completed', 'Technician and outlet manager both confirmed')] }),
      T({ id: 'MT-0002', seq: 2, outlet: OUTLET, title: 'Dosa tawa burner flame is low', category: 'Kitchen / Heavy Machinery', priority: 'Medium',
          location: 'Main kitchen, dosa counter', description: 'Left burner flame very low since morning, dosa getting delayed.',
          status: 'Delayed', raised_at: r2, assigned_to: 1, delay_reason: 'Spare Parts Unavailable', expected_at: fmt(new Date(Date.now() + 86400000)).slice(0, 10),
          events: [ev(r2, PERSON, 'outlet', 'Raised', 'Left burner flame very low since morning, dosa getting delayed.'),
                   ev(ago(29), HEAD, 'head', 'Assigned', 'To Ravi (Technician)'), ev(ago(28), 'Ravi (Technician)', 'technician', 'Accepted job'),
                   ev(ago(26), 'Ravi (Technician)', 'technician', 'Started work'),
                   ev(ago(25), 'Ravi (Technician)', 'technician', 'Delay reported: Spare Parts Unavailable', 'Burner nozzle needs replacement, ordered from vendor')] }),
      T({ id: 'MT-0003', seq: 3, outlet: OUTLET, title: 'Walk-in cooler not cooling properly', category: 'Refrigeration & Cold Storage', priority: 'High',
          location: 'Store room', status: 'Pending Manager Confirmation', raised_at: r3, assigned_to: 1,
          tech_done_at: ago(1), tech_done_note: 'Gas refilled and thermostat replaced. Temperature now 3°C.', parts: 'Thermostat 1',
          events: [ev(r3, PERSON, 'outlet', 'Raised', 'Temperature showing 12°C'), ev(ago(8.5), HEAD, 'head', 'Assigned', 'To Ravi (Technician)'),
                   ev(ago(8), 'Ravi (Technician)', 'technician', 'Accepted job'), ev(ago(6), 'Ravi (Technician)', 'technician', 'Started work'),
                   ev(ago(1), 'Ravi (Technician)', 'technician', 'Technician marked work done', 'Gas refilled and thermostat replaced. Temperature now 3°C.  | Parts: Thermostat 1')] }),
      T({ id: 'MT-0004', seq: 4, outlet: 'Mylapore', title: 'Exhaust fan making loud noise', category: 'HVAC / Air Conditioning', priority: 'Medium',
          location: 'Kitchen exhaust', status: 'Assigned', raised_by: 'Mylapore Manager', raised_at: r4, assigned_to: 1,
          events: [ev(r4, 'Mylapore Manager', 'outlet', 'Raised'), ev(ago(2), HEAD, 'head', 'Assigned', 'To Ravi (Technician)')] }),
      T({ id: 'MT-0005', seq: 5, outlet: 'Guindy', title: 'AC water leaking in dining hall', category: 'HVAC / Air Conditioning', priority: 'High',
          location: 'Family dining, AC 2', status: 'Pending Assignment', raised_by: 'Guindy Manager', raised_at: r5,
          events: [ev(r5, 'Guindy Manager', 'outlet', 'Raised', 'Water dripping on table 6')] })
    ] };
  }
  function load() { try { var d = JSON.parse(rd(KEY)); if (d && d.tickets) return d; } catch (e) {} return seed(); }
  function save(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); }
    catch (e) { d.tickets.forEach(function (t) { t.photos = []; }); try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e2) {} }
  }
  window.MDEMO.reset = function () { try { localStorage.removeItem(KEY); } catch (e) {} };

  // ------------------------------------------------------------- helpers
  function techName(d, id) { for (var i = 0; i < d.techs.length; i++) if (d.techs[i].id === id) return d.techs[i].name; return null; }
  function deco(d, t, full) {
    var x = JSON.parse(JSON.stringify(t));
    x.technician = t.assigned_to ? techName(d, t.assigned_to) : null;
    var due = parse(t.due_at), done = parse(t.tech_done_at), ref = done || new Date();
    x.overdue = !!(due && ref > due && t.status !== 'Completed' && !done);
    x.sla_met = done ? !!(due && done <= due) : null;
    if (!full) { x.photo_count = t.photos.length; delete x.events; delete x.photos; }
    return x;
  }
  function find(d, id) { for (var i = 0; i < d.tickets.length; i++) if (d.tickets[i].id === id) return d.tickets[i]; return null; }
  function bodyOf(b) {
    if (!b) return Promise.resolve({});
    if (!(b instanceof FormData)) return Promise.resolve(b);
    var o = {}, photo = null;
    b.forEach(function (v, k) { if (k === 'photo') photo = v; else o[k] = v; });
    if (!photo) return Promise.resolve(o);
    return new Promise(function (res) {
      var fr = new FileReader();
      fr.onload = function () { o._photo = fr.result; res(o); };
      fr.onerror = function () { res(o); };
      fr.readAsDataURL(photo);
    });
  }
  function OK(x) { x = x || {}; x.ok = true; return x; }
  function ERR(m) { return { ok: false, error: m }; }
  function addEv(t, actor, role, action, note) { t.events.push(ev(fmt(new Date()), actor, role, action, note)); }
  function checkComplete(t) {
    if (t.tech_done_at && t.mgr_confirmed_at && t.status !== 'Completed') {
      t.status = 'Completed'; t.completed_at = fmt(new Date());
      addEv(t, 'System', 'system', 'Completed', 'Technician and outlet manager both confirmed');
    }
  }
  var ACTIVE = ['Pending Assignment', 'Assigned', 'Accepted', 'In Progress', 'Delayed', 'Pending Manager Confirmation'];
  var ME = q === 'head' ? { id: 0, name: HEAD, role: 'head' } : { id: 1, name: 'Ravi (Technician)', role: 'technician' };

  // ------------------------------------------------------------- fake server
  function route(method, path, b) {
    var d = load(), m, t, now = fmt(new Date());
    path = path.split('?')[0];
    if (path === '/api/m/meta') return META;
    if (path === '/api/m/outlet/login') return OK({ enabled: true, outlet: OUTLET });
    if (path === '/api/m/staff/login') return OK({ name: ME.name, role: ME.role, id: ME.id });

    if (path === '/api/m/outlet/tickets' && method === 'GET')
      return OK({ tickets: d.tickets.filter(function (x) { return x.outlet === OUTLET; }).sort(function (a, c) { return c.seq - a.seq; }).map(function (x) { return deco(d, x); }) });
    if (path === '/api/m/outlet/tickets' && method === 'POST') {
      if (!b.title || !b.category || !b.priority) return ERR('Title, category and priority are required.');
      var id = 'MT-' + ('000' + d.next).slice(-4);
      t = T({ id: id, seq: d.next, outlet: OUTLET, title: b.title, description: b.description, category: b.category,
              priority: b.priority, location: b.location, status: 'Pending Assignment', raised_at: now });
      d.next++;
      addEv(t, PERSON, 'outlet', 'Raised', (b.description || '').slice(0, 300));
      if (b._photo) t.photos.push({ url: b._photo, kind: 'problem', at: now, by: PERSON });
      d.tickets.push(t); save(d); return OK({ id: id });
    }
    if ((m = path.match(/^\/api\/m\/outlet\/tickets\/([^/]+)(?:\/(\w+))?$/))) {
      t = find(d, decodeURIComponent(m[1]));
      if (!t || t.outlet !== OUTLET) return ERR('not found');
      if (!m[2]) return OK({ ticket: deco(d, t, true) });
      if (m[2] === 'confirm') {
        if (t.status !== 'Pending Manager Confirmation') return ERR('The technician has not marked this job done yet.');
        t.mgr_confirmed_at = now; addEv(t, PERSON, 'outlet', 'Manager confirmed work done', b.feedback || ''); checkComplete(t);
      } else if (m[2] === 'reopen') {
        if (!b.note) return ERR('Please write what is still not working.');
        t.status = 'In Progress'; t.tech_done_at = null; t.tech_done_note = null; t.reopen_count++;
        addEv(t, PERSON, 'outlet', 'Sent back — not fixed', b.note);
      } else if (m[2] === 'comment') {
        if (!b.note) return ERR('Empty comment.');
        addEv(t, PERSON, 'outlet', 'Comment', b.note);
      }
      save(d); return OK();
    }

    if (path === '/api/m/staff/tickets') {
      var list = d.tickets.filter(function (x) { return ME.role === 'head' || x.assigned_to === ME.id; })
        .sort(function (a, c) { return c.seq - a.seq; }).map(function (x) { return deco(d, x); });
      var techs = ME.role === 'head' ? d.techs.map(function (x) {
        var y = JSON.parse(JSON.stringify(x));
        y.open_jobs = d.tickets.filter(function (k) { return k.assigned_to === x.id && ACTIVE.indexOf(k.status) >= 0; }).length;
        return y; }) : [];
      return OK({ me: ME.name, role: ME.role, tickets: list, technicians: techs });
    }
    if (path === '/api/m/staff/team') {
      if (!b.name) return ERR('Name is required.');
      var code = 'TECH-DEMO' + (d.techs.length + 1);
      d.techs.push({ id: d.techs.length + 1, name: b.name, mobile: b.mobile || '', code: code, active: 1 });
      save(d); return OK({ code: code, name: b.name });
    }
    if ((m = path.match(/^\/api\/m\/staff\/team\/(\d+)\/active$/))) {
      d.techs.forEach(function (x) { if (x.id === +m[1]) x.active = (String(b.active) === '1' || b.active === true) ? 1 : 0; });
      save(d); return OK();
    }
    if ((m = path.match(/^\/api\/m\/staff\/tickets\/([^/]+)(?:\/(\w+))?$/))) {
      t = find(d, decodeURIComponent(m[1]));
      if (!t || (ME.role !== 'head' && t.assigned_to !== ME.id)) return ERR('not found');
      var a = m[2], who = ME.name, role = ME.role;
      if (!a) return OK({ ticket: deco(d, t, true) });
      function need(from) { return from.indexOf(t.status) >= 0 && (role === 'technician'); }
      if (a === 'assign') {
        if (t.status === 'Completed' || t.status === 'Pending Manager Confirmation') return ERR('This job can no longer be re-assigned.');
        var nm = techName(d, +b.tech_id); if (!nm) return ERR('Choose an active technician.');
        var first = !t.assigned_to;
        t.assigned_to = +b.tech_id; t.status = 'Assigned';
        addEv(t, who, role, first ? 'Assigned' : 'Re-assigned', 'To ' + nm);
        if (+b.tech_id !== 1) { /* demo: other technicians "accept" by themselves */ }
      } else if (a === 'accept') {
        if (!need(['Assigned'])) return ERR('Not possible now.');
        t.status = 'Accepted'; addEv(t, who, role, 'Accepted job');
      } else if (a === 'start') {
        if (!need(['Accepted', 'Delayed'])) return ERR('Not possible now.');
        t.status = 'In Progress'; addEv(t, who, role, 'Started work');
      } else if (a === 'delay') {
        if (!need(['Accepted', 'In Progress', 'Delayed'])) return ERR('Not possible now.');
        if (!b.reason || !b.note) return ERR('Choose a delay reason and write a short comment.');
        t.status = 'Delayed'; t.delay_reason = b.reason; t.expected_at = b.expected || null;
        addEv(t, who, role, 'Delay reported: ' + b.reason, b.note + (b.expected ? '  (expected by ' + b.expected + ')' : ''));
      } else if (a === 'done') {
        if (!need(['In Progress', 'Delayed'])) return ERR('Not possible now.');
        if (!b.note) return ERR('Write what was done.');
        t.status = 'Pending Manager Confirmation'; t.tech_done_at = now; t.tech_done_note = b.note; t.parts_replaced = b.parts || '';
        addEv(t, who, role, 'Technician marked work done', b.note + (b.parts ? '  | Parts: ' + b.parts : ''));
        if (b._photo) t.photos.push({ url: b._photo, kind: 'after', at: now, by: who });
      } else if (a === 'comment') {
        if (!b.note) return ERR('Empty comment.');
        addEv(t, who, role, 'Comment', b.note);
      }
      save(d); return OK();
    }
    return ERR('demo: not available');
  }

  // replace the real network call — runs after maint-common.js
  M.call = function (method, path, headers, body) {
    return bodyOf(body).then(function (b) {
      return new Promise(function (res) { setTimeout(function () { res(route(method, path, b)); }, 250); });
    });
  };

  // yellow DEMO strip + links back to the demo menu instead of the tracker
  document.addEventListener('DOMContentLoaded', function () {
    var s = document.createElement('div');
    s.style.cssText = 'background:#fde047;color:#422006;font-weight:800;font-size:13.5px;text-align:center;padding:7px 10px;position:sticky;top:0;z-index:30';
    s.innerHTML = 'DEMO · sample data only · <a href="./demo.html" style="color:#422006">◀ Menu</a>';
    document.body.insertBefore(s, document.body.firstChild);
    var hd = document.querySelector('header'); if (hd) hd.style.top = '33px';
    Array.prototype.forEach.call(document.querySelectorAll('a[href="./index.html"]'), function (a) { a.href = './demo.html'; });
  });
})();
