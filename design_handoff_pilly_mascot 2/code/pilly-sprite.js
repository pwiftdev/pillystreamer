// Pilly pixel sprite — framework-agnostic renderer (extracted from the design file).
// Returns SVG strings. No dependencies. Usage:
//   import { renderPilly, EXPRESSIONS, REACTIONS, reactionFrame } from './pilly-sprite.js';
//   el.innerHTML = renderPilly({ limbs:true, mouth:'open', blink:false });
//   el.innerHTML = renderPilly(reactionFrame('hype', 3));
//   el.innerHTML = renderPilly(EXPRESSIONS.smug, { head:true });
const PAL = { o:'#1F3A35', w:'#FFFFFF', s:'#C0D5D3', g:'#5FCB88', h:'#5FB38A', p:'#F08A8A' };
const HPC = { Green:'#5FCB88', Pine:'#2F5A52', Rose:'#F08A8A' };
const GW = 48, GH = 60;

const K = (x, y) => (y + 200) * 1000 + x + 200, KX = k => k % 1000 - 200, KY = k => Math.floor(k / 1000) - 200;
class Layer {
  constructor(name) { this.name = name; this.c = new Map(); }
  set(x, y, v) { this.c.set(K(Math.round(x), Math.round(y)), v); return this; }
  has(x, y) { return this.c.has(K(x, y)); }
  stamp(rows, x0, y0) { rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== '.') this.set(x0 + i, y0 + j, r[i]); }); return this; }
  pts(list, v) { list.forEach(([x, y]) => this.set(x, y, v)); return this; }
  outline() { const add = []; this.c.forEach((v, k) => { const x = KX(k), y = KY(k); [[1,0],[-1,0],[0,1],[0,-1]].forEach(([a, b]) => { if (!this.has(x + a, y + b)) add.push([x + a, y + b]); }); }); add.forEach(([x, y]) => this.set(x, y, 'o')); return this; }
  brush(list, v = 'o') { list.forEach(([x, y]) => { for (const [a, b] of [[0,0],[1,0],[0,1],[1,1]]) this.set(Math.floor(x) + a, Math.floor(y) + b, v); }); return this; }
}
const mir = rows => rows.map(r => [...r].reverse().join(''));
const quad = (p0, p1, p2, n = 48) => { const out = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u*u*p0[0] + 2*u*t*p1[0] + t*t*p2[0], u*u*p0[1] + 2*u*t*p1[1] + t*t*p2[1]]); } return out; };

