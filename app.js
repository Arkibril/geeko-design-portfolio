import * as THREE from 'three';
import { RoomEnvironment } from './lib/RoomEnvironment.js';
import { RoundedBoxGeometry } from './lib/RoundedBoxGeometry.js';
import { DATA } from './data.js';

/* =========================================================
   Données : types, mots-clés et couleurs pour la recherche
   ========================================================= */
const META = {
  flamme:    { type: 'Portrait',        tags: ['collage', 'photo', 'autoportrait', 'squelette', 'flamme'], colors: ['rouge', 'bleu', 'sombre'] },
  higuruma:  { type: 'Poster',          tags: ['anime', 'manga', 'jujutsu kaisen', 'jjk'],                   colors: ['rouge', 'bleu', 'jaune'] },
  mrrobot:   { type: 'Poster',          tags: ['série', 'typographie', 'glitch'],                            colors: ['rouge', 'sombre', 'bleu'] },
  gradient:  { type: 'Expérimentation', tags: ['abstrait', 'flou', 'dégradé', 'main'],                       colors: ['vert', 'magenta', 'jaune'] },
  mosaique1: { type: 'Motif',           tags: ['pattern', 'ornement', 'carreau'],                            colors: ['rouge', 'magenta'] },
  mosaique2: { type: 'Motif',           tags: ['pattern', 'ornement', 'azulejo'],                            colors: ['bleu', 'magenta', 'sombre'] },
  picto:     { type: 'Pictogramme',     tags: ['motion', 'signalétique', 'vidéo', 'animation'],              colors: ['magenta', 'bleu', 'sombre'] },
  marvel:    { type: 'Poster',          tags: ['marvel', 'comics', 'daredevil', 'moon knight'],              colors: ['rouge', 'sombre'] },
  cyberpunk: { type: 'Key visual',      tags: ['anime', 'cyberpunk', 'duotone'],                             colors: ['bleu', 'jaune'] },
};
const TYPES = ['Tout', 'Poster', 'Motif', 'Portrait', 'Expérimentation', 'Pictogramme', 'Key visual'];
DATA.forEach((p, i) => { Object.assign(p, META[p.id]); p.index = i; });

/* =========================================================
   Constantes physiques (1 unité = 1 cm)
   Boîtier : 14,2 × 12,5 × 1,04 cm — livret 12 × 12 — disque Ø 12
   ========================================================= */
const W = 14.2, H = 12.5, D = 1.04;
const PX = 8;                                  // px par mm pour les textures
const SPACING = 1.9;
const FAN = .42;                               // boîtiers légèrement tournés vers la caméra                          // pas entre deux boîtiers
const COUNT = innerWidth < 820 ? 56 : 80;      // boîtiers rendus sur la boucle
const L = SPACING * COUNT;
const PART = 1.7, LIFT = 5.8;

const $ = (s, el = document) => el.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const mod = (a, n) => ((a % n) + n) % n;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = { out: t => 1 - Math.pow(1 - t, 3), inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, outBack: t => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2) };
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let TOUCH = matchMedia('(hover: none)').matches;   // écran tactile : pas de survol, le boîtier du milieu est sélectionné

/* =========================================================
   Renderer / scène
   ========================================================= */
const canvas = $('#gl');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
catch (e) { $('#nogl').style.display = 'grid'; $('#loader').classList.add('done'); throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const ANISO = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xffffff, 70, 135);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = .62;

const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.5, 400);
scene.add(camera);
const CAM = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
function cameraBase() {
  const a = innerWidth / innerHeight;
  if (a < .8) { CAM.pos.set(-80, 45, 60); CAM.target.set(2, 8.5, 0); }   // mobile : étagère plus basse, le boîtier sélectionné monte dans la zone libre
  else { CAM.pos.set(-60, 30, 44); CAM.target.set(9, 2, 0); }
}
cameraBase();
camera.position.copy(CAM.pos); camera.lookAt(CAM.target);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8f8f8a, .55));
const key = new THREE.DirectionalLight(0xffffff, 1.7);
key.position.set(-18, 42, 26);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -60, right: 60, top: 40, bottom: -40, near: 1, far: 140 });
key.shadow.bias = -0.0004; key.shadow.normalBias = .02;
scene.add(key);
const rim = new THREE.DirectionalLight(0xffffff, .5); rim.position.set(30, 18, -20); scene.add(rim);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.ShadowMaterial({ opacity: .17 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

/* =========================================================
   Images + textures dessinées en canvas
   ========================================================= */
const loadImg = src => new Promise(res => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
const COVERS = {};          // `${proj}-${v}` -> HTMLImageElement
const texCache = new Map();
function tex(key, draw, opts = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const c = draw();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO;
  if (opts.flipX) { t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; }
  texCache.set(key, t); return t;
}
function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function lum(hex) { const n = parseInt(hex.slice(1), 16); return (.2126 * (n >> 16 & 255) + .7152 * (n >> 8 & 255) + .0722 * (n & 255)) / 255; }
function shade(hex, f) { const n = parseInt(hex.slice(1), 16); const c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => Math.round(clamp(v * f, 0, 255))); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); }

/* =========================================================
   Gradient map partagé (mode Threshold + intro) : points de couleur éditables
   ========================================================= */
const GM_PRESETS = [
  { name: 'Geeko',  stops: [[0, '#08080d'], [.3, '#ed210a'], [.5, '#ff6b14'], [.78, '#9ec4ed'], [1, '#f7faff']] },
  { name: 'Rouge',  stops: [[0, '#141010'], [.5, '#d11a1a'], [1, '#f4e9dc']] },
  { name: 'Orange', stops: [[0, '#da3a55'], [1, '#eca152']] },          // duotones du CodePen « gradient map »
  { name: 'Vert',   stops: [[0, '#73b882'], [1, '#dfe06f']] },
  { name: 'Violet', stops: [[0, '#a6276b'], [1, '#fae452']] },
  { name: 'Bleu',   stops: [[0, '#727fb6'], [1, '#96d1d7']] },
];
const GM = { stops: GM_PRESETS[0].stops.map(([p, c]) => ({ p, c })), preset: 0 };
try { const s = JSON.parse(localStorage.getItem('geeko-gradient-map') || 'null'); if (s && Array.isArray(s.stops) && s.stops.length >= 2) { GM.stops = s.stops; GM.preset = s.preset ?? -1; } } catch (_) {}
const gmSorted = () => GM.stops.slice().sort((a, b) => a.p - b.p);
const gmCSS = () => `linear-gradient(90deg, ${gmSorted().map(s => `${s.c} ${(s.p * 100).toFixed(1)}%`).join(', ')})`;
function gmLut() {
  const [, x] = cnv(256, 1); const g = x.createLinearGradient(0, 0, 256, 0);
  gmSorted().forEach(s => g.addColorStop(clamp(s.p, 0, 1), s.c)); x.fillStyle = g; x.fillRect(0, 0, 256, 1);
  return x.getImageData(0, 0, 256, 1).data;
}
let LUT = gmLut();
/* début « clair » du dégradé : la vague de l'intro saute les tons trop sombres (pas de noir) */
function lutStart() { for (let i = 0; i < 256; i++) { const k = i * 4; if ((.2126 * LUT[k] + .7152 * LUT[k + 1] + .0722 * LUT[k + 2]) / 255 > .22) return Math.min(i / 255, .6); } return 0; }
const lutTex = new THREE.DataTexture(new Uint8Array(LUT), 256, 1); lutTex.magFilter = lutTex.minFilter = THREE.LinearFilter; lutTex.needsUpdate = true;

/* threshold + gradient map : luminance étirée (2 % – 98 %), contraste en S, puis passage dans le dégradé */
const thrCache = new Map();
function thresholded(img) {
  if (thrCache.has(img)) return thrCache.get(img);
  const [c, x] = cnv(600, 600); x.drawImage(img, 0, 0, 600, 600);
  const d = x.getImageData(0, 0, 600, 600), a = d.data, hist = new Uint32Array(256), L = new Uint8Array(600 * 600);
  for (let i = 0, j = 0; i < a.length; i += 4, j++) { const l = (a[i] * .2126 + a[i + 1] * .7152 + a[i + 2] * .0722) | 0; L[j] = l; hist[l]++; }
  let acc = 0, lo = 0, hi = 255; const n = L.length;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc < n * .02) lo = i; if (acc <= n * .98) hi = i; }
  const span = Math.max(1, hi - lo);
  for (let i = 0, j = 0; i < a.length; i += 4, j++) {
    let v = clamp((L[j] - lo) / span, 0, 1); v = v * v * (3 - 2 * v); v = v * v * (3 - 2 * v);   // contraste « threshold doux »
    const k = (v * 255 | 0) * 4; a[i] = LUT[k]; a[i + 1] = LUT[k + 1]; a[i + 2] = LUT[k + 2];
  }
  x.putImageData(d, 0, 0); thrCache.set(img, c); return c;
}

