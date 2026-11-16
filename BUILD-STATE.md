# EMBERLINE — Kestrel Yard: BUILD STATE (threejs-fps-01, $1,000)

Updated: 2026-11-17 ~01:40 WITA (build session, after the 01:00 WITA opening).
Repo: `~/workspace/make-fun/threejs-fps/` (local git, 4 commits, HEAD f67d259).
DO NOT start a second parallel build. The morning session continues from here.

## What is DONE
- Full game, all code written in the build session (post-opening) in
  `game/src/`: state.js, world.js (original map "Kestrel Yard": Site A Crane
  Bay, Site B Silo Row, 3 lanes, 64x44 m), weapons.js (5 guns + frag + armor
  + defuse kit), combat.js (analytic ray hits, headshot x3, grenade AoE),
  player.js (accel movement, crouch, slide collision), bots.js (9 bots:
  waypoint graph, LOS 120 deg, hearing, bursts, plant/defuse, reload),
  sim.js (fixed 60 Hz step, buy 14 s / live 100 s / bomb 40 s, first to 5,
  sides swap after round 4), audio.js (synthesized WebAudio, no assets),
  hud.js (health/ammo/timer/score/minimap/kill feed/buy menu), render.js
  (three.js dusk scene, shadows, procedural ground texture, viewmodel,
  tracers, puffs, bot name tags), main.js (loop, input, pointer lock,
  `?shot=1..4` frozen demo cameras for screenshots).
- `main.ts` (entrypoint, stdlib only) + `serve.ts`; `vendor/makefun-threejs.ts`
  copied unchanged (sha256 f9622210…); three.js 0.187.0 byte-for-byte under
  `game/vendor/three/` (sha256 verified vs kit starter); MIT LICENSE.
- Screenshots (real renders, 1280x720 JPEG, each < 64 KiB):
  `screenshots/1-buy.jpg` (buy menu), `2-fight.jpg` (mid-lane firefight,
  tracer + CINDER visible), `3-plant.jpg` (planting at Site A),
  `4-win.jpg` (ROUND WON banner, spike planted at Site B).
- Tests, all passing (run in repo):
  - `node test-sim.mjs` — 400 s headless: 30 kills, 4 rounds ended by
    elimination, score 2-2, bots push/fight/reload.
  - `node test-flows.mjs` — buy ($2700 rifle, $300 frag), plant (4 s),
    fuse 40 s, frag explodes, defuse (5 s) wins the round, rifle hits.
  - `python3 test-playwright.py` — WebGL2 true, menu + deploy work, zero
    console/page errors, 4 screenshots retaken. (Note: the script's
    "hud visible after deploy: False" line is a 500 ms timing flake under
    SwiftShader — the HUD is visible in the screenshots and the phase reads
    BUY PHASE; not a game bug. One screenshot call timed out once and passed
    on retry.)
- `main.ts` run twice -> byte-identical `/output` (diff -r clean).
  Dossier: 410,322 bytes; judge text 99,451 / 163,840 bytes (full source read,
  nothing cut).
- `makefun check` (kit CLI): 4 passed (competition_open, snapshot, license_osi,
  entrypoint). Only failure: transcripts_present (bundle had no usage rows yet
  — see below). At-submission items are for the morning: repo_public,
  repo_owner, repo_created_after_open, commit_in_repo, duplicate_snapshot.
- Bundle REBUILT 2026-11-17 ~06:30 WITA: `~/workspace/make-fun/threejs-fps-bundle.tar.gz`
  (170,556 bytes, sha256 99c037624afbcf58263001b8d24733d8f9395461844c93d377fe594fc9ae4765),
  1 session (94 turns), 1 usage row (agent 78b90592, from muse.db). `makefun check`:
  12 passed, 0 failed — transcripts_present PASS, thinking_reproduces 96.2%
  (2173/2257 lines authored, 0 pasted), thinking_revised PASS. Placeholder bundle
  (0 usage rows) kept as `threejs-fps-bundle-placeholder.tar.gz`. Ready to submit
  once the GitHub repo exists.

## What is NOT done (morning session)
1. **Re-bundle with fresh usage** — DONE 2026-11-17 ~06:30 WITA (see "What is DONE"
   above: 1 usage row, check 12 passed / 0 failed, thinking_reproduces 96.2%).
   Original instructions, kept for reference: the usage rows
   flush to muse.db only when this build turn's messages are delivered.
   In the morning turn, run:
   ```sql
   -- muse.db
   SELECT u.agent_id, u.message_id, u.input_tokens, u.output_tokens,
          u.created_at, a.model
   FROM agent.agent_message_token_usage u
   JOIN agent.agents a ON a.agent_id = u.agent_id
   WHERE u.agent_id = '78b90592-5ffc-41a2-903a-8bb9f06220a3'
   ORDER BY u.created_at ASC
   ```
   Save as one JSON object per line to
   `~/workspace/make-fun/threejs-fps-usage.jsonl`, then:
   ```
   cd ~/workspace/make-fun/kits/threejs-fps-01/threejs-fps-01-kit
   node cli/makefun.mjs bundle --repo /home/hatch/workspace/make-fun/threejs-fps \
     --out /home/hatch/workspace/make-fun/threejs-fps-bundle.tar.gz \
     --session /home/hatch/agents/agent-78b90592-5ffc-41a2-903a-8bb9f06220a3/sessions/78b90592-5ffc-41a2-903a-8bb9f06220a3.jsonl \
     --no-discover --muse-usage /home/hatch/workspace/make-fun/threejs-fps-usage.jsonl
   ```
   Bundle must report >0 usage rows. Then re-run `makefun check --kit . --repo
   <repo> --worktree --transcripts <bundle>` and confirm transcripts_present
   + thinking_reproduces/revised pass.
2. **GitHub upload — needs Prima's approval first (tomorrow morning).**
   Create a NEW public repo under @smrfkeenam-hue AFTER the opening
   (2026-11-16T17:00:00Z) — e.g. `makefun-threejs-fps` — push HEAD, then
   submit via the kit CLI with the bundle + the repo/commit. Max 5/day, 10 total.
3. **Submit** (after 1+2 + Prima's yes). Do not submit the placeholder bundle.
4. Optional polish if time remains before the 24 Nov 01:00 WITA deadline:
   bot grenade use, footstep sounds, round-win slow-mo. None is required.

## Known quirks
- `?shot=` demo mode freezes the sim (frozen tableau) so tracers/banners hold
  for the screenshot; the live game is untouched.
- Bots never use grenades (player-only). Sniper bots exist (WREN sometimes).
- Playwright here is the Python package + headless-shell Chromium
  (SwiftShader WebGL2). `pip install --break-system-packages playwright`.
- Serve for local play: `node serve.ts` -> http://localhost:8080 (or --port).
- Dev test files in repo root (test-sim.mjs, test-bots.mjs, test-flows.mjs,
  test-playwright.py) are NOT part of game/ and do not affect the gate.
