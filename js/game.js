/* =====================================================================
   អុំទូក · OM TOUK — Cambodian Water Festival dragon-boat rhythm race
   Three.js (r149, global THREE). No external assets: everything is
   procedural (geometry, textures, audio).
   ===================================================================== */
(function () {
'use strict';

/* ------------------------------------------------------------------ */
/*  Constants & helpers                                               */
/* ------------------------------------------------------------------ */
const PI = Math.PI, TAU = Math.PI * 2;
const RACE_LEN = 700;            // metres from the start line to the finish line
const HL = 10.5;                 // hull half-length (m)
const BOW = HL + 2;               // bow-nose offset from boat centre
const START_NOSE = -3;           // bow x at start (start line is x = 0)
const LANES = [5, -5];
const SHORE_Z = -46;
const BANDS = [RACE_LEN / 3, RACE_LEN * 2 / 3];   // Start | Band 1 | Band 2 | Finish
const VMIN = 7.5, VMAX = 21.5;   // boat speed range (m/s)
const LOOK = 2.1;                // rhythm lane look-ahead (s)

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const frac = x => x - Math.floor(x);
const KHD = '០១២៣៤៥៦៧៨៩';
const toKh = n => String(n).replace(/\d/g, d => KHD[d]);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry32(20241111);
const rr = (a, b) => a + (b - a) * rnd();
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const $ = id => document.getElementById(id);
const FONT_T = "Moul,'Noto Serif Khmer',serif";
const FONT_B = "'Kantumruy Pro','Battambang','Noto Sans Khmer',sans-serif";

const DIFFS = {
  easy:   { key: 'easy',   bpm: 84,  perfect: 0.095, good: 0.18, ai: [0.60, 0.68, 0.75, 0.81], aiPerf: 0.35, kh: 'ងាយ',   en: 'Easy'   },
  normal: { key: 'normal', bpm: 100, perfect: 0.072, good: 0.145, ai: [0.74, 0.80, 0.86, 0.91], aiPerf: 0.50, kh: 'មធ្យម', en: 'Normal' },
  hard:   { key: 'hard',   bpm: 116, perfect: 0.056, good: 0.115, ai: [0.90, 0.94, 0.97, 0.985], aiPerf: 0.78, kh: 'ពិបាក', en: 'Hard', half: true }
};

const SCHEMES = [
  { kh: 'ទូកក្រហម', en: 'Red',    hull: 0xc8102e, dark: 0x7d0a1c, shirts: [0xe0283f, 0xe0283f], css: '#e0283f' },
  { kh: 'ទូកខៀវ',  en: 'Blue',   hull: 0x1f5fbf, dark: 0x123a78, shirts: [0x2f78e0, 0x2f78e0], css: '#2f78e0' },
  { kh: 'ទូកបៃតង', en: 'Green',  hull: 0x1f9a56, dark: 0x0f5c32, shirts: [0x2fbf6a, 0x2fbf6a], css: '#2fbf6a' },
  { kh: 'ទូកលឿង', en: 'Gold',   hull: 0xf0a800, dark: 0x9c6a00, shirts: [0xf5c400, 0xf5c400], css: '#f5b400' },
  { kh: 'ទូកស្វាយ', en: 'Purple', hull: 0x7a3fb0, dark: 0x4a2270, shirts: [0x9a5bd4, 0x9a5bd4], css: '#9a5bd4' }
];

/* ------------------------------------------------------------------ */
/*  Renderer / scene                                                  */
/* ------------------------------------------------------------------ */
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setClearColor(0xcfe4f1);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe4f1, 150, 950);
const camera = new THREE.PerspectiveCamera(65, 1, 0.5, 2600);
camera.position.set(0, 8, 40);

const hemi = new THREE.HemisphereLight(0xdcecff, 0xa8946a, 0.95);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xfff1d6, 0.95);
sunLight.position.set(-40, 70, 60);
scene.add(sunLight);
const SUN_DIR = new THREE.Vector3(-0.72, 0.38, -0.55).normalize();

const shared = { uT: { value: 0 } };           // crowd / flags time
const redraws = [];                            // canvas textures to redraw once fonts load

const matCache = new Map();
function M(color, opts) {
  const key = color + '|' + (opts ? JSON.stringify(opts) : '');
  let m = matCache.get(key);
  if (!m) { m = new THREE.MeshLambertMaterial(Object.assign({ color }, opts)); matCache.set(key, m); }
  return m;
}
const GOLD = new THREE.MeshPhongMaterial({ color: 0xffc62e, shininess: 90, specular: 0xfff0b0, emissive: 0x3a2400 });
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  sph: new THREE.SphereGeometry(1, 12, 9),
  cone: new THREE.ConeGeometry(1, 1, 10),
  cone4: new THREE.ConeGeometry(1, 1, 4, 1).rotateY(PI / 4).translate(0, 0.5, 0)
};
function mesh(geo, mat, parent, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x || 0, y || 0, z || 0);
  m.scale.set(sx === undefined ? 1 : sx, sy === undefined ? (sx === undefined ? 1 : sx) : sy, sz === undefined ? (sx === undefined ? 1 : sx) : sz);
  if (parent) parent.add(m);
  return m;
}
const box = (p, w, h, d, x, y, z, mat) => mesh(GEO.box, mat, p, x, y, z, w, h, d);
const cyl = (p, rt, h, x, y, z, mat, geo) => { const m = mesh(geo || GEO.cyl, mat, p, x, y, z, rt, h, rt); return m; };

/* canvas helper that survives a late web-font load */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4; tex.repeat.x = -1; tex.offset.x = 1;   // the canvas is shown mirrored (race runs right to left), so pre-flip every texture to keep text readable
  const fn = () => { ctx.clearRect(0, 0, w, h); draw(ctx, w, h); tex.needsUpdate = true; };
  fn(); redraws.push(fn);
  return tex;
}

/* ------------------------------------------------------------------ */
/*  Sky, clouds                                                       */
/* ------------------------------------------------------------------ */
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1900, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: SUN_DIR } },
    vertexShader: 'varying vec3 vD; void main(){ vD=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: [
      'varying vec3 vD; uniform vec3 uSun;',
      'void main(){',
      ' vec3 d=normalize(vD); float h=clamp(d.y,0.0,1.0);',
      ' vec3 hor=vec3(0.86,0.93,0.97), mid=vec3(0.42,0.70,0.95), top=vec3(0.13,0.40,0.82);',
      ' vec3 c=mix(hor,mid,smoothstep(0.0,0.22,h)); c=mix(c,top,smoothstep(0.18,0.85,h));',
      ' float s=max(dot(d,normalize(uSun)),0.0);',
      ' c+=vec3(1.0,0.82,0.5)*pow(s,5.0)*0.42+vec3(1.0,0.9,0.6)*pow(s,40.0)*0.3+vec3(1.0,0.97,0.85)*pow(s,400.0)*1.4;',
      ' gl_FragColor=vec4(c,1.0);}'
    ].join('\n')
  })
);
sky.renderOrder = -10;
scene.add(sky);

const cloudTex = canvasTex(256, 128, (c, w, h) => {
  const r = mulberry32(5);
  for (let i = 0; i < 26; i++) {
    const x = 40 + r() * 176, y = 50 + r() * 34 - Math.abs(x - 128) * 0.15, rad = 18 + r() * 26;
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fill();
  }
});
const cloudGroup = new THREE.Group();
for (let i = 0; i < 16; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: rr(0.55, 0.9), depthWrite: false, fog: false }));
  const a = rr(-1.2, 1.2) + PI; // spread in front (−z)
  const dist = rr(700, 1300);
  s.position.set(Math.sin(a) * dist * 1.1 * (rnd() < .5 ? 1 : -1), rr(130, 330), -dist * rr(0.5, 1));
  s.scale.set(rr(300, 560), rr(130, 240), 1);
  cloudGroup.add(s);
}
scene.add(cloudGroup);

/* ------------------------------------------------------------------ */
/*  Water                                                             */
/* ------------------------------------------------------------------ */
function waveH(x, z, t) { return 0.09 * Math.sin(x * 0.35 + t * 1.2) + 0.07 * Math.sin(z * 0.5 - t * 0.9 + x * 0.2); }
const waterUniforms = { uTime: { value: 0 }, uSun: { value: SUN_DIR }, uCam: { value: new THREE.Vector3() } };
const waterGeo = new THREE.PlaneGeometry(1700, 1700, 250, 250).rotateX(-PI / 2);
const water = new THREE.Mesh(waterGeo, new THREE.ShaderMaterial({
  uniforms: waterUniforms,
  vertexShader: [
    'uniform float uTime; varying vec3 vW;',
    'float waveH(vec2 p,float t){return 0.09*sin(p.x*0.35+t*1.2)+0.07*sin(p.y*0.5-t*0.9+p.x*0.2);}',
    'void main(){ vec4 w=modelMatrix*vec4(position,1.0); w.y+=waveH(w.xz,uTime); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }'
  ].join('\n'),
  fragmentShader: [
    'uniform float uTime; uniform vec3 uSun; uniform vec3 uCam; varying vec3 vW;',
    'vec2 grad(vec2 p,float t){ vec2 g=vec2(0.0);',
    ' g+=0.09*cos(p.x*0.35+t*1.2)*vec2(0.35,0.0);',
    ' g+=0.07*cos(p.y*0.5-t*0.9+p.x*0.2)*vec2(0.2,0.5);',
    ' g+=0.040*cos(dot(p,vec2(1.1,0.7))+t*1.9)*vec2(1.1,0.7);',
    ' g+=0.032*cos(dot(p,vec2(-0.8,1.6))+t*2.3)*vec2(-0.8,1.6);',
    ' g+=0.022*cos(dot(p,vec2(2.7,-1.9))+t*3.1)*vec2(2.7,-1.9);',
    ' g+=0.016*cos(dot(p,vec2(-3.9,3.1))+t*3.7)*vec2(-3.9,3.1);',
    ' return g; }',
    'void main(){',
    ' float dist=length(vW-uCam);',
    ' vec2 g=grad(vW.xz,uTime)*mix(1.0,0.3,smoothstep(40.0,320.0,dist));',
    ' vec3 N=normalize(vec3(-g.x,1.0,-g.y)); vec3 V=normalize(uCam-vW);',
    ' float fr=pow(1.0-max(dot(N,V),0.0),3.0);',
    ' vec3 R=reflect(-V,N);',
    ' vec3 sky=mix(vec3(0.86,0.93,0.97),vec3(0.35,0.62,0.9),clamp(R.y*1.6,0.0,1.0));',
    ' vec3 deep=vec3(0.04,0.27,0.40), shal=vec3(0.15,0.48,0.55);',
    ' float mixv=0.5+0.5*sin(vW.x*0.021+vW.z*0.033+uTime*0.1);',
    ' vec3 base=mix(deep,shal,0.35+0.35*mixv);',
    ' float diff=clamp(dot(N,normalize(uSun)),0.0,1.0);',
    ' vec3 col=mix(base+vec3(0.05)*diff,sky,0.14+0.72*fr);',
    ' float sd=max(dot(R,normalize(uSun)),0.0);',
    ' col+=vec3(1.0,0.92,0.7)*pow(sd,220.0)*0.7+vec3(1.0,0.88,0.65)*pow(sd,8.0)*0.05;',
    ' float f=smoothstep(150.0,950.0,dist);',
    ' col=mix(col,vec3(0.812,0.894,0.945),f);',
    ' gl_FragColor=vec4(col,1.0); }'
  ].join('\n')
}));
water.frustumCulled = false;
scene.add(water);

/* ------------------------------------------------------------------ */
/*  Textures: flag, banners, scales, hull pattern, wake               */
/* ------------------------------------------------------------------ */
const flagTex = canvasTex(256, 170, (c, w, h) => {
  c.fillStyle = '#032ea1'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#e00025'; c.fillRect(0, h * 0.25, w, h * 0.5);
  c.fillStyle = '#fff';
  const cx = w / 2, by = h * 0.62;
  c.fillRect(cx - 52, by, 104, 6);
  c.fillRect(cx - 44, by - 8, 88, 8);
  const tower = (x, hh, ww) => { c.beginPath(); c.moveTo(x - ww, by - 8); c.lineTo(x - ww * 0.8, by - 8 - hh * 0.5); c.lineTo(x - ww * 0.4, by - 8 - hh * 0.8); c.lineTo(x, by - 8 - hh); c.lineTo(x + ww * 0.4, by - 8 - hh * 0.8); c.lineTo(x + ww * 0.8, by - 8 - hh * 0.5); c.lineTo(x + ww, by - 8); c.closePath(); c.fill(); };
  tower(cx, 48, 14); tower(cx - 26, 34, 10); tower(cx + 26, 34, 10);
  c.fillRect(cx - 40, by - 14, 80, 7);
});
const flagMat = new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide });
flagMat.onBeforeCompile = sh => {
  sh.uniforms.uT = shared.uT;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\n float ph=instanceMatrix[3].x;\n#else\n float ph=modelMatrix[3].x;\n#endif\n transformed.z += sin(position.x*2.6 - uT*5.0 + ph)*0.17*position.x;\n transformed.y += sin(position.x*2.0 - uT*4.0 + ph)*0.04*position.x;');
};

const flagClone = () => { const m = flagMat.clone(); m.onBeforeCompile = flagMat.onBeforeCompile; return m; };   // clone() drops onBeforeCompile, so re-attach the wave shader

function bannerTexture(kh, en, w, h, finish, band) {
  return canvasTex(w, h, (c) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#e0283f'); g.addColorStop(1, '#8c0c20');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#ffcf3f'; c.lineWidth = h * 0.07; c.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1);
    c.strokeStyle = '#fff3c0'; c.lineWidth = 2; c.strokeRect(h * 0.14, h * 0.14, w - h * 0.28, h - h * 0.28);
    if (finish) { // chequered racing bands top and bottom
      const sq = h * 0.1;
      for (let i = 0; i * sq < w; i++) for (let j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? '#ffcf3f' : '#fff'; c.fillRect(i * sq, j * sq, sq, sq); c.fillStyle = (i + j) % 2 ? '#fff' : '#ffcf3f'; c.fillRect(i * sq, h - (j + 1) * sq, sq, sq); }
      c.strokeStyle = '#ffcf3f'; c.lineWidth = h * 0.05; c.strokeRect(h * 0.025, h * 0.025, w - h * 0.05, h - h * 0.05);
    }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#ffe27a'; c.font = Math.floor(h * 0.4) + 'px ' + FONT_T;
    c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 6;
    c.fillText(kh, w / 2, h * 0.42);
    c.fillStyle = '#fff'; c.font = '700 ' + Math.floor(h * 0.2) + 'px ' + FONT_B;
    c.fillText(en, w / 2, h * 0.76);
  });
}

const scaleTex = canvasTex(128, 128, (c, w, h) => {
  c.fillStyle = '#1b9a55'; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#ffd23a'; c.lineWidth = 6;
  for (let y = 0; y < 5; y++) for (let x = -1; x < 5; x++) {
    c.beginPath(); c.arc(x * 32 + (y % 2) * 16, y * 26 + 8, 16, 0, PI); c.stroke();
  }
  c.fillStyle = 'rgba(0,70,30,.35)'; c.fillRect(0, h * 0.82, w, h * 0.18);
});
scaleTex.wrapS = scaleTex.wrapT = THREE.RepeatWrapping;

