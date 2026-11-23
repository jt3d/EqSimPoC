# Parity testing against the PoC

The Unity simulation is accepted when it reproduces the PoC's seeded golden runs. This file defines the
data, the test procedure and the tolerances.

## Golden data (`golden/`)

| File | Contents |
| --- | --- |
| `track.json` | Baked track table: `N`, `step`, `length`, `P[]`, `T[]`, `K[]` (float32 values) |
| `course.json` | Constants, course points, fence definitions, placed fences, `startS`, `finishS`, `timeAllowed`, horses |
| `index.json` | One entry per golden trace: scenario plus summary (`elim`, `faults`, `timeFaults`, `time`) |
| `traces/*.json` | 30 seeded runs: 3 horses × 5 rider setups × seeds 1 and 2 |
| `stats.json` | Seeds 1–30 for each of the 15 horse/setup combinations: per-run summaries plus clear and fall counts |

Rider setups: level 0 with no input, level 1 with no input, level 3 perfect bot, level 5 perfect bot, level 5
human bot. Levels map to assists in this order:
`ORDER = [balance, seat, takeoff, pace, leads]`, and an assist is on if its index is `≥ level`. All runs
use `pace = 'seat'` and no limited-event override.

### Trace format

```json
{ "scenario": { "horse": "mare", "level": 5, "bot": "human", "seed": 2 },
  "steps": 4860,
  "summary": {"elim": null, "faults": 4, "timeFaults": 0, "time": 37.6, "refusals": 0},
  "columns": ["step","s","L","phase","mode","lead","latDem","foreDem","latAct","foreAct","S","stage","faults","conf","time"],
  "rows": [[12, 0.5905, 3.5617, 0.665, "ride", "L", 0, 0.0984, 0.0104, -0.3028, 0, 0, 0, 1, 0], ...],
  "events": [{"step": 473, "t": 3.9417, "type": "mode", "from": "ride", "to": "jump", "s": 21.9921}, {"step": 565, "t": 4.7083, "type": "mode", "from": "jump", "to": "ride", "s": 26.173}, ...] }
```

- Rows are sampled after every 12th step, so the first row is step 12. Numbers are rounded to 4 decimal
  places.
- Events are recorded after the step in which they happen. `mode` events are logged on any change of
  `st.mode`, and `fence` events whenever `st.log` grows.

## Random number generators

Simulation RNG: **Mulberry32** seeded with the scenario seed and injected before `resetRun`. The JS version
is in `reference/bots.js`; this is the C# equivalent:

```csharp
public sealed class Mulberry32 : IRng
{
    uint a;
    public Mulberry32(uint seed) { a = seed; }
    public double Next()
    {
        unchecked
        {
            a += 0x6D2B79F5u;
            uint t = a;
            t = (t ^ (t >> 15)) * (t | 1u);
            t ^= t + (t ^ (t >> 7)) * (t | 61u);
            return (t ^ (t >> 14)) / 4294967296.0;
        }
    }
}
```

The human bot's noise uses a second, independent Mulberry32 seeded with `seed ^ 0x9E3779B9`.

## Bots

Port `reference/bots.js` exactly, as `EqSim.Tests.Bots`. A bot runs once per step, inside `readInput`, after
the normal input is read and before the mode step. It reads `latDem`/`foreDem` from the **previous** step,
writes `lat`/`fore`, and may call `Tap()`. The PoC test setup has the thumb pad selected with the stick at
rest and no keys held, so the base input is 0.

## Test procedure (EditMode)

For each trace in `index.json`:

1. Load `track.json` and `course.json`. Create the simulation with the horse, the level's assists and
   `pace = Seat`.
2. Inject `new Mulberry32(seed)` **before** reset, then reset (two draws for the wobble phases).
3. Attach the bot, then step with `dt = 1/120` until the ride stops. The ride stops on the step where
   `doneStep` first sees `endT > 1.3`. The PoC caps runs at 18,000 steps.
4. After every step, compare events: the same type, step, mode transition or fence result, and `d` within
   1e-3.
5. After every 12th step, compare the row: discrete fields (`mode`, `lead`, `stage`, `faults`) exactly;
   continuous fields within **2e-4** after rounding to 4 decimal places.
6. Check that the total step count and the summary match.

On the first mismatch, fail with the scenario, step, field, expected and actual values, plus the previous and
next PoC rows. One divergence report is far more useful than thousands.

### Statistical check

Run seeds 1–30 for every combination and compare with `stats.json`. With exact trace parity the clear and
fall counts should be identical. If transcendental-function rounding (V8 versus .NET) causes rare late
divergence, accept counts within ±2 per combination, but investigate any trace that diverges before 20
seconds.

### Sanity unit tests

- `timeAllowed == 42`, and `startS`, `finishS` and the fence `s`/`front`/`back` values equal `course.json`.
- `trackAt` at sample points reproduces `P`, `T` and `K`.
- Speed at `L = 3.6` is 5.94 m/s.
- At level 1 with no input, every horse falls (30/30 in `stats.json`).

## Regenerating golden data

Only regenerate when the PoC's simulation deliberately changes. Requirements: Node 18+, `playwright-core`,
and Google Chrome.

```bash
cd Docs/Port/reference
python3 -m http.server 8765 &                 # serves poc_index.html
# The PoC loads three.js from the jsDelivr CDN; that needs network access, or point the import at a local copy.
node export_golden.cjs http://localhost:8765/poc_index.html ../golden
node export_stats.cjs  http://localhost:8765/poc_index.html ../golden/stats.json 30
```

Set `CHROME=/path/to/chrome` if Chrome is not at `/usr/bin/google-chrome`. Commit the new golden data
together with the PoC change that caused it.
