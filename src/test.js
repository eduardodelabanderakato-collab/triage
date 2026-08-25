/* test.js — node tests for the engine. Run: node src/test.js */
const assert = require('assert');
const Engine = require('./engine.js');
const Seed = require('./seed.js');

let pass = 0; const fails = [];
function t(name, fn) { try { fn(); pass++; } catch (e) { fails.push({ name, e }); } }
function approx(a, b, eps) { assert.ok(Math.abs(a - b) < (eps || 1e-9), 'expected ' + a + ' ~ ' + b); }

const MON = '2026-08-24', TUE = '2026-08-25', WED = '2026-08-26', THU = '2026-08-27',
      FRI = '2026-08-28', SAT = '2026-08-29', SUN = '2026-08-30';
const fresh = () => Seed.seedState();
const subj = (s, id) => s.subjects.find(x => x.id === id);
let n = 0;
const addLog = (s, date, subjectId, minutes) => s.log.push({ key: 'k' + (n++), date, subjectId, topicId: null, minutes });
const flexOf = blocks => blocks.filter(b => b.kind === 'flex');

// ---- date helpers ----
t('addDays crosses month and year boundaries', () => {
  assert.strictEqual(Engine.addDays('2026-08-31', 1), '2026-09-01');
  assert.strictEqual(Engine.addDays('2026-09-01', -1), '2026-08-31');
  assert.strictEqual(Engine.addDays('2027-12-31', 1), '2028-01-01');
  assert.strictEqual(Engine.addDays('2028-02-28', 1), '2028-02-29'); // leap: exam year
});
t('daysBetween and dow', () => {
  assert.strictEqual(Engine.daysBetween(MON, '2026-09-03'), 10);
  assert.strictEqual(Engine.daysBetween(TUE, MON), -1);
  assert.strictEqual(Engine.dow(MON), 0);
  assert.strictEqual(Engine.dow(SUN), 6);
});
t('weekStart is Monday-based', () => {
  assert.strictEqual(Engine.weekStart(MON), MON);
  assert.strictEqual(Engine.weekStart(SUN), MON);
  assert.strictEqual(Engine.weekStart('2026-09-01'), '2026-08-31');
});
t('minutesThisWeek excludes other weeks and future dates', () => {
  const s = fresh();
  addLog(s, MON, 'math', 60);
  addLog(s, '2026-08-23', 'math', 60); // previous week
  addLog(s, '2026-08-31', 'math', 60); // next week
  addLog(s, FRI, 'math', 60);          // future relative to TUE
  assert.strictEqual(Engine.minutesThisWeek(s, 'math', TUE), 60);
  assert.strictEqual(Engine.minutesThisWeek(s, 'math', FRI), 120);
  assert.strictEqual(Engine.minutesThisWeek(s, 'math', SUN), 120);
});

// ---- day templates ----
const shape = blocks => blocks.map(b => b.kind + '@' + b.time + '/' + b.minutes).join(' ');
t('Mon/Wed are soccer days', () => {
  const want = 'recall@15:20/10 flex@15:30/45 soccer@16:30/90 flex@19:00/90 flex@20:30/45 errlog@21:15/15';
  assert.strictEqual(shape(Engine.buildDay(fresh(), MON)), want);
  assert.strictEqual(shape(Engine.buildDay(fresh(), WED)), want);
});
t('Tue/Thu/Fri template ends with the PeakScore half hour', () => {
  const want = 'recall@15:50/10 flex@16:00/90 flex@17:50/70 flex@19:45/60 peak@20:45/30 errlog@21:15/20';
  [TUE, THU, FRI].forEach(d => assert.strictEqual(shape(Engine.buildDay(fresh(), d)), want));
});
t('Saturday: timed test + flex + PeakScore half hour', () => {
  assert.strictEqual(shape(Engine.buildDay(fresh(), SAT)),
    'test@08:00/135 flex@10:45/100 flex@14:00/120 peak@16:15/30');
});
t('Sunday: autopsy + review + flex + PeakScore half hour', () => {
  assert.strictEqual(shape(Engine.buildDay(fresh(), SUN)),
    'autopsy@09:00/120 review@11:00/60 flex@14:00/90 flex@16:30/60 peak@17:45/30');
});
t('PeakScore is a fixed 30-minute ritual — school owns the flex', () => {
  const s = fresh();
  assert.strictEqual(subj(s, 'peak').weeklyMinutes, 150);
  const day = Engine.buildDay(s, TUE);
  const pk = day.filter(b => b.subjectId === 'peak');
  assert.strictEqual(pk.length, 1);
  assert.strictEqual(pk[0].minutes, 30);
  assert.ok(pk[0].topicId, 'peak block rotates its workstreams');
  assert.ok(!flexOf(day).some(b => b.subjectId === 'peak'), 'peak never competes for flex');
  assert.ok(!Engine.buildDay(s, MON).some(b => b.subjectId === 'peak'), 'soccer days skip peak');
  assert.ok(!Engine.allocationPool(s, TUE).map(x => x.id).includes('peak'));
});
t('floor mode: exactly three blocks totalling 25 minutes', () => {
  const s = fresh(); s.settings.floorMode = true;
  [MON, TUE, SAT, SUN].forEach(d => {
    const b = Engine.buildDay(s, d);
    assert.strictEqual(b.length, 3);
    assert.strictEqual(b.reduce((a, x) => a + x.minutes, 0), 25);
  });
  assert.ok(Engine.buildDay(s, TUE).some(b => b.kind === 'flex' && b.subjectId));
});