// Painted hull like a real Cambodian racing boat: green sheer, red/orange ornament band with gold diamonds and green leaves.
// Painted hull in the style of a real Cambodian racing boat: coloured body, gold chain border, black-outlined gold leaf flourishes, an eye near the bow and a wreath roundel amidships. Only the body colour changes per boat.
const zebraList = (st, sz) => { const a = (st || []).map((v, i) => v == null ? null : [v, sz && sz[i] ? sz[i] : 3]).filter(Boolean); return a.length === 1 ? [a[0], [null, a[0][1]]] : a; };   // [colour, size] pairs in order; a lone colour alternates with the hull   // ticked colours in order; a lone colour alternates with the hull
function paintHull(c, W, HH, hull, dark, hull2, stripes, sw, centre, zsz) {
  const hx = n => '#' + n.toString(16).padStart(6, '0');
  const GOLD = '#f2c230', GOLD2 = '#c98e12', HI = '#ffe27a', INK = '#14100a';
  const g = c.createLinearGradient(0, 0, 0, HH); g.addColorStop(0, hx(hull)); if (hull2 != null) { g.addColorStop(0.2, hx(hull)); g.addColorStop(0.42, hx(hull2)); g.addColorStop(1, hx(hull2)); } else { g.addColorStop(0.55, hx(hull)); g.addColorStop(1, hx(dark)); }
  c.fillStyle = g; c.fillRect(0, 0, W, HH);
  // paint sections along the length (x = 0 stern … W bow): back colour | centre colour | front colour, slanted edges
  const zc = zebraList(stripes, zsz);
  if (zc.length || centre != null) {
    const f = [0.12, 0.2, 0.3][sw == null ? 1 : sw], xl = W * (0.5 - f), xr = W * (0.5 + f), d = -HH * 0.5;   // d < 0: edges lean the other way
    const poly = (cl, pts) => { if (cl == null) return; c.fillStyle = hx(cl); c.beginPath(); pts.forEach((p, k) => k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fill(); };
    poly(centre, [[xl, 0], [xr, 0], [xr - d, HH], [xl - d, HH]]);                    // centre: solid
    if (zc.length) {                      // front & back ends: zebra of the two colours
      c.save(); c.beginPath();
      c.moveTo(0, 0); c.lineTo(xl, 0); c.lineTo(xl - d, HH); c.lineTo(0, HH); c.closePath();
      c.moveTo(xr, 0); c.lineTo(W, 0); c.lineTo(W, HH); c.lineTo(xr - d, HH); c.closePath(); c.clip();
      for (let x = d, k = 0; x < W - d; k++) { const [cl, n] = zc[k % zc.length], w = n * 14; poly(cl, [[x, 0], [x + w, 0], [x + w - d, HH], [x - d, HH]]); x += w; }
      c.restore();
    }
  }
  // rim + chain border
  c.fillStyle = GOLD; c.fillRect(0, 0, W, HH * 0.035);
  c.fillStyle = INK; c.fillRect(0, HH * 0.035, W, HH * 0.012);
  c.fillStyle = GOLD; c.fillRect(0, HH * 0.047, W, HH * 0.075);
  c.fillStyle = GOLD2; for (let x = 0; x < W; x += 14) c.fillRect(x, HH * 0.047, 2, HH * 0.075);
  c.strokeStyle = INK; c.lineWidth = 1.6; c.beginPath(); for (let x = 0; x <= W; x += 14) c.lineTo(x, HH * (0.06 + ((x / 14) % 2) * 0.045)); c.stroke();
  c.fillStyle = INK; c.fillRect(0, HH * 0.122, W, HH * 0.012);
  c.fillStyle = GOLD; c.fillRect(0, HH * 0.134, W, HH * 0.012);
  // lower trim (mostly under the waterline)
  c.fillStyle = INK; c.fillRect(0, HH * 0.56, W, HH * 0.012); c.fillStyle = GOLD; c.fillRect(0, HH * 0.572, W, HH * 0.02);
  const cy = 0, K = 0.8;   // ornaments are drawn in a scaled space centred high on the hull so they stay above the waterline
  const leaf = (x, y, len, wid, ang) => {
    c.save(); c.translate(x, y); c.rotate(ang);
    const p = (k) => { c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(len * 0.3 * k, -wid * k, len * 0.8 * k, -wid * 0.8 * k, len * k, 0); c.bezierCurveTo(len * 0.8 * k, wid * 0.8 * k, len * 0.3 * k, wid * k, 0, 0); };
    p(1); c.fillStyle = GOLD; c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
    p(0.62); c.fillStyle = HI; c.fill();
    c.restore();
  };
  const curl = (x, y, r, dir) => {
    c.save(); c.translate(x, y); c.scale(dir, 1);
    for (const [w, col] of [[11, INK], [6, GOLD]]) { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.arc(0, 0, r, Math.PI * 0.2, Math.PI * 1.6); c.stroke(); }
    c.restore();
  };
  const flourish = (x) => {
    for (let k = -2; k <= 2; k++) leaf(x, cy + 6, 46, 13, -Math.PI / 2 + k * 0.62);
    leaf(x + 8, cy + 8, 112, 15, 0.1); leaf(x - 8, cy + 8, 100, 14, Math.PI - 0.1);
    curl(x + 62, cy + 18, 14, 1); curl(x - 62, cy + 18, 14, -1);
  };
  c.save(); c.translate(0, HH * 0.275); c.scale(K, K);
  const eyeX = W * 0.8 / K, rdX = W * 0.5 / K;
  for (let x = 130 / K; x < W / K; x += 270 / K) { if (Math.abs(x - rdX) < 150 || Math.abs(x - eyeX) < 130) continue; flourish(x); }
  // wreath roundel
  c.save(); c.translate(rdX, cy + 6);
  c.fillStyle = INK; c.beginPath(); c.arc(0, 0, 40, 0, TAU); c.fill();
  c.fillStyle = hx(dark); c.beginPath(); c.arc(0, 0, 35, 0, TAU); c.fill();
  for (const sd of [-1, 1]) for (let k = 0; k < 7; k++) { const a = Math.PI * (0.5 + k / 6); c.save(); c.scale(sd, 1); c.translate(Math.cos(a) * 46, -Math.sin(a) * 46); c.rotate(Math.PI - a); c.fillStyle = GOLD; c.strokeStyle = INK; c.lineWidth = 2.2; c.beginPath(); c.ellipse(0, 0, 4.5, 13, 0, 0, TAU); c.fill(); c.stroke(); c.restore(); }
  c.strokeStyle = '#c8102e'; c.lineWidth = 7; c.beginPath(); c.arc(0, 0, 49, Math.PI * 0.12, Math.PI * 0.88); c.stroke();
  for (let k = -2; k <= 2; k++) leaf(0, 14, 22, 7, -Math.PI / 2 + k * 0.5);
  c.fillStyle = GOLD; c.beginPath(); c.arc(0, 14, 5, 0, TAU); c.fill();
  c.restore();
  // eye with a gold curled brow, facing the bow
  c.save(); c.translate(eyeX, cy + 6);
  leaf(14, -12, 60, 11, -0.35); curl(-30, 6, 12, -1);
  c.fillStyle = INK; c.beginPath(); c.ellipse(0, 0, 36, 24, 0, 0, TAU); c.fill();
  c.fillStyle = GOLD; c.beginPath(); c.ellipse(0, 0, 32, 20, 0, 0, TAU); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.ellipse(1, 0, 22, 15, 0, 0, TAU); c.fill();
  c.fillStyle = '#1c9a8a'; c.beginPath(); c.arc(3, 0, 12.5, 0, TAU); c.fill();
  c.fillStyle = INK; c.beginPath(); c.arc(3, 0, 6.5, 0, TAU); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(0, -4, 2.6, 0, TAU); c.fill();
  c.restore();
  c.restore();
}

const SKINS = new Map();   // uploaded hull pictures (data URL → Image)
const skinReady = u => { const im = SKINS.get(u); return !!(im && im.complete && im.naturalWidth); };
function loadSkin(u, cb) {
  if (skinReady(u)) return cb();
  let im = SKINS.get(u); if (!im) { im = new Image(); SKINS.set(u, im); im.src = u; }
  im.addEventListener('load', cb, { once: true }); im.addEventListener('error', () => SKINS.delete(u), { once: true });
}
function hullTexture(s) {
  const W = 2048, H = 512, HH = H / 2;
  const tex = canvasTex(W, H, (c) => {
    // upper half: rim (top) → keel (bottom); then mirrored for the other side
    paintHull(c, W, HH, s.hull, s.dark, s.hull2, s.stripes, s.stripeW, s.centre, s.stripeSz);   // photo-style painted hull in the boat's own colour
    if (s.skin && skinReady(s.skin)) { c.drawImage(SKINS.get(s.skin), 0, 0, W, HH); c.fillStyle = '#f6c21c'; c.fillRect(0, 0, W, HH * 0.035); }   // uploaded picture replaces the painted skin
    if (s.bow && skinReady(s.bow)) { const im = SKINS.get(s.bow), bw = W * 0.26, bh = HH * 0.85, k = Math.min(bw / im.naturalWidth, bh / im.naturalHeight), w = im.naturalWidth * k, h = im.naturalHeight * k; c.drawImage(im, W * 0.11 - w / 2, HH * 0.52 - h / 2, w, h); }   // picture drawn over the front colour (canvas x = 0 is the bow: hull textures are mirrored)
    c.save(); c.translate(0, H); c.scale(1, -1); c.drawImage(c.canvas, 0, 0, W, HH, 0, 0, W, HH); c.restore();
  });
  tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; tex.anisotropy = 4;
  return tex;
}

const wakeTex = canvasTex(256, 128, (c, w, h) => {
  // soft V-shaped foam trails with feathered edges (no hard rectangle)
  c.lineCap = 'round';
  const arm = (sgn) => {
    for (let i = 0; i < 5; i++) {
      const g = c.createLinearGradient(w, h / 2, 0, h / 2 + sgn * h * 0.45);
      g.addColorStop(0, 'rgba(255,255,255,.7)'); g.addColorStop(0.5, 'rgba(255,255,255,.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.strokeStyle = g; c.lineWidth = 8 - i;
      c.beginPath(); c.moveTo(w * 0.86, h / 2); c.lineTo(8, h / 2 + sgn * (h * (0.14 + i * 0.06))); c.stroke();
    }
  };
  arm(1); arm(-1);
  const cg = c.createRadialGradient(w * 0.55, h / 2, 2, w * 0.55, h / 2, w * 0.5);
  cg.addColorStop(0, 'rgba(255,255,255,.35)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
  c.save(); c.translate(0, h / 2); c.scale(1, 0.28); c.translate(0, -h / 2); c.fillStyle = cg; c.fillRect(0, 0, w, h); c.restore();
  // feather every edge so the plane never shows a straight border
  c.globalCompositeOperation = 'destination-in';
  const mh = c.createLinearGradient(0, 0, w, 0);
  mh.addColorStop(0, 'rgba(0,0,0,0)'); mh.addColorStop(0.3, 'rgba(0,0,0,1)'); mh.addColorStop(0.82, 'rgba(0,0,0,1)'); mh.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = mh; c.fillRect(0, 0, w, h);
  const mv = c.createLinearGradient(0, 0, 0, h);
  mv.addColorStop(0, 'rgba(0,0,0,0)'); mv.addColorStop(0.3, 'rgba(0,0,0,1)'); mv.addColorStop(0.7, 'rgba(0,0,0,1)'); mv.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = mv; c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = 'source-over';
});

/* ------------------------------------------------------------------ */
/*  Shore, palace, crowd, flags…                                      */
/* ------------------------------------------------------------------ */
function hipRoof(parent, w, d, h, x, y, z, color, trimTall) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  mesh(GEO.cone4, M(color), g, 0, 0.2, 0, w / Math.SQRT2, h, d / Math.SQRT2);
  box(g, w + 0.8, 0.35, d + 0.8, 0, 0.12, 0, GOLD);
  box(g, w * 0.98, 0.18, d * 0.98, 0, 0.42, 0, M(0xa8261c));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const f = mesh(GEO.cone, GOLD, g, sx * (w / 2 + 0.25), 0.7, sz * (d / 2 + 0.25), 0.16, trimTall || 1.1, 0.16);
    f.rotation.z = -0.55 * sx; f.rotation.x = 0.55 * sz;
  }
  return g;
}

/* Royal Palace (Chanchhaya-style pavilion), built from primitives in local coords:
   front faces +z (towards the river), ground at y = 0, 74 units wide */
function hipGeo(w, d, h) {
  // hip roof with a ridge along x; base rectangle w x d at y = 0, ridge at y = h
  const r = Math.max(0, (w - d) / 2), x = w / 2, z = d / 2;
  const A = [-x, 0, z], B = [x, 0, z], C = [x, 0, -z], D = [-x, 0, -z], E = [-r, h, 0], F = [r, h, 0];
  const tris = [[A, B, F], [A, F, E], [C, D, E], [C, E, F], [D, A, E], [B, C, F]];
  const pos = []; tris.forEach(t => t.forEach(p => pos.push(...p)));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}
function chofa(parent, x, y, z, sx, sz, s) {
  // curved Khmer chofa horn: tapering segments sweeping up and outward, tip curling back
  const pts = [];
  for (let i = 0; i <= 7; i++) {
    const t = i / 7;
    pts.push(new THREE.Vector3(x + sx * s * (1.5 * Math.sin(t * 1.9)), y + s * 2.6 * t, z + sz * s * (1.5 * Math.sin(t * 1.9))));
  }
  for (let i = 0; i < 7; i++) {
    const a = pts[i], b = pts[i + 1], len = a.distanceTo(b);
    const r = 0.26 * s * (1 - i / 8);
    const m = new THREE.Mesh(GEO.cone, GOLD);
    m.scale.set(r, len * 1.05, r);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    parent.add(m);
  }
}
function palaceTier(g, w, d, h, y, roofCol) {
  mesh(hipGeo(w, d, h), new THREE.MeshLambertMaterial({ color: roofCol, side: THREE.DoubleSide }), g, 0, y, 0);
  box(g, w + 0.4, 0.4, 0.5, 0, y + 0.1, d / 2, GOLD);             // eave trim
  box(g, w + 0.4, 0.4, 0.5, 0, y + 0.1, -d / 2, GOLD);
  box(g, 0.5, 0.4, d, -w / 2, y + 0.1, 0, GOLD);
  box(g, 0.5, 0.4, d, w / 2, y + 0.1, 0, GOLD);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) chofa(g, sx * (w / 2 + 0.2), y + 0.3, sz * (d / 2 + 0.2), sx, sz, 2.0);
}
function spire(g, x, y, z, base, tiers, th) {
  // slender tiered Khmer prasat spire: stacked narrowing square tiers with gold rings, ending in a needle
  const mats = [GOLD, M(0xd9962a)];
  let yy = y;
  for (let i = 0; i < tiers; i++) {
    const rb = base * (1 - i / (tiers + 2)), rt = rb * 0.8;
    mesh(new THREE.CylinderGeometry(rt, rb, th, 4, 1).rotateY(PI / 4), mats[i % 2], g, x, yy + th / 2, z);
    mesh(new THREE.CylinderGeometry(rb * 0.92, rb * 1.08, th * 0.16, 4, 1).rotateY(PI / 4), GOLD, g, x, yy + th * 0.08, z);
    yy += th;
  }
  mesh(GEO.sph, M(0xfff4d0), g, x, yy + 0.3, z, 0.5 * base * 0.3 + 0.2);
  mesh(GEO.cone, GOLD, g, x, yy + 0.4 + th * 1.5, z, 0.22, th * 3, 0.22);
  return yy;
}
function gableRoof(g, w, d, h, x, y, z, roofCol, faceScale) {
  // gable-ended roof (ridge along z, gable faces the river) with a gold carved pediment and horn-like chofa on the rakes
  const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0, h); sh.closePath();
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false }), M(roofCol, { side: THREE.DoubleSide }));
  roof.position.set(x, y, z - d / 2); g.add(roof);
  const f = faceScale || 0.84;
  const sh2 = new THREE.Shape(); sh2.moveTo(-w / 2 * f, 0.4); sh2.lineTo(w / 2 * f, 0.4); sh2.lineTo(0, h * f + 0.2); sh2.closePath();
  const face = new THREE.Mesh(new THREE.ExtrudeGeometry(sh2, { depth: 0.5, bevelEnabled: false }), GOLD);
  face.position.set(x, y, z + d / 2 + 0.05); g.add(face);
  const sh3 = new THREE.Shape(); sh3.moveTo(-w / 2 * f * 0.7, 0.9); sh3.lineTo(w / 2 * f * 0.7, 0.9); sh3.lineTo(0, h * f * 0.7 + 0.6); sh3.closePath();
  const inner = new THREE.Mesh(new THREE.ExtrudeGeometry(sh3, { depth: 0.3, bevelEnabled: false }), M(0xb97a1c));
  inner.position.set(x, y, z + d / 2 + 0.5); g.add(inner);
  // rake boards (dark green + gold) on both slopes, front and back
  const ang = Math.atan2(h, w / 2), len = Math.hypot(w / 2, h);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const b = box(g, len, 0.5, 0.7, x + sx * w / 4, y + h / 2 + 0.2, z + sz * (d / 2 + 0.2), M(0x1d5a4a));
    b.rotation.z = -sx * ang;
    const t = box(g, len, 0.3, 0.9, x + sx * w / 4, y + h / 2 + 0.5, z + sz * (d / 2 + 0.2), GOLD);
    t.rotation.z = -sx * ang;
    // chofa horns curling up along the slope
    for (let i = 1; i <= 3; i++) {
      const px = sx * (w / 2) * (i / 3.6), py = h * (1 - i / 3.6);
      const c = mesh(GEO.cone, GOLD, g, x + px + sx * 0.5, y + py + 1.2, z + sz * (d / 2 + 0.3), 0.2, 2.0, 0.2);
      c.rotation.z = -sx * 0.5;
    }
  }
  chofa(g, x - w / 2, y + 0.4, z + d / 2, -1, 1, 1.4); chofa(g, x + w / 2, y + 0.4, z + d / 2, 1, 1, 1.4);
}
function guardHouse(g, x, z) {
  box(g, 5, 0.6, 5, x, 0.3, z, M(0xe8e0c8));
  box(g, 3.6, 4.6, 3.6, x, 2.9, z, M(0xd9962a));
  box(g, 1.2, 2.4, 0.2, x, 2.2, z + 1.85, M(0x7a3c1c));
  mesh(GEO.cone4, GOLD, g, x, 5.2, z, 3.2, 2.0, 3.2);
  mesh(GEO.cone4, M(0xd9962a), g, x, 6.6, z, 2.2, 1.8, 2.2);
  spire(g, x, 7.8, z, 1.1, 5, 0.9);
}
function stupaFinial(g, x, y, z, s) {
  // small white tiered stupa seen on the gate and wall
  const w = M(0xf7f2e2);
  box(g, 1.6 * s, 0.4 * s, 1.6 * s, x, y + 0.2 * s, z, w);
  for (let i = 0; i < 4; i++) mesh(new THREE.CylinderGeometry((0.5 - i * 0.08) * s, (0.8 - i * 0.12) * s, 0.55 * s, 4, 1).rotateY(PI / 4), w, g, x, y + (0.7 + i * 0.5) * s, z);
  mesh(GEO.cone, w, g, x, y + 3.1 * s, z, 0.14 * s, 1.2 * s, 0.14 * s);
}
function makePalace() {
  // Chanchhaya-style open pavilion (Royal Palace, Phnom Penh): front faces +z
  const g = new THREE.Group();
  const white = M(0xf4efe0), cream = M(0xf0dfae), shade = M(0xd9d2bc), yellow = M(0xf2b52a), green = M(0x1d5a4a), brown = M(0x6e2f1a), roofG = M(0xc98a22, { side: THREE.DoubleSide });
  // courtyard + low yellow wall with white crenellations along the front
  box(g, 90, 0.8, 44, 0, 0.4, 2, M(0xe8b830));
  box(g, 90, 3.0, 1.2, 0, 2.3, 24, yellow);
  box(g, 90, 0.5, 1.6, 0, 3.9, 24, white);
  for (let x = -44; x <= 44; x += 2.0) { if (Math.abs(x) < 4) continue; box(g, 1.1, 0.9, 0.9, x, 4.6, 24, white); mesh(GEO.sph, white, g, x, 5.1, 24, 0.55, 0.5, 0.4); }
  // gate houses at both ends of the wall
  for (const sx of [-1, 1]) {
    const x = sx * 34;
    box(g, 5, 6, 3.4, x, 3.8, 24, yellow); box(g, 5.6, 0.6, 4, x, 7.0, 24, white);
    box(g, 1.8, 3.4, 0.3, x, 2.5, 25.8, M(0x4f9fa6));
    mesh(GEO.cone4, white, g, x, 7.2, 24, 3.4, 3.2, 2.4);
    mesh(GEO.cone, GOLD, g, x, 10.4, 24, 0.2, 2.4, 0.2);
  }
  // white lamp posts flanking the central path
  for (const sx of [-1, 1]) {
    cyl(g, 0.35, 8, sx * 17, 4.5, 26, white); mesh(GEO.sph, white, g, sx * 17, 8.8, 26, 0.9, 0.9, 0.9);
    mesh(GEO.cone, GOLD, g, sx * 17, 10.4, 26, 0.5, 2, 0.5);
  }
  // pavilion platform with front steps
  box(g, 70, 2.2, 26, 0, 1.9, 0, cream);
  box(g, 71, 0.5, 27, 0, 3.15, 0, white);
  box(g, 14, 0.8, 3, 0, 0.9, 14.6, cream); box(g, 12, 0.8, 2, 0, 1.5, 14, cream);
  // open colonnade: white pillars on all four sides, dark interior behind
  box(g, 62, 7, 1, 0, 6.9, -9, M(0xe6d5a6));
  for (let x = -29; x <= 29.1; x += 5) box(g, 2.2, 4.2, 0.3, x, 6.2, -8.4, brown);
  for (let x = -32; x <= 32.1; x += 4) {
    for (const z of [11, -11]) { cyl(g, 0.4, 7, x, 6.9, z, white); box(g, 1.2, 0.4, 1.2, x, 10.5, z, white); box(g, 1.1, 0.4, 1.1, x, 3.5, z, white); }
  }
  for (const sx of [-1, 1]) for (let z = -7; z <= 7; z += 4) cyl(g, 0.4, 7, sx * 32, 6.9, z, white);
  box(g, 64, 0.9, 0.4, 0, 4.2, 11, white); box(g, 64, 0.9, 0.4, 0, 4.2, -11, white);   // balustrade
  box(g, 66, 0.8, 24, 0, 10.9, 0, shade);                                                 // beam
  // lower wide eave
  mesh(hipGeo(76, 31, 3.4), roofG, g, 0, 11.3, 0);
  box(g, 77, 0.5, 0.6, 0, 11.4, 15.5, green); box(g, 77, 0.5, 0.6, 0, 11.4, -15.5, green);
  box(g, 0.6, 0.5, 31, -38, 11.4, 0, green); box(g, 0.6, 0.5, 31, 38, 11.4, 0, green);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) chofa(g, sx * 38, 11.6, sz * 15.5, sx, sz, 1.5);
  // upper tier: gold wall panels with green borders
  box(g, 50, 4.2, 18, 0, 16.4, 0, M(0xb5791d));
  for (let x = -21; x <= 21.1; x += 7) {
    if (Math.abs(x) < 1) continue;
    box(g, 5.6, 3.0, 0.3, x, 16.5, 9.1, green);
    box(g, 4.8, 2.4, 0.4, x, 16.5, 9.15, M(0xe8a82a));
  }
  box(g, 52, 0.5, 20, 0, 18.7, 0, GOLD);
  mesh(hipGeo(54, 22, 3.4), M(0xc98a22, { side: THREE.DoubleSide }), g, 0, 18.9, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) chofa(g, sx * 27, 19.1, sz * 11, sx, sz, 1.4);
  // central gable (front-facing) with carved gold pediment, over the entrance
  box(g, 14, 5, 6, 0, 13.4, 12, cream);
  box(g, 15, 0.6, 7, 0, 16.2, 12, GOLD);
  gableRoof(g, 22, 12, 9.5, 0, 16.5, 8, 0xd9962a, 0.88);
  gableRoof(g, 15, 10, 7.5, 0, 24.0, 4, 0xe0a02a, 0.88);
  box(g, 15, 0.6, 9, 0, 23.8, 4, GOLD);
  for (const sx of [-1, 1]) {     // flanking spired gables on the upper tier, as on the Throne Hall
    gableRoof(g, 13, 9, 6.5, sx * 22, 19.0, 6, 0xd9962a, 0.88);
    spire(g, sx * 22, 24.5, 1, 2.2, 6, 1.5);
  }
  // small white stupas along the roof edge in front of the upper tier
  for (const x of [-4.5, 0, 4.5]) stupaFinial(g, x, 21.4, 11, x === 0 ? 1.3 : 0.95);
  // the tall central spire
  spire(g, 0, 28.5, -1, 3.6, 10, 2.1);
  // Silver Pagoda behind-left (+x because the screen is mirrored): white base, gold tiered roof, tall spire
  const sx0 = 56, sz0 = -16;
  box(g, 16, 5, 12, sx0, 2.5, sz0, white); box(g, 17, 0.6, 13, sx0, 5.3, sz0, shade);
  mesh(hipGeo(22, 17, 3.2), roofG, g, sx0, 5.6, sz0);
  box(g, 11, 3, 8, sx0, 10.3, sz0, M(0xb5791d)); box(g, 12, 0.5, 9, sx0, 12, sz0, GOLD);
  mesh(hipGeo(15, 11, 2.8), roofG, g, sx0, 12.2, sz0);
  for (const a of [-1, 1]) for (const b of [-1, 1]) chofa(g, sx0 + a * 11, 5.9, sz0 + b * 8.5, a, b, 1.2);
  spire(g, sx0, 15, sz0, 2.4, 8, 1.7);
  return g;
}

/* Wat Ounalom (Phnom Penh, seat of Cambodian Buddhism): walled compound with a gated entrance,
   a cream-and-gold vihara under stacked orange gable roofs with naga/chofa horns, two tall white chedis,
   monks' kuti and a bell tower. Front faces +z (river), ground at y = 0, ~84 units wide */
function whiteChedi(g, x, z, s) {
  const white = M(0xf6f1e3), shade = M(0xe1d9c2);
  box(g, 11 * s, 1.4 * s, 11 * s, x, 0.7 * s, z, shade);
  box(g, 9 * s, 1.4 * s, 9 * s, x, 2.1 * s, z, white);
  box(g, 7 * s, 1.2 * s, 7 * s, x, 3.4 * s, z, shade);
  // terraced square plinths with corner stupas
  for (const a of [-1, 1]) for (const b of [-1, 1]) stupaFinial(g, x + a * 4.2 * s, 2.8 * s, z + b * 4.2 * s, 0.9 * s);
  // bell body: lathe profile, white lime plaster, gold ring mouldings, tall gilded spire
  const pts = [[0, 0], [2.9, 0], [3.0, 0.7], [2.5, 1.5], [3.1, 2.4], [3.4, 4.2], [3.1, 6.6], [2.4, 8.8], [2.0, 10.2], [2.3, 10.9], [1.7, 11.6], [1.4, 13.5], [1.1, 16.5], [0.8, 19.5], [0.55, 22], [0.3, 24.5], [0, 28]]
    .map(p => new THREE.Vector2(p[0] * s, p[1] * s));
  mesh(new THREE.LatheGeometry(pts, 20), white, g, x, 4.0 * s, z);
  for (const [y, r] of [[4.9, 3.15], [7.2, 3.25], [11.0, 2.35], [12.6, 1.55]]) mesh(new THREE.CylinderGeometry(r * s, r * s, 0.28 * s, 20), GOLD, g, x, (4.0 + y) * s * 0.995 + 0.0, z);
  // niches with seated Buddha hint on the four faces of the lower body
  for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) box(g, (dx ? 0.3 : 1.6) * s, 2.2 * s, (dz ? 0.3 : 1.6) * s, x + dx * 3.3 * s, 6.2 * s, z + dz * 3.3 * s, M(0xb5791d));
  mesh(GEO.cone, GOLD, g, x, (4.0 + 28 + 5) * s, z, 0.2 * s, 10 * s, 0.2 * s);
  mesh(GEO.sph, GOLD, g, x, (4.0 + 24.6) * s, z, 0.45 * s, 0.45 * s, 0.45 * s);
}
function makeWatOunalom() {
  const g = new THREE.Group();
  const white = M(0xf6f1e3), cream = M(0xf1e4bd), shade = M(0xd9d0b4), yellow = M(0xf0b429), maroon = M(0x7d2318), orange = 0xdb6a22, tileG = M(0x1d5a4a);
  // courtyard + front boundary wall (whitewashed, yellow band, red-tile coping) with a central gate
  box(g, 88, 0.6, 50, 0, 0.3, 0, M(0xe3d8b8));
  box(g, 88, 3.2, 1.0, 0, 2.2, 25, white); box(g, 88, 0.6, 1.2, 0, 1.0, 25, yellow); box(g, 88, 0.5, 1.4, 0, 3.95, 25, M(0xb8442a));
  for (const sx of [-1, 1]) { box(g, 1.0, 3.2, 48, sx * 44, 2.2, 0, white); box(g, 1.4, 0.5, 48, sx * 44, 3.95, 0, M(0xb8442a)); }
  box(g, 88, 3.2, 1.0, 0, 2.2, -25, white);
  for (let x = -38; x <= 38; x += 6) { if (Math.abs(x) < 8) continue; box(g, 0.9, 3.0, 1.3, x, 2.2, 25, shade); }
  for (const sx of [-1, 1]) for (const x of [14, 26, 38]) stupaFinial(g, sx * x, 4.2, 25, 0.7);
  // gate: pillared portico with stepped gable roofs, gold spire, red doors
  for (const sx of [-1, 1]) { box(g, 2.6, 8, 2.6, sx * 6, 4.6, 25, white); box(g, 3.0, 0.5, 3.0, sx * 6, 8.8, 25, GOLD); stupaFinial(g, sx * 6, 9.0, 25, 0.8); }
  box(g, 10, 1.2, 2.8, 0, 8.4, 25, shade);
  gableRoof(g, 14, 5, 4.2, 0, 9.0, 25, orange, 0.86);
  gableRoof(g, 9, 4, 3.2, 0, 13.2, 25, 0xe8851e, 0.86);
  spire(g, 0, 16.2, 25, 1.1, 5, 0.8);
  box(g, 7, 6.4, 0.5, 0, 3.6, 25.2, maroon);
  for (const sx of [-1, 1]) box(g, 3.1, 5.4, 0.3, sx * 1.75, 3.7, 25.5, M(0xc9972b));
  // central stone path
  box(g, 5, 0.12, 24, 0, 0.7, 12, M(0xcfc5a6));

  // ---- the vihara ----
  const vz = -2;
  box(g, 40, 2.2, 26, 0, 1.7, vz, shade);              // terraced base
  box(g, 41.5, 0.5, 27.5, 0, 2.95, vz, white);
  box(g, 12, 0.7, 3, 0, 1.0, vz + 14.6, shade); box(g, 10, 0.7, 2, 0, 1.6, vz + 13.8, shade);   // front steps
  // naga balustrade on the steps
  for (const sx of [-1, 1]) { box(g, 0.8, 1.2, 4, sx * 6.5, 1.8, vz + 15, white); mesh(GEO.cone, GOLD, g, sx * 6.5, 2.7, vz + 16.8, 0.45, 1.6, 0.45); }
  // cream walls with maroon columns and a pillared front veranda
  box(g, 32, 9, 20, 0, 7.9, vz - 1, cream);
  for (let x = -17; x <= 17.1; x += 4.25) { cyl(g, 0.5, 9.4, x, 7.7, vz + 12, maroon); box(g, 1.4, 0.4, 1.4, x, 12.6, vz + 12, GOLD); box(g, 1.3, 0.5, 1.3, x, 3.4, vz + 12, white); }
  box(g, 36, 0.9, 2.2, 0, 12.8, vz + 12, M(0xb5791d)); box(g, 36, 0.4, 2.4, 0, 13.4, vz + 12, GOLD);
  // doors and windows on the cream wall behind the veranda
  for (const x of [-4.2, 0, 4.2]) { box(g, 3.2, 6.6, 0.4, x, 6.6, vz + 9.1, maroon); box(g, 2.5, 5.6, 0.45, x, 6.6, vz + 9.12, M(0xc9972b)); box(g, 1.9, 4.6, 0.5, x, 6.6, vz + 9.14, M(0x8a2c1c)); }
  for (const x of [-14, -10, 10, 14]) { box(g, 2.6, 3.6, 0.4, x, 8.0, vz + 9.1, M(0x5a2a18)); box(g, 2.0, 3.0, 0.45, x, 8.0, vz + 9.15, M(0x1f1a14)); box(g, 3.2, 0.4, 0.6, x, 10.0, vz + 9.1, GOLD); }
  // roofs: broad lower eave, then stacked gable tiers (orange tile, gold fascia, green trim)
  box(g, 36, 0.6, 24, 0, 13.4, vz - 0.5, tileG);
  mesh(hipGeo(40, 26, 3.2), M(orange, { side: THREE.DoubleSide }), g, 0, 13.7, vz - 0.5);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) chofa(g, sx * 20, 13.9, vz - 0.5 + sz * 13, sx, sz, 1.5);
  gableRoof(g, 30, 22, 8.5, 0, 14.0, vz, orange, 0.86);
  gableRoof(g, 22, 18, 7.4, 0, 21.0, vz, 0xe8851e, 0.86);
  gableRoof(g, 15, 13, 6.2, 0, 27.4, vz, 0xf09a22, 0.86);
  box(g, 1.2, 0.8, 14, 0, 33.4, vz, GOLD);
  for (const x of [-5, 5]) stupaFinial(g, x, 33.6, vz, 0.7);
  spire(g, 0, 33.9, vz, 1.3, 5, 0.9);
  // front gable: gold pediment glimpsed over the portico
  box(g, 22, 4, 5, 0, 15.6, vz + 12, cream);
  gableRoof(g, 18, 6, 6.0, 0, 17.5, vz + 12.5, 0xdb6a22, 0.88);

  // ---- two tall white chedis flanking the vihara ----
  whiteChedi(g, -33, -4, 1.45);
  whiteChedi(g, 33, -4, 1.2);
  // smaller corner stupas
  for (const [x, z] of [[-18, 15], [18, 15], [-38, 15], [38, 15]]) { box(g, 3.2, 0.5, 3.2, x, 0.85, z, shade); stupaFinial(g, x, 1.1, z, 1.1); }

  // ---- monks' kuti (long low yellow houses, red tile roofs) behind the vihara ----
  for (const sx of [-1, 1]) {
    box(g, 22, 0.8, 8, sx * 22, 1.0, -17, shade);
    box(g, 20, 5.0, 6.4, sx * 22, 3.9, -17, yellow);
    for (let i = -3; i <= 3; i++) { box(g, 1.2, 2.4, 0.3, sx * 22 + i * 2.7, 3.2, -13.7, M(0x6e3a1c)); box(g, 1.7, 0.3, 0.45, sx * 22 + i * 2.7, 4.6, -13.7, white); }
    mesh(hipGeo(23, 8.4, 2.8), M(0xb03a24, { side: THREE.DoubleSide }), g, sx * 22, 6.4, -17);
    box(g, 23, 0.4, 0.5, sx * 22, 6.5, -13, GOLD);
  }
  // bell tower (right-rear): square white shaft, open pavilion, tiered gold roof
  { const bx = 8, bz = -20;
    box(g, 5.5, 0.8, 5.5, bx, 1.0, bz, shade); box(g, 4.2, 8, 4.2, bx, 5.4, bz, white);
    box(g, 5.0, 0.5, 5.0, bx, 9.6, bz, GOLD);
    for (const a of [-1, 1]) for (const b of [-1, 1]) cyl(g, 0.28, 3.4, bx + a * 1.9, 11.5, bz + b * 1.9, maroon);
    mesh(GEO.cone4, M(orange), g, bx, 13.2, bz, 6.2, 3.0, 6.2);
    mesh(GEO.cone4, M(0xe8851e), g, bx, 15.4, bz, 4.0, 2.4, 4.0);
    spire(g, bx, 17.2, bz, 1.0, 4, 0.7); }
  return g;
}

function makeStupa() {
  const g = new THREE.Group();
  box(g, 15, 1.6, 15, 0, 0.8, 0, M(0xe6dcc0));
  box(g, 12, 1.6, 12, 0, 2.4, 0, M(0xf2ead2));
  const pts = [[0, 0], [3.6, 0], [3.7, 0.8], [3.0, 1.6], [3.6, 2.8], [3.0, 4.2], [2.4, 6.4], [1.8, 9.0], [1.3, 12.0], [0.95, 14.6], [0.6, 17.6], [0.35, 20.0], [0, 24]]
    .map(p => new THREE.Vector2(p[0], p[1]));
  const lathe = new THREE.Mesh(new THREE.LatheGeometry(pts, 14), GOLD); lathe.position.y = 3.2; g.add(lathe);
  for (let i = 0; i < 4; i++) { cyl(g, 2.8 - i * 0.55, 0.28, 0, 8 + i * 2.2, 0, M(0xb3202a)); }
  mesh(GEO.sph, GOLD, g, 0, 27.4, 0, 0.35, 0.35, 0.35);
  return g;
}

function makePavilion() {
  const g = new THREE.Group();
  box(g, 11, 0.7, 8, 0, 0.35, 0, M(0xe3d9be));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.22, 4.4, sx * 4.6, 2.9, sz * 3.2, M(0xa8261c));
  box(g, 10, 0.3, 7, 0, 5.0, 0, M(0xf4ead2));
  hipRoof(g, 13, 10, 3.6, 0, 5.1, 0, 0xf2a21a, 0.9);
  hipRoof(g, 8.5, 6.5, 2.6, 0, 7.6, 0, 0xe8731a, 0.8);
  mesh(GEO.cone, GOLD, g, 0, 10.6, 0, 0.12, 1.8, 0.12);
  return g;
}

function makeTent(col) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.08, 2.2, sx * 1.5, 1.1, sz * 1.5, M(0x888888));
  mesh(GEO.cone4, M(col), g, 0, 2.2, 0, 2.5, 1.4, 2.5);
  mesh(GEO.cone4, M(0xffffff), g, 0, 2.2, 0, 2.55, 0.35, 2.55);
  return g;
}

