# Bobby Fighter

### ▶ [Play it](https://tbatch92.github.io/bobby-fighter/)

A Street Fighter–style fighting game about cats, in the browser. Play as **Bobby** — white,
dark tabby patches over one eye and one ear, ringed tail — and fight your way through five
increasingly unreasonable challengers.

There are no image assets in this project. Every cat, every stage and every sound is generated
in code. The [cat lab](https://tbatch92.github.io/bobby-fighter/lab.html) shows what that means:
every fighter, in every pose, drawn from one skeleton and a palette. The
[stage lab](https://tbatch92.github.io/bobby-fighter/stages.html) does the same for the six
locations, panning each across its full width.

```bash
npm install
npm run dev      # http://localhost:5173
```

## Controls

| | |
|---|---|
| Move | `←` `→` |
| Jump / crouch | `↑` / `↓` |
| Light / heavy paw | `A` / `S` |
| Light / heavy kick | `Z` / `X` |
| Special | `D`, or quarter-circle-forward + any attack |
| Super (full meter) | `C` |
| Block | hold away from your opponent |
| Dash | double-tap `←` or `→` |
| Hitbox overlay / mute | `F1` / `M` |

Blocking is directional: hold back to block high, hold down-back to block low. Sweeps and toe
pokes must be blocked crouching; jump-ins must be blocked standing.

## The roster

| Cat | Style | Special |
|---|---|---|
| **Bobby** | all-rounder | *Hairball Hurl* — projectile |
| **Mochi** | rushdown, fast, light | *Pounce* — dash-in overhead |
| **Duchess** | zoner, floaty | *Fur Storm* — slow drifting cloud |
| **Shadow** | mixups | *Night Warp* — invulnerable phase-through |
| **Meatball** | heavyweight, armoured | *Belly Flop* — jumping ground pound |
| **Sgt. Whiskers** | boss | *Claw Uppercut* — invulnerable anti-air |

## How it's built

Two decisions shape everything else.

**The simulation runs at a fixed 60Hz and never sees wall-clock time.** `core/loop.ts` advances
the sim in exact 1/60s ticks and interpolates rendering between them, so every timing value in
the game is an integer frame count and a match plays identically on a 60Hz laptop and a 144Hz
monitor. It also makes the sim a pure function of (seed, inputs), which `tests/determinism.test.ts`
depends on.

**Moves are data, not code.** A move is a plain object — startup, active and recovery frames,
hitbox rects keyed to frame ranges, damage, hitstun, blockstun, knockback, cancel list — built
through `defineMove()` in `sim/moves.ts`. Rebalancing a character never means touching the engine.

```
src/
  core/     fixed-timestep loop, buffered input with motion recognition, maths, seeded RNG
  sim/      fighter state machine, frame-data move system, collision, projectiles, rounds
  ai/       utility-scored CPU
  render/   the procedural cat rig, pose animation, stages, HUD, particles, camera
  data/     the roster
  scenes/   title, versus, fight, results
  audio/    WebAudio-synthesised impacts and cat voices
```

### The cats

Every fighter is drawn from one skeleton (`render/catRig.ts`): a bipedal cat posed by joint
angles and painted with a palette. Body shapes are built from Catmull-Rom curves so the cats read
as soft rather than as a pile of rectangles, and the tail is a spring chain rather than a
keyframed limb — it lags behind the body and overshoots on direction changes, which is the
cheapest single thing that makes the whole rig read as a cat.

Adding a fighter costs one data object in `data/roster.ts`: a palette, some body proportions, a
few stat tweaks and one signature special. The twelve normals, the hurtboxes and all the
animation are generated from shared definitions.

### The stages

Six of them, also drawn in code, as parallax layers over a floor. Two are built from
photographs of the real places: the **kitchen**, with the cat flap in the back door, and the
**back yard** — white-painted brick, a raised bed behind a red-brick coping, bamboo, lavender,
and a path of granite setts running through pale gravel.

Landmarks use `anchoredLayer()` rather than `layer()`. A plain parallax layer is displaced by a
fraction of the camera position, which is invisible for something that repeats across the whole
width like a fence, and ruinous for a single door — it lands hundreds of pixels from where it was
written. `anchoredLayer` cancels that displacement at the stage centre, so a landmark authored at
`STAGE_W / 2` appears there while still parallaxing as the camera travels.

Attacks are **not** keyframed frame by frame. Each one is described by two poses — a windup and a
strike — which `render/poses.ts` stretches across whatever startup/active/recovery the move data
specifies. A 4-frame jab and an 11-frame roundhouse both animate correctly with no extra
authoring, and rebalancing frame data can never desynchronise the artwork from the hitboxes.

### The CPU

`ai/cpu.ts` scores candidate actions against the situation and the character's personality, then
commits to the winner for a few frames — a CPU that re-decides every frame twitches in place and
never reads as a fighter with intent. Difficulty adjusts only how many frames late the CPU sees
the world and how reliably it blocks; it never gets extra damage or takes less. Players can feel
the difference between "this one is slow" and "this one cheats", and only the first is fun to beat.

## Development

```bash
npm test         # 28 tests: determinism, frame-data sanity, combat behaviour
npm run typecheck
```

`http://localhost:5173/lab.html` is the **cat lab** — every cat parked in every important pose at
a readable size. Tuning a procedural character by playing the game is hopeless, because the
interesting frames go by in a sixth of a second. `http://localhost:5173/stages.html` is the
**stage lab**, the same idea for backgrounds: all six locations side by side, each panning across
its full width so the parallax and the parts off-screen at neutral are both visible.

Pushing to `main` typechecks, tests and deploys to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). A failing test blocks the deploy.

`F1` in-game draws hitboxes (red), hurtboxes (blue), pushboxes (green) and the current move's
frame counter. In dev builds `window.bobby` exposes the running game for poking at from the
console.

The test suite is worth a word. `determinism.test.ts` is the one that protects everything else:
if the same inputs stop producing the same match, frame data means nothing and a reported bug
can't be reproduced. It's also a cheap tripwire for accidental `Math.random()` in `sim/`.
`frameData.test.ts` catches the kind of typo that produces a move which either never hits or is
unbeatable — including the rule that no move may be both plus on block and deal chip damage,
which would loop into a guaranteed kill.
