/* engine.js — pure scheduling logic. No DOM. UMD: node module + browser global. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  var TIER_W = { 1: 1, 2: 0.72, 3: 0.45 };
  // weekend deep-work bias: math ≈ physics on top, econ next, chem last
  // (chem keeps its weekday priority; weekends are just not its turn)
  var WEEKEND_W = { math: 1.35, phys: 1.35, econ: 1.3, chem: 0.8 };
  var KIND = { math: 'analytical', phys: 'analytical', chem: 'analytical', peak: 'project', sat: 'project' };
  // [multiplier on the first flex block of the day, multiplier on the last]
  var PLACEMENT = { analytical: [1.35, 0.75], project: [0.60, 1.40], neutral: [1, 1] };
  var DAY_CAP = 150, SPREAD = 90;

  // ---- dates (all ISO yyyy-mm-dd, UTC arithmetic, weeks start Monday) ----
  function fromISO(iso) { var p = iso.split('-'); return Date.UTC(+p[0], p[1] - 1, +p[2]); }
  function toISO(ms) {
    var d = new Date(ms), pad = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function addDays(iso, n) { return toISO(fromISO(iso) + n * 864e5); }
  function daysBetween(a, b) { return Math.round((fromISO(b) - fromISO(a)) / 864e5); }
  function dow(iso) { return (new Date(fromISO(iso)).getUTCDay() + 6) % 7; } // Mon=0 … Sun=6
  function weekStart(iso) { return addDays(iso, -dow(iso)); }

  // Day 1 / Day 2 school rotation: weekdays alternate and carry across weeks,
  // so one week runs 1-2-1-2-1 and the next 2-1-2-1-2. Weekends are neither.
  var ANCHOR_MONDAY = '2026-08-24'; // this Monday was a Day 1 (Tue 2026-08-25 was a Day 2)
  var CLASS_DAYS = { 1: ['eng', 'econ', 'math'], 2: ['chem', 'port', 'phys'] };
  function schoolDay(iso) {
    if (dow(iso) > 4) return null;
    var days = daysBetween(ANCHOR_MONDAY, iso), w = Math.floor(days / 7);
    var idx = w * 5 + Math.min(days - w * 7, 4); // school days elapsed since the anchor
    return ((idx % 2) + 2) % 2 === 0 ? 1 : 2;
  }

  function minutesThisWeek(state, subjectId, dateISO) {
    var ws = weekStart(dateISO), sum = 0;
    state.log.forEach(function (e) {
      if (e.subjectId === subjectId && e.date >= ws && e.date <= dateISO) sum += e.minutes;
    });
    return sum;
  }

  // ---- weighting ----
  // nearest test still ahead of tonight's study blocks; a test sat earlier today
  // (dt = 0) is over and must not shadow the next one
  function nextTestDt(state, subjectId, dateISO) {
    var best = null;
    state.tests.forEach(function (t) {
      if (t.subjectId !== subjectId) return;
      var dt = daysBetween(dateISO, t.date);
      if (dt >= 1 && (best === null || dt < best)) best = dt;
    });
    return best;
  }
  // days since this subject last appeared in the log (capped; never-studied = max)
  function staleDays(state, subjectId, dateISO) {
    var last = null;
    state.log.forEach(function (e) {
      if (e.subjectId === subjectId && e.date <= dateISO && (!last || e.date > last)) last = e.date;
    });
    return last ? Math.min(7, daysBetween(last, dateISO)) : 7;
  }
  function subjectWeight(state, subject, dateISO) {
    var remedial = 0, gradeMult = 1;
    state.grades.forEach(function (g) {
      if (g.subjectId !== subject.id) return;
      var age = daysBetween(g.date, dateISO);
      if (age < 0 || age >= 21) return;
      var decay = 1 - age / 21;
      remedial += 30 * (7 - g.score) * decay;
      gradeMult += 0.22 * (7 - g.score) * decay;
    });
    remedial = Math.min(180, remedial);
    gradeMult = Math.min(2.6, gradeMult);

    var testDt = nextTestDt(state, subject.id, dateISO);
    // day-of gets neither boost nor prep: by study time the test has been sat
    var testMult = testDt === null || testDt < 1 ? 1 :
      testDt <= 2 ? 3.0 : testDt <= 5 ? 2.2 : testDt <= 10 ? 1.6 : testDt <= 14 ? 1.25 : 1;
    var prep = testDt === null || testDt < 1 ? 0 :
      testDt <= 2 ? 180 : testDt <= 5 ? 120 : testDt <= 10 ? 60 : 0;

    var total = 0, shaky = 0;
    state.topics.forEach(function (tp) {
      if (tp.subjectId !== subject.id) return;
      total++; if (tp.status === 'shaky') shaky++;
    });
    var shakyMult = 1 + 0.5 * (total ? shaky / total : 0);

    var sd = schoolDay(dateISO); // consolidate what was taught in class today
    var classMult = sd && CLASS_DAYS[sd].indexOf(subject.id) >= 0 ? 1.2 : 1;
    var wkndMult = dow(dateISO) >= 5 ? (WEEKEND_W[subject.id] || 1) : 1;
    // untouched subjects build pressure, so small-budget subjects still surface
    var staleMult = 1 + 0.15 * staleDays(state, subject.id, dateISO);
    var effWeight = TIER_W[subject.tier] * (subject.priority || 1); // e.g. chem: 0.72 × 1.25
    var target = subject.weeklyMinutes + remedial + prep; // assessments add minutes, like grades do
    var done = minutesThisWeek(state, subject.id, dateISO);
    var remaining = Math.max(0, target - done);
    var mult = Math.min(3.5, testMult * gradeMult * shakyMult);
    return {
      remedial: remedial, prep: prep, target: target, done: done, remaining: remaining,
      testMult: testMult, gradeMult: gradeMult, shakyMult: shakyMult, testDt: testDt,
      classMult: classMult, wkndMult: wkndMult, staleMult: staleMult,
      mult: mult, effWeight: effWeight,
      score: (remaining / 60 + 0.1) * mult * effWeight * classMult * wkndMult * staleMult
    };
  }

  // The triage ladder, tier 3 rung: locked out while any tier 1 subject is >40%
  // behind the week's PACE (pro-rated target), so a slipping week cuts from the
  // bottom but a normal Monday doesn't blanket-ban the small subjects.
  function tier3Locked(state, dateISO) {
    var frac = dow(dateISO) / 7; // days already elapsed this week
    if (frac === 0) return false;
    return state.subjects.some(function (s) {
      if (s.tier !== 1) return false;
      var w = subjectWeight(state, s, dateISO);
      return w.done < 0.6 * w.target * frac;
    });
  }

  function allocationPool(state, dateISO) {
    var locked = tier3Locked(state, dateISO);
    return state.subjects.filter(function (s) {
      if (s.id === 'peak') return false; // fixed daily half hour, never competes for flex
      if (s.id === 'sat' && state.settings.satDone) return false;
      if (s.tier === 3 && locked) {
        var dt = nextTestDt(state, s.id, dateISO); // an imminent assessment beats the ladder
        return dt !== null && dt <= 10;
      }
      return true;
    });
  }

  // ---- day templates ----
  function template(dateISO, settings) {
    if (settings.floorMode) return [
      { time: '19:00', minutes: 5, kind: 'recall' },
      { time: '19:05', minutes: 15, kind: 'flex' },
      { time: '19:20', minutes: 5, kind: 'errlog' }];
    var d = dow(dateISO);
    if (d === 0 || d === 2) return [ // soccer days
      { time: '15:20', minutes: 10, kind: 'recall' },
      { time: '15:30', minutes: 45, kind: 'flex' },
      { time: '16:30', minutes: 90, kind: 'soccer' },
      { time: '19:00', minutes: 90, kind: 'flex' },
      { time: '20:30', minutes: 45, kind: 'flex' },
      { time: '21:15', minutes: 15, kind: 'errlog' }];
    if (d <= 4) return [
      { time: '15:50', minutes: 10, kind: 'recall' },
      { time: '16:00', minutes: 90, kind: 'flex' },
      { time: '17:50', minutes: 70, kind: 'flex' },
      { time: '19:45', minutes: 60, kind: 'flex' },
      { time: '20:45', minutes: 30, kind: 'peak' },
      { time: '21:15', minutes: 20, kind: 'errlog' }];
    if (d === 5) return [ // weekends are the chance to get ahead
      { time: '08:00', minutes: 135, kind: 'test' },
      { time: '10:45', minutes: 100, kind: 'flex' },
      { time: '14:00', minutes: 120, kind: 'flex' },
      { time: '16:15', minutes: 30, kind: 'peak' }];
    return [
      { time: '09:00', minutes: 120, kind: 'autopsy' },
      { time: '11:00', minutes: 60, kind: 'review' },
      { time: '14:00', minutes: 90, kind: 'flex' },
      { time: '16:30', minutes: 60, kind: 'flex' },
      { time: '17:45', minutes: 30, kind: 'peak' }];
  }

  // ---- topic choice ----
  function pickTopic(state, subjectId, dateISO, used) {
    var pool = state.topics.filter(function (tp) { return tp.subjectId === subjectId && !used.has(tp.id); });
    if (!pool.length) return null;
    var named = {};
    state.tests.forEach(function (t) {
      if (t.subjectId !== subjectId) return;
      var dt = daysBetween(dateISO, t.date);
      if (dt >= 1 && dt <= 10) (t.topicIds || []).forEach(function (id) { named[id] = true; });
    });
    var lru = function (a, b) {
      var x = a.lastStudied || '', y = b.lastStudied || '';
      return x < y ? -1 : x > y ? 1 : 0;
    };
    var first = function (list) { return list.length ? list.slice().sort(lru)[0] : null; };
    return first(pool.filter(function (tp) { return named[tp.id]; })) ||
      first(pool.filter(function (tp) { return tp.status === 'shaky'; })) ||
      first(pool.filter(function (tp) { return tp.status === 'learning'; })) ||
      first(pool.filter(function (tp) { return tp.status === 'new'; })) ||
      first(pool.filter(function (tp) { return tp.status === 'solid' && tp.reviewDue && tp.reviewDue <= dateISO; })) ||
      first(pool);
  }

  // ---- task instructions ----
  var DEFAULT_INSTR = {
    new: 'Key Concept video only if lost (≤10 min) → 5 Easy → 8 Medium',
    learning: '8 Medium → 5 Hard',
    shaky: 'Redo your logged misses BLIND first, then 6 Medium',
    solid: 'Review: 5 Hard + 1 timed past-paper question'
  };
  var SPECIAL_INSTR = {
    econ: {
      new: 'Read the section once, then draw its diagrams from memory and check',
      learning: 'Draw the diagrams from memory → one 10-mark essay plan',
      shaky: 'Redo your missed diagrams blind → one 15-mark essay plan',
      solid: 'Timed: full 15-mark plan + a real-world example from memory'
    },
    eng: {
      new: 'Read the assessment criteria, annotate one past task against them',
      learning: 'Timed 20 min: unseen extract → thesis + paragraph outline',
      shaky: 'Rewrite your weakest paragraph against the criteria, then a timed outline',
      solid: 'Full timed unseen analysis under Paper 1 conditions'
    },
    port: {
      new: 'Leia os critérios de avaliação e anote uma tarefa anterior contra eles',
      learning: '20 min cronometrados: trecho não visto → tese + esqueleto de parágrafos',
      shaky: 'Reescreva seu parágrafo mais fraco contra os critérios, depois um esquema cronometrado',
      solid: 'Análise completa de texto não visto em condições de Paper 1'
    },
    peak: { any: 'Ship one concrete improvement end-to-end, then log what moved' }
  };
  var ORAL_INSTR = {
    port: 'Ensaio completo do oral, cronometrado — grave-se e corrija pelos critérios',
    any: 'Full timed run of the oral — record yourself, then mark it against the criteria'
  };
  function instructionFor(subjectId, status, topicName) {
    if (topicName && /oral/i.test(topicName)) return ORAL_INSTR[subjectId] || ORAL_INSTR.any;
    var s = SPECIAL_INSTR[subjectId];
    return s ? (s.any || s[status] || DEFAULT_INSTR[status]) : DEFAULT_INSTR[status];
  }

  function reasonFor(w, topic, dateISO) {
    var r = [];
    if (w.testDt !== null && w.testDt >= 1 && w.testDt <= 14) r.push('test in ' + w.testDt + 'd');
    if (w.remedial > 0) r.push('grade below target · +' + Math.round(w.remedial) + ' min');
    if (dow(dateISO) >= 3 && w.remaining / w.target > 0.5) r.push('behind weekly target');
    if (!r.length && topic && topic.status === 'shaky') r.push('shaky topic');
    if (!r.length && w.staleMult >= 1.6) r.push('untouched ' + Math.round((w.staleMult - 1) / 0.15) + 'd');
    return r.join(' · ');
  }

  var FIXED = {
    recall: ['Recall sprint', 'Blank page: rebuild yesterday’s topics from memory, then check your notes.'],
    soccer: ['Soccer', 'Tier 0. Untouchable.'],
    errlog: ['Error log', 'Every miss from today goes in: source, why it was lost, the fix.'],
    autopsy: ['Error autopsy', 'Redo this week’s logged errors blind. Missed twice → mark that topic shaky.'],
    review: ['Weekly review', 'Score each subject’s week, set next week’s focus, clear the error log.']
  };

  // ---- the day builder ----
  function buildDay(state, dateISO) {
    var blocks = template(dateISO, state.settings).map(function (b, i) {
      return Object.assign({ key: dateISO + ':' + i, date: dateISO, reason: '' }, b);
    });
    var pool = allocationPool(state, dateISO);
    var weights = {};
    pool.forEach(function (s) { weights[s.id] = subjectWeight(state, s, dateISO); });
    var byId = {};
    state.subjects.forEach(function (s) { byId[s.id] = s; });
    var topicById = {};
    state.topics.forEach(function (tp) { topicById[tp.id] = tp; });
    var logByKey = {};
    state.log.forEach(function (e) { logByKey[e.key] = e; });

    var used = new Set(), planned = {};
    var addPlan = function (id, min) { planned[id] = (planned[id] || 0) + min; };

    blocks.forEach(function (b) {
      if (FIXED[b.kind]) {
        b.title = FIXED[b.kind][0]; b.instruction = FIXED[b.kind][1];
        if (b.kind === 'recall') { // name yesterday's classes, if there were any
          var ysd = schoolDay(addDays(dateISO, -1));
          if (ysd) b.instruction = 'Yesterday was Day ' + ysd + ' — rebuild ' +
            CLASS_DAYS[ysd].map(function (id) { return byId[id] ? byId[id].name : id; }).join(', ') +
            ' from memory, then check your notes.';
        }
        return;
      }
      if (b.kind === 'peak') { // the fixed daily half hour
        b.subjectId = 'peak';
        var pin0 = logByKey[b.key];
        if (pin0 && pin0.subjectId) b.done = true;
        var ptp = pin0 && pin0.topicId ? topicById[pin0.topicId] : pickTopic(state, 'peak', dateISO, used);
        if (ptp) { b.topicId = ptp.id; used.add(ptp.id); }
        b.title = 'PeakScore — ' + (ptp ? ptp.name : 'daily 30');
        b.instruction = 'Timeboxed half hour: ship one small thing, then stop. School owns the rest.';
        addPlan('peak', b.minutes);
        return;
      }
      if (b.kind !== 'test') return;
      var pin = logByKey[b.key];
      if (pin && pin.subjectId) { b.subjectId = pin.subjectId; b.done = true; }
      else if (!state.settings.satDone) b.subjectId = 'sat';
      else { // pick the neediest tier-1 IB subject for the past paper
        var best = null;
        pool.forEach(function (s) {
          if (s.tier !== 1 || s.id === 'peak') return;
          if (!best || weights[s.id].score > weights[best.id].score) best = s;
        });
        b.subjectId = best ? best.id : 'math';
      }
      if (b.subjectId === 'sat') {
        b.title = 'Full timed SAT test';
        b.instruction = 'Real conditions: one sitting, timed, phone away. Mark it immediately after.';
      } else {
        b.title = 'Timed IB past paper — ' + byId[b.subjectId].name;
        b.instruction = 'Real paper, real timing. Mark with the scheme straight after; every miss into the error log.';
      }
      addPlan(b.subjectId, b.minutes);
    });

    var flex = blocks.filter(function (b) { return b.kind === 'flex'; });
    // pin already-ticked blocks first so the rest of the day plans around them
    flex.forEach(function (b) {
      var pin = logByKey[b.key];
      if (!pin || !pin.subjectId) return;
      b.done = true; b.subjectId = pin.subjectId; b.topicId = pin.topicId || undefined;
      var tp = pin.topicId && topicById[pin.topicId];
      b.title = byId[pin.subjectId].name + (tp ? ' — ' + tp.name : '');
      b.instruction = tp ? instructionFor(pin.subjectId, tp.status, tp.name) : '';
      if (tp) used.add(tp.id);
      addPlan(pin.subjectId, pin.minutes);
    });
    flex.forEach(function (b, i) {
      if (b.done) return;
      var pos = flex.length > 1 ? i / (flex.length - 1) : 0.5;
      var best = null;
      pool.forEach(function (s) {
        var p = planned[s.id] || 0;
        if (p + b.minutes > DAY_CAP) return;
        var pl = PLACEMENT[KIND[s.id] || 'neutral'];
        var place = pl[0] + (pl[1] - pl[0]) * pos;
        var w = weights[s.id];
        // test-eve exception: ≤2 days out, urgency overrides the time-of-day penalty
        if (w.testDt !== null && w.testDt <= 2 && place < 1) place = 1;
        // need shrinks as today's slots fill, so a fed subject stops absorbing surplus
        var base = (Math.max(0, w.remaining - p) / 60 + 0.1) *
          w.mult * w.effWeight * w.classMult * w.wkndMult * w.staleMult;
        var live = base * place / (1 + p / SPREAD);
        if (!best || live > best.live) best = { s: s, live: live };
      });
      if (!best) return;
      var topic = pickTopic(state, best.s.id, dateISO, used);
      if (topic) used.add(topic.id);
      b.subjectId = best.s.id;
      b.topicId = topic ? topic.id : undefined;
      b.title = best.s.name + (topic ? ' — ' + topic.name : '');
      b.instruction = instructionFor(best.s.id, topic ? topic.status : 'learning', topic && topic.name);
      b.reason = reasonFor(weights[best.s.id], topic, dateISO);
      addPlan(best.s.id, b.minutes);
    });
    return blocks;
  }

  // ---- ticking (progress is logged, not self-reported) ----
  function tickBlock(state, block) {
    state.log.push({
      key: block.key, date: block.date,
      subjectId: block.subjectId || null, topicId: block.topicId || null, minutes: block.minutes
    });
    var tp = block.topicId && state.topics.find(function (x) { return x.id === block.topicId; });
    if (tp) {
      if (tp.status === 'new') tp.status = 'learning';
      if (tp.status === 'solid') tp.reviewDue = addDays(block.date, 21);
      tp.lastStudied = block.date;
    }
  }
  function untickBlock(state, key) {
    state.log = state.log.filter(function (e) { return e.key !== key; });
  }

  return {
    TIER_W: TIER_W, KIND: KIND, PLACEMENT: PLACEMENT,
    addDays: addDays, daysBetween: daysBetween, dow: dow, weekStart: weekStart,
    schoolDay: schoolDay, CLASS_DAYS: CLASS_DAYS,
    minutesThisWeek: minutesThisWeek, subjectWeight: subjectWeight,
    tier3Locked: tier3Locked, allocationPool: allocationPool,
    template: template, pickTopic: pickTopic, instructionFor: instructionFor,
    buildDay: buildDay, tickBlock: tickBlock, untickBlock: untickBlock
  };
});