/* Phnom Penh backdrop: shophouse rows, the city's towers, Wat Phnom, Independence Monument */
function buildPhnomPenhSkyline(L2) {
  const PX = L2;                                             // the Royal Palace stands here
  const pastel = [0xf2d98a, 0xe9b8a0, 0xf4ead2, 0xc9dcc0, 0xe7c4c4, 0xbcd3e6, 0xf0c27a, 0xd9cfb2];
  // 1. dense low-rise shophouses (3-5 storeys, flat roofs, water tanks) along the riverfront streets
  for (let row = 0; row < 2; row++) {
    for (let x = -800; x < L2 + 1000; x += 0) {
      const w = rr(6, 10), h = rr(11, 21) + row * 4, d = rr(12, 18);
      x += w + rr(0, 0.6);
      if (Math.abs(x - PX) < 62) continue;                    // keep the palace clear
      const z = -148 - row * 26 + rnd() * 3;
      const b = box(scene, w, h, d, x, h / 2, z, M(pick(pastel)));
      box(scene, w + 0.4, 0.5, d + 0.4, x, h + 0.25, z, M(0xb9b09c));      // parapet
      for (let f = 1; f < Math.round(h / 4); f++) box(scene, w * 0.7, 1.4, 0.3, x, f * 4 - 0.2, z + d / 2 + 0.1, M(0x5b6a72));   // window bands
      if (rnd() < 0.4) cyl(scene, 0.9, 1.8, x + rr(-2, 2), h + 1.4, z, M(0x7a8b95));  // roof water tank
    }
  }
  // 2. the towers, clustered in the centre as in the real skyline
  const tower = (x, z, w, d, h, col, crown) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    box(g, w, h, d, 0, h / 2, 0, M(col));
    for (let y = 6; y < h; y += 5) box(g, w + 0.2, 0.8, d + 0.2, 0, y, 0, M(0x6f8ba3));    // glass bands
    if (crown === 'vattanac') { box(g, w * 0.7, 14, d * 0.7, 0, h + 7, 0, M(col)); mesh(GEO.cone4, M(0xb0b8c0), g, 0, h + 14, 0, w * 0.5, 22, d * 0.5); }
    else if (crown === 'canadia') { mesh(GEO.cone4, M(0xdfe9f2), g, 0, h, 0, w * 0.72, 18, d * 0.72); }
    else if (crown === 'gold') { box(g, w * 0.8, 6, d * 0.8, 0, h + 3, 0, GOLD); }
    else if (crown === 'twin') { box(g, w * 0.5, 8, d * 0.5, 0, h + 4, 0, M(0xb0b8c0)); }
    return g;
  };
  tower(PX - 190, -260, 30, 30, 120, 0x86a9cc, 'vattanac');     // Vattanac Capital Tower
  tower(PX - 140, -240, 26, 26, 95, 0xc9d8e6, 'canadia');       // Canadia Tower
  tower(PX + 165, -255, 24, 24, 85, 0xdfe9f2, 'gold');          // Gold Tower 42
  tower(PX + 215, -300, 28, 24, 110, 0x9fc2e0, 'twin');         // Exchange Square
  tower(PX + 245, -300, 24, 24, 90, 0x9fc2e0, 'twin');
  tower(PX - 260, -300, 28, 28, 100, 0xdfe9f2, 'canadia');
  tower(PX - 330, -330, 26, 26, 76, 0xc9d8e6, null);
  tower(PX + 330, -320, 30, 26, 70, 0x86a9cc, null);
  for (let i = 0; i < 28; i++) {                                // filler mid-rises in the distance
    const x = rr(-700, L2 + 900);
    if (Math.abs(x - PX) < 130) continue;
    const h = rr(24, 62), w = rr(16, 28);
    box(scene, w, h, rr(16, 26), x, h / 2, rr(-380, -300), M(pick([0x9fc2e0, 0xdfe9f2, 0x86a9cc, 0xc9d8e6, 0xf0e6d2])));
  }
  // 3. Wat Phnom: temple on its little hill, north of the palace
  { const g = new THREE.Group(); g.position.set(PX - 330, 0, -200); scene.add(g);
    mesh(GEO.sph, M(0x4f8a3a), g, 0, -4, 0, 46, 18, 40);
    box(g, 20, 0.6, 14, 0, 13.7, 0, M(0xe6dcc0));
    box(g, 14, 6, 9, 0, 17, 0, M(0xf2ead2));
    hipRoof(g, 17, 12, 5, 0, 20, 0, 0xc2392a, 1.0);
    hipRoof(g, 12, 8, 4, 0, 24, 0, 0xf2a21a, 0.9);
    const st = makeStupa(); st.scale.setScalar(0.7); st.position.set(12, 13.7, -5); g.add(st); }
  // 4. Independence Monument: red lotus-tiered tower, south of the palace
  { const g = new THREE.Group(); g.position.set(PX + 330, 0, -200); scene.add(g);
    const red = M(0xb5502f);
    box(g, 22, 3, 22, 0, 1.5, 0, M(0xd9cfb2)); box(g, 17, 3, 17, 0, 4.5, 0, M(0xe6dcc0));
    for (let i = 0; i < 5; i++) { const s = 8 - i * 1.15; cyl(g, s * 0.75, 6, 0, 9 + i * 6.2, 0, red, GEO.cyl6); cyl(g, s * 0.9, 1, 0, 12.4 + i * 6.2, 0, red, GEO.cyl6); }
    mesh(GEO.cone, red, g, 0, 42, 0, 3, 14, 3); mesh(GEO.cone, GOLD, g, 0, 52, 0, 0.3, 4, 0.3); }
}

const footprints = [];  // {x, hw} for tree avoidance
function buildShore() {
  const L2 = RACE_LEN;
  // river-bank wall + grounds
  box(scene, L2 + 1300, 3.0, 2.6, L2 / 2, 0.3, -45.4, M(0xc2b28d));
  box(scene, L2 + 1300, 0.4, 2.8, L2 / 2, 1.9, -45.4, M(0xe9dfc3));
  const pave = new THREE.Mesh(new THREE.PlaneGeometry(L2 + 1700, 60).rotateX(-PI / 2), M(0xd9cfb2)); pave.position.set(L2 / 2, 1.8, -76); scene.add(pave);
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(L2 + 3000, 800).rotateX(-PI / 2), M(0x6f9b4a)); grass.position.set(L2 / 2, 1.7, -466); scene.add(grass);
  // near bank (behind camera)
  const near = new THREE.Mesh(new THREE.PlaneGeometry(L2 + 3000, 600).rotateX(-PI / 2), M(0x6f9b4a)); near.position.set(L2 / 2, 1.4, 372); scene.add(near);
  box(scene, L2 + 1300, 3.0, 2.6, L2 / 2, 0.3, 72, M(0xc2b28d));

  // stepped bleachers
  const steps = [{ z: -47.8, y: 2.3 }, { z: -49.4, y: 2.9 }, { z: -51.0, y: 3.5 }, { z: -52.6, y: 4.1 }];
  steps.forEach((s, i) => box(scene, L2 + 1300, s.y - 1.7, 1.6, L2 / 2, 1.7 + (s.y - 1.7) / 2, s.z, M(i % 2 ? 0xe6e0d0 : 0xcfc7b3)));
  box(scene, L2 + 1300, 5.6, 0.4, L2 / 2, 2.8, -53.7, M(0xb3202a));  // back wall

  // landmarks
  const place = (obj, x, z, sc, hw) => { obj.position.set(x, 1.8, z); obj.scale.setScalar(sc || 1); scene.add(obj); footprints.push({ x, hw: hw * (sc || 1) + 4 }); };
  place(makePavilion(), -22, -66, 1.0, 7);
  place(makeStupa(), -62, -100, 1.1, 8);
  place(makeStupa(), 130, -104, 1.0, 8);
  place(makePavilion(), 108, -66, 1.0, 7);
  place(makeWatOunalom(), BANDS[0], -92, 1.1, 44);   // Wat Ounalom, straight behind the Band 1 gate
  place(makePavilion(), 372, -66, 1.0, 7);
  place(makeStupa(), 420, -102, 1.2, 8);
  place(makePavilion(), 478, -68, 1.0, 7);
  place(makePalace(), RACE_LEN, -94, 1.2, 31);   // the one Royal Palace, straight behind the finish line
  place(makeStupa(), 640, -100, 1.1, 8);
  place(makePavilion(), 775, -67, 1.0, 7);   // moved aside so it doesn't block the palace
  place(makeStupa(), 770, -104, 1.0, 8);
  place(makeStupa(), -140, -102, 1.0, 8);
  // tents along the promenade
  const tentCols = [0xff5a36, 0xffc22e, 0x2fa8e0, 0xe2336b, 0x3cc16a];
  for (let x = -150; x < L2 + 280; x += 17 + rnd() * 20) {
    if (footprints.some(f => Math.abs(f.x - x) < f.hw && true)) continue;
    const t = makeTent(pick(tentCols)); t.position.set(x, 1.8, -60 - rnd() * 4); t.scale.setScalar(rr(1.2, 1.7)); scene.add(t);
  }
  // distant skyline: Phnom Penh, with the Royal Palace (placed above) at its heart
  buildPhnomPenhSkyline(L2);
  // low hills / treeline
  for (let x = -900; x < L2 + 1100; x += 120) {
    const m = new THREE.Mesh(GEO.sph, M(0x4f8a3a), scene); m.position.set(x, -4, -190 - rnd() * 40); m.scale.set(rr(90, 160), rr(14, 26), rr(40, 60)); scene.add(m);
  }
}

function buildCrowdAndFlags() {
  const rows = [{ z: -47.9, y: 2.3 }, { z: -49.5, y: 2.9 }, { z: -51.1, y: 3.5 }, { z: -52.7, y: 4.1 }];
  const X0 = -150, X1 = RACE_LEN + 280;
  const list = [];
  rows.forEach(row => { for (let x = X0 + rnd(); x < X1; x += 0.72 + rnd() * 0.4) { if (rnd() < 0.07) continue; list.push({ x, y: row.y, z: row.z + (rnd() - 0.5) * 0.55 }); } });
  const n = list.length;
  const bodyGeo = new THREE.CylinderGeometry(0.26, 0.31, 0.85, 6).translate(0, 0.73, 0);
  const headGeo = new THREE.SphereGeometry(0.2, 7, 5).translate(0, 1.43, 0);
  // legs + feet: two legs and two shoes merged into one geometry
  const legParts = [];
  for (const sx of [-1, 1]) {
    legParts.push(new THREE.CylinderGeometry(0.075, 0.075, 0.32, 6).translate(sx * 0.12, 0.2, 0));
    legParts.push(new THREE.BoxGeometry(0.15, 0.08, 0.26).translate(sx * 0.12, 0.04, 0.05));
  }
  const legGeo = new THREE.BufferGeometry(), lp = [], ln = [], li = []; let lo = 0;
  legParts.forEach(g => { const pa = g.attributes.position.array, na = g.attributes.normal.array; for (let i = 0; i < pa.length; i++) { lp.push(pa[i]); ln.push(na[i]); } g.index.array.forEach(v => li.push(v + lo)); lo += pa.length / 3; });
  legGeo.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); legGeo.setAttribute('normal', new THREE.Float32BufferAttribute(ln, 3)); legGeo.setIndex(li);
  const armGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.72, 4).translate(0, 0.36, 0);
  const mk = (geo) => {
    const mt = new THREE.MeshLambertMaterial({ color: 0xffffff });
    mt.onBeforeCompile = sh => {
      sh.uniforms.uT = shared.uT;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n float ph=instanceMatrix[3].x*1.7+instanceMatrix[3].z*3.1;\n transformed.y += abs(sin(uT*(3.0+fract(ph*0.37)*2.6)+ph))*0.26;');
    };
    return new THREE.InstancedMesh(geo, mt, n);
  };
  const bodies = mk(bodyGeo), heads = mk(headGeo), legs = mk(legGeo);
  const armList = list.filter(() => rnd() < 0.5);
  const arms = mk(armGeo); arms.count = armList.length;
  const shirts = [0xe53935, 0xffc107, 0x2e86de, 0x43a047, 0xff7043, 0xffffff, 0xab47bc, 0x26c6da, 0xf06292, 0x1e4aa8, 0xffeb3b];
  const skins = [0xf1c27d, 0xd9a066, 0xc68642, 0x8d5524, 0xe0ac69];
  const o = new THREE.Object3D(), col = new THREE.Color();
  list.forEach((p, i) => {
    o.position.set(p.x, p.y, p.z); o.rotation.set(0, 0, 0); o.scale.set(1, rr(0.92, 1.1), 1); o.updateMatrix();
    bodies.setMatrixAt(i, o.matrix); heads.setMatrixAt(i, o.matrix); legs.setMatrixAt(i, o.matrix); legs.setColorAt(i, col.setHex(pick([0x2a2a35, 0x1f3a5f, 0x4a3b2a, 0x333333])));
    bodies.setColorAt(i, col.setHex(pick(shirts))); heads.setColorAt(i, col.setHex(pick(skins)));
  });
  armList.forEach((p, i) => {
    const s = rnd() < 0.5 ? -1 : 1;
    o.position.set(p.x + 0.27 * s, p.y + 1.08, p.z); o.rotation.set(0, 0, -0.35 * s); o.scale.set(1, 1, 1); o.updateMatrix();
    arms.setMatrixAt(i, o.matrix); arms.setColorAt(i, col.setHex(pick(skins)));
  });
  [bodies, heads, legs, arms].forEach(m => { m.frustumCulled = false; scene.add(m); });

  // flag poles + flags + bunting
  const step = 13, poleY = 1.9, poleH = 8.5;
  const poleXs = []; for (let x = -150; x < RACE_LEN + 280; x += step) poleXs.push(x);
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, poleH, 6).translate(0, poleH / 2, 0), M(0xf6f1e0), poleXs.length);
  const flagGeo = new THREE.PlaneGeometry(2.6, 1.7, 10, 1).translate(1.3, -0.85, 0);
  const flags = new THREE.InstancedMesh(flagGeo, flagMat, poleXs.length);
  const tips = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 6, 5), GOLD, poleXs.length);
  poleXs.forEach((x, i) => {
    o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1);
    o.position.set(x, poleY, -46.4); o.updateMatrix(); poles.setMatrixAt(i, o.matrix);
    o.position.set(x + 0.05, poleY + poleH - 0.1, -46.4); o.updateMatrix(); flags.setMatrixAt(i, o.matrix);
    o.position.set(x, poleY + poleH + 0.1, -46.4); o.updateMatrix(); tips.setMatrixAt(i, o.matrix);
  });
  [poles, flags, tips].forEach(m => { m.frustumCulled = false; scene.add(m); });

  const triGeo = new THREE.BufferGeometry();
  triGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.3, 0, 0, 0.3, 0, 0, 0, -0.75, 0]), 3));
  triGeo.computeVertexNormals();
  const per = 11, total = (poleXs.length - 1) * per;
  const bunting = new THREE.InstancedMesh(triGeo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), total);
  const pc = [0xe53935, 0xffc107, 0x2e86de, 0xffffff, 0x43a047, 0xff7043];
  let bi = 0;
  for (let i = 0; i < poleXs.length - 1; i++) for (let k = 0; k < per; k++) {
    const t = (k + 0.5) / per, x = lerp(poleXs[i], poleXs[i + 1], t);
    const y = poleY + poleH - 0.4 - 1.5 * (1 - (2 * t - 1) * (2 * t - 1));
    o.position.set(x, y, -46.4); o.rotation.set(0, 0, 0); o.updateMatrix(); bunting.setMatrixAt(bi, o.matrix); bunting.setColorAt(bi, col.setHex(pc[(i * per + k) % pc.length])); bi++;
  }
  bunting.frustumCulled = false; scene.add(bunting);

  // trees
  const tcount = 420;
  const foli = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), tcount);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 1, 5).translate(0, 0.5, 0), M(0x6b4a2b), tcount);
  const greens = [0x3f8f3a, 0x2e7d32, 0x5aa13c, 0x4c9a4a, 0x7ab648];
  let ti = 0;
  while (ti < tcount) {
    const x = rr(-250, RACE_LEN + 400), z = rr(-62, -135);
    if (footprints.some(f => Math.abs(f.x - x) < f.hw + 2)) continue;
    const s = rr(2.4, 4.4);
    o.rotation.set(0, rnd() * 3, 0); o.scale.set(0.5, s, 0.5); o.position.set(x, 1.8, z); o.updateMatrix(); trunk.setMatrixAt(ti, o.matrix);
    o.scale.set(s * 0.8, s * 0.75, s * 0.8); o.position.set(x, 1.8 + s * 1.05, z); o.updateMatrix(); foli.setMatrixAt(ti, o.matrix); foli.setColorAt(ti, col.setHex(pick(greens)));
    ti++;
  }
  scene.add(trunk, foli);
}

/* ------------------------------------------------------------------ */
/*  Course: buoys, start / finish gates                               */
/* ------------------------------------------------------------------ */
let buoys, buoyBase = [];
const gates = [];
function buildCourse() {
  const seps = [0];   // single divider between the Red and Blue lanes
  const xs = []; for (let x = -60; x <= RACE_LEN + 120; x += 14) xs.push(x);
  const n = seps.length * xs.length;
  buoys = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }), n);
  const col = new THREE.Color(), o = new THREE.Object3D(); let i = 0;
  seps.forEach((z, si) => xs.forEach((x, xi) => {
    buoyBase.push(x, z); o.position.set(x, 0, z); o.updateMatrix(); buoys.setMatrixAt(i, o.matrix);
    buoys.setColorAt(i, col.setHex(0xe8232b)); i++;
  }));
  buoys.frustumCulled = false; scene.add(buoys);

  let bandHull = null;
  const gate = (x, kh, en, finish, band) => {
    const g = new THREE.Group(); g.position.x = x; scene.add(g); gates.push(g);
    const topG = new THREE.Group(); g.add(topG); g.userData.top = topG;
    const tex = bannerTexture(kh, en, 1024, 180, finish, band);
    // big banner facing the camera, hung on the far side of the course
    const bx = (finish || band) ? -3 : -7;
    const fb = new THREE.Mesh(new THREE.PlaneGeometry(25, 4.4), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, fog: false }));
    fb.position.set(bx, 10.2, -19.5); if (!band && !finish) g.add(fb);   // no signboard on band or finish gates
    if (false) for (const dx of [-13.2, 13.2]) {
      cyl(g, 0.4, 13, bx + dx, 6.5, -19.5, M(0xb3202a)); mesh(GEO.cone, GOLD, g, bx + dx, 13.8, -19.5, 0.55, 1.4, 0.55);
    }
    if (false) box(g, 26.5, 0.35, 0.35, bx, 12.6, -19.5, GOLD);
    if (false) for (const dx of [-13.2, 13.2]) { // chequered flags on the posts
      const ft = canvasTex(64, 64, (c) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { c.fillStyle = (x + y) % 2 ? '#fff' : '#e0283f'; c.fillRect(x * 16, y * 16, 16, 16); } });
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8, 6, 1).translate(1.2, 0, 0), flagClone()); fl.material.map = ft; fl.position.set(bx + dx, 11.4, -19.5); g.add(fl);
    }
    // floating line on the water
    const lineTex = canvasTex(64, 64, (c, w, h) => {
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { c.fillStyle = ((x + y) % 2) ? ('#e0283f') : '#ffffff'; c.fillRect(x * 32, y * 32, 32, 32); }
    });
    lineTex.wrapS = lineTex.wrapT = THREE.RepeatWrapping; lineTex.repeat.set(2, 22);
    const ln = new THREE.Mesh(new THREE.PlaneGeometry(3, 33).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ map: lineTex, transparent: true, opacity: finish ? 0.95 : 0.8, depthWrite: false }));
    ln.position.set(0, 0.2, 0); g.add(ln);
    g.userData.line = ln;
    if (band) { // band markers: small red boats with red flags instead of the chequered strip
      ln.visible = false;
      const redM = new THREE.MeshLambertMaterial({ color: 0xd4162d }), darkM = M(0x7d0a1c);
      const rf = canvasTex(64, 40, (c, w, h) => { c.fillStyle = '#e0283f'; c.fillRect(0, 0, w, h); });
      for (const bz of [0]) {
        const sb = new THREE.Group(); sb.position.set(0, 0.1, bz); g.add(sb);
        // slim dragon-boat style hull (same shape as the racing boats, scaled down) instead of a boxy block
        bandHull = bandHull || hullGeometry();
        const hl = new THREE.Mesh(bandHull, new THREE.MeshLambertMaterial({ color: 0xd4162d, side: THREE.DoubleSide }));
        hl.scale.set(0.34, 0.42, 0.5); sb.add(hl);
        const dk = new THREE.Mesh(bandHull, new THREE.MeshLambertMaterial({ color: 0x7d0a1c, side: THREE.DoubleSide }));
        dk.scale.set(0.335, 0.4, 0.46); dk.position.y = 0.03; sb.add(dk);
        for (const sx of [-1, 1]) {   // gilded prow and stern posts
          const f = mesh(GEO.cone, GOLD, sb, sx * (HL * 0.34 + 0.02), 0.95, 0, 0.09, 0.4, 0.09); f.rotation.z = -sx * 0.5;
        }
        cyl(sb, 0.05, 2.6, 0, 1.6, 0, M(0xe9c477));
        const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.85, 6, 1).translate(0.65, 0, 0), flagClone());
        fl.material.map = rf; fl.position.set(0.05, 2.5, 0); sb.add(fl);
      }
    }
    if (finish) { // five red boats (a bit bigger than the band markers), each with a drummer who beats once per arrival
      const redM = new THREE.MeshLambertMaterial({ color: 0xd4162d }), darkM = M(0x7d0a1c);
      const rf = canvasTex(64, 40, (c, w, h) => { c.fillStyle = '#e0283f'; c.fillRect(0, 0, w, h); });
      const skinM = M(0xc58a5a), hairM = M(0x1a1a1a), stickM = M(0xe9c477);
      g.userData.drums = [];
      for (const bz of [10, -10]) {
        const sb = new THREE.Group(); sb.position.set(0, 0.2, bz); sb.scale.setScalar(1.9); g.add(sb);
        // slim dragon-boat style hull (same shape as the racing boats, scaled down) with a small deck
        bandHull = bandHull || hullGeometry();
        const hl = new THREE.Mesh(bandHull, new THREE.MeshLambertMaterial({ color: 0xd4162d, side: THREE.DoubleSide }));
        hl.scale.set(0.34, 0.6, 0.6); sb.add(hl);
        const dk = new THREE.Mesh(bandHull, new THREE.MeshLambertMaterial({ color: 0x7d0a1c, side: THREE.DoubleSide }));
        dk.scale.set(0.335, 0.57, 0.56); dk.position.y = 0.03; sb.add(dk);
        box(sb, 2.2, 0.06, 0.8, -0.1, 0.1, 0, M(0xa9774a));   // floor inside the hull: the drummer stands on it, below the gunwale
        for (const sx of [-1, 1]) {
          const f = mesh(GEO.cone, GOLD, sb, sx * (HL * 0.34 + 0.02), 1.1, 0, 0.09, 0.4, 0.09); f.rotation.z = -sx * 0.5;
        }
        cyl(sb, 0.05, 2.6, 1.6, 1.8, 0, stickM);
        const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.85, 6, 1).translate(0.65, 0, 0), flagClone());
        fl.material.map = rf; fl.position.set(1.65, 2.6, 0); sb.add(fl);
        // drum
        const dr = new THREE.Group(); dr.position.set(-0.55, 0.13, 0); sb.add(dr);
        cyl(dr, 0.34, 0.5, 0, 0.27, 0, redM);
        cyl(dr, 0.37, 0.06, 0, 0.04, 0, GOLD); cyl(dr, 0.37, 0.06, 0, 0.5, 0, GOLD);
        cyl(dr, 0.31, 0.03, 0, 0.54, 0, M(0xf3e2b8));
        // drummer (behind the drum, facing it)
        const pp = new THREE.Group(); pp.position.set(0.15, 0.13, 0); sb.add(pp);
        const shM = M(0xe0283f);
        const tor = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.15, 0.52, 14, 2), shM); tor.scale.set(0.8, 1, 1.25); tor.position.set(0, 0.46, 0); pp.add(tor);   // rounded torso, broader at the shoulders
        mesh(GEO.cyl, skinM, pp, 0, 0.74, 0, 0.05, 0.1, 0.05);   // neck
        for (const z of [-1, 1]) mesh(GEO.sph, shM, pp, 0, 0.67, z * 0.23, 0.14, 0.14, 0.14);   // round shoulders
        mesh(GEO.sph, skinM, pp, 0, 0.88, 0, 0.16, 0.17, 0.15);   // round head
        mesh(GEO.sph, hairM, pp, -0.015, 0.93, 0, 0.17, 0.15, 0.16);   // hair cap
        for (const lz of [-0.1, 0.1]) {   // legs + feet (feet point toward the drum)
          mesh(GEO.cyl, M(0x2a2a35), pp, 0, 0.14, lz, 0.07, 0.26, 0.07);   // round leg
          mesh(GEO.sph, M(0x1a1a1a), pp, -0.05, 0.04, lz, 0.13, 0.04, 0.075);   // rounded foot
        }
        const arms = [];
        for (const az of [-0.22, 0.22]) {   // arms[1] (z +0.22) is the right hand as seen on the mirrored screen and does the striking
          const arm = new THREE.Group(); arm.position.set(0, 0.62, az); pp.add(arm);
          const ua = mesh(GEO.cyl, M(0xe0283f), arm, -0.12, 0, 0, 0.075, 0.26, 0.075); ua.rotation.z = PI / 2;   // sleeve
          const fa = mesh(GEO.cyl, skinM, arm, -0.37, 0, 0, 0.055, 0.26, 0.055); fa.rotation.z = PI / 2;   // rounded forearm
          mesh(GEO.sph, skinM, arm, -0.51, 0, 0, 0.065, 0.065, 0.065);   // hand
          const st2 = mesh(GEO.cyl, stickM, arm, -0.74, 0, 0, 0.03, 0.5, 0.03); st2.rotation.z = PI / 2;  // stick
          mesh(GEO.sph, M(0xb3202a), arm, -0.98, 0, 0, 0.1, 0.1, 0.1);   // mallet head
          arm.rotation.z = az > 0 ? -0.95 : 1.3; arms.push(arm);
        }
        g.userData.drums.push({ dr, arms, pp, bz, hit: 0 });
      }
      ln.visible = false;
    }
    return g;
  };
  gate(0, 'ចាប់ផ្ដើម', 'START', false);
  gate(BANDS[0], 'កងព័ន្ធទី១', 'BAND 1', false, true);
  gate(BANDS[1], 'កងព័ន្ធទី២', 'BAND 2', false, true);
  gate(RACE_LEN, 'ទីបញ្ចប់', 'FINISH', true);
}

/* ------------------------------------------------------------------ */
/*  Dragon boat builder                                               */
/* ------------------------------------------------------------------ */
const sheerTop = u => 0.82 + (u < 0 ? 0.75 : 0.3) * Math.pow(Math.abs(u), 4.5);   // stern (u<0) rises a bit higher than the bow
function hullGeometry() {
  const N = 72, Mm = 14, pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const u = -1 + 2 * i / N, au = Math.abs(u), x = u * HL;
    const w = 0.12 + 0.88 * Math.pow(1 - Math.pow(au, 3.0), 0.7);
    const top = sheerTop(u);
    const d = 0.3 + 1.05 * Math.pow(1 - Math.pow(au, 2.2), 0.85);
    for (let j = 0; j <= Mm; j++) {
      const th = PI * j / Mm;
      pos.push(x, top - d * Math.sin(th), -w * Math.cos(th));
      uv.push(i / N, j / Mm);
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < Mm; j++) {
    const a = i * (Mm + 1) + j, b = a + 1, c = a + Mm + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const HULL_GEO = hullGeometry();

function tubeAlong(points, r, segs, mat, tapered) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  const geo = new THREE.TubeGeometry(curve, segs, r, 8, false);
  if (tapered) { // taper radius toward the end
    const p = geo.attributes.position, nrm = geo.attributes.normal, ring = 9;
    for (let i = 0; i < p.count; i++) {
      const seg = Math.floor(i / ring), t = seg / segs, k = lerp(1, 0.25, t);
      const c = curve.getPointAt(Math.min(1, t));
      p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, c.z + (p.getZ(i) - c.z) * k);
    }
  }
  return { mesh: new THREE.Mesh(geo, mat), curve };
}

