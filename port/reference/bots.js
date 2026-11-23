// Deterministic test riders used to generate the golden traces. The Unity port must reproduce these exactly
// (see PARITY.md). A bot is called once per fixed step, after normal input is read and before the simulation
// step runs, and may overwrite st.lat / st.fore and call onTap(). st.latDem / st.foreDem still hold the values
// from the previous step's balance update.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function leadNeedAhead(cr, s, range) {
  for (let d = 0; d <= range; d++) {
    const i = Math.min(cr.track.N, Math.max(0, Math.round((s + d) / cr.track.step)));
    const k = cr.track.K[i];
    if (Math.abs(k) >= 1 / 22) return k > 0 ? 'L' : 'R';
  }
  return null;
}
function makeBot(kind, cr, seed) {
  if (kind === 'none') return null;
  const noiseRng = mulberry32((seed ^ 0x9E3779B9) >>> 0);
  const delay = kind === 'human' ? 30 : 0, noise = kind === 'human' ? 0.25 : 0;
  const buf = []; let held = 0;
  return function bot(st) {
    const A = cr.curAssists();
    const f = cr.fences.find(x => !x.done && x.back > st.s - 0.1) || null;
    // side to side: follow the demand (optionally late and noisy)
    let lat = st.latDem;
    if (delay) { buf.push(st.latDem); if (buf.length > delay) held = buf.shift(); lat = held + (noiseRng() - 0.5) * noise; }
    st.lat = lat;
    // forward and back: jump position in the air and on landing, otherwise pace by seat lean
    if (st.mode === 'jump' || st.landT > 0 || A.pace) st.fore = st.foreDem;
    else {
      let target = 3.6;
      if (f && f.front - st.s < 30 && f.front - st.s > 0.5) {
        const D = f.front - f.ideal - (st.s + st.L * (1 - st.phase));
        if (D >= 1.5) { const n = Math.max(1, Math.round(D / 3.6)); target = Math.max(3.1, Math.min(4.1, D / n)); } else target = st.L;
      }
      st.fore = target >= 3.6 ? (target - 3.6) / 0.5 * 0.85 + 0.15 : -((3.6 - target) / 0.5 * 0.85 + 0.15);
    }
    // take-off: tap in the stride whose end is closest to the ideal spot
    if (st.mode === 'ride' && f && f.front - st.s < 8.5 && !st.req) {
      const dEnd = f.front - (st.s + (st.chipLen || st.L) * (1 - st.phase));
      if (Math.abs(dEnd - f.ideal) <= 0.4 && st.phase > 0.3) cr.onTap();
    }
    // flying changes in the moment of suspension, away from fences
    if (st.mode === 'ride' && (!f || f.front - st.s >= 8.5) && st.phase > 0.7 && st.phase < 0.9 && !st.leadReq) {
      const need = leadNeedAhead(cr, st.s, 12);
      if (need && need !== st.lead) cr.onTap();
    }
    // in the air, lean towards the next turn to land on the right lead
    if (st.mode === 'jump') { const need = leadNeedAhead(cr, st.s, 16); if (need) st.lat = st.latDem + (need === 'R' ? 0.18 : -0.18); }
  };
}
if (typeof module !== 'undefined') module.exports = { mulberry32, makeBot, leadNeedAhead };
