# Composing cheatsheet

Beats are integers. `BAR = 16`. Events on the same beat run in written order.
Sequence `0` is always silence. Positions (`low/mid/high`) are -1..1.

## rng
| call | does |
|---|---|
| `rng()` | float 0..1 |
| `rng.chance(p)` | true with prob p |
| `rng.int(a, b)` | integer a..b inclusive |
| `rng.range(a, b)` | float a..b |
| `rng.pick(arr)` | random element |
| `rng.shuffle(arr)` | shuffled copy |

## sched: sequences
| call | does |
|---|---|
| `seq(beat, track, seq)` | play sequence (name or number) |
| `silence(beat, track)` | seq 0 |
| `silenceAll(beat)` | seq 0 on every track |

## sched: mix
| call | does |
|---|---|
| `param(beat, track, p, value, ramp?)` | p = `gain` `pan` `reverb` `low` `mid` `high`; ramp in beats |
| `fadeIn(track, start, beats, seq?)` | gain 0 → track gain, optionally starts seq |
| `fadeOut(track, start, beats)` | ramp to 0, silence, restore gain |
| `eqSweep(track, start, beats, [l,m,h])` | ramp that track's EQ |
| `isolator(start, beats, [l,m,h])` | ramp the MASTER EQ |

## sched: playback
| call | does |
|---|---|
| `stopPoint(beat)` / `stopPoints([..])` | stop snaps back here; gets own seed |
| `end(beat)` | silence all, player stops |

## sched: reading
`events()` · `at(beat)` · `stops` · `endBeat`

## contexts
- `compose({ rng, sched, bpm, subdivision, beatTime })`
- section: `({ s, i, structure, rng, sched })`, `s = { name, start, end }`

## track
`defineTrack({ schema, gain, pan, eq, reverb, seq: {name: n}, mutations: rng => [] })`

## plan (runs first)
`definePiece({ plan: rng => ({...}) })`: result arrives as `plan` in `compose`, section handlers and `track.mutations(rng, plan)`.
Decide shared things there (bar counts, patterns); everyone else only reads.

## fillSlots (engine)
`fillSlots(stepsPerBar, { firstSlot, metaIndex })` → mutations that fill reserved `"a1".."aN"` slots and set the metasequence to the bars used.
Unfilled string slots become `[]`.