// ---- weighting ----
t('remedial minutes raise the weekly target (grade 4 in Chemistry)', () => {
  const s = fresh();
  s.grades.push({ id: 'g1', subjectId: 'chem', date: MON, score: 4, note: '' });
  const w = Engine.subjectWeight(s, subj(s, 'chem'), TUE);
  approx(w.remedial, 30 * 3 * (1 - 1 / 21), 1e-6);
  approx(w.target, subj(s, 'chem').weeklyMinutes + 30 * 3 * (1 - 1 / 21), 1e-6);
  approx(w.gradeMult, 1 + 0.22 * 3 * (1 - 1 / 21), 1e-6);
});
t('grade influence decays to zero at 21 days', () => {
  const s = fresh();
  s.grades.push({ id: 'g1', subjectId: 'math', date: MON, score: 2, note: '' });
  const w = Engine.subjectWeight(s, subj(s, 'math'), Engine.addDays(MON, 21));
  assert.strictEqual(w.remedial, 0);
  assert.strictEqual(w.gradeMult, 1);
  const w2 = Engine.subjectWeight(s, subj(s, 'math'), Engine.addDays(MON, 30));
  assert.strictEqual(w2.remedial, 0);
});
t('remedial caps at 180 and gradeMult at 2.6', () => {
  const s = fresh();
  for (let i = 0; i < 4; i++) s.grades.push({ id: 'g' + i, subjectId: 'math', date: TUE, score: 1, note: '' });
  const w = Engine.subjectWeight(s, subj(s, 'math'), TUE);
  assert.strictEqual(w.remedial, 180);
  assert.strictEqual(w.gradeMult, 2.6);
});
t('test multiplier tiers by days-until-test (day-of gets none: the test is sat)', () => {
  const expect = [[0, 1], [1, 3.0], [2, 3.0], [3, 2.2], [5, 2.2], [6, 1.6], [10, 1.6], [11, 1.25], [14, 1.25], [15, 1]];
  expect.forEach(([dt, m]) => {
    const s = fresh();
    s.tests.push({ id: 't1', subjectId: 'phys', date: Engine.addDays(TUE, dt), topicIds: [], note: '' });
    approx(Engine.subjectWeight(s, subj(s, 'phys'), TUE).testMult, m, 1e-9);
  });
});
t('an upcoming test adds prep minutes to the target, not just weight', () => {
  const s = fresh();
  s.tests.push({ id: 't1', subjectId: 'phys', date: THU, topicIds: [], note: '' });
  const w = Engine.subjectWeight(s, subj(s, 'phys'), TUE);
  assert.strictEqual(w.prep, 180);
  assert.strictEqual(w.target, 180 + 180);
  const dayOf = Engine.subjectWeight(s, subj(s, 'phys'), THU); // prep window is over
  assert.strictEqual(dayOf.prep, 0);
  assert.strictEqual(dayOf.testMult, 1);
});
t('a test sat this morning does not shadow the next one', () => {
  const s = fresh();
  s.tests.push({ id: 'a', subjectId: 'phys', date: TUE, topicIds: [], note: 'sat today 13:30' });
  s.tests.push({ id: 'b', subjectId: 'phys', date: THU, topicIds: [], note: '' });
  const w = Engine.subjectWeight(s, subj(s, 'phys'), TUE);
  assert.strictEqual(w.testDt, 2);
  assert.strictEqual(w.testMult, 3.0);
  assert.strictEqual(w.prep, 180);
});
t('weekend attention: math ≈ phys on top, then econ, chem last', () => {
  const s = fresh();
  approx(Engine.subjectWeight(s, subj(s, 'math'), SAT).wkndMult, 1.45, 1e-9);
  approx(Engine.subjectWeight(s, subj(s, 'phys'), SUN).wkndMult, 1.45, 1e-9);
  approx(Engine.subjectWeight(s, subj(s, 'econ'), SAT).wkndMult, 1.15, 1e-9);
  approx(Engine.subjectWeight(s, subj(s, 'chem'), SAT).wkndMult, 0.8, 1e-9);
  approx(Engine.subjectWeight(s, subj(s, 'math'), TUE).wkndMult, 1, 1e-9); // weekdays untouched
  [SAT, SUN].forEach(d => Engine.buildDay(s, d).forEach(b => {
    if (b.subjectId && (b.kind === 'flex' || b.kind === 'test' || b.kind === 'peak')) Engine.tickBlock(s, b);
  }));
  const wk = id => s.log.filter(e => e.subjectId === id).reduce((a, e) => a + e.minutes, 0);
  assert.ok(wk('math') >= 90 && wk('phys') >= 90, 'both top HLs get deep work: ' + wk('math') + '/' + wk('phys'));
  assert.ok(Math.min(wk('math'), wk('phys')) > wk('econ'), 'math & phys above econ');
  assert.ok(wk('econ') > wk('chem'), 'econ above chem at the weekend: ' + wk('econ') + ' vs ' + wk('chem'));
});
t('combined multiplier caps at 3.5', () => {
  const s = fresh();
  s.tests.push({ id: 't1', subjectId: 'math', date: WED, topicIds: [], note: '' });
  for (let i = 0; i < 4; i++) s.grades.push({ id: 'g' + i, subjectId: 'math', date: TUE, score: 1, note: '' });
  assert.strictEqual(Engine.subjectWeight(s, subj(s, 'math'), TUE).mult, 3.5);
});
t('shakyMult grows with the shaky share', () => {
  const s = fresh();
  const phys = s.topics.filter(x => x.subjectId === 'phys');
  for (let i = 0; i < 12; i++) phys[i].status = 'shaky'; // 12 of 24
  approx(Engine.subjectWeight(s, subj(s, 'phys'), TUE).shakyMult, 1.25, 1e-9);
});

