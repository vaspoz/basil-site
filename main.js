import * as THREE from 'three';

/* =========================================================
   Platform city: a floating island that a platform builds
   as you scroll. Morning to night, one continuous world.
   ========================================================= */

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DPR = Math.min(window.devicePixelRatio || 1, 2);

/* ---------- small helpers ---------- */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sub = (x, a, b) => clamp((x - a) / (b - a));
const sstep = (a, b, x) => { const t = sub(x, a, b); return t * t * (3 - 2 * t); };
const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
const easeOutBack = (t) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c1 = 1.25, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash3 = (x, y, z) => {
  const s = Math.sin(Math.round(x * 997) * 12.9898 + Math.round(y * 997) * 78.233 + Math.round(z * 997) * 37.719) * 43758.5453;
  return s - Math.floor(s);
};
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const C = (h) => new THREE.Color(h);

/* ---------- renderer, scene, camera ---------- */
const canvas = document.getElementById('world');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (err) {
  // no WebGL: fall back to the captions as a plain page
  document.documentElement.classList.add('no-gl');
  document.querySelector('.loader').classList.add('done');
  throw err;
}
renderer.setPixelRatio(DPR);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 420);

const hemi = new THREE.HemisphereLight(0xd8e8ff, 0xd4c3a6, 1.35);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 220 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.025;
sun.target.position.set(5, 0, -3);
scene.add(sun, sun.target);

/* ---------- materials ---------- */
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, ...extra });
const MAT = {
  grass: std('#a3cf86'),
  dirt: std('#a17656'),
  rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }),
  road: std('#d6cfc2'),
  quay: std('#c9b8a0'),
  wall: std('#efe7d8'),
  wood: std('#8c6a4c'),
  white: std('#f7f2ea'),
  dark: std('#3c4558'),
  rail: std('#6d6a73'),
  inst: () => std('#ffffff'),
};

/* window lights on building walls, computed in the shader from local position */
const U = {
  night: { value: 0 },
  warm: { value: new THREE.Color(1.0, 0.68, 0.34).multiplyScalar(2.1) },
  pulseCol: { value: new THREE.Color(0.35, 0.8, 1.0).multiplyScalar(1.1) },
  time: { value: 0 },
};
function patchWindows(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = U.night;
    sh.uniforms.uWarm = U.warm;
    sh.vertexShader = 'attribute float aLit;\nvarying vec3 vLP; varying vec3 vSc; varying vec3 vN0; varying vec2 vSeed; varying float vLit;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vSc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vSeed = instanceMatrix[3].xz;
      #else
        vSc = vec3(1.0); vSeed = vec2(0.0);
      #endif
      vLP = position * vSc; vN0 = normal; vLit = aLit;`);
    sh.fragmentShader = 'uniform float uNight; uniform vec3 uWarm;\nvarying vec3 vLP; varying vec3 vSc; varying vec3 vN0; varying vec2 vSeed; varying float vLit;\n' +
      sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        float side = 1.0 - step(0.5, abs(vN0.y));
        bool onX = abs(vN0.x) > 0.5;
        float u = onX ? vLP.z : vLP.x;
        float hw = onX ? vSc.z * 0.5 : vSc.x * 0.5;
        float cw = 0.19; float ch = 0.25;
        float fu = fract(u / cw + 0.5);
        float fv = fract(vLP.y / ch);
        float win = step(0.3, fu) * step(fu, 0.7) * step(0.3, fv) * step(fv, 0.8);
        win *= step(abs(u), hw - 0.06) * step(0.2, vLP.y) * step(vLP.y, vSc.y - 0.07) * side;
        vec2 cell = vec2(floor(u / cw + 0.5), floor(vLP.y / ch));
        float hsh = fract(sin(dot(cell + vSeed * 1.73 + vN0.xz * 7.1, vec2(12.9898, 78.233))) * 43758.5453);
        float on = step(0.34, hsh);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.42, 0.52), win * 0.72);
        totalEmissiveRadiance += uWarm * win * on * uNight * vLit * (0.6 + 0.8 * hsh);
      }`);
  };
}
function patchPulse(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uPulseCol = U.pulseCol;
    sh.vertexShader = 'attribute float aPulse; varying float vPulse;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPulse = aPulse;');
    sh.fragmentShader = 'uniform vec3 uPulseCol; varying float vPulse;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uPulseCol * vPulse;');
  };
}

/* ---------- geometry primitives ---------- */
const boxBase = () => { const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); return g; };
const pyrBase = () => { const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1); g.rotateY(Math.PI / 4); g.translate(0, 0.5, 0); return g; };

function inst(geo, mat, count, cast = true, receive = true) {
  const m = new THREE.InstancedMesh(geo, mat, count);
  m.castShadow = cast;
  m.receiveShadow = receive;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.frustumCulled = false;
  scene.add(m);
  return m;
}
const M4 = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const V = new THREE.Vector3();
const S = new THREE.Vector3();
function setTRS(mesh, i, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) {
  E.set(rx, ry, rz, 'YXZ');
  Q.setFromEuler(E);
  V.set(x, y, z);
  S.set(sx, sy, sz);
  M4.compose(V, Q, S);
  mesh.setMatrixAt(i, M4);
}

/* ---------- islands ---------- */
const ISL = {
  main: { cx: 0, cz: 0, y: 0, w: 28, d: 22, r: 5, rock: 12 },
  aws: { cx: 26, cz: -9, y: -1.6, w: 11, d: 10, r: 3, rock: 7.5 },
  old: { cx: 8, cz: 21, y: -0.9, w: 10, d: 8, r: 2.6, rock: 6.5 },
};
const MINIS = [
  { cx: -1, cz: -31, y: 0.5, w: 3.6, d: 3.0, r: 1.2, rock: 3.2, trees: 3 },
  { cx: -30, cz: 2, y: 1.5, w: 4.2, d: 3.4, r: 1.4, rock: 3.8, trees: 2, house: true },
  { cx: 36, cz: 14, y: -5, w: 3.2, d: 2.8, r: 1.1, rock: 2.8, trees: 2 },
  { cx: -27, cz: -24, y: -3, w: 2.6, d: 2.2, r: 0.9, rock: 2.4, trees: 1 },
  { cx: 22, cz: -36, y: 2.5, w: 2.6, d: 2.2, r: 0.9, rock: 2.2, trees: 2 },
  { cx: 26, cz: 24, y: -7, w: 3.4, d: 2.6, r: 1.1, rock: 2.6, trees: 2, house: true },
];

function sdIsland(o, x, z, m = 0) {
  const hx = o.w / 2 - m, hz = o.d / 2 - m, rr = Math.max(0.01, o.r - m);
  const qx = Math.abs(x - o.cx) - (hx - rr), qz = Math.abs(z - o.cz) - (hz - rr);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - rr;
}
const inIsland = (o, x, z, m = 0) => sdIsland(o, x, z, m) <= 0;

function rrShape(w, d, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function craggy(rx, depth, rz, seed) {
  const g = new THREE.ConeGeometry(1, 1, 12, 6, true);
  g.rotateX(Math.PI);
  g.translate(0, -0.5, 0);
  const p = g.attributes.position;
  const cols = new Float32Array(p.count * 3);
  const cTop = C('#9b7454'), cMid = C('#857377'), cLow = C('#5d5874'), tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = -y;
    const j = t > 0.02 && t < 0.97 ? 1 : 0;
    const h1 = hash3(x + seed, y, z), h2 = hash3(z, x - seed, y);
    x *= 1 + j * (h1 - 0.5) * 0.42;
    z *= 1 + j * (h2 - 0.5) * 0.42;
    y += j * (h1 - 0.5) * 0.07;
    p.setXYZ(i, x * rx, y * depth, z * rz);
    if (t < 0.18) tmp.copy(cTop).lerp(cMid, t / 0.18);
    else tmp.copy(cMid).lerp(cLow, (t - 0.18) / 0.82);
    tmp.multiplyScalar(0.92 + h2 * 0.16);
    cols.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return g;
}

function buildIsland(o, seed) {
  const r = rng(seed);
  const g = new THREE.Group();
  g.position.set(o.cx, o.y, o.cz);
  const top = new THREE.ExtrudeGeometry(rrShape(o.w, o.d, o.r), {
    depth: 0.6, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.14, bevelSegments: 2, curveSegments: 10,
  });
  top.rotateX(-Math.PI / 2);
  top.translate(0, -0.74, 0);
  const topMesh = new THREE.Mesh(top, [MAT.grass, MAT.dirt]);
  topMesh.receiveShadow = true;
  topMesh.castShadow = true;
  g.add(topMesh);
  const rock = new THREE.Mesh(craggy(o.w * 0.46, o.rock, o.d * 0.46, seed), MAT.rock);
  rock.position.y = -0.62;
  rock.castShadow = true;
  g.add(rock);
  const n = Math.max(2, Math.round(o.w / 4));
  for (let k = 0; k < n; k++) {
    const a = r() * Math.PI * 2, rad = 0.25 + r() * 0.12;
    const s = 0.18 + r() * 0.16;
    const m = new THREE.Mesh(craggy(o.w * s, o.rock * (0.25 + r() * 0.35), o.d * s, seed + k * 7), MAT.rock);
    m.position.set(Math.cos(a) * o.w * rad, -0.62, Math.sin(a) * o.d * rad);
    g.add(m);
  }
  scene.add(g);
  return g;
}
buildIsland(ISL.main, 11);
buildIsland(ISL.aws, 23);
buildIsland(ISL.old, 37);
MINIS.forEach((o, k) => buildIsland(o, 51 + k * 13));

/* ---------- city plan ---------- */
const R = rng(20231009);
const ROAD_X = [-8, -4, 0, 4, 8]; // roads running along z at these x
const ROAD_Z = [-8, -4, 4, 8];   // roads running along x at these z
const HUB = { x: 2, z: -2 };
const MILL = { x: -12.7, z: 2.6 };

const WALLS = ['#f6f1e7', '#efe6d8', '#e9edf0', '#f3e9dc', '#e5e9f1', '#f1ede8', '#dee6ec'];
const AZURE = ['#2f6fde', '#3c7be6', '#2a60c8', '#4a88ec', '#2d68d2'];
const AWS = ['#f29a3a', '#ec8a2c', '#f5a84d'];
const STONE = ['#ede7dc', '#e6dfd2', '#f0ebe2', '#e9e2d6'];

const bodies = [];
const tiles = [];
const cand = [];
for (let i = -12; i <= 12; i++) {
  for (let j = -10; j <= 10; j++) {
    if (i % 4 === 0 || j % 4 === 0) continue;
    if (!inIsland(ISL.main, i, j, 1.15)) continue;
    if (i >= 1 && i <= 3 && j >= -3 && j <= -1) continue;
    if (Math.hypot(i - MILL.x, j - MILL.z) < 2.3) continue;
    cand.push({ i, j, d: Math.hypot(i * 0.85, j * 1.1) + R() * 3.2 });
  }
}
cand.sort((a, b) => a.d - b.d);
const bCells = cand.slice(0, 146);
const parkCells = cand.slice(146);

bCells.forEach((c, k) => {
  const centr = clamp(1 - Math.hypot(c.i * 0.85, c.j * 1.1) / 12.5);
  const h = 0.55 + Math.pow(centr, 1.7) * 3.3 + R() * 0.65;
  const w = 0.62 + R() * 0.22, d = 0.62 + R() * 0.22;
  bodies.push({
    grp: 'main', x: c.i + (R() - 0.5) * 0.06, z: c.j + (R() - 0.5) * 0.06, y: 0.06, w, d, h,
    o: k / 146, roof: h > 1.75 ? 'flat' : 'pyr', roofH: 0.32 + R() * 0.22,
    color: pick(R, WALLS), roofColor: pick(R, AZURE),
  });
  tiles.push({ grp: 'main', x: c.i, z: c.j, y: 0, o: k / 146, color: pick(R, STONE) });
});
// hub: the control plane tower that GitOps changes leave from
bodies.push({ grp: 'hub', x: HUB.x, z: HUB.z, y: 0.06, w: 1.15, d: 1.15, h: 4.6, o: 0, roof: 'flat', roofH: 0.1, color: '#f7f3ec', roofColor: '#2a60c8' });
for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) tiles.push({ grp: 'main', x: HUB.x + di, z: HUB.z + dj, y: 0, o: 0, color: di === 0 && dj === 0 ? '#e2dacb' : '#ece5d8' });