function makeNagaHead() {
  const h = new THREE.Group();
  const green = M(0x20a35a), dark = M(0x0e6a3a), red = M(0xd0202a), white = M(0xfff8e8), black = M(0x111111);
  mesh(GEO.sph, green, h, 0, 0, 0, 0.78, 0.62, 0.64);
  mesh(GEO.sph, green, h, 0.95, -0.1, 0, 0.85, 0.3, 0.46);
  mesh(GEO.sph, dark, h, 1.55, 0.03, 0, 0.26, 0.17, 0.4);        // nose pad
  for (const s of [-1, 1]) mesh(GEO.sph, GOLD, h, 1.72, 0.14, s * 0.2, 0.09, 0.09, 0.09); // nostrils
  const jaw = new THREE.Group(); jaw.position.set(0.1, -0.34, 0); jaw.rotation.z = -0.5; h.add(jaw);
  mesh(GEO.sph, green, jaw, 0.75, 0, 0, 0.88, 0.16, 0.38);
  mesh(GEO.box, red, jaw, 0.8, 0.1, 0, 1.0, 0.06, 0.28);          // tongue
  for (let k = 0; k < 5; k++) for (const s of [-1, 1]) {
    mesh(GEO.cone, white, jaw, 0.25 + k * 0.28, 0.17, s * 0.27, 0.05, 0.2, 0.05);
    mesh(GEO.cone, white, h, 0.55 + k * 0.23, -0.2, s * 0.3, 0.05, -0.2, 0.05);
  }
  for (const s of [-1, 1]) {
    mesh(GEO.sph, white, h, 0.5, 0.26, s * 0.42, 0.17, 0.17, 0.17);
    mesh(GEO.sph, black, h, 0.62, 0.27, s * 0.5, 0.09, 0.09, 0.09);
    const br = mesh(GEO.box, GOLD, h, 0.52, 0.5, s * 0.4, 0.55, 0.08, 0.1); br.rotation.z = -0.25;
    const ear = mesh(GEO.cone, GOLD, h, -0.1, 0.1, s * 0.62, 0.17, 0.9, 0.17); ear.rotation.x = s * 1.1; ear.rotation.z = 0.6;
  }
  // crest — five gilded flames fanned across the back of the head
  for (let k = 0; k < 5; k++) {
    const ang = 0.15 + k * 0.38, len = 1.35 - Math.abs(k - 2) * 0.12;
    const c = mesh(GEO.cone, k % 2 ? GOLD : M(0xe8731a), h, -0.25 - Math.sin(ang) * len * 0.5, 0.4 + Math.cos(ang) * len * 0.5, 0, 0.17, len, 0.17);
    c.rotation.z = ang;
  }
  for (let k = 0; k < 3; k++) { const c = mesh(GEO.cone, GOLD, h, -0.1 - k * 0.1, 0.55, (k - 1) * 0.35, 0.12, 0.9, 0.12); c.rotation.z = 0.5 + k * 0.1; }
  return h;
}


/* ------------------------------------------------------------------ */
/*  Golden apsara: jointed figure with 2-bone IK (fixed bone lengths)  */
/* ------------------------------------------------------------------ */
const _ik = { d: new THREE.Vector3(), dir: new THREE.Vector3(), perp: new THREE.Vector3(), q: new THREE.Quaternion() };
function ik2(base, target, l1, l2, pole, elbow, wrist) {
  const d = _ik.d.subVectors(target, base); let len = d.length(); if (len < 1e-4) { d.set(0, -1, 0); len = 1e-4; }
  const dir = _ik.dir.copy(d).multiplyScalar(1 / len);
  // soft limit near full extension: a hard clamp makes the elbow/knee pop (sqrt singularity) when the target hovers at max reach
  const rmax = l1 + l2 - 0.012, r0 = rmax * 0.8, rmin = Math.abs(l1 - l2) + 0.02;
  const reach = Math.max(rmin, len <= r0 ? len : r0 + (rmax - r0) * Math.tanh((len - r0) / (rmax - r0)));
  wrist.copy(base).addScaledVector(dir, reach);
  const a = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const perp = _ik.perp.copy(pole).addScaledVector(dir, -pole.dot(dir)); if (perp.lengthSq() < 1e-6) perp.set(0, 0, 1); perp.normalize();
  elbow.copy(base).addScaledVector(dir, a).addScaledVector(perp, h);
}
function aimV(m, a, b) { aim(m, a.x, a.y, a.z, b.x, b.y, b.z); }

const APSARA_STYLES = [
  { mode: 0, speed: 1.0, sway: 0.03, twist: 0.2475, kick: 0.072, back: 0.60, flex: 0.014, tilt: 0.077 },   // classic: arms trade high / low
  { mode: 1, speed: 0.8, sway: 0.018, twist: 0.1375, kick: 0.042, back: 0.55, flex: 0.0105, tilt: 0.055 },  // lotus: both arms rise and bloom
  { mode: 2, speed: 1.3, sway: 0.042, twist: 0.3575, kick: 0.12,  back: 0.66, flex: 0.0245, tilt: 0.099 },  // wings: arms spread wide, lively turns
  { mode: 3, speed: 1.1, sway: 0.054, twist: 0.1925, kick: 0.09, back: 0.62, flex: 0.0175, tilt: 0.121 },  // circling hands
  { mode: 4, speed: 0.9, sway: 0.024, twist: 0.3025, kick: 0.06,  back: 0.5,  flex: 0.021, tilt: 0.165 }    // greeting: hands together in front
];
function makeApsara(styleIdx) {
  const st = APSARA_STYLES[styleIdx % APSARA_STYLES.length];
  const gold2 = new THREE.MeshPhongMaterial({ color: 0xe9c45a, shininess: 60, specular: 0xfff0b0, emissive: 0x2a1c00 });
  const goldL = new THREE.MeshPhongMaterial({ color: 0xf6dc8a, shininess: 40, emissive: 0x2a2208, side: THREE.DoubleSide });
  const skin = M(0xe8b488), hairM = M(0x1a1410), white = M(0xffffff);
  const root = new THREE.Group();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // pelvis + sampot
  const pelvis = new THREE.Group(); root.add(pelvis);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.36, 0.78, 16, 1, true), goldL); skirt.position.y = -0.38; skirt.scale.set(0.9, 1, 1.05); pelvis.add(skirt);
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.022, 5, 18), GOLD); hem.position.y = -0.77; hem.rotation.x = PI / 2; hem.scale.set(0.9, 1.05, 1); pelvis.add(hem);
  mesh(GEO.cyl, GOLD, pelvis, 0, 0.02, 0, 0.2, 0.07, 0.22);
  // legs
  const legG = new THREE.CylinderGeometry(0.07, 0.055, 1, 8);
  const mk = (g, m) => { const x = new THREE.Mesh(g, m); root.add(x); return x; };
  const thS = mk(legG, gold2), shS = mk(legG, gold2), thR = mk(legG, gold2), shR = mk(legG, gold2);
  const footS = mesh(GEO.sph, gold2, root, 0, 0, 0, 0.14, 0.05, 0.07), footR = mesh(GEO.sph, gold2, root, 0, 0, 0, 0.06, 0.14, 0.07);
  const ankS = mesh(GEO.cyl, GOLD, root, 0, 0, 0, 0.065, 0.04, 0.065), ankR = mesh(GEO.cyl, GOLD, root, 0, 0, 0, 0.06, 0.04, 0.06);
  // the raised back leg read as a 'tail' behind the dancer, so it is hidden (she stands on one leg under the skirt)
  for (const o of [thR, shR, footR, ankR]) o.visible = false;
  // torso
  const torso = new THREE.Group(); root.add(torso);
  // rounded, feminine torso: ribcage ellipsoid, tapered waist, soft hips (no boxy slab)
  mesh(GEO.sph, gold2, torso, 0, 0.4, 0, 0.125, 0.17, 0.17);
  const waistG = new THREE.CylinderGeometry(1, 0.92, 1, 16);
  mesh(waistG, gold2, torso, 0, 0.2, 0, 0.12, 0.3, 0.165);
  mesh(GEO.sph, gold2, torso, 0, 0.07, 0, 0.13, 0.1, 0.18);
  mesh(GEO.sph, gold2, torso, 0.0, 0.5, 0, 0.09, 0.09, 0.17);
  mesh(GEO.sph, GOLD, torso, 0.09, 0.4, 0, 0.1, 0.16, 0.2);
  mesh(GEO.cyl, GOLD, torso, 0, 0.6, 0, 0.1, 0.08, 0.1);
  for (const z of [-1, 1]) mesh(GEO.sph, gold2, torso, 0, 0.54, z * 0.19, 0.075, 0.075, 0.075);
  // head
  const head = new THREE.Group(); head.position.set(0, 0.63, 0); torso.add(head);
  mesh(GEO.cyl, skin, head, 0, 0.05, 0, 0.05, 0.12, 0.05);
  mesh(GEO.sph, skin, head, 0.02, 0.2, 0, 0.16, 0.18, 0.15);
  mesh(GEO.sph, hairM, head, -0.07, 0.24, 0, 0.14, 0.15, 0.15);
  // face (looks toward +x, the direction of travel)
  const dark = M(0x120a06), iris = M(0x5a2a18), lipM = M(0xc2283a), blush = M(0xe88a80);
  for (const z of [-1, 1]) {
    mesh(GEO.sph, white, head, 0.145, 0.22, z * 0.062, 0.03, 0.03, 0.04);            // big almond eyes
    mesh(GEO.sph, iris, head, 0.168, 0.22, z * 0.062, 0.018, 0.024, 0.026);
    mesh(GEO.sph, dark, head, 0.178, 0.22, z * 0.062, 0.01, 0.014, 0.014);
    const br = mesh(GEO.box, dark, head, 0.15, 0.275, z * 0.066, 0.012, 0.01, 0.075); br.rotation.x = -z * 0.3;  // thin arched brows
    mesh(GEO.sph, blush, head, 0.138, 0.15, z * 0.095, 0.02, 0.025, 0.035);
    // flared golden crown wings beside the face
    const w = mesh(GEO.cone, GOLD, head, 0.0, 0.34, z * 0.2, 0.09, 0.2, 0.05); w.rotation.x = z * 0.7;
    // teardrop earrings
    mesh(GEO.sph, GOLD, head, 0.0, 0.11, z * 0.152, 0.025, 0.025, 0.025);
    const er = mesh(GEO.cone, GOLD, head, 0.0, 0.03, z * 0.152, 0.035, 0.1, 0.035); er.rotation.z = PI;
  }
  // black hairline band under the crown, front only
  mesh(GEO.sph, hairM, head, 0.055, 0.295, 0, 0.125, 0.04, 0.15);
  // golden collar necklace with a pendant
  mesh(GEO.cyl, GOLD, head, 0, -0.02, 0, 0.17, 0.025, 0.2);
  const pend = mesh(GEO.cone, GOLD, head, 0.14, -0.1, 0, 0.05, 0.12, 0.05); pend.rotation.z = PI;
  mesh(GEO.sph, skin, head, 0.178, 0.185, 0, 0.03, 0.04, 0.03);
  mesh(GEO.sph, lipM, head, 0.158, 0.125, 0, 0.022, 0.016, 0.05);
  mesh(GEO.cyl, GOLD, head, 0, 0.33, 0, 0.18, 0.09, 0.18);
  mesh(GEO.cone, GOLD, head, 0, 0.54, 0, 0.13, 0.36, 0.13);
  mesh(GEO.cone, GOLD, head, 0, 0.82, 0, 0.085, 0.32, 0.085);
  mesh(GEO.cone, GOLD, head, 0, 1.08, 0.0, 0.05, 0.28, 0.05);
  mesh(GEO.sph, white, head, 0.1, 0.22, 0.16, 0.065, 0.065, 0.065);
  // flowing scarf (two segments that lag each other)
  // arms
  const upG = new THREE.CylinderGeometry(0.062, 0.047, 1, 12), foG = new THREE.CylinderGeometry(0.047, 0.03, 1, 12);   // tapered limbs
  const arm = () => {
    const up = mk(upG, skin), fo = mk(foG, skin), el = mesh(GEO.sph, skin, root, 0, 0, 0, 0.049, 0.049, 0.049), hand = new THREE.Group(); root.add(hand);
    mesh(GEO.sph, skin, hand, 0, 0.05, 0, 0.04, 0.07, 0.022);
    const fing = new THREE.Group(); fing.position.y = 0.09; hand.add(fing);   // fingers curl/flick as one fan
    for (let k = 0; k < 4; k++) {
      const z = (k - 1.5) * 0.026, len = k === 1 || k === 2 ? 0.11 : 0.09;
      const f = mesh(GEO.cone, skin, fing, 0, len / 2, z, 0.016, len, 0.016); f.rotation.x = z * 2.2;
    }
    const thumb = mesh(GEO.cone, skin, hand, 0.03, 0.08, 0, 0.018, 0.08, 0.018); thumb.rotation.z = -0.6;
    mesh(GEO.cyl, GOLD, hand, 0, 0.0, 0, 0.06, 0.035, 0.06);   // bracelet
    return { up, fo, el, hand, fing };
  };
  const armR = arm(), armL = arm();

  const T = { shS: V(), elb: V(), wr: V(), a: V(), b: V(), c: V(), hR: V(), hL: V(), p: V() };
  const UPv = new THREE.Vector3(0, 1, 0);
  const lerpV = (o, a, b, t) => o.set(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
  const hiR = V(), loR = V(), hiL = V(), loL = V();
  const wrist = { f: 0 }; let curPh = 0;

  const we = new THREE.Euler();
  function doArm(A, shoulder, hand, pole, sd) {
    ik2(shoulder, hand, 0.31, 0.3, pole, T.elb, T.wr);
    aimV(A.up, shoulder, T.elb); aimV(A.fo, T.elb, T.wr);
    A.hand.position.copy(T.wr); A.el.position.copy(T.elb);
    T.p.subVectors(T.wr, T.elb).normalize();
    A.hand.quaternion.setFromUnitVectors(UPv, T.p);
    // graceful wrist: flex, side-to-side sweep and forearm twist, each lagging the arm (follow-through);
    // the two hands mirror each other with a half-beat offset
    const pp = curPh + (sd < 0 ? 0.9 : 0);
    we.set(0.12, 0, 0.18 * Math.sin(pp - 0.9))   // wrists flex forwards/backwards only;
    wq.setFromEuler(we); A.hand.quaternion.multiply(wq);
    A.fing.rotation.x = 0.05 + 0.3 * (0.5 + 0.5 * Math.sin(pp - 1.2));   // fingers bloom open then curl back
  }

  // low-pass filtered state: gives follow-through, removes any jerks
  const F = { tr: V(), pe: V(), hd: V(), hR: V(), hL: V(), an: V(), s1: V(), s2: V(), hR2: V(), hL2: V(), tr2: V(), an2: V(), pe2: V(), hR3: V(), hL3: V(), tr3: V(), an3: V(), pe3: V(), hd2: V() };
  const tgt = V(), WX = new THREE.Vector3(1, 0, 0), wq = new THREE.Quaternion();
  const sm = (cur, t, k, dt) => cur.lerp(t, 1 - Math.exp(-k * dt));
  function update(ph, lift, dt) {
    dt = Math.min(dt === undefined || !(dt >= 0) ? 0.016 : dt, 0.05);
    if (!isFinite(ph)) ph = 0;
    // self-heal: a NaN in any low-pass filter would poison the pose forever and make the dancer vanish
    let fs = 0; for (const k in F) fs += F[k].x + F[k].y + F[k].z;
    if (!isFinite(fs) || !isFinite(wrist.f)) { for (const k in F) F[k].set(0, 0, 0); wrist.f = 0; }
    const s1 = Math.sin(ph), c1 = Math.cos(ph), sh = Math.sin(ph * 0.5);
    const hipY = 0.87 - st.flex * (1 - Math.cos(ph)), hipZ = st.sway * s1;
    pelvis.position.set(0, hipY, hipZ); sm(F.pe, tgt.set(0.05 * s1, st.twist * 0.5 * sh, -0.025 * s1), 6, dt); sm(F.pe2, F.pe, 6, dt); sm(F.pe3, F.pe2, 6, dt); pelvis.rotation.set(F.pe3.x, F.pe3.y, F.pe3.z);
    torso.position.set(0, hipY, hipZ); sm(F.tr, tgt.set(-0.06 * s1, st.twist * sh, -0.05 + 0.03 * Math.sin(ph - 0.5)), 6, dt); sm(F.tr2, F.tr, 6, dt); sm(F.tr3, F.tr2, 6, dt); torso.rotation.set(F.tr3.x, F.tr3.y, F.tr3.z);
    torso.updateMatrix();
    sm(F.hd, tgt.set(0.05 * Math.sin(ph + 0.8), 0.2 * Math.sin(ph * 0.5 - 0.6), -st.tilt * Math.sin(ph + 0.4)), 5, dt); sm(F.hd2, F.hd, 5, dt); head.rotation.set(F.hd2.x, F.hd2.y, F.hd2.z);

    // standing leg (knee bends forward) and raised back leg (knee points down/forward)
    T.a.set(0, hipY - 0.02, hipZ - 0.05); T.b.set(0.03, 0.07, -0.02);
    ik2(T.a, T.b, 0.46, 0.46, V(1, 0, 0), T.elb, T.wr);
    aimV(thS, T.a, T.elb); aimV(shS, T.elb, T.wr);
    footS.position.set(T.wr.x + 0.06, T.wr.y - 0.02, T.wr.z); ankS.position.copy(T.wr); ankS.position.y += 0.03;
    T.a.set(0, hipY - 0.02, hipZ + 0.06); T.b.set(-st.back + 0.07 * s1, 0.64 + st.kick * Math.sin(ph + 0.6) + lift * 0.2, 0.11);
    sm(F.an, T.b, 6, dt); sm(F.an2, F.an, 6, dt); sm(F.an3, F.an2, 6, dt); T.b.copy(F.an3);
    ik2(T.a, T.b, 0.46, 0.46, V(0.45, -1, 0), T.elb, T.wr);
    aimV(thR, T.a, T.elb); aimV(shR, T.elb, T.wr);
    T.p.subVectors(T.wr, T.elb).normalize();
    footR.quaternion.setFromUnitVectors(UPv, T.p); footR.position.copy(T.wr).addScaledVector(T.p, 0.08);
    ankR.position.copy(T.wr); ankR.quaternion.copy(footR.quaternion);

    // arm choreography differs per style
    const m = 0.5 + 0.5 * sh, L = lift * 0.25;
    // every style keeps each hand in a fixed side plane (constant z): the hands only travel forwards <-> backwards (x), with a little rise and fall
    // every style: hands swing in opposition: one forwards while the other goes back
    T.hR.set(0.2 + 0.32 * s1, 1.5 + 0.1 * c1 + L, 0.4);
    T.hL.set(0.2 - 0.32 * s1, 1.34 - 0.1 * c1 + L, -0.4);
    sm(F.hR, T.hR, 4, dt); sm(F.hR2, F.hR, 4, dt); sm(F.hR3, F.hR2, 4, dt); T.hR.copy(F.hR3); sm(F.hL, T.hL, 4, dt); sm(F.hL2, F.hL, 4, dt); sm(F.hL3, F.hL2, 4, dt); T.hL.copy(F.hL3);
    curPh = ph; wrist.f += ((0.4 + 0.2 * Math.sin(ph + 0.6)) - wrist.f) * (1 - Math.exp(-6 * dt));
    T.shS.set(0, 0.54, 0.19).applyMatrix4(torso.matrix);
    doArm(armR, T.shS.clone(), T.hR.clone(), V(-0.2, -0.7, 1), 1);
    T.shS.set(0, 0.54, -0.19).applyMatrix4(torso.matrix);
    doArm(armL, T.shS.clone(), T.hL.clone(), V(-0.5, -0.8, -1), -1);
  }
  update(0, 0, 10);
  return { root, update, speed: st.speed };
}

// merged, vertex-coloured limb in unit space (+Y = hand end): sleeve + tapered forearm + hand
const _armCache = {};
function makeArmGeo(shirtHex, skinHex) {
  const key = shirtHex + '_' + skinHex; if (_armCache[key]) return _armCache[key];
  const parts = [];
  const add = (g, hex, x, y, z, sx, sy, sz) => { g = g.toNonIndexed(); g.scale(sx, sy, sz); g.translate(x, y, z); parts.push([g, new THREE.Color(hex)]); };
  add(new THREE.CylinderGeometry(0.088, 0.082, 1, 20, 2), shirtHex, 0, -0.27, 0, 1, 0.46, 1);   // sleeve over the upper arm
  add(new THREE.CylinderGeometry(0.082, 0.07, 1, 20), skinHex, 0, -0.03, 0, 1, 0.1, 1);          // bare upper-arm bit under sleeve
  add(new THREE.SphereGeometry(0.07, 20, 14), skinHex, 0, 0.0, 0, 1, 1, 1);                        // smooth elbow joint
  add(new THREE.CylinderGeometry(0.068, 0.04, 1, 20, 2), skinHex, 0, 0.25, 0, 1, 0.5, 1);         // forearm, tapering to the wrist
  add(new THREE.SphereGeometry(0.088, 20, 14), shirtHex, 0, -0.5, 0, 1, 0.8, 1);                  // rounded shoulder cap, same colour as sleeve
  add(new THREE.SphereGeometry(0.058, 16, 12), skinHex, 0, 0.5, 0, 1, 1.5, 0.8);                  // hand
  let n = 0; for (const [g] of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const [g, c] of parts) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < g.attributes.position.count; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
    o += g.attributes.position.count;
  }
  const G2 = new THREE.BufferGeometry();
  G2.setAttribute('position', new THREE.BufferAttribute(pos, 3)); G2.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); G2.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return (_armCache[key] = G2);
}
const ARM_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });

