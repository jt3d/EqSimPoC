# Known prototype quirks (kept for parity)

Port these as they are. Fix them only after parity, as a deliberate design change that regenerates the
golden data.

| Where | Behaviour | Note |
| --- | --- | --- |
| `step` | The clock keeps running during a refusal and the re-approach | Real showjumping handles this differently; review with the rules pass |
| `refuseStep` | The re-approach starts 24 m before the fence, or 4 m after the last fence that was jumped | Can be a short run-up on tight lines |
| `onStrideEnd` | A take-off request with `dNow > 4.0` is ignored (toast "too early") and does not carry to the next stride | Intentional |
| `onStrideEnd` | Assisted take-off can still set `req` while the confidence refusal check runs | Assisted riders can still be refused when confidence is low |
| `balanceStep` | In seat-pace mode on the flat, forward/back has no error (`foreFree`) | Resolves the dual use of the forward axis; see the design document risks |
| `takeOff` | The "jumped ahead" threshold is 1.05 in seat-pace mode, otherwise 0.8 | Because a pace lean can legitimately reach 1.0 |
| `leadNeedAt` | Lead need comes from the curvature sign alone, threshold `1/22` | Ignores fences between the rider and the turn |
| `land` | Without the leads assist, landing lead follows the average lean in the air (beyond ±0.25), otherwise unchanged | |
| `rideStep` | The speed cap in turns uses `tan(34°)` and a 10 m look-ahead | Can shorten strides before fences that come after a turn |
| `track.K` | Stored as `Float32Array` | Mirror it as `float[]` |