// ---- triage ladder ----
t('Tier 3 lockout follows the week’s pace, not the raw weekly target', () => {
  const s = fresh();
  assert.strictEqual(Engine.tier3Locked(s, MON), false); // Monday: no pace to be behind yet
  assert.strictEqual(Engine.tier3Locked(s, TUE), true);  // nothing logged Monday → the week is slipping
  assert.ok(!Engine.allocationPool(s, TUE).map(x => x.id).includes('port'));
  // every Tier 1 subject at ≥60% of its pro-rated one-day pace → unlocked again
  addLog(s, MON, 'math', 18); addLog(s, MON, 'phys', 16); addLog(s, MON, 'econ', 13); addLog(s, MON, 'peak', 13);
  assert.strictEqual(Engine.tier3Locked(s, TUE), false);
  assert.ok(Engine.allocationPool(s, TUE).map(x => x.id).includes('eng'));
  s.log = s.log.filter(e => e.subjectId !== 'math'); addLog(s, MON, 'math', 17); // just under pace
  assert.strictEqual(Engine.tier3Locked(s, TUE), true);
});
t('untouched subjects build pressure until they surface', () => {
  const s = fresh();
  approx(Engine.subjectWeight(s, subj(s, 'econ'), TUE).staleMult, 2.05, 1e-9); // never studied
  addLog(s, MON, 'econ', 60);
  approx(Engine.subjectWeight(s, subj(s, 'econ'), TUE).staleMult, 1.15, 1e-9); // yesterday
  addLog(s, TUE, 'econ', 60);
  approx(Engine.subjectWeight(s, subj(s, 'econ'), TUE).staleMult, 1, 1e-9);    // today
});
t('weekly budgets encode the stated priorities', () => {
  const s = fresh();
  const wm = id => subj(s, id).weeklyMinutes;
  assert.deepStrictEqual(
    [wm('math'), wm('phys'), wm('econ'), wm('chem'), wm('sat'), wm('eng'), wm('port'), wm('peak')],
    [210, 180, 150, 150, 210, 60, 45, 150]);
});
t('rescue rule: from Thursday the second block goes to a still-unfed subject', () => {
  const s = fresh();
  // week at pace for Tier 1, everything touched except Portuguese
  [['math', 100], ['phys', 100], ['econ', 100], ['peak', 90], ['chem', 100], ['sat', 100], ['eng', 60]]
    .forEach(([id, m]) => addLog(s, MON, id, m));
  const flex = flexOf(Engine.buildDay(s, THU));
  assert.strictEqual(flex[1].subjectId, 'port', 'second block rescues the unfed subject, got ' + flex.map(b => b.subjectId));
  // but the ladder still wins: a slipping week keeps Tier 3 locked, rescue or not
  assert.ok(!Engine.buildDay(fresh(), THU).some(b => b.subjectId === 'port' || b.subjectId === 'eng'),
    'no Tier 3 rescue while the week is slipping');
});
t('a lazy week (last weekday block always skipped) still touches every subject', () => {
  const s = fresh();
  [MON, TUE, WED, THU, FRI, SAT, SUN].forEach(d => {
    let f = 0;
    Engine.buildDay(s, d).forEach(b => {
      if (!b.subjectId || !['flex', 'test', 'peak'].includes(b.kind)) return;
      if (b.kind === 'flex') { f++; if (f === 3) return; }
      Engine.tickBlock(s, b);
    });
  });
  const total = id => s.log.filter(e => e.subjectId === id).reduce((a, e) => a + e.minutes, 0);
  s.subjects.forEach(x => assert.ok(total(x.id) > 0, x.id + ' starved in a partial week'));
});
t('nothing starves: a fully-worked week touches every subject', () => {
  const s = fresh();
  [MON, TUE, WED, THU, FRI, SAT, SUN].forEach(d => Engine.buildDay(s, d).forEach(b => {
    if (b.subjectId && ['flex', 'test', 'peak'].includes(b.kind)) Engine.tickBlock(s, b);
  }));
  const total = id => s.log.filter(e => e.subjectId === id).reduce((a, e) => a + e.minutes, 0);
  s.subjects.forEach(x => assert.ok(total(x.id) > 0, x.id + ' was never studied all week'));
  ['econ', 'chem'].forEach(id => assert.ok(total(id) >= 90, id + ' got only ' + total(id)));
});
t('an imminent oral unlocks a Tier 3 subject through the ladder', () => {
  const s = fresh();
  s.tests.push({ id: 't1', subjectId: 'eng', date: THU, topicIds: ['eng-6', 'eng-7'], note: 'IO' });
  const ids = Engine.allocationPool(s, TUE).map(x => x.id);
  assert.ok(ids.includes('eng'), 'English must escape the lockout');
  assert.ok(!ids.includes('port'), 'Portuguese stays locked');
  const flex = flexOf(Engine.buildDay(s, TUE));
  assert.strictEqual(flex[0].subjectId, 'eng', 'IO prep owns the freshest block, got ' + flex.map(b => b.subjectId));
  assert.strictEqual(flex[0].topicId, 'eng-6');
  assert.ok(flex[0].reason.includes('test in 2d'), flex[0].reason);
});
t('Tier 3 actually gets scheduled once everything above it is fed', () => {
  const s = fresh();
  [['math', 210], ['phys', 180], ['econ', 150], ['peak', 150], ['chem', 150], ['sat', 210]]
    .forEach(([id, m]) => addLog(s, MON, id, m));
  const got = Engine.buildDay(s, TUE).map(b => b.subjectId);
  assert.ok(got.includes('eng'), 'expected an English block, got ' + got.join(','));
  assert.ok(got.includes('port'), 'expected a Portuguese block, got ' + got.join(','));
});

