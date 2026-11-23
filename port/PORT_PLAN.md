# EqSim port plan: EqSimPoC (three.js) to Unity 6

## Goal

Rebuild the EqSimPoC prototype in Unity 6 as a mobile-first project that can grow into the full game. The
first target is **parity**: the same ride simulation (proven by seeded golden runs), then the same ride
experience, then the same hub. Art and new features come after parity.

## Principles

1. **Simulation first, and proven.** Port the ride simulation as pure C# and make the golden parity tests
   pass before building any 3D ride scene on top of it.
2. **Split the simulation from what you see.** The simulation knows nothing about Unity. Views, cameras, HUD
   and audio read its state and react to its events.
3. **Rebuild scenes from data and Editor scripts.** Use the baked track table, the course JSON and the hub
   layout, so changes stay reviewable and scenes can be regenerated.
4. **Testable by URL from day one.** A Unity Web build goes to GitHub Pages on every milestone.
5. **Keep the PoC alive.** It stays the reference until Unity reaches parity, and is the place to try
   simulation tuning first if that is quicker.

## Repositories

- **`jt3d/EqSimPoC`** (existing): the prototype, plus `port/` (this collateral). It is read-only for the port.
- **`jt3d/EqSim`** (new): the Unity project. Make it public if Web test builds are hosted on GitHub Pages for
  free; Pages on a private repo needs GitHub Pro.

## M0: stand up the repository and project

1. Clone `EqSimPoC`. Create `EqSim` (`gh repo create jt3d/EqSim --public --clone`).
2. Create the Unity project **in the EqSim folder**, using the current Unity 6 LTS installed in Unity Hub and
   the **Universal 3D** template (URP). The owner can do this in the Hub in a minute. Alternatively, run
   `Unity -batchmode -createProject <path> -quit`, then add URP through `Packages/manifest.json` and an
   Editor script that creates and assigns the URP asset.
3. Add packages: `com.unity.inputsystem` (set Active Input Handling to the new system), `com.unity.cinemachine`
   (3.x), `com.unity.splines`, `com.unity.nuget.newtonsoft-json`, `com.unity.test-framework`.
4. Add Unity's standard `.gitignore` and Git LFS (`.gitattributes` for fbx, png, psd, wav, ogg, mp3).
5. Copy `EqSimPoC/port/` to `Docs/Port/` and `port/CLAUDE.md` to the repo root. Ask the owner for the design
   document export (Markdown) and put it in `Docs/Design/`.
6. Create the folder layout and assembly definitions from `CLAUDE.md`. In `EqSim.Sim`, turn on No Engine
   References. Copy `golden/track.json` and `golden/course.json` to `Assets/_Project/Data/`.
7. `EqSim.Editor.BuildScript.BuildWeb` builds to `Builds/Web` with Decompression Fallback on and Brotli or
   Gzip compression. Deploy that folder to GitHub Pages: a `gh-pages` branch pushed by a script, or the
   GitHub Actions "deploy pages" workflow uploading the built folder. CI cannot build Unity without a
   licence, so build locally and let CI publish.

**Acceptance:** the project opens cleanly, and an empty test scene loads from the Pages URL on an iPhone
(Safari 15 or newer) and on Android Chrome.

## M1: simulation core and parity tests

Port the simulation in `reference/poc_index.html` as described in `SIM_SPEC.md`.

Suggested types in `EqSim.Sim`:

- `SimConstants`; `HorseDef`; `Assists` (five booleans); `PaceMode { Seat, Buttons }`.
- `Track`: loaded from `track.json`. Provides `K` as `float[]`, `TIdx(s)` and `At(s)` returning
  position, tangent and curvature.
- `Course`: fences, `StartS`, `FinishS`, `TimeAllowed`, horses. Loaded from `course.json` with Newtonsoft
  in the tests and through a small loader at runtime.
- `IRng`, `Mulberry32`, `SystemRng`.
- `RideInput { Lat, Fore, Collect, Extend }`.
- `RideState`: every field of the PoC's `st`, with the same names in PascalCase.
- `RideSim`:
  - `Reset(horse, assists, paceMode, rng)` and `Step(dt, in RideInput)`, which calls an optional
    `Action<RideSim>` bot hook after reading input.
  - `Tap()`; `Running`; `Results`.
  - `Events`: a list cleared on each step, or C# events: `Beat(index, accent)`, `StrideEnd`,
    `TakeOff(fence, d, how)`, `Knock(fence, backRail)`, `Land(fence, result)`, `Refusal`, `StageUp`,
    `Fall(cause)`, `TimeStarted`, `Finish`, `Toast(text, kind)`.
- Feedback strings (notes, toasts) live in the simulation with the PoC's exact text, so the PoC's he/she
  replacement (`pron()`) can run in the presentation layer.

Tests in `EqSim.Tests` (see `PARITY.md`):

- Sanity unit tests.
- **Golden trace parity** for all 30 traces in `golden/index.json`.
- Statistical check against `golden/stats.json` (seeds 1–30).
- Bots ported from `reference/bots.js`.

**Acceptance:** all golden traces match within tolerance and the statistical counts match. Anything that
does not match is explained in `QUIRKS.md`.

## M2: ride scene at PoC parity

