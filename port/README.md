# Port collateral: EqSimPoC to Unity

Everything Claude Code needs to stand up the Unity project and prove it matches this prototype.

| File | Purpose |
| --- | --- |
| `CLAUDE.md` | Project instructions for the new Unity repo; copy it to the repo root |
| `PORT_PLAN.md` | Milestones M0–M5 with acceptance criteria |
| `SIM_SPEC.md` | The ride simulation rules, constants, step order and RNG call order |
| `PARITY.md` | Golden data formats, the parity test procedure and tolerances, and how to regenerate the data |
| `QUIRKS.md` | Known prototype oddities that are kept for parity |
| `reference/poc_index.html` | The prototype source. Normative for simulation behaviour |
| `reference/bots.js` | Deterministic test riders and the Mulberry32 RNG |
| `reference/export_golden.cjs`, `export_stats.cjs` | Regenerate the golden data from the prototype |
| `golden/` | `track.json`, `course.json`, 30 seeded traces, the trace index and `stats.json` |

## Hand-off prompt for Claude Code

> Clone https://github.com/jt3d/EqSimPoC and read `port/README.md`, `port/PORT_PLAN.md` and
> `port/CLAUDE.md`. Create the new repo `jt3d/EqSim` and carry out milestone M0, stopping where you need me
> to create the Unity project in Unity Hub. Then do M1: port the ride simulation to pure C# and make the
> golden parity tests in `PARITY.md` pass. Report the test results and anything you logged in `QUIRKS.md`
> before starting M2.