// ---- adaptivity ----
t('a Chemistry 4 pulls Chemistry into the day', () => {
  const clean = flexOf(Engine.buildDay(fresh(), TUE)).map(b => b.subjectId);
  assert.ok(!clean.includes('chem'), 'baseline day should not already include chem');
  const s = fresh();
  s.grades.push({ id: 'g1', subjectId: 'chem', date: MON, score: 4, note: '' });
  const blocks = Engine.buildDay(s, TUE);
  const chem = flexOf(blocks).find(b => b.subjectId === 'chem');
  assert.ok(chem, 'expected a chem block');
  assert.ok(chem.reason.includes('grade below target'), chem.reason);
});
t('a physics test in 2 days takes over the day and targets its topics', () => {
  const s = fresh();
  s.tests.push({ id: 't1', subjectId: 'phys', date: THU, topicIds: ['phys-3', 'phys-7'], note: '' });
  const flex = flexOf(Engine.buildDay(s, TUE));
  const phys = flex.filter(b => b.subjectId === 'phys');
  assert.ok(phys.length >= 2, 'physics should dominate, got ' + flex.map(b => b.subjectId).join(','));
  assert.deepStrictEqual(phys.slice(0, 2).map(b => b.topicId).sort(), ['phys-3', 'phys-7']);
  assert.ok(phys[0].reason.includes('test in 2d'), phys[0].reason);
  assert.ok(phys.reduce((a, b) => a + b.minutes, 0) <= 150, 'daily cap of 150 per subject');
});
t('PeakScore and the SAT survive a full simulated week', () => {
  const s = fresh();
  [MON, TUE, WED, THU, FRI, SAT, SUN].forEach(d => {
    Engine.buildDay(s, d).forEach(b => {
      if (b.subjectId && (b.kind === 'flex' || b.kind === 'test' || b.kind === 'peak')) Engine.tickBlock(s, b);
    });
  });
  const total = id => s.log.filter(e => e.subjectId === id).reduce((a, e) => a + e.minutes, 0);
  assert.strictEqual(total('peak'), 150, 'peak is exactly its five half hours, got ' + total('peak'));
  assert.ok(total('sat') >= 150, 'sat got ' + total('sat'));
  assert.ok(total('chem') >= 90, 'chem got ' + total('chem'));
  ['math', 'phys', 'econ'].forEach(id => assert.ok(total(id) >= 60, id + ' got ' + total(id)));
});

