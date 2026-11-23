# Ride simulation specification

This summarises the ride simulation in the EqSimPoC prototype (`reference/poc_index.html`, the
`// ---- simulation` section and the helpers it calls). **The PoC code is normative.** Where this spec is
ambiguous or wrong, follow the code and log the gap in `QUIRKS.md`.

## Units and frames

- Distances in metres, time in seconds, speeds in m/s. Fixed step `dt = 1/120`.
- The track is a 2D path on the ground plane (x, z). `s` is arc length along it.
- Curvature `k > 0` means a left turn. Lateral values are positive to the right.
- `fore` is positive forward (fold), negative back (sit up and back).

## Constants

| Name | Value | Meaning |
| --- | --- | --- |
| `G` | 9.81 | gravity |
| `STRIDE_HZ` | 1.65 | canter strides per second (about 99 per minute) |
| `L_MIN`, `L_WORK`, `L_MAX` | 3.1, 3.6, 4.1 | stride lengths (m) |
| `SPEED_MPM` | 325 | metres per minute used for the time allowed |
| `TILT_DEG` | 18 | phone tilt for a full lean of 1.0 (input only) |
| `LEAN_REF` | 30° in radians | body lean that equals 1.0 on the balance gauge |
| `ZONE` | 0.45 | ideal take-off zone, ± metres around `fence.ideal` |

The horse definitions are in `golden/course.json` → `horses`. Fields: `scope, bold, care, resp, spook,
forgive, jab`. The `name`, `she`, `desc` and `colour` fields are presentation only.

## Track and course

- Use the **baked track table** in `golden/track.json`; do not rebuild the curve. It holds `N`, `step`
  (≈0.25 m), `length`, `P[i] = [x, z]`, `T[i] = [tx, tz]` (unit tangent), and `K[i]` (curvature, **float32**).
- `tIdx(s) = clamp(jsRound(s / step), 0, N)`, where `jsRound(x) = Math.Floor(x + 0.5)`.
- `trackAt(s)`: `f = clamp(s / step, 0, N - 1e-6)`, `i = floor(f)`, `r = f - i`. P and T are lerped (T
  renormalised), and K is lerped as `K[i]·(1−r) + K[i+1]·r`, computed in double from the float values.
- Fences: use `course.json → fences` exactly (`n, type, h, spread, s, front, back, ideal`). Vertical:
  `ideal = 2.0`, oxer: `1.8`. `front = s − spread/2`, `back = s + spread/2`.
- `startS`, `finishS` and `timeAllowed` (42 s) are also in `course.json`.

## State (`st`), reset at the start of each ride (`resetRun`)

`mode='ride', s=0, L=3.6, Ltarget=3.6, chipLen=0, phase=0.5, lead='L', disunited=0, conf=1, faults=0,
refusals=0, time=0, timing=false, finished=false, endT=0, req=false, leadReq=null, jump=null, landT=0,
refuse=null, cause=null, lat=0, fore=0, latAct=0, foreAct=0, latDem=0, foreDem=0.15, tolL=0.22,
tolF=0.65, foreFree=false, S=0, stage=0, wob={t:0, p1:rng()*6, p2:rng()*6, burst:0}, spook=null,
log=[], elim=null, flags={chip:false}, v=3.6*1.65`. All fences `done=false`.

The `wob.p1` and `wob.p2` draws are the **first two `rng()` calls** of every ride.

## Per-step order (`step(dt)`)

1. `readInput`: `lat`/`fore` from the stick or tilt (with keyboard smoothing), clamped to ±1.3. **Then the bot
   hook runs** (tests only) and may overwrite `st.lat`/`st.fore` or call `Tap()`.
2. `A = curAssists()`. These are the per-channel assists (`balance, seat, takeoff, pace, leads`), merged with
   the ride override for limited events.
3. Mode step: `ride → rideStep`, `jump → jumpStep`, `refuse → refuseStep`, `fallen → fallStep`,
   `done → doneStep`.
4. If the mode is now `ride` or `jump`, run `balanceStep(dt, A)`. Use the mode **after** step 3: a take-off
   this step means the balance update runs in jump mode.