const EYES = {
  open:   { r:['.oo.','owoo','oooo','oooo','.oo.'] },
  blink:  { r:['....','....','o..o','.oo.','....'] },
  happy:  { r:['....','.oo.','o..o','....','....'] },
  squeeze:{ r:['o...','.oo.','...o','.oo.','o...'], m:1 },
  sleepy: { r:['....','....','....','oooo','.oo.'] },
  smug:   { r:['....','....','oooo','owoo','.oo.'] },
  wide:   { r:['.ooo.','owwwo','owowo','owwwo','.ooo.'] },
  heart:  { r:['.o.o.','opopo','opppo','.opo.','..o..'] },
  x:      { r:['o...o','.o.o.','..o..','.o.o.','o...o'] },
  angry:  { r:['o...','ooo.','owoo','oooo','.oo.'], m:1 },
  sad:    { r:['...o','.ooo','owoo','oooo','.oo.'], m:1 },
  beg:    { r:['.ooo.','owwoo','owwoo','ooooo','ooowo','.ooo.'] },
  plus:   { r:['..o..','..o..','ooooo','..o..','..o..'] },
  up:     { r:['.ooo.','owwoo','owwwo','owwwo','.ooo.'] },
  side:   { r:['ooooo','owwoo','owwoo','.ooo.'] },
  flat:   { r:['....','....','oooo','....','....'] },
  dot:    { r:['oo','oo'] },
  none:   { r:[''] },
};
const MOUTHS = {
  grin:   ['oooooooo','oooooooo','.oppppo.','..oooo..'],
  smile:  ['o......o','.o....o.','..oooo..'],
  closed: ['o....o','.oooo.'],
  open:   ['.oooo.','oooooo','oppppo','.oooo.'],
  wide:   ['.oooooo.','oooooooo','oooooooo','oppppppo','oppppppo','.oooooo.'],
  laugh:  ['oooooooooo','owwwwwwwwo','oooooooooo','.oppppppo.','..oooooo..'],
  shocked:['.oo.','oooo','oooo','oppo','.oo.'],
  panic:  ['oooooooo','owwowwwo','owwwowwo','oooooooo'],
  smug:   ['.......o','o....oo.','.oooo...'],
  sad:    ['..oooo..','.o....o.','o......o'],
  angry:  ['oooooo','owowwo','oooooo'],
  sleepy: ['.oo.','oooo','.oo.'],
  beg:    ['o.oo.o','.oppo.','.oppo.','..oo..'],
  wink:   ['o......o','.o....o.','..oooo..','...opo..','....o...'],
  dizzy:  ['o.oo.oo.','.o..o..o'],
  blep:   ['.oooooo.','...opo..','...ooo..'],
  hmm:    ['oooo'],
  wobbly: ['o......o','.o.oo.o.','..o..o..'],
  flat:   ['oooooo'],
  kiss:   ['.oo.','...o','.oo.','...o','.oo.'],
  yell:   ['oooooooooo','owwwwwwwwo','oooooooooo','oooooooooo','.oppppppo.','..oooooo..'],
  uwu:    ['o.oo.o','.o..o.'],
};
const MPOS = { hmm:[26,23], flat:[null,23], kiss:[25,21] };
const BROWS = { flat:['....','oooo'], up:['oooo','....'], arch:['.oo.','o..o'], worry:['..oo','oo..'], angry:['oo..','..oo'] };
const SHADES = ['oooooooooooooooooooooo','..owooooo....owooooo..','..oowoooo....oowoooo..','...ooooo......ooooo...'];
const CUP = ['.oo.','oaao','owao','oaao','oaoo','oaoo','oaao','oaao','oaao','.oo.'];
const SHOE = ['..ooo.','.oggho','oggggo','owwwwo','oooooo'];
const HAND_WAVE = ['.o.o.','owowo','owwwo','owwso','.ooo.'];
const HAND_MITT = ['..ooo.','.owwwo','oowwso','owwsso','.oooo.'];
const HEART = ['p.p','ppp','.p.'], STAR = ['.g.','ggg','.g.'], SPARK = ['.w.','www','.w.'];
const NOTE = ['..oo','..o.','..o.','ooo.','oo..'], Z4 = ['oooo','..o.','.o..','oooo'], Z3 = ['ooo','.o.','ooo'];
const ARMS = {
  wave0: { L:[[6,33],[6,20],'wave'], R:[[42,30],[41,38],'mitt'] },
  wave1: { L:[[6,33],[4,23],'wave'], R:[[42,30],[41,38],'mitt'] },
  rest:  { L:[[8,34],[8,40],'mitt'], R:[[40,34],[40,40],'mitt'] },
  cheer: { L:[[4,30],[5,14],'wave'], R:[[44,30],[43,14],'wave'] },
  think: { L:[[8,34],[8,40],'mitt'], R:[[42,36],[31,27],'mitt'] },
  cheeks:{ L:[[6,32],[11,27],'mitt'], R:[[42,32],[37,27],'mitt'] },
  danceA:{ L:[[4,30],[6,15],'wave'], R:[[40,34],[40,40],'mitt'] },
  danceB:{ L:[[8,34],[8,40],'mitt'], R:[[44,30],[42,15],'wave'] },
};

const inside = (x, y) => { const px = x + .5 - 24, py = y + .5; if (py < 17) return px*px + (py-17)**2 <= 121; if (py > 39) return px*px + (py-39)**2 <= 121; return Math.abs(px) <= 11; };
const BODY = (() => { const L = new Layer('body');
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (inside(x, y)) { const top = y <= 28; let v = y === 29 ? 'o' : top ? 'w' : 'g'; if (y !== 29 && !inside(x + 3, y + 2)) v = top ? 's' : 'h'; L.set(x, y, v); }
  L.pts([[16,32],[15,33],[15,35],[15,36],[15,37],[16,39],[17,40]], 'w'); return L.outline(); })();