t('a nearly-fed subject stops absorbing surplus once its need is planned', () => {
  const s = fresh();
  [['math', 210], ['phys', 180], ['econ', 150], ['peak', 150], ['chem', 150], ['sat', 210], ['eng', 60]]
    .forEach(([id, m]) => addLog(s, MON, id, m)); // everything fed except Portuguese
  const flex = flexOf(Engine.buildDay(s, SUN));
  const port = flex.filter(b => b.subjectId === 'port');
  assert.strictEqual(port.length, 1,
    'port takes one block for its 30 minutes, not the whole afternoon: ' + flex.map(b => b.subjectId));
});

// ---- chemistry priority ----
t('Chemistry runs hotter than Tier 2 but still below Physics', () => {
  const s = fresh();
  const chem = Engine.subjectWeight(s, subj(s, 'chem'), TUE);
  const phys = Engine.subjectWeight(s, subj(s, 'phys'), TUE);
  approx(chem.effWeight, 0.9, 1e-9);  // 0.72 tier weight × 1.25 priority
  approx(phys.effWeight, 1, 1e-9);
  approx(Engine.subjectWeight(s, subj(s, 'sat'), TUE).effWeight, 0.72, 1e-9);
  assert.ok(chem.score < phys.score, 'chem must stay below physics');
});

// ---- Day 1 / Day 2 rotation ----
t('school days alternate 1/2 across weeks; weekends are neither', () => {
  assert.strictEqual(Engine.schoolDay(MON), 1);
  assert.strictEqual(Engine.schoolDay(TUE), 2); // anchored: 2026-08-25 is a Day 2
  assert.strictEqual(Engine.schoolDay(FRI), 1);
  assert.strictEqual(Engine.schoolDay(SAT), null);
  assert.strictEqual(Engine.schoolDay(SUN), null);
  assert.strictEqual(Engine.schoolDay('2026-08-31'), 2); // next Monday flips
  assert.strictEqual(Engine.schoolDay('2026-09-04'), 2); // that week gets three Day 2s
  assert.strictEqual(Engine.schoolDay('2026-08-18'), 1); // works backwards too
});
t('subjects met in class today get the consolidation boost', () => {
  const s = fresh();
  approx(Engine.subjectWeight(s, subj(s, 'phys'), TUE).classMult, 1.2); // Day 2: physics
  approx(Engine.subjectWeight(s, subj(s, 'math'), TUE).classMult, 1);
  approx(Engine.subjectWeight(s, subj(s, 'math'), MON).classMult, 1.2); // Day 1: math
  approx(Engine.subjectWeight(s, subj(s, 'chem'), SAT).classMult, 1);   // weekend
  assert.strictEqual(flexOf(Engine.buildDay(s, TUE))[0].subjectId, 'phys');
  assert.strictEqual(flexOf(Engine.buildDay(s, MON))[0].subjectId, 'math');
});
t('the recall sprint names yesterday’s classes', () => {
  const rTue = Engine.buildDay(fresh(), TUE)[0]; // Monday was a Day 1
  assert.ok(/Day 1/.test(rTue.instruction), rTue.instruction);
  assert.ok(/Math AA HL/.test(rTue.instruction) && /Economics HL/.test(rTue.instruction), rTue.instruction);
  const rMon = Engine.buildDay(fresh(), MON)[0]; // Sunday had no classes
  assert.ok(!/Day [12]/.test(rMon.instruction), rMon.instruction);
});