5. Visual rail physics (presentation only).
6. If `timing` and not `finished`, add `dt` to `time` (ghost recording is presentation).
7. If not timing and `s ≥ startS` and mode is not `fallen`: set `timing = true` and `time = 0`.
8. If not finished and timing and `s ≥ finishS` and mode is `ride`: `finishRun()` sets `finished = true`,
   `mode = 'done'` and `endT = 0`.

## rideStep

- `kmax` = max of `|K[tIdx(s + d)]|` for `d = 0, 2, 4, 6, 8, 10`. If `kmax > 1e-3`,
  `vmax = sqrt(G·tan(34°)/kmax)`; otherwise `vmax = 99`.
- Target stride:
  - pace assisted → `paceAssistTarget()`
  - else buttons mode → `L_MIN` if collect is held, `L_MAX` if extend is held, otherwise `L_WORK`
  - else seat mode → `f = dz(fore, 0.15)`. If `f ≥ 0`, `L_WORK + f·0.5`; otherwise `L_WORK + f·0.5`.
    `dz` is a dead zone that rescales: `|x| < d ? 0 : (x − sign(x)·d)/(1 − d)`.
- If `leadWrong()`, subtract 0.25. Then `target = clamp(min(target, vmax/STRIDE_HZ), 2.6, L_MAX)`.
- `L += (target − L)·min(1, dt·2.2·horse.resp)`. `Lnow = chipLen || L`. `v = Lnow·STRIDE_HZ`. `s += v·dt`.
- `phase += STRIDE_HZ·dt`. Beat events fire when phase crosses 0.22 (second beat) and 0.44 (third beat:
  accent, haptic), and at stride end (first beat).
- `disunited` and `landT` count down.
- **Spook** (rng): if `horse.spook > 0`, there is no active spook, and `rng() < spook·dt`, then
  `spook = {t: 0.6, dir: rng() < 0.5 ? −1 : 1}`. The second `rng()` happens only when the first one succeeds.
- If `phase ≥ 1`: `phase −= 1`, then `onStrideEnd(A)`.

## paceAssistTarget

Let `f = nextFence()`. If there is none, or `f.front − s > 30`, or `f.front − s < 0.5`, return `L_WORK`.
Otherwise `D = f.front − f.ideal − (s + L·(1 − phase))`. If `D < 1.5`, return `L`. Otherwise
`n = max(1, jsRound(D/L_WORK))` and return `clamp(D/n, L_MIN, L_MAX)`.

## onStrideEnd

1. `chipLen = 0`.
2. If there is a lead request: flip the lead. If the request was `'late'`, also set `disunited = 1.3`. Clear
   the request.
3. If leads are assisted: `need = upcomingLeadNeed(12)`. If it differs from the current lead, set the lead
   to it.
4. `f = nextFence()`. If there is none: `req = false` and return. Otherwise `dNow = f.front − s` and
   `dNext = dNow − L`.
5. If take-off is assisted and `dNow < 5` and (`|dNow − ideal| ≤ |dNext − ideal|` or `dNext < 0.9`), set
   `req = true`.
6. If `req`: set `req = false`.
   - If `dNow > 4.0`: toast "too early" and fall through to step 7.
   - Else if `dNow > 0.5`: if `conf < 0.35 && rng() < 0.5`, refuse with "lost confidence". Otherwise
     `takeOff(f, dNow, 'asked')`. Return either way.
7. If `dNext < 0.9`:
   - If `dNow > 2.6`: chip in a short stride. `chipLen = clamp(dNow − 1.15, 2.3, 3.3)`,
     `flags.chip = true`, return.
   - Otherwise `go = clamp(bold·conf + forgive − (dNow < 1.1 ? 0.5 : 0), 0, 1)`. If `rng() < go`, then
     `takeOff(f, dNow, 'self')`. Otherwise refuse: "too deep" if `dNow < 1.1`, else "no aid".

## Tap (`onTap`)

Ignored unless riding and not paused, and `mode == 'ride'`.
- If the next fence is within 8.5 m (`f.front − s < 8.5`): if take-off is not assisted, set `req = true`.
  Return either way.
- Otherwise, if leads are not assisted: `leadReq = (0.6 ≤ phase ≤ 0.98) ? 'clean' : 'late'`.

## takeOff(f, d, how)