/* Face avant du boîtier : charnière + livret 120 mm + languettes + reflets */
function drawFront(p, v, thr) {
  const [c, x] = cnv(142 * PX, 125 * PX);
  const col = p.variants[v].color, img = COVERS[`${p.index}-${v}`];
  x.fillStyle = '#c9cdd0'; x.fillRect(0, 0, c.width, c.height);
  // tranche de la jaquette visible sous la charnière (16 mm)
  x.fillStyle = col; x.fillRect(0, 0, 16 * PX, c.height);
  // nervures de charnière
  for (let i = 0; i < 6 * PX; i += 6) { x.fillStyle = i % 12 ? 'rgba(255,255,255,.28)' : 'rgba(0,0,0,.18)'; x.fillRect(i, 0, 3, c.height); }
  const g = x.createLinearGradient(0, 0, 16 * PX, 0); g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(.5, 'rgba(0,0,0,.12)'); g.addColorStop(1, 'rgba(255,255,255,.15)');
  x.fillStyle = g; x.fillRect(0, 0, 16 * PX, c.height);
  // livret 120 × 120 mm
  if (img) x.drawImage(thr ? thresholded(img) : img, 16 * PX, 2.5 * PX, 120 * PX, 120 * PX);
  x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 2; x.strokeRect(16 * PX, 2.5 * PX, 120 * PX, 120 * PX);
  // languettes « demi-lune » qui tiennent le livret
  x.fillStyle = 'rgba(255,255,255,.42)'; x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 2;
  for (const y of [22, 103]) { x.beginPath(); x.ellipse(136 * PX, y * PX, 2.4 * PX, 6 * PX, 0, Math.PI / 2, Math.PI * 1.5); x.fill(); x.stroke(); }
  // bord du plastique
  x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 6; x.strokeRect(3, 3, c.width - 6, c.height - 6);
  x.strokeStyle = 'rgba(0,0,0,.14)'; x.lineWidth = 3; x.strokeRect(10, 10, c.width - 20, c.height - 20);
  return c;
}
/* Tranche (jaquette arrière repliée, 6 mm) */
function drawSpine(p) {
  const [c, x] = cnv(104, 125 * PX);
  const col = p.variants[0].color, light = lum(col) > .55;
  x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = 'rgba(255,255,255,.25)'; x.fillRect(0, 0, c.width, 4); x.fillRect(0, c.height - 4, c.width, 4);
  x.save(); x.translate(c.width / 2, c.height / 2); x.rotate(Math.PI / 2);
  x.fillStyle = light ? '#111' : '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '52px Anton, Impact, sans-serif'; x.fillText(p.name.toUpperCase(), -40, 2);
  x.font = '500 20px "IBM Plex Mono", monospace'; x.fillText('GEEKO', 400, 2); x.fillText(pad(p.index + 1), -430, 2);
  x.restore();
  const g = x.createLinearGradient(0, 0, c.width, 0); g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(.3, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.15)');
  x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
  return c;
}
/* Dessus / dessous : plastique transparent strié */
function drawEdge() {
  const [c, x] = cnv(142 * PX, 104);
  const g = x.createLinearGradient(0, 0, 0, c.height); g.addColorStop(0, '#f1f3f4'); g.addColorStop(.5, '#bfc4c7'); g.addColorStop(1, '#e3e6e8');
  x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i < c.width; i += 10) x.fillRect(i, 0, 2, c.height);
  return c;
}
/* Dos : jaquette arrière (liste des variantes + code-barres) */
function drawBack(p) {
  const [c, x] = cnv(142 * PX, 125 * PX); const col = p.variants[0].color;
  x.fillStyle = shade(col, .55); x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = col; x.fillRect(0, 0, 48, c.height); x.fillRect(c.width - 48, 0, 48, c.height);
  x.fillStyle = '#fff'; x.font = '90px Anton, Impact, sans-serif'; x.fillText(p.name.toUpperCase(), 110, 170);
  x.font = '500 28px "IBM Plex Mono", monospace';
  p.variants.forEach((v, i) => x.fillText(`${pad(i + 1)}  ${v.label.toUpperCase()}`, 110, 260 + i * 46));
  x.fillStyle = '#fff'; x.fillRect(820, 820, 230, 120);
  x.fillStyle = '#111'; let s = p.index * 7 + 3; for (let i = 836; i < 1035; i += 4) { s = (s * 9301 + 49297) % 233280; if (s / 233280 > .45) x.fillRect(i, 832, (s % 3) + 1, 80); }
  x.fillStyle = 'rgba(255,255,255,.7)'; x.font = '22px "IBM Plex Mono", monospace'; x.fillText('GEEKO DESIGN — GRAPHISME', 110, 930);
  return c;
}
/* Plateau noir : logement du disque, encoches, moyeu à dents */
function drawTray(p) {
  const [c, x] = cnv(142 * PX, 125 * PX); const cx = 76 * PX, cy = 62.5 * PX;
  x.fillStyle = '#18191b'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = p.variants[0].color; x.fillRect(0, 0, 6 * PX, c.height);                // tranche visible côté charnière
  let g = x.createRadialGradient(cx, cy, 10, cx, cy, 61 * PX); g.addColorStop(0, '#26282b'); g.addColorStop(1, '#141517');
  x.fillStyle = g; x.beginPath(); x.arc(cx, cy, 61 * PX, 0, Math.PI * 2); x.fill();
  x.strokeStyle = 'rgba(255,255,255,.10)'; x.lineWidth = 4; x.stroke();
  for (const ex of [cx - 61 * PX, cx + 61 * PX]) { x.fillStyle = '#0d0e0f'; x.beginPath(); x.arc(ex, cy, 7 * PX, 0, Math.PI * 2); x.fill(); }   // encoches pour les doigts
  for (let i = 0; i < 12; i++) {                                                         // dents du moyeu
    x.save(); x.translate(cx, cy); x.rotate(i * Math.PI / 6);
    x.fillStyle = i % 2 ? '#3d4045' : '#4a4e53'; x.beginPath(); x.moveTo(6.6 * PX, -2 * PX); x.lineTo(11.5 * PX, -2.6 * PX); x.lineTo(11.5 * PX, 2.6 * PX); x.lineTo(6.6 * PX, 2 * PX); x.fill();
    x.restore();
  }
  x.fillStyle = '#0b0b0c'; x.beginPath(); x.arc(cx, cy, 6.4 * PX, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(255,255,255,.08)'; x.font = '500 22px "IBM Plex Mono", monospace'; x.fillText('GEEKO DESIGN', 10 * PX, 120 * PX);
  return c;
}
/* Intérieur du livret (face visible quand le boîtier est ouvert) */
function drawInside(p, vi) {
  const [c, x] = cnv(142 * PX, 125 * PX);
  x.fillStyle = '#c9cdd0'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#efede7'; x.fillRect(6 * PX, 2.5 * PX, 120 * PX, 120 * PX);
  x.fillStyle = '#111'; x.font = '110px Anton, Impact, sans-serif';
  const words = p.name.toUpperCase().split(' '); let y = 190; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > 820 && line) { x.fillText(line, 110, y); y += 110; line = w; } else line = t; }
  x.fillText(line, 110, y);
  x.font = '500 26px "IBM Plex Mono", monospace'; x.fillStyle = '#555'; x.fillText(`${pad(p.index + 1)} — ${p.type.toUpperCase()}`, 110, y + 60);
  p.variants.forEach((v, i) => {
    const yy = 560 + i * 54; x.fillStyle = v.color; x.beginPath(); x.arc(122, yy - 9, 11, 0, Math.PI * 2); x.fill();
    x.fillStyle = i === vi ? '#111' : '#777'; x.font = `${i === vi ? 500 : 400} 28px "IBM Plex Mono", monospace`;
    x.fillText(`${pad(i + 1)}  ${v.label.toUpperCase()}${i === vi ? '  ◀' : ''}`, 150, yy);
  });
  x.fillStyle = '#888'; x.font = '22px "IBM Plex Mono", monospace'; x.fillText('GEEKO DESIGN — GRAPHISME', 110, 940);
  x.fillStyle = 'rgba(255,255,255,.45)'; x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 2;   // languettes vues de l'intérieur
  for (const y2 of [22, 103]) { x.beginPath(); x.ellipse(126 * PX, y2 * PX, 2.4 * PX, 6 * PX, 0, Math.PI / 2, Math.PI * 1.5); x.fill(); x.stroke(); }
  return c;
}
/* Disque : trou 15 mm, zone de serrage transparente, anneau d'empilement,
   bande miroir avec texte circulaire, impression de 46 à 118 mm, bord transparent */
function drawDisc(p, v, thr) {
  const S = 1024, R = S / 2, [c, x] = cnv(S, S), img = COVERS[`${p.index}-${v}`];
  const r = mm => mm / 120 * S;                        // diamètre (mm) -> rayon (px) = mm/120*S/2*2/2
  const rad = mm => r(mm) / 2;
  x.translate(R, R);
  const ring = (a, b, fill) => { x.beginPath(); x.arc(0, 0, rad(b), 0, Math.PI * 2); x.arc(0, 0, rad(a), 0, Math.PI * 2, true); x.fillStyle = fill; x.fill(); };
  ring(15, 33, 'rgba(225,232,238,.38)');                       // zone de serrage (transparente)
  ring(33, 34.5, 'rgba(255,255,255,.75)');
  ring(34.5, 38, 'rgba(160,166,172,.85)');                     // anneau d'empilement
  let g = x.createLinearGradient(-R, -R, R, R); g.addColorStop(0, '#e9ecee'); g.addColorStop(.5, '#a9b0b6'); g.addColorStop(1, '#f2f4f5');
  ring(38, 46, g);                                             // bande miroir
  x.save(); x.beginPath(); x.arc(0, 0, rad(118), 0, Math.PI * 2); x.arc(0, 0, rad(46), 0, Math.PI * 2, true); x.clip();
  if (img) x.drawImage(thr ? thresholded(img) : img, -rad(118), -rad(118), rad(118) * 2, rad(118) * 2);
  else { x.fillStyle = p.variants[v].color; x.fillRect(-R, -R, S, S); }
  x.restore();
  ring(118, 120, 'rgba(225,230,235,.55)');                     // bord transparent
  // texte circulaire sur la bande miroir
  const txt = `GEEKO DESIGN ✦ ${p.name.toUpperCase()} ✦ ${pad(v + 1)}/${pad(p.variants.length)} ✦ `;
  x.fillStyle = 'rgba(20,20,20,.62)'; x.font = '500 14px "IBM Plex Mono", monospace'; x.textAlign = 'center';
  const rr = rad(42) - 4, total = Math.PI * 2; let a = -Math.PI / 2;
  const full = txt.repeat(3); const step = total / full.length;
  for (const ch of full) { x.save(); x.rotate(a + Math.PI / 2); x.translate(0, -rr); x.fillText(ch, 0, 5); x.restore(); a += step; }
  return c;
}
function drawDiscBack() {
  const S = 1024, R = S / 2, [c, x] = cnv(S, S); x.translate(R, R);
  const rad = mm => mm / 120 * S / 2;
  const ring = (a, b, f) => { x.beginPath(); x.arc(0, 0, rad(b), 0, Math.PI * 2); x.arc(0, 0, rad(a), 0, Math.PI * 2, true); x.fillStyle = f; x.fill(); };
  ring(15, 38, 'rgba(225,232,238,.4)');
  const g = x.createRadialGradient(0, 0, rad(38), 0, 0, rad(120)); g.addColorStop(0, '#dfe3e6'); g.addColorStop(1, '#b8bec3');
  ring(38, 118, g); ring(118, 120, 'rgba(225,230,235,.55)');
  return c;
}