// ---- topics ----
t('topic picker: test-named first, then shaky > learning > new > solid past review', () => {
  const s = fresh();
  const top = id => s.topics.find(x => x.id === id);
  top('math-1').status = 'learning'; top('math-2').status = 'shaky';
  top('math-3').status = 'solid'; top('math-3').reviewDue = MON;
  assert.strictEqual(Engine.pickTopic(s, 'math', TUE, new Set()).id, 'math-2');
  assert.strictEqual(Engine.pickTopic(s, 'math', TUE, new Set(['math-2'])).id, 'math-1');
  s.topics.forEach(x => { if (x.subjectId === 'math') x.status = 'solid'; x.reviewDue = null; });
  top('math-3').reviewDue = MON; top('math-5').reviewDue = FRI;
  assert.strictEqual(Engine.pickTopic(s, 'math', TUE, new Set()).id, 'math-3'); // only one past due
  s.tests.push({ id: 't1', subjectId: 'math', date: WED, topicIds: ['math-9'], note: '' });
  assert.strictEqual(Engine.pickTopic(s, 'math', TUE, new Set()).id, 'math-9'); // named wins outright
});
t('no topic repeats within a day', () => {
  const s = fresh();
  s.tests.push({ id: 't1', subjectId: 'phys', date: THU, topicIds: ['phys-1'], note: '' });
  s.grades.push({ id: 'g1', subjectId: 'chem', date: MON, score: 3, note: '' });
  [MON, TUE, WED, THU, FRI, SAT, SUN].forEach(d => {
    const ids = Engine.buildDay(s, d).filter(b => b.topicId).map(b => b.topicId);
    assert.strictEqual(new Set(ids).size, ids.length, 'duplicate topic on ' + d);
  });
});
t('instructions vary by status and subject', () => {
  assert.strictEqual(Engine.instructionFor('math', 'new'), 'Key Concept video only if lost (≤10 min) → 5 Easy → 8 Medium');
  assert.strictEqual(Engine.instructionFor('phys', 'learning'), '8 Medium → 5 Hard');
  assert.strictEqual(Engine.instructionFor('sat', 'shaky'), 'Redo your logged misses BLIND first, then 6 Medium');
  assert.strictEqual(Engine.instructionFor('math', 'solid'), 'Review: 5 Hard + 1 timed past-paper question');
  assert.ok(/diagram/i.test(Engine.instructionFor('econ', 'learning')));
  assert.ok(/timed|criteria/i.test(Engine.instructionFor('eng', 'solid')));
  assert.ok(/crit[ée]rios|cronometrad/i.test(Engine.instructionFor('port', 'new')));
  assert.notStrictEqual(Engine.instructionFor('peak', 'new'), Engine.instructionFor('math', 'new'));
});
t('oral topics get oral-specific instructions', () => {
  assert.ok(/record|criteria/i.test(
    Engine.instructionFor('eng', 'learning', 'Individual Oral: 10-minute delivery practice')));
  assert.ok(/grave|crit/i.test(
    Engine.instructionFor('port', 'new', 'Oral Individual: prática de apresentação')));
  assert.strictEqual(Engine.instructionFor('eng', 'learning', 'Paper 1: thesis & structure under time'),
    Engine.instructionFor('eng', 'learning'));
});