function makeBoat(si) {
  const s = typeof si === 'object' ? si : SCHEMES[si], sty = typeof si === 'object' ? s.style : si;
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);

  // hull
  const tex = hullTexture(s);
  body.add(new THREE.Mesh(HULL_GEO, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide })));
  const inner = new THREE.Mesh(HULL_GEO, new THREE.MeshLambertMaterial({ color: 0xa9774a, side: THREE.DoubleSide }));
  inner.scale.set(0.992, 0.97, 0.9); inner.position.y = 0.05; body.add(inner);

  // deck floor inside the hull, just above the waterline, so no water shows through the open hull
  {
    const YD = 0.55, N = 60, pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const x = -HL + 2 * HL * i / N, hu = Math.abs(x / HL);
      const hw = 0.12 + 0.88 * Math.pow(1 - Math.pow(hu, 3.0), 0.7);
      const top = sheerTop(x / HL), hd = 0.3 + 1.05 * Math.pow(1 - Math.pow(hu, 2.2), 0.85);
      const sn = clamp((top - YD) / hd, 0, 1), w = sn > 0.8 ? 0 : hw * Math.sqrt(1 - sn * sn) * 0.94;
      pos.push(x, YD, -w, x, YD, w);
    }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); dg.setIndex(idx); dg.computeVertexNormals();
    body.add(new THREE.Mesh(dg, new THREE.MeshLambertMaterial({ color: 0xa9774a, side: THREE.DoubleSide })));
  }

  const anim = root.userData.anim = { flags: [], tassels: [] };   // stern flag + tassels flutter in updateVisuals
  // bow: gilded prow with a team flag; stern: upturned tail with red / black tassels (as on real racing boats)
  {
    const f = mesh(GEO.cone, GOLD, body, HL + 0.05, 1.27, 0, 0.17, 0.7, 0.17); f.rotation.z = -0.5;
    mesh(GEO.sph, GOLD, body, HL, 1.02, 0, 0.14, 0.14, 0.14);
    // flag pole + flag hang off a pivot at the pole's foot, raked back 50 degrees
    const flagRig = new THREE.Group(); flagRig.position.set(-HL + 0.6, 1.2, 0); flagRig.rotation.z = 50 * PI / 180; body.add(flagRig);
    mesh(GEO.cyl, M(0xe9c477), flagRig, 0, 0.9, 0, 0.035, 1.8, 0.035);                                   // flag pole
    if (s.num) {   // boat number on the stern flag, readable from both sides
      const ft = canvasTex(160, 100, (c, w, h) => {
        c.fillStyle = '#' + s.shirts[0].toString(16).padStart(6, '0'); c.fillRect(0, 0, w, h);
        c.strokeStyle = '#f6c21c'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
        c.font = 'bold ' + (s.num.length > 2 ? 52 : 70) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = 8; c.strokeStyle = 'rgba(0,0,0,.55)'; c.strokeText(s.num, w / 2, h / 2 + 4); c.fillStyle = '#fff'; c.fillText(s.num, w / 2, h / 2 + 4);
      });
      for (const side of [0, 1]) {
        const fg = new THREE.PlaneGeometry(1.2, 0.75, 10, 1); anim.flags.push({ g: fg, w: 1.2, flip: side });
        const fl = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ map: ft }));
        fl.position.set(-0.6, 1.55, side ? -0.01 : 0.01); if (side) fl.rotation.y = PI; flagRig.add(fl);
      }
    } else {
      const fgeo = new THREE.PlaneGeometry(0.95, 0.55, 10, 1); anim.flags.push({ g: fgeo, w: 0.95, flip: 0 });
      const flag = new THREE.Mesh(fgeo, new THREE.MeshLambertMaterial({ color: s.shirts[0], side: THREE.DoubleSide }));
      flag.position.set(-0.5, 1.55, 0); flagRig.add(flag);
    }
    const t = mesh(GEO.cone, GOLD, body, -HL - 0.05, 1.72, 0, 0.17, 0.7, 0.17); t.rotation.z = 0.5;
    mesh(GEO.sph, GOLD, body, -HL, 1.47, 0, 0.14, 0.14, 0.14);
    for (const ex of [-HL - 0.12, HL + 0.12]) [[0xd0202a, -0.17, 0.75], [0x111111, 0, 0.85], [0xf0861c, 0.17, 0.7]].forEach(([c, z, l]) => {
      const tm = M(c);
      const tg = new THREE.Group(); tg.position.set(ex, ex < 0 ? 1.42 : 0.97, z); body.add(tg);   // pivot at the top so the tassel can swing
      mesh(GEO.cyl, tm, tg, 0, -l / 2, 0, 0.06, l, 0.06);
      mesh(GEO.sph, tm, tg, 0, 0, 0, 0.09, 0.09, 0.09);
      anim.tassels.push({ g: tg, ph: z * 9 + ex * 0.3, k: ex < 0 ? 1.2 : 0.8 });
    });
  }
  const head = new THREE.Group(); body.add(head);

  // thwarts
  const wood = M(0xa9794a);
  const rowers = [], pairs = 14;
  const YEL = s.shirt != null ? s.shirt : 0xf7c71c, shirtMats = [M(YEL), M(YEL)], teamM = shirtMats[0];   // one crew colour: shirts, sleeves and headbands all use the boat's Shirt colour (yellow by default); the flag has its own colour
  const skins = [0xf1c27d, 0xd9a066, 0xc68642, 0x8d5524, 0xe0ac69].map(c => M(c));
  const hairM = M(0x1a1410), eyeM = M(0x120a06), bandG = new THREE.TorusGeometry(0.19, 0.03, 5, 14);
  const torsoGeo = new THREE.CylinderGeometry(0.25, 0.17, 0.74, 16, 3).scale(0.8, 1, 1.3), neckG = new THREE.CylinderGeometry(0.07, 0.08, 0.14, 8), headG = new THREE.SphereGeometry(0.21, 14, 10);
  const hairG = new THREE.SphereGeometry(0.22, 14, 8, 0, TAU, 0, PI * 0.55), shoulderG = new THREE.SphereGeometry(0.13, 10, 8);
  const armG = new THREE.CylinderGeometry(0.07, 0.06, 1, 6), shaftG = new THREE.CylinderGeometry(0.035, 0.035, 1, 6), bladeG = new THREE.BoxGeometry(0.05, 0.6, 0.3);
  const bladeM = M(s.oar != null ? s.oar : 0xf3f0e6), shaftM = M(s.pole != null ? s.pole : 0xe9c477);   // two oar colours: shaft (pole) and tip (blade); defaults: wooden shaft, pale blade
  const L_SHAFT = 1.7;
  for (let i = 0; i < pairs; i++) {
    const sx = 6.76 - i * 1.04;
    // keep every rower inside the hull: narrow the seat spacing where the hull narrows
    const hu = Math.abs(sx / HL), hw = 0.12 + 0.88 * Math.pow(1 - Math.pow(hu, 3.0), 0.7);
    const htop = sheerTop(sx / HL), hd = 0.3 + 1.05 * Math.pow(1 - Math.pow(hu, 2.2), 0.85);
    const sn = clamp((htop - 0.27) / hd, 0, 0.98), halfW = hw * Math.sqrt(1 - sn * sn);
    const seatZ = clamp(halfW - 0.36, 0.26, 0.52), hullP = { hw, htop, hd };
    box(body, 0.34, 0.07, seatZ * 2 + 0.3, sx - 0.05, 0.22, 0, wood);
    for (const sd of [-1, 1]) {
      const standing = i >= 3, by = standing ? 0.78 : 0.27;   // front 3 couples sit; the other 11 stand and row
      const R = new THREE.Group(); R.position.set(sx, by, sd * seatZ); body.add(R);
      if (standing) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, by + 0.11, 8), M(0x2b2b3a)); leg.position.set(0.02, 0.17 - (by + 0.11) / 2, 0); R.add(leg); }
      const shirt = shirtMats[i % 2];
      const t = new THREE.Mesh(torsoGeo, shirt); t.position.y = 0.5; R.add(t);
      const hip = new THREE.Mesh(shoulderG, shirt); hip.position.set(0.02, 0.17, 0); hip.scale.set(1.3, 0.9, 2.0); R.add(hip);   // seated hips
      const nk = new THREE.Mesh(neckG, skins[0]); nk.position.set(0.01, 0.9, 0); R.add(nk);
      const skinM = pick(skins);
      const hd = new THREE.Mesh(headG, skinM); hd.position.set(0.03, 1.04, 0); hd.scale.set(0.95, 1.02, 0.95); R.add(hd);   // oval head
      const jaw = new THREE.Mesh(headG, skinM); jaw.position.set(0.06, 0.95, 0); jaw.scale.set(0.62, 0.55, 0.6); R.add(jaw);  // chin
      const nose = new THREE.Mesh(shoulderG, skinM); nose.position.set(0.22, 1.02, 0); nose.scale.set(0.5, 0.7, 0.45); R.add(nose);
      for (const z of [-1, 1]) {
        const ear = new THREE.Mesh(shoulderG, skinM); ear.position.set(0.0, 1.03, z * 0.2); ear.scale.set(0.35, 0.6, 0.3); R.add(ear);
        const eye = new THREE.Mesh(shoulderG, eyeM); eye.position.set(0.19, 1.07, z * 0.08); eye.scale.set(0.2, 0.22, 0.2); R.add(eye);
      }
      const hr = new THREE.Mesh(hairG, hairM); hr.position.set(-0.02, 1.07, 0); hr.scale.set(1.0, 1.0, 1.0); R.add(hr);
      const band = new THREE.Mesh(bandG, teamM); band.position.set(0.02, 1.12, 0); band.scale.set(1.05, 1.05, 1.05); band.rotation.x = PI / 2; R.add(band);   // team headband
      const armGeo = makeArmGeo(YEL, skinM.color.getHex());
      const armA = new THREE.Mesh(armGeo, ARM_MAT), armB = new THREE.Mesh(armGeo, ARM_MAT);
      const shaft = new THREE.Mesh(shaftG, shaftM); shaft.scale.y = L_SHAFT;
      const blade = new THREE.Mesh(bladeG, bladeM); blade.position.y = -0.5;
      // blade is placed in the un-scaled shaft space → compensate for shaft scale
      blade.position.y = -0.5 + 0.2 / L_SHAFT; blade.scale.set(1, 1 / L_SHAFT, 1); shaft.add(blade);
      body.add(armA, armB, shaft);
      rowers.push({ by, hullP, R, side: sd, sx, sz: sd * seatZ, armA, armB, shaft, off: (rnd() - 0.5) * 0.9, i });
    }
  }
  // golden apsara dancer on the prow (jointed + IK, stands on one leg)
  const apsara = makeApsara(sty);
  const cap = apsara.root; box(body, 0.6, 0.07, 0.5, 8.5, 0.585, 0, wood);   // small wooden platform near the front of the boat
  cap.position.set(8.5, 0.62, 0); cap.scale.setScalar(0.85); body.add(cap);
  const capT = null, capArms = [];

  // steersman at the stern with a long steering oar (jointed arms, sweeps side to side)
  const SX = -8.5, SY = 1.0;   // stands on a wooden floor inside the stern, feet on the wood, hull around his legs
  const steer = new THREE.Group(); steer.position.set(SX, SY, 0); body.add(steer);
  box(body, 0.7, 0.06, 0.74, SX, SY - 0.03, 0, wood);   // wooden floor he stands on
  for (const z of [-1, 1]) mesh(GEO.sph, M(0x1a1a1a), steer, 0.06, 0.03, z * 0.1, 0.14, 0.04, 0.075);   // feet
  const stMat = shirtMats[0];   // the steersman wears the same crew shirt colour as the rowers
  const stTr = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.8, 12).scale(0.9, 1, 1.15), M(0x2b2b45)); stTr.position.set(0, 0.42, 0); steer.add(stTr);   // sarong / trousers
  const stTor = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.7, 14, 3).scale(0.85, 1, 1.18), stMat); stTor.position.set(0, 1.03, 0); steer.add(stTor);   // rounded torso
  mesh(GEO.cyl, skins[2], steer, 0.01, 1.4, 0, 0.055, 0.16, 0.055);                       // neck
  mesh(GEO.sph, skins[2], steer, 0.03, 1.57, 0, 0.18, 0.215, 0.165);                      // oval head
  mesh(GEO.sph, skins[2], steer, 0.07, 1.47, 0, 0.11, 0.1, 0.11);                       // jaw / chin
  for (const z of [-1, 1]) mesh(GEO.sph, skins[2], steer, 0.0, 1.55, z * 0.16, 0.025, 0.06, 0.03);   // ears
  const stHair = new THREE.Mesh(hairG, hairM); stHair.position.set(-0.04, 1.66, 0); stHair.scale.set(1.1, 0.95, 1.08); steer.add(stHair);   // crown of hair, kept above the eyes
  mesh(GEO.sph, hairM, steer, -0.09, 1.57, 0, 0.14, 0.2, 0.17);                                                                      // hair behind the ears down to the nape
  const stBun = mesh(GEO.sph, hairM, steer, -0.2, 1.7, 0, 0.1, 0.1, 0.1);                                                          // top-knot at the back
  const stBand = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.025, 6, 18), GOLD); stBand.position.set(0, 1.64, 0); stBand.rotation.x = PI / 2; steer.add(stBand);   // headband at the hairline
  for (const z of [-1, 1]) mesh(GEO.sph, M(0x111111), steer, 0.2, 1.57, z * 0.075, 0.03, 0.03, 0.03);   // eyes look toward the bow
  mesh(GEO.sph, skins[2], steer, 0.22, 1.5, 0, 0.04, 0.04, 0.04);                                         // nose
  const oarShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 6), M(s.pole != null ? s.pole : 0xe9c477)); body.add(oarShaft);
  const oarBlade = mesh(GEO.box, M(s.oar != null ? s.oar : 0xf3f0e6), body, 0, 0, 0, 0.05, 0.6, 0.3);   // same blade colour and size as the crew paddles
  const stUpG = new THREE.CylinderGeometry(0.092, 0.074, 1, 20, 2), stForeG = new THREE.CylinderGeometry(0.06, 0.04, 1, 20, 2);
  const stJoint = new THREE.SphereGeometry(1, 18, 12);
  const stArms = [0, 1].map(() => [new THREE.Mesh(stUpG, stMat), new THREE.Mesh(stForeG, skins[2])]);   // sleeve + bare forearm
  stArms.forEach(p => p.forEach(m => body.add(m)));
  const stShoulders = [0, 1].map(() => { const m = new THREE.Mesh(stJoint, stMat); m.scale.set(0.1, 0.1, 0.1); body.add(m); return m; });   // deltoid, same radius as the sleeve so the arm joins the torso smoothly
  const stElbows = [0, 1].map(() => { const m = new THREE.Mesh(stJoint, skins[2]); m.scale.set(0.064, 0.064, 0.064); body.add(m); return m; });
  const stPalms = [0, 1].map(() => { const g = new THREE.Group(); body.add(g);
    const palm = new THREE.Mesh(stJoint, skins[2]); palm.scale.set(0.05, 0.075, 0.062); palm.position.y = 0.045; g.add(palm);          // palm / gripping fist
    const fing = new THREE.Mesh(stJoint, skins[2]); fing.scale.set(0.058, 0.04, 0.07); fing.position.set(0.0, 0.1, 0.0); g.add(fing);   // curled fingers
    const thumb = new THREE.Mesh(stJoint, skins[2]); thumb.scale.set(0.022, 0.045, 0.022); thumb.position.set(0.04, 0.06, 0.03); thumb.rotation.z = -0.5; g.add(thumb);
    return g; });
  const _hd = new THREE.Vector3();
  const stHandAt = (g, el, wr) => { _hd.subVectors(wr, el).normalize(); g.position.copy(wr).addScaledVector(_hd, -0.05); g.quaternion.setFromUnitVectors(UPV, _hd); };
  const sV = [0, 1, 2, 3, 4].map(() => new THREE.Vector3()), sdir = new THREE.Vector3();
  const steerUpdate = (t) => {
    const sweep = Math.sin(t);
    // oar is held outboard of the hull so it never passes through the gunwale
    sdir.set(-0.45 + 0.15 * sweep, -0.8, 0.5).normalize();   // same slope and outboard lean as the crew paddles
    const G = sV[0].set(SX + 0.2, SY + 0.85, 0.5);
    const tip = sV[1].copy(G).addScaledVector(sdir, 2.4), hnd = sV[2].copy(G).addScaledVector(sdir, -0.6);
    aimV(oarShaft, hnd, tip);
    oarBlade.position.copy(tip).addScaledVector(sdir, -0.2); oarBlade.quaternion.setFromUnitVectors(UPV, sdir);
    steer.rotation.y = 0.05 * sweep;
    const shR = new THREE.Vector3(SX, SY + 1.3, 0.25), shL = new THREE.Vector3(SX, SY + 1.3, -0.25), el = new THREE.Vector3(), wr = new THREE.Vector3();
    ik2(shR, G, 0.4, 0.4, new THREE.Vector3(-0.3, -1, 0.5), el, wr);           // right hand grips the steering oar at chest height; elbow bent naturally, hanging down and slightly out
    aimV(stArms[0][0], shR, el); aimV(stArms[0][1], el, wr); stShoulders[0].position.copy(shR); stElbows[0].position.copy(el); stHandAt(stPalms[0], el, wr);
    ik2(shL, sV[3].copy(G).addScaledVector(sdir, -0.4), 0.4, 0.4, new THREE.Vector3(-0.3, -0.6, -1), el, wr);   // left hand grips the oar higher up the shaft (two-handed hold)
    aimV(stArms[1][0], shL, el); aimV(stArms[1][1], el, wr); stShoulders[1].position.copy(shL); stElbows[1].position.copy(el); stHandAt(stPalms[1], el, wr);
  };
  steerUpdate(0);
  const steerArms = [];

  // wake
  const wake = new THREE.Mesh(new THREE.PlaneGeometry(30, 12).rotateX(-PI / 2),
    new THREE.MeshBasicMaterial({ map: wakeTex, transparent: true, opacity: 0, depthWrite: false, fog: true }));
  scene.add(wake);
  scene.add(root);
  return { root, body, rowers, head, cap, capT, capArms, apsara, steer, steerArms, steerUpdate, wake, scheme: s };
}

/* ------------------------------------------------------------------ */
/*  Rower / limb posing                                               */
/* ------------------------------------------------------------------ */
const _v = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0), DOWNV = new THREE.Vector3(0, -1, 0), _dir = new THREE.Vector3();
function aim(m, ax, ay, az, bx, by, bz) {
  _v.set(bx - ax, by - ay, bz - az);
  const len = _v.length() || 0.001;
  m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  m.scale.set(1, len, 1);
  m.quaternion.setFromUnitVectors(UPV, _v.multiplyScalar(1 / len));
}
const L_SHAFT = 1.7;
function poseRower(r, u, mode, T) {
  // The blade tip is driven along a path (in the water on the drive, lifted and swung forward on the
  // recovery); the shaft then runs from that tip up through the hands, so the paddle pivots in the water
  // instead of swinging about the grip like a pendulum.
  let tx, ty, out, lift = 0;
  if (mode === 1) {
    if (u < 0.5) { const k = u / 0.5; tx = lerp(0.95, -0.75, smooth(k)); ty = -0.12; out = 0.6; }
    else { const k = (u - 0.5) / 0.5, a = Math.sin(PI * k); tx = lerp(-0.75, 0.95, smooth(k)); ty = -0.12 + 0.85 * a; out = 0.6 + 0.45 * a; lift = a; }
  } else { tx = 0.5; ty = 0.5 + 0.04 * Math.sin(T * 2 + r.sx); out = 1.0; }
  const q = clamp((tx + 0.75) / 1.7, 0, 1);
  const lean = -0.28 + 0.46 * (1 - q);
  r.R.rotation.z = lean;
  const s = r.side, cl = Math.cos(lean), sl = Math.sin(lean);
  const shY = r.by + 0.84 * cl, shX = r.sx - 0.84 * sl;
  const inner = r.sz - s * 0.28, outer = r.sz + s * 0.28;
  const ex = 0;   // couples 11-14 row at a different rate: their oars work in a wider lane so they never touch couple 10's oars
  const gx = shX + 0.34, gy = shY + 0.16 + 0.1 * lift, gz = r.sz + s * (0.65 + ex);
  // keep the blade well outside the hull wall at its depth
  const hp = r.hullP, hsn = clamp((hp.htop - ty) / hp.hd, 0, 1), wallW = hp.hw * Math.sqrt(1 - hsn * hsn);
  out = Math.max(out + 0.7, wallW + 1.45 - Math.abs(r.sz));
  out += ex;
  let px = r.sx + tx, py = ty, pz = r.sz + s * out;
  // keep the tip within reach of the hands
  _dir.set(px - gx, py - gy, pz - gz);
  const dl = _dir.length();
  if (dl > L_SHAFT * 0.97) { _dir.multiplyScalar(L_SHAFT * 0.97 / dl); px = gx + _dir.x; py = gy + _dir.y; pz = gz + _dir.z; }
  _dir.set(px - gx, py - gy, pz - gz).normalize();
  r.shaft.position.set(px - _dir.x * L_SHAFT / 2, py - _dir.y * L_SHAFT / 2, pz - _dir.z * L_SHAFT / 2);
  r.shaft.quaternion.setFromUnitVectors(DOWNV, _dir);
  aim(r.armA, shX, shY, inner, gx, gy, gz);
  aim(r.armB, shX, shY, outer, gx + _dir.x * 0.55, gy + _dir.y * 0.55, gz + _dir.z * 0.55);
  return { tipY: py, tipX: px, tipZ: pz };
}

/* ------------------------------------------------------------------ */
/*  Particles                                                         */
/* ------------------------------------------------------------------ */
const PN = 2400;
const P = {
  pos: new Float32Array(PN * 3), col: new Float32Array(PN * 3), size: new Float32Array(PN), alpha: new Float32Array(PN),
  vel: new Float32Array(PN * 3), life: new Float32Array(PN), max: new Float32Array(PN), grav: new Float32Array(PN), i: 0
};
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(P.pos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(P.col, 3));
pGeo.setAttribute('size', new THREE.BufferAttribute(P.size, 1));
pGeo.setAttribute('alpha', new THREE.BufferAttribute(P.alpha, 1));
const pMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uPx: { value: 600 } },
  vertexShader: 'attribute vec3 color; attribute float size; attribute float alpha; varying vec3 vC; varying float vA; uniform float uPx; void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*uPx/-mv.z; gl_Position=projectionMatrix*mv; }',
  fragmentShader: 'varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor=vec4(vC, vA*smoothstep(0.5,0.15,d)); }'
});
const points = new THREE.Points(pGeo, pMat); points.frustumCulled = false; points.renderOrder = 5; scene.add(points);
for (let i = 0; i < PN; i++) { P.pos[i * 3 + 1] = -999; }
function emit(x, y, z, vx, vy, vz, life, size, r, g, b, grav) {
  const i = P.i; P.i = (i + 1) % PN;
  P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
  P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
  P.life[i] = P.max[i] = life; P.size[i] = size; P.col[i * 3] = r; P.col[i * 3 + 1] = g; P.col[i * 3 + 2] = b; P.alpha[i] = 0.9; P.grav[i] = grav === undefined ? 9 : grav;
}
function updateParticles(dt) {
  for (let i = 0; i < PN; i++) {
    if (P.life[i] <= 0) { P.pos[i * 3 + 1] = -999; P.alpha[i] = 0; continue; }
    P.life[i] -= dt;
    const k = i * 3;
    P.vel[k + 1] -= P.grav[i] * dt;
    P.pos[k] += P.vel[k] * dt; P.pos[k + 1] += P.vel[k + 1] * dt; P.pos[k + 2] += P.vel[k + 2] * dt;
    if (P.grav[i] > 0 && P.pos[k + 1] < 0.05 && P.vel[k + 1] < 0) { P.life[i] = 0; }
    P.alpha[i] = clamp(P.life[i] / P.max[i], 0, 1) * 0.85;
  }
  pGeo.attributes.position.needsUpdate = pGeo.attributes.color.needsUpdate = pGeo.attributes.size.needsUpdate = pGeo.attributes.alpha.needsUpdate = true;
}

/* ------------------------------------------------------------------ */
/*  Audio (fully procedural)                                          */
/* ------------------------------------------------------------------ */
const SFX = {
  ctx: null, master: null, noise: null, on: true, crowd: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = this.on ? 0.85 : 0; this.master.connect(c.destination);
      const len = c.sampleRate; const b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = b;
      // crowd murmur
      const src = c.createBufferSource(); src.buffer = b; src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.45;
      const g = this.crowd = c.createGain(); g.gain.value = 0.035;
      src.connect(bp); bp.connect(g); g.connect(this.master); src.start();
    } catch (e) { this.ctx = null; }
  },
  setOn(v) { this.on = v; if (this.master) this.master.gain.value = v ? 0.85 : 0; },
  ok() { return this.ctx && this.on; },
  tone(type, f0, f1, t, dur, gain, dest) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  burst(t, dur, freq, q, gain, type) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  },
  drum(t, strong) { if (!this.ok()) return; this.tone('sine', strong ? 150 : 125, strong ? 52 : 48, t, strong ? 0.34 : 0.26, strong ? 0.9 : 0.62); this.burst(t, 0.04, 1800, 1.2, strong ? 0.25 : 0.16); },
  tok(t, perfect) { if (!this.ok()) return; this.tone('triangle', perfect ? 980 : 760, perfect ? 520 : 400, t, 0.1, 0.32); this.burst(t, 0.16, 900, 0.7, 0.3); if (perfect) this.tone('sine', 1560, 1560, t, 0.14, 0.09); },
  miss(t) { if (!this.ok()) return; this.tone('sawtooth', 120, 60, t, 0.22, 0.22); this.burst(t, 0.12, 300, 0.5, 0.2, 'lowpass'); },
  chhing(t, g) { if (!this.ok()) return; this.burst(t, 0.09, 7500, 4, g || 0.1, 'highpass'); this.tone('square', 5200, 5100, t, 0.05, 0.015); },
  roneat(t, f, g) { if (!this.ok()) return; this.tone('triangle', f, f, t, 0.32, g); this.tone('sine', f * 2.005, f * 2.005, t, 0.2, g * 0.35); },
  boom(t) { if (!this.ok()) return; this.tone('sine', 90, 40, t, 0.6, 0.8); this.burst(t, 0.5, 400, 0.6, 0.25, 'lowpass'); },
  cheer(dur) {
    if (!this.ok() || !this.crowd) return; const t = this.ctx.currentTime, g = this.crowd.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.16, t + 0.3); g.linearRampToValueAtTime(0.035, t + dur);
  },
  fanfare() { if (!this.ok()) return; const t = this.ctx.currentTime; [0, 4, 7, 12].forEach((s, i) => this.roneat(t + i * 0.13, 392 * Math.pow(2, s / 12), 0.22)); this.cheer(2.5); }
};
const SCALE_ST = [0, 2, 4, 7, 9];
const MELODY = [0, 2, 4, 2, 3, 1, 2, 0, 4, 5, 7, 5, 4, 2, 3, 1, 2, 4, 5, 4, 7, 5, 4, 2, 3, 2, 1, 0, 2, 3, 4, 2];
function scaleFreq(idx) { const o = Math.floor(idx / 5), n = SCALE_ST[((idx % 5) + 5) % 5]; return 261.63 * Math.pow(2, (n + o * 12) / 12); }

/* ------------------------------------------------------------------ */
/*  Game state                                                        */
/* ------------------------------------------------------------------ */
const G = {
  state: 'menu', mode: 1, diffKey: 'normal', D: DIFFS.normal, I: 0.6,
  T: 0, paused: false, boats: [], humans: [], notes: [], audStep: -6, cdShown: -9, clock: 0,
  finishWait: 0, demo: /[?&]demo/.test(location.search), resultsAt: 0, lastHud: 0, lastRank: 0
};
const boats = [];
for (let i = 0; i < 2; i++) {
  const m = makeBoat(i);
  const b = Object.assign(m, { id: i, z: LANES[i], x: 0, v: 0, sync: 0.4, combo: 0, maxCombo: 0, score: 0, boostT: 0, finished: false, finishT: 0,
    human: false, auto: false, player: -1, ptr: 0, aiPtr: 0, ns: null, skill: 0.8, stats: { p: 0, g: 0, m: 0 }, lastHit: -9, name: SCHEMES[i], rank: 0, strokeT: 0, wakeLast: 0 });
  boats.push(b);
}
G.boats = boats;

function genNotes(D) {
  const r = mulberry32(777 + Math.floor(D.bpm)), I = 60 / D.bpm, notes = [];
  for (let b = 0; b < 80; b++) {
    let pat = [0, 1, 2, 3];
    if (D.half && b >= 2) pat = pick2(r, [[0, 1, 2, 3], [0, 1, 2, 2.5, 3], [0, 0.5, 1, 2, 3], [0, 1, 1.5, 2, 3, 3.5], [0, 1, 2, 3, 3.5], [0, 0.5, 1, 1.5, 2, 3]]);
    else if (D.key === 'normal' && b >= 4 && b % 4 === 3) pat = [0, 1, 2, 2.5, 3];
    for (const o of pat) notes.push({ t: (2 + b * 4 + o) * I, strong: o === 0, half: o % 1 !== 0 });
  }
  return notes;
}
function pick2(r, a) { return a[Math.floor(r() * a.length)]; }

/* ------------------------------------------------------------------ */
/*  HUD / DOM                                                         */
/* ------------------------------------------------------------------ */
const PW = 600, PH = 86;
const panels = [];
function buildPanels() {
  const host = $('panels'); host.innerHTML = ''; panels.length = 0;
  G.humans.forEach((b, idx) => {
    const el = document.createElement('div'); el.className = 'panel';
    const keyHint = G.mode === 2 ? (idx === 0 ? 'A S D F' : 'J K L ;') : 'SPACE · A S D F · J K L · TAP';
    el.innerHTML = '<div class="phead"><span class="pn" style="color:' + b.scheme.css + '">' + (G.mode === 2 ? 'អ្នកលេង ' + toKh(idx + 1) + ' · P' + (idx + 1) : b.scheme.kh + ' · ' + b.scheme.en) + '</span><span class="pk">' + keyHint + '</span></div>' +
      '<canvas width="' + PW * 2 + '" height="' + PH * 2 + '"></canvas>' +
      '<div class="meters"><span>ចង្វាក់ក្រុម Sync</span><div class="sync"><i></i></div><span class="spd"></span><span class="cmb"></span></div>' +
      '<div class="popwrap"></div>';
    host.appendChild(el);
    const cv = el.querySelector('canvas'), ctx = cv.getContext('2d'); ctx.scale(2, 2);
    const p = { boat: b, el, cv, ctx, fx: [], sync: el.querySelector('.sync i'), spd: el.querySelector('.spd'), cmb: el.querySelector('.cmb'), pop: el.querySelector('.popwrap'), viewPtr: 0, label: G.mode === 2 ? (idx === 0 ? 'A' : 'L') : 'TAP' };
    const hit = (e) => { e.preventDefault(); SFX.init(); humanHit(b); };
    el.addEventListener('pointerdown', hit);
    panels.push(p); b.panel = p;
  });
}

function popup(b, code) {
  const p = b.panel; if (!p) return;
  const d = document.createElement('div');
  const info = code === 2 ? ['p', 'ល្អឥតខ្ចោះ', 'PERFECT'] : code === 1 ? ['g', 'ល្អ', 'GOOD'] : ['m', 'ខកខាន', 'MISS'];
  d.className = 'pop ' + info[0]; d.innerHTML = info[1] + '<small>' + info[2] + '</small>';
  p.pop.appendChild(d); setTimeout(() => d.remove(), 720);
}
function showBanner(kh, en) { const b = $('banner'); b.innerHTML = kh + '<small>' + en + '</small>'; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
function showCount(txt, sub) { const c = $('countdown'); c.innerHTML = txt + (sub ? '<small>' + sub + '</small>' : ''); c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }

function drawTrack(p, T) {
  const c = p.ctx, W = PW, H = PH, hx = 74, pxs = (W - hx - 16) / LOOK, I = G.I, b = p.boat, ns = b.ns;
  c.clearRect(0, 0, W, H);
  const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#3a0a14'); g.addColorStop(1, '#14284f');
  c.fillStyle = g; c.beginPath(); c.roundRect ? c.roundRect(0, 0, W, H, 10) : c.rect(0, 0, W, H); c.fill();
  c.strokeStyle = 'rgba(255,207,63,.25)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke();
  // beat ticks
  const k0 = Math.ceil((T - 0.3) / I);
  for (let k = k0; ; k++) { const x = hx + (k * I - T) * pxs; if (x > W) break; c.strokeStyle = k % 4 === 0 ? 'rgba(255,207,63,.35)' : 'rgba(255,255,255,.1)'; c.beginPath(); c.moveTo(x, 8); c.lineTo(x, H - 8); c.stroke(); }
  // hit zone
  const nb = Math.abs(T / I - Math.round(T / I)) * I; // time to nearest beat
  const pulse = Math.max(0, 1 - nb / 0.14) * (T > -I * 3.2 ? 1 : 0);
  const rad = 27 + pulse * 5;
  c.fillStyle = 'rgba(255,207,63,' + (0.12 + pulse * 0.22) + ')'; c.beginPath(); c.arc(hx, H / 2, rad + 6, 0, TAU); c.fill();
  c.strokeStyle = '#ffcf3f'; c.lineWidth = 3.5; c.beginPath(); c.arc(hx, H / 2, rad, 0, TAU); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.5; c.beginPath(); c.arc(hx, H / 2, rad - 6, 0, TAU); c.stroke();
  // perfect window
  const pw = G.D.perfect * pxs, gw = G.D.good * pxs;
  c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(hx - gw, 6, gw * 2, H - 12);
  c.fillStyle = 'rgba(255,207,63,.10)'; c.fillRect(hx - pw, 6, pw * 2, H - 12);
  // notes
  while (p.viewPtr < G.notes.length && G.notes[p.viewPtr].t < T - 0.45) p.viewPtr++;
  for (let i = p.viewPtr; i < G.notes.length; i++) {
    const n = G.notes[i], x = hx + (n.t - T) * pxs; if (x > W + 30) break;
    const st = ns[i]; if (st === 1 || st === 2) continue;
    const r = n.half ? 11 : (n.strong ? 21 : 17), miss = st === 3, a = miss ? clamp(1 - (T - n.t) / 0.4, 0, 1) * 0.5 : 1;
    c.globalAlpha = a;
    const gg = c.createRadialGradient(x - r * 0.3, H / 2 - r * 0.3, 1, x, H / 2, r);
    if (miss) { gg.addColorStop(0, '#999'); gg.addColorStop(1, '#444'); }
    else if (n.half) { gg.addColorStop(0, '#ffffff'); gg.addColorStop(1, '#8fd2ff'); }
    else if (n.strong) { gg.addColorStop(0, '#fff3a0'); gg.addColorStop(1, '#ff9e1b'); }
    else { gg.addColorStop(0, '#ff7a6a'); gg.addColorStop(1, '#c8102e'); }
    c.fillStyle = gg; c.beginPath(); c.arc(x, H / 2, r, 0, TAU); c.fill();
    c.strokeStyle = miss ? '#666' : '#fff'; c.lineWidth = 2; c.stroke();
    if (!n.half) { c.strokeStyle = miss ? '#555' : 'rgba(255,255,255,.7)'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, H / 2, r * 0.55, 0, TAU); c.stroke(); }
    c.globalAlpha = 1;
  }
  // fx rings
  p.fx = p.fx.filter(f => T - f.t < 0.4 && T >= f.t - 1);
  p.fx.forEach(f => { const k = (T - f.t) / 0.4; c.strokeStyle = f.col; c.globalAlpha = 1 - k; c.lineWidth = 4 - k * 3; c.beginPath(); c.arc(hx, H / 2, 26 + k * 30, 0, TAU); c.stroke(); c.globalAlpha = 1; });
  c.fillStyle = '#fff6dc'; c.font = '700 ' + (p.label.length > 1 ? 14 : 20) + 'px ' + FONT_B; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(p.label, hx, H / 2 + 1);
}

