# Pilly Minecraft bot

Local Minecraft Java 1.20.4 server and an autonomous TypeScript streamer. Pilly starts from nothing in a fresh survival world. His immediate goals are food, safety, a shelter, tools, and small adventures. Pumpville is a late-game ambition, not an opening house-building quota. Completing a task leads to another decision.

Minecraft and the bot were stopped for this change and have not been restarted. The survival actions are covered by offline tests; the new survival run still needs a live playtest when you choose to start it.

## Start

Requires Node.js 22 or newer, npm, and macOS or Linux. Setup downloads a project-local Java 21 runtime from Adoptium and the official Minecraft server from Mojang, verifying their checksums. No global Java installation is needed.

```sh
npm ci
npm run setup
```

Read the [Minecraft EULA](https://aka.ms/MinecraftEULA). If you accept it:

```sh
npm run setup -- --accept-eula
npm run server
```

Wait for the server to print `Done`. In another terminal:

```sh
npm run bot
```

Use `status` in the bot terminal for position, health, food and inventory. Use `quit` to disconnect. In the server terminal, use `stop` to save the world and shut down.

To watch in Minecraft, launch **Java Edition 1.20.4**, choose Multiplayer → Direct Connection, and join `127.0.0.1:25565`. Use a player name other than `Pilly`. The Minecraft graphical client is installed separately; this project supplies the server and bot.

## Mascot overlay

```sh
npm run overlay
```

Open [Pilly studio](http://127.0.0.1:4317). Use **Native Minecraft + cam** for the normal Minecraft graphics and sounds. On macOS, after installing and launching Minecraft 1.20.4 once with the official launcher, run:

```sh
npm run camera
```

This reuses the installed client and assets in a separate `.runtime/native-camera` profile. It connects only to the localhost development server as `PillyCam`; it never reads your launcher credentials or changes your normal Minecraft settings. The server installs a small data pack that puts only `PillyCam` into spectator mode and attaches its camera to Pilly. Rejoining resumes following automatically while Pilly is online. The native camera uses 12-chunk render distance and a 60 FPS cap; actual performance depends on the machine. Spectator mode shows native graphics and audio, but does not reproduce the survival player's hand, inventory UI, or view bob exactly.

In the studio, select **Native Minecraft + cam**, click **Share Minecraft to overlay**, and choose the Minecraft window in the browser picker. Keep that studio tab open. Its captured video is sent over local WebRTC connections to separate `/overlay` pages, including an OBS Browser Source at 1920 × 1080. Only one studio can publish at a time; closing it, stopping capture, or losing its connection clears the video in overlays. A publisher connection failure requires choosing the window again; overlays reconnect to signaling automatically. Screen sharing needs a fresh user click after a studio reload. The studio preview is muted, and game audio still needs a separate OBS audio capture. No public streaming, STUN/TURN service, account credentials, or recording is used by this local relay.

For an OBS setup that captures Minecraft directly, use `/overlay?external=1` as the transparent camera/HUD layer above an OBS macOS Screen Capture source. The regular `/overlay` URL receives the shared video and shows instructions when no capture is available.

**Browser preview** remains available without a separate client. It uses [Prismarine Viewer](https://github.com/PrismarineJS/prismarine-viewer) at `127.0.0.1:4318`, now with a six-chunk radius. This is a simplified diagnostic view without native game audio or the hand/inventory interface. The server sends up to 12 chunks; the bot requests its far view distance.

The browser camera samples the bot at 20 Hz and interpolates position and head rotation on animation frames with a 100 ms buffer. It takes the shortest path across rotation boundaries, snaps after teleports or long gaps, and drops queued camera updates when the connection is busy. Rendering is capped at a full-HD pixel budget to avoid Retina displays multiplying the GPU load. This smooths presentation; it does not alter gameplay or promise a particular frame rate in every world.

The client source lives in `viewer/` and reuses Prismarine’s world renderer and worker assets. `npm run bot` builds the client automatically first. `npm run viewer:build` rebuilds just the browser bundle without starting Minecraft. Tests also build it before running. Camera interpolation has been checked with jittered packets at 60/144 Hz and in a rendered browser fixture.

Pilly’s live room is a 16:9 scene with the seated mascot, desk, window, shelves, and animated room lighting. Pilly breathes, blinks, looks around, and types, with spring-driven hands. Choose from 30 expressions, seven room reactions, three headphone colors, and optional speech animation. Settings are shared with all overlay windows and reset when the overlay server restarts.

The stream HUD uses ten heart and hunger icons with partial fills, exact values, and low-stat labels. Its task card shows what Pilly chose, why, verified house progress, and learned chat ideas. Stale vitals and progress disappear when gameplay disconnects. In both Minecraft scenes, Pilly’s camera grows by 8% from its bottom-right corner during actual speech playback and returns when audio ends or is paused. The camera meter follows the same audio amplitude as his mouth; muted previews animate too. Reduced-motion preferences remove the transitions. Captions sit between the HUD and camera.

Choose **Live room** for the full scene or **Transparent mascot** for the original standalone character with 12 sprite reactions, size and position controls, and an optional white border. The border is off by default, matching the new handoff. **Preview speech** animates the mouth and gestures without playing or recording audio; **Back to idle** stops this preview and clears the reaction and caption.

In OBS, add a **Browser Source**:

- URL: `http://127.0.0.1:4317/overlay`
- Width: **1920**, height: **1080**
- Browser preview includes the simplified game view. Native Minecraft + cam includes the shared Minecraft window, bottom-right Pilly camera, HUD, and voice. Live room fills the frame. Transparent mascot shows the standalone character.

Window preview works in Native Minecraft + cam and Transparent mascot; overlays receive the video in Native Minecraft + cam. It stops when you choose Browser preview or Live room, close the page, or stop sharing.

Start or restart `npm run bot` to send real health, food, wood count and mission progress to the overlay. Appearance controls never control gameplay; chat can influence the planner’s next choice. A missing overlay service does not stop the bot. Stale telemetry becomes offline after five seconds. Arrival, damage, crafting, completion and errors trigger character reactions.

The active handoff is `design_handoff_pilly_mascot 2/`. Its sprite renderer supplies the same body, face and headphone layers for both modes. The live room adapts `design/Pilly Live Room.dc.html` into local modules and `overlay/live-room.svg`; it updates SVG attributes in one animation loop without rebuilding the artwork each frame. Room reactions play once and blend back into idle; sprite reactions play twice. Source handoffs are preserved. The included 3D page remains a design reference.

The studio and game viewer bind to localhost only. Control endpoints validate payloads, reject foreign browser origins and unknown hostnames, and serve only explicitly listed files. The viewer serves only its package’s public assets, limits connections to eight, rejects foreign-origin socket handshakes, and removes world listeners on disconnect. Its chunk worker alone permits dynamic schema compilation required by the renderer; the studio and viewer page keep their stricter script policies. Keep it local; public hosting would need authentication and a different connection to the game.

## Pilly’s persona, chat, and voice

[Pilly’s persona](src/persona/pilly.ts) is the source of truth: a joyful, funny, slightly degen Minecraft beginner who lost his bags and decided to become the coin. His dream is Pumpville, an in-game town for the community and future holders. **$PILLY is not launched yet.** His planned creator-fee policy directs 100% toward running him, compute, and stream expenses. The persona treats “first fully automated Pump.fun streamer” as brand positioning, not a verified historical claim, and “forever” as an ambition rather than a guarantee. Gameplay now builds small Minecraft houses and expands the town; no token operations are implemented.

The website chat at [localhost:4317/chat](http://127.0.0.1:4317/chat) and the studio’s **Talk to Pilly** panel share questions and replies. Pilly answers through a private ElevenLabs text agent, then speaks using **Liam**, an energetic male voice. Only the persona, recent spoken lines, viewer questions, and selected fresh gameplay facts reach the conversation service. It has no tools, code, files, credentials, or log access. Requests for private details get an in-character deflection; generated text is checked before speech. Chat is public to connected local viewers and sent to ElevenLabs, so the page tells viewers to keep private information out.

His voice is casual gaming chat: short replies, contractions, occasional “bro,” “cooked,” or “lowkey,” and quick self-roasts. The persona avoids polished architecture monologues, repeated inventory reports, and forced jokes in every reply. Commentary receives the current task, its reason, verified building progress, completed house count, and the latest learned chat preference. Update the existing ElevenLabs agent with `npm run voice:setup` after changing the persona.

To configure on another machine:

1. Copy `.env.example` to `.env`, and put your ElevenLabs key in `ELEVENLABS_API_KEY`. Keep `.env` private and git-ignored.
2. Run `npm run voice:setup` to create or update Pilly’s private agent and save its ID locally. Run it again after editing the persona. It reuses the configured agent; it does not retry a failed creation automatically.
3. Start `npm run overlay`. No other AI provider key is required. Without voice credentials, the visual overlay still works.

In the studio, **Introduce Pilly** tests the voice and **Hear Pilly** unmutes the preview. Studio and viewer previews start muted; `/overlay` plays speech for OBS. If a browser blocks autoplay, click **Enable Pilly’s voice** inside the scene. In OBS, use the Browser Source’s audio output; avoid monitoring both an unmuted studio and the OBS source. Captions follow the spoken text. All mascot modes use the decoded audio’s actual amplitude for mouth movement, including muted previews.

Automatic commentary runs at most once every 45 seconds while viewers are connected and gameplay telemetry is fresh. Website questions take priority and speech never overlaps. There are at most six waiting questions, 300 characters per question, 420 characters per reply, and 120 generation attempts per rolling hour per server process. Failed requests count toward this limit. Provider failures pause voice until you re-enable it; requests are not automatically retried because the remote service may already have charged them. Disable **Voice enabled** to cancel current speech and discard queued questions. Disable **Automatic gameplay commentary** to keep only chat replies.

Chat, clips, the queue, and the hourly counter are in memory and reset on restart. Pending work is dropped, never replayed. This is a single-process local stream, with no durable recovery or cross-process playback lease. It is not a substitute for an ElevenLabs account spending limit. Pump.fun chat is not connected while the token is unlaunched. The integration uses ElevenLabs’ [private agent authentication](https://elevenlabs.io/docs/eleven-agents/customization/authentication) and [speech with timing](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps) APIs.

## Pilly’s survival brain

The next manual server start uses `pilly-survival`, a new save selected in `minecraft.json`. It generates normal terrain with a random seed, normal difficulty, hostile mobs, hunger, and forced survival mode. There are no starter items or prebuilt structures. The previous `.minecraft/1.20.4/world` town is preserved. Preparing settings does not launch Java, generate chunks, or delete saves. Subsequent starts resume the new life rather than resetting it again.

The loop checks hunger, health, threats, daylight, inventory, shelter, equipment, and chat between small action batches. Urgent danger and hunger decisions bypass the language model. Supported actions include:

- Collect wood, craft planks, make a table and wooden, stone, iron, or diamond tools when the materials are available.
- Hunt nearby passive cows, pigs, and sheep, collect food, eat safe foods, and seek matching wool for a bed.
- Build one modest shelter with solid walls, a low roof, an entrance step, and a wooden door. Add a furnace, torches, and a bed as supplies permit.
- Mine reachable stone, coal, iron, and diamond ore with the required pickaxe. Avoid digging underneath himself, next to liquids or falling blocks, or through his buildings.
- Cook food, make charcoal, smelt iron, equip iron armor, seek safer ground, retreat to shelter, and sleep when a usable bed is available.
- Explore and replant between practical survival goals. Commentary describes real activity and small wins, with the same casual personality.

Pumpville tasks are gated until day 10 or later **and** a completed shelter, a bed, a diamond pickaxe, iron-or-better armor, at least 16 food items and 8 torches, and healthy hunger/health levels. These are verified prerequisites, not a timer that forces town construction. Survival needs can suspend a town project. The first shelter is separate from the town-house count. The HUD shows the day, survival chapter, current goal, and building progress.

`npm run brain:setup` and `npm run voice:setup` configure the existing private ElevenLabs agents to **Claude Sonnet 5.5** (`claude-sonnet-5-5`, low reasoning). Provider model fallbacks are disabled. Speech synthesis still uses ElevenLabs Flash 2.5 and the selected male voice. These setup commands do not start Minecraft.

Sonnet returns a strict JSON plan of 1–4 implemented tasks, with 1–8 small batches per step. Every step is checked against fresh survival prerequisites before execution. Planning runs in the background while local survival actions continue; the loop waits at most 25 ms for a newly launched request. Requests have a 20-second deadline, a ten-second minimum gap, and a maximum of 120 attempts per rolling hour per bot process. Plans expire after 90 seconds. Damage, danger, daylight changes and useful chat discard active plans and pending replies. Blocked actions or no observed progress discard the active plan; an already pending observation request can finish, and its steps are checked against the latest eligible choices. Missing credentials, invalid output and provider failures use local priorities. No model output becomes executable code, server commands, or arbitrary public text.

Observations contain inventory, vitals, daylight, terrain underfoot, nearby entities, resource coordinates, shelter/stations and recent measured outcomes. Resource locations are observations, not promises of reachability; each action still checks its route. Resource scans only run when a model request is needed. Known resource locations and the last 40 action outcomes survive restarts. Failed activities are suppressed near the same location after two failures, encouraging exploration. Recent exploration history also seeds route avoidance after restart. No action queue is replayed from disk.

Crafting synchronizes inventory with the server before starting and between individual recipes; optimistic client inventory alone cannot confirm a craft. A lost acknowledgement is accepted only if the subsequent server inventory confirms the expected output. Timeouts or unconfirmed output stop execution without replay.

Ordinary travel and wood collection watch for damage, visible threats and eight seconds without movement. They wait for the current operation to settle before handing control back to survival decisions. An in-flight digging/placement operation is allowed to settle; cancellation does not start overlapping world mutations. Retreat routes remain available during danger. Mobs behind solid terrain no longer count as visible threats. Commentary receives observed outcomes separately from planned steps and drops automatic lines if the activity changes, health falls, or telemetry becomes stale before playback.

Website chat can suggest food, shelter, gear, mining, camp improvements, exploration, planting, and wood preferences. Recognized suggestions influence eligible choices for ten minutes. They cannot override emergencies or unlock early town building. This is preference learning, not acquisition of arbitrary new skills. Muting voice still allows suggestions; the website accepts at most 30 messages per minute.

Life memory is saved beside the selected world in `pilly-life.json`. It contains the shelter plan, station positions, town projects, starting day, learned preferences, recent action outcomes, and observed resources. Placement intent is saved before station construction. Blocks and furnace slots are read from actual game state on resumption, rather than replaying a stored action queue. Invalid memory stops startup instead of resetting the life. Keep this file with world backups. The original version-one town memory is left with the preserved old save.

Actions are bounded and sequential. Blocked routes lead to another eligible activity after a cooldown. Session loss, death, an action timeout, unconfirmed remote outcomes, or a local save failure stop the bot. There is no automatic respawn, reconnect daemon, or multiplayer lease system. Tests cover interruption before/after acknowledgement, ambiguous placement and furnace transfers, interrupted saves, door replay, and restart reconciliation.

This is a bounded survival skill set, not a complete Minecraft agent. It does not yet implement deep shaft mining, farming/breeding, strategic hostile combat, the Nether, bosses, or unlimited terrain adaptation. Mining is limited to reachable deposits; finding diamonds and unlocking Pumpville is not guaranteed. Survival and terrain adaptation still need evaluation; a stronger planner does not guarantee safe movement or first-night survival.

## Gameplay evaluation

`npm run evaluate` summarizes per-run logs beside the current world in `pilly-runs/`: verified food/shelter/tool/bed milestones, blocked actions, time spent in actions without observed progress, unconfirmed actions, and model request/acceptance/failure counts. A start record without a finish remains unconfirmed after a crash or failed local save. Logs never authorize replay. API dollar cost is explicitly unknown because the text bridge does not return token billing; use ElevenLabs billing for actual charges. Limits reset with the process and are not account spending limits.

`npm run benchmark -- 17 1200 25575` creates a separate fresh survival world under `.runtime/benchmarks/`, starts its own local server, and runs Pilly for 20 minutes or until death/error. Seed, duration in seconds, and an unused port are configurable. It uses the same brain and abilities, without stream telemetry, website chat, spectator, or voice. It preserves the stream world, records `result.json`, `bot.log`, and action logs, and stops the test server on exit. A first night passes only after the game day advances and the bot remains alive through the requested duration. Repeat with seeds such as 29 and 43 on separate ports; running sequentially avoids competing with the live stream for resources. Short runs are smoke tests, not proof of first-night survival.

## Local access

The server binds to **127.0.0.1 only**, with Minecraft account verification disabled for this local bot prototype. Do not expose or forward this server port. Public deployment needs authenticated accounts and a separate configuration. RCON and query are disabled. Runtime downloads, world saves and local settings are git-ignored.

## Checks

```sh
npm test
npm run typecheck
npx prettier --check .
npm audit
```

The UUID dependency is overridden to 11.1.1 to fix an upstream advisory while retaining CommonJS compatibility. Recheck this override when upgrading Mineflayer.

Path checks finish the pathfinder’s incremental search instead of treating a yielded time slice as an unreachable route. They yield between slices, respect cancellation, and have a bounded total search time. Exploration samples ground columns at several distances and heights, favors daylight and visible resources, and avoids recently visited destinations. When hungry it seeks visible food animals. Short routes remain candidates even when distant paths fail. Walking may clear dirt, grass, foliage, and logs while retaining the pathfinder's liquid and falling-block checks; it cannot mine stone or structures automatically. Sprinting is disabled to conserve hunger. Failed searches cool down briefly, while successful travel immediately allows a new search. At night, an existing shelter is preferred; without one, the bot continues survival tasks unless threats or low health require retreat. Planning happens in the background, with immediate local choices while a request is pending. These are bounded survival behaviors, not a general Minecraft-playing model; difficult terrain can still block progress.