/* =========================================================
   Matériaux
   ========================================================= */
const edgeMat = new THREE.MeshPhysicalMaterial({ map: tex('edge', drawEdge), roughness: .18, clearcoat: 1, clearcoatRoughness: .05 });
const matCache = new Map();
function caseMaterials(p, thr) {
  const k = `${p.index}-${thr}`; if (matCache.has(k)) return matCache.get(k);
  const front = new THREE.MeshPhysicalMaterial({ map: tex(`front-${p.index}-0-${thr}`, () => drawFront(p, 0, thr)), roughness: .3, clearcoat: 1, clearcoatRoughness: .06 });
  const spine = new THREE.MeshPhysicalMaterial({ map: tex(`spine-${p.index}`, () => drawSpine(p)), roughness: .3, clearcoat: .9, clearcoatRoughness: .08 });
  const back = new THREE.MeshPhysicalMaterial({ map: tex(`back-${p.index}`, () => drawBack(p)), roughness: .35, clearcoat: .8 });
  const m = [spine, spine, edgeMat, edgeMat, front, back];      // +x, -x, +y, -y, +z (avant), -z (dos)
  matCache.set(k, m); return m;
}
const discBackTex = () => tex('discback', drawDiscBack);
/* Carte PBR de la face imprimée : R = irisation, G = rugosité, B = métal
   (moyeu transparent lisse, bande miroir chromée, étiquette satinée, bord poli) */
function drawDiscPBR() {
  const S = 512, [c, x] = cnv(S, S); x.translate(S / 2, S / 2);
  const rad = mm => mm / 120 * S / 2;
  const ring = (a, b, r, g, bl) => { x.beginPath(); x.arc(0, 0, rad(b), 0, Math.PI * 2); x.arc(0, 0, rad(a), 0, Math.PI * 2, true); x.fillStyle = `rgb(${r},${g},${bl})`; x.fill(); };
  ring(0, 33, 40, 18, 0);          // zone de serrage : polycarbonate lisse
  ring(33, 38, 40, 80, 200);       // anneau d'empilement : métal brossé
  ring(38, 46, 70, 30, 255);       // bande miroir : chrome
  ring(46, 118, 0, 120, 0);        // étiquette imprimée : satinée
  ring(118, 120, 200, 25, 120);    // bord : poli
  return c;
}
const discPBR = () => tex('discpbr', drawDiscPBR);
const discMatCache = new Map();
function discMaterial(p, v, thr) {
  const k = `${p.index}-${v}-${thr}`; if (discMatCache.has(k)) return discMatCache.get(k);
  const pbr = discPBR();
  const m = new THREE.MeshPhysicalMaterial({
    map: tex(`disc-${p.index}-${v}-${thr}`, () => drawDisc(p, v, thr)), transparent: true, alphaTest: .02, side: THREE.DoubleSide,
    roughness: 1, metalness: 1, roughnessMap: pbr, metalnessMap: pbr,
    clearcoat: .55, clearcoatRoughness: .08, specularIntensity: .7,
    iridescence: 1, iridescenceMap: pbr, iridescenceIOR: 1.6, iridescenceThicknessRange: [250, 650], envMapIntensity: 1.1,
  });
  discMatCache.set(k, m); return m;
}
/* Face gravée : argent miroir + diffraction arc-en-ciel des pistes (d'après le shader CD de J. Stam) */
let _discBack = null;
function discBackMat() {
  if (_discBack) return _discBack;
  const m = new THREE.MeshPhysicalMaterial({ map: discBackTex(), transparent: true, alphaTest: .02, metalness: 1, roughness: .16, color: 0xe8ebee, envMapIntensity: 1.25 });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTanV;\nvarying vec3 vRadV;\nvarying vec2 vDiscP;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vDiscP = position.xy;
        vTanV = normalize((modelViewMatrix * vec4(-position.y, position.x, 0.0, 0.0)).xyz);
        vRadV = normalize((modelViewMatrix * vec4(position.x, position.y, 0.0, 0.0)).xyz);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vTanV; varying vec3 vRadV; varying vec2 vDiscP;
        vec3 bump3(vec3 x) { vec3 y = 1.0 - x * x; return max(y, vec3(0.0)); }
        vec3 cdDiffract(vec3 L, vec3 V, vec3 N, vec3 T, vec3 R) {
          vec3 Hh = L + V;
          float u = abs(dot(T, Hh)) * 1.6, w = max(dot(N, Hh), 0.05);
          vec3 c = vec3(0.0);
          for (int n = 1; n <= 6; n++) { float y = 2.0 * u / float(n) - 1.0; c += bump3(vec3(4.0 * (y - 0.75), 4.0 * (y - 0.5), 4.0 * (y - 0.25))); }
          float band = exp(-pow(dot(R, normalize(Hh)) * 4.0, 2.0));
          float e = 2.2 * dot(T, Hh) / w, hi = exp(-e * e);
          return c * band * 1.35 + vec3(hi * band * 0.45);
        }`)
      .replace('#include <opaque_fragment>', `{
          vec3 V = normalize(vViewPosition), N = normalize(normal), T = normalize(vTanV), R = normalize(vRadV);
          float rr = length(vDiscP) * 10.0;
          float zone = smoothstep(22.0, 24.0, rr) * (1.0 - smoothstep(58.0, 59.6, rr));
          vec3 dif = cdDiffract(normalize(vec3(-0.45, 0.75, 0.5)), V, N, T, R) + 0.7 * cdDiffract(normalize(vec3(0.7, 0.25, 0.65)), V, N, T, R);
          outgoingLight += dif * zone;
        }
        #include <opaque_fragment>`);
  };
  return (_discBack = m);
}
/* tranche du disque : polycarbonate argenté */
const discEdgeMat = new THREE.MeshPhysicalMaterial({ color: 0xd9dee2, metalness: .7, roughness: .22, clearcoat: 1, clearcoatRoughness: .05, side: THREE.DoubleSide });

/* =========================================================
   Étagère infinie
   ========================================================= */
const caseGeo = new RoundedBoxGeometry(W, H, D, 2, .1);
const proxyGeo = new THREE.BoxGeometry(W, H * 1.55, SPACING);
const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
const shelf = new THREE.Group(); scene.add(shelf);
const slots = [];
let active = DATA.slice();
let FX_THR = false, MODE = 'shelf';

function buildShelf() {
  for (let i = 0; i < COUNT; i++) {
    const g = new THREE.Group(); g.rotation.y = -Math.PI / 2 + FAN;          // face avant tournée vers -X (vers la caméra)
    const mesh = new THREE.Mesh(caseGeo, caseMaterials(DATA[0], false));
    mesh.castShadow = true; mesh.position.y = H / 2; g.add(mesh);
    const proxy = new THREE.Mesh(proxyGeo, proxyMat); proxy.position.y = H * .775; proxy.userData.slot = i; g.add(proxy);
    shelf.add(g);
    slots.push({ i, g, mesh, proxy, proj: null, shift: 0, lift: 0, pop: 1, popT: 1, delay: 0, pending: undefined });
  }
  assignSlots(true);
}
function assignSlots(instant) {
  const now = performance.now();
  slots.forEach(s => {
    const np = active.length ? active[s.i % active.length].index : null;
    if (instant) { s.proj = np; if (np != null) s.mesh.material = caseMaterials(DATA[np], FX_THR); s.pending = undefined; return; }
    if (np !== s.proj) { s.pending = np; s.delay = now + Math.abs(slotPos(s.i)) * 9; }
  });
}
let target = 0, scroll = 0, hovered = -1, drift = true;
const slotPos = i => mod(i * SPACING - scroll + L / 2, L) - L / 2;
/* tactile : le boîtier au centre de l'écran (x = CAM.target.x) fait office de survol */
const snapShelf = t => Math.round((t + CAM.target.x) / SPACING) * SPACING - CAM.target.x;
function centerSlot() {
  let best = -1, d = 1e9;
  for (const s of slots) { if (s.proj == null || s.pop > .2 || s.pending !== undefined) continue; const e = Math.abs(slotPos(s.i) - CAM.target.x); if (e < d) { d = e; best = s.i; } }
  return best;
}

/* =========================================================
   Vue « Disques » (réf. A24) — rattachée à la caméra
   ========================================================= */
const discRig = new THREE.Group(); camera.add(discRig);
const POOL = 9; const pool = [];
/* Disque Ø 120 mm, trou Ø 15 mm, épaisseur 1,2 mm */
const DISC_T = .12;
const discGeo = new THREE.RingGeometry(.75, 6, 160, 1);
const discRimGeo = new THREE.CylinderGeometry(6, 6, DISC_T, 160, 1, true).rotateX(Math.PI / 2);
const discHoleGeo = new THREE.CylinderGeometry(.75, .75, DISC_T, 48, 1, true).rotateX(Math.PI / 2);
function makeDiscMesh() {
  const holder = new THREE.Group(); const spin = new THREE.Group(); holder.add(spin);
  const front = new THREE.Mesh(discGeo, discMaterial(DATA[0], 0, false));
  const back = new THREE.Mesh(discGeo, discBackMat()); back.rotation.y = Math.PI; back.position.z = -DISC_T;
  const rim = new THREE.Mesh(discRimGeo, discEdgeMat); rim.position.z = -DISC_T / 2;
  const hole = new THREE.Mesh(discHoleGeo, discEdgeMat); hole.position.z = -DISC_T / 2;
  spin.add(front, back, rim, hole); holder.userData = { spin, front, back };
  return holder;
}
for (let k = 0; k < POOL; k++) { const h = makeDiscMesh(); h.userData.k = k; h.userData.front.userData.disc = k; discRig.add(h); pool.push(h); }
let dScroll = 0, dTarget = 0, discVis = 0;