// ---- Saturday test block & satDone ----
t('Saturday block is a full SAT test until satDone, then an IB past paper', () => {
  const s = fresh();
  let b = Engine.buildDay(s, SAT)[0];
  assert.ok(/Full timed SAT test/.test(b.title), b.title);
  assert.strictEqual(b.subjectId, 'sat');
  s.settings.satDone = true;
  b = Engine.buildDay(s, SAT)[0];
  assert.ok(/Timed IB past paper/.test(b.title), b.title);
  assert.ok(['math', 'phys', 'econ'].includes(b.subjectId), b.subjectId);
});
t('satDone removes the SAT from allocation entirely', () => {
  const s = fresh(); s.settings.satDone = true;
  assert.ok(!Engine.allocationPool(s, TUE).map(x => x.id).includes('sat'));
  [MON, TUE, SAT].forEach(d =>
    assert.ok(!Engine.buildDay(s, d).some(b => b.subjectId === 'sat'), 'sat scheduled on ' + d));
});

// ---- ticking ----
t('ticking logs minutes, advances new → learning, stamps lastStudied', () => {
  const s = fresh();
  const block = flexOf(Engine.buildDay(s, TUE))[0];
  const topic = s.topics.find(x => x.id === block.topicId);
  assert.strictEqual(topic.status, 'new');
  Engine.tickBlock(s, block);
  assert.strictEqual(s.log.length, 1);
  assert.deepStrictEqual([s.log[0].key, s.log[0].subjectId, s.log[0].minutes], [block.key, block.subjectId, block.minutes]);
  assert.strictEqual(topic.status, 'learning');
  assert.strictEqual(topic.lastStudied, TUE);
  Engine.untickBlock(s, block.key);
  assert.strictEqual(s.log.length, 0);
});
t('ticking a solid topic pushes its review date out 21 days', () => {
  const s = fresh();
  s.topics.forEach(x => { if (x.subjectId === 'math') { x.status = 'solid'; x.reviewDue = MON; } });
  const block = flexOf(Engine.buildDay(s, TUE)).find(b => b.subjectId === 'math') ||
                { key: TUE + ':x', date: TUE, subjectId: 'math', topicId: 'math-1', minutes: 60, kind: 'flex' };
  Engine.tickBlock(s, block);
  assert.strictEqual(s.topics.find(x => x.id === block.topicId).reviewDue, Engine.addDays(TUE, 21));
});
t('done blocks are pinned: later state changes do not reshuffle them', () => {
  const s = fresh();
  const block = flexOf(Engine.buildDay(s, TUE))[0];
  Engine.tickBlock(s, block);
  s.tests.push({ id: 't1', subjectId: 'phys', date: THU, topicIds: [], note: '' });
  const again = Engine.buildDay(s, TUE).find(b => b.key === block.key);
  assert.strictEqual(again.subjectId, block.subjectId);
  assert.strictEqual(again.topicId, block.topicId);
});

// ---- reasons ----
t('"behind weekly target" only surfaces from Thursday when deficit > 50%', () => {
  const s = fresh();
  const early = flexOf(Engine.buildDay(s, MON)).concat(flexOf(Engine.buildDay(s, TUE)));
  assert.ok(early.every(b => !b.reason.includes('behind weekly target')), 'must not nag early in the week');
  const b = flexOf(Engine.buildDay(s, THU))[0]; // nothing logged all week -> 100% deficit
  assert.ok(b.reason.includes('behind weekly target'), b.reason);
});

// ---- seed sanity ----
t('seed carries the real syllabus (~120 topics, no placeholders)', () => {
  const s = fresh();
  assert.strictEqual(s.subjects.length, 8);
  assert.ok(s.topics.length >= 105 && s.topics.length <= 135, 'got ' + s.topics.length);
  assert.ok(s.subjects.every(x => s.topics.filter(tp => tp.subjectId === x.id).length >= 4));
  assert.ok(!s.topics.some(tp => /^(Topic|Unit|Chapter) \d+$/i.test(tp.name)));
  assert.ok(s.topics.some(tp => tp.name === 'A.1 Kinematics') && s.topics.some(tp => tp.name === 'E.5 Fusion & stars'));
  assert.deepStrictEqual(s.settings,
    { floorMode: false, satDone: false, satTarget: 1600, satDeadline: '2026-12-18' });
});

console.log(pass + ' passed, ' + fails.length + ' failed');
fails.forEach(f => { console.log('\nFAIL: ' + f.name + '\n  ' + (f.e.message || f.e)); });
process.exit(fails.length ? 1 : 0);