1. **Course scene builder** (`Tools > EqSim > Build Ride Scene`):
   - Arena (76 × 51 m sand, white rails).
   - A spline through the track `P[]` samples, for the visual path and guides only (the simulation uses the
     table).
   - Fences built from `course.json`: wings, striped poles, separate top rails for knockdowns, number
     boards, the ideal-zone strip.
   - Start and finish flags.
2. **Horse and rider views.** At first, mirror the PoC's primitive horse and rider, including the leg-phase
   tables for left and right lead, body bob and bank, the jump pose, and the rider's lean, fold and slip.
   Later swap in a rigged horse asset whose animation speed follows `STRIDE_HZ`.
3. **Cameras (Cinemachine 3).**
   - Chase cam 7.5 m behind and 3.4 m up, looking 5 m ahead.
   - Rider's-eye cam at body height plus 1.3 m, 0.35 m back, looking 12 m ahead at 0.9 m height.
   - The horizon stays locked; tilt never rolls the camera.
4. **Input (Input System).**
   - Tilt: enable `GravitySensor` (or `AttitudeSensor`). Take "up" as the negated, normalised gravity
     vector in screen space; Input System's `compensateForScreenOrientation` handles rotation.
     `lat = −atan2(x, hypot(y, z))`, `pitch = atan2(y, z)`. Calibrate neutral, scale by `TILT_DEG`, and keep
     the Invert toggles.
   - **Verify the signs on a device** with a live preview dot, as in the PoC menu.
   - An on-screen stick for the thumb pad. Keyboard and gamepad. Tap anywhere, or only the right 65% of the
     screen in thumb-pad mode.
5. **HUD (UI Toolkit).**
   - Top: fence number, time and time allowed, faults, lead with a wrong-lead warning, confidence bar,
     pause, view toggle.
   - Bottom: the balance gauge (zone ellipse at the demand, white dot at the actual position, security rim,
     stage text) and the beat gauge (three beats, suspension window, phase cursor, stride length bar).
   - Toasts.
   - Results: headline, stats table, per-fence table, tip.
6. **Feedback.** Hoofbeats on beat events, thuds, and haptics (`Handheld.Vibrate` as a placeholder).
7. **Ghost.** Record `(time, s, lift)` at 20 Hz; save the best per horse as JSON in
   `Application.persistentDataPath`; play it back as a translucent horse.

**Acceptance:**
- A PlayMode test rides a full round with the perfect bot and finishes.
- A side-by-side manual check against the PoC shows the same course, timings and feedback.
- 60 fps target on a mid-range phone (30 fps minimum).

## M3: look

- A URP toon ramp in Shader Graph: three bands with soft edges, 0.42 / 0.72 / 1.0 at 0.38 and 0.70, with
  0.08 softness. A violet hemisphere fill tints the shadows.
- A painted sky gradient (horizon #F7EAD0, mid #9FD0F3, top #4F9FE3), blob cumulus clouds, and blue
  distance fog (#C4DCEC, 60–210 m).
- GPU-instanced grass, about 28,000 blades with wind sway (root #3E6E2C, tip #C2DC72) and a quality slider.
- Inverted-hull outlines on the horse, rider and people only.

**Acceptance:** screenshots match the PoC's mood; the performance budget holds.

## M4: yard hub

Port the hub described in the design document and implemented in the PoC (the "stable yard hub" section of
`poc_index.html`):

- Splash: a drone orbit with Career, Practice and My Yard (disabled teaser).
- Overhead 3/4 view with pulsing pick glows and screen-space labels for places.
- Double-zoom navigation: place, then object, with a large back arrow at the top left.
- Barn, tack room and office interiors behind doors that creak and fade.
- The barn: the rideable horses face out with stall-door signs; the others are turned away eating or
  drinking, with occasional droppings.
- Tack room colour choices (helmet, saddle pad, jacket) and "You don't have any saddles yet".
- Office jobs with spinning coins.
- Notice board flyers. Limited events apply assist overrides for that ride.
- Menage stations showing the lesson tier ladders, and the course with practice settings.
- Use one Cinemachine camera per view with blends, and keep layouts data-driven (a ScriptableObject per
  place).

**Acceptance:** every PoC hub path works, including riding a limited event and returning to the yard.

## M5: audio, settings, persistence

- Music: use Pixabay or Incompetech placeholders, and record every track in `CREDITS.md`. Tempos follow the
  design document.
- Settings persist (controls, pace mode, realism and assists, guides, sound, haptics, inverts, view, kit,
  horse).
- Pause and resume.

## After parity: the design backlog

Lessons (tier presets built on the balance model), stable jobs and the money economy, art assets (horse
model and animation), and further disciplines. Use the design document as the guide, and only change the
simulation with the parity process in `PARITY.md`.

## Risks to watch

- **Sensor axes differ by platform.** Calibrate and verify on both iOS and Android, and keep the invert
  toggles.
- **Web build size and load time on mobile.** Strip engine code, compress, and keep textures small.
- **Horse animation quality.** Evaluate a rigged horse asset early (it is the project's biggest risk) and
  drive it from the stride clock.
- **Floating-point differences** between V8 and .NET in transcendental functions could cause rare
  divergence late in a trace. `PARITY.md` defines how to judge this.