const BAND = (() => { const L = new Layer('headphones-band'); for (let y = 0; y < 18; y++) for (let x = 0; x < GW; x++) { const r = Math.hypot(x + .5 - 24, y + .5 - 17); if (r >= 12.6 && r <= 14.4) L.set(x, y, 'a'); } return L.outline(); })();
const CUPS = new Layer('headphones-cups').stamp(CUP, 9, 13).stamp(mir(CUP), 35, 13);
const MIC = new Layer('headphones-mic').pts([[10,23],[11,24],[12,25],[13,25],[14,25]], 'o').stamp(['.oo.','oaao','.oo.'], 15, 24);
const LEGS = new Layer('legs').brush(quad([18, 47], [18, 52], [18, 55])).brush(quad([29, 47], [29, 52], [29, 55]));
const SHOES = new Layer('shoes').stamp(SHOE, 14, 54).stamp(mir(SHOE), 28, 54);

const placeEye = (L, name, side) => { if (name === 'none') return; const E = EYES[name], rows = side && E.m ? mir(E.r) : E.r, w = rows[0].length, h = rows.length;
  L.stamp(rows, side ? 30 - Math.floor(w / 2) : 18 - Math.ceil(w / 2), 19 - h); };
const placeMouth = (L, name) => { const m = MOUTHS[name], p = MPOS[name] || []; L.stamp(m, p[0] ?? 24 - Math.round(m[0].length / 2), p[1] ?? 21); };

function character(o) {
  const e = Object.assign({ eyes:['open','open'], mouth:'grin', brows:null, fx:[], blush:true, t:0 }, o);
  const t = e.t, has = n => e.fx.includes(n), up = [], low = [];
  let A = null;
  if (e.limbs) {
    low.push(LEGS, SHOES);
    A = ARMS[e.arms || 'wave0'];
    up.push(new Layer('arms').brush(quad([14, 31], A.L[0], A.L[1])).brush(quad([32, 31], A.R[0], A.R[1])));
  }
  up.push(BODY);
  const blush = new Layer('blush'); if (e.blush) blush.pts([[14,20],[15,20],[32,20],[33,20]], 'p');
  const eyes = new Layer('eyes'); const en = e.blink && e.eyes[0] !== 'none' ? ['blink','blink'] : e.eyes; placeEye(eyes, en[0], 0); placeEye(eyes, en[1], 1);
  const brows = new Layer('brows'); if (e.brows) { brows.stamp(BROWS[e.brows[0]], 16, 11); brows.stamp(mir(BROWS[e.brows[1]]), 28, 11); }
  up.push(blush, eyes, brows);
  if (e.glasses) up.push(new Layer('glasses').stamp(SHADES, 13, 14));
  if (e.rig) ['grin','closed','open','wide'].forEach((m, i) => { const L = new Layer('mouth-' + m); placeMouth(L, m); L.hidden = i > 0; up.push(L); });
  else { const mouth = new Layer('mouth'); placeMouth(mouth, e.mouth); up.push(mouth); }
  const F = new Layer('fx-shapes'), I = new Layer('fx-lines');
  if (has('tears')) F.pts([[14,19],[14,20],[33,19],[33,20]], 's');
  if (has('tear')) F.pts([[15,19],[15,20],[15,21]], 's');
  if (has('streams')) for (let y = 19; y <= 27; y++) if ((y + t) % 3) F.set(15, y, 's').set(32, y, 's');
  if (has('sweat')) F.pts([[40,4],[39,5],[40,5],[41,5],[39,6],[40,6],[41,6]], 's');
  if (has('sweat-drip')) { const d = t % 6; F.pts([[40,3+d],[39,4+d],[40,4+d],[41,4+d]], 's'); }
  if (has('hearts')) F.stamp(HEART, 40, 3).stamp(HEART, 5, 6);
  if (has('hearts-float')) { F.stamp(HEART, 40, 6 - Math.floor((t % 8) * 1.5)); F.stamp(HEART, 4, 6 - Math.floor(((t + 4) % 8) * 1.5)); }
  if (has('stars')) F.stamp(STAR, 5, 4).stamp(STAR, 40, 2);
  if (has('orbit')) { const P = [[4,6],[12,0],[24,-3],[36,0],[43,6],[24,9]]; F.stamp(STAR, ...P[t % 6]).stamp(STAR, ...P[(t + 3) % 6]); }
  if (has('sparkles')) (t % 2 ? [[2,2],[42,10],[44,-2]] : [[42,1],[1,12],[6,-3]]).forEach(p => F.stamp(SPARK, p[0], p[1]));
  if (has('sparkle1')) F.stamp(SPARK, 41, 2).stamp(SPARK, 3, 8);
  if (has('steam')) [0, 3].forEach((k, j) => { const y = 4 - ((t + k) % 6); F.stamp(['ss','ss'], j ? 40 : 6, y); });
  if (has('zzz')) I.stamp(Z4, 39, 5).stamp(Z3, 44, 0);
  if (has('zzz-float')) { I.stamp(Z4, 39, 5 - (t % 6)); I.stamp(Z3, 44, 1 - ((t + 3) % 6)); }
  if (has('shock')) I.pts([[5,3],[6,4],[42,3],[41,4],[3,9],[4,9],[43,9],[44,9]], 'o');
  if (has('exclaim')) I.stamp(['oo','oo','oo','..','oo'], 41, -2).stamp(['oo','oo','oo','..','oo'], 4, 0);
  if (has('question')) I.stamp(['ooo','..o','.oo','...','.o.'], 40, 1);
  if (has('dots')) [[37,6],[40,6],[43,6]].slice(0, e.dots ?? 3).forEach(([x, y]) => I.brush([[x, y]]));
  if (has('notes')) { I.stamp(NOTE, 40, 4 - (t % 4)); I.stamp(NOTE, 3, 6 - ((t + 2) % 4)); }
  if (has('blushlines')) I.pts([[13,21],[14,20],[15,21],[16,20],[31,21],[32,20],[33,21],[34,20]], 'p');
  if (has('wave')) I.pts(e.wave ? [[0,21],[0,22],[0,23],[1,18],[2,17]] : [[1,18],[1,19],[1,20],[3,15],[4,14]], 'o');
  F.outline();
  up.push(F, BAND, CUPS, MIC);
  if (A) { const H = new Layer('hands'); [[A.L, 0], [A.R, 1]].forEach(([s, r]) => { const [hx, hy] = s[1];
      if (s[2] === 'wave') H.stamp(HAND_WAVE, hx - 2, hy - 2); else H.stamp(r ? HAND_MITT : mir(HAND_MITT), hx - 3, hy - 2); }); up.push(H); }
  up.push(I);
  const items = [...low.map(L => ({ L, dx:0, dy:0 })), ...up.map(L => ({ L, dx: e.dx || 0, dy: e.dy || 0 }))];
  const j = e.jump || 0, sq = e.sq || 0;
  items.tf = (j || sq) ? 'translate(0 ' + j + ') translate(24 59) scale(' + (1 + sq) + ' ' + (1 - sq) + ') translate(-24 -59)' : '';
  return items;
}