// AWS island: 15 clusters
const awsCand = [];
for (let x = ISL.aws.cx - 4.2; x <= ISL.aws.cx + 4.2; x += 1.3) {
  for (let z = ISL.aws.cz - 3.6; z <= ISL.aws.cz + 3.6; z += 1.3) {
    if (!inIsland(ISL.aws, x, z, 1.2)) continue;
    if (Math.abs(z - -7) < 0.8 && x < ISL.aws.cx - 1.5) continue;
    awsCand.push({ x, z, d: Math.hypot(x - ISL.aws.cx, (z - ISL.aws.cz) * 1.2) + R() * 1.5 });
  }
}
awsCand.sort((a, b) => a.d - b.d);
const awsCells = awsCand.slice(0, 15);
const awsSpare = awsCand.slice(15);
awsCells.forEach((c, k) => {
  const h = 0.7 + R() * 1.7 + (k < 3 ? 0.8 : 0);
  bodies.push({
    grp: 'aws', x: c.x, z: c.z, y: ISL.aws.y + 0.06, w: 0.66 + R() * 0.2, d: 0.66 + R() * 0.2, h,
    o: k / 15, roof: h > 1.8 ? 'flat' : 'pyr', roofH: 0.32 + R() * 0.2,
    color: pick(R, WALLS), roofColor: pick(R, AWS),
  });
  tiles.push({ grp: 'aws', x: c.x, z: c.z, y: ISL.aws.y, o: k / 15, color: pick(R, STONE) });
});

// Old quarter: where the career started. Landmarks are spread left to right as the camera sees them.
const OY = ISL.old.y, OX = ISL.old.cx, OZ = ISL.old.cz;
const LANDMARK = {};
function oldBody(x, z, w, d, h, color, roof = 'none', roofColor = '#6e7381', y = OY, roofH = 0.4) {
  bodies.push({ grp: 'old', x, z, y, w, d, h, o: 0, roof, roofH, color, roofColor });
}
const EPAM = [OX - 3.8, OZ + 1.0], BNP = [OX - 1.6, OZ - 0.6], VB = [OX + 0.3, OZ - 1.0], CTAC = [OX + 3.8, OZ - 0.4];
// EPAM: stacked modern blocks
oldBody(EPAM[0], EPAM[1], 1.25, 1.05, 1.0, '#dfe5ea');
oldBody(EPAM[0], EPAM[1], 1.0, 0.85, 0.8, '#e8edf1', 'none', '#6e7381', OY + 1.0);
oldBody(EPAM[0], EPAM[1], 0.72, 0.62, 0.55, '#f1f4f6', 'flat', '#56657a', OY + 1.8, 0.07);
LANDMARK.epam = [EPAM[0], OY + 2.6, EPAM[1]];
// BNP Paribas Cardif: classical bank, podium and cella (columns and pediment added below)
oldBody(BNP[0], BNP[1], 1.8, 1.3, 0.22, '#e7dfcf');
oldBody(BNP[0], BNP[1] - 0.15, 1.35, 0.8, 0.95, '#efe8da', 'none', '#6e7381', OY + 0.22);
LANDMARK.bnp = [BNP[0], OY + 1.9, BNP[1]];
// Volksbank and its neighbours: Dutch canal houses with stepped gables
const GABLE = [];
[['#b9674b', 1.55], ['#9c5a48', 1.35], ['#c47a55', 1.7], ['#a9654f', 1.45]].forEach(([c, h], k) => {
  const x = VB[0] + k * 0.62, z = VB[1];
  oldBody(x, z, 0.56, 0.9, h, c);
  GABLE.push({ x, z, y: OY + h, w: 0.56, color: c });
});
LANDMARK.volksbank = [VB[0] + 0.62 * 2, OY + 2.5, VB[1]];
// Ctac: a slim tower with an antenna
oldBody(CTAC[0], CTAC[1], 0.85, 0.85, 2.7, '#e9eef2', 'flat', '#4f5d70', OY, 0.08);
LANDMARK.ctac = [CTAC[0], OY + 3.7, CTAC[1]];
// a few houses for the quarter
[[-2.4, 2.4, 0.7, 0.8, 0.7], [-1.4, 2.7, 0.6, 0.7, 0.9], [0.5, 2.3, 0.7, 0.6, 0.6], [1.5, 2.6, 0.6, 0.6, 0.75], [-4.0, -1.6, 0.6, 0.7, 0.8], [2.7, 2.2, 0.6, 0.6, 0.65]].forEach(([x, z, w, d, h]) => {
  oldBody(OX + x, OZ + z, w, d, h, pick(R, ['#c98a63', '#b9674b', '#e9dcc8', '#d7a27c']), 'pyr', pick(R, ['#5f6676', '#7a5246', '#6e7381']), OY, 0.4);
});

// a lone farmhouse on some of the small islands
MINIS.forEach((o) => { if (o.house) oldBody(o.cx + 0.6, o.cz - 0.3, 0.7, 0.6, 0.6, '#f3ece0', 'pyr', '#6e7381', o.y, 0.35); });

/* ---------- instanced city meshes ---------- */
const bodyMat = MAT.inst();
patchWindows(bodyMat);
const bodyGeo = boxBase();
const litAttr = new THREE.InstancedBufferAttribute(new Float32Array(bodies.length).fill(1), 1);
litAttr.setUsage(THREE.DynamicDrawUsage);
bodyGeo.setAttribute('aLit', litAttr);
const bodyMesh = inst(bodyGeo, bodyMat, bodies.length);
bodies.forEach((b, k) => bodyMesh.setColorAt(k, C(b.color)));

const pyrList = bodies.map((b, k) => (b.roof === 'pyr' ? k : -1)).filter((k) => k >= 0);
const flatList = bodies.map((b, k) => (b.roof === 'flat' ? k : -1)).filter((k) => k >= 0);
const roofMatP = MAT.inst(); patchPulse(roofMatP);
const roofMatF = MAT.inst(); patchPulse(roofMatF);
const pyrGeo = pyrBase();
const flatGeo = boxBase();
const pulseP = new THREE.InstancedBufferAttribute(new Float32Array(pyrList.length), 1);
const pulseF = new THREE.InstancedBufferAttribute(new Float32Array(flatList.length), 1);
pulseP.setUsage(THREE.DynamicDrawUsage);
pulseF.setUsage(THREE.DynamicDrawUsage);
pyrGeo.setAttribute('aPulse', pulseP);
flatGeo.setAttribute('aPulse', pulseF);
const pyrMesh = inst(pyrGeo, roofMatP, pyrList.length);
const flatMesh = inst(flatGeo, roofMatF, flatList.length);
pyrList.forEach((k, i) => pyrMesh.setColorAt(i, C(bodies[k].roofColor)));
flatList.forEach((k, i) => flatMesh.setColorAt(i, C(bodies[k].roofColor)));
const unitList = flatList.filter((k) => bodies[k].h > 2.1 && bodies[k].grp !== 'old');
const unitMesh = inst(boxBase(), std('#c9ced6'), unitList.length);
const unitOff = unitList.map(() => [(R() - 0.5) * 0.25, (R() - 0.5) * 0.25]);

const tileMesh = inst(boxBase(), MAT.inst(), tiles.length, false, true);
tiles.forEach((t, k) => tileMesh.setColorAt(k, C(t.color)));

// stepped gables on canal houses
const gableMesh = inst(boxBase(), MAT.inst(), GABLE.length * 3);
GABLE.forEach((g, k) => {
  for (let s = 0; s < 3; s++) {
    const i = k * 3 + s;
    gableMesh.setColorAt(i, C(g.color));
    setTRS(gableMesh, i, g.x, g.y + s * 0.15, g.z + 0.17, g.w * (0.82 - s * 0.26), 0.15, 0.55 - s * 0.1);
  }
});
// classical columns + pediment for the old bank
const colGeo = new THREE.CylinderGeometry(0.055, 0.06, 1, 8);
colGeo.translate(0, 0.5, 0);
const colMesh = inst(colGeo, MAT.white, 6);
for (let k = 0; k < 6; k++) setTRS(colMesh, k, BNP[0] - 0.65 + k * 0.26, OY + 0.22, BNP[1] + 0.52, 1, 0.95, 1);
{
  const tri = new THREE.Shape();
  tri.moveTo(-0.95, 0); tri.lineTo(0.95, 0); tri.lineTo(0, 0.42); tri.lineTo(-0.95, 0);
  const pg = new THREE.ExtrudeGeometry(tri, { depth: 1.3, bevelEnabled: false });
  pg.translate(0, 0, -0.65);
  const ped = new THREE.Mesh(pg, MAT.white);
  ped.position.set(BNP[0], OY + 1.17, BNP[1]);
  ped.castShadow = true;
  scene.add(ped);
  const slab = new THREE.Mesh(boxBase(), MAT.white);
  slab.scale.set(1.9, 0.1, 1.38);
  slab.position.set(BNP[0], OY + 1.17 - 0.1, BNP[1]);
  slab.castShadow = true;
  scene.add(slab);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.8, 6), MAT.dark);
  ant.position.set(CTAC[0], OY + 2.78 + 0.4, CTAC[1]);
  scene.add(ant);
}

