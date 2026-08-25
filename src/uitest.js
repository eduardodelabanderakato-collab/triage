/* uitest.js — Playwright browser tests against the built index.html. Run: node src/uitest.js */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require('playwright');

const HTML = path.join(__dirname, '..', 'index.html');
let pass = 0; const fails = [];
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fails.push({ name, e }); } }
const ok = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };

(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(fs.readFileSync(HTML));
  });
  await new Promise(r => server.listen(0, r));
  const URL = 'http://127.0.0.1:' + server.address().port + '/';

  const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(URL);

  // reach a Mon–Fri day so the plan has allocatable flex blocks, whatever today is
  async function gotoWeekday() {
    for (let i = 0; i < 7; i++) {
      const d = await page.getAttribute('#day-label', 'data-date');
      if (await page.evaluate(x => Engine.dow(x) <= 4, d)) return d;
      await page.click('#next-day');
    }
    throw new Error('no weekday found');
  }

  await t('page renders without console errors', async () => {
    await page.waitForSelector('.block');
    ok((await page.locator('#tabs button').count()) === 3, 'three tabs');
    ok(/1600/.test(await page.locator('.goalbar').innerText()), 'SAT 1600 goal line visible');
    ok(/\d+\/\d+ done/.test(await page.locator('.daysum').innerText()), 'day summary line');
    ok(/min/.test(await page.locator('#bars .weektotal').innerText()), 'weekly pace line');
    ok(errors.length === 0, 'console errors: ' + errors.join(' | '));
  });

  await t('ticking and unticking a block updates progress and log', async () => {
    await gotoWeekday();
    const tick = page.locator('.block.kind-flex input.tick').first();
    await tick.check();
    ok(await page.evaluate(() => JSON.parse(localStorage.getItem('triage-state-v1')).log.length) === 1, 'one log entry');
    ok(await page.locator('.block.done').count() >= 1, 'block marked done');
    await tick.uncheck();
    ok(await page.evaluate(() => JSON.parse(localStorage.getItem('triage-state-v1')).log.length) === 0, 'log entry removed');
  });

  await t('day navigation moves the date both ways', async () => {
    const d0 = await page.getAttribute('#day-label', 'data-date');
    await page.click('#next-day');
    const d1 = await page.getAttribute('#day-label', 'data-date');
    ok(await page.evaluate(([a, b]) => Engine.daysBetween(a, b) === 1, [d0, d1]), 'moved forward one day');
    await page.click('#prev-day'); await page.click('#prev-day');
    ok(await page.evaluate(([a, b]) => Engine.daysBetween(a, b) === -1,
      [d0, await page.getAttribute('#day-label', 'data-date')]), 'moved back');
    await page.click('#next-day');
    await gotoWeekday();
    ok(/Day [12]/.test(await page.locator('#day-label').innerText()), 'weekday shows Day 1/Day 2');
  });

  await t('tab switching shows Log and Subjects', async () => {
    await page.click('[data-tab="log"]');
    await page.waitForSelector('#grade-form');
    await page.click('[data-tab="subjects"]');
    await page.waitForSelector('details.subject');
    await page.click('[data-tab="today"]');
    await page.waitForSelector('.block');
  });

  await t('topic status cycles all the way round', async () => {
    await page.click('[data-tab="subjects"]');
    await page.locator('details.subject').first().click();
    const topic = page.locator('.topic').first();
    const id = await topic.getAttribute('data-topic');
    const ORDER = ['new', 'learning', 'shaky', 'solid'];
    const st = async () => (await page.getAttribute('[data-topic="' + id + '"]', 'class')).match(/st-(\w+)/)[1];
    const start = await st();
    const seen = [];
    for (let i = 0; i < 4; i++) {
      await page.click('[data-topic="' + id + '"]');
      seen.push(await st());
    }
    const want = [1, 2, 3, 4].map(k => ORDER[(ORDER.indexOf(start) + k) % 4]).join(',');
    ok(seen.join(',') === want, 'cycle was ' + seen.join(',') + ' expected ' + want);
    await page.click('[data-tab="today"]');
  });

  await t('logging a grade visibly changes the plan', async () => {
    await gotoWeekday();
    const before = await page.locator('#blocks').innerHTML();
    await page.click('[data-tab="log"]');
    await page.selectOption('#grade-form [name="subject"]', 'chem');
    await page.selectOption('#grade-form [name="score"]', '4');
    await page.fill('#grade-form [name="note"]', 'stoichiometry test');
    await page.click('#grade-form button[type="submit"]');
    await page.waitForSelector('.grade-item');
    await page.click('[data-tab="today"]');
    await gotoWeekday();
    ok(await page.locator('#blocks').innerHTML() !== before, 'plan should change');
    ok(await page.locator('.bar-row[data-subject="chem"] .warn').count() === 1, 'chem target raised in warning colour');
  });

  await t('an upcoming test takes over that subject’s days', async () => {
    const viewed = await gotoWeekday();
    const testDate = await page.evaluate(d => Engine.addDays(d, 2), viewed);
    await page.click('[data-tab="log"]');
    await page.selectOption('#test-form [name="subject"]', 'phys');
    await page.fill('#test-form [name="date"]', testDate);
    await page.locator('#test-topics .chip').nth(0).click();
    await page.locator('#test-topics .chip').nth(1).click();
    await page.click('#test-form button[type="submit"]');
    await page.waitForSelector('.test-item');
    ok(/in 2d/.test(await page.locator('.test-item .chip-dt').first().innerText()), 'countdown chip');
    await page.click('[data-tab="today"]');
    await gotoWeekday();
    const first = await page.locator('.block.kind-flex .b-title').first().innerText();
    ok(/Physics/.test(first), 'first flex block should be Physics, got: ' + first);
    ok(/test in 2d/.test(await page.locator('.block.kind-flex .b-reason').first().innerText()), 'reason chip');
  });

  await t('floor mode collapses the day to three blocks / 25 min', async () => {
    await page.click('[data-tab="log"]');
    await page.check('#floor-toggle');
    await page.click('[data-tab="today"]');
    ok(await page.locator('.block').count() === 3, 'three blocks');
    const mins = await page.$$eval('.block', els => els.reduce((a, e) => a + +e.dataset.minutes, 0));
    ok(mins === 25, 'total 25, got ' + mins);
    await page.click('[data-tab="log"]');
    await page.uncheck('#floor-toggle');
    await page.click('[data-tab="today"]');
  });

  await t('state survives a reload via localStorage', async () => {
    await gotoWeekday();
    await page.locator('.block.kind-flex input.tick').first().check();
    await page.reload();
    await page.waitForSelector('.block');
    await gotoWeekday();
    ok(await page.locator('.block.kind-flex input.tick').first().isChecked(), 'tick survived');
    await page.click('[data-tab="log"]');
    ok(await page.locator('.grade-item').count() >= 1, 'grade survived');
    ok(await page.locator('.test-item').count() >= 1, 'test survived');
  });

  await t('export downloads a backup and import restores it', async () => {
    await page.click('[data-tab="log"]');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-btn')]);
    const file = path.join(os.tmpdir(), 'triage-backup-uitest.json');
    await download.saveAs(file);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok(data.version === 1 && data.subjects.length === 8, 'backup holds full state');
    data.grades.push({ id: 'gx', subjectId: 'econ', date: '2026-08-20', score: 5, note: 'imported-marker' });
    const chem = data.subjects.find(s => s.id === 'chem'); // stale pre-priority backup
    chem.weeklyMinutes = 100; delete chem.priority;
    fs.writeFileSync(file, JSON.stringify(data));
    page.once('dialog', d => d.accept());
    await page.setInputFiles('#import-file', file);
    await page.waitForSelector('.grade-item');
    ok((await page.locator('#grade-list').innerText()).includes('imported-marker'), 'import applied');
    const migrated = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('triage-state-v1')).subjects.find(s => s.id === 'chem'));
    ok(migrated.weeklyMinutes === 140 && migrated.priority === 1.25,
      'old states are migrated to the current chem budget, got ' + JSON.stringify(migrated));
    fs.unlinkSync(file);
  });

  await t('dark and light themes resolve to the right colours', async () => {
    const bg = p => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const DARK = 'rgb(20, 18, 13)', LIGHT = 'rgb(255, 255, 255)';
    const dark = await browser.newContext({ colorScheme: 'dark' });
    const dp = await dark.newPage(); await dp.goto(URL);
    ok(await bg(dp) === DARK, 'system dark applies dark tokens');
    await dp.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    ok(await bg(dp) === LIGHT, 'data-theme=light overrides system dark');
    await dark.close();
    const light = await browser.newContext({ colorScheme: 'light' });
    const lp = await light.newPage(); await lp.goto(URL);
    ok(await bg(lp) === LIGHT, 'system light applies light tokens');
    await lp.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    ok(await bg(lp) === DARK, 'data-theme=dark overrides system light');
    await light.close();
  });

  await browser.close();
  server.close();
  console.log(pass + ' passed, ' + fails.length + ' failed');
  fails.forEach(f => console.log('\nFAIL: ' + f.name + '\n  ' + (f.e.message || f.e)));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
