// Seeded statistical baseline from the PoC: seeds 1..N for every horse/level/bot combination.
// Usage: node export_stats.cjs <url-of-index.html> <outfile> [N=30]
const fs = require('fs'), path = require('path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright-core');
const url = process.argv[2], outFile = process.argv[3], N = +(process.argv[4] || 30);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await browser.newPage(); await page.goto(url); await page.waitForTimeout(1500);
  await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, 'bots.js'), 'utf8') });
  const out = [];
  for (const horse of ['schoolmaster', 'youngster', 'mare']) for (const [level, bot] of [[0, 'none'], [1, 'none'], [3, 'perfect'], [5, 'perfect'], [5, 'human']]) {
    const runs = await page.evaluate(async ({ horse, level, bot, N }) => {
      const cr = window.__cr, S = cr.settings, res = [];
      for (let seed = 1; seed <= N; seed++) {
        S.horse = horse; cr.setLevel(level); S.pace = 'seat'; S.control = 'pad'; S.sound = false; S.haptics = false;
        window.__freeze = true; cr.setRng(mulberry32(seed)); window.__bot = makeBot(bot, cr, seed);
        await cr.startRide(); let n = 0; while (cr.running && n < 120 * 150) { cr.step(1 / 120); n++; }
        const st = cr.st, tf = st.elim ? 0 : Math.max(0, Math.ceil(st.time - cr.timeAllowed - 1e-9));
        res.push({ seed, elim: st.elim || null, faults: st.faults, timeFaults: tf, time: Math.round(st.time * 1e4) / 1e4 });
        document.getElementById('results').classList.add('hidden');
      }
      window.__bot = null; cr.setRng(null); return res;
    }, { horse, level, bot, N });
    const clear = runs.filter(r => !r.elim && r.faults + r.timeFaults === 0).length;
    out.push({ horse, level, bot, seeds: N, clear, falls: runs.filter(r => r.elim === 'Fall').length, refusalElims: runs.filter(r => r.elim === 'Second refusal').length, meanFaults: +(runs.filter(r => !r.elim).reduce((a, r) => a + r.faults + r.timeFaults, 0) / Math.max(1, runs.filter(r => !r.elim).length)).toFixed(3), runs });
    console.log(horse, level, bot, 'clear', clear, '/', N, 'falls', out.at(-1).falls);
  }
  fs.writeFileSync(outFile, JSON.stringify(out, null, 1)); await browser.close();
})();