function rankOrder() {
  return boats.slice().sort((a, b) => {
    if (a.finished && b.finished) return a.finishT - b.finishT;
    if (a.finished) return -1; if (b.finished) return 1;
    return (b.x) - (a.x);
  });
}
function updateHud() {
  const T = G.T, order = rankOrder();
  order.forEach((b, i) => b.rank = i + 1);
  // ranks list
  $('ranks').innerHTML = order.map((b, i) =>
    '<div class="row' + (b.human ? ' me' : '') + '"><span class="n">' + toKh(i + 1) + '</span><span class="c" style="background:' + b.scheme.css + '"></span><span>' + (b.human ? (G.mode === 2 ? 'P' + (b.player + 1) : 'អ្នក · You') : b.scheme.kh) + '</span></div>').join('');
  // progress dots
  const tr = $('track'); tr.querySelectorAll('.dot').forEach(d => d.remove());
  boats.forEach(b => {
    const pr = clamp((b.x + BOW - START_NOSE) / (RACE_LEN - START_NOSE), 0, 1);
    const d = document.createElement('div'); d.className = 'dot' + (b.human ? ' me' : ''); d.style.left = (1 - pr) * 100 + '%'; d.style.background = b.scheme.css; d.textContent = b.human ? (G.mode === 2 ? b.player + 1 : '') : '';
    tr.appendChild(d);
  });
  const lead = G.humans.reduce((m, b) => Math.max(m, b.x + BOW), -1e9);
  $('distLeft').textContent = 'នៅសល់ ' + toKh(Math.max(0, Math.round(RACE_LEN - lead))) + ' ម៉ែត្រ · ' + Math.max(0, Math.round(RACE_LEN - lead)) + ' m to go';
  panels.forEach(p => {
    const b = p.boat;
    p.sync.style.width = (b.sync * 100).toFixed(0) + '%';
    p.spd.textContent = Math.min(40, Math.round(b.v * 1.63)) + ' km/h';
    p.cmb.textContent = b.combo > 1 ? '×' + b.combo : '';
    p.el.classList.toggle('boost', b.boostT > 0);
  });
}

/* ------------------------------------------------------------------ */
/*  Rhythm resolution                                                 */
/* ------------------------------------------------------------------ */
function applyResult(b, code, i) {
  b.ns[i] = code;
  const T = G.T;
  if (code === 2) { b.sync += 0.07; b.combo++; b.stats.p++; b.score += 300 + b.combo * 10; b.v += 0.5; }
  else if (code === 1) { b.sync += 0.036; b.combo++; b.stats.g++; b.score += 100 + b.combo * 5; }
  else { b.sync -= 0.12; b.combo = 0; b.stats.m++; }
  b.sync = clamp(b.sync, 0, 1);
  b.maxCombo = Math.max(b.maxCombo, b.combo);
  if (code > 0 && code < 3) b.lastHit = T;
  if (code === 2 || code === 1) {
    if (b.combo > 0 && b.combo % 10 === 0) {
      b.boostT = 2.6;
      if (b.human) { showBanner('កម្លាំងនាគ!', 'NAGA POWER ×' + b.combo); SFX.cheer(1.6); if (SFX.ok()) SFX.tone('sine', 400, 1200, SFX.ctx.currentTime, 0.35, 0.18); }
    }
    splash(b, code === 2 ? 14 : 8);
  }
  if (b.human) {
    popup(b, code);
    if (b.panel) b.panel.fx.push({ t: T, col: code === 2 ? '#ffe14a' : code === 1 ? '#7dffb0' : '#ff6b6b' });
    if (SFX.ok()) { const t = SFX.ctx.currentTime; code === 3 ? SFX.miss(t) : SFX.tok(t, code === 2); }
  }
}

function humanHit(b) {
  if (G.paused || (G.state !== 'race' && G.state !== 'finishing') || b.finished || b.auto) return;
  const T = G.T, D = G.D, notes = G.notes;
  let best = -1, bd = 1e9;
  for (let i = b.ptr; i < notes.length; i++) {
    const n = notes[i]; if (n.t > T + D.good) break;
    if (b.ns[i] !== 0) continue;
    const d = Math.abs(n.t - T); if (d < bd) { bd = d; best = i; }
  }
  if (best >= 0 && bd <= D.good) applyResult(b, bd <= D.perfect ? 2 : 1, best);
  else { // stray tap
    b.sync = clamp(b.sync - 0.07, 0, 1); b.combo = 0; b.stats.m++;
    popup(b, 3); if (SFX.ok()) SFX.miss(SFX.ctx.currentTime);
  }
}

function aiResolve(b, T) {
  const notes = G.notes, D = G.D;
  while (b.aiPtr < notes.length && notes[b.aiPtr].t <= T) {
    const i = b.aiPtr++, r = Math.random();
    if (b.ns[i] !== 0) continue;
    const code = r > b.skill ? 3 : (Math.random() < D.aiPerf + (b.skill - 0.8) * 0.6 ? 2 : 1);
    applyResult(b, code, i);
  }
}

function splash(b, n) {
  const x0 = b.x;
  for (let i = 0; i < n; i++) {
    const sd = i % 2 ? 1 : -1, x = x0 + rr(-5.5, 5.0);
    emit(x, 0.15, b.z + sd * 1.15, rr(-1.5, 0.5), rr(2, 4.5), sd * rr(0.8, 2.2), rr(0.45, 0.8), rr(0.28, 0.5), 0.9, 0.97, 1.0, 11);
  }
}

/* ------------------------------------------------------------------ */
/*  Race flow                                                         */
/* ------------------------------------------------------------------ */
function setupRace() {
  applyModels();
  const D = G.D = DIFFS[G.diffKey]; G.I = 60 / D.bpm;
  G.notes = genNotes(D);
  G.T = -3 * G.I; G.audStep = -6; G.cdShown = -9; G.finishWait = 0; G.paused = false;
  G.humans = [];
  const aiSkills = D.ai.slice();
  if (D.key === 'hard') aiSkills.reverse();   // 1v1 has a single AI: on Hard it gets the strongest skill, not the weakest
  let ai = 0;
  boats.forEach((b, i) => {
    const human = G.mode === 3 ? i === NET.myIdx : (i === 0 || (G.mode === 2 && i === 1));
    Object.assign(b, { x: START_NOSE - BOW, z: G.mode === 3 && i !== NET.myIdx ? LANES[1] : G.mode === 3 ? LANES[0] : LANES[i], v: 0, sync: 0.4, combo: 0, maxCombo: 0, score: 0, boostT: 0, finished: false, finishT: 0, human, auto: false, remote: G.mode === 3 && !human,
      player: human ? i : -1, ptr: 0, aiPtr: 0, ns: new Uint8Array(G.notes.length), stats: { p: 0, g: 0, m: 0 }, lastHit: -9, rank: 0, strokeT: 0, bandsDone: 0 });
    if (human) { G.humans.push(b); if (G.demo) { b.auto = true; b.skill = 0.9; } }
    else { b.skill = aiSkills[ai++ % aiSkills.length]; }
  });
  buildPanels();
  const tr = $('track'); tr.querySelectorAll('.tick').forEach(t => t.remove());
  BANDS.forEach((bd, i) => { const t = document.createElement('div'); t.className = 'tick'; t.style.left = ((1 - (bd - START_NOSE) / (RACE_LEN - START_NOSE)) * 100) + '%'; t.innerHTML = '<i></i><span>' + (i + 1) + '</span>'; tr.appendChild(t); });
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('single', G.mode !== 2));
  NET.rx = null; NET.lastSend = 0;
  updateHud();
}

function startRace() {
  SFX.init();
  NET.waiting = false; clearTimeout(NET.waitTimer);
  NET.rmPending = NET.rmAsked = false; $('rematch').classList.add('hidden');
  setupRace();
  G.state = 'countdown';
  ['menu', 'lobby', 'garage', 'customBoat', 'results', 'help', 'pause'].forEach(id => $(id).classList.add('hidden'));
  $('hud').classList.remove('hidden');
  $('btnPause').style.display = G.mode === 3 ? 'none' : '';
  if (G.mode === 3) { SESS = { role: NET.role, code: NET.code, diff: G.diffKey }; saveSnap(true); }
  $('btnAgain').querySelector('i').textContent = 'Race again';
  camSnap = true; camOrbit = PI / 3;   // every race starts from the 60-degree rear-side view
}

function finishRace() {
  G.state = 'results'; G.resultsAt = G.clock; saveSess(null);
  const order = rankOrder();
  const tbl = $('resTable');
  const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2); };
  let h = '<tr><th></th><th>ក្រុម TEAM</th><th>ពេលវេលា TIME</th><th>ភាពត្រឹមត្រូវ HITS</th></tr>';
  order.forEach((b, i) => {
    const tot = b.stats.p + b.stats.g + b.stats.m;
    const who = b.human ? (G.mode === 2 ? 'អ្នកលេង ' + toKh(b.player + 1) + ' · P' + (b.player + 1) : 'អ្នក · You') : (G.mode === 3 ? 'គូប្រជែង · Opponent' : 'AI');
    h += '<tr class="' + (b.human ? 'me' : '') + '"><td class="rk">' + toKh(i + 1) + '</td><td><span class="cc" style="background:' + b.scheme.css + '"></span>' + b.scheme.kh + '<small>' + who + '</small></td><td>' + (b.finished ? fmt(b.finishT) : 'DNF') + '</td><td>' + ((b.human || b.remote) ? '<b>' + b.stats.p + '</b>P · ' + b.stats.g + 'G · ' + b.stats.m + 'M <small>max ×' + b.maxCombo + '</small>' : '—') + '</td></tr>';
  });
  tbl.innerHTML = h;
  const w = order[0];
  if (G.mode === 2) {
    const hs = G.humans.slice().sort((a, b) => (a.finished ? a.finishT : 9e9 - a.x) - (b.finished ? b.finishT : 9e9 - b.x));
    $('resTitle').textContent = 'អ្នកលេង ' + toKh(hs[0].player + 1) + ' ឈ្នះ!';
    $('resSub').innerHTML = 'Player ' + (hs[0].player + 1) + ' wins the water festival!<br><span>ទី ' + toKh(hs[0].rank) + ' · place ' + hs[0].rank + '</span>';
  } else if (G.mode === 3) {
    const rk = G.humans[0].rank;
    $('resTitle').textContent = rk === 1 ? 'ជ័យជម្នះ! 🏆' : 'ព្យាយាមទៀត!';
    $('resSub').innerHTML = (rk === 1 ? 'You beat your opponent!' : 'Your opponent crossed first — race again!') + '<br><span>ទី ' + toKh(rk) + ' · you placed ' + rk + ' of 2</span>';
  } else {
    const me = G.humans[0], rk = me.rank;
    $('resTitle').textContent = rk === 1 ? 'ជ័យជម្នះ! 🏆' : rk <= 3 ? 'ល្អណាស់!' : 'ព្យាយាមទៀត!';
    $('resSub').innerHTML = (rk === 1 ? 'You won the Royal Water Festival race!' : rk <= 3 ? 'A podium finish — well rowed!' : 'Keep the rhythm and try again!') + '<br><span>ទី ' + toKh(rk) + ' · you placed ' + rk + ' of 5</span>';
  }
  if (G.mode === 3) netSend({ t: 's', ...netState(G.humans[0]) });
  setTimeout(() => { if (G.state === 'results') { $('results').classList.remove('hidden'); $('hud').classList.add('hidden'); } }, 1600);
}

function toMenu(keepRoom) {
  NET.waiting = false; clearTimeout(NET.waitTimer);
  G.state = 'menu'; G.paused = false; if (!keepRoom) { netClose(); saveSess(null); } refreshMenu();
  ['results', 'help', 'pause'].forEach(id => $(id).classList.add('hidden'));
  $('hud').classList.add('hidden'); showScreen();
  boats.forEach((b, i) => { Object.assign(b, { x: START_NOSE - BOW - 14 - [0, 7, 3, 10, 5][i], z: LANES[i], v: 0, sync: 0.5, human: false, finished: false, boostT: 0, combo: 0 }); });
}

/* ------------------------------------------------------------------ */
/*  Update                                                            */
/* ------------------------------------------------------------------ */
const camPos = new THREE.Vector3(0, 8, 40), camLook = new THREE.Vector3();
let camSnap = true, shake = 0;

function scheduleAudio(T) {
  if (!SFX.ctx) return;
  const I = G.I, now = SFX.ctx.currentTime;
  while (G.audStep * I * 0.5 <= T + 0.14) {
    const st = G.audStep, stepT = st * I * 0.5, ahead = stepT - T;
    G.audStep++;
    if (ahead < -0.06) continue;
    const at = now + Math.max(0, ahead);
    if (st % 2 === 0) {
      const k = st / 2;
      if (k < 0) SFX.drum(at, true);
      else if (k === 0) { SFX.boom(at); SFX.chhing(at, 0.2); }
      else SFX.drum(at, k % 4 === 0);
      if (k >= 0 && k % 4 === 0) SFX.tone('sine', 98, 98, at, I * 1.8, 0.14);
    } else if (st > 0) SFX.chhing(at, 0.07);
    if (st >= 0 && G.state !== 'results') {
      const m = MELODY[(st >> 0) % MELODY.length] + (Math.floor(st / 32) % 2 ? 2 : 0);
      if (st % 2 === 0 || st % 4 === 3) SFX.roneat(at, scaleFreq(m + 5), 0.085);
    }
  }
}

function stepRace(dt) {
  if (G.paused) return;
  saveSnap();
  const prevT = G.T;
  G.T += dt;
  const T = G.T, I = G.I;
  scheduleAudio(T);
  // countdown visuals
  if (G.state === 'countdown') {
    const k = Math.floor(T / I + 1e-6);   // -3,-2,-1,0
    if (k !== G.cdShown) {
      G.cdShown = k;
      if (k === -3) showCount('៣', 'ត្រៀមខ្លួន · GET READY');
      else if (k === -2) showCount('២');
      else if (k === -1) showCount('១');
      else if (k >= 0) { showCount('ចេញ!', 'GO!'); G.state = 'race'; }
    }
  }
  const racing = G.state === 'race' || G.state === 'finishing';
  for (const b of boats) {
    if (racing || G.state === 'results') {
      if (b.remote) { netStep(b, dt); continue; }
      if (racing) {
        if (!b.human || b.auto) aiResolve(b, T);
        else {
          while (b.ptr < G.notes.length && (G.notes[b.ptr].t + G.D.good < T || b.ns[b.ptr] !== 0)) {
            if (b.ns[b.ptr] === 0) applyResult(b, 3, b.ptr);
            b.ptr++;
          }
        }
      }
      if (b.boostT > 0) b.boostT -= dt;
      const tv = VMIN + (VMAX - VMIN) * Math.pow(b.sync, 1.15) + (b.boostT > 0 ? 4.5 : 0);
      if (!b.finished) b.v += (tv - b.v) * Math.min(1, dt * 1.5);
      else b.v += (0 - b.v) * Math.min(1, dt * 0.45);
      b.x += b.v * dt;
      if (b.human && b.bandsDone < BANDS.length && b.x + BOW >= BANDS[b.bandsDone]) {
        b.bandsDone++; showBanner(b.bandsDone === 1 ? 'កងព័ន្ធទី១' : 'កងព័ន្ធទី២', 'BAND ' + b.bandsDone);
        if (SFX.ok()) SFX.tone('sine', 520, 880, SFX.ctx.currentTime, 0.3, 0.16);
      }
      if (!b.finished && b.x + BOW >= RACE_LEN) {
        beatFinishDrum(b);
        b.finished = true; b.finishT = T - (b.x + BOW - RACE_LEN) / Math.max(b.v, 1);
        if (b.human) { SFX.fanfare(); showBanner('ដល់ទីបញ្ចប់!', 'FINISH!'); }
        if (b.human || order1(b)) for (let i = 0; i < 90; i++) emit(RACE_LEN + rr(-6, 6), rr(3, 9), b.z + rr(-6, 6), rr(-6, 8), rr(2, 11), rr(-4, 4), rr(1.4, 2.6), rr(0.35, 0.7), rnd(), 0.5 + rnd() * 0.5, rnd(), 6);
      }
    }
  }
  if (racing) {
    // end of race conditions
    const allHumansDone = G.mode === 3 ? G.humans[0].finished : G.humans.every(b => b.finished);
    if (allHumansDone && G.state === 'race') { G.state = 'finishing'; G.finishWait = 0; }
    if (G.state === 'finishing') {
      G.finishWait += dt;
      if (G.finishWait > (G.mode === 3 ? 30 : 3.2) || boats.every(b => b.finished)) finishRace();
    } else if (G.humans.some(b => b.finished) && G.humans.length > 1) {
      G.finishWait += dt; if (G.finishWait > 10) { G.humans.forEach(b => { if (!b.finished) { b.finished = false; } }); G.state = 'finishing'; G.finishWait = 3; }
    }
    if (G.state === 'race' && T > 140) finishRace();
  }
}
function beatFinishDrum(b) {   // only the drummer on the same side as the arriving boat strikes
  const fg = gates.find(g => g.userData.drums); if (!fg) return;
  fg.userData.drums.forEach(d => { if (d.bz * b.z > 0) d.hit = 1; });
  if (SFX.ok()) { SFX.drum(SFX.ctx.currentTime, true); SFX.boom(SFX.ctx.currentTime); }
}
function order1(b) { return boats.every(o => o === b || !o.finished); }

function updateVisuals(dt, wall) {
  const T = G.T, I = G.I, tw = wall;
  const racing = G.state === 'race' || G.state === 'finishing' || G.state === 'results';
  for (const b of boats) {
    // waves → pose
    const h0 = waveH(b.x, b.z, tw), hf = waveH(b.x + HL * 0.8, b.z, tw), hb = waveH(b.x - HL * 0.8, b.z, tw), hl = waveH(b.x, b.z - 1, tw), hr = waveH(b.x, b.z + 1, tw);
    const pitch = Math.atan2(hf - hb, HL * 1.6) * 1.0, roll = -Math.atan2(hr - hl, 2) * 1.0;
    const sq = clamp(b.v / VMAX, 0, 1);
    b.root.position.set(b.x, h0 - 0.32, b.z);
    { const an = b.root.userData.anim, sp = 0.5 + 0.8 * clamp(b.v / VMAX, 0, 1);   // flutter harder the faster the boat goes
      if (an) {
        for (const f of an.flags) {   // wave travels from the pole (x = +w/2) to the free edge
          const pa = f.g.attributes.position;
          for (let i = 0; i < pa.count; i++) { const k = clamp((f.w / 2 - (f.flip ? -pa.getX(i) : pa.getX(i))) / f.w, 0, 1); pa.setZ(i, (f.flip ? -1 : 1) * 0.16 * sp * k * Math.sin(k * 7 - tw * 7)); }
          pa.needsUpdate = true;
        }
        for (const t of an.tassels) { t.g.rotation.z = t.k * 0.22 * sp * Math.sin(tw * 4.5 + t.ph) - 0.12 * sp; t.g.rotation.x = 0.18 * sp * Math.sin(tw * 3.3 + t.ph * 1.7); }
      } }
    b.root.rotation.set(roll * 0.8, 0, pitch + sq * 0.008);
    // strokes
    let mode = 0, u = 0;
    const active = (G.state === 'race' || G.state === 'finishing') && !b.finished || (G.state === 'results' && !b.finished);
    if (G.state === 'menu') { mode = 1; }
    else if (active) mode = 1;
    const chaos = 0;   // crew always paddles in unison, even when the player misses or stops tapping
    const base = G.state === 'menu' ? tw / 1.15 : T / I;
    for (const r of b.rowers) {
      u = frac(base + 0.25 + r.off * chaos + (G.state === 'menu' ? r.off * 0.15 : 0));
      if (r.i >= 10) {   // couples 11-14: pull and forward swing run at the same speed as couples 1-10 and start together, but the lift out of the water is slow (waiting for couples 1-10), so they row once per two strokes of the others
        const m0 = (base + 0.25 + (G.state === 'menu' ? r.off * 0.15 : 0)) % 2, m = m0 < 0 ? m0 + 2 : m0;
        { const t = (m - 0.5) / 1.5; u = m < 0.5 ? m : 0.5 + 0.5 * (0.3 * t + 0.7 * t * t * t); }   // pull at normal speed, then the oar keeps moving: slow lift that steadily speeds up into the forward swing, landing with couples 1-10
      }
      const o = poseRower(r, u, mode, tw);
      r.last = u;
      // paddle splash when the blade enters the water during drive
      if (mode === 1 && G.state !== 'menu' && b.v > 6 && u > 0.02 && u < 0.07 && rnd() < 0.35 && o.tipY < 0.2) {
        const gx = b.x + o.tipX, gz = b.z + o.tipZ;
        for (let k = 0; k < 2; k++) emit(gx + rr(-.1, .1), 0.1, gz, rr(-1.5, .5), rr(1.5, 3.2), r.side * rr(0.2, 1.2), rr(0.3, 0.6), rr(0.2, 0.4), 0.9, 0.97, 1, 10);
      }
    }
    // golden apsara dance (local coordinates of the dancer group)
    // slow, flowing dance (independent of the fast drum beat) with eased boost lift
    const boost = b.boostT > 0 || (b.finished && G.state !== 'menu');
    b.liftS = (b.liftS || 0) + ((boost ? 1 : 0) - (b.liftS || 0)) * Math.min(1, dt * 3);
    const ph = tw * TAU / 7.5 * b.apsara.speed + b.id * 0.7;
    b.cap.position.y = 0.62 + b.liftS * 0.04;
    b.apsara.update(ph, b.liftS, dt);
    // steersman sweeps the steering oar
    b.steerUpdate(tw * 1.4 + b.id);
    // naga head bob
    b.head.rotation.z = -0.28 + Math.sin(tw * 2.2 + b.id) * 0.04 + sq * 0.05;
    // wake
    const wake = b.wake;
    wake.position.set(b.x + BOW - 15 - 1.0, 0.24, b.z);
    const wo = clamp((b.v - 2) / 14, 0, 1) * 0.4;
    wake.material.opacity = lerp(wake.material.opacity, wo, 0.15);
    wake.scale.set(1, 1, 0.55 + sq * 0.35);
    // spray at the bow + foam along hull
    if (b.v > 2) {
      const n = b.v * dt * 2.2; let cnt = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
      while (cnt-- > 0) {
        const sd = Math.random() < 0.5 ? -1 : 1;
        emit(b.x + 9.3 + rr(0, 1.4), 0.08, b.z + sd * 0.5, rr(-3, 0), rr(1.6, 3.4), sd * rr(1.4, 3.2), rr(0.35, 0.7), rr(0.3, 0.6), 0.92, 0.98, 1, 10);
      }
      const n2 = b.v * dt * 1.6; cnt = Math.floor(n2) + (Math.random() < n2 % 1 ? 1 : 0);
      while (cnt-- > 0) { const sd = Math.random() < 0.5 ? -1 : 1; emit(b.x + rr(-7, 7), 0.12, b.z + sd * rr(0.95, 1.3), -b.v * 0.45, 0.05, sd * rr(0.2, 0.9), rr(0.9, 1.5), rr(0.7, 1.1), 0.95, 1, 1, 0); }
    }
    if (b.boostT > 0 && Math.random() < 0.9) emit(b.x + rr(-8, 8), rr(0.5, 2.5), b.z + rr(-1.2, 1.2), -b.v * 0.3, rr(0.5, 2), rr(-1, 1), rr(0.6, 1.1), rr(0.35, 0.6), 1, rr(0.7, 0.95), 0.25, 1);
  }
  // buoys
  if (buoys) {
    const arr = buoys.instanceMatrix.array;
    for (let i = 0; i < buoyBase.length / 2; i++) {
      const x = buoyBase[i * 2], z = buoyBase[i * 2 + 1];
      arr[i * 16 + 12] = x; arr[i * 16 + 13] = waveH(x, z, tw) + 0.12; arr[i * 16 + 14] = z;
    }
    buoys.instanceMatrix.needsUpdate = true;
  }
}

const SPLIT_ME = 0.7;   // share of the screen for my own boat's view in the 1v1 split
const camera2 = new THREE.PerspectiveCamera(65, 1, 0.5, 2600);
const camPos2 = new THREE.Vector3(0, 8, 40), camLook2 = new THREE.Vector3();
let splitOn = false, camSnap2 = true, camOrbit = PI / 3;   // camOrbit: user-dragged horizontal angle around the boat (0 = front view, 60 degrees = the default rear-side view the race starts from)
function orbitDes(d, l) { if (!camOrbit) return; const x = d.x - l.x, z = d.z - l.z, c = Math.cos(camOrbit), n = Math.sin(camOrbit); d.x = l.x + x * c - z * n; d.z = l.z + x * n + z * c; }
const splitLine = document.createElement('div');
splitLine.style.cssText = 'position:fixed;top:0;bottom:0;left:50%;width:4px;margin-left:-2px;background:#ffc62e;box-shadow:0 0 0 1px #7d0a1c;z-index:5;pointer-events:none;display:none';
document.body.appendChild(splitLine);
// where a follow camera wants to be for the given boats; returns the target fov
function camGoal(hs, aspect, des, look) {
  let fov = 65, cx = 0, cz = 0, mn = 1e9, mx = -1e9;
  hs.forEach(b => { cx += b.x; cz += b.z; mn = Math.min(mn, b.x); mx = Math.max(mx, b.x); });
  cx /= hs.length; cz /= hs.length;
  const spread = mx - mn, two = hs.length > 1;
  let dist = (aspect < 1.1 ? 36 : 23) + (two ? 5 : 0) + Math.min(spread, 40) * 0.45;
  if (aspect < 0.8) dist = Math.min(95, Math.max(dist, 22 / aspect));   // narrow view (phone split-screen): pull back so the whole boat fits across
  const lead = hs.reduce((m, b) => Math.max(m, b.v), 0);
  des.set(cx + 13 + Math.min(spread, 40) * 0.1, 3.9 + dist * 0.04, cz + dist);
  look.set(cx + 2.5, window.innerHeight < 520 && aspect > 1.1 ? -3.2 : 1.8, cz - 3);   // short landscape phone: aim lower so boats sit above the tap panel
  if (G.state === 'results') { des.x += 10; des.y += 1; }
  return fov;
}