- `spotErr = d − ideal`. Knock probability starts at
  `p = 0.025 + 0.16·max(0, |spotErr|/ZONE − 1)^1.2`.
- Add to `p`:
  - +0.1 for a vertical with `L > 4.0`.
  - +0.1 for an oxer with `L < 3.2`.
  - +0.1 if `disunited > 0`.
  - `+(latErr − 0.2)·0.4` if `latErr = |latDem − latAct| > 0.2`.
  - If the seat is not assisted and `foreAct` exceeds the limit (1.05 in seat-pace mode with pace not
    assisted, otherwise 0.8): +0.15 and `S += 0.15` ("jumped ahead").
  - If `how == 'self'`: +0.06 and `conf −= 0.05` (floor 0).
  - If `flags.chip`: `S += 0.12` and clear the flag.
  - Scope: `+0.08·(h − 1.1)/0.1` when `h > 1.1` and `scope < 0.85`.
- Then `p *= (1 − forgive·0.5)·(1.3 − care·0.5)`.
- Flight:
  - `landDist = clamp(1.4 + 0.4·d, 1.6, 2.8)`, `s1 = f.back + landDist`.
  - `v = max(5.2, L·STRIDE_HZ)`, `dur = (s1 − s)/v`, `liftMax = h − 0.15`.
  - Set `mode = 'jump'` and clear `req` and `leadReq`.
- Notes, in order, form the feedback text (see the PoC strings).

## jumpStep

- `t += dt`, `s += v·dt`. Lift and pitch follow two quarter-sine halves split at `f.s` (visual; see code).
- `latSum += latAct·dt`.
- Left behind (seat not assisted), checked once at the first step with `t > 0.2`: if
  `foreDem − foreAct > 0.55`, then `p += 0.15`, `conf −= 0.12·jab` (floor 0) and `S += 0.1`.
- Knock (rng), once, at the first step with `s ≥ f.s`: if `rng() < clamp(p, 0.01, 0.95)`, `faults += 4`. The
  rail that falls is the back rail of an oxer if `spotErr > 0` or the rider was left behind, otherwise the
  front rail.
- If `t ≥ dur`, `land()`.

## land

- Set `mode = 'ride'`, `phase = 0`, `landT = 0.5`, `s = s1`, `wob.burst = 0.35`.
- Lead:
  - Leads assisted: `lead = upcomingLeadNeed(16) || lead`.
  - Not assisted: `avg = latSum/dur`. `avg > 0.25` gives `'R'`, `avg < −0.25` gives `'L'`.
- Mark the fence done. If there was no knock, `|spotErr| ≤ ZONE` and the rider was not left behind, then
  `conf = min(1, conf + 0.04)`. Log the result.

## refuse / refuseStep

- `refuse`: `mode = 'refuse'`, `refusals++`, `faults += 4`, `conf −= 0.1` (floor 0), `S += 0.25`. Store
  `{f, t: 0, v: L·STRIDE_HZ}`, clear `req`, `leadReq`, `chipLen` and `flags.chip`, and log it.
- `refuseStep`:
  - `t += dt`, `v = max(0, v0 − 8t)`, `s = min(s + v·dt, f.front − 0.8)`.
  - If `S ≥ 1`, fall.
  - When `t > 1.8`: if `refusals ≥ 2`, eliminate with "Second refusal". Otherwise re-approach:
    `s = max(lastDone ? lastDone.back + 4 : 0, f.front − 24)`, `mode = 'ride'`, `phase = 0.5`, `L = 3.6`,
    `S = min(S, 0.5)`. `lastDone` is the last fence in course order with `done == true`.

## balanceStep(dt, A)

1. `latDem = −atan(v²·k/G)/LEAN_REF`, with `k` from `trackAt(s)`.
2. Wobble amplitude `amp` is the sum of: 0.4 if disunited; 0.28 if `leadWrong()` while in ride mode; 0.35
   while `wob.burst > 0` (and `burst −= dt`). Then `wob.t += dt` and
   `latDem += amp·(0.6·sin(5.1·t + p1) + 0.4·sin(8.3·t + p2))`.