/* =========================================================
   Boîtier « héros » détaillé (ouverture)
   ========================================================= */
const heroScene = new THREE.Scene();
heroScene.environment = scene.environment; heroScene.environmentIntensity = .75;
heroScene.add(new THREE.HemisphereLight(0xffffff, 0x8f8f8a, .6));
const hKey = new THREE.DirectionalLight(0xffffff, 1.5); heroScene.add(hKey);
const presenter = new THREE.Group(); presenter.matrixAutoUpdate = false; heroScene.add(presenter);
const veil = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false }));
veil.position.z = -1.01; veil.frustumCulled = false;
const veilScene = new THREE.Scene(), veilHolder = new THREE.Group(); veilHolder.matrixAutoUpdate = false; veilHolder.add(veil); veilScene.add(veilHolder);
function syncPresenter() {
  camera.updateMatrixWorld(); presenter.matrix.copy(camera.matrixWorld); presenter.updateMatrixWorld(true); veilHolder.matrix.copy(camera.matrixWorld); veilHolder.updateMatrixWorld(true);
  hKey.position.set(-20, 30, 25).applyMatrix4(camera.matrixWorld); hKey.target.position.copy(camera.position); hKey.target.updateMatrixWorld();
}
const hero = new THREE.Group();         // position animée
const tilt = new THREE.Group();         // parallaxe souris
const turn = new THREE.Group();         // rotation 360° au clic maintenu
hero.add(turn); turn.add(tilt);
const ROT = { hero: { x: 0, y: 0, vx: 0, vy: 0 }, disc: { x: 0, y: 0, vx: 0, vy: 0 }, pool: { x: 0, y: 0, vx: 0, vy: 0 }, poolIdx: 0 };
const rotReset = r => { r.x = r.y = r.vx = r.vy = 0; };
let drag = null;
const clearMat = new THREE.MeshPhysicalMaterial({ color: 0xeef3f6, transparent: true, opacity: .2, roughness: .04, clearcoat: 1, clearcoatRoughness: .02, depthWrite: false, envMapIntensity: 1.4 });
const H_ = {};
(function buildHero() {
  const base = new THREE.Group(); tilt.add(base);
  const shell = new THREE.Mesh(new RoundedBoxGeometry(W, H, .34, 2, .08), clearMat); shell.position.z = -D / 2 + .17; base.add(shell);
  H_.tray = new THREE.Mesh(new THREE.PlaneGeometry(W - .1, H - .1), new THREE.MeshPhysicalMaterial({ roughness: .45, clearcoat: .6, clearcoatRoughness: .2 }));
  H_.tray.position.z = -D / 2 + .36; base.add(H_.tray);
  const wallGeo = new THREE.PlaneGeometry(D * .62, H);
  H_.wallL = new THREE.Mesh(wallGeo, new THREE.MeshPhysicalMaterial({ roughness: .3, clearcoat: .9 }));
  H_.wallL.rotation.y = -Math.PI / 2; H_.wallL.position.set(-W / 2, 0, -D / 2 + D * .31); base.add(H_.wallL);
  H_.wallR = H_.wallL.clone(); H_.wallR.rotation.y = Math.PI / 2; H_.wallR.position.x = W / 2; base.add(H_.wallR);
  for (const s of [1, -1]) { const e = new THREE.Mesh(new THREE.PlaneGeometry(W, D * .62), edgeMat); e.rotation.x = s * -Math.PI / 2; e.position.set(0, s * H / 2, -D / 2 + D * .31); base.add(e); }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(.62, .7, .32, 24), new THREE.MeshStandardMaterial({ color: 0x3b3e42, roughness: .5 }));
  hub.rotation.x = Math.PI / 2; hub.position.set(.6, 0, -D / 2 + .5); base.add(hub);
  // disque posé sur le moyeu
  H_.discHolder = new THREE.Group(); H_.discHolder.position.set(.6, 0, -D / 2 + .56); base.add(H_.discHolder);
  H_.discTurn = new THREE.Group(); H_.discHolder.add(H_.discTurn);
  H_.disc = makeDiscMesh(); H_.discTurn.add(H_.disc); H_.disc.userData.front.userData.heroDisc = true;
  // couvercle : pivote sur la charnière gauche
  H_.lid = new THREE.Group(); H_.lid.position.set(-W / 2, 0, D / 2 - .12); tilt.add(H_.lid);
  H_.lidFront = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshPhysicalMaterial({ roughness: .3, clearcoat: 1, clearcoatRoughness: .05 }));
  H_.lidFront.position.set(W / 2, 0, -.02); H_.lid.add(H_.lidFront);
  H_.lidIn = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshPhysicalMaterial({ roughness: .5, clearcoat: .5 }));
  H_.lidIn.rotation.y = Math.PI; H_.lidIn.position.set(W / 2, 0, -.05); H_.lid.add(H_.lidIn);
  const lidPlastic = new THREE.Mesh(new RoundedBoxGeometry(W, H, .22, 2, .06), clearMat); lidPlastic.position.set(W / 2, 0, .06); H_.lid.add(lidPlastic);
  const pinMat = new THREE.MeshPhysicalMaterial({ color: 0xdfe6ea, roughness: .1, clearcoat: 1, transparent: true, opacity: .7 });
  for (const s of [1, -1]) { const pin = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, 1.4, 16), pinMat); pin.position.set(.05, s * (H / 2 - .9), 0); H_.lid.add(pin); }
  hero.visible = false;
  hero.traverse(o => { if (o.isMesh) o.castShadow = false; });
})();
let heroProj = 0, heroVar = 0;
function heroSet(pi, vi) {
  const p = DATA[pi]; heroProj = pi; heroVar = vi;
  H_.lidFront.material.map = tex(`front-${pi}-${vi}-false`, () => drawFront(p, vi, false)); H_.lidFront.material.needsUpdate = true;
  H_.lidIn.material.map = tex(`inside-${pi}-${vi}`, () => drawInside(p, vi)); H_.lidIn.material.needsUpdate = true;
  H_.tray.material.map = tex(`tray-${pi}`, () => drawTray(p)); H_.tray.material.needsUpdate = true;
  const sp = tex(`spine-${pi}`, () => drawSpine(p));
  H_.wallL.material.map = sp; H_.wallL.material.needsUpdate = true;
  H_.disc.userData.front.material = discMaterial(p, vi, false);
}

/* =========================================================
   Tweens
   ========================================================= */
const tweens = [];
function tween(dur, update, e = ease.inOut) { return new Promise(res => tweens.push({ t0: performance.now(), dur: reduce ? 1 : dur, update, e, res })); }
function runTweens(now) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const t = tweens[i], k = clamp((now - t.t0) / t.dur, 0, 1); t.update(t.e(k));
    if (k >= 1) { tweens.splice(i, 1); t.res(); }
  }
}
const sleep = ms => new Promise(r => setTimeout(r, reduce ? 0 : ms));

/* =========================================================
   Ouverture / fermeture
   ========================================================= */