function updateCamera(dt, wall) {
  if (G.freeCam) return;
  // 1v1: split the screen in two (one boat per half) when the boats are far apart
  const W = window.innerWidth, H = window.innerHeight;
  const vb = G.mode === 3 && G.humans.length ? [G.humans[0], boats[1 - NET.myIdx]] : G.humans;
  if (vb.length > 1 && (G.state === 'countdown' || G.state === 'race' || G.state === 'finishing')) {
    const d = Math.abs(vb[0].x - vb[1].x);
    if (!splitOn && d > 30) { splitOn = true; camSnap2 = true; camPos2.copy(camPos); camLook2.copy(camLook); }
    else if (splitOn && d < 16) splitOn = false;
  } else splitOn = false;
  camera.aspect = splitOn ? (W * SPLIT_ME) / H : W / H; camera2.aspect = splitOn ? (W * (1 - SPLIT_ME)) / H : W / H;   // my own view gets 70% of the split screen
  const aspect = camera.aspect;
  let des = new THREE.Vector3(), look = new THREE.Vector3(), fov = 65;
  if (G.state === 'menu') {
    const a = wall * 0.12;
    des.set(-8 + Math.sin(a) * 8, 5.5 + Math.sin(a * 0.7) * 1.2, 31 + Math.cos(a) * 3);
    look.set(-27 + Math.sin(a * 0.8) * 3, 2.4, 5);
  } else {
    const hs = splitOn || (G.mode === 3 && vb.length) ? [vb[0]] : (vb.length ? vb : [boats[0]]);   // online 1v1: always follow my own boat, not the midpoint between both
    fov = camGoal(hs, aspect, des, look); orbitDes(des, look);
  }
  const k = camSnap ? 1 : 1 - Math.exp(-dt * 3.2);
  camPos.lerp(des, k); camLook.lerp(look, camSnap ? 1 : 1 - Math.exp(-dt * 4));
  camSnap = false;
  camera.position.copy(camPos);
  if ((splitOn ? vb[0].boostT > 0 : vb.some(b => b.boostT > 0)) && G.state === 'race') { camera.position.x += (Math.random() - .5) * 0.12; camera.position.y += (Math.random() - .5) * 0.12; }
  camera.lookAt(camLook);
  if (splitOn) {   // second camera follows the second player's boat
    const d2 = new THREE.Vector3(), l2 = new THREE.Vector3(), f2 = camGoal([vb[1]], camera2.aspect, d2, l2); orbitDes(d2, l2);
    const k2 = camSnap2 ? 1 : 1 - Math.exp(-dt * 3.2);
    camPos2.lerp(d2, k2); camLook2.lerp(l2, camSnap2 ? 1 : 1 - Math.exp(-dt * 4)); camSnap2 = false;
    camera2.position.copy(camPos2);
    if (vb[1].boostT > 0 && G.state === 'race') { camera2.position.x += (Math.random() - .5) * 0.12; camera2.position.y += (Math.random() - .5) * 0.12; }
    camera2.lookAt(camLook2);
    camera2.fov = lerp(camera2.fov, f2, 1 - Math.exp(-dt * 3)); camera2.updateProjectionMatrix();
  }
  gates.forEach(g => { const far = Math.abs(camera.position.x - g.position.x) > 24; if (g.userData.near) g.userData.near.visible = far; if (g.userData.top) g.userData.top.visible = far; });
  { const fg = gates.find(g => g.userData.drums); if (fg) {   // finish-boat drummers: one strike when THEIR side's boat arrives, otherwise rest
    fg.userData.drums.forEach(d => {
      d.hit = Math.max(0, d.hit - dt * 2.2);
      const t = 1 - d.hit, sq = d.hit > 0 ? Math.max(0, 1 - Math.abs(t - 0.3) / 0.3) : 0, up = -1.1, down = 0.1;
      d.dr.scale.set(1 + 0.06 * sq, 1 - 0.1 * sq, 1 + 0.06 * sq); d.pp.rotation.z = 0.12 * sq; d.pp.position.y = 0.55 - 0.05 * sq;
      d.arms.forEach((a, k) => { a.rotation.z = k ? up + (down - up) * sq : 1.3; });   // arms[1] (z +0.22) is the drummer's right hand on screen (scene is mirrored): it strikes; the other hangs down at rest
    }); } }
  camera.fov = lerp(camera.fov, fov, 1 - Math.exp(-dt * 3)); camera.updateProjectionMatrix();
}

/* ------------------------------------------------------------------ */
/*  Main loop                                                         */
/* ------------------------------------------------------------------ */
let last = performance.now(), wall = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.fixedDt) dt = G.fixedDt;
  G.clock += dt; wall += dt;
  if (!G.paused) {
    if (G.state === 'countdown' || G.state === 'race' || G.state === 'finishing' || G.state === 'results') stepRace(dt);
    else if (G.state === 'menu') G.T += 0;
  }
  const tw = G.paused ? G.pausedWall : wall;
  if (!G.paused) G.pausedWall = wall;
  shared.uT.value = wall;
  updateVisuals(G.paused ? 0.0001 : dt, tw);
  if (!G.paused) updateParticles(dt);
  updateCamera(dt, wall);
  // environment follows each camera; render one full view, or two half-screen views when split
  const cs = 1700 / 250, W = window.innerWidth, H = window.innerHeight;
  const renderView = (cam, vx, vw) => {
    water.position.set(Math.round(cam.position.x / cs) * cs, 0, Math.round(cam.position.z / cs) * cs);
    waterUniforms.uTime.value = tw; waterUniforms.uCam.value.copy(cam.position);
    sky.position.copy(cam.position); cloudGroup.position.set(cam.position.x, 0, cam.position.z);
    renderer.setViewport(vx, 0, vw, H); renderer.setScissor(vx, 0, vw, H);
    pMat.uniforms.uPx.value = H * renderer.getPixelRatio() / (2 * Math.tan(cam.fov * PI / 360));
    renderer.render(scene, cam);
  };
  if (splitOn) { renderer.setScissorTest(true); renderView(camera, W * (1 - SPLIT_ME), W * SPLIT_ME); renderView(camera2, 0, W * (1 - SPLIT_ME)); splitLine.style.left = (SPLIT_ME * 100) + '%'; splitLine.style.display = 'block'; }
  else { renderer.setScissorTest(false); renderView(camera, 0, W); splitLine.style.display = 'none'; }
  if (G.mode === 3) netTick();
  // HUD
  if (G.state !== 'menu') {
    panels.forEach(p => drawTrack(p, G.T));
    if (now - G.lastHud > 90) { G.lastHud = now; updateHud(); }
  }
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  pMat.uniforms.uPx.value = h * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * PI / 360));
}
window.addEventListener('resize', resize);

/* ------------------------------------------------------------------ */
/*  Input & UI wiring                                                 */
/* ------------------------------------------------------------------ */
const P1KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF'], P2KEYS = ['KeyJ', 'KeyK', 'KeyL', 'Semicolon'];
window.addEventListener('keydown', e => {
  if (e.repeat) return;
  const code = e.code;
  if (code === 'KeyM') { toggleMute(); return; }
  if (G.mode === 3 && code === 'Escape' && (G.state === 'race' || G.state === 'countdown' || G.state === 'finishing')) { if (confirm('Leave the race? · ចាកចេញពីការប្រណាំង?')) toMenu(); return; }
  if (code === 'KeyP' || code === 'Escape') { if (G.state === 'race' || G.state === 'countdown' || G.state === 'finishing') togglePause(); return; }
  if (G.state !== 'race' && G.state !== 'finishing') {
    if ((code === 'Enter' || code === 'Space') && G.state === 'menu' && !$('help').classList.contains('hidden') === false) { /* leave to buttons */ }
    return;
  }
  if (code === 'Space' || code === 'Enter') e.preventDefault();
  if (G.mode !== 2) {
    if (P1KEYS.includes(code) || P2KEYS.includes(code) || code === 'Space' || code === 'Enter') humanHit(G.humans[0]);
  } else {
    if (P1KEYS.includes(code)) humanHit(G.humans[0]);
    else if (P2KEYS.includes(code)) humanHit(G.humans[1]);
  }
});
// hold the mouse and drag left/right to swing the camera around the boat (front <-> back); a click without dragging is still a tap
{
  let drag = null;
  const tap = () => { if (G.mode !== 2 && (G.state === 'race' || G.state === 'finishing')) { SFX.init(); humanHit(G.humans[0]); } };
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') { tap(); return; }
    drag = { x: e.clientX, moved: false }; try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 5) return;
    drag.moved = true; drag.x = e.clientX;
    camOrbit -= dx * 0.008;   // screen is mirrored
    camOrbit = Math.max(0, Math.min(PI / 3, camOrbit));   // limited to 60 degrees: from the front view round toward the back
    camSnap = true; camSnap2 = true;
  });
  const end = () => { if (drag && !drag.moved) tap(); drag = null; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', () => { drag = null; });
}

function togglePause() {
  if (G.mode === 3) return;   // no pausing an online race
  G.paused = !G.paused;
  $('pause').classList.toggle('hidden', !G.paused);
  if (SFX.ctx) { G.paused ? SFX.ctx.suspend() : SFX.ctx.resume(); }
  if (!G.paused) G.audStep = Math.max(G.audStep, Math.ceil(G.T / (G.I * 0.5)));
}
function toggleMute() { SFX.setOn(!SFX.on); $('btnMute').textContent = SFX.on ? '🔊' : '🔇'; }

function bindSeg(id, attr, cb) {
  const root = $(id);
  root.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; root.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); cb(b.dataset[attr]); });
}
bindSeg('segMode', 'mode', v => { if (+v !== 3) netClose(); G.mode = +v; updateCtrlHint(); if (+v === 3) location.hash = '#lobby'; showScreen(); });
bindSeg('segDiff', 'diff', v => { G.diffKey = v; });
function updateCtrlHint() {
  $('ctrlHint').innerHTML = G.mode !== 2 ? 'គ្រាប់ចុច · Keys: <kbd>Space</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> <kbd>F</kbd> <kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd> · ឬចុចអេក្រង់ tap' :
    'P1: <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> <kbd>F</kbd> &nbsp;·&nbsp; P2: <kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd> <kbd>;</kbd>';
}
updateCtrlHint();
$('btnStart').onclick = () => { if (G.mode === 3) hostStart(); else startRace(); };
$('btnHelp').onclick = () => $('help').classList.remove('hidden');
$('btnHelpClose').onclick = () => $('help').classList.add('hidden');
$('btnAgain').onclick = () => {
  if (G.mode !== 3) return startRace();
  if (!NET.ready) return;
  NET.rmPending = true; netSend({ t: 'rematch' });
  $('btnAgain').querySelector('i').textContent = 'WAITING FOR OPPONENT…';
};
function rematchAccept() {
  $('rematch').classList.add('hidden'); NET.rmAsked = false;
  if (NET.role === 'host') hostStart(); else netSend({ t: 'rematch-ok' });
}
$('btnRmYes').onclick = rematchAccept;
$('btnRmNo').onclick = () => { $('rematch').classList.add('hidden'); NET.rmAsked = false; netSend({ t: 'rematch-no' }); };
$('btnResMenu').onclick = toMenu;
$('btnResume').onclick = togglePause;
$('btnPauseMenu').onclick = () => { if (G.paused) togglePause(); toMenu(); };
$('btnPause').onclick = togglePause;
$('btnMute').onclick = toggleMute;
// keep keyboard focus off the buttons so Space / Enter / Tab never click Pause or Start by accident
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button'); if (b) b.blur(); });
/* no reloading during a race: block the reload shortcuts and make the browser ask before leaving */
const inRace = () => G.state === 'countdown' || G.state === 'race' || G.state === 'finishing';
document.addEventListener('keydown', e => {
  const k = (e.key || '').toLowerCase();
  if (inRace() && (e.key === 'F5' || ((e.ctrlKey || e.metaKey) && k === 'r'))) { e.preventDefault(); e.stopPropagation(); showBanner('មិនអាចផ្ទុកទំព័រឡើងវិញបានទេ', 'CAN\'T RELOAD DURING A RACE'); }
}, true);
window.addEventListener('beforeunload', e => { if (inRace() && !G.demo) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('keydown', e => { if (e.code === 'Tab' && (G.state === 'race' || G.state === 'countdown' || G.state === 'finishing')) e.preventDefault(); });
document.addEventListener('pointerdown', () => { if (SFX.ctx && SFX.ctx.state === 'suspended' && !G.paused) SFX.ctx.resume(); }, { once: false });


/* ------------------------------------------------------------------ */
/*  Online lobby (route #lobby): choose a boat model, make/join room   */
/* ------------------------------------------------------------------ */
/* ---- boat garage: up to 10 boats (presets + custom), kept in localStorage ---- */
const MAXB = 10;
const hex6 = n => '#' + n.toString(16).padStart(6, '0');
const clean = v => String(v == null ? '' : v).replace(/[^\p{L}\p{M}\p{N} _-]/gu, '').trim().slice(0, 16);   // names reach innerHTML (HUD) → letters/digits only
const col = v => Number.isInteger(v) && v >= 0 && v <= 0xffffff ? v : 0x888888;
const strHash = t => { let h = 0; for (let i = 0; i < t.length; i += 97) h = (h * 31 + t.charCodeAt(i)) | 0; return h + ':' + t.length; };
const keyOf = s => s.hull + '-' + s.dark + '-' + s.shirts[0] + '-' + s.en + '-' + (s.num || '') + '-' + (s.shirt != null ? s.shirt : '') + '-' + (s.oar != null ? s.oar : '') + '-' + (s.pole != null ? s.pole : '') + '-' + (s.skin ? strHash(s.skin) : '') + '-' + s.style + '-' + (s.hull2 != null ? s.hull2 : '') + '-' + (s.stripes || []).join(',') + '/' + (s.stripeSz || []).join(',') + '-' + (s.stripeW == null ? 1 : s.stripeW) + '-' + (s.centre != null ? s.centre : '') + '-' + (s.bow ? strHash(s.bow) : '');
function mk(o) {   // build a scheme from stored / received data (never trust it)
  o = o || {}; const sh = col(o.sh), en = clean(o.en) || 'Boat';
  return { kh: clean(o.kh) || en, en, hull: col(o.hull), dark: col(o.dark), shirts: [sh, sh], css: hex6(sh), custom: !!o.c, hull2: o.h2 == null ? null : col(o.h2), stripes: [0, 1, 2, 3].map(i => Array.isArray(o.zs) && o.zs[i] != null ? col(o.zs[i]) : null), stripeSz: [0, 1, 2, 3].map(i => Array.isArray(o.zz) && Number.isInteger(o.zz[i]) ? clamp(o.zz[i], 1, 6) : 3), centre: o.zc == null ? null : col(o.zc), stripeW: Number.isInteger(o.zw) ? clamp(o.zw, 0, 2) : 1, style: Number.isInteger(o.y) ? Math.abs(o.y) % 5 : 0,
    num: String(o.n == null ? '' : o.n).replace(/\D/g, '').slice(0, 3),
    shirt: o.sc == null ? null : col(o.sc), oar: o.oc == null ? null : col(o.oc), pole: o.pc == null ? null : col(o.pc),
    bow: typeof o.bw === 'string' && o.bw.length <= 700000 && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+\/=]+$/.test(o.bw) ? o.bw : '',
    skin: typeof o.img === 'string' && o.img.length <= 900000 && /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(o.img) ? o.img : '' };
}
const ser = s => ({ kh: s.kh, en: s.en, hull: s.hull, dark: s.dark, sh: s.shirts[0], c: s.custom ? 1 : 0, y: s.style, h2: s.hull2, zs: s.stripes, zz: s.stripeSz, zc: s.centre, zw: s.stripeW, n: s.num, img: s.skin, bw: s.bow, sc: s.shirt, oc: s.oar, pc: s.pole });
const shade = (c, f) => ((((c >> 16) & 255) * f) << 16 | (((c >> 8) & 255) * f) << 8 | ((c & 255) * f)) >>> 0;
let GARAGE = [];
try { GARAGE = (JSON.parse(localStorage.getItem('omtouk-garage')) || []).slice(0, MAXB).map(mk); } catch (e) { }
if (!GARAGE.length) GARAGE = SCHEMES.map((s, i) => mk({ kh: s.kh, en: s.en, hull: s.hull, dark: s.dark, sh: s.shirts[0], y: i }));
function saveGarage() { try { localStorage.setItem('omtouk-garage', JSON.stringify(GARAGE.map(ser))); } catch (e) { } sendGarage(); }
function sendGarage() {   // online: let the opponent see all of our boats (view-only); drop the big pictures if the whole garage is too heavy
  if (!NET.ready || G.mode !== 3) return;
  let g = GARAGE.map(ser);
  if (JSON.stringify(g).length > 3000000) g = g.map((o, i) => GARAGE[i] === PICK.me ? o : Object.assign({}, o, { img: '', bw: '' }));
  netSend({ t: 'garage', g });
}
const PICK = { me: GARAGE[0], p2: null, peer: null, peerGarage: [], who: 1 };   // me = Player 1 / you online, p2 = Player 2 (local 2-player), who = whose boat the garage dialog is choosing
try { const k = sessionStorage.getItem('omtouk-boat'); const f = GARAGE.find(s => keyOf(s) === k); if (f) PICK.me = f; } catch (e) { }
try { const k = sessionStorage.getItem('omtouk-boat2'); PICK.p2 = GARAGE.find(s => keyOf(s) === k) || null; } catch (e) { }
function saveBoat() { try { sessionStorage.setItem('omtouk-boat', keyOf(PICK.me)); if (PICK.p2) sessionStorage.setItem('omtouk-boat2', keyOf(PICK.p2)); } catch (e) { } }
function fixPicks() {   // after deleting / editing boats: keep both picks valid and different
  if (!GARAGE.includes(PICK.me)) PICK.me = GARAGE[0];
  if (!PICK.p2 || !GARAGE.includes(PICK.p2) || keyOf(PICK.p2) === keyOf(PICK.me)) PICK.p2 = GARAGE.find(s => keyOf(s) !== keyOf(PICK.me)) || null;
}
const curPick = () => PICK.who === 2 && G.mode === 2 ? PICK.p2 : PICK.me;
function setModel(i, sc) {
  const b = boats[i]; if (keyOf(b.scheme) === keyOf(sc)) return;
  if (sc.skin && !skinReady(sc.skin)) { loadSkin(sc.skin, applyModels); return; }
  if (sc.bow && !skinReady(sc.bow)) { loadSkin(sc.bow, applyModels); return; }   // decode the picture first, then swap
  [b.root, b.wake].forEach(o => { scene.remove(o); o.traverse(n => { if (n.material) (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => { if (m.map && m.map !== wakeTex) m.map.dispose(); }); }); });
  Object.assign(b, makeBoat(sc), { name: sc });
}
function otherFree() { return GARAGE.find(s => keyOf(s) !== keyOf(PICK.me)) || SCHEMES[0]; }
function applyModels() {   // your boat: boats[0] in solo / local modes, your side in online; the other boat gets a different one from the garage
  const my = G.mode === 3 && NET.role === 'guest' ? 1 : 0;
  fixPicks();
  let other = G.mode === 3 ? PICK.peer : G.mode === 2 ? PICK.p2 : null;
  if (!other || keyOf(other) === keyOf(PICK.me)) other = GARAGE.find(s => keyOf(s) !== keyOf(PICK.me)) || mk({ en: 'Rival', hull: 0x888888, dark: 0x444444, sh: 0xaaaaaa });
  setModel(my, PICK.me); setModel(1 - my, other);
}
function boatSvg(s, id) {
  const h = hex6(s.hull), d = hex6(s.dark), f = hex6(s.shirts[0]);
  const hp = 'M3 20 Q8 12 14 17 L82 17 Q88 12 93 20 Q86 38 62 39 L34 39 Q10 38 3 20Z';
  return '<svg viewBox="0 0 96 48" aria-hidden="true"><defs><linearGradient id="bg' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + h + '"/>' + (s.hull2 != null ? '<stop offset=".3" stop-color="' + h + '"/><stop offset=".6" stop-color="' + hex6(s.hull2) + '"/><stop offset="1" stop-color="' + hex6(s.hull2) + '"/>' : '<stop offset="1" stop-color="' + d + '"/>') + '</linearGradient><clipPath id="cp' + id + '"><path d="' + hp + '"/></clipPath></defs>' +
    '<path d="' + hp + '" fill="url(#bg' + id + ')" stroke="#f6c21c" stroke-width="1.6"/>' +
    (() => { const f = [0.12, 0.2, 0.3][s.stripeW == null ? 1 : s.stripeW], xl = 3 + 90 * (0.5 - f), xr = 3 + 90 * (0.5 + f), P = (cl, d) => cl == null ? '' : '<path fill="' + hex6(cl) + '" d="' + d + '"/>';
      const st = zebraList(s.stripes, s.stripeSz); let z = '';
      if (st.length) for (let x = -6, k = 0; x < 100; k++) { const hb = st[k % st.length][1] * 1.17; z += P(st[k % st.length][0], 'M' + x + ' 12 h' + hb + ' L' + (x + hb - 3) + ' 40 H' + (x - 3) + 'Z'); x += hb; }
      return '<g clip-path="url(#cp' + id + ')"><defs><clipPath id="zc' + id + '"><path d="M0 12 H' + (xl + 3) + ' L' + xl + ' 40 H0Z M' + (xr + 3) + ' 12 H96 V40 H' + xr + 'Z"/></clipPath></defs><g clip-path="url(#zc' + id + ')">' + z + '</g>' + P(s.centre, 'M' + (xl + 3) + ' 12 H' + (xr + 3) + ' L' + xr + ' 40 H' + xl + 'Z') + '</g>'; })() +
    (s.skin ? '<image href="' + s.skin + '" x="3" y="12" width="90" height="28" preserveAspectRatio="none" clip-path="url(#cp' + id + ')"/><path d="' + hp + '" fill="none" stroke="#f6c21c" stroke-width="1.6"/>' : '') +
    (s.bow ? '<image href="' + s.bow + '" x="2" y="19" width="24" height="24" preserveAspectRatio="xMidYMid meet" clip-path="url(#cp' + id + ')"/>' : '') +
    '<path d="M10 22 H86" stroke="#f6c21c" stroke-width="1.2" opacity=".8"/>' +
    '<g fill="' + hex6(s.shirt != null ? s.shirt : 0xf7c71c) + '">' + [20, 30, 40, 50, 60, 70].map(x => '<circle cx="' + x + '" cy="13" r="3.4"/>').join('') + '</g>' +
    '<g stroke="' + hex6(s.pole != null ? s.pole : 0xf3f0e6) + '" stroke-width="1.6" stroke-linecap="round">' + [20, 40, 60].map(x => '<path d="M' + x + ' 13 L' + (x - 7) + ' 31"/>').join('') + '</g>' +
    '<path d="M80 17 V3" stroke="#e9c477" stroke-width="1.5"/><rect x="80" y="2" width="14" height="10" fill="' + f + '"/>' + (s.num ? '<text x="87" y="9.6" font-size="7.5" font-weight="800" fill="#fff" text-anchor="middle" font-family="sans-serif">' + s.num + '</text>' : '') + '</svg>';
}
function renderPick() {
  // lobby button: the boat you're racing with
  fixPicks();
  const two = G.mode === 2;
  const chHtml = (id, bt, who) => '<span class="cur">' + boatSvg(bt, id) + '</span><span class="ct"><small>' + (two ? 'អ្នកលេង ' + who + ' · Player ' + who + ' — ' : '') + 'ជ្រើសរើសទូក · Choose your boat</small><b>' + bt.kh + '</b></span><span class="cnt">' + GARAGE.length + '/' + MAXB + '</span>';
  $('btnChoose').innerHTML = chHtml('curL', PICK.me, 1); $('btnChooseM').innerHTML = chHtml('curM', PICK.me, 1);
  $('btnChooseP2').classList.toggle('hidden', !two); if (two) $('btnChooseP2').innerHTML = chHtml('curP', PICK.p2 || PICK.me, 2);
  if (!two) PICK.who = 1;
  $('garageWho').textContent = two ? ' · P' + PICK.who : '';   // distinct svg ids: one of the two screens is always hidden
  // garage dialog
  const bp = $('boatPick'); bp.innerHTML = '';
  GARAGE.forEach((s, i) => {
    const b = document.createElement('button'); b.dataset.boat = i; b.style.setProperty('--h', hex6(s.hull));
    const cp = curPick(), otherP = two ? (PICK.who === 2 ? PICK.me : PICK.p2) : (NET.ready ? PICK.peer : null);
    const taken = otherP && keyOf(otherP) === keyOf(s);
    b.classList.toggle('on', s === cp); b.classList.toggle('taken', !!taken); b.disabled = !!taken;
    b.innerHTML = boatSvg(s, i) + '<b>' + s.kh + '</b><small>' + (s.custom ? 'Custom' : s.en) + '</small>';
    bp.appendChild(b);
  });
  $('garageCount').textContent = GARAGE.length + ' / ' + MAXB;
  $('btnCustom').disabled = GARAGE.length >= MAXB;
  $('btnDelBoat').disabled = GARAGE.length <= 1;
  // online: the opponent's whole garage, view-only, with their current pick highlighted
  const pg = G.mode === 3 && NET.ready ? PICK.peerGarage : [];
  $('peerGarage').classList.toggle('hidden', !pg.length);
  const pb = $('peerBoats'); pb.innerHTML = '';
  pg.forEach((s, i) => {
    const b = document.createElement('button'); b.disabled = true; b.style.setProperty('--h', hex6(s.hull));
    b.classList.toggle('on', !!PICK.peer && keyOf(PICK.peer) === keyOf(s));
    b.innerHTML = boatSvg(s, 'pg' + i) + '<b>' + s.kh + '</b><small>' + (s.custom ? 'Custom' : s.en) + '</small>';
    pb.appendChild(b);
  });
  const ps = NET.ready && PICK.peer;
  $('peerPick').textContent = ps ? 'ដៃគូ · Opponent: ' + ps.kh : '';
}
function chooseBoat(s, send = true) {
  if (PICK.who === 2 && G.mode === 2) PICK.p2 = s; else PICK.me = s;
  saveBoat();
  if (send && NET.ready && G.mode === 3) netSend({ t: 'boat', s: ser(s) });
  applyModels(); renderPick();
}
$('boatPick').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  chooseBoat(GARAGE[+b.dataset.boat]);
});
const openGarage = who => () => { PICK.who = who; renderPick(); $('garage').classList.remove('hidden'); };
$('btnChoose').onclick = $('btnChooseM').onclick = openGarage(1); $('btnChooseP2').onclick = openGarage(2);
$('btnGarageDone').onclick = () => $('garage').classList.add('hidden');
$('btnDelBoat').onclick = () => {
  if (GARAGE.length <= 1) return;
  const cp = curPick(); if (!cp) return;
  if (!confirm('Delete "' + cp.kh + '"? · លុបទូកនេះ?')) return;
  GARAGE.splice(GARAGE.indexOf(cp), 1); saveGarage(); fixPicks(); saveBoat();
  if (NET.ready && G.mode === 3) netSend({ t: 'boat', s: ser(PICK.me) });
  applyModels(); renderPick();
};
/* custom boat dialog */
const CB = { skin: '', bow: '', edit: -1 };
const CBS = [['cbZebraOn', 'cbStripe', 0xffffff, 'cbSz0'], ['cbMix2On', 'cbStripe2', 0x111111, 'cbSz1'], ['cbZ3On', 'cbStripe3', 0xe53935, 'cbSz2'], ['cbZ4On', 'cbStripe4', 0xffd23f, 'cbSz3']];
const cbStripes = () => CBS.map(r => $(r[0]).checked ? parseInt($(r[1]).value.slice(1), 16) : null);   // up to 4 zebra colours
const cbSizes = () => CBS.map(r => +$(r[3]).value);
const cbCentreVal = () => $('cbCenterOn').checked ? parseInt($('cbCenter').value.slice(1), 16) : null;
const cbHullVal = () => $('cbHullOn').checked ? parseInt($('cbHull').value.slice(1), 16) : 0xffffff;   // hull colour unticked → white
function cbPreview() {
  const hull = cbHullVal(), sh = parseInt($('cbCrew').value.slice(1), 16);
  $('cbPrev').innerHTML = boatSvg(mk({ hull, zs: cbStripes(), zz: cbSizes(), zc: cbCentreVal(), zw: +$('cbStripeW').value, h2: $('cbMixOn').checked ? parseInt($('cbHull2').value.slice(1), 16) : null, dark: shade(hull, 0.55), sh, img: CB.skin, bw: CB.bow, n: $('cbNum').value, sc: parseInt($('cbShirt').value.slice(1), 16), oc: parseInt($('cbOar').value.slice(1), 16), pc: parseInt($('cbPole').value.slice(1), 16) }), 'cb');
  $('cbClear').classList.toggle('hidden', !CB.skin); $('cbBowClear').classList.toggle('hidden', !CB.bow);
  $('btnCbBow').querySelector('i').textContent = CB.bow ? 'EDIT FRONT DRAWING' : 'DRAW FRONT PICTURE';
  $('btnCbUpload').querySelector('i').textContent = CB.skin ? 'CHANGE PICTURE' : 'UPLOAD PICTURE';
}
$('btnCbUpload').onclick = () => $('cbFile').click();
$('btnCbBow').onclick = () => {   // white drawing board: draw, save → picture covers the front colour
  const cv = $('drawCv'), x = cv.getContext('2d'); x.clearRect(0, 0, 512, 512);
  if (CB.bow) { const im = new Image(); im.onload = () => x.drawImage(im, 0, 0, 512, 512); im.src = CB.bow; }
  DRAW.hist = []; $('drawUndo').disabled = true; DRAW.erase = false; $('drawEr').textContent = 'Eraser'; $('drawDlg').classList.remove('hidden');
};
const DRAW = { erase: false, on: false, lx: 0, ly: 0, hist: [] };   // hist: snapshots for Undo
(() => {
  const cv = $('drawCv'), x = cv.getContext('2d'); x.lineCap = x.lineJoin = 'round';
  const snap = () => { DRAW.hist.push(x.getImageData(0, 0, 512, 512)); if (DRAW.hist.length > 30) DRAW.hist.shift(); $('drawUndo').disabled = false; };
  const pt = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * 512 / r.width, (e.clientY - r.top) * 512 / r.height]; };
  const seg = (ax, ay, bx, by) => { x.globalCompositeOperation = DRAW.erase ? 'destination-out' : 'source-over'; x.strokeStyle = $('drawCol').value; x.lineWidth = +$('drawSz').value; x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke(); };
  cv.onpointerdown = e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); snap(); DRAW.on = true; [DRAW.lx, DRAW.ly] = pt(e); seg(DRAW.lx, DRAW.ly, DRAW.lx + 0.01, DRAW.ly); };
  cv.onpointermove = e => { if (!DRAW.on) return; const [px, py] = pt(e); seg(DRAW.lx, DRAW.ly, px, py); DRAW.lx = px; DRAW.ly = py; };
  cv.onpointerup = cv.onpointercancel = () => { DRAW.on = false; };
  $('drawEr').onclick = () => { DRAW.erase = !DRAW.erase; $('drawEr').textContent = DRAW.erase ? 'Pen' : 'Eraser'; };
  $('drawCol').oninput = () => { DRAW.erase = false; $('drawEr').textContent = 'Eraser'; };
  $('drawUndo').onclick = () => { const d = DRAW.hist.pop(); if (d) x.putImageData(d, 0, 0); $('drawUndo').disabled = !DRAW.hist.length; };
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !$('drawDlg').classList.contains('hidden')) { e.preventDefault(); e.stopPropagation(); $('drawUndo').click(); } }, true);
  $('drawClr').onclick = () => { snap(); x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, 512, 512); };
  $('drawNo').onclick = () => $('drawDlg').classList.add('hidden');
  $('drawOk').onclick = () => {
    const d = x.getImageData(0, 0, 512, 512).data; let any = false; for (let i = 3; i < d.length; i += 4) if (d[i]) { any = true; break; }
    CB.bow = any ? cv.toDataURL('image/png') : ''; $('drawDlg').classList.add('hidden'); cbPreview();
  };
})();
$('cbBowClear').onclick = () => { CB.bow = ''; cbPreview(); };
$('cbClear').onclick = () => { CB.skin = ''; cbPreview(); };
$('cbNum').addEventListener('keydown', e => e.stopPropagation());
$('cbNum').addEventListener('input', () => { $('cbNum').value = $('cbNum').value.replace(/\D/g, '').slice(0, 3); cbPreview(); });
$('cbFile').onchange = e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f || !/^image\//.test(f.type)) return;
  if (f.size > 15e6) { alert('Picture too large (max 15 MB). · រូបភាពធំពេក'); return; }
  const url = URL.createObjectURL(f), im = new Image();
  im.onload = () => {
    // hull skin = the whole picture resized to exactly 3840 x 2160, filling the full boat
    const c = document.createElement('canvas'); c.width = 3840; c.height = 2160; const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, 3840, 2160);
    URL.revokeObjectURL(url);
    let u = ''; for (const q of [0.85, 0.7, 0.55, 0.4, 0.3, 0.2]) { u = c.toDataURL('image/jpeg', q); if (u.length <= 900000) break; }
    CB.skin = u; cbPreview();
  };
  im.onerror = () => { URL.revokeObjectURL(url); alert('Could not read that picture. · មិនអាចអានរូបភាពបាន'); };
  im.src = url;
};
function setDance(v) { $('cbDance').value = v; $('cbDanceGrid').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.d === +v)); }
$('cbDanceGrid').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setDance(b.dataset.d); });
function openCB(edit) {   // edit = index of the boat to edit, or -1 for a new one
  CB.edit = edit;
  const s = edit >= 0 ? GARAGE[edit] : null;
  CB.skin = s ? s.skin : ''; CB.bow = s ? s.bow : ''; $('cbNum').value = s ? s.num : ''; $('cbName').value = s ? s.kh : '';
  $('cbShirt').value = hex6(s && s.shirt != null ? s.shirt : 0xf7c71c); $('cbOar').value = hex6(s && s.oar != null ? s.oar : 0xf3f0e6); $('cbPole').value = hex6(s && s.pole != null ? s.pole : 0xe9c477);
  CBS.forEach((r, i) => { const v = s && s.stripes ? s.stripes[i] : null; $(r[0]).checked = v != null; $(r[1]).value = hex6(v != null ? v : r[2]); $(r[3]).value = s && s.stripeSz ? s.stripeSz[i] : 3; });
  $('cbStripeW').value = s ? s.stripeW : 1; $('cbCenterOn').checked = !!(s && s.centre != null); $('cbCenter').value = hex6(s && s.centre != null ? s.centre : 0xffd23f);
  $('cbMixOn').checked = !!(s && s.hull2 != null); $('cbHull2').value = hex6(s && s.hull2 != null ? s.hull2 : 0xffd23f);
  setDance(s && s.style < 4 ? s.style : 0);
  $('cbHullOn').checked = !s || s.hull !== 0xffffff; $('cbHull').value = s && s.hull !== 0xffffff ? hex6(s.hull) : '#c8102e'; $('cbCrew').value = s ? hex6(s.shirts[0]) : '#2f78e0';
  $('cbTitle').textContent = s ? 'កែទូក · Edit boat' : 'ទូកផ្ទាល់ខ្លួន · Custom boat';
  $('btnCbSave').querySelector('i').textContent = s ? 'SAVE CHANGES' : 'SAVE';
  cbPreview(); $('customBoat').classList.remove('hidden'); $('cbName').focus();
}
$('btnCustom').onclick = () => { if (GARAGE.length < MAXB) openCB(-1); };
$('btnEditBoat').onclick = () => { const i = GARAGE.indexOf(curPick()); if (i >= 0) openCB(i); };
CBS.forEach(r => { $(r[1]).oninput = () => { $(r[0]).checked = true; cbPreview(); }; $(r[0]).onchange = cbPreview; $(r[3]).oninput = cbPreview; }); $('cbStripeW').oninput = cbPreview;
$('cbCenter').oninput = () => { $('cbCenterOn').checked = true; cbPreview(); }; $('cbCenterOn').onchange = cbPreview;