/* ---------- roads, canal, water ---------- */
function extentAlong(axis, c, margin) {
  let a = null, b = null;
  for (let s = -16; s <= 16; s += 0.05) {
    const x = axis === 'z' ? c : s, z = axis === 'z' ? s : c;
    if (inIsland(ISL.main, x, z, margin)) { if (a === null) a = s; b = s; }
  }
  return [a, b];
}
const roads = [];
ROAD_X.forEach((x) => { const [a, b] = extentAlong('z', x, 1.0); roads.push({ axis: 'z', c: x, a, b }); });
ROAD_Z.forEach((z) => { let [a, b] = extentAlong('x', z, 1.0); a = Math.max(a, -11.6); b = Math.min(b, 11.6); roads.push({ axis: 'x', c: z, a, b }); });
const roadMesh = inst(boxBase(), MAT.road, roads.length, false, true);

const waterMat = new THREE.ShaderMaterial({
  uniforms: { uTime: U.time, uA: { value: C('#7dbedb') }, uB: { value: C('#cfe9f2') } },
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `uniform float uTime; uniform vec3 uA; uniform vec3 uB; varying vec3 vW;
    void main(){
      float s = sin(vW.x * 3.1 - uTime * 1.4 + sin(vW.z * 9.0) * 0.6) * 0.5 + 0.5;
      float s2 = sin(vW.x * 7.3 + uTime * 0.9 + vW.z * 4.0) * 0.5 + 0.5;
      float glint = smoothstep(0.86, 1.0, s * s2);
      vec3 c = mix(uA, uB, glint * 0.85);
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`,
});
const CANAL = { a: -12.0, b: 14.15, w: 0.84 };
{
  const water = new THREE.Mesh(new THREE.BoxGeometry(CANAL.b - CANAL.a, 0.03, CANAL.w), waterMat);
  water.position.set((CANAL.a + CANAL.b) / 2, 0.015, 0);
  scene.add(water);
  const pond = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.03, 28), waterMat);
  pond.position.set(-12.1, 0.016, 0);
  scene.add(pond);
  [-1, 1].forEach((s) => {
    const q = new THREE.Mesh(boxBase(), MAT.quay);
    q.scale.set(CANAL.b - CANAL.a - 1.0, 0.1, 0.14);
    q.position.set((CANAL.a + CANAL.b) / 2 + 0.5, 0, s * (CANAL.w / 2 + 0.07));
    q.receiveShadow = true;
    scene.add(q);
  });
  // little railings where roads bridge the canal
  ROAD_X.forEach((x) => [-1, 1].forEach((s) => {
    const rl = new THREE.Mesh(boxBase(), MAT.white);
    rl.scale.set(0.06, 0.12, 1.15);
    rl.position.set(x + s * 0.34, 0.05, 0);
    rl.castShadow = true;
    scene.add(rl);
  }));
}
// waterfall where the canal leaves the island
const fallMat = new THREE.ShaderMaterial({
  uniforms: { uTime: U.time, uCol: { value: C('#e4f4fb') } },
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform float uTime; uniform vec3 uCol; varying vec2 vUv;
    void main(){
      float n = fract(vUv.y * 7.0 + uTime * 1.3 + sin(vUv.x * 23.0) * 0.12);
      float streak = 0.55 + 0.45 * step(0.55, n);
      float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
      float a = streak * edge * smoothstep(0.0, 0.55, vUv.y);
      gl_FragColor = vec4(uCol, a * 0.9);
      #include <colorspace_fragment>
    }`,
});
{
  const fg = new THREE.PlaneGeometry(CANAL.w * 0.92, 9);
  fg.rotateY(Math.PI / 2);
  fg.translate(0, -4.5, 0);
  const fall = new THREE.Mesh(fg, fallMat);
  fall.position.set(CANAL.b + 0.08, 0.03, 0);
  scene.add(fall);
}

/* survey lines + flag: the empty site before the platform */
const surveyMat = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.85 });
{
  const pts = [];
  roads.forEach((r) => {
    if (r.axis === 'z') pts.push(new THREE.Vector3(r.c, 0.02, r.a), new THREE.Vector3(r.c, 0.02, r.b));
    else pts.push(new THREE.Vector3(r.a, 0.02, r.c), new THREE.Vector3(r.b, 0.02, r.c));
  });
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const lines = new THREE.LineSegments(g, surveyMat);
  lines.computeLineDistances();
  scene.add(lines);
}
const flag = new THREE.Group();
{
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.7, 6), MAT.dark);
  pole.position.y = 0.85;
  pole.castShadow = true;
  flag.add(pole);
  const fg = new THREE.PlaneGeometry(0.7, 0.42, 10, 3);
  fg.translate(0.35, 0, 0);
  const cloth = new THREE.Mesh(fg, std('#2f6fde', { side: THREE.DoubleSide }));
  cloth.position.y = 1.45;
  cloth.castShadow = true;
  flag.add(cloth);
  flag.userData.cloth = cloth;
  flag.userData.base = fg.attributes.position.array.slice();
  flag.position.set(HUB.x, 0, HUB.z);
  scene.add(flag);
}

/* ---------- bridges ---------- */
const BRIDGE = { x0: 13.3, x1: 21.0, z: -7, y0: 0, y1: ISL.aws.y };
const bridge = new THREE.Group();
{
  const len = BRIDGE.x1 - BRIDGE.x0;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, 0.9), MAT.wall);
  deck.position.set(len / 2, -0.07, 0);
  deck.castShadow = true;
  deck.receiveShadow = true;
  bridge.add(deck);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(len / 2, 0.06, 6, 40, Math.PI), MAT.white);
  arch.scale.set(1, 0.42, 1);
  arch.position.set(len / 2, 0, -0.48);
  arch.castShadow = true;
  bridge.add(arch);
  const arch2 = arch.clone();
  arch2.position.z = 0.48;
  bridge.add(arch2);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(len + 3.4, 0.03, 0.22), MAT.rail);
  rail.position.set(len / 2, 0.015, 0);
  bridge.add(rail);
  bridge.position.set(BRIDGE.x0, BRIDGE.y0 + 0.02, BRIDGE.z);
  bridge.rotation.z = Math.atan2(BRIDGE.y1 - BRIDGE.y0, len);
  scene.add(bridge);
}
{
  // footbridge to the old quarter
  const len = 6.8;
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, len), MAT.wood);
  deck.position.z = len / 2;
  deck.castShadow = true;
  g.add(deck);
  [-1, 1].forEach((s) => {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, len), MAT.wood);
    r.position.set(s * 0.33, 0.12, len / 2);
    g.add(r);
  });
  g.position.set(10, -0.02, 10.55);
  g.rotation.x = Math.atan2(0.9, len);
  scene.add(g);
}

/* ---------- windmill ---------- */
const mill = new THREE.Group();
const millBlades = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.6, 2.3, 8), std('#4d5c57'));
  body.position.y = 1.15;
  body.castShadow = true;
  mill.add(body);
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.06, 8), MAT.wood);
  gallery.position.y = 0.9;
  mill.add(gallery);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.6, 8), std('#3b3f4a'));
  cap.position.y = 2.6;
  cap.castShadow = true;
  mill.add(cap);
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group();
    const spar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.55, 0.05), MAT.wood);
    spar.position.y = 0.78;
    arm.add(spar);
    const sail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.02), std('#f4efe4'));
    sail.position.set(0.17, 0.9, 0);
    sail.castShadow = true;
    arm.add(sail);
    arm.rotation.z = (k * Math.PI) / 2;
    millBlades.add(arm);
  }
  millBlades.position.set(0, 2.35, 0.55);
  mill.add(millBlades);
  mill.position.set(MILL.x, 0, MILL.z);
  mill.rotation.y = Math.PI / 4;
  scene.add(mill);
}

/* ---------- trees ---------- */
const trees = [];
const nearRoad = (x, z) => ROAD_X.some((rx) => Math.abs(x - rx) < 0.55) || ROAD_Z.some((rz) => Math.abs(z - rz) < 0.55 && Math.abs(x) < 11.8);
const nearBuilding = (x, z) => bCells.some((c) => Math.abs(c.i - x) < 0.62 && Math.abs(c.j - z) < 0.62) || (Math.abs(x - HUB.x) < 1.7 && Math.abs(z - HUB.z) < 1.7);
function addTree(x, y, z, kind) {
  trees.push({ x, y, z, kind: kind ?? (R() < 0.3 ? 'poplar' : 'round'), s: 0.75 + R() * 0.5, ph: R() * 6.28, c: pick(R, ['#5f9f5b', '#4c8a50', '#6dab5e', '#7fb35f', '#558f57']) });
}
// tulip fields on the quiet edges of the island, one colour per strip like the bulb fields around Breda
const TULIPS = ['#e2404f', '#f2c14e', '#ef7aa6', '#9b5de5', '#f58a3c', '#ffffff'];
const tulipCells = parkCells.filter((c) => (c.i <= -5 && c.j >= 5) || (c.i >= 9 && c.j >= 5) || (c.i <= -9 && c.j <= -5));
const tulipStrips = [];
tulipCells.forEach((c) => {
  const color = TULIPS[(Math.abs(c.i) * 7 + Math.abs(c.j) * 3) % TULIPS.length];
  for (let s = 0; s < 4; s++) tulipStrips.push({ x: c.i, y: 0, z: c.j - 0.36 + s * 0.24, color });
});
MINIS.filter((o) => o.house).forEach((o) => {
  for (let s = 0; s < 6; s++) tulipStrips.push({ x: o.cx - 0.6, y: o.y, z: o.cz - 0.75 + s * 0.24, color: TULIPS[s % 3], len: 1.4 });
});
parkCells.forEach((c) => {
  if (tulipCells.includes(c)) return;
  const n = R() < 0.25 ? 0 : R() < 0.6 ? 1 : 2;
  for (let k = 0; k < n; k++) {
    const x = c.i + (R() - 0.5) * 0.6, z = c.j + (R() - 0.5) * 0.6;
    if (Math.abs(z) < 0.8) continue;
    addTree(x, 0, z);
  }
});
{
  const ring = rrShape(ISL.main.w - 2.2, ISL.main.d - 2.2, ISL.main.r - 1.1).getSpacedPoints(90);
  ring.forEach((pt) => {
    const x = pt.x, z = -pt.y;
    if (R() < 0.35) return;
    if (Math.abs(z) < 1.0 && x > 10) return;
    if (Math.hypot(x - MILL.x, z - MILL.z) < 1.4) return;
    if (Math.hypot(x - 13.3, z + 7) < 1.3 || Math.hypot(x - 10, z - 10.5) < 1.2) return;
    if (nearRoad(x, z) || nearBuilding(x, z)) return;
    addTree(x, 0, z);
  });
}
awsSpare.forEach((c) => { if (R() < 0.8) addTree(c.x + (R() - 0.5) * 0.4, ISL.aws.y, c.z + (R() - 0.5) * 0.4); });
[[-4.3, 1.6], [-3.2, -2.7], [0.0, -2.9], [2.9, -2.7], [4.2, 1.9], [3.6, 2.9], [-3.0, 3.0], [0.0, 1.1]].forEach(([x, z]) => addTree(OX + x, OY, OZ + z, 'round'));
MINIS.forEach((o) => {
  for (let k = 0; k < o.trees; k++) addTree(o.cx + (R() - 0.5) * o.w * 0.5, o.y, o.cz + (R() - 0.5) * o.d * 0.5);
});
const tulipMesh = inst(boxBase(), MAT.inst(), tulipStrips.length, false, true);
tulipStrips.forEach((t, k) => {
  tulipMesh.setColorAt(k, C(t.color));
  setTRS(tulipMesh, k, t.x, t.y, t.z, t.len || 0.9, 0.07, 0.13);
});
tulipMesh.instanceMatrix.needsUpdate = true;
const trunkGeo = new THREE.CylinderGeometry(0.045, 0.06, 1, 5);
trunkGeo.translate(0, 0.5, 0);
const trunkMesh = inst(trunkGeo, MAT.wood, trees.length);
const roundGeo = new THREE.IcosahedronGeometry(1, 0);
const poplarGeo = new THREE.ConeGeometry(1, 1, 6);
poplarGeo.translate(0, 0.5, 0);
const roundTrees = trees.filter((t) => t.kind === 'round');
const poplarTrees = trees.filter((t) => t.kind === 'poplar');
const roundMesh = inst(roundGeo, std('#ffffff', { flatShading: true }), roundTrees.length);
const poplarMesh = inst(poplarGeo, std('#ffffff', { flatShading: true }), poplarTrees.length);
roundTrees.forEach((t, k) => roundMesh.setColorAt(k, C(t.c)));
poplarTrees.forEach((t, k) => poplarMesh.setColorAt(k, C(t.c).offsetHSL(0, -0.05, -0.04)));
trees.forEach((t, k) => setTRS(trunkMesh, k, t.x, t.y, t.z, t.s, (t.kind === 'poplar' ? 0.35 : 0.42) * t.s, t.s));
trunkMesh.instanceMatrix.needsUpdate = true;

/* ---------- walls, beacons, shield (guardrails) ---------- */
const wallSegs = [];
const FOOT_X = 10;
const GATES = [[13.3, -7], [FOOT_X, 10.6], [14, 0], [21.0, -7]];
function perimeter(o, inset, n) {
  return rrShape(o.w - inset * 2, o.d - inset * 2, Math.max(0.3, o.r - inset)).getSpacedPoints(n).map((p) => ({ x: o.cx + p.x, z: o.cz - p.y }));
}
[[ISL.main, 150], [ISL.aws, 60]].forEach(([o, n]) => {
  const pts = perimeter(o, 0.32, n);
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1];
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    if (GATES.some(([gx, gz]) => Math.hypot(mx - gx, mz - gz) < 0.85)) continue;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    wallSegs.push({ x: mx, z: mz, y: o.y, len, ang: Math.atan2(-(b.z - a.z), b.x - a.x), o: k / (pts.length - 1), post: k % 6 === 0 });
  }
});
const wallMesh = inst(boxBase(), MAT.wall, wallSegs.length);
const beacons = [];
[[ISL.main, 6], [ISL.aws, 4]].forEach(([o, n]) => {
  const pts = perimeter(o, 0.32, n * 8);
  for (let k = 0; k < n; k++) {
    const p = pts[Math.floor((k + 0.5) * 8) % pts.length];
    if (GATES.some(([gx, gz]) => Math.hypot(p.x - gx, p.z - gz) < 1.2)) continue;
    beacons.push({ x: p.x, z: p.z, y: o.y, o: k / n });
  }
});
// gate towers at each end of the big bridge
beacons.push({ x: 13.1, z: -7.75, y: 0, o: 0.5, gate: true }, { x: 13.1, z: -6.25, y: 0, o: 0.5, gate: true });
beacons.push({ x: 21.2, z: -7.75, y: ISL.aws.y, o: 0.5, gate: true }, { x: 21.2, z: -6.25, y: ISL.aws.y, o: 0.5, gate: true });
const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 1, 6);
poleGeo.translate(0, 0.5, 0);
const poleMesh = inst(poleGeo, MAT.wall, beacons.length);
const lampMesh = inst(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffe3a1' }), beacons.length, false, false);

const domeMat = new THREE.ShaderMaterial({
  uniforms: { uAmt: { value: 0 }, uTime: U.time, uCol: { value: C('#bfe3ff') } },
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform float uAmt; uniform float uTime; uniform vec3 uCol; varying vec3 vN; varying vec3 vP;
    void main(){
      float fres = pow(1.0 - abs(vN.z), 2.2);
      float lat = abs(fract(vP.y * 9.0) - 0.5);
      float lon = abs(fract(atan(vP.z, vP.x) * 7.0) - 0.5);
      float grid = smoothstep(0.44, 0.5, max(lat, lon));
      float scan = exp(-pow((vP.y - fract(uTime * 0.22)) * 10.0, 2.0));
      float a = uAmt * (0.03 + fres * 0.35 + grid * 0.16 + scan * 0.35);
      gl_FragColor = vec4(uCol, clamp(a, 0.0, 1.0));
    }`,
});
const domes = [];
[[ISL.main, 16.2, 7.0, 12.8], [ISL.aws, 6.6, 3.6, 6.0]].forEach(([o, sx, sy, sz]) => {
  const d = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
  d.scale.set(sx, sy, sz);
  d.position.set(o.cx, o.y, o.cz);
  d.renderOrder = 5;
  scene.add(d);
  domes.push(d);
});

