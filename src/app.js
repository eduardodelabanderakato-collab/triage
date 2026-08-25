/* app.js — rendering and events. All scheduling decisions live in engine.js. */
(function () {
  'use strict';
  var STORE = 'triage-state-v1';
  var DW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var ORDER = ['new', 'learning', 'shaky', 'solid'];
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  function todayISO() {
    var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function normalize(s) { // upgrades for states saved by older versions
    if (s.settings.satTarget === 1550) s.settings.satTarget = 1600;
    if (!s.settings.satDeadline) s.settings.satDeadline = '2026-12-18';
    Seed.SUBJECTS.forEach(function (def) { // subject tunables follow the code, data stays
      var mine = s.subjects.find(function (x) { return x.id === def.id; });
      if (mine) {
        mine.weeklyMinutes = def.weeklyMinutes; mine.quota = def.quota;
        mine.priority = def.priority; mine.tier = def.tier;
      }
    });
    return s;
  }
  function load() {
    var s;
    try { s = JSON.parse($('#app-state').textContent); if (s && s.version) return normalize(s); } catch (e) {}
    try { s = JSON.parse(localStorage.getItem(STORE)); if (s && s.version) return normalize(s); } catch (e) {}
    return Seed.seedState();
  }
  var state = load();
  var cur = { tab: 'today', offset: 0 };
  function save() {
    var json = JSON.stringify(state).replace(/</g, '\\u003c'); // keep the JSON inert inside its <script> tag
    try { localStorage.setItem(STORE, json); } catch (e) {}
    $('#app-state').textContent = json;
  }
  var subjName = function (id) {
    var s = state.subjects.find(function (x) { return x.id === id; });
    return s ? s.name : id;
  };
  var opts = function (sel) {
    return state.subjects.map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === sel ? ' selected' : '') + '>' + esc(s.name) + '</option>';
    }).join('');
  };

  function renderToday() {
    var date = Engine.addDays(todayISO(), cur.offset);
    var sd = Engine.schoolDay(date);
    var label = (cur.offset === 0 ? '<span class="today-mark">Today</span> · ' : '') +
      DW[Engine.dow(date)] + ' ' + (+date.slice(8)) + ' ' + MN[+date.slice(5, 7) - 1] +
      (sd ? ' <span class="daytag">Day ' + sd + '</span>' : '');
    var doneKeys = {};
    state.log.forEach(function (e) { doneKeys[e.key] = true; });
    var dayBlocks = Engine.buildDay(state, date);
    var nowM = new Date().getHours() * 60 + new Date().getMinutes();
    var blocks = dayBlocks.map(function (b) {
      var done = doneKeys[b.key];
      var start = +b.time.slice(0, 2) * 60 + +b.time.slice(3);
      var isNow = cur.offset === 0 && nowM >= start && nowM < start + b.minutes;
      return '<div class="block kind-' + b.kind + (done ? ' done' : '') + (isNow ? ' now' : '') +
        '" data-key="' + b.key + '" data-minutes="' + b.minutes + '"' +
        (b.subjectId ? ' data-subject="' + b.subjectId + '"' : '') +
        '><div class="b-time">' + b.time + ' · ' + b.minutes +
        ' min</div><div class="b-title">' + esc(b.title) + '</div>' +
        (b.instruction ? '<div class="b-instr">' + esc(b.instruction) + '</div>' : '') +
        (b.reason ? '<div class="b-reason">' + esc(b.reason) + '</div>' : '') +
        (b.kind === 'soccer' ? '' : '<label class="tickwrap"><input type="checkbox" class="tick" data-key="' +
          b.key + '"' + (done ? ' checked' : '') +
          ' aria-label="Done: ' + esc(b.title) + ' at ' + b.time + '"></label>') + '</div>';
    }).join('');
    var tickable = dayBlocks.filter(function (b) { return b.kind !== 'soccer'; });
    var doneB = tickable.filter(function (b) { return doneKeys[b.key]; });
    var mins = function (l) { return l.reduce(function (a, b) { return a + b.minutes; }, 0); };
    var daysum = '<div class="daysum">' + doneB.length + '/' + tickable.length + ' done · ' +
      mins(doneB) + '/' + mins(tickable) + ' min</div>';
    var tt = 0, td = 0;
    var bars = state.subjects.filter(function (s) { return !(s.id === 'sat' && state.settings.satDone); })
      .map(function (s) {
        var w = Engine.subjectWeight(state, s, date);
        tt += w.target; td += w.done;
        var pct = Math.min(100, Math.round(100 * w.done / w.target));
        return '<div class="bar-row" data-subject="' + s.id + '"><div class="bar-top"><span>' + esc(s.name) +
          '</span><span' + (w.remedial > 0 ? ' class="warn"' : '') + '>' + w.done + ' / ' +
          Math.round(w.target) + ' min' + (w.remedial > 0 ? ' (+' + Math.round(w.remedial) + ')' : '') +
          '</span></div><div class="bar"><div class="bar-fill" style="width:' + pct + '%"></div></div></div>';
      }).join('');
    var weektotal = '<div class="weektotal"><b>' + td + '</b> / ' + Math.round(tt) +
      ' min this week · ' + (tt ? Math.min(100, Math.round(100 * td / tt)) : 0) + '%</div>';
    var dl = Engine.daysBetween(todayISO(), state.settings.satDeadline);
    var goal = state.settings.satDone
      ? '<div class="goalbar">SAT <b>done</b> — every hour goes to the <b>45</b></div>'
      : '<div class="goalbar">SAT <b>' + state.settings.satTarget + '</b> by semester end' +
        (dl >= 0 ? ' · <b>' + dl + '</b> days left' : '') + '</div>';
    return '<div class="day-nav"><button id="prev-day" aria-label="previous day">‹</button>' +
      '<div id="day-label" data-date="' + date + '">' + label + '</div>' +
      '<button id="next-day" aria-label="next day">›</button></div>' + goal + daysum +
      '<div id="blocks">' + blocks +
      '</div><h2>This week</h2><div id="bars" class="card">' + weektotal + bars + '</div>';
  }

  var chipsFor = function (subjectId) {
    return state.topics.filter(function (t) { return t.subjectId === subjectId; })
      .map(function (t) { return '<button type="button" class="chip" data-topic="' + t.id + '">' + esc(t.name) + '</button>'; })
      .join('');
  };
  function renderLog() {
    var today = todayISO();
    var grades = state.grades.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; })
      .map(function (g) {
        return '<div class="item grade-item"><span class="grow"><b>' + esc(subjName(g.subjectId)) + '</b> ' +
          g.score + '/7 · ' + g.date + (g.note ? ' <span class="note">' + esc(g.note) + '</span>' : '') +
          '</span><button class="del" data-del-grade="' + g.id + '">×</button></div>';
      }).join('') || '<div class="empty">No grades logged yet.</div>';
    var tests = state.tests.slice().sort(function (a, b) { return a.date > b.date ? 1 : -1; })
      .map(function (t) {
        var dt = Engine.daysBetween(today, t.date);
        return '<div class="item test-item"><span class="grow"><b>' + esc(subjName(t.subjectId)) + '</b> ' +
          t.date + (dt >= 0 ? ' <span class="chip-dt' + (dt <= 5 ? ' warn' : '') + '">in ' + dt + 'd</span>' : '') +
          ' · ' + (t.topicIds || []).length + ' topics' +
          (t.note ? ' <span class="note">' + esc(t.note) + '</span>' : '') +
          '</span><button class="del" data-del-test="' + t.id + '">×</button></div>';
      }).join('') || '<div class="empty">No tests coming up.</div>';
    return '<h2>Log a grade</h2><form id="grade-form" class="card">' +
      '<select name="subject" required>' + opts('') + '</select>' +
      '<select name="score" required>' + [7, 6, 5, 4, 3, 2, 1].map(function (n) {
        return '<option value="' + n + '">' + n + ' / 7</option>'; }).join('') + '</select>' +
      '<input name="date" type="date" value="' + today + '" required>' +
      '<input name="note" placeholder="What was it? (optional)">' +
      '<button class="primary" type="submit">Add grade</button></form>' +
      '<div id="grade-list" class="card">' + grades + '</div>' +
      '<h2>Upcoming tests</h2><form id="test-form" class="card">' +
      '<select name="subject" required>' + opts('') + '</select>' +
      '<input name="date" type="date" value="' + today + '" required>' +
      '<input name="note" class="wide" placeholder="Paper / scope (optional)">' +
      '<div class="wide" id="test-topics">' + chipsFor(state.subjects[0].id) + '</div>' +
      '<button class="primary" type="submit">Add test</button></form>' +
      '<div id="test-list" class="card">' + tests + '</div>' +
      '<h2>Modes</h2><div class="card toggles">' +
      '<label><input type="checkbox" id="floor-toggle"' + (state.settings.floorMode ? ' checked' : '') +
      '> Floor mode — a bad day still gets its 25 minutes</label>' +
      '<label><input type="checkbox" id="sat-toggle"' + (state.settings.satDone ? ' checked' : '') +
      '> SAT done — hand its hours back to the IB</label></div>' +
      '<h2>Data</h2><div class="card datarow">' +
      '<button class="primary" type="button" id="export-btn">Export backup</button>' +
      '<label class="filebtn">Import backup<input type="file" id="import-file" accept=".json,application/json" hidden></label></div>';
  }

  function renderSubjects(openIds) {
    return state.subjects.map(function (s) {
      var mine = state.topics.filter(function (t) { return t.subjectId === s.id; });
      var counts = ORDER.map(function (st) {
        var n = mine.filter(function (t) { return t.status === st; }).length;
        if (!n) return null;
        return st === 'shaky' ? '<span class="warn">' + n + ' shaky</span>' : n + ' ' + st;
      }).filter(Boolean).join(' · ');
      var gr = state.grades.filter(function (g) { return g.subjectId === s.id; })
        .sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 2)
        .map(function (g) { return g.score; });
      if (gr.length) counts = 'grades ' + gr.join('·') + ' · ' + counts;
      return '<details class="subject" data-subject="' + s.id + '"' +
        (openIds && openIds.indexOf(s.id) >= 0 ? ' open' : '') + '><summary>' + esc(s.name) +
        '<span class="counts">' + counts + '</span></summary><div class="topics">' +
        mine.map(function (t) {
          return '<button class="topic st-' + t.status + '" data-topic="' + t.id +
            '" aria-label="' + esc(t.name + ' — ' + t.status + ', tap to advance') + '">' +
            esc(t.name) + '</button>';
        }).join('') + '</div></details>';
    }).join('');
  }

  var lastTab = null;
  function render() {
    document.querySelectorAll('#tabs button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === cur.tab);
    });
    var open = [].map.call(document.querySelectorAll('details.subject[open]'), function (d) {
      return d.dataset.subject;
    });
    $('#view').innerHTML = cur.tab === 'today' ? renderToday()
      : cur.tab === 'log' ? renderLog() : renderSubjects(open);
    if (cur.tab === 'today' && lastTab !== 'today') { // land on the current block
      var nb = $('.block.now');
      if (nb) nb.scrollIntoView({ block: 'center' });
    }
    lastTab = cur.tab;
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target : e.target.parentElement;
    var hit = function (s) { return el.closest(s); };
    var tab = hit('#tabs button');
    if (tab) { cur.tab = tab.dataset.tab; render(); return; }
    if (hit('#prev-day')) { cur.offset--; render(); return; }
    if (hit('#next-day')) { cur.offset++; render(); return; }
    if (hit('#day-label')) { cur.offset = 0; render(); return; }
    var chip = hit('#test-topics .chip');
    if (chip) { chip.classList.toggle('on'); return; }
    if (hit('#export-btn')) {
      var blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'triage-backup-' + todayISO() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      return;
    }
    var dg = hit('[data-del-grade]');
    if (dg) {
      state.grades = state.grades.filter(function (g) { return g.id !== dg.dataset.delGrade; });
      save(); render(); return;
    }
    var dt = hit('[data-del-test]');
    if (dt) {
      state.tests = state.tests.filter(function (t) { return t.id !== dt.dataset.delTest; });
      save(); render(); return;
    }
    var top = hit('.topic');
    if (top) {
      var t = state.topics.find(function (x) { return x.id === top.dataset.topic; });
      t.status = ORDER[(ORDER.indexOf(t.status) + 1) % 4];
      t.reviewDue = t.status === 'solid' ? Engine.addDays(todayISO(), 21) : null;
      save(); render();
    }
  });

  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.classList && el.classList.contains('tick')) {
      var key = el.dataset.key;
      var logged = state.log.some(function (x) { return x.key === key; });
      if (el.checked && !logged) {
        var date = Engine.addDays(todayISO(), cur.offset);
        var block = Engine.buildDay(state, date).find(function (b) { return b.key === key; });
        if (block) Engine.tickBlock(state, block);
      } else if (!el.checked && logged) Engine.untickBlock(state, key);
      save(); render(); return;
    }
    if (el.id === 'import-file') {
      var file = el.files && el.files[0];
      if (!file) return;
      var rd = new FileReader();
      rd.onload = function () {
        var s2;
        try { s2 = JSON.parse(rd.result); } catch (err) { alert('Not a valid backup file.'); return; }
        if (!s2 || s2.version !== 1) { alert('Not a Triage backup.'); return; }
        if (!confirm('Replace everything on this device with this backup?')) return;
        state = normalize(s2);
        save(); render();
      };
      rd.readAsText(file);
      return;
    }
    if (el.id === 'floor-toggle') { state.settings.floorMode = el.checked; save(); return; }
    if (el.id === 'sat-toggle') { state.settings.satDone = el.checked; save(); return; }
    if (el.name === 'subject' && el.closest('#test-form')) $('#test-topics').innerHTML = chipsFor(el.value);
  });

  document.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    if (f.id === 'grade-form') {
      state.grades.push({
        id: 'g' + Date.now(), subjectId: f.subject.value, date: f.date.value,
        score: +f.score.value, note: f.note.value.trim()
      });
    } else if (f.id === 'test-form') {
      state.tests.push({
        id: 't' + Date.now(), subjectId: f.subject.value, date: f.date.value,
        topicIds: [].map.call(f.querySelectorAll('.chip.on'), function (c) { return c.dataset.topic; }),
        note: f.note.value.trim()
      });
    } else return;
    save(); render();
  });

  render();
})();