function compose(items, HC, opt = {}) {
  let out = '';
  if (opt.sticker) {
    const S = new Set(); items.forEach(({ L, dx, dy }) => { if (L.hidden) return; const off = dy * 1000 + dx; L.c.forEach((v, k) => S.add(k + off)); });
    let ring = new Set(S);
    for (let pass = 0; pass < 2; pass++) { const next = new Set(ring); ring.forEach(p => { next.add(p + 1); next.add(p - 1); next.add(p + 1000); next.add(p - 1000); }); ring = next; }
    let r = ''; ring.forEach(p => { if (!S.has(p)) r += '<rect x="' + KX(p) + '" y="' + KY(p) + '" width="1.04" height="1.04" fill="#FFFFFF"/>'; });
    out += '<g data-part="sticker-border"' + (opt.rig ? ' id="sticker-border"' : '') + '>' + r + '</g>';
  }
  items.forEach(({ L, dx, dy }) => {
    const rows = new Map();
    L.c.forEach((v, k) => { const x = KX(k), y = KY(k); if (!rows.has(y)) rows.set(y, []); rows.get(y).push([x, v]); });
    let s = '';
    rows.forEach((arr, y) => { arr.sort((a, b) => a[0] - b[0]); let i = 0;
      while (i < arr.length) { let j = i + 1; while (j < arr.length && arr[j][0] === arr[j - 1][0] + 1 && arr[j][1] === arr[i][1]) j++;
        const v = arr[i][1]; s += '<rect x="' + arr[i][0] + '" y="' + y + '" width="' + (arr[j - 1][0] - arr[i][0] + 1.04) + '" height="1.04" fill="' + (v === 'a' ? HC : PAL[v]) + '"/>'; i = j; } });
    out += '<g' + (opt.rig ? ' id="' + L.name + '"' : '') + ' data-part="' + L.name + '"' + ((dx || dy) ? ' transform="translate(' + dx + ' ' + dy + ')"' : '') + (L.hidden ? ' display="none"' : '') + '>' + s + '</g>';
  });
  return items.tf ? '<g transform="' + items.tf + '">' + out + '</g>' : out;
}
const svg = (vb, inner, w, h) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '"' + (w ? ' width="' + w + '" height="' + h + '"' : '') + ' shape-rendering="crispEdges" style="width:100%;height:auto;display:block">' + inner + '</svg>';