let STATE = 'browse', openSlot = null, discZoom = false, token = 0;
const v3 = new THREE.Vector3(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
function poses() {
  const a = innerWidth / innerHeight, t = Math.tan(THREE.MathUtils.degToRad(15));
  if (a < .8) {
    const dC = (W * 1.15) / (t * a), dF = dC * 1.2;
    return { C: new THREE.Vector3(W * .5, 0, -dC), F: new THREE.Vector3(W * .5, dF * t * .45, -dF), cRot: new THREE.Euler(.05, -.1, 0), fRot: new THREE.Euler(.18, .22, 0) };
  }
  const dC = Math.max(12.5 / (1.25 * t), (W * 2.3) / (2 * t * a)), dF = Math.max(70, (W * 2.4) / (t * a * .95));
  const hw = dF * t * a;
  return { C: new THREE.Vector3(W * .5, 0, -dC), F: new THREE.Vector3(-hw * .5 + W * .45, -.6, -dF), cRot: new THREE.Euler(.05, -.12, 0), fRot: new THREE.Euler(.14, .3, 0) };
}
async function openProject(pi, slot) {
  if (STATE !== 'browse') return;
  STATE = 'opening'; const my = ++token; discZoom = false;
  document.body.classList.add('opened'); setHover(-1); closeSugg();
  heroSet(pi, 0); panelSet(pi, 0, true);
  H_.lid.rotation.y = 0; H_.discHolder.position.set(.6, 0, -D / 2 + .56); H_.discHolder.scale.setScalar(1); H_.discHolder.rotation.set(0, 0, 0);
  rotReset(ROT.hero); rotReset(ROT.disc);
  hero.visible = true;
  const P = poses();
  if (slot) {
    openSlot = slot;
    slot.mesh.getWorldPosition(v3); slot.mesh.getWorldQuaternion(q1);
    syncPresenter(); heroScene.add(hero); hero.position.copy(v3); hero.quaternion.copy(q1); hero.scale.setScalar(1);
    presenter.attach(hero); slot.mesh.visible = false;
  } else {
    openSlot = null; presenter.add(hero); hero.position.set(0, -28, -60); hero.quaternion.setFromEuler(new THREE.Euler(.9, 0, 0));
  }
  // 1. le boîtier vient vers l'écran
  const p0 = hero.position.clone(); q1.copy(hero.quaternion); q2.setFromEuler(P.cRot);
  const pc = P.C.clone(); pc.x = 0;
  await tween(1000, k => { hero.position.lerpVectors(p0, pc, k); hero.quaternion.slerpQuaternions(q1, q2, k); });
  if (my !== token) return;
  // 2. il s'ouvre devant nous (le couvercle bascule sur sa charnière)
  await tween(950, k => { H_.lid.rotation.y = -2.92 * k; hero.position.x = pc.x + (P.C.x - pc.x) * k; }, ease.outBack);
  if (my !== token) return;
  // 3. il se range à gauche, le disque sort un peu, le design complet apparaît à droite
  $('#panel').classList.add('on'); $('#close').classList.add('on'); $('#tip').classList.add('on');
  const p1 = hero.position.clone(); q1.copy(hero.quaternion); q2.setFromEuler(P.fRot);
  await tween(1000, k => {
    hero.position.lerpVectors(p1, P.F, k); hero.quaternion.slerpQuaternions(q1, q2, k);
    H_.discHolder.position.set(.6, 0, -D / 2 + .56 + .12 * k);
  });
  if (my === token) STATE = 'open';
}
async function closeProject() {
  if (STATE !== 'open' && STATE !== 'opening') return;
  const my = ++token; STATE = 'closing';
  $('#panel').classList.remove('on'); $('#close').classList.remove('on'); $('#tip').classList.remove('on');
  const dp = H_.discHolder.position.clone(), ds = H_.discHolder.scale.x, dr = H_.discHolder.rotation.y;
  const lid0 = H_.lid.rotation.y;
  // remet le boîtier et le disque droits (chemin le plus court, modulo 360°)
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const r0 = { hx: wrap(ROT.hero.x), hy: wrap(ROT.hero.y), dx: wrap(ROT.disc.x), dy: wrap(ROT.disc.y) };
  ROT.hero.vx = ROT.hero.vy = ROT.disc.vx = ROT.disc.vy = 0; drag = null;
  await tween(650, k => {
    ROT.hero.x = r0.hx * (1 - k); ROT.hero.y = r0.hy * (1 - k); ROT.disc.x = r0.dx * (1 - k); ROT.disc.y = r0.dy * (1 - k);H_.discHolder.position.lerpVectors(dp, new THREE.Vector3(.6, 0, -D / 2 + .56), k); H_.discHolder.scale.setScalar(ds + (1 - ds) * k); H_.discHolder.rotation.y = dr * (1 - k); H_.lid.rotation.y = lid0 * (1 - k); });
  if (my !== token) return;
  const p0 = new THREE.Vector3(), qa = new THREE.Quaternion();
  if (openSlot && openSlot.proj === heroProj && MODE === 'shelf') {
    heroScene.attach(hero); p0.copy(hero.position); qa.copy(hero.quaternion);
    const s = openSlot;
    await tween(950, k => { s.mesh.getWorldPosition(v3); s.mesh.getWorldQuaternion(q2); hero.position.lerpVectors(p0, v3, k); hero.quaternion.slerpQuaternions(qa, q2, k); });
    s.mesh.visible = true;
  } else {
    p0.copy(hero.position); qa.copy(hero.quaternion); q2.setFromEuler(new THREE.Euler(.9, 0, 0));
    await tween(800, k => { hero.position.lerpVectors(p0, new THREE.Vector3(0, -30, -60), k); hero.quaternion.slerpQuaternions(qa, q2, k); });
    if (openSlot) openSlot.mesh.visible = true;
  }
  if (my !== token) return;
  hero.visible = false; presenter.add(hero);
  document.body.classList.remove('opened'); STATE = 'browse'; openSlot = null;
}
async function toggleDiscZoom() {
  if (STATE !== 'open') return;
  discZoom = !discZoom;
  const p0 = H_.discHolder.position.clone(), s0 = H_.discHolder.scale.x, r0 = H_.discHolder.rotation.y;
  const p1 = discZoom ? new THREE.Vector3(5.5, 0, 9) : new THREE.Vector3(.6, 0, -D / 2 + .56 + .12);
  const s1 = discZoom ? 1.35 : 1, r1 = discZoom ? -.3 : 0;
  await tween(800, k => { H_.discHolder.position.lerpVectors(p0, p1, k); H_.discHolder.scale.setScalar(s0 + (s1 - s0) * k); H_.discHolder.rotation.y = r0 + (r1 - r0) * k; });
}

/* =========================================================
   Panneau HTML (design complet + variantes)
   ========================================================= */
const panel = $('#panel'), frame = $('.frame', panel);
function panelSet(pi, vi, first) {
  const p = DATA[pi], v = p.variants[vi];
  $('h3', panel).textContent = p.name;
  $('.k', panel).textContent = `${pad(pi + 1)} — ${p.kind}`;
  $('.count2', panel).textContent = `${pad(vi + 1)} / ${pad(p.variants.length)}`;
  $('.vlabel', panel).textContent = v.label;
  const sw = $('.sw', panel);
  if (first) { sw.innerHTML = ''; p.variants.forEach((x, j) => { const b = document.createElement('button'); b.style.setProperty('--c', x.color); b.setAttribute('aria-label', x.label); b.onclick = () => goVariant(j); sw.appendChild(b); }); frame.innerHTML = ''; }
  [...sw.children].forEach((b, j) => b.classList.toggle('on', j === vi));
  const img = new Image(); img.src = v.full; img.alt = `${p.name} — ${v.label}`; img.className = first ? 'in' : 'pre';
  const olds = [...frame.querySelectorAll('img')]; frame.appendChild(img);
  if (img.complete) fitMeta(img); else img.addEventListener('load', () => fitMeta(img), { once: true });
  if (!first) { const go = () => requestAnimationFrame(() => requestAnimationFrame(() => { img.className = 'in'; olds.forEach(o => o.classList.add('out')); setTimeout(() => olds.forEach(o => o.remove()), 900); })); (img.decode ? img.decode() : Promise.resolve()).then(go, go); }
  document.documentElement.style.setProperty('--accent', v.color);
}
/* aligne titre / navigation sur la largeur réelle de l'affiche (object-fit: contain) */
function fitMeta(img = frame.querySelector('img:last-of-type')) {
  if (!img || !img.naturalWidth) return;
  const fw = frame.clientWidth, fh = frame.clientHeight;
  if (!fw || !fh) { panel.style.removeProperty('--iw'); return; }
  const w = Math.min(fw, fh * img.naturalWidth / img.naturalHeight);
  panel.style.setProperty('--iw', `${Math.round(w)}px`);
}
addEventListener('resize', () => fitMeta());
let discSpinBoost = 0;
function goVariant(k) {
  if (STATE !== 'open') return;
  const n = DATA[heroProj].variants.length; const vi = mod(k, n);
  heroSet(heroProj, vi); panelSet(heroProj, vi, false); discSpinBoost = 1;
}
$('#next').onclick = () => goVariant(heroVar + 1);
$('#prev').onclick = () => goVariant(heroVar - 1);
$('#close').onclick = closeProject;
frame.onclick = () => { const im = frame.querySelector('img.in:last-of-type') || frame.querySelector('img'); if (!im) return; $('#lb img').src = im.src; $('#lb').classList.add('on'); };
$('#lb').onclick = () => $('#lb').classList.remove('on');

/* =========================================================
   Recherche + filtres
   ========================================================= */
const F = { q: '', type: 'Tout' };
const hay = p => norm([p.name, p.kind, p.type, ...p.tags, ...p.colors, ...p.variants.map(v => v.label)].join(' '));
function matches(p) {
  if (F.type !== 'Tout' && p.type !== F.type) return false;
  if (F.q) { const h = hay(p); return norm(F.q).split(/\s+/).filter(Boolean).every(w => h.includes(w)); }
  return true;
}
function applyFilters() {
  active = DATA.filter(matches);
  $('#count').textContent = `${active.length} projet${active.length > 1 ? 's' : ''} / ${DATA.length}`;
  $('#reset').hidden = !(F.q || F.type !== 'Tout');
  $('#empty').classList.toggle('on', active.length === 0);
  assignSlots(false);
  dTarget = Math.round(dTarget); renderDinfo();
  if (active.length) setCaption(active[0].index);
}
const typesEl = $('#types');
TYPES.forEach(t => {
  const b = document.createElement('button'); b.className = 'chip'; b.textContent = t; b.setAttribute('aria-pressed', t === 'Tout');
  b.onclick = () => { F.type = t; [...typesEl.children].forEach(x => x.setAttribute('aria-pressed', x === b)); applyFilters(); };
  typesEl.appendChild(b);
});
/* filtres sur mobile : glisser horizontal fait main (aucun défilement natif = jamais de barre) */
let chipDrag = null;
typesEl.addEventListener('pointerdown', e => { chipDrag = { x: e.clientX, s: typesEl.scrollLeft, id: e.pointerId, moved: false }; });
typesEl.addEventListener('pointermove', e => {
  if (!chipDrag) return;
  const dx = e.clientX - chipDrag.x;
  if (!chipDrag.moved && Math.abs(dx) > 6) { chipDrag.moved = true; try { typesEl.setPointerCapture(chipDrag.id); } catch (_) {} }
  if (chipDrag.moved) typesEl.scrollLeft = chipDrag.s - dx;
});
const chipEnd = () => { if (chipDrag && chipDrag.moved) { typesEl.dataset.dragged = '1'; setTimeout(() => delete typesEl.dataset.dragged, 0); } chipDrag = null; };
addEventListener('pointerup', chipEnd); addEventListener('pointercancel', chipEnd);
typesEl.addEventListener('click', e => { if (typesEl.dataset.dragged) { e.stopPropagation(); e.preventDefault(); } }, true);   // un glisser n'est pas un clic
$('#reset').onclick = () => { F.q = ''; $('#q').value = ''; F.type = 'Tout'; [...typesEl.children].forEach((x, j) => x.setAttribute('aria-pressed', j === 0)); closeSugg(); applyFilters(); };
const q = $('#q'), sugg = $('#sugg'); let sel = 0, results = [];
function renderSugg() {
  results = F.q ? DATA.filter(matches) : [];
  if (!F.q) { closeSugg(); return; }
  sel = 0; sugg.classList.add('on');
  sugg.innerHTML = results.length ? results.map((p, i) => `<button role="option" data-i="${p.index}" class="${i === 0 ? 'sel' : ''}"><img src="${p.variants[0].cover}" alt=""><div><b>${p.name}</b><span>${p.type} · ${p.variants.length} variantes · ${p.colors.join(', ')}</span></div></button>`).join('') : `<div class="empty up">Aucun résultat pour « ${F.q.replace(/</g, '&lt;')} »</div>`;
  [...sugg.querySelectorAll('button')].forEach(b => b.onclick = () => openFromSearch(+b.dataset.i));
}
function closeSugg() { sugg.classList.remove('on'); }
function openFromSearch(pi) {
  closeSugg(); q.blur();
  if (MODE === 'shelf') { const s = nearestSlot(pi); if (s) { target += slotPos(s.i); setTimeout(() => openProject(pi, s), 450); return; } }
  openProject(pi, null);
}
q.addEventListener('input', () => { F.q = q.value.trim(); applyFilters(); renderSugg(); });
q.addEventListener('focus', () => { if (F.q) renderSugg(); });
q.addEventListener('blur', () => setTimeout(closeSugg, 150));
q.addEventListener('keydown', e => {
  const bs = [...sugg.querySelectorAll('button')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!bs.length) return; sel = mod(sel + (e.key === 'ArrowDown' ? 1 : -1), bs.length); bs.forEach((b, j) => b.classList.toggle('sel', j === sel)); }
  else if (e.key === 'Enter') { if (results[sel]) openFromSearch(results[sel].index); }
  else if (e.key === 'Escape') { q.value = ''; F.q = ''; applyFilters(); closeSugg(); q.blur(); }
  e.stopPropagation();
});
function nearestSlot(pi) { let best = null, d = 1e9; slots.forEach(s => { if (s.proj === pi && s.mesh.visible) { const p = Math.abs(slotPos(s.i)); if (p < d) { d = p; best = s; } } }); return best; }

