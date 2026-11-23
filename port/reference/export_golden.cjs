// Generates track.json, course.json and golden traces from the PoC (index.html) in headless Chrome.
// Usage: node export_golden.cjs <url-of-index.html> <outdir>
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright-core');
const url = process.argv[2], out = process.argv[3];
const SCEN = [];
for (const horse of ['schoolmaster', 'youngster', 'mare']) for (const [level, bot] of [[0, 'none'], [1, 'none'], [3, 'perfect'], [5, 'perfect'], [5, 'human']]) for (const seed of [1, 2]) SCEN.push({ horse, level, bot, seed });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto(url); await page.waitForTimeout(1500);
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'bots.js'), 'utf8') });
  const meta = await page.evaluate(() => {
    const cr = window.__cr, t = cr.track;
    return {
      track: { N: t.N, step: t.step, length: t.length, P: t.P.map(p => [p.x, p.z]), T: t.T.map(p => [p.x, p.z]), K: Array.from(t.K) },
      course: { constants: cr.constants, coursePts: cr.COURSE_PTS, fenceDefs: cr.FENCE_DEFS, startS: cr.startS, finishS: cr.finishS, timeAllowed: cr.timeAllowed,
        fences: cr.fences.map(f => ({ n: f.n, type: f.type, h: f.h, spread: f.spread, s: f.s, front: f.front, back: f.back, ideal: f.ideal })), horses: cr.HORSES },
    };
  });
  fs.mkdirSync(path.join(out, 'traces'), { recursive: true });
  fs.writeFileSync(path.join(out, 'track.json'), JSON.stringify(meta.track));
  fs.writeFileSync(path.join(out, 'course.json'), JSON.stringify(meta.course, null, 1));
  const index = [];
  for (const sc of SCEN) {
    const res = await page.evaluate(async (sc) => {
      const cr = window.__cr, S = cr.settings;
      S.horse = sc.horse; cr.setLevel(sc.level); S.pace = 'seat'; S.control = 'pad'; S.sound = false; S.haptics = false;
      window.__freeze = true;
      cr.setRng(mulberry32(sc.seed));
      window.__bot = makeBot(sc.bot, cr, sc.seed);
      await cr.startRide();
      const st = cr.st, rows = [], events = []; let n = 0, mode = st.mode, logN = 0;
      const r4 = x => Math.round(x * 1e4) / 1e4;
      while (cr.running && n < 120 * 150) {
        cr.step(1 / 120); n++;
        if (st.mode !== mode) { events.push({ step: n, t: r4(n / 120), type: 'mode', from: mode, to: st.mode, s: r4(st.s) }); mode = st.mode; }
        if (st.log.length > logN) { for (const e of st.log.slice(logN)) events.push({ step: n, t: r4(n / 120), type: 'fence', n: e.n, result: e.result, d: e.d == null ? null : r4(e.d), notes: e.notes }); logN = st.log.length; }
        if (n % 12 === 0) rows.push([n, r4(st.s), r4(st.L), r4(st.phase), st.mode, st.lead, r4(st.latDem), r4(st.foreDem), r4(st.latAct), r4(st.foreAct), r4(st.S), st.stage, st.faults, r4(st.conf), r4(st.time)]);
      }
      window.__bot = null; cr.setRng(null); window.__freeze = false;
      const tf = st.elim ? 0 : Math.max(0, Math.ceil(st.time - cr.timeAllowed - 1e-9));
      return { steps: n, summary: { elim: st.elim || null, faults: st.faults, timeFaults: tf, time: r4(st.time), refusals: st.refusals }, columns: ['step', 's', 'L', 'phase', 'mode', 'lead', 'latDem', 'foreDem', 'latAct', 'foreAct', 'S', 'stage', 'faults', 'conf', 'time'], rows, events };
    }, sc);
    const name = `${sc.horse}_L${sc.level}_${sc.bot}_seed${sc.seed}.json`;
    fs.writeFileSync(path.join(out, 'traces', name), JSON.stringify({ scenario: sc, ...res }));
    index.push({ file: 'traces/' + name, ...sc, ...res.summary });
    await page.evaluate(() => { document.getElementById('results').classList.add('hidden'); });
  }
  fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 1));
  console.log(index.map(i => `${i.horse} L${i.level} ${i.bot} s${i.seed}: ${i.elim || (i.faults + i.timeFaults) + ' faults'} ${i.time}s`).join('\n'), '\nERRORS', errs);
  await browser.close();
})();
