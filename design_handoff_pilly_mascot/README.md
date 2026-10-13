# Handoff: Pilly — pixel mascot for a 24/7 AI livestream

## Overview
Pilly is a pixel-art capsule character (white top, green bottom) with headphones, rubber-hose arms/legs, 30 facial expressions and 12 looping stream reactions. He's meant to live on a stream overlay: idle bounce + blink, lip-sync from 3 mouth shapes, and short reaction loops triggered by stream events (follows, donations, chat laughter, etc.).

## About the design files
Everything in `design/` is a **design reference built in HTML** — it shows the intended look and behavior, not production code to ship as-is. Recreate it in your target environment (React, Vue, Canvas/WebGL overlay, OBS browser source, Unity, etc.) using that codebase's patterns.

The exception is `code/pilly-sprite.js`: a dependency-free ES module extracted from the design that generates the exact sprites as SVG strings. You can use it directly, port it, or ignore it and use the pre-rendered files in `assets/`.

## Fidelity
**High-fidelity.** Every pixel, color and frame is final. Render at **integer scales only** (e.g. 4×, 8×, 12×) with nearest-neighbor / `image-rendering: pixelated` / `shape-rendering="crispEdges"` so pixels stay sharp.

## Sprite spec
- **Grid:** 48 × 60 px character. Full-body artboard viewBox `-4 -12 56 74` (extra room above for jumps/particles). Head-only viewBox `3 0 42 33`.
- **Outline:** 1 px Deep pine `#1F3A35` around every shape (4-neighbor).
- **Sticker border:** optional 2 px pure white ring around the whole silhouette (default ON). `pilly-main-no-border.svg` shows it off.
- **Body:** capsule 22 px wide (x 13–34), top y 6, bottom y 49. Seam row y = 29 (outline color). White above, green below. Cel shade = 3 px crescent on the right/bottom edge (Mist on white, Green shade on green). White dashed highlight on lower-left of the green half.
- **Face (on white half):** eyes bottom-aligned to y 18; left eye centered x≈17.5, right x≈29.5. Mouth top at y 21, centered on x 24. Blush 2×1 px Rose at (14–15, 20) and (32–33, 20). Brows (optional) at y 11–12.
- **Headphones:** 2 px band arc (r 12.6–14.4 around (24,17)) + 4×10 px cups at x 9–12 / 35–38, y 13–22, + mic boom to a 4×3 capsule at (15,24).
- **Limbs:** 2 px Deep pine noodle arms/legs; white round mitten hands (5–6 px); green sneakers 6×5 with white sole.

## Design tokens
| Token | Hex | Use |
|---|---|---|
| Deep pine | `#1F3A35` | outline, eyes, mouth interior, limbs |
| Capsule white | `#FFFFFF` | top half, hands, soles, sticker border |
| Mist | `#C0D5D3` | white shade, tears, steam |
| Pill green | `#5FCB88` | bottom half, shoes, stars |
| Green shade | `#5FB38A` | green cel crescent |
| Rose | `#F08A8A` | cheeks, tongue, hearts |
| Headphones (variant) | Green `#5FCB88` · Pine `#2F5A52` · Rose `#F08A8A` | band, cups, mic capsule (default Green) |

## Expressions (30) — `assets/svg|png/expressions/*`
default, happy, laughing, wink, in-love, smug, shocked, panicked, sad, angry, sleepy, dizzy, begging, excited, cool, thinking, confused, crying, blep, nervous, embarrassed, unimpressed, suspicious, kiss, determined, rage, uwu, talk-a (closed), talk-b (open), talk-c (wide).
Each is a combination of eye / mouth / brow / fx stamps — see `options` per expression in `assets/manifest.json`.

## Reactions (12) — `assets/svg/reactions/<id>/<id>-NN.svg`
All loop. Base tick = 125 ms (8 fps); `frameMs` per reaction in the manifest.
| id | Label | Suggested trigger | Frames | ms/frame |
|---|---|---|---|---|
| hype | Hype jump | new follower | 8 | 125 |
| lol | LOL | chat laughs | 6 | 125 |
| scare | Jump scare | big donation | 10 | 125 |
| rage | Rage quit | lost the round | 6 | 125 |
| cry | Big cry | sad moment | 6 | 125 |
| love | Love | gift / raid | 8 | 125 |
| vibe | Vibing | music on | 4 | 250 |
| think | Thinking | reading chat | 8 | 250 |
| sleep | AFK nap | idle 5 min | 6 | 375 |
| dizzy | Dizzy | combo / spin | 6 | 125 |
| hello | Hello wave | stream start | 4 | 250 |
| nervous | Nervous | boss fight | 6 | 125 |

## Interactions & behavior
- **Idle (default state):** every 125 ms tick — body bobs 1 px down/up every 4 ticks; left arm waves between two positions every 3 ticks; blink (eyes → `blink`) for 2 ticks every 37 ticks.
- **Lip-sync:** while speaking, pick mouth `closed` / `open` / `wide` per tick (125 ms) from audio amplitude (low / mid / high). Silence → `grin`. The design file fakes this with random picks.
- **Reaction playback:** on trigger, play the reaction loop **2 times**, then return to idle. A new trigger interrupts the current one.
- Legs and shoes never move with the bob; everything above them shifts by `dy`/`dx`. Jumps/squash apply to the whole sprite (squash pivots at bottom-center (24, 59)).

## State
`state = { tick, mouth: 'grin'|'closed'|'open'|'wide', blinking, activeReaction: { id, startTick } | null }`. Settings: `headphones: 'Green'|'Pine'|'Rose'`, `sticker: boolean`.

## Using `code/pilly-sprite.js`
```js
import { renderPilly, EXPRESSIONS, REACTIONS, reactionFrame } from './pilly-sprite.js';
el.innerHTML = renderPilly({ limbs: true, mouth: 'open', blink: false, dy: 1 });   // full body
el.innerHTML = renderPilly(EXPRESSIONS.smug, { head: true });                     // head only
el.innerHTML = renderPilly(reactionFrame('hype', 3));                             // reaction frame
// options: { sticker = true, headphones = 'Green', width, height }
```
Open `code/pilly-demo.html` through a local server (ES modules) to see reactions loop.
Performance tip: cache the SVG string per frame. Don't regenerate it every tick.

## Files
- `design/Pilly Pixel Sheet.dc.html` (+ `support.js`): the full interactive character sheet. Open it in a browser.
- `assets/svg/pilly-main.svg`, `pilly-main-no-border.svg`: main pose.
- `assets/svg/pilly-rig-layered.svg`: named layers (`legs`, `shoes`, `arms`, `body`, `blush`, `eyes`, `brows`, `mouth-grin|closed|open|wide`, `fx-*`, `headphones-band|cups|mic`, `hands`, `sticker-border`). Alt mouths are hidden.
- `assets/svg/expressions/*.svg` and `assets/png/expressions/*.png` (420×330, 10× scale).
- `assets/svg/reactions/<id>/*.svg`: every reaction frame (560×740).
- `assets/png/pilly-main.png`: main pose PNG.
- `assets/manifest.json`: palette, grid, expression options, reaction timing.
- `code/pilly-sprite.js`, `code/pilly-demo.html`: renderer and demo.