/* =========================================================
   Légende, infos disque, modes
   ========================================================= */
const cap = $('#caption'); let capProj = -1, capT = 0;
function setCaption(pi) {
  if (pi === capProj) return; capProj = pi; cap.classList.add('swap'); clearTimeout(capT);
  capT = setTimeout(() => { const p = DATA[capProj]; $('.num', cap).textContent = `${pad(p.index + 1)} / ${pad(DATA.length)}`; $('.title span', cap).textContent = p.name; $('.kind', cap).textContent = `${p.type} — ${p.variants.length} variantes`; cap.classList.remove('swap'); }, 160);
}
function setHover(i) {
  if (i === hovered) return; hovered = i;
  canvas.style.cursor = i >= 0 ? 'pointer' : '';
  if (i >= 0) { drift = false; setCaption(slots[i].proj); }
  slots.forEach(s => { if (s.proj != null) s.mesh.material = caseMaterials(DATA[s.proj], FX_THR && s.i !== i); });
}
function curDisc() { return active.length ? active[mod(Math.round(dTarget), active.length)] : null; }
function renderDinfo() {
  const p = curDisc(); const el = $('#dinfo');
  if (!p) { $('h2', el).textContent = '—'; $('dl', el).innerHTML = ''; $('#dcount').textContent = '00 / 00'; return; }
  $('h2', el).textContent = p.name;
  $('dl', el).innerHTML = `<dt>Projet</dt><dd>${pad(p.index + 1)} / ${pad(DATA.length)}</dd><dt>Type</dt><dd>${p.type}</dd><dt>Support</dt><dd>${p.kind}</dd><dt>Variantes</dt><dd>${p.variants.map(v => `<i style="--c:${v.color}"></i>`).join('')}</dd><dt>Mots-clés</dt><dd>${p.tags.slice(0, 3).join(', ')}</dd>`;
  $('#dcount').textContent = `${pad(mod(Math.round(dTarget), active.length) + 1)} / ${pad(active.length)}`;
}
/* =========================================================
   Éditeur de gradient map : clic sur la barre = ajouter, glisser = déplacer,
   double-clic sur un point = retirer ; préréglages en haut
   ========================================================= */
const gmEl = $('#gm'), gmBtn = $('#gmBtn'), gmBar = $('#gmBar'), gmNodes = $('#gmNodes'), gmColor = $('#gmColor'), gmPresets = $('#gmPresets');
let gmSel = 0, gmThrT = 0, gmTap = { i: -1, t: 0 };
function gmSave() { try { localStorage.setItem('geeko-gradient-map', JSON.stringify(GM)); } catch (_) {} }
function gmRefreshThreshold() {
  thrCache.clear();
  for (const k of [...texCache.keys()]) if (k.endsWith('-true')) { texCache.get(k).dispose(); texCache.delete(k); }
  for (const k of [...matCache.keys()]) if (k.endsWith('-true')) matCache.delete(k);
  for (const k of [...discMatCache.keys()]) if (k.endsWith('-true')) discMatCache.delete(k);
  if (FX_THR) { slots.forEach(s => { if (s.proj != null) s.mesh.material = caseMaterials(DATA[s.proj], s.i !== hovered); }); pool.forEach(h => h.userData.assigned = null); }
}
function gmChanged(fromPreset, dragging) {
  if (!fromPreset) GM.preset = -1;
  LUT = gmLut(); lutTex.image.data.set(LUT); lutTex.needsUpdate = true; introMat.uniforms.uStart.value = lutStart();
  gmSave();
  if (dragging) { document.documentElement.style.setProperty('--gm', gmCSS()); [...gmPresets.children].forEach(b => b.setAttribute('aria-pressed', 'false')); }
  else gmRender();
  clearTimeout(gmThrT); gmThrT = setTimeout(gmRefreshThreshold, 140);   // recalcul des pochettes après le geste
}
function gmApplyPreset(i) {
  GM.stops = GM_PRESETS[i].stops.map(([p, c]) => ({ p, c })); GM.preset = i; gmSel = 0;
  if (!FX_THR) $('[data-fx="thr"]').click();
  gmChanged(true);
}
function gmPosFromEvent(e) { const r = gmBar.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1); }
function gmRender() {
  document.documentElement.style.setProperty('--gm', gmCSS());
  gmSel = clamp(gmSel, 0, GM.stops.length - 1);
  gmNodes.innerHTML = '';
  GM.stops.forEach((s, i) => {
    const n = document.createElement('div'); n.className = 'gm-node' + (i === gmSel ? ' sel' : '');
    n.style.left = `${s.p * 100}%`; n.style.setProperty('--c', s.c); n.innerHTML = '<i></i>';
    n.title = 'Glisser pour déplacer · double-clic (ou double-tap) pour retirer';
    n.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      const tt = performance.now();
      if (gmTap.i === i && tt - gmTap.t < 380) { gmTap.i = -1; if (GM.stops.length > 2) { GM.stops.splice(i, 1); gmSel = Math.max(0, i - 1); gmChanged(); } return; }
      gmTap = { i, t: tt }; gmSel = i; gmColor.value = s.c;
      [...gmNodes.children].forEach((x, j) => x.classList.toggle('sel', j === i));
      n.setPointerCapture(e.pointerId);
      const move = ev => { s.p = gmPosFromEvent(ev); n.style.left = `${s.p * 100}%`; gmChanged(false, true); };
      const up = () => { n.removeEventListener('pointermove', move); n.removeEventListener('pointerup', up); };
      n.addEventListener('pointermove', move); n.addEventListener('pointerup', up);
    });
    gmNodes.appendChild(n);
  });
  if (GM.stops[gmSel]) gmColor.value = GM.stops[gmSel].c;
  [...gmPresets.children].forEach((b, j) => b.setAttribute('aria-pressed', j === GM.preset));
}
GM_PRESETS.forEach((pr, i) => {
  const b = document.createElement('button'); b.title = pr.name; b.setAttribute('aria-label', `Gradient map ${pr.name}`);
  b.style.setProperty('--g', `linear-gradient(90deg, ${pr.stops.map(([p, c]) => `${c} ${p * 100}%`).join(', ')})`);
  b.onclick = () => gmApplyPreset(i); gmPresets.appendChild(b);
});
gmBar.addEventListener('click', e => {
  const p = gmPosFromEvent(e), k = (p * 255 | 0) * 4;
  const c = '#' + [LUT[k], LUT[k + 1], LUT[k + 2]].map(v => v.toString(16).padStart(2, '0')).join('');
  GM.stops.push({ p, c }); gmSel = GM.stops.length - 1; gmChanged();
});
gmColor.addEventListener('input', () => { if (GM.stops[gmSel]) { GM.stops[gmSel].c = gmColor.value; gmChanged(); } });
gmBtn.onclick = () => { const open = gmEl.hidden; gmEl.hidden = !open; gmBtn.setAttribute('aria-expanded', open); };
addEventListener('pointerdown', e => { if (!gmEl.hidden && !$('#gmw').contains(e.target)) { gmEl.hidden = true; gmBtn.setAttribute('aria-expanded', 'false'); } });
$('#gmReplay').onclick = () => {
  gmEl.hidden = true; gmBtn.setAttribute('aria-expanded', 'false');
  if (STATE !== 'browse') return;
  intro.on = true; intro.freeze = null; introResize(); intro.t0 = performance.now(); document.body.classList.add('intro');
};
gmRender();

$('#dprev').onclick = () => { dTarget = Math.round(dTarget) - 1; renderDinfo(); };
$('#dnext').onclick = () => { dTarget = Math.round(dTarget) + 1; renderDinfo(); };
document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => setMode(b.dataset.view));
document.querySelectorAll('[data-fx]').forEach(b => b.onclick = () => {
  // comme le CodePen : recliquer sur Threshold passe au gradient map suivant
  if (b.dataset.fx === 'thr' && FX_THR) { gmApplyPreset(GM.preset < 0 ? 0 : (GM.preset + 1) % GM_PRESETS.length); return; }
  FX_THR = b.dataset.fx === 'thr'; document.querySelectorAll('[data-fx]').forEach(x => x.setAttribute('aria-pressed', x === b));
  slots.forEach(s => { if (s.proj != null) s.mesh.material = caseMaterials(DATA[s.proj], FX_THR && s.i !== hovered); });
  pool.forEach(h => h.userData.assigned = null);
});
function setMode(m) {
  if (STATE !== 'browse' || m === MODE) return;
  MODE = m; document.body.classList.toggle('mode-discs', m === 'discs');
  document.querySelectorAll('[data-view]').forEach(x => x.setAttribute('aria-pressed', x.dataset.view === m));
  const now = performance.now();
  slots.forEach(s => { s.delay = now + Math.abs(slotPos(s.i)) * 7; });
  setHover(-1); renderDinfo();
  if (TOUCH && m === 'shelf') target = snapShelf(target);
}