3. Spook: `latDem += dir·0.75·sin(π·(1 − spook.t/0.6))`, then `spook.t −= dt`; it ends when `spook.t ≤ 0`.
4. Clamp `latDem` to ±1.2.
5. Forward demand and tolerance:
   - jump mode: `foreDem = (t/dur < 0.55) ? 0.9 : 0.55`, `tolF = 0.38`
   - else if `landT > 0`: `foreDem = −0.45`, `tolF = 0.4`, landing
   - else if pace is not assisted and in seat-pace mode: `foreFree = true` (the forward axis is the pace
     control, so it has no error)
   - otherwise `foreDem = 0.15`, `tolF = 0.65`
   - Then `foreDem += 0.06·sin(2π·phase)`.
6. Rider follows input with a first-order lag `k = min(1, dt/0.12)`:
   - `latTarget = A.balance ? latDem : lat + (latDem − lat)·forgive·0.5`
   - `foreTarget = foreDem` if (seat assisted and (jump or landing)), or (seat assisted, not `foreFree` and
     buttons mode), or (seat and pace both assisted). Otherwise
     `foreTarget = fore + (foreDem − fore)·forgive·0.4`.
   - `latAct += (latTarget − latAct)·k`, `foreAct += (foreTarget − foreAct)·k`.
7. Tolerances: `tolL = 0.22`. If `stage ≥ 2`, both `tolL` and `tolF` are multiplied by 0.7.
8. Errors and excess:
   - `eL = latDem − latAct`; `eF = foreFree ? 0 : foreDem − foreAct`.
   - `exL = max(0, |eL| − tolL)`; `exF = max(0, |eF| − tolF)·(landing ? 1.5 : 1)`.
9. Cause (for feedback) when excess > 0. Lateral excess wins ties:
   - lateral: spook, else turn if `|k| > 1/25`, else side
   - forward in jump mode: behind if `eF > 0`, else ahead
   - forward on landing: landing
   - forward otherwise: behind if `eF > 0`, else ahead
10. Security: if excess > 0, `S += ex·1.7·(1 − forgive·0.6)·dt`; otherwise `S = max(0, S − 0.3·dt)`.
11. `slip = sign(eL) || 1`. Stage thresholds on `S`: 0.3, 0.55, 0.8. When the stage rises, toast the
    feedback. If `S ≥ 1`, `fall()`.

## fall / fallStep / eliminate / doneStep

- `fall`: `mode = 'fallen'`, log it with the cause text, keep `hv = v`. Rider ragdoll is presentation.
- `fallStep`: `t += dt`, `hv = max(0, hv − 6·dt)`, `v = hv`, `s += hv·dt`. When `t > 2.2`, eliminate with
  "Fall".
- `eliminate(reason)`: `elim = reason`, `mode = 'done'`, `finished = true`, `endT = 0`.
- `doneStep`: `endT += dt`. While `v > 0`: `v = max(0, v − 3dt)`, `s = min(length − 0.5, s + v·dt)`, and
  `phase = (phase + STRIDE_HZ·dt·min(1, v/4)) % 1`. When `endT > 1.3`, the results are shown and the ride
  stops. Golden runs end on the step where this first happens.

## Helpers

- `nextFence()`: the first fence in course order with `!done && back > s − 0.1`.
- `leadNeedAt(s)`: `k = K[tIdx(s)]`. If `|k| < 1/22`, there is no need; otherwise `k > 0 ? 'L' : 'R'`.
- `leadWrong()`: there is a need at `s` and it differs from the current lead.
- `upcomingLeadNeed(range)`: the first need at `s + d` for `d = 0..range` in whole metres.

## Results

- Time faults: `elim ? 0 : max(0, ceil(time − timeAllowed − 1e-9))`.
- Total = jumping faults + time faults.
- Elimination on a second refusal or a fall.

## Randomness (`rng()` call order)

Only these calls use the simulation RNG, in this order as they occur:

1. `resetRun`: `wob.p1`, then `wob.p2`.
2. `rideStep`: the spook check (only if `horse.spook > 0` and no active spook), then the spook direction
   (only when the check succeeded).
3. `onStrideEnd`: the confidence refusal (only when evaluated: requested, `0.5 < dNow ≤ 4.0` and
   `conf < 0.35`; `&&` short-circuits).
4. `onStrideEnd`: the self take-off decision.
5. `jumpStep`: the knock roll.

The bots' noise uses a **separate** generator (see `PARITY.md`).
