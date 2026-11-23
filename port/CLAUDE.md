# EqSim — Unity project instructions for Claude Code

EqSim is a sim-leaning, mobile-first equestrian career game. You ride a showjumping course on rails: the
player balances by tilting the phone and gives timed aids by tapping. The game is a Unity 6 port of a
working web prototype, **EqSimPoC**. That prototype is the reference implementation, and the simulation must
match it.

- Prototype repo: https://github.com/jt3d/EqSimPoC (playable: https://jt3d.github.io/EqSimPoC/)
- Port collateral (plan, spec, parity data): `Docs/Port/` in this repo, copied from `EqSimPoC/port/`
- Design document: `Docs/Design/` (Markdown export of the design doc; the owner keeps the live copy)

Read `Docs/Port/PORT_PLAN.md` before starting work. It defines the milestones and acceptance criteria.

## Golden rules

1. **The PoC is normative for simulation behaviour.** If this repo and `Docs/Port/reference/poc_index.html`
   disagree about how the ride simulation behaves, the PoC wins. `SIM_SPEC.md` summarises it, but the code is
   the final word.
2. **The simulation is pure C#.** Everything under `Assets/_Project/Scripts/Sim/` is in the `EqSim.Sim`
   assembly with *No Engine References* enabled. It uses no `UnityEngine` types and no `Time.deltaTime`, and
   uses `double` throughout (JavaScript numbers are doubles). The exception is the track curvature table,
   which is `float` because the PoC stores it in a `Float32Array`.
3. **Fixed step.** The simulation advances in fixed steps of 1/120 s. Presentation interpolates; it never
   changes the step.
4. **All simulation randomness goes through the injected `IRng`, in the same call order as the PoC** (see
   `SIM_SPEC.md`, "Randomness"). Visual-only randomness uses `UnityEngine.Random` and never touches `IRng`.
5. **Parity tests must stay green.** Do not change simulation constants or rules to "improve" the game while
   porting. Tuning changes come after parity is reached, behind a clear commit, and the golden data is
   regenerated from an updated PoC (see `PARITY.md`).
6. **Presentation only reads simulation state.** It reacts to simulation events (beats, take-off, knock,
   landing, refusal, fall, finish, toasts). It never writes simulation state except through the input struct
   and `Tap()`.
7. **JavaScript semantics to watch:**
   - `Math.round(x)` rounds .5 towards +∞. Use `Math.Floor(x + 0.5)`, not `Math.Round`, which uses banker's
     rounding.
   - `Math.sign(0)` is 0.
   - `a || b` falls back on 0, null or empty values.
   - `%` on negative numbers keeps the sign of the dividend in both languages.

## Project layout

```
Assets/_Project/
  Scripts/Sim/        EqSim.Sim          pure C# ride simulation (no engine refs)
  Scripts/Runtime/    EqSim.Runtime      MonoBehaviours: views, input, cameras, HUD, hub
  Scripts/Editor/     EqSim.Editor       scene/prefab builders, build script, menu items
  Tests/EditMode/     EqSim.Tests        NUnit tests incl. golden parity (refs Sim + Newtonsoft)
  Tests/PlayMode/     EqSim.PlayTests    smoke tests (full round with a bot, hub navigation)
  Data/               track.json, course.json (TextAssets used at runtime)
Docs/Port/            PORT_PLAN.md, SIM_SPEC.md, PARITY.md, reference/, golden/
Docs/Design/          design document export
```

## Commands

Use the Unity version pinned in `ProjectSettings/ProjectVersion.txt`. Replace `$UNITY` with that editor's
executable path.

```bash
# EditMode tests, including golden parity
"$UNITY" -batchmode -nographics -projectPath . -runTests -testPlatform EditMode \
  -testResults Logs/editmode.xml -logFile Logs/editmode.log

# PlayMode smoke tests
"$UNITY" -batchmode -projectPath . -runTests -testPlatform PlayMode \
  -testResults Logs/playmode.xml -logFile Logs/playmode.log

# Web build (Decompression Fallback on, for GitHub Pages) into Builds/Web
"$UNITY" -batchmode -nographics -quit -projectPath . \
  -executeMethod EqSim.Editor.BuildScript.BuildWeb -logFile Logs/build.log
```

Close the Editor before running batch mode on the same project. After a test run, read the results XML and
report the failures. Do not just say that tests failed.

## Conventions

- British English in all player-facing text (colour, centre, practise as a verb). Player-facing copy avoids
  contractions.
- Namespaces: `EqSim.Sim`, `EqSim.Runtime`, `EqSim.Editor`, `EqSim.Tests`.
- Each simulation class keeps the PoC's names for its fields and functions (`st.S`, `foreDem`,
  `onStrideEnd`…), written in C# style (`S`, `ForeDem`, `OnStrideEnd`), so the two can be diffed by eye.
- Scenes are built by Editor scripts (`Tools > EqSim > Build …`) so they can be rebuilt without manual work.
  Generated scenes are committed.
- Every third-party asset and music track goes in `CREDITS.md` with its licence and URL.
- Git LFS for `*.fbx, *.png, *.psd, *.wav, *.ogg, *.mp3`. Unity's standard `.gitignore`.

## When unsure

- About a behaviour: check `Docs/Port/reference/poc_index.html`, then ask.
- About design intent (lessons, hub, competitions): check `Docs/Design/`, then ask.
- Never "fix" an apparent PoC quirk silently. List it in `Docs/Port/QUIRKS.md` and ask.