/* =========================================================
   Entrées : souris (parallaxe + raycast), molette, tactile, clavier
   ========================================================= */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), mouse = new THREE.Vector2(), mouseS = new THREE.Vector2();
let pointerIn = false, downAt = null;
addEventListener('pointermove', e => {
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); pointerIn = e.target === canvas;
  if (e.pointerType === 'mouse') mouse.copy(ndc);
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y, t = performance.now(), dts = Math.max(.008, (t - drag.t) / 1000);
    drag.x = e.clientX; drag.y = e.clientY; drag.t = t; drag.dist += Math.abs(dx) + Math.abs(dy);
    if (drag.dist > 5) drag.moved = true;
    const r = ROT[drag.kind], ax = dy * .011, ay = dx * .011;
    r.x += ax; r.y += ay; r.vx = clamp(ax / dts, -7, 7); r.vy = clamp(ay / dts, -7, 7);
    return;
  }
  if (downAt && e.pointerType !== 'mouse') {
    const dy = e.clientY - downAt.y, dx = e.clientX - downAt.x, t = performance.now(), d = MODE === 'shelf' ? dy + dx : dx;
    if (MODE === 'shelf') target -= d * .12; else dTarget -= dx * .018;   // au doigt : l'étagère suit franchement
    const v = clamp(d / Math.max(8, t - (downAt.t || t - 16)), -4, 4);   // px/ms, pour l'élan au lâcher
    downAt = { x: e.clientX, y: e.clientY, t, v: downAt.moved ? downAt.v * .4 + v * .6 : v, moved: downAt.moved || Math.abs(dx) + Math.abs(dy) > 2 };
  }
});
canvas.addEventListener('pointerleave', () => { pointerIn = false; if (STATE === 'browse' && !TOUCH) setHover(-1); });
addEventListener('pointerdown', e => { TOUCH = e.pointerType !== 'mouse'; }, true);
canvas.addEventListener('pointerdown', e => {
  downAt = { x: e.clientX, y: e.clientY, t: performance.now(), v: 0, moved: false }; ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  // clic maintenu sur le boîtier ouvert, son disque, ou le disque central : rotation 360°
  ray.setFromCamera(ndc, camera); let kind = null;
  if (STATE === 'open') {
    if (ray.intersectObject(H_.disc, true).length) kind = 'disc';
    else if (ray.intersectObject(hero, true).length) kind = 'hero';
  } else if (STATE === 'browse' && MODE === 'discs' && !TOUCH) {
    const c = pool.find(h => h.userData.idx === Math.round(dTarget));
    if (c && ray.intersectObject(c, true).length) kind = 'pool';
  }
  if (kind) {
    drag = { kind, x: e.clientX, y: e.clientY, t: performance.now(), dist: 0, moved: false };
    ROT[kind].vx = ROT[kind].vy = 0; canvas.style.cursor = 'grabbing';
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  }
});
addEventListener('pointerup', e => {
  if (drag) {
    const d = drag; drag = null; downAt = null; canvas.style.cursor = '';
    if (performance.now() - d.t > 90) { ROT[d.kind].vx = ROT[d.kind].vy = 0; }   // lâché à l'arrêt : pas d'élan
    if (d.moved) return;                         // c'était une rotation, pas un clic
  }
  const wasDrag = downAt && downAt.moved, flick = wasDrag ? downAt.v : 0; downAt = null;
  if (e.target !== canvas || wasDrag) {
    if (STATE === 'browse' && wasDrag) {
      if (MODE === 'discs') { dTarget = Math.round(dTarget - flick * .9); renderDinfo(); }
      else if (TOUCH) target = snapShelf(target - flick * 14);   // élan puis aimantation sur un boîtier
    }
    return;
  }
  ray.setFromCamera(ndc, camera);
  if (STATE === 'open') {
    const h = ray.intersectObject(H_.disc, true)[0];
    if (h) toggleDiscZoom();
    return;
  }
  if (STATE !== 'browse') return;
  if (MODE === 'shelf') {
    // le boîtier sélectionné est soulevé : on teste d'abord son vrai volume (la zone de clic du slot reste en bas)
    if (hovered >= 0 && slots[hovered].proj != null && ray.intersectObject(slots[hovered].mesh, false).length) { const s = slots[hovered]; openProject(s.proj, s); return; }
    const h = ray.intersectObjects(slots.filter(s => s.mesh.visible && s.pop < .2).map(s => s.proxy), false)[0];
    if (h) {
      const s = slots[h.object.userData.slot];
      // tactile : toucher un boîtier l'amène au centre ; toucher celui du centre l'ouvre
      if (TOUCH && s.i !== hovered) target = snapShelf(scroll + slotPos(s.i) - CAM.target.x);
      else openProject(s.proj, s);
    }
  } else {
    const h = ray.intersectObjects(pool.map(p => p.userData.front), false)[0];
    if (h) {
      const k = h.object.userData.disc, idx = pool[k].userData.idx;
      if (idx === Math.round(dTarget)) { const p = curDisc(); if (p) openProject(p.index, null); }
      else { dTarget = idx; renderDinfo(); }
    }
  }
});
addEventListener('wheel', e => {
  if (e.target.closest && e.target.closest('header,#panel')) return;
  if (STATE !== 'browse') return; e.preventDefault();
  const d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
  if (MODE === 'shelf') { target += d * .028; drift = false; }
  else { wheelAcc += d; if (Math.abs(wheelAcc) > 60) { dTarget = Math.round(dTarget) + Math.sign(wheelAcc); wheelAcc = 0; renderDinfo(); } }
}, { passive: false });
let wheelAcc = 0;
addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement !== q) { e.preventDefault(); q.focus(); return; }
  if ($('#lb').classList.contains('on')) { if (e.key === 'Escape') $('#lb').classList.remove('on'); return; }
  if (STATE === 'open') { if (e.key === 'ArrowRight') goVariant(heroVar + 1); else if (e.key === 'ArrowLeft') goVariant(heroVar - 1); else if (e.key === 'Escape') closeProject(); return; }
  if (STATE !== 'browse' || e.target.tagName === 'INPUT') return;
  if (MODE === 'shelf') {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') target += SPACING;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') target -= SPACING;
  } else {
    if (e.key === 'ArrowRight') $('#dnext').click();
    if (e.key === 'ArrowLeft') $('#dprev').click();
    if (e.key === 'Enter') { const p = curDisc(); if (p) openProject(p.index, null); }
  }
});
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); cameraBase();
  if (TOUCH) target = snapShelf(target);
});

/* =========================================================
   Intro : « GEEKO DESIGN » apparaît en threshold,
   puis une vague de couleur (heightmap + gradient map postérisé) révèle le site
   ========================================================= */