$('cbHull2').oninput = () => { $('cbMixOn').checked = true; cbPreview(); }; $('cbMixOn').onchange = cbPreview;
$('cbHull').oninput = () => { $('cbHullOn').checked = true; cbPreview(); }; $('cbHullOn').onchange = cbPreview;
$('cbCrew').oninput = $('cbShirt').oninput = $('cbOar').oninput = $('cbPole').oninput = cbPreview;
$('cbName').addEventListener('keydown', e => e.stopPropagation());
$('btnCbCancel').onclick = () => $('customBoat').classList.add('hidden');
$('btnCbSave').onclick = () => {
  const ed = CB.edit; if (ed < 0 && GARAGE.length >= MAXB) return;
  const hull = cbHullVal(), sh = parseInt($('cbCrew').value.slice(1), 16), nm = clean($('cbName').value) || (ed >= 0 ? GARAGE[ed].kh : 'Custom ' + (GARAGE.length + 1));
  const s = mk({ kh: nm, en: nm, hull, zs: cbStripes(), zz: cbSizes(), zc: cbCentreVal(), zw: +$('cbStripeW').value, h2: $('cbMixOn').checked ? parseInt($('cbHull2').value.slice(1), 16) : null, dark: shade(hull, 0.55), sh, c: 1, y: +$('cbDance').value, n: $('cbNum').value, img: CB.skin, bw: CB.bow, sc: parseInt($('cbShirt').value.slice(1), 16), oc: parseInt($('cbOar').value.slice(1), 16), pc: parseInt($('cbPole').value.slice(1), 16) });
  if (GARAGE.some((g, gi) => gi !== ed && keyOf(g) === keyOf(s))) { alert('You already have this boat. · មានទូកនេះរួចហើយ'); return; }
  if (ed >= 0) { const old = GARAGE[ed]; GARAGE[ed] = s; if (PICK.me === old) PICK.me = s; if (PICK.p2 === old) PICK.p2 = s; } else GARAGE.push(s);
  saveGarage();
  try { if (localStorage.getItem('omtouk-garage') !== JSON.stringify(GARAGE.map(ser))) alert('Browser storage is full: this boat will not be remembered next visit.'); } catch (e) { }
  $('customBoat').classList.add('hidden'); chooseBoat(s);
};
function setModeUI(m) { G.mode = m; $('segMode').querySelectorAll('button').forEach(x => x.classList.toggle('on', +x.dataset.mode === m)); updateCtrlHint(); }
function showScreen() {
  if (G.state !== 'menu') return;
  const lob = G.mode === 3;
  $('lobby').classList.toggle('hidden', !lob); $('menu').classList.toggle('hidden', lob);
  try {
    if (lob && location.hash !== '#lobby') history.replaceState(null, '', '#lobby');
    if (!lob && location.hash === '#lobby') history.replaceState(null, '', location.pathname + location.search);
  } catch (e) { }
  refreshMenu(); renderPick(); applyModels();
}
window.addEventListener('hashchange', () => {   // browser Back / Forward between menu and lobby
  if (G.state !== 'menu') return;
  const lob = location.hash === '#lobby';
  if (lob && G.mode !== 3) setModeUI(3); else if (!lob && G.mode === 3) { netClose(); setModeUI(1); }
  showScreen();
});
bindSeg('segDiffL', 'diff', v => { G.diffKey = v; });
$('btnStartL').onclick = () => hostStart();
$('btnBackL').onclick = () => { netClose(); setModeUI(1); showScreen(); };
if (location.hash === '#lobby') setModeUI(3);

/* ------------------------------------------------------------------ */
/*  Online rooms (peer-to-peer via WebRTC / PeerJS)                   */
/*  Host = Red boat, guest = Blue boat. Each side simulates its own   */
/*  boat and streams its state; the notes are seeded so both match.   */
/* ------------------------------------------------------------------ */
const NET = { peer: null, conn: null, role: null, code: '', myIdx: 0, ready: false, lastSend: 0, rx: null };
const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 5 }, () => CODE_CH[Math.floor(Math.random() * CODE_CH.length)]).join('');
function netStatus(txt, cls) { const e = $('olStatus'); e.textContent = txt; e.className = 'olstatus ' + (cls || ''); }
function refreshMenu() {
  const on = G.mode === 3, inRoom = !!NET.role;
  $('olStart').classList.toggle('hidden', inRoom);
  $('olRoom').classList.toggle('hidden', !inRoom);
  $('roomCode').textContent = NET.code || '—';
  $('lobbyDiff').classList.toggle('hidden', !(on && NET.role === 'host'));
  $('btnStartL').classList.toggle('hidden', !(on && NET.role === 'host' && NET.ready));
  $('btnAgain').querySelector('i').textContent = 'Race again'; $('btnAgain').classList.remove('hidden');
  if (!on || !inRoom) netStatus('');
}
function netClose() {
  const c = NET.conn, p = NET.peer;
  NET.conn = NET.peer = null; NET.role = null; NET.ready = false; NET.code = ''; PICK.peer = null; PICK.peerGarage = [];   // NET.rx is kept so the other boat keeps gliding while a link is rebuilt
  try { c && c.close(); } catch (e) { }
  try { p && p.destroy(); } catch (e) { }
}
function netSend(m) { try { if (NET.conn && NET.conn.open) NET.conn.send(m); } catch (e) { } }
function netAttach(c) {
  NET.conn = c;
  const opened = () => {
    if (NET.conn !== c) return;
    NET.ready = true; netSend({ t: 'hi' }); netSend({ t: 'boat', s: ser(PICK.me) }); sendGarage(); refreshMenu(); renderPick();
    netStatus(NET.role === 'host' ? 'Friend joined! Press START RACE.' : 'Connected! Waiting for the host to start…', 'ok');
    NET.waiting = false; clearTimeout(NET.waitTimer);
    if (NET.resumeSnap) { const r = NET.resumeSnap; NET.resumeSnap = null; restoreRace(r); }
  };
  c.on('open', opened); if (c.open) opened();
  c.on('data', m => { if (m && m.t === 'bye') gone(); else netOnData(m); });
  const gone = () => {
    if (NET.conn !== c) return;
    const racing = G.mode === 3 && (G.state === 'countdown' || G.state === 'race' || G.state === 'finishing');
    if (racing) {
      // opponent dropped (e.g. reloaded): keep racing; only their side is interrupted
      const role = NET.role, code = NET.code;
      NET.conn = null; NET.ready = false; NET.waiting = true;
      if (role === 'guest') joinRoom(code, Date.now() + 50000);
      clearTimeout(NET.waitTimer);
      NET.waitTimer = setTimeout(() => { if (NET.waiting) { saveSess(null); toMenu(); } }, 50000);
    }
    else if (G.state === 'results') { NET.conn = null; NET.ready = false; $('rematch').classList.add('hidden'); $('btnAgain').classList.add('hidden'); }
    else { netClose(); refreshMenu(); netStatus('Disconnected.', 'err'); }
  };
  c.on('close', gone); c.on('error', gone);
}
function netGuard() {
  if (typeof Peer === 'undefined') { netStatus('Online library failed to load (check your connection).', 'err'); return false; }
  return true;
}
function createRoom(tries, fixed) {
  netClose(); if (!netGuard()) return;
  NET.role = 'host'; NET.myIdx = 0; NET.code = fixed || newCode(); refreshMenu(); netStatus('Creating room…');
  const peer = NET.peer = new Peer('omtouk-' + NET.code);
  peer.on('open', () => { if (NET.peer === peer) netStatus('Share this code with your friend and wait for them to join…'); });
  peer.on('connection', c => {
    if (NET.conn) {
      const racing = NET.waiting || G.state === 'countdown' || G.state === 'race' || G.state === 'finishing';
      if (!racing) { c.on('open', () => c.close()); return; }
      // the other player reloaded: their old link is dead but not timed out yet, so replace it
      const old = NET.conn; NET.conn = null; NET.ready = false; try { old.close(); } catch (e) { }
      NET.waiting = true;
    }
    netAttach(c);
  });
  peer.on('disconnected', () => { try { if (NET.peer === peer && !peer.destroyed) peer.reconnect(); } catch (e) { } });
  peer.on('error', e => {
    if (NET.peer !== peer) return;
    if (e.type === 'peer-unavailable' || e.type === 'webrtc' || e.type === 'network' || e.type === 'socket-error' || e.type === 'socket-closed') return;   // a joiner dropped out mid-handshake: keep the room open
    if (e.type === 'unavailable-id' && fixed && (tries || 0) < 20) { netClose(); setTimeout(() => createRoom((tries || 0) + 1, fixed), 1500); return; }
    if (e.type === 'unavailable-id' && !fixed && (tries || 0) < 5) { createRoom((tries || 0) + 1); return; }
    netClose(); refreshMenu(); netStatus('Could not create room (' + e.type + ').', 'err');
  });
}
function joinRoom(code, retryUntil) {
  code = (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 5) { netStatus('Enter the 5-letter room code.', 'err'); return; }
  netClose(); if (!netGuard()) return;
  NET.role = 'guest'; NET.myIdx = 1; NET.code = code; refreshMenu(); netStatus('Joining room ' + code + '…');
  const peer = NET.peer = new Peer();
  peer.on('disconnected', () => { try { if (NET.peer === peer && !peer.destroyed) peer.reconnect(); } catch (e) { } });
  peer.on('open', () => { if (NET.peer === peer) netAttach(peer.connect('omtouk-' + code, { reliable: true })); });
  peer.on('error', e => {
    if (NET.peer !== peer) return;
    if (retryUntil && Date.now() < retryUntil && e.type === 'peer-unavailable') { netClose(); setTimeout(() => { if (!NET.peer && G.mode === 3 && (G.state === 'menu' || NET.waiting || G.paused)) joinRoom(code, retryUntil); }, 2000); NET.role = 'guest'; NET.code = code; refreshMenu(); netStatus('Waiting for the host to come back…'); return; }
    netClose(); saveSess(null); refreshMenu(); netStatus(e.type === 'peer-unavailable' ? 'Room ' + code + ' not found.' : 'Could not join (' + e.type + ').', 'err');
  });
  setTimeout(() => { if (NET.peer === peer && !NET.ready) { netClose(); saveSess(null); refreshMenu(); netStatus('Could not reach room ' + code + '.', 'err'); } }, 25000);
}
function hostStart() {
  if (NET.role !== 'host' || !NET.ready) return;
  netSend({ t: 'start', diff: G.diffKey }); startRace();
}
function netOnData(m) {
  if (!m) return;
  if (m.t === 'start' && NET.role === 'guest' && DIFFS[m.diff]) { G.diffKey = m.diff; startRace(); }
  else if (m.t === 'rematch' && G.state === 'results') {
    if (NET.rmPending) rematchAccept();                 // both asked at once: just go
    else { NET.rmAsked = true; $('rematch').classList.remove('hidden'); }
  }
  else if (m.t === 'rematch-ok' && NET.role === 'host' && G.state === 'results') hostStart();
  else if (m.t === 'rematch-no') { NET.rmPending = false; $('btnAgain').querySelector('i').textContent = 'Opponent declined'; }
  else if (m.t === 'boat' && m.s && typeof m.s === 'object') {
    PICK.peer = mk(m.s);
    if (G.state === 'menu' && NET.role === 'guest' && keyOf(PICK.peer) === keyOf(PICK.me)) { const f = GARAGE.find(s => keyOf(s) !== keyOf(PICK.peer)); if (f) { PICK.me = f; saveBoat(); netSend({ t: 'boat', s: ser(f) }); } }   // same boat chosen: host keeps it
    applyModels(); renderPick();
  }
  else if (m.t === 'garage' && Array.isArray(m.g)) { PICK.peerGarage = m.g.slice(0, MAXB).map(o => mk(o && typeof o === 'object' ? o : {})); renderPick(); }
  else if (m.t === 's') NET.rx = Object.assign(m, { at: G.clock });
}
function netState(b) { return { x: b.x, v: b.v, sy: b.sync, cb: b.combo, mc: b.maxCombo, bt: b.boostT, sc: b.score, p: b.stats.p, g: b.stats.g, m: b.stats.m, f: b.finished ? 1 : 0, ft: b.finishT }; }
function netTick() {
  if (!NET.ready || (G.state !== 'countdown' && G.state !== 'race' && G.state !== 'finishing')) return;
  if (G.clock - NET.lastSend < 0.07) return;
  NET.lastSend = G.clock; netSend({ t: 's', ...netState(G.humans[0]) });
}
function netStep(b, dt) {
  const r = NET.rx; if (!r) return;
  b.v = r.v;
  if (!NET.ready) { b.x += r.v * dt; return; }   // opponent is reloading: their boat just keeps gliding, nothing else changes
  const tx = r.x + r.v * Math.min(0.5, G.clock - r.at);
  b.x += r.v * dt + (tx - b.x) * Math.min(1, dt * 8);
  b.sync = r.sy; b.combo = r.cb; b.maxCombo = r.mc; b.boostT = r.bt; b.score = r.sc; b.stats = { p: r.p, g: r.g, m: r.m };
  if (r.f && !b.finished) { b.finished = true; b.finishT = r.ft; beatFinishDrum(b); }
}
window.addEventListener('pagehide', () => {
  saveSnap(true);
  if (NET.conn && G.mode === 3) { netSend({ t: 'bye' }); try { NET.conn.close(); } catch (e) { } }
});
$('btnCreate').onclick = () => createRoom(0);
$('btnJoin').onclick = () => joinRoom($('joinCode').value);
$('joinCode').addEventListener('keydown', e => { e.stopPropagation(); if (e.code === 'Enter') joinRoom($('joinCode').value); });
$('btnLeave').onclick = () => { netClose(); refreshMenu(); };
$('btnCopy').onclick = () => { try { navigator.clipboard.writeText(NET.code); $('btnCopy').textContent = 'Copied!'; setTimeout(() => $('btnCopy').textContent = 'Copy', 1500); } catch (e) { } };

/* ------------------------------------------------------------------ */
/*  Reload recovery (online race interrupted by a page refresh)       */
/* ------------------------------------------------------------------ */
let SESS = null, lastSnap = 0;
function saveSnap(force) {
  if (G.mode !== 3 || !SESS || !G.humans.length || (G.state !== 'countdown' && G.state !== 'race' && G.state !== 'finishing')) return;
  const n = Date.now(); if (!force && n - lastSnap < 400) return; lastSnap = n;
  const b = G.humans[0];
  saveSess(Object.assign({}, SESS, { snap: { ts: n, T: G.T, st: G.state, b: { x: b.x, v: b.v, sync: b.sync, combo: b.combo, maxCombo: b.maxCombo, score: b.score, boostT: b.boostT, finished: b.finished, finishT: b.finishT, ptr: b.ptr, bandsDone: b.bandsDone, stats: b.stats, ns: Array.from(b.ns) } } }));
}
function restoreRace(s) {
  const sn = s.snap, b = G.humans[0]; if (!sn || !b) { G.paused = false; return; }
  const el = (Date.now() - sn.ts) / 1000, o = sn.b;
  G.T = sn.T + el;
  Object.assign(b, { x: o.x + (o.finished ? 0 : o.v * el), v: o.v, sync: o.sync, combo: o.combo, maxCombo: o.maxCombo, score: o.score, boostT: o.boostT, finished: o.finished, finishT: o.finishT, ptr: o.ptr, bandsDone: o.bandsDone, stats: o.stats, ns: Uint8Array.from(o.ns) });
  G.state = sn.st === 'finishing' ? 'finishing' : G.T >= 0 ? 'race' : 'countdown';
  G.cdShown = Math.floor(G.T / G.I + 1e-6); G.audStep = Math.max(G.audStep, Math.ceil(G.T / (G.I * 0.5)));
  G.paused = false; if (SFX.ctx) SFX.ctx.resume();
  if (G.state !== 'countdown') $('countdown').innerHTML = '';
  showBanner('បន្តការប្រណាំង', 'BACK IN THE RACE');
}
function saveSess(v) { try { v ? sessionStorage.setItem('omtouk-sess', JSON.stringify(v)) : sessionStorage.removeItem('omtouk-sess'); } catch (e) { } }
function loadSess() { try { const v = JSON.parse(sessionStorage.getItem('omtouk-sess')); return v && /^[A-Z0-9]{5}$/.test(v.code) && (v.role === 'host' || v.role === 'guest') ? v : null; } catch (e) { return null; } }
function checkInterrupted() {
  const s = loadSess(); if (!s || G.demo) return;
  // rebuild the race screen the player was on and freeze it under the dialog
  G.mode = 3; NET.role = s.role; NET.myIdx = s.role === 'host' ? 0 : 1;
  if (DIFFS[s.diff]) G.diffKey = s.diff;
  $('segMode').querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.mode === '3'));
  updateCtrlHint(); setupRace(); NET.role = null;
  G.state = 'countdown'; G.paused = true; camSnap = true;
  $('menu').classList.add('hidden'); $('lobby').classList.add('hidden'); $('hud').classList.remove('hidden'); $('btnPause').style.display = 'none';
  $('interrupt').classList.remove('hidden');
  let autoT = null, left = 5; const rl = $('btnIntResume').querySelector('i');
  const stopAuto = () => { clearInterval(autoT); rl.textContent = 'Resume'; };
  autoT = setInterval(() => { if (--left <= 0) $('btnIntResume').onclick(); else rl.textContent = 'Resume (' + left + ')'; }, 1000);
  rl.textContent = 'Resume (' + left + ')';
  $('btnSurrender').onclick = () => { stopAuto(); saveSess(null); $('interrupt').classList.add('hidden'); toMenu(); };
  $('btnIntResume').onclick = () => {
    stopAuto();
    $('interrupt').classList.add('hidden');
    showCount('…', 'Reconnecting to your opponent');
    SESS = { role: s.role, code: s.code, diff: s.diff }; NET.resumeSnap = s;
    setTimeout(() => { if (NET.resumeSnap) { NET.resumeSnap = null; saveSess(null); toMenu(); } }, 50000);   // gave up waiting
    if (s.role === 'host') createRoom(0, s.code); else joinRoom(s.code, Date.now() + 45000);
  };
}

/* ------------------------------------------------------------------ */
/*  Boot                                                              */
/* ------------------------------------------------------------------ */
buildShore(); buildCrowdAndFlags(); buildCourse();
toMenu(true);
checkInterrupted();
resize();
camPos.set(-8, 5.5, 31); camLook.set(-27, 2.4, 5);
if (document.fonts && document.fonts.load) {
  Promise.all([document.fonts.load('40px Moul'), document.fonts.load("700 20px 'Kantumruy Pro'")].map(p => p.catch(() => 0)))
    .then(() => { redraws.forEach(f => f()); }).catch(() => { });
  document.fonts.ready.then(() => redraws.forEach(f => f()));
}
requestAnimationFrame(frame);
setTimeout(() => $('loading').classList.add('done'), 350);
if (G.demo) { G.mode = 1; G.diffKey = (location.search.match(/diff=(\w+)/) || [0, 'normal'])[1]; setTimeout(startRace, 400); }
window.__om = { G, NET, boats, startRace, camera, scene, renderer, step(sec) { for (let t = 0; t < sec; t += 1 / 30) { stepRace(1 / 30); wall += 1 / 30; updateVisuals(1 / 30, wall); updateParticles(1 / 30); } camSnap = true; } };
})();