/* ---------- GitOps arcs: every change leaves the hub for every district at once ---------- */
const hubTop = new THREE.Vector3(HUB.x, 0.06 + 4.6 + 0.4, HUB.z);
const arcTargets = bodies.filter((b) => b.grp === 'main' || b.grp === 'aws').map((b) => new THREE.Vector3(b.x, b.y + b.h + (b.roof === 'pyr' ? b.roofH : 0.08), b.z));
const ARC_N = 22;
let arcLines = null;
const arcCtrl = arcTargets.map((t) => {
  const mid = hubTop.clone().lerp(t, 0.5);
  mid.y += 1.6 + hubTop.distanceTo(t) * 0.32;
  return mid;
});
const bez = (a, c, b, t, out) => out.set(
  (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
  (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
  (1 - t) * (1 - t) * a.z + 2 * (1 - t) * t * c.z + t * t * b.z,
);
const arcMat = new THREE.ShaderMaterial({
  uniforms: { uHead: { value: 0 }, uAmt: { value: 0 }, uCol: { value: C('#9fe9ff') } },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: 'attribute float aT; varying float vT; void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform float uHead; uniform float uAmt; uniform vec3 uCol; varying float vT;
    void main(){
      float d = uHead - vT;
      float trail = step(0.0, d) * smoothstep(0.42, 0.0, d);
      float head = smoothstep(0.05, 0.0, abs(d));
      float a = uAmt * (trail * 0.65 + head * 1.4 + 0.05);
      gl_FragColor = vec4(uCol * (1.0 + head), clamp(a, 0.0, 1.0));
    }`,
});
{
  const pos = new Float32Array(arcTargets.length * ARC_N * 2 * 3);
  const ts = new Float32Array(arcTargets.length * ARC_N * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  let i = 0;
  arcTargets.forEach((t, k) => {
    for (let s = 0; s < ARC_N; s++) {
      bez(hubTop, arcCtrl[k], t, s / ARC_N, a);
      bez(hubTop, arcCtrl[k], t, (s + 1) / ARC_N, b);
      pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
      ts[i * 2] = s / ARC_N;
      ts[i * 2 + 1] = (s + 1) / ARC_N;
      i++;
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aT', new THREE.BufferAttribute(ts, 1));
  arcLines = new THREE.LineSegments(g, arcMat);
  arcLines.frustumCulled = false;
  arcLines.renderOrder = 6;
  scene.add(arcLines);
}

// packets: dotted trails that stay readable against a bright sky
const PK_N = 26;
const pkMat = new THREE.ShaderMaterial({
  uniforms: { uHead: arcMat.uniforms.uHead, uAmt: arcMat.uniforms.uAmt, uSize: { value: 7 }, uCol: { value: C('#2a86ff') }, uCore: { value: C('#effcff') } },
  transparent: true, depthWrite: false,
  vertexShader: `attribute float aT; uniform float uHead; uniform float uSize; varying float vA; varying float vH;
    void main(){
      float d = uHead - aT;
      float trail = step(0.0, d) * smoothstep(0.36, 0.0, d);
      float head = smoothstep(0.05, 0.0, abs(d));
      vA = max(trail * 0.9, head);
      vH = head;
      gl_PointSize = uSize * (0.4 + 0.6 * trail + 0.9 * head);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `uniform float uAmt; uniform vec3 uCol; uniform vec3 uCore; varying float vA; varying float vH;
    void main(){
      float r = length(gl_PointCoord - 0.5);
      if (r > 0.5) discard;
      float a = smoothstep(0.5, 0.22, r) * vA * uAmt;
      if (a < 0.01) discard;
      gl_FragColor = vec4(mix(uCol, uCore, vH * smoothstep(0.4, 0.0, r)), a);
      #include <colorspace_fragment>
    }`,
});
let packets;
{
  const pos = new Float32Array(arcTargets.length * PK_N * 3);
  const ts = new Float32Array(arcTargets.length * PK_N);
  const v = new THREE.Vector3();
  let i = 0;
  arcTargets.forEach((t, k) => {
    for (let j = 0; j < PK_N; j++) {
      const f = j / (PK_N - 1);
      bez(hubTop, arcCtrl[k], t, f, v);
      pos.set([v.x, v.y, v.z], i * 3);
      ts[i++] = f;
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aT', new THREE.BufferAttribute(ts, 1));
  packets = new THREE.Points(g, pkMat);
  packets.frustumCulled = false;
  packets.renderOrder = 8;
  scene.add(packets);
}

/* ---------- glow points ---------- */
const glowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
function glowPoints(n, color, size) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  const m = new THREE.PointsMaterial({ map: glowTex, color, size, sizeAttenuation: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, opacity: 0 });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  p.renderOrder = 7;
  p.userData.base = size;
  scene.add(p);
  return p;
}
// street lamps along roads and the canal
const lampPos = [];
roads.forEach((r) => {
  for (let s = r.a + 0.6; s < r.b - 0.3; s += 1.9) {
    const x = r.axis === 'z' ? r.c + 0.42 : s, z = r.axis === 'z' ? s : r.c + 0.42;
    if (r.axis === 'z' && Math.abs(z) < 0.7) continue;
    lampPos.push([x, 0.42, z]);
  }
});
for (let x = -10.5; x < 13; x += 2.1) { lampPos.push([x, 0.4, 0.62], [x + 1.05, 0.4, -0.62]); }
const lamps = glowPoints(lampPos.length, '#ffc56e', 26);
lampPos.forEach((p, k) => lamps.geometry.attributes.position.setXYZ(k, ...p));
const lampDistrict = lampPos.map((p) => Math.hypot(p[0] + 4, p[2] + 4) < 4.0);
const headlights = glowPoints(40, '#fff0cc', 14);
const beaconGlow = glowPoints(beacons.length + 2, '#ffd98a', 64);
const arcHeads = glowPoints(arcTargets.length, '#c9f6ff', 16);

/* ---------- cars, bikes, boats, train ---------- */
const cars = [];
for (let k = 0; k < 40; k++) {
  const r = roads[k % roads.length];
  cars.push({ r, lane: R() < 0.5 ? -1 : 1, speed: 0.55 + R() * 0.6, ph: R() * 40, c: pick(R, ['#eee6d4', '#f2c14e', '#5b8def', '#3e4a61', '#9bc1a5', '#e9edf2', '#d9534f']) });
}
const carMesh = inst(boxBase(), MAT.inst(), cars.length);
cars.forEach((c, k) => carMesh.setColorAt(k, C(c.c)));
const bikes = [];
for (let k = 0; k < 26; k++) bikes.push({ side: k % 2 ? 1 : -1, speed: 0.22 + R() * 0.25, ph: R() * 30, c: pick(R, ['#2b3550', '#3a4a6b', '#e2574c', '#f2c14e', '#2b3550', '#5f8f6b']) });
const bikeMesh = inst(boxBase(), MAT.inst(), bikes.length);
bikes.forEach((b, k) => bikeMesh.setColorAt(k, C(b.c)));
const boats = [0, 1, 2].map((k) => ({ ph: k * 2.1, speed: 0.045 + k * 0.012 }));
const hullMesh = inst(boxBase(), MAT.wood, boats.length);
const cabinMesh = inst(boxBase(), MAT.white, boats.length);
const trainMesh = inst(boxBase(), MAT.white, 3);
const trainRoof = inst(boxBase(), std('#2f6fde'), 3);

/* ---------- birds ---------- */
const birdGeo = new THREE.BufferGeometry();
birdGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.06, 0, 0, -0.08, 0.3, 0, -0.02]), 3));
birdGeo.computeVertexNormals();
const birds = [];
for (let k = 0; k < 12; k++) birds.push({ rad: 9 + R() * 7, y: 5.5 + R() * 3, sp: (0.1 + R() * 0.08) * (k % 3 ? 1 : -1), ph: R() * 6.28, fl: R() * 6.28 });
const birdMesh = inst(birdGeo, new THREE.MeshBasicMaterial({ color: '#2e3446', side: THREE.DoubleSide }), birds.length * 2, false, false);

/* ---------- balloon ---------- */
const balloon = new THREE.Group();
{
  const env = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 12), std('#f2c14e', { flatShading: true }));
  env.scale.set(1, 1.15, 1);
  env.castShadow = true;
  balloon.add(env);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.81, 0.62, 0.32, 16, 1, true), std('#f7f2ea', { side: THREE.DoubleSide }));
  band.position.y = -0.38;
  balloon.add(band);
  const basket = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.26), MAT.wood);
  basket.position.y = -1.35;
  balloon.add(basket);
  scene.add(balloon);
}