const intro = { on: !reduce, t0: 0, started: false };
const introScene = new THREE.Scene(), introCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
function drawIntroText() {
  const dpr = Math.min(devicePixelRatio, 2), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  const [c, x] = cnv(w, h);
  x.fillStyle = '#000'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  let fs = Math.min(w * .16, h * .32); x.font = `${fs}px Anton, Impact, sans-serif`;
  const tw = x.measureText('GEEKO DESIGN').width; if (tw > w * .88) { fs *= w * .88 / tw; x.font = `${fs}px Anton, Impact, sans-serif`; }
  x.fillText('GEEKO DESIGN', w / 2, h / 2);
  x.font = `500 ${Math.max(11 * dpr, fs * .085)}px "IBM Plex Mono", monospace`;
  x.fillText('GRAPHISTE — PORTFOLIO', w / 2, h / 2 + fs * .7);
  const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; return t;
}
const introMat = new THREE.ShaderMaterial({
  transparent: true, depthTest: false, depthWrite: false,
  uniforms: { uText: { value: null }, uLut: { value: lutTex }, uStart: { value: lutStart() }, uT: { value: 0 }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    uniform sampler2D uText; uniform sampler2D uLut; uniform float uStart; uniform float uT; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p){ float v = 0.0, a = .5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= .5; } return v; }
    vec3 gmap(float v){ return texture2D(uLut, vec2(clamp(v, 0.0, 1.0) * .992 + .004, .5)).rgb; }   // gradient map éditable
    // champ liquide visqueux : bruit très doux à domaine déformé, mouvement lent
    float sfbm(vec2 p){ float v = 0.0, a = .55; for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 1.9; a *= .45; } return v; }
    float liquid(vec2 p, float t){
      vec2 w = vec2(sfbm(p * .9 + vec2(t * .18, 0.0)), sfbm(p * .9 + vec2(5.2, -t * .15)));
      return sfbm(p * 1.1 + w * 1.9 + vec2(0.0, t * .08));
    }
    void main(){
      vec2 uv = vUv; vec2 q = vec2(uv.x * uRes.x / uRes.y, uv.y);
      float n = liquid(q, uT);
      float txt = step(.5, texture2D(uText, uv).r);
      float appear = smoothstep(.1, 1.05, uT);                       // le nom se révèle par seuillage du bruit
      float tOn = txt * step(fbm(q * 2.4), appear * 1.2 - .1);
      float wp = clamp((uT - 1.5) / 1.8, 0.0, 1.0); wp = wp * wp * (3.0 - 2.0 * wp);
      float front = mix(-.6, 1.65, wp);
      // gouttes qui coulent vers le bas au bord de la vague
      float drip = smoothstep(.45, .85, noise(vec2(uv.x * 7.0, 1.7))) * (.4 + .6 * uv.y);   // lobes arrondis
      float d = uv.x * .78 + (1.0 - uv.y) * .22 + (n - .5) * .62 - drip * .09 - front;   // > 0 : pas encore atteint
      const float band = .32;
      float aa = fwidth(d) * 1.2;
      float edge = -d;                                               // > 0 : dans la vague
      float hgt = clamp(1.0 - edge / band, 0.0, 1.0);
      float h = smoothstep(0.0, 1.0, hgt + (liquid(q * 1.4 + 3.0, uT * .8) - .5) * .4);
      vec3 liq = gmap(mix(uStart, .74, h));                          // pas de noir, pas de blanc pur au bord
      // épaisseur visqueuse : bourrelet arrondi au bord + vagues internes -> normale -> reflets
      float thick = sqrt(clamp(edge / .05, 0.0, 1.0)) * .75 + h * .25;
      vec3 nrm = normalize(vec3(-dFdx(thick) * 90.0, -dFdy(thick) * 90.0, 1.0));
      vec3 L = normalize(vec3(-.4, .6, .7));
      float spec = pow(max(dot(reflect(-L, nrm), vec3(0.0, 0.0, 1.0)), 0.0), 70.0);
      float sheen = pow(max(dot(nrm, L), 0.0), 6.0);
      liq = liq * (.82 + .25 * sheen) + spec * .9;
      // avant la vague : blanc + nom, avec une ombre douce sous le bord (épaisseur)
      vec3 ink = mix(vec3(1.0), vec3(.078), tOn);
      ink *= 1.0 - .16 * exp(-max(d, 0.0) / .012);
      float ahead = smoothstep(-aa, aa, d);
      vec3 col = mix(liq, ink, ahead);
      float a = smoothstep(-band - aa, -band + aa, d);               // derrière la vague : le site
      gl_FragColor = vec4(col, a);
    }`,
});
const introQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), introMat); introQuad.frustumCulled = false; introScene.add(introQuad);
function introResize() { if (!intro.on) return; const old = introMat.uniforms.uText.value; introMat.uniforms.uText.value = drawIntroText(); if (old) old.dispose(); introMat.uniforms.uRes.value.set(innerWidth, innerHeight); }
addEventListener('resize', introResize);

/* =========================================================
   Boucle
   ========================================================= */
let last = performance.now();
const right = new THREE.Vector3(), up = new THREE.Vector3();
function loop(now) {
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  runTweens(now);
  if (TOUCH) mouse.set(Math.sin(now * .00035) * .22, Math.sin(now * .00027) * .14);   // pas de curseur : léger balancement
  mouseS.lerp(mouse, 1 - Math.pow(.002, dt));

  // caméra : parallaxe souris dans un vrai espace 3D
  right.set(1, 0, 0).applyQuaternion(camera.quaternion); up.set(0, 1, 0);
  const amp = STATE === 'browse' ? 1 : .45;
  camera.position.copy(CAM.pos).addScaledVector(right, mouseS.x * 4.2 * amp).addScaledVector(up, mouseS.y * 2.6 * amp);
  camera.lookAt(CAM.target);
  tilt.rotation.set(-mouseS.y * .16, mouseS.x * .22, 0);

  // étagère
  if (STATE === 'browse' && MODE === 'shelf' && drift && !reduce && !TOUCH) target += dt * 1.1;
  scroll += (target - scroll) * (1 - Math.pow(TOUCH && downAt ? 1e-6 : .0009, dt));   // doigt posé : suivi direct
  if (STATE === 'browse' && MODE === 'shelf' && TOUCH) setHover(centerSlot());
  else if (STATE === 'browse' && MODE === 'shelf' && pointerIn && !downAt) {
    ray.setFromCamera(mouse, camera);
    const h = ray.intersectObjects(slots.filter(s => s.mesh.visible && s.pop < .2).map(s => s.proxy), false)[0];
    setHover(h ? h.object.userData.slot : -1);
  }
  const hp = hovered >= 0 ? slotPos(hovered) : 0, nowMs = now;
  for (const s of slots) {
    const p = slotPos(s.i);
    // remplacement animé après un filtre (le boîtier rétrécit, change, revient)
    let popT = (MODE === 'shelf' && s.proj != null) ? 0 : 1;
    if (s.pending !== undefined) popT = 1;
    if (nowMs > s.delay) s.pop += (popT - s.pop) * (1 - Math.pow(.0005, dt));
    if (s.pending !== undefined && s.pop > .97) { s.proj = s.pending; s.pending = undefined; if (s.proj != null) s.mesh.material = caseMaterials(DATA[s.proj], FX_THR); }
    const want = hovered < 0 || s.i === hovered ? 0 : (p < hp ? -PART : PART);
    s.shift += (want - s.shift) * (1 - Math.pow(.0004, dt));
    s.lift += ((s.i === hovered ? LIFT : 0) - s.lift) * (1 - Math.pow(.0003, dt));
    const ends = clamp((L / 2 - Math.abs(p)) / 10, 0, 1);
    const sc = ends * (1 - ease.out(s.pop));
    s.g.visible = sc > .002;
    s.g.position.x = p + s.shift;
    s.g.scale.setScalar(Math.max(sc, .001));
    s.mesh.position.y = H / 2 + s.lift;
    s.mesh.rotation.x = -s.lift * .012;
  }

  // disques
  discVis += ((MODE === 'discs' && STATE !== 'opening' && STATE !== 'open' ? 1 : 0) - discVis) * (1 - Math.pow(.002, dt));
  discRig.visible = discVis > .005;
  dScroll += (dTarget - dScroll) * (1 - Math.pow(.004, dt));
  if (discRig.visible && active.length) {
    const a = innerWidth / innerHeight, mob = a < .8, sp = mob ? 13.5 : 16, dz = mob ? -68 : -50, dy = mob ? .9 : -.6;
    // disques bien de face et droits ; ils s'orientent vers le curseur
    discRig.position.set(0, -(1 - discVis) * 30, 0);
    discRig.rotation.set(0, 0, 0);
    const base = Math.round(dScroll), centerIdx = Math.round(dTarget);
    for (let k = 0; k < POOL; k++) {
      const h = pool[k], idx = base + k - 4, o = idx - dScroll, p = active[mod(idx, active.length)];
      h.userData.idx = idx;
      const keyA = `${p.index}-${FX_THR}`;
      if (h.userData.assigned !== keyA) { h.userData.front.material = discMaterial(p, 0, FX_THR); h.userData.assigned = keyA; }
      const ao = Math.abs(o), follow = ao < .5 ? 1 : .55;
      h.visible = ao < 4.2;
      h.position.set(o * sp, dy, dz - ao * 7);
      h.rotation.set(-mouseS.y * .42 * follow, mouseS.x * .55 * follow - o * .1, 0);
      h.scale.setScalar(1 - Math.min(ao, 3) * .06);
      // rotation 360° à la souris (disque central uniquement)
      const sp2 = h.userData.spin, isC = idx === centerIdx;
      if (!isC) { sp2.rotation.x *= Math.pow(.02, dt); sp2.rotation.y *= Math.pow(.02, dt); }
      else { sp2.rotation.x = ROT.pool.x; sp2.rotation.y = ROT.pool.y; }
      sp2.rotation.z = 0;
    }
    if (ROT.poolIdx !== centerIdx) { ROT.poolIdx = centerIdx; ROT.pool.x = ROT.pool.y = ROT.pool.vx = ROT.pool.vy = 0; }
  } else if (discRig.visible) pool.forEach(h => h.visible = false);

  // inertie des rotations à la souris
  for (const r of [ROT.hero, ROT.disc, ROT.pool]) {
    if (drag && ROT[drag.kind] === r) continue;
    r.x += r.vx * dt; r.y += r.vy * dt; const f = Math.pow(.012, dt); r.vx *= f; r.vy *= f;
  }
  turn.rotation.set(ROT.hero.x, ROT.hero.y, 0);
  H_.discTurn.rotation.set(ROT.disc.x, ROT.disc.y, 0);

  // disque du boîtier ouvert : rotation lente, accélère au changement de variante
  discSpinBoost *= Math.pow(.25, dt);
  H_.disc.userData.spin.rotation.z -= dt * (STATE === 'open' ? (.35 + discSpinBoost * 9) : 0);

  veil.material.opacity += ((STATE === 'browse' ? 0 : .78) - veil.material.opacity) * (1 - Math.pow(.003, dt));
  veil.scale.set(camera.aspect * .6, .6, 1);
  syncPresenter();
  renderer.autoClear = true;
  renderer.render(scene, camera);
  renderer.autoClear = false;
  if (veil.material.opacity > .003) renderer.render(veilScene, camera);
  if (hero.visible) { renderer.clearDepth(); renderer.render(heroScene, camera); }
  if (intro.on) {
    const t = intro.freeze != null ? intro.freeze : (now - intro.t0) / 1000; introMat.uniforms.uT.value = t;
    if (t > 3.0 && document.body.classList.contains('intro')) document.body.classList.remove('intro');
    if (t > 3.3) { intro.on = false; const tx = introMat.uniforms.uText.value; if (tx) tx.dispose(); }
    else renderer.render(introScene, introCam);
  }
}

/* =========================================================
   Démarrage
   ========================================================= */
(async function init() {
  const fontWait = Promise.race([Promise.all(['80px Anton', '500 20px "IBM Plex Mono"', '40px "Instrument Serif"'].map(f => document.fonts.load(f))), sleep(2500)]);
  const imgs = [];
  DATA.forEach((p, i) => p.variants.forEach((v, j) => imgs.push(loadImg(v.cover).then(im => { COVERS[`${i}-${j}`] = im; }))));
  await Promise.all([fontWait, ...imgs]);
  texCache.clear(); matCache.clear(); discMatCache.clear();
  edgeMat.map = tex('edge', drawEdge);
  buildShelf();
  applyFilters(); setCaption(0); renderDinfo();
  pool.forEach(h => h.userData.assigned = null);
  if (TOUCH) target = scroll = snapShelf(0);   // tactile : un boîtier pile au centre dès le départ
  slots.forEach(s => { s.delay = performance.now() + 250 + Math.abs(slotPos(s.i)) * 14; });
  if (intro.on) { introResize(); intro.t0 = performance.now(); } else document.body.classList.remove('intro');
  renderer.setAnimationLoop(loop);
  setTimeout(() => $('#loader').classList.add('done'), intro.on ? 30 : 150);
  window.__app = { openProject, closeProject, setMode, slots, DATA, goVariant, get STATE() { return STATE; }, toggleDiscZoom, F, applyFilters, intro, introResize, ROT };
})();