const EX = [
  ['Default', 'base', {}],
  ['Happy', '', { eyes:['happy','happy'] }],
  ['Laughing', '', { eyes:['squeeze','squeeze'], mouth:'laugh', fx:['tears'] }],
  ['Wink', '', { eyes:['open','happy'], mouth:'wink' }],
  ['In love', '', { eyes:['heart','heart'], mouth:'smile', fx:['hearts'] }],
  ['Smug', '', { eyes:['smug','smug'], mouth:'smug', brows:['flat','arch'], blush:false }],
  ['Shocked', '', { eyes:['wide','wide'], mouth:'shocked', brows:['up','up'], fx:['shock'], blush:false }],
  ['Panicked', '', { eyes:['wide','wide'], mouth:'panic', brows:['worry','worry'], fx:['sweat'], blush:false }],
  ['Sad', '', { eyes:['sad','sad'], mouth:'sad', brows:['worry','worry'], fx:['tear'], blush:false }],
  ['Angry', '', { eyes:['angry','angry'], mouth:'angry', brows:['angry','angry'], blush:false }],
  ['Sleepy', '', { eyes:['sleepy','sleepy'], mouth:'sleepy', fx:['zzz'] }],
  ['Dizzy', '', { eyes:['x','x'], mouth:'dizzy', fx:['stars'], blush:false }],
  ['Begging', '', { eyes:['beg','beg'], mouth:'beg', brows:['worry','worry'] }],
  ['Excited', 'new', { eyes:['plus','plus'], mouth:'laugh', fx:['sparkle1'] }],
  ['Cool', 'new', { eyes:['none','none'], glasses:true, mouth:'smug', blush:false }],
  ['Thinking', 'new', { eyes:['up','up'], mouth:'hmm', brows:['flat','up'], fx:['dots'], blush:false }],
  ['Confused', 'new', { eyes:['dot','dot'], mouth:'wobbly', brows:['flat','up'], fx:['question'], blush:false }],
  ['Crying', 'new', { eyes:['blink','blink'], mouth:'wide', brows:['worry','worry'], fx:['streams'], blush:false }],
  ['Blep', 'new', { eyes:['happy','happy'], mouth:'blep' }],
  ['Nervous', 'new', { eyes:['open','open'], mouth:'wobbly', brows:['worry','worry'], fx:['sweat'], blush:false }],
  ['Embarrassed', 'new', { eyes:['happy','happy'], mouth:'wobbly', fx:['blushlines'], blush:false }],
  ['Unimpressed', 'new', { eyes:['flat','flat'], mouth:'flat', blush:false }],
  ['Suspicious', 'new', { eyes:['side','side'], mouth:'hmm', brows:['angry','flat'], blush:false }],
  ['Kiss', 'new', { eyes:['happy','happy'], mouth:'kiss', fx:['hearts'] }],
  ['Determined', 'new', { eyes:['open','open'], mouth:'smile', brows:['angry','angry'], blush:false }],
  ['Rage', 'new', { eyes:['angry','angry'], mouth:'yell', brows:['angry','angry'], fx:['steam'], blush:false }],
  ['UwU', 'new', { eyes:['happy','happy'], mouth:'uwu' }],
  ['Talk', 'A · closed', { mouth:'closed' }],
  ['Talk', 'B · open', { mouth:'open' }],
  ['Talk', 'C · wide', { mouth:'wide' }],
];
const RX = [
  { id:'hype', label:'Hype jump', cue:'new follower', n:8, s:1, f:i => ({ arms:'cheer', eyes:['plus','plus'], mouth:'laugh', fx:['sparkles'], jump:[0,0,-2,-5,-7,-5,-2,0][i], sq:[.08,0,0,0,0,0,0,.08][i] }) },
  { id:'lol', label:'LOL', cue:'chat laughs', n:6, s:1, f:i => ({ arms:'rest', eyes:['squeeze','squeeze'], mouth:'laugh', fx:['tears'], dx:i % 2 ? 1 : -1, dy:Math.floor(i / 2) % 2 }) },
  { id:'scare', label:'Jump scare', cue:'big donation', n:10, s:1, f:i => i < 2 ? { arms:'rest' } : { arms:'cheeks', eyes:['wide','wide'], mouth:'shocked', brows:['up','up'], fx:['shock','exclaim'], blush:false, jump:i === 2 ? -4 : i === 3 ? -2 : 0, dx:i > 4 ? (i % 2 ? 1 : -1) : 0 } },
  { id:'rage', label:'Rage quit', cue:'lost the round', n:6, s:1, f:i => ({ arms:'cheer', eyes:['angry','angry'], brows:['angry','angry'], mouth:'yell', fx:['steam'], blush:false, dx:i % 2 ? 1 : -1 }) },
  { id:'cry', label:'Big cry', cue:'sad moment', n:6, s:1, f:i => ({ arms:'rest', eyes:['blink','blink'], brows:['worry','worry'], mouth:'wide', fx:['streams'], blush:false, dy:Math.floor(i / 3) % 2 }) },
  { id:'love', label:'Love', cue:'gift / raid', n:8, s:1, f:i => ({ arms:'cheeks', eyes:['heart','heart'], mouth:'smile', fx:['hearts-float'], dx:[0,0,1,1,0,0,-1,-1][i] }) },
  { id:'vibe', label:'Vibing', cue:'music on', n:4, s:2, f:i => ({ arms:i % 2 ? 'danceB' : 'danceA', eyes:['happy','happy'], mouth:'smile', fx:['notes'], dx:i % 2 ? 1 : -1, dy:i % 2 }) },
  { id:'think', label:'Thinking', cue:'reading chat', n:8, s:2, f:i => ({ arms:'think', eyes:['up','up'], brows:['flat','up'], mouth:'hmm', fx:['dots'], dots:i % 4, blush:false }) },
  { id:'sleep', label:'AFK nap', cue:'idle 5 min', n:6, s:3, f:i => ({ arms:'rest', eyes:['sleepy','sleepy'], mouth:'sleepy', fx:['zzz-float'], dy:i < 3 ? 0 : 1 }) },
  { id:'dizzy', label:'Dizzy', cue:'combo / spin', n:6, s:1, f:i => ({ arms:'rest', eyes:['x','x'], mouth:'dizzy', fx:['orbit'], blush:false, dx:[0,1,1,0,-1,-1][i] }) },
  { id:'hello', label:'Hello wave', cue:'stream start', n:4, s:2, f:i => ({ arms:i % 2 ? 'wave1' : 'wave0', eyes:i === 3 ? ['open','happy'] : ['happy','happy'], mouth:'grin', fx:['wave'], wave:i % 2 === 1, dy:i % 2 }) },
  { id:'nervous', label:'Nervous', cue:'boss fight', n:6, s:1, f:i => ({ arms:'cheeks', eyes:['side','side'], brows:['worry','worry'], mouth:'wobbly', fx:['sweat-drip'], blush:false, dx:i % 3 === 0 ? 1 : 0 }) },
];
const SPEECH = ['closed','open','wide','open','closed','wide','open','open','closed','closed','wide','open','closed','closed'];
const HEAD_VB = '3 0 42 33', MAIN_VB = '-4 -12 56 74';
const rxFrame = (r, i) => Object.assign({ limbs:true, t:i }, r.f(i));


export const EXPRESSIONS = Object.fromEntries(EX.map(([label, note, o]) => [(label + (label === 'Talk' ? ' ' + note.split(' ')[0] : '')).toLowerCase().replace(/[^a-z0-9]+/g, '-'), o]));
export const REACTIONS = Object.fromEntries(RX.map(r => [r.id, { label:r.label, cue:r.cue, frames:r.n, frameMs:125 * r.s }]));
export function reactionFrame(id, i) { const r = RX.find(x => x.id === id); return rxFrame(r, i % r.n); }
export function renderPilly(opts = {}, { head = false, sticker = false, headphones = 'Green', width, height } = {}) {
  return svg(head ? HEAD_VB : MAIN_VB, compose(character(opts), HPC[headphones] || HPC.Green, { sticker }), width, height);
}
export { PAL, HPC, EYES, MOUTHS, BROWS, ARMS, character, compose };