/* ---------- clouds ---------- */
const clouds = [];
const puffs = [];
function addCloud(cx, cy, cz, n, scale, speed, storm = false) {
  const cl = { cx, cy, cz, speed, storm, puffs: [] };
  for (let k = 0; k < n; k++) {
    const p = { dx: (R() - 0.5) * 3.2 * scale, dy: (R() - 0.3) * 0.6 * scale, dz: (R() - 0.5) * 1.8 * scale, s: (0.6 + R() * 0.7) * scale, cl };
    cl.puffs.push(p);
    puffs.push(p);
  }
  clouds.push(cl);
}
for (let k = 0; k < 9; k++) addCloud(-45 + k * 11 + R() * 4, -9 - R() * 4, -20 + R() * 40, 6, 1.4 + R() * 0.8, 0.12 + R() * 0.1);
addCloud(-26, 4.5, -18, 5, 1.0, 0.1);
addCloud(16, 7, -30, 5, 1.2, 0.08);
addCloud(36, 1.5, 4, 5, 1.0, 0.1);
addCloud(-36, -2, 20, 5, 1.1, 0.12);
const cloudMat = std('#ffffff', { flatShading: true, roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.25 });
const cloudMesh = inst(new THREE.IcosahedronGeometry(1, 1), cloudMat, puffs.length, false, false);
// storm cloud over the western district
const STORM = { x: -4, y: 6.4, z: -4 };
const stormPuffs = [];
for (let k = 0; k < 16; k++) stormPuffs.push({ dx: (R() - 0.5) * 5.2, dy: (R() - 0.4) * 0.8, dz: (R() - 0.5) * 4.4, s: 0.7 + R() * 0.6, ph: R() * 6.28 });
const stormMesh = inst(new THREE.IcosahedronGeometry(1, 1), std('#6a7080', { flatShading: true, roughness: 1 }), stormPuffs.length, true, false);
const rainN = 320;
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rainN * 6), 3));
const rainSeed = Array.from({ length: rainN }, () => { const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 3.4; return [STORM.x + Math.cos(a) * r, STORM.z + Math.sin(a) * r, R()]; });
const rainMat = new THREE.LineBasicMaterial({ color: '#c8d8ee', transparent: true, opacity: 0, depthWrite: false });
const rain = new THREE.LineSegments(rainGeo, rainMat);
rain.frustumCulled = false;
scene.add(rain);
const boltGeo = new THREE.BufferGeometry();
boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
const boltMat = new THREE.LineBasicMaterial({ color: '#f4f7ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
const bolt = new THREE.Line(boltGeo, boltMat);
bolt.frustumCulled = false;
scene.add(bolt);
const ringMat = new THREE.MeshBasicMaterial({ color: '#a9f0ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 72), ringMat);
ring.rotation.x = -Math.PI / 2;
ring.position.set(STORM.x, 0.12, STORM.z);
scene.add(ring);
const district = [];
bodies.forEach((b, k) => { if (b.grp === 'main' && Math.hypot(b.x - STORM.x, b.z - STORM.z) < 3.7) district.push(k); });
district.sort((a, b) => Math.hypot(bodies[a].x - STORM.x, bodies[a].z - STORM.z) - Math.hypot(bodies[b].x - STORM.x, bodies[b].z - STORM.z));
const districtRank = new Map(district.map((k, i) => [k, i / district.length]));

/* ---------- stars (2D canvas, drawn once) ---------- */
const starCanvas = document.querySelector('.stars');
function drawStars() {
  const w = innerWidth, h = innerHeight;
  starCanvas.width = Math.round(w * DPR);
  starCanvas.height = Math.round(h * DPR);
  const x = starCanvas.getContext('2d');
  x.scale(DPR, DPR);
  const r = rng(99);
  const n = Math.round((w * h) / 5200);
  for (let k = 0; k < n; k++) {
    const sx = r() * w, sy = r() * h * 0.85, s = r() < 0.08 ? 1.6 : 0.5 + r() * 0.8;
    x.fillStyle = `rgba(255,255,255,${0.35 + r() * 0.6})`;
    x.beginPath();
    x.arc(sx, sy, s, 0, Math.PI * 2);
    x.fill();
  }
}

/* ---------- time of day ---------- */
const TOD = [
  { p: 0.0, top: '#a9cdee', bot: '#f8e6d2', sun: '#ffe2c0', si: 2.3, sa: -38, se: 24, hs: '#d8e8ff', hg: '#d4c3a6', hi: 1.35, night: 0, cloud: '#ffffff', wa: '#7dbedb', wb: '#e0f2f8' },
  { p: 0.28, top: '#7db4ea', bot: '#e2f0fa', sun: '#fff6ea', si: 2.7, sa: 10, se: 52, hs: '#dcebff', hg: '#cdbfa6', hi: 1.45, night: 0, cloud: '#ffffff', wa: '#6bb3d9', wb: '#dff3fb' },
  { p: 0.5, top: '#88a8d8', bot: '#f6cfa6', sun: '#ffd2a0', si: 2.5, sa: 62, se: 26, hs: '#e2ddf0', hg: '#d2b48e', hi: 1.25, night: 0.04, cloud: '#fff1e2', wa: '#76a9cc', wb: '#ffe2c4' },
  { p: 0.615, top: '#6370ac', bot: '#f0aa8c', sun: '#ffae85', si: 1.8, sa: 88, se: 13, hs: '#bcb6d8', hg: '#b08c78', hi: 1.0, night: 0.42, cloud: '#f2c7bc', wa: '#6d8db8', wb: '#f5bfa5' },
  { p: 0.74, top: '#2b3270', bot: '#9b7aa5', sun: '#c9b6ff', si: 0.8, sa: 120, se: 30, hs: '#7f86c2', hg: '#5d5470', hi: 0.8, night: 0.86, cloud: '#8e8db8', wa: '#3f5785', wb: '#9aa6d6' },
  { p: 0.88, top: '#0e1538', bot: '#2f3770', sun: '#afc0ff', si: 0.55, sa: 140, se: 40, hs: '#4e5a99', hg: '#2b2a44', hi: 0.6, night: 1, cloud: '#4a5285', wa: '#24346a', wb: '#5c6bb0' },
  { p: 1.0, top: '#0a1030', bot: '#252c60', sun: '#afc0ff', si: 0.5, sa: 150, se: 42, hs: '#46518e', hg: '#262640', hi: 0.55, night: 1, cloud: '#3f4677', wa: '#1f2d60', wb: '#56659f' },
];
TOD.forEach((t) => ['top', 'bot', 'sun', 'hs', 'hg', 'cloud', 'wa', 'wb'].forEach((k) => { t[k] = C(t[k]); }));
const tod = { top: new THREE.Color(), bot: new THREE.Color(), sun: new THREE.Color(), hs: new THREE.Color(), hg: new THREE.Color(), cloud: new THREE.Color(), wa: new THREE.Color(), wb: new THREE.Color() };
function sampleTOD(p) {
  let i = 0;
  while (i < TOD.length - 2 && p > TOD[i + 1].p) i++;
  const a = TOD[i], b = TOD[i + 1];
  const t = sstep(a.p, b.p, p);
  for (const k of ['top', 'bot', 'sun', 'hs', 'hg', 'cloud', 'wa', 'wb']) tod[k].copy(a[k]).lerp(b[k], t);
  for (const k of ['si', 'sa', 'se', 'hi', 'night']) tod[k] = lerp(a[k], b[k], t);
  return tod;
}

/* ---------- camera path ---------- */
// p: scroll position, t: subject, h: half height of the view, w: width that must fit, az/el in degrees,
// sx/sy: where the subject sits on screen on wide screens, msy: on tall screens
const KF = [
  { p: 0.0, t: [0.5, -3.2, 1], h: 16, w: 33, az: 45, el: 30, sx: 0.31, msy: -0.26 },
  { p: 0.055, t: [1, -2.4, 1], h: 14.2, w: 31, az: 41, el: 31, sx: 0.29, msy: -0.24 },
  { p: 0.135, t: [1.5, -0.6, 0], h: 10.2, w: 22, az: 34, el: 33, sx: 0.22, msy: -0.2, maz: 30 },
  { p: 0.215, t: [1, -0.4, 0], h: 11.2, w: 23, az: 29, el: 34, sx: 0.22, msy: -0.2, maz: 20 },
  { p: 0.295, t: [10.5, -2, -4.5], h: 17.5, w: 46, az: 38, el: 32, sx: 0.17, msy: -0.16, maz: -50, mt: [12, -1.5, -6], mw: 34 },
  { p: 0.36, t: [11, -2, -4.5], h: 18, w: 47, az: 43, el: 32, sx: 0.17, msy: -0.16, maz: -55, mt: [12, -1.5, -6], mw: 34 },
  { p: 0.425, t: [8, 0.6, -4], h: 12.6, w: 30, az: 55, el: 31, sx: 0.2, msy: -0.16, maz: -40, mt: [9, 0.6, -5], mw: 27 },
  { p: 0.48, t: [7.5, 0.6, -3.5], h: 13, w: 30, az: 59, el: 31, sx: 0.2, msy: -0.16, maz: -43, mt: [9, 0.6, -5], mw: 27 },
  { p: 0.545, t: [6, -1.2, -2.5], h: 18.5, w: 48, az: 50, el: 40, sx: 0.18, msy: -0.16, maz: -50, mt: [12, -1.2, -5], mw: 36 },
  { p: 0.605, t: [6, -1.2, -2.5], h: 19, w: 49, az: 46, el: 40, sx: 0.18, msy: -0.16, maz: -55, mt: [12, -1.2, -5], mw: 36 },
  { p: 0.668, t: [-3.6, 2.2, -3.6], h: 10.4, w: 20, az: 40, el: 30, sx: 0.22, msy: -0.14, maz: 15 },
  { p: 0.728, t: [-3.6, 2.2, -3.6], h: 11, w: 21, az: 35, el: 30, sx: 0.22, msy: -0.14, maz: 10 },
  { p: 0.792, t: [8, 0.1, 21], h: 7.6, w: 16, az: 28, el: 28, sx: 0.22, msy: -0.18 },
  { p: 0.85, t: [8.4, 0.1, 20.6], h: 8.2, w: 17, az: 24, el: 28, sx: 0.22, msy: -0.18 },
  { p: 0.935, t: [6, -3, -2], h: 25, w: 62, az: 40, el: 33, sx: 0.24, msy: 0.3, maz: -55, mt: [12, -3, -6], mw: 44 },
  { p: 1.0, t: [6, -3, -2], h: 27, w: 64, az: 44, el: 33, sx: 0.24, msy: 0.34, maz: -58, mt: [12, -3, -6], mw: 46 },
];
const cam = { t: new THREE.Vector3(), h: 10, w: 20, az: 45, el: 30, sx: 0, sy: 0 };
const camDir = new THREE.Vector3(), camRight = new THREE.Vector3(), camUp = new THREE.Vector3();
let W = innerWidth, H = innerHeight;
function sampleCam(p) {
  let i = 0;
  while (i < KF.length - 2 && p > KF[i + 1].p) i++;
  const a = KF[i], b = KF[i + 1];
  const t = sstep(a.p, b.p, p);
  const tall = W / H < 0.9;
  // tall screens get their own orbit so islands stack vertically instead of running off the sides
  const ta = tall && a.mt ? a.mt : a.t, tb = tall && b.mt ? b.mt : b.t;
  cam.t.set(lerp(ta[0], tb[0], t), lerp(ta[1], tb[1], t), lerp(ta[2], tb[2], t));
  cam.h = Math.exp(lerp(Math.log(a.h), Math.log(b.h), t));
  cam.w = lerp(tall && a.mw ? a.mw : a.w, tall && b.mw ? b.mw : b.w, t);
  cam.az = lerp(tall && a.maz !== undefined ? a.maz : a.az, tall && b.maz !== undefined ? b.maz : b.az, t);
  cam.el = lerp(a.el, b.el, t);
  cam.sx = tall ? 0 : lerp(a.sx, b.sx, t);
  cam.sy = tall ? lerp(a.msy, b.msy, t) : 0;
}
function applyCam() {
  const aspect = W / H;
  const tall = aspect < 0.9;
  let hh = cam.h;
  if (tall) hh = Math.max(hh * 1.05, (cam.w * 0.78) / (2 * aspect));
  const hw = hh * aspect;
  const az = THREE.MathUtils.degToRad(cam.az), el = THREE.MathUtils.degToRad(cam.el);
  camDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  camRight.set(Math.cos(az), 0, -Math.sin(az));
  camUp.crossVectors(camDir, camRight);
  const c = cam.t.clone().addScaledVector(camRight, -cam.sx * hw).addScaledVector(camUp, -cam.sy * hh);
  camera.position.copy(c).addScaledVector(camDir, 160);
  camera.up.set(0, 1, 0);
  camera.lookAt(c);
  camera.left = -hw; camera.right = hw; camera.top = hh; camera.bottom = -hh;
  camera.updateProjectionMatrix();
  return hh;
}

/* ---------- DOM hooks ---------- */
const skyEl = document.querySelector('.sky');
const sunEl = document.querySelector('.orb-sun');
const moonEl = document.querySelector('.orb-moon');
const caps = [...document.querySelectorAll('.cap')].map((el) => ({ el, win: el.dataset.win.split(',').map(Number) }));
const labels = Object.fromEntries([...document.querySelectorAll('.label')].map((el) => [el.dataset.label, el]));
const LABEL_POS = {
  azure: { at: [-2, 4.6, 4], win: [0.285, 0.305, 0.35, 0.372] },
  aws: { at: [27, 2.2, -9.5], win: [0.285, 0.305, 0.35, 0.372] },
  epam: { at: LANDMARK.epam, win: [0.775, 0.795, 0.85, 0.872] },
  bnp: { at: LANDMARK.bnp, win: [0.778, 0.798, 0.85, 0.872] },
  volksbank: { at: LANDMARK.volksbank, win: [0.781, 0.801, 0.85, 0.872] },
  ctac: { at: LANDMARK.ctac, win: [0.784, 0.804, 0.85, 0.872] },
};
const barName = document.querySelector('.bar-name');
const washEl = document.querySelector('.wash');
const rootStyle = document.documentElement.style;
const winWeight = (w, p) => (w[1] === 0 ? 1 : sstep(w[0], w[1], p)) * (1 - sstep(w[2], w[3], p));

/* ---------- per-frame world update ---------- */
const tmpV = new THREE.Vector3();
const tmpC = new THREE.Color();
const inkDay = C('#1d2742'), inkNight = C('#f4efe6'), inkC = new THREE.Color();
let lastSky = '';

function update(p, time, still) {
  U.time.value = time;
  const T = sampleTOD(p);

  /* storm amounts */
  const stormIn = sstep(0.612, 0.652, p), stormOut = sstep(0.7, 0.738, p);
  const storm = stormIn * (1 - stormOut);
  const flashCycle = (time * 0.75) % 3.3;
  const flash = !still && storm > 0.6 && (flashCycle < 0.07 || (flashCycle > 0.15 && flashCycle < 0.21)) ? 1 : 0;

  /* sky */
  const top = T.top.clone().lerp(C('#5d6372'), storm * 0.45);
  const bot = T.bot.clone().lerp(C('#8a8f9c'), storm * 0.4);
  if (flash) { top.lerp(C('#dfe6ff'), 0.5); bot.lerp(C('#eef2ff'), 0.4); }
  const sky = `linear-gradient(180deg, #${top.getHexString()} 0%, #${bot.getHexString()} 82%)`;
  if (sky !== lastSky) { skyEl.style.background = sky; lastSky = sky; }
  starCanvas.style.opacity = sstep(0.7, 0.9, p).toFixed(3);
  const sunP = sub(p, 0, 0.7);
  sunEl.style.opacity = ((1 - sstep(0.6, 0.7, p)) * (1 - storm * 0.8)).toFixed(3);
  sunEl.style.transform = `translate(${(lerp(0.5, 0.9, sunP) * W).toFixed(1)}px, ${(lerp(0.16, 0.66, sunP * sunP) * H).toFixed(1)}px)`;
  moonEl.style.opacity = sstep(0.74, 0.86, p).toFixed(3);
  moonEl.style.transform = `translate(${(0.56 * W).toFixed(1)}px, ${(lerp(0.3, 0.15, sub(p, 0.74, 1)) * H).toFixed(1)}px)`;

  /* light */
  hemi.color.copy(T.hs);
  hemi.groundColor.copy(T.hg);
  hemi.intensity = T.hi * (1 - storm * 0.35) + flash * 1.6;
  sun.color.copy(T.sun);
  sun.intensity = T.si * (1 - storm * 0.55);
  const sa = THREE.MathUtils.degToRad(T.sa), se = THREE.MathUtils.degToRad(T.se);
  sun.position.set(5 + Math.sin(sa) * Math.cos(se) * 90, Math.sin(se) * 90, -3 + Math.cos(sa) * Math.cos(se) * 90);
  U.night.value = T.night;
  cloudMat.color.copy(T.cloud);
  cloudMat.emissive.copy(T.cloud).multiplyScalar(0.28);
  waterMat.uniforms.uA.value.copy(T.wa);
  waterMat.uniforms.uB.value.copy(T.wb);
  fallMat.uniforms.uCol.value.copy(T.wb).lerp(C('#ffffff'), 0.35);

  /* ink colour for captions follows the light */
  const nightInk = sstep(0.625, 0.64, p);
  inkC.copy(inkDay).lerp(inkNight, nightInk);
  rootStyle.setProperty('--ink', `#${inkC.getHexString()}`);
  const halo = nightInk;
  rootStyle.setProperty('--halo', halo < 0.5 ? `rgba(255,250,242,${(0.6 * (1 - halo * 2)).toFixed(2)})` : `rgba(8,12,36,${(0.6 * (halo * 2 - 1)).toFixed(2)})`);

  /* camera */
  sampleCam(p);
  const hh = applyCam();
  const zoom = clamp(12 / hh, 0.35, 1.6);

  /* survey + flag */
  surveyMat.opacity = 0.85 * (1 - sub(p, 0.07, 0.112));
  const flagS = 1 - easeOutCubic(sub(p, 0.098, 0.125));
  flag.scale.setScalar(Math.max(0.0001, flagS));
  if (!still || p < 0.1) {
    const cloth = flag.userData.cloth.geometry.attributes.position;
    const base = flag.userData.base;
    for (let k = 0; k < cloth.count; k++) {
      const x = base[k * 3];
      cloth.setZ(k, Math.sin(x * 7 - time * 4) * 0.06 * x);
    }
    cloth.needsUpdate = true;
  }

  /* roads */
  const roadT = sub(p, 0.068, 0.112);
  roads.forEach((r, k) => {
    const l = easeOutCubic(sub(roadT, k * 0.05, k * 0.05 + 0.55));
    const len = (r.b - r.a) * l, mid = (r.a + r.b) / 2;
    if (r.axis === 'z') setTRS(roadMesh, k, r.c, 0, mid, 0.62 * (l > 0 ? 1 : 0), 0.04 + k * 0.0012, Math.max(0.0001, len));
    else setTRS(roadMesh, k, mid, 0, r.c, Math.max(0.0001, len), 0.036 + k * 0.0012, 0.62 * (l > 0 ? 1 : 0));
  });
  roadMesh.instanceMatrix.needsUpdate = true;

  /* tiles drop in like modules, then clusters rise */
  const tMain = sub(p, 0.085, 0.165), tAws = sub(p, 0.262, 0.302);
  const gMain = sub(p, 0.112, 0.222), gAws = sub(p, 0.272, 0.335);
  tiles.forEach((t, k) => {
    const tt = t.grp === 'aws' ? tAws : tMain;
    const l = sub(tt, t.o * 0.72, t.o * 0.72 + 0.28);
    const drop = (1 - easeOutBack(l)) * 3.2;
    const s = l > 0 ? 0.96 : 0.0001;
    setTRS(tileMesh, k, t.x, t.y + drop, t.z, s, 0.06, s);
  });
  tileMesh.instanceMatrix.needsUpdate = true;

  /* GitOps wave */
  const arcAmt = sstep(0.39, 0.415, p) * (1 - sstep(0.488, 0.51, p));
  const wave = still ? 0.72 : ((time / 2.3) % 1) * 1.45;
  arcMat.uniforms.uHead.value = wave;
  arcMat.uniforms.uAmt.value = arcAmt;
  arcLines.visible = packets.visible = arcAmt > 0.001;
  const arrive = still ? 0 : clamp(1 - Math.abs(wave - 1.04) / 0.09) * arcAmt;

  /* outage + recovery in the storm district */
  const out = sstep(0.648, 0.658, p);
  let litDirty = false;
  let colorDirty = false;
  const rise = [];
  bodies.forEach((b, k) => {
    let r = 1;
    if (b.grp === 'main' || b.grp === 'hub') r = easeOutBack(sub(gMain, b.o * 0.72, b.o * 0.72 + 0.28));
    else if (b.grp === 'aws') r = easeOutBack(sub(gAws, b.o * 0.6, b.o * 0.6 + 0.4));
    rise[k] = r;
    const fw = r <= 0 ? 0.0001 : Math.min(1, r * 3);
    setTRS(bodyMesh, k, b.x, b.y, b.z, b.w * fw, Math.max(0.0001, b.h * r), b.d * fw);
    let lit = 1;
    if (districtRank.has(k)) {
      const o = districtRank.get(k);
      lit = 1 - out * (1 - sstep(0.682 + o * 0.016, 0.687 + o * 0.016, p));
    }
    if (litAttr.array[k] !== lit) {
      litAttr.array[k] = lit;
      litDirty = true;
      bodyMesh.setColorAt(k, tmpC.set(b.color).multiplyScalar(0.3 + 0.7 * lit));
      colorDirty = true;
    }
  });
  bodyMesh.instanceMatrix.needsUpdate = true;
  if (litDirty) litAttr.needsUpdate = true;
  if (colorDirty) bodyMesh.instanceColor.needsUpdate = true;

  pyrList.forEach((k, i) => {
    const b = bodies[k], r = rise[k];
    const fw = r <= 0 ? 0.0001 : Math.min(1, r * 3);
    setTRS(pyrMesh, i, b.x, b.y + b.h * r, b.z, b.w * 1.06 * fw, Math.max(0.0001, b.roofH * clamp(r)), b.d * 1.06 * fw);
    pulseP.array[i] = b.grp === 'old' ? 0 : arrive;
  });
  flatList.forEach((k, i) => {
    const b = bodies[k], r = rise[k];
    const fw = r <= 0 ? 0.0001 : Math.min(1, r * 3);
    setTRS(flatMesh, i, b.x, b.y + b.h * r, b.z, b.w * 1.04 * fw, Math.max(0.0001, (b.roofH || 0.08) * clamp(r)), b.d * 1.04 * fw);
    pulseF.array[i] = b.grp === 'old' ? 0 : (b.grp === 'hub' ? arcAmt * 0.6 : arrive);
  });
  unitList.forEach((k, i) => {
    const b = bodies[k], r = rise[k];
    const s = r > 0.95 ? 1 : 0.0001;
    setTRS(unitMesh, i, b.x + unitOff[i][0], b.y + b.h * r + 0.08, b.z + unitOff[i][1], 0.24 * s, 0.14 * s, 0.2 * s);
  });
  pyrMesh.instanceMatrix.needsUpdate = flatMesh.instanceMatrix.needsUpdate = unitMesh.instanceMatrix.needsUpdate = true;
  pulseP.needsUpdate = pulseF.needsUpdate = true;

  /* arc heads */
  const hp = arcHeads.geometry.attributes.position;
  const ht = clamp(wave);
  arcTargets.forEach((t, k) => { bez(hubTop, arcCtrl[k], t, ht, tmpV); hp.setXYZ(k, tmpV.x, tmpV.y, tmpV.z); });
  hp.needsUpdate = true;
  arcHeads.material.opacity = arcAmt * (wave <= 1 ? 1 : 0);

  /* bridge grows out to the AWS island */
  const br = easeOutCubic(sub(p, 0.248, 0.29));
  bridge.scale.set(Math.max(0.0001, br), 1, 1);

  /* walls, beacons, shield */
  const pw = sub(p, 0.492, 0.575);
  wallSegs.forEach((s, k) => {
    const r = easeOutCubic(sub(pw, s.o * 0.8, s.o * 0.8 + 0.2));
    const h = (s.post ? 0.5 : 0.3) * r;
    setTRS(wallMesh, k, s.x, s.y, s.z, s.len * (r > 0 ? 1.04 : 0.0001), Math.max(0.0001, h), s.post ? 0.22 : 0.13, s.ang);
  });
  wallMesh.instanceMatrix.needsUpdate = true;
  const bg = beaconGlow.geometry.attributes.position;
  beacons.forEach((b, k) => {
    const r = easeOutCubic(sub(pw, 0.2 + b.o * 0.6, 0.35 + b.o * 0.6));
    const h = b.gate ? 1.0 : 1.3;
    setTRS(poleMesh, k, b.x, b.y, b.z, 1, Math.max(0.0001, h * r), 1);
    setTRS(lampMesh, k, b.x, b.y + h * r + 0.1, b.z, r || 0.0001, r || 0.0001, r || 0.0001);
    bg.setXYZ(k, b.x, b.y + h * r + 0.1, b.z);
  });
  bg.setXYZ(beacons.length, hubTop.x, hubTop.y + 0.1, hubTop.z);
  bg.setXYZ(beacons.length + 1, CTAC[0], OY + 2.78 + 0.82, CTAC[1]);
  const bcol = beaconGlow.geometry.attributes.color;
  bcol.setXYZ(beacons.length + 1, 1, 0.35, 0.3);
  bcol.needsUpdate = true;
  bg.needsUpdate = true;
  poleMesh.instanceMatrix.needsUpdate = lampMesh.instanceMatrix.needsUpdate = true;
  const wallsUp = sstep(0.53, 0.57, p);
  beaconGlow.material.opacity = Math.max(wallsUp * (0.55 + 0.45 * T.night), sstep(0.12, 0.2, p) * 0.35 + T.night * 0.5) * (still ? 1 : 0.85 + 0.15 * Math.sin(time * 3));
  const domeAmt = sstep(0.51, 0.55, p) * (1 - 0.82 * sstep(0.6, 0.64, p)) * (1 - sstep(0.86, 0.92, p) * 0.6);
  domeMat.uniforms.uAmt.value = domeAmt;
  domes.forEach((d) => { d.visible = domeAmt > 0.001; });

  /* storm */
  stormPuffs.forEach((s, k) => {
    const ox = lerp(-24, 0, stormIn) + stormOut * 26, oz = lerp(24, 0, stormIn) - stormOut * 26;
    const vis = stormIn > 0 && stormOut < 1 ? 1 : 0.0001;
    const breathe = 1 + (still ? 0 : Math.sin(time * 0.8 + s.ph) * 0.05);
    setTRS(stormMesh, k, STORM.x + s.dx + ox, STORM.y + s.dy, STORM.z + s.dz + oz, s.s * vis * breathe, s.s * 0.62 * vis * breathe, s.s * vis * breathe);
  });
  stormMesh.instanceMatrix.needsUpdate = true;
  rainMat.opacity = sstep(0.64, 0.655, p) * (1 - sstep(0.69, 0.705, p)) * 0.75;
  if (rainMat.opacity > 0) {
    const rp = rain.geometry.attributes.position;
    rainSeed.forEach(([x, z, ph], k) => {
      const y = 5.6 - ((ph + (still ? 0.3 : time * 1.7)) % 1) * 5.6;
      rp.setXYZ(k * 2, x, y + 0.34, z);
      rp.setXYZ(k * 2 + 1, x + 0.05, y, z - 0.05);
    });
    rp.needsUpdate = true;
  }
  boltMat.opacity = flash * rainMat.opacity > 0 ? 1 : 0;
  if (boltMat.opacity) {
    const bp = bolt.geometry.attributes.position;
    const seed = Math.floor(time * 0.75 / 3.3);
    const r = rng(seed + 5);
    const target = bodies[district[Math.floor(r() * district.length)]];
    const x0 = STORM.x + (r() - 0.5) * 2, z0 = STORM.z + (r() - 0.5) * 2;
    for (let k = 0; k < 16; k++) {
      const f = k / 15;
      const j = k === 0 || k === 15 ? 0 : (r() - 0.5) * 0.5;
      bp.setXYZ(k, lerp(x0, target.x, f) + j, lerp(STORM.y - 0.4, target.y + target.h + 0.3, f), lerp(z0, target.z, f) + j);
    }
    bp.needsUpdate = true;
  }
  const rr = sub(p, 0.68, 0.712);
  ringMat.opacity = Math.sin(rr * Math.PI) * 0.9;
  ring.scale.setScalar(0.4 + rr * 7.5);

  /* night lights */
  const lc = lamps.geometry.attributes.color;
  lampDistrict.forEach((d, k) => { const v = d ? 1 - out * (1 - sstep(0.684, 0.7, p)) : 1; lc.setXYZ(k, v, v, v); });
  lc.needsUpdate = true;
  lamps.material.opacity = sstep(0.25, 0.75, T.night) * sstep(0.08, 0.12, p);

  /* ambient life */
  const roadsDone = sub(p, 0.1, 0.125);
  const hl = headlights.geometry.attributes.position;
  cars.forEach((c, k) => {
    const r = c.r, L = r.b - r.a - 0.4;
    let s = ((c.ph + time * c.speed * c.lane) % L + L) % L;
    const along = r.a + 0.2 + s;
    const off = c.lane * 0.15;
    const x = r.axis === 'z' ? r.c + off : along, z = r.axis === 'z' ? along : r.c + off;
    const ang = r.axis === 'z' ? (c.lane > 0 ? 0 : Math.PI) : (c.lane > 0 ? Math.PI / 2 : -Math.PI / 2);
    const v = roadsDone > 0 ? roadsDone : 0.0001;
    setTRS(carMesh, k, x, 0.045, z, 0.16 * v, 0.14 * v, 0.32 * v, ang);
    const fx = r.axis === 'z' ? 0 : c.lane * 0.18, fz = r.axis === 'z' ? c.lane * 0.18 : 0;
    hl.setXYZ(k, x + fx, 0.12, z + fz);
  });
  carMesh.instanceMatrix.needsUpdate = true;
  hl.needsUpdate = true;
  headlights.material.opacity = sstep(0.4, 0.8, T.night) * roadsDone;

  bikes.forEach((b, k) => {
    const L = 22.5;
    const s = ((b.ph + time * b.speed * b.side) % L + L) % L;
    setTRS(bikeMesh, k, -10.5 + s, 0.1, b.side * (CANAL.w / 2 + 0.07), 0.16, 0.13, 0.05, b.side > 0 ? 0 : Math.PI);
  });
  bikeMesh.instanceMatrix.needsUpdate = true;
  boats.forEach((b, k) => {
    const ph = time * b.speed * Math.PI * 2 + b.ph;
    const x = -9.5 + (1 - Math.cos(ph)) * 0.5 * 21;
    const dir = Math.sin(ph) >= 0 ? 0 : Math.PI;
    setTRS(hullMesh, k, x, 0.02, 0, 0.58, 0.09, 0.3, dir);
    setTRS(cabinMesh, k, x - (dir ? -0.08 : 0.08), 0.11, 0, 0.22, 0.11, 0.22, dir);
  });
  hullMesh.instanceMatrix.needsUpdate = cabinMesh.instanceMatrix.needsUpdate = true;
  {
    const u = 0.5 - 0.5 * Math.cos(time * 0.32);
    const x0 = BRIDGE.x0 - 1.2, x1 = BRIDGE.x1 + 1.2;
    const vis = br > 0.98 ? 1 : 0.0001;
    for (let k = 0; k < 3; k++) {
      const x = lerp(x0, x1 - 1.6, u) + k * 0.54;
      const f = clamp((x - BRIDGE.x0) / (BRIDGE.x1 - BRIDGE.x0));
      const y = lerp(BRIDGE.y0, BRIDGE.y1, f) + 0.04;
      const tilt = x > BRIDGE.x0 && x < BRIDGE.x1 ? Math.atan2(BRIDGE.y1 - BRIDGE.y0, BRIDGE.x1 - BRIDGE.x0) : 0;
      setTRS(trainMesh, k, x, y, BRIDGE.z, 0.5 * vis, 0.2 * vis, 0.2 * vis, 0, 0, tilt);
      setTRS(trainRoof, k, x, y + 0.2 * vis, BRIDGE.z, 0.5 * vis, 0.04 * vis, 0.22 * vis, 0, 0, tilt);
    }
    trainMesh.instanceMatrix.needsUpdate = trainRoof.instanceMatrix.needsUpdate = true;
  }

  const birdsOn = 1 - sstep(0.74, 0.82, p);
  birds.forEach((b, k) => {
    const a = b.ph + time * b.sp;
    const x = 2 + Math.cos(a) * b.rad, z = -1 + Math.sin(a) * b.rad * 0.8;
    const y = b.y + Math.sin(time * 0.7 + b.ph) * 0.3;
    const heading = Math.atan2(-Math.sin(a) * Math.sign(b.sp), Math.cos(a) * Math.sign(b.sp) * 0.8);
    const flap = Math.sin(time * 9 + b.fl) * 0.7;
    const s = birdsOn > 0.01 ? 1.2 * birdsOn : 0.0001;
    setTRS(birdMesh, k * 2, x, y, z, s, s, s, heading, 0, flap);
    setTRS(birdMesh, k * 2 + 1, x, y, z, -s, s, s, heading, 0, -flap);
  });
  birdMesh.instanceMatrix.needsUpdate = true;

  balloon.position.set(lerp(-26, 2, p) + Math.sin(time * 0.1) * 0.4, -1.0 + Math.sin(time * 0.35) * 0.25, -22);
  balloon.scale.setScalar(p < 0.7 ? 1 : Math.max(0.0001, 1 - sub(p, 0.7, 0.76)));

  puffs.forEach((pf, k) => {
    const cl = pf.cl;
    let x = cl.cx + time * cl.speed;
    x = ((x + 60) % 120 + 120) % 120 - 60;
    const breathe = 1 + Math.sin(time * 0.3 + k) * 0.03;
    setTRS(cloudMesh, k, x + pf.dx, cl.cy + pf.dy, cl.cz + pf.dz, pf.s * breathe, pf.s * 0.7 * breathe, pf.s * breathe);
  });
  cloudMesh.instanceMatrix.needsUpdate = true;

  roundTrees.forEach((t, i) => {
    const sway = still ? 0 : Math.sin(time * 1.2 + t.ph) * 0.05;
    setTRS(roundMesh, i, t.x + sway * 0.4, t.y + 0.42 * t.s + 0.26 * t.s, t.z, 0.32 * t.s, 0.34 * t.s, 0.32 * t.s, t.ph);
  });
  poplarTrees.forEach((t, i) => {
    const sway = still ? 0 : Math.sin(time * 1.2 + t.ph) * 0.05;
    setTRS(poplarMesh, i, t.x, t.y + 0.3 * t.s, t.z, 0.2 * t.s, 1.1 * t.s, 0.2 * t.s, 0, sway, sway * 0.5);
  });
  roundMesh.instanceMatrix.needsUpdate = poplarMesh.instanceMatrix.needsUpdate = true;

  millBlades.rotation.z = still ? 0.4 : -time * 0.9;

  /* glow sizes follow the zoom */
  lamps.material.size = lamps.userData.base * DPR * zoom;
  headlights.material.size = headlights.userData.base * DPR * zoom;
  beaconGlow.material.size = beaconGlow.userData.base * DPR * zoom;
  arcHeads.material.size = arcHeads.userData.base * DPR * Math.max(0.8, zoom);
  pkMat.uniforms.uSize.value = 6.5 * DPR * clamp(zoom, 0.8, 1.3);

  /* captions and labels */
  let capMax = 0;
  caps.forEach((c, i) => {
    const o = winWeight(c.win, p);
    if (i > 0) capMax = Math.max(capMax, o);
    c.el.style.opacity = o.toFixed(3);
    c.el.style.visibility = o < 0.01 ? 'hidden' : 'visible';
    c.el.style.filter = o > 0.99 || o < 0.01 ? 'none' : `blur(${((1 - o) * 5).toFixed(1)}px)`;
  });
  barName.classList.toggle('on', p > 0.06 && p < 0.9);
  const washC = top.clone().lerp(bot, 0.45);
  rootStyle.setProperty('--wash', `rgba(${Math.round(washC.r * 255)},${Math.round(washC.g * 255)},${Math.round(washC.b * 255)},0.78)`);
  washEl.style.opacity = capMax.toFixed(3);
  for (const [k, el] of Object.entries(labels)) {
    const L = LABEL_POS[k];
    const o = winWeight(L.win, p);
    if (o < 0.01) { el.style.opacity = '0'; continue; }
    tmpV.set(...L.at).project(camera);
    const x = clamp((tmpV.x * 0.5 + 0.5) * W, 56, W - 56), y = (-tmpV.y * 0.5 + 0.5) * H;
    el.style.opacity = o.toFixed(3);
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
  }
}

/* ---------- static matrices that never change ---------- */
gableMesh.instanceMatrix.needsUpdate = true;
colMesh.instanceMatrix.needsUpdate = true;

/* ---------- resize ---------- */
function resize() {
  W = innerWidth;
  H = innerHeight;
  renderer.setSize(W, H, false);
  drawStars();
  needsRender = true;
}
let needsRender = true;
addEventListener('resize', resize);

/* ---------- scroll ---------- */
let lenis = null;
if (!REDUCE && window.Lenis) {
  lenis = new window.Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.9 });
}
const readScroll = () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  return max > 0 ? clamp(scrollY / max) : 0;
};

/* reduced motion: calm still frames, one per scene */
const STILLS = [0.02, 0.2, 0.33, 0.45, 0.59, 0.676, 0.83, 0.98];
const STILL_EDGES = [0.085, 0.25, 0.385, 0.51, 0.635, 0.755, 0.88];
const stillIndex = (p) => { let i = 0; while (i < STILL_EDGES.length && p > STILL_EDGES[i]) i++; return i; };

/* ---------- main loop ---------- */
let pView = readScroll();
let last = performance.now();
let elapsed = 8;
let shownStill = -1;
let firstFrame = true;
const loader = document.querySelector('.loader');

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (lenis) lenis.raf(now);
  if (document.hidden) return;
  const pTarget = readScroll();

  if (REDUCE) {
    const idx = stillIndex(pTarget);
    if (idx === shownStill && !needsRender) return;
    const swap = () => {
      update(STILLS[idx], 8, true);
      renderer.render(scene, camera);
      canvas.classList.remove('dip');
    };
    if (shownStill >= 0 && idx !== shownStill) {
      canvas.classList.add('dip');
      setTimeout(swap, 260);
    } else swap();
    shownStill = idx;
    needsRender = false;
  } else {
    pView += (pTarget - pView) * (1 - Math.exp(-dt * 7));
    if (Math.abs(pTarget - pView) < 0.00005) pView = pTarget;
    elapsed += dt;
    update(pView, elapsed, false);
    renderer.render(scene, camera);
  }
  if (firstFrame) {
    firstFrame = false;
    const reveal = () => loader.classList.add('done');
    Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise((r) => setTimeout(r, 1500))]).then(() => setTimeout(reveal, 150));
  }
}
resize();
requestAnimationFrame(frame);
if (location.search.includes('debug')) window.__v6 = { camera, bodies, district, litAttr, THREE, setP: (p) => { pView = p; }, getP: () => pView };
