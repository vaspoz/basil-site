import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ======================================================================
   Harbor: one scroll = one day in a port, dawn to night.
   ====================================================================== */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
const fogEl = $('#fog');
const reduceMQ = matchMedia('(prefers-reduced-motion: reduce)');
let reduce = reduceMQ.matches;
const small = matchMedia('(max-width: 760px)').matches;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20151101);
const R = (a, b) => a + (b - a) * rnd();

/* ---------- renderer ---------- */
const canvas = $('#world');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  if (!renderer.getContext()) throw new Error('no context');
} catch (err) {
  root.classList.add('no-webgl');
  fogEl?.remove();
  throw err;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd8c3b6, 60, 800);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.5, 3200);

/* ---------- geometry helpers ---------- */
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler();
const Z = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);
const _white = new THREE.Color(1, 1, 1);

function prep(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new THREE.Color(color ?? 0xffffff);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function box(w, h, d, color, x = 0, y = 0, z = 0, ry = 0) {
  const g = prep(new THREE.BoxGeometry(w, h, d), color);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}
function cyl(rt, rb, h, seg, color, x = 0, y = 0, z = 0, open = false) {
  const g = prep(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), color);
  g.translate(x, y, z);
  return g;
}
function beam(a, b, t, color) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const g = prep(new THREE.BoxGeometry(t, t, A.distanceTo(B)), color);
  _q.setFromUnitVectors(Z, B.clone().sub(A).normalize());
  _m.compose(A.clone().add(B).multiplyScalar(0.5), _q, _s.set(1, 1, 1));
  g.applyMatrix4(_m);
  return g;
}
const merge = (list) => mergeGeometries(list);
const matVC = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

function instanced(geo, mat, count, { cast = true, receive = true } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, count);
  m.castShadow = cast;
  m.receiveShadow = receive;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(m);
  return m;
}
function setInst(mesh, i, x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1, roll = 0, pitch = 0) {
  _e.set(pitch, yaw, roll, 'YXZ');
  _q.setFromEuler(_e);
  _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
  mesh.setMatrixAt(i, _m);
}

/* ---------- time of day ---------- */
const TOD = [
  { p: 0.00, top: '#7c90ad', hor: '#efc6ad', bot: '#cdb5a8', fog: '#d9c2b4', sun: '#ffbf88', sunI: 1.7, sky: '#c9cbd8', gnd: '#6f625c', hemiI: 1.05, deep: '#3c4b5e', dir: [1, 0.07, -0.32], night: 0, mist: 1, sunVis: 1, moonVis: 0, fogN: 30, fogF: 720 },
  { p: 0.16, top: '#5c86b4', hor: '#d9e0e2', bot: '#b9c7cf', fog: '#c9d5db', sun: '#ffe6c9', sunI: 2.3, sky: '#d5e2ee', gnd: '#6e6a62', hemiI: 1.1, deep: '#2c4a63', dir: [0.75, 0.45, -0.5], night: 0, mist: 0.3, sunVis: 1, moonVis: 0, fogN: 60, fogF: 850 },
  { p: 0.42, top: '#3a6fa8', hor: '#c3d7e4', bot: '#adc1cf', fog: '#b9cbd8', sun: '#fff5e6', sunI: 2.6, sky: '#dce8f4', gnd: '#6e6a62', hemiI: 1.15, deep: '#22435e', dir: [0.15, 0.88, -0.45], night: 0, mist: 0, sunVis: 1, moonVis: 0, fogN: 70, fogF: 900 },
  { p: 0.60, top: '#3d5f8f', hor: '#ecc38c', bot: '#c9a27c', fog: '#d8b891', sun: '#ffbf72', sunI: 2.2, sky: '#e6d4be', gnd: '#5e5148', hemiI: 0.95, deep: '#2a3d55', dir: [-0.35, 0.28, -0.9], night: 0, mist: 0, sunVis: 1, moonVis: 0, fogN: 90, fogF: 1000 },
  { p: 0.71, top: '#2a3767', hor: '#ea854c', bot: '#8a5a55', fog: '#a76b5b', sun: '#ff8846', sunI: 1.3, sky: '#b88c8c', gnd: '#3e3340', hemiI: 0.7, deep: '#272c46', dir: [-0.55, 0.035, -0.83], night: 0.32, mist: 0.15, sunVis: 1, moonVis: 0.25, fogN: 70, fogF: 950 },
  { p: 0.83, top: '#131b40', hor: '#4a4470', bot: '#2a2848', fog: '#2d2d50', sun: '#8a97d6', sunI: 0.38, sky: '#4e5784', gnd: '#1c1a2a', hemiI: 0.5, deep: '#131a33', dir: [-0.8, 0.3, -0.5], night: 0.8, mist: 0.08, sunVis: 0, moonVis: 1, fogN: 90, fogF: 1100 },
  { p: 1.00, top: '#050a1b', hor: '#1b2347', bot: '#0d1127', fog: '#131a35', sun: '#8fa6e0', sunI: 0.3, sky: '#36406a', gnd: '#0e0e18', hemiI: 0.42, deep: '#0a1026', dir: [-0.8, 0.3, -0.5], night: 1, mist: 0.04, sunVis: 0, moonVis: 1, fogN: 140, fogF: 1250 },
];
const COLS = ['top', 'hor', 'bot', 'fog', 'sun', 'sky', 'gnd', 'deep'];
const NUMS = ['sunI', 'hemiI', 'night', 'mist', 'sunVis', 'moonVis', 'fogN', 'fogF'];
for (const k of TOD) { for (const c of COLS) k[c] = new THREE.Color(k[c]); k.fog = k.hor.clone(); k.dir = new THREE.Vector3(...k.dir).normalize(); }
const env = { dir: new THREE.Vector3() };
for (const c of COLS) env[c] = new THREE.Color();
function sampleTOD(p) {
  let i = 0;
  while (i < TOD.length - 2 && p > TOD[i + 1].p) i++;
  const a = TOD[i], b = TOD[i + 1];
  const t = smooth(clamp((p - a.p) / (b.p - a.p)));
  for (const c of COLS) env[c].copy(a[c]).lerp(b[c], t);
  for (const n of NUMS) env[n] = lerp(a[n], b[n], t);
  env.dir.copy(a.dir).lerp(b.dir, t).normalize();
  return env;
}

/* ---------- sky ---------- */
const skyU = {
  uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uBot: { value: new THREE.Color() },
  uSun: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uSunVis: { value: 1 },
  uMoon: { value: new THREE.Vector3(-0.78, 0.3, -0.55).normalize() }, uMoonVis: { value: 0 },
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1500, 32, 16),
  new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uTop, uHor, uBot, uSun, uSunCol, uMoon; uniform float uSunVis, uMoonVis;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        float th = smoothstep(-0.01, 0.7, h);
        vec3 col = mix(uHor, uTop, pow(th, 0.85));
        float s = max(dot(d, uSun), 0.0);
        col += uSunCol * (pow(s, 6.0) * 0.28 + pow(s, 60.0) * 0.45) * uSunVis;
        col = mix(col, uSunCol * 1.15 + 0.15, smoothstep(0.99935, 0.9996, s) * uSunVis);
        float m = max(dot(d, uMoon), 0.0);
        col += vec3(0.45, 0.5, 0.7) * pow(m, 90.0) * 0.25 * uMoonVis;
        col = mix(col, vec3(0.92, 0.93, 0.98), smoothstep(0.99955, 0.9997, m) * uMoonVis);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  })
);
sky.renderOrder = -10;
scene.add(sky);

const starGeo = new THREE.BufferGeometry();
{
  const n = 1400, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const th = R(0, Math.PI * 2), y = Math.pow(R(0.03, 1), 0.7);
    const r = Math.sqrt(1 - y * y);
    a[i * 3] = Math.cos(th) * r * 1400; a[i * 3 + 1] = y * 1400; a[i * 3 + 2] = Math.sin(th) * r * 1400;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(a, 3));
}
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
scene.add(stars);

/* ---------- lights ---------- */
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -95, right: 95, top: 95, bottom: -95, near: 1, far: 520 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.35;
scene.add(sun, sun.target);

/* ---------- water ---------- */
const waterU = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
  uTime: { value: 0 }, uDeep: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uTop: { value: new THREE.Color() },
  uSun: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uSunI: { value: 1 }, uNight: { value: 0 }, uAmp: { value: 1 },
}]);
const WAVE = /* glsl */`
  float wave(vec2 p, float t) {
    float h = 0.0;
    h += sin(dot(p, vec2(0.071, 0.043)) + t * 0.85) * 0.26;
    h += sin(dot(p, vec2(-0.052, 0.097)) + t * 1.25) * 0.17;
    h += sin(dot(p, vec2(0.14, -0.066)) + t * 1.85) * 0.09;
    h += sin(dot(p, vec2(-0.2, -0.16)) + t * 2.5) * 0.05;
    return h;
  }`;
const waterSize = 760, waterSeg = small ? 120 : 190;
const waterGeo = new THREE.PlaneGeometry(waterSize, waterSize, waterSeg, waterSeg).rotateX(-Math.PI / 2);
const waterMat = new THREE.ShaderMaterial({
  uniforms: waterU, fog: true,
  vertexShader: /* glsl */`
    uniform float uTime, uAmp; varying vec3 vW;
    #include <fog_pars_vertex>
    ${WAVE}
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      w.y += wave(w.xz, uTime) * uAmp;
      vW = w.xyz;
      vec4 mvPosition = viewMatrix * w;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uDeep, uHor, uTop, uSun, uSunCol; uniform float uSunI, uNight;
    varying vec3 vW;
    #include <fog_pars_fragment>
    void main() {
      vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
      if (n.y < 0.0) n = -n;
      vec3 v = normalize(cameraPosition - vW);
      float ndv = max(dot(n, v), 0.0);
      float fres = pow(1.0 - ndv, 4.0);
      vec3 r = reflect(-v, n);
      vec3 skyR = mix(uHor, uTop, clamp(r.y * 1.6, 0.0, 1.0));
      vec3 col = mix(uDeep, skyR, 0.12 + 0.7 * fres);
      float diff = max(dot(n, uSun), 0.0);
      col *= 0.82 + 0.3 * diff;
      float spec = pow(max(dot(r, uSun), 0.0), 220.0);
      float low = 1.0 - smoothstep(0.15, 0.6, uSun.y);
      col += uSunCol * spec * (0.35 + 1.1 * low);
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`,
});
const water = new THREE.Mesh(waterGeo, waterMat);
scene.add(water);
// flat water out to the horizon, just under the waves
const farU = { ...waterU, uAmp: { value: 0 } };
const farWater = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000, 8, 8).rotateX(-Math.PI / 2), Object.assign(waterMat.clone(), { uniforms: farU }));
farWater.position.y = -0.8;
scene.add(farWater);

/* ---------- glows and their reflections ---------- */
const glowU = { uTime: { value: 0 }, uNight: { value: 0 }, uFogNear: { value: 60 }, uFogFar: { value: 900 } };
const GLOW_I = /* glsl */`
  uniform float uTime, uNight;
  float glowI(float kind, float ph) {
    if (kind < 0.5) return smoothstep(ph, ph + 0.12, uNight);
    if (kind < 1.5) return (0.18 + 0.82 * step(0.55, fract(uTime * 0.55 + ph))) * (0.25 + 0.75 * smoothstep(0.1, 0.5, uNight));
    if (kind < 2.5) {
      float per = 3.0 + ph * 2.0;
      float f = fract((uTime + ph * 11.0) / per);
      float fl = smoothstep(0.0, 0.02, f) * (1.0 - smoothstep(0.07, 0.18, f));
      return (0.14 + fl) * (0.35 + 0.65 * smoothstep(0.0, 0.4, uNight));
    }
    if (kind < 3.5) { float f = fract(uTime / 2.2); return (0.12 + 0.88 * (1.0 - smoothstep(0.0, 0.4, f))) * (0.3 + 0.7 * smoothstep(0.1, 0.5, uNight)); }
    return smoothstep(0.05, 0.45, uNight + ph);
  }`;
function glowSystem(max, reflection) {
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.attributes.position);
  const attr = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
  const aPos = attr(3), aCol = attr(3), aSize = attr(1), aKind = attr(1), aPhase = attr(1);
  Object.entries({ aPos, aCol, aSize, aKind, aPhase }).forEach(([k, a]) => g.setAttribute(k, a));
  g.instanceCount = 0;
  const vertexShader = reflection ? /* glsl */`
    attribute vec3 aPos, aCol; attribute float aSize, aKind, aPhase;
    varying vec2 vUv; varying vec3 vCol; varying float vI;
    ${GLOW_I}
    void main() {
      vI = glowI(aKind, aPhase) * 0.6; vCol = aCol;
      vec3 A = vec3(aPos.x, 0.6, aPos.z);
      vec2 d = cameraPosition.xz - A.xz; float dist = max(length(d), 0.001); d /= dist;
      vec2 sd = vec2(-d.y, d.x);
      float w = aSize * 0.42;
      float L = min(aSize * 2.6 + aPos.y * 1.1, dist * 0.55);
      vec3 wp = A + vec3(sd.x, 0.0, sd.y) * position.x * w + vec3(d.x, 0.0, d.y) * (position.y + 0.5) * L;
      vUv = vec2(position.x * 2.0, position.y + 0.5);
      gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    }` : /* glsl */`
    attribute vec3 aPos, aCol; attribute float aSize, aKind, aPhase;
    uniform float uFogNear, uFogFar;
    varying vec2 vUv; varying vec3 vCol; varying float vI;
    ${GLOW_I}
    void main() {
      vI = glowI(aKind, aPhase); vCol = aCol; vUv = position.xy;
      vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
      mv.xy += position.xy * aSize * (0.65 + 0.35 * vI);
      vI *= 1.0 - 0.65 * smoothstep(uFogNear, uFogFar * 1.5, -mv.z);
      gl_Position = projectionMatrix * mv;
    }`;
  const fragmentShader = reflection ? /* glsl */`
    uniform float uTime;
    varying vec2 vUv; varying vec3 vCol; varying float vI;
    void main() {
      float across = exp(-vUv.x * vUv.x * 5.0);
      float along = pow(1.0 - vUv.y, 1.5);
      float shimmer = 0.5 + 0.5 * sin(vUv.y * 46.0 - uTime * 2.6 + vCol.g * 9.0);
      float a = across * along * (0.35 + 0.65 * shimmer) * vI;
      if (a < 0.004) discard;
      gl_FragColor = vec4(vCol, min(a, 1.0));
      #include <colorspace_fragment>
    }` : /* glsl */`
    varying vec2 vUv; varying vec3 vCol; varying float vI;
    void main() {
      float r = length(vUv) * 2.0;
      float a = (exp(-r * r * 16.0) * 1.5 + exp(-r * r * 3.2) * 0.38) * vI;
      if (a < 0.004) discard;
      gl_FragColor = vec4(mix(vCol, vec3(1.0), exp(-r * r * 40.0) * 0.6), min(a, 1.0));
      #include <colorspace_fragment>
    }`;
  const mat = new THREE.ShaderMaterial({ uniforms: glowU, vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = reflection ? 2 : 3;
  scene.add(mesh);
  let n = 0;
  const col = new THREE.Color();
  return {
    add(x, y, z, color, size, kind = 0, phase = 0) {
      const i = n++;
      aPos.setXYZ(i, x, y, z); col.set(color); aCol.setXYZ(i, col.r, col.g, col.b);
      aSize.setX(i, size); aKind.setX(i, kind); aPhase.setX(i, phase);
      g.instanceCount = n;
      return i;
    },
    set(i, x, y, z) { aPos.setXYZ(i, x, y, z); },
    flush() { aPos.needsUpdate = true; },
    done() { [aPos, aCol, aSize, aKind, aPhase].forEach((a) => (a.needsUpdate = true)); },
  };
}
const glows = glowSystem(1600, false);
const refl = glowSystem(500, true);
function light(x, y, z, color, size, kind = 0, phase = 0, reflect = false) {
  const i = glows.add(x, y, z, color, size, kind, phase);
  const j = reflect ? refl.add(x, y, z, color, size, kind, phase) : -1;
  return [i, j];
}
function moveLight(l, x, y, z) { glows.set(l[0], x, y, z); if (l[1] >= 0) refl.set(l[1], x, y, z); }

const WARM = '#ffc985', WHITE = '#fff2dc', RED = '#ff3a2e', GREEN = '#36f08a';

/* ---------- land ---------- */
const concrete = new THREE.MeshLambertMaterial({ color: 0xa29c91 });
const quayWall = new THREE.MeshLambertMaterial({ color: 0x5f5b56 });
const darkLand = new THREE.MeshLambertMaterial({ color: 0x7d7a6f });
function slab(w, h, d, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.receiveShadow = true; scene.add(m); return m;
}
slab(370, 8, 540, -75, -1.5, -270, concrete);          // south quay, top at y = 2.5
slab(370, 3.2, 1.2, -75, 0.9, -0.6, quayWall);          // quay face
slab(80, 0.06, 24, -58, 2.53, -29, new THREE.MeshLambertMaterial({ color: 0x8a867c })); // yard asphalt
slab(420, 8, 340, -50, -2, 320, darkLand);             // north shore, top at y = 2

// breakwaters
const armA = [[96, -2], [138, 9], [180, 30]];
const armB = [[134, 152], [168, 138], [197, 123]];
const rockGeo = prep(new THREE.IcosahedronGeometry(1, 0), 0xffffff);
const rocks = instanced(rockGeo, new THREE.MeshLambertMaterial({ flatShading: true }), 420);
let rockN = 0;
const rockCol = new THREE.Color();
function arm(pts) {
  for (let s = 0; s < pts.length - 1; s++) {
    const [x0, z0] = pts[s], [x1, z1] = pts[s + 1];
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(5.5, 5, len + 4), concrete);
    crown.position.set((x0 + x1) / 2, 0.8, (z0 + z1) / 2); crown.rotation.y = ang;
    crown.castShadow = crown.receiveShadow = true; scene.add(crown);
    const nx = Math.cos(ang), nz = -Math.sin(ang);
    for (let d = 0; d < len; d += 2.4) {
      for (const side of [-1, 1]) {
        if (rockN >= 420) break;
        const t = d / len, off = side * R(3.4, 6.2);
        const x = lerp(x0, x1, t) + nx * off, z = lerp(z0, z1, t) + nz * off;
        const sc = R(1.4, 2.6);
        _e.set(R(0, 3), R(0, 3), R(0, 3)); _q.setFromEuler(_e);
        _m.compose(_v.set(x, R(-0.6, 0.9), z), _q, _s.set(sc, sc * R(0.7, 1), sc));
        rocks.setMatrixAt(rockN, _m);
        rockCol.setHSL(0.08, 0.04, R(0.36, 0.5)); rocks.setColorAt(rockN, rockCol);
        rockN++;
      }
    }
  }
}
arm(armA); arm(armB);
rocks.count = rockN;

/* ---------- containers ---------- */
function ribTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 128; i += 6) { x.fillStyle = 'rgba(0,0,0,0.13)'; x.fillRect(i, 0, 2, 64); x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(i + 3, 0, 1, 64); }
  x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(0, 0, 128, 3); x.fillRect(0, 61, 128, 3);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const containerGeo = new THREE.BoxGeometry(2.45, 2.6, 6.06);
const containerMat = new THREE.MeshLambertMaterial({ map: ribTexture() });
const BLUES = ['#2f6fdb', '#2a62c6', '#3a7be2', '#2556a8', '#3168cf'].map((c) => new THREE.Color(c));
const ORANGES = ['#f08a24', '#e7791b', '#f59a3c'].map((c) => new THREE.Color(c));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

// The yard: 146 blue (AKS) and 15 orange (EKS), exactly.
const yard = instanced(containerGeo, containerMat, 161);
{
  let i = 0;
  const heights = [];
  for (let s = 0; s < 40; s++) heights.push(s < 26 ? 4 : 3);
  heights.sort(() => rnd() - 0.5);
  let s = 0;
  for (let bay = 0; bay < 8; bay++) {
    for (let row = 0; row < 5; row++) {
      const h = heights[s++];
      for (let tier = 0; tier < h; tier++) {
        setInst(yard, i, -87 + bay * 6.65, 2.5 + 1.3 + tier * 2.6, -22.5 - row * 2.95 - (row > 2 ? 1.2 : 0));
        yard.setColorAt(i++, pick(BLUES));
      }
    }
  }
  for (let bay = 0; bay < 5; bay++) {
    for (let tier = 0; tier < 3; tier++) {
      setInst(yard, i, -28 + bay * 6.65, 2.5 + 1.3 + tier * 2.6, -22.5);
      yard.setColorAt(i++, pick(ORANGES));
    }
  }
}

// yard gantry (RTG), moving along the blue block
const rtgGeo = merge([
  box(1, 17, 1, '#e8c547', 0, 8.5, -1), box(1, 17, 1, '#e8c547', 0, 8.5, -17.5),
  box(1, 17, 1, '#e8c547', 6, 8.5, -1), box(1, 17, 1, '#e8c547', 6, 8.5, -17.5),
  box(1.2, 1.6, 18.5, '#e8c547', 0, 17.2, -9.25), box(1.2, 1.6, 18.5, '#e8c547', 6, 17.2, -9.25),
  box(7.2, 1.2, 1.2, '#e8c547', 3, 17.2, -1), box(7.2, 1.2, 1.2, '#e8c547', 3, 17.2, -17.5),
  box(4, 2.4, 3.2, '#ecebe6', 3, 18.6, -4),
]);
const rtg = instanced(rtgGeo, matVC, 1);

// yard high masts
for (const [x, z] of [[-92, -45], [-62, -45], [-32, -45], [-92, -16], [-48, -16]]) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 30, 6), new THREE.MeshLambertMaterial({ color: 0x8d9096 }));
  m.position.set(x, 17.5, z); m.castShadow = true; scene.add(m);
  for (let k = -1; k <= 1; k++) light(x + k * 1.4, 32.5, z, '#ffe3b5', 5.5, 0, 0.36 + k * 0.01);
}

/* ---------- ships ---------- */
const hullShape = new THREE.Shape();
hullShape.moveTo(-3, -12); hullShape.lineTo(3, -12); hullShape.lineTo(3, 5.5);
hullShape.quadraticCurveTo(3, 10.5, 0, 12.6); hullShape.quadraticCurveTo(-3, 10.5, -3, 5.5); hullShape.closePath();
function hullGeo(color) {
  const g = prep(new THREE.ExtrudeGeometry(hullShape, { depth: 3.2, bevelEnabled: false, curveSegments: 5 }), color);
  g.rotateX(Math.PI / 2); g.translate(0, 2.0, 0);
  return g;
}
function shipGeo(hull, funnel) {
  return merge([
    hullGeo(hull),
    box(4.2, 0.9, 2.2, hull, 0, 2.45, 9.2),
    box(5.2, 5.4, 3.4, '#ece9e2', 0, 4.7, -9.6),
    box(5.26, 0.7, 3.46, '#1b2633', 0, 6.7, -9.6),
    box(6.8, 0.4, 2.0, '#ece9e2', 0, 7.6, -8.7),
    box(1.6, 2.8, 1.8, funnel, 0, 9.0, -10.8),
    box(1.64, 0.55, 1.84, '#1a1d22', 0, 10.2, -10.8),
    box(0.22, 3.4, 0.22, '#d7d4cc', 0, 9.6, -8.6),
  ]);
}
const VARIANTS = [
  { geo: shipGeo('#1e2c45', '#c9452f') },
  { geo: shipGeo('#6a2429', '#ece7db') },
  { geo: shipGeo('#1f4a45', '#2f6fdb') },
];
const ships = [];
function addShip(o) {
  const s = Object.assign({ yaw: 0, sx: 1, sy: 1, variant: 0, bob: R(0, 6), roll: 0, slots: [], fill: 1, lights: [], pos: new THREE.Vector3() }, o);
  const s2 = s.sx, deckY = 2.0 * s.sy;
  const bays = Math.floor((16.4 * s2) / 6.4), rows = Math.max(1, Math.floor((5.2 * s2) / 2.5));
  const z0 = -7.2 * s2 + (16.4 * s2 - bays * 6.4) / 2 + 3.2;
  for (let b = 0; b < bays; b++) for (let t = 0; t < s.tiers; t++) for (let r = 0; r < rows; r++) {
    const azure = rnd() > (s.awsShare ?? 0.12);
    s.slots.push({ x: (r - (rows - 1) / 2) * 2.5, y: deckY + 1.3 + t * 2.6, z: z0 + b * 6.4, color: azure ? pick(BLUES) : pick(ORANGES), bay: b, tier: t });
  }
  ships.push(s);
  return s;
}
// the big ship under the cranes, loaded as you scroll
const docked = addShip({ pos: new THREE.Vector3(0, 0, 15.5), yaw: -Math.PI / 2, sx: 2.5, sy: 1.45, tiers: 3, variant: 0, awsShare: 0.1 });
docked.slots.sort((a, b) => a.bay - b.bay || a.tier - b.tier);
// the fleet that leaves in sync
const fleet = [];
for (let i = 0; i < 10; i++) fleet.push(addShip({ pos: new THREE.Vector3(38 + 6.5 * i, 0, 14), sx: 1, sy: 1, tiers: 2, variant: i % 3, idx: i, awsShare: 0.1 }));
// ships at anchor, one per earlier port of call
const ANCH = [[657, 312, -0.62], [529, 282, -0.7], [436, 255, -0.58], [373, 231, -0.68], [329, 206, -0.64]];
const anchored = ANCH.map(([x, z, yaw], k) => addShip({ pos: new THREE.Vector3(x, 0, z), yaw, sx: 1.6 + (k === 4 ? 0.2 : 0), sy: 1.2, tiers: 3, variant: [1, 2, 0, 1, 2][k], awsShare: k === 4 ? 0.12 : 0.02 }));

const hullMeshes = VARIANTS.map((v) => instanced(v.geo, matVC, 16));
const shipBoxes = instanced(containerGeo, containerMat, ships.reduce((n, s) => n + s.slots.length, 0) + 6);
{ let k = 0; for (const s of ships) for (const sl of s.slots) shipBoxes.setColorAt(k++, sl.color); }

// navigation lights on every ship
for (const s of ships) {
  s.lights.push(light(0, 0, 0, WHITE, 2.4, 4, 0.0, true));
  s.lights.push(light(0, 0, 0, RED, 1.6, 4, 0.0, true));
  s.lights.push(light(0, 0, 0, GREEN, 1.6, 4, 0.0, true));
  s.lights.push(light(0, 0, 0, '#ffd9a0', 2.2, 0, 0.42, false));
}
const _shipQ = new THREE.Quaternion();
function shipLocal(s, lx, ly, lz, out) {
  return out.set(lx, ly, lz).applyQuaternion(_shipQ).add(s.pos);
}
const _w = new THREE.Vector3();
function writeShips(t) {
  const counts = [0, 0, 0];
  let k = 0;
  for (const s of ships) {
    const bob = Math.sin(t * 0.7 + s.bob) * 0.18;
    const roll = Math.sin(t * 0.5 + s.bob * 2) * 0.012;
    _e.set(0, s.yaw, roll, 'YXZ'); _shipQ.setFromEuler(_e);
    const hm = hullMeshes[s.variant];
    _m.compose(_v.set(s.pos.x, s.pos.y + bob, s.pos.z), _shipQ, _s.set(s.sx, s.sy, s.sx));
    hm.setMatrixAt(counts[s.variant]++, _m);
    const shown = Math.round(s.slots.length * s.fill);
    for (let j = 0; j < s.slots.length; j++) {
      const sl = s.slots[j];
      if (j < shown) {
        shipLocal(s, sl.x, sl.y + bob, sl.z, _w);
        _m.compose(_w, _shipQ, _s.set(1, 1, 1));
      } else _m.makeScale(0, 0, 0);
      shipBoxes.setMatrixAt(k++, _m);
    }
    const sc = s.sx, sy = s.sy;
    shipLocal(s, 0, 11.4 * sy + bob, -8.6 * sc, _w); moveLight(s.lights[0], _w.x, _w.y, _w.z);
    shipLocal(s, -3.4 * sc, 7.7 * sy + bob, -8.7 * sc, _w); moveLight(s.lights[1], _w.x, _w.y, _w.z);
    shipLocal(s, 3.4 * sc, 7.7 * sy + bob, -8.7 * sc, _w); moveLight(s.lights[2], _w.x, _w.y, _w.z);
    shipLocal(s, 0, 6.7 * sy + bob, -7.8 * sc, _w); moveLight(s.lights[3], _w.x, _w.y, _w.z);
  }
  hullMeshes.forEach((m, i) => { m.count = counts[i]; m.instanceMatrix.needsUpdate = true; });
  return k;
}

// The fleet: concentric turns, so every ship stays abreast and in sync.
function fleetPose(s, f) {
  const i = s.idx, x0 = 38 + 6.5 * i, z0 = 14, Rr = 10 + (9 - i) * 6.5;
  const a = 0.12, b = 0.3;
  if (f <= a) { s.pos.set(x0, 0, z0 + (f / a) * 30); s.yaw = 0; }
  else if (f <= b) {
    const th = smooth((f - a) / (b - a)) * Math.PI / 2;
    s.pos.set(x0 + Rr - Rr * Math.cos(th), 0, z0 + 30 + Rr * Math.sin(th)); s.yaw = th;
  } else { s.pos.set(x0 + Rr + ((f - b) / (1 - b)) * 520, 0, z0 + 30 + Rr); s.yaw = Math.PI / 2; }
}

/* ---------- wakes ---------- */
const wakeGeo = new THREE.BufferGeometry();
wakeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, -1, 0, -1, 1, 0, -1]), 3));
wakeGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, -1, 1, 1, 1]), 2));
const wakeMat = new THREE.ShaderMaterial({
  uniforms: { uTime: glowU.uTime, uDay: { value: 1 } },
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * viewMatrix * instanceMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform float uTime, uDay; varying vec2 vUv;
    void main() {
      float u = abs(vUv.x / max(vUv.y, 0.001));
      float edge = smoothstep(0.55, 1.0, u);
      float churn = (1.0 - smoothstep(0.0, 0.35, u)) * (1.0 - smoothstep(0.0, 0.6, vUv.y));
      float foam = 0.6 + 0.4 * sin(vUv.y * 60.0 - uTime * 5.0 + u * 8.0);
      float a = (edge * 0.75 + churn * 0.9) * foam * pow(1.0 - vUv.y, 1.4) * mix(0.25, 0.75, uDay);
      gl_FragColor = vec4(vec3(0.96, 0.97, 1.0), a);
      #include <colorspace_fragment>
    }`,
});
const wakes = new THREE.InstancedMesh(wakeGeo, wakeMat, 16);
wakes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
wakes.frustumCulled = false;
wakes.renderOrder = 1;
scene.add(wakes);

/* ---------- cranes ---------- */
const CRANE_X = [-18, -2, 14];
const CW = '#f3f0e8', CB = '#2f5e9e';
const matCrane = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x1d1f24 });
const craneGeo = merge([
  box(1.1, 26, 1.1, CW, -6, 13, 0), box(1.1, 26, 1.1, CW, 6, 13, 0),
  box(1.1, 26, 1.1, CW, -6, 13, -16), box(1.1, 26, 1.1, CW, 6, 13, -16),
  box(13.2, 1.4, 1.4, CW, 0, 25.5, 0), box(13.2, 1.4, 1.4, CW, 0, 25.5, -16),
  box(1.4, 1.4, 17.4, CW, -6, 25.5, -8), box(1.4, 1.4, 17.4, CW, 6, 25.5, -8),
  box(13, 0.8, 0.8, CW, 0, 6, 0), box(13, 0.8, 0.8, CW, 0, 6, -16),
  beam([-6, 6, 0], [-6, 25, -16], 0.6, CW), beam([6, 6, 0], [6, 25, -16], 0.6, CW),
  box(1.3, 2.2, 62, CW, -2.2, 35, 4), box(1.3, 2.2, 62, CW, 2.2, 35, 4),
  box(5.6, 0.6, 62, CW, 0, 34, 4),
  beam([-5.5, 26, 0], [-1.8, 52, -6], 1.0, CW), beam([5.5, 26, 0], [1.8, 52, -6], 1.0, CW),
  beam([-5.5, 26, -16], [-1.8, 52, -6], 1.0, CW), beam([5.5, 26, -16], [1.8, 52, -6], 1.0, CW),
  box(4.6, 1.2, 1.4, CW, 0, 52, -6),
  beam([-1.6, 52, -6], [-2.2, 36, 34], 0.35, '#c9c5bc'), beam([1.6, 52, -6], [2.2, 36, 34], 0.35, '#c9c5bc'),
  beam([-1.6, 52, -6], [-2.2, 36, -26], 0.35, '#c9c5bc'), beam([1.6, 52, -6], [2.2, 36, -26], 0.35, '#c9c5bc'),
  box(6.4, 4.2, 8.5, CB, 0, 38.2, -21),
  box(2.4, 2.2, 2.6, '#f2f0ea', 0, 32.4, 0.5),
]);
const cranes = instanced(craneGeo, matCrane, 3);
CRANE_X.forEach((x, i) => setInst(cranes, i, x, 2.5, -2));
const trolleys = instanced(merge([box(5.2, 1.6, 4, '#3a3f47', 0, 0, 0), box(4.4, 1.2, 3.2, CB, 0, -1.3, 0)]), matVC, 3);
const spreaders = instanced(box(2.8, 0.5, 6.6, '#e8c547'), matVC, 3);
const carried = instanced(containerGeo, containerMat, 3);
CRANE_X.forEach((_, i) => carried.setColorAt(i, BLUES[i % BLUES.length]));
const cableGeo = new THREE.BufferGeometry();
cableGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 4 * 2 * 3), 3));
const cables = new THREE.LineSegments(cableGeo, new THREE.LineBasicMaterial({ color: 0x2b2f36 }));
cables.frustumCulled = false;
scene.add(cables);
const craneLights = CRANE_X.map((x, i) => [
  light(x, 55.5, -8, RED, 2.6, 1, i * 0.21, true),
  light(x, 38.6, 33, RED, 2.2, 1, i * 0.21 + 0.5, true),
  light(x, 35, 12, '#fff3da', 7, 0, 0.3 + i * 0.02, true),
]);
function writeCranes(t, speed) {
  const cab = cableGeo.attributes.position.array;
  CRANE_X.forEach((x, i) => {
    const u = (t * speed / 7 + i * 0.37) % 1;
    const landZ = -10, shipZ = 12 + ((i * 3) % 3) * 3.5;
    let tz, drop, holding;
    if (u < 0.15) { tz = landZ; drop = smooth(u / 0.15); holding = u > 0.12; }
    else if (u < 0.28) { tz = landZ; drop = 1 - smooth((u - 0.15) / 0.13); holding = true; }
    else if (u < 0.5) { tz = lerp(landZ, shipZ, smooth((u - 0.28) / 0.22)); drop = 0; holding = true; }
    else if (u < 0.63) { tz = shipZ; drop = smooth((u - 0.5) / 0.13); holding = u < 0.6; }
    else if (u < 0.76) { tz = shipZ; drop = 1 - smooth((u - 0.63) / 0.13); holding = false; }
    else { tz = lerp(shipZ, landZ, smooth((u - 0.76) / 0.24)); drop = 0; holding = false; }
    const sy = lerp(31, tz < 0 ? 7.5 : 13.5, drop);
    setInst(trolleys, i, x, 35.3, tz);
    setInst(spreaders, i, x, sy, tz);
    if (holding) setInst(carried, i, x, sy - 1.55, tz); else setInst(carried, i, 0, -50, 0, 0, 0.001, 0.001, 0.001);
    for (let c = 0; c < 4; c++) {
      const ox = c < 2 ? -0.9 : 0.9, oz = c % 2 ? -2.6 : 2.6, o = (i * 4 + c) * 6;
      cab[o] = x + ox; cab[o + 1] = 33.4; cab[o + 2] = tz + oz * 0.5;
      cab[o + 3] = x + ox * 1.2; cab[o + 4] = sy + 0.25; cab[o + 5] = tz + oz;
    }
  });
  [trolleys, spreaders, carried].forEach((m) => (m.instanceMatrix.needsUpdate = true));
  cableGeo.attributes.position.needsUpdate = true;
}

/* ---------- quay furniture ---------- */
const lampGeo = merge([cyl(0.18, 0.26, 12, 5, '#7d8087', 0, 6, 0), box(0.25, 0.25, 2.4, '#7d8087', 0, 12, 1.1), box(0.8, 0.35, 1.2, '#2b2f36', 0, 11.85, 2.1)]);
const lampXs = [];
for (let x = -235; x <= 98; x += 17) if (!CRANE_X.some((c) => Math.abs(c - x) < 8)) lampXs.push(x);
const lamps = instanced(lampGeo, matVC, lampXs.length);
lampXs.forEach((x, i) => { setInst(lamps, i, x, 2.5, -4.5); light(x, 14.2, -2.3, WARM, 3.6, 0, 0.3 + rnd() * 0.08, true); });
const bollards = instanced(cyl(0.45, 0.55, 0.9, 6, '#3b3e44'), matVC, 40);
for (let i = 0; i < 40; i++) setInst(bollards, i, -230 + i * 8.4, 2.95, -1.4);

/* ---------- lane markings and terminal trucks ---------- */
{
  const dashes = [];
  for (let x = -236; x < 100; x += 7) for (const z of [-7.5, -15.5]) dashes.push([x, z]);
  const marks = instanced(box(4, 0.04, 0.35, '#e9e5da'), new THREE.MeshLambertMaterial({ vertexColors: true }), dashes.length, { cast: false });
  dashes.forEach(([x, z], i) => setInst(marks, i, x, 2.53, z));
}
const truckGeo = merge([box(2.4, 2.2, 2.4, '#d9d4c7', 0, 2.0, 5.4), box(2.2, 0.8, 2.2, '#1b2633', 0, 2.5, 5.45), box(2.3, 0.6, 9.4, '#2b2f36', 0, 0.9, 0.6), cyl(0.5, 0.5, 2.5, 6, '#15171b', 0, 0.5, -3).rotateZ(0)]);
const trucks = instanced(truckGeo, matVC, 6);
const truckBoxes = instanced(containerGeo, containerMat, 6);
const TRUCKS = Array.from({ length: 6 }, (_, i) => ({ lane: i % 2 ? -6.5 : -12.5, ph: R(0, 1), sp: R(0.006, 0.011), dir: i % 2 ? 1 : -1, load: rnd() < 0.7, col: rnd() < 0.85 ? pick(BLUES) : pick(ORANGES) }));
TRUCKS.forEach((t, i) => truckBoxes.setColorAt(i, t.col));
function writeTrucks(time) {
  TRUCKS.forEach((t, i) => {
    const u = (t.ph + time * t.sp) % 1;
    const x = t.dir > 0 ? lerp(-230, 96, u) : lerp(96, -230, u);
    const yaw = t.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    const z = t.lane;
    setInst(trucks, i, x, 2.5, z, yaw);
    if (t.load) setInst(truckBoxes, i, x - Math.sin(yaw) * 0.6, 2.5 + 2.6, z, yaw); else setInst(truckBoxes, i, 0, -60, 0, 0, 0.001, 0.001, 0.001);
  });
  trucks.instanceMatrix.needsUpdate = true; truckBoxes.instanceMatrix.needsUpdate = true;
}

/* ---------- lighthouse and harbor entrance ---------- */
const LH = new THREE.Vector3(180, 2.5, 30);
{
  const parts = [cyl(5.2, 5.8, 4, 10, '#9d988e', 0, 0, 0)];
  for (let b = 0; b < 5; b++) {
    const y0 = 2 + b * 4.2, rB = lerp(3.0, 2.0, b / 5), rT = lerp(3.0, 2.0, (b + 1) / 5);
    parts.push(cyl(rT, rB, 4.2, 14, b % 2 ? '#f1ede4' : '#c4342d', 0, y0 + 2.1, 0));
  }
  parts.push(cyl(2.9, 2.9, 0.5, 14, '#2a2d33', 0, 23.4, 0));
  parts.push(cyl(1.5, 1.5, 3, 12, '#f5e3b0', 0, 25.2, 0));
  parts.push(prep(new THREE.ConeGeometry(2.0, 2.2, 12), '#7e1f1c').translate(0, 27.8, 0));
  const lh = new THREE.Mesh(merge(parts), matVC);
  lh.position.copy(LH); lh.castShadow = lh.receiveShadow = true; scene.add(lh);
  light(LH.x, LH.y + 25.2, LH.z, '#fff0c8', 16, 4, 0.12, true);
  // green entrance light on the opposite pier head
  const gt = new THREE.Mesh(merge([cyl(1.4, 1.8, 8, 8, '#2f7d4f', 0, 4, 0), cyl(1.6, 1.6, 0.4, 8, '#e9e6de', 0, 8.2, 0)]), matVC);
  gt.position.set(197, 2.5, 123); gt.castShadow = true; scene.add(gt);
  light(197, 11.6, 123, GREEN, 4.5, 2, 0.6, true);
}
const beamMat = new THREE.ShaderMaterial({
  uniforms: { uI: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: /* glsl */`varying float vL; varying vec3 vN; varying vec3 vV;
    void main(){ vL = position.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: /* glsl */`uniform float uI; varying float vL; varying vec3 vN; varying vec3 vV;
    void main(){ float along = clamp(vL / 160.0 + 0.5, 0.0, 1.0); float a = pow(along, 2.2) * pow(abs(dot(normalize(vN), normalize(vV))), 1.5) * uI;
      gl_FragColor = vec4(vec3(1.0, 0.94, 0.8), a);
      #include <colorspace_fragment>
    }`,
});
const lhBeam = new THREE.Group();
lhBeam.position.set(LH.x, LH.y + 25.2, LH.z);
for (const dir of [1, -1]) {
  const g = new THREE.ConeGeometry(9, 160, 20, 1, true);
  const m = new THREE.Mesh(g, beamMat);
  m.rotation.z = dir * Math.PI / 2; m.position.x = dir * 80;
  lhBeam.add(m);
}
scene.add(lhBeam);

/* ---------- channel buoys: 104 of them, one per policy ---------- */
const buoyGeo = merge([cyl(0.85, 1.05, 2.4, 8, '#ffffff', 0, 0.6, 0), prep(new THREE.ConeGeometry(0.85, 1.4, 8), '#ffffff').translate(0, 2.5, 0), box(0.16, 1.2, 0.16, '#30343a', 0, 3.6, 0)]);
const buoys = instanced(buoyGeo, new THREE.MeshLambertMaterial({ flatShading: true }), 104, { cast: false });
const BUOYS = [];
{
  const red = new THREE.Color('#c8322b'), green = new THREE.Color('#2a8f58');
  for (let i = 0; i < 52; i++) for (const side of [0, 1]) {
    const x = 210 + i * 8.6, z = side ? 122 + Math.sin(i * 0.4) * 0.6 : 44 - Math.sin(i * 0.4) * 0.6;
    const b = { x, z, ph: R(0, 6) };
    buoys.setColorAt(BUOYS.length, side ? green : red);
    light(x, 4.4, z, side ? GREEN : RED, 2.6, 2, side ? 0.15 : 0.62, true);
    BUOYS.push(b);
  }
}

/* ---------- wind turbines ---------- */
const TURB = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) TURB.push([440 + c * 58 + r * 14, -175 + r * 58]);
const towerGeo = merge([cyl(0.7, 1.4, 72, 8, '#e9e9e6', 0, 36, 0), box(2.2, 2.4, 5.2, '#e9e9e6', 0, 73, -0.6)]);
const towers = instanced(towerGeo, matVC, TURB.length, { receive: false });
const bladeParts = [];
for (let k = 0; k < 3; k++) {
  const g = box(1.6, 30, 0.35, '#efefec', 0, 16, 0);
  g.rotateZ((k * Math.PI * 2) / 3);
  bladeParts.push(g);
}
bladeParts.push(prep(new THREE.ConeGeometry(1.1, 2.2, 8), '#efefec').rotateX(Math.PI / 2).translate(0, 0, 1));
const rotors = instanced(merge(bladeParts), matVC, TURB.length, { receive: false });
TURB.forEach(([x, z], i) => { setInst(towers, i, x, 2, z, 0.4); light(x, 76, z - 0.6, RED, 4.5, 3, 0, z < 0); });
function writeTurbines(t) {
  TURB.forEach(([x, z], i) => {
    _e.set(0, 0.4, t * 0.9 + i * 0.7, 'YXZ'); _q.setFromEuler(_e);
    _v.set(0, 0, 2.2).applyAxisAngle(UP, 0.4);
    _m.compose(_w.set(x + _v.x, 75, z + _v.z), _q, _s.set(1, 1, 1));
    rotors.setMatrixAt(i, _m);
  });
  rotors.instanceMatrix.needsUpdate = true;
}

/* ---------- skyline with windows that light up at dusk ---------- */
const bldGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const BLD = [];
for (let i = 0; i < 64; i++) BLD.push({ x: -290 + i * 6.8 + R(-2, 2), z: R(-470, -430), w: R(7, 16), d: R(8, 16), h: rnd() < 0.08 ? R(55, 72) : R(10, 38), face: 1 });
for (let i = 0; i < 40; i++) BLD.push({ x: -280 + i * 9.4 + R(-2, 2), z: R(300, 330), w: R(8, 18), d: R(8, 16), h: R(8, 30), face: -1 });
const blds = instanced(bldGeo, new THREE.MeshLambertMaterial({ color: 0x8e96a3 }), BLD.length, { cast: false });
BLD.forEach((b, i) => {
  setInst(blds, i, b.x, 2, b.z, 0, b.w, b.h, b.d);
  const cols = Math.floor(b.w / 2.4), rows = Math.floor(b.h / 3.6);
  for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (rnd() > 0.3) continue;
    light(b.x - b.w / 2 + 1.2 + c * 2.4, 2 + r * 3.6, b.z + b.face * (b.d / 2 + 0.3), rnd() < 0.75 ? '#ffd29a' : '#cfe0ff', 1.7, 0, R(0.3, 0.86));
  }
});

/* ---------- clouds ---------- */
const cloudGeo = merge([0, 1, 2, 3, 4].map((k) => {
  const g = prep(new THREE.IcosahedronGeometry(R(9, 15), 1), '#ffffff');
  g.translate(k * 11 - 22, R(-2, 4), R(-5, 5)); return g;
}));
const cloudMat = new THREE.MeshLambertMaterial({ flatShading: true, fog: false, transparent: true, opacity: 0.8, depthWrite: false });
const clouds = instanced(cloudGeo, cloudMat, 12, { cast: false, receive: false });
clouds.renderOrder = -5;
const CLOUDS = Array.from({ length: 12 }, () => ({ x: R(-600, 900), y: R(250, 340), z: R(-700, 600), s: R(1.8, 3.2), sp: R(1.5, 3.5) }));

/* ---------- morning mist ---------- */
function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const mistTex = blobTexture();
const MIST = [];
for (let i = 0; i < 18; i++) {
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, depthWrite: false, opacity: 0.5, fog: true }));
  m.position.set(R(-260, 120), R(3, 13), R(-60, 120));
  m.scale.set(R(120, 200), R(18, 30), 1);
  m.userData = { x: m.position.x, sp: R(0.6, 1.6) };
  scene.add(m); MIST.push(m);
}

/* ---------- gulls ---------- */
const wingL = new THREE.BufferGeometry();
wingL.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.35, 0, 0, -0.35, -2.1, 0.1, -0.55, 0, 0, -0.35, -2.1, 0.1, -0.55, -1.2, 0, -0.9]), 3));
wingL.computeVertexNormals();
const wingR = wingL.clone().scale(-1, 1, 1);
const gullMat = new THREE.MeshLambertMaterial({ color: 0xf4f2ee, side: THREE.DoubleSide });
const gullsL = instanced(wingL, gullMat, 18, { receive: false });
const gullsR = instanced(wingR, gullMat, 18, { receive: false });
const GULLS = Array.from({ length: 18 }, () => ({ r: R(14, 34), y: R(12, 30), sp: R(0.25, 0.5) * (rnd() < 0.5 ? -1 : 1), ph: R(0, 6.28), fl: R(5, 7) }));
const gullCenter = new THREE.Vector3(-150, 0, 70);

/* ---------- tugboats ---------- */
const tugShape = new THREE.Shape();
tugShape.moveTo(-1.6, -4.5); tugShape.lineTo(1.6, -4.5); tugShape.lineTo(1.6, 1.8); tugShape.quadraticCurveTo(1.6, 4, 0, 4.6); tugShape.quadraticCurveTo(-1.6, 4, -1.6, 1.8); tugShape.closePath();
const tugHull = prep(new THREE.ExtrudeGeometry(tugShape, { depth: 1.7, bevelEnabled: false, curveSegments: 4 }), '#b8322b');
tugHull.rotateX(Math.PI / 2); tugHull.translate(0, 1.0, 0);
const tugGeo = merge([tugHull, box(2.4, 1.5, 3.2, '#ece9e2', 0, 1.75, 0.2), box(2.0, 1.2, 1.8, '#ece9e2', 0, 3.1, 0.6), box(2.05, 0.4, 1.85, '#1b2633', 0, 3.3, 0.6), box(0.5, 1.4, 0.5, '#1a1d22', 0, 3.2, -0.9)]);
const tugs = instanced(tugGeo, matVC, 3);
const TUGS = [
  { cx: -60, cz: 62, rx: 80, rz: 16, sp: 0.035, ph: 0 },
  { cx: 40, cz: 72, rx: 50, rz: 22, sp: -0.045, ph: 2 },
  { cx: -150, cz: 80, rx: 60, rz: 20, sp: 0.03, ph: 4 },
];
TUGS.forEach((g) => { g.l = light(0, 0, 0, WHITE, 1.8, 4, 0, true); g.prev = new THREE.Vector3(); });

/* ---------- camera path ---------- */
const KEYS = [
  { p: 0.00, pos: [-232, 15, 104], tgt: [-70, 15, -6] },
  { p: 0.15, pos: [-126, 28, 60], tgt: [-50, 5, -26] },
  { p: 0.29, pos: [-34, 8, 98], tgt: [-10, 21, 4] },
  { p: 0.43, pos: [36, 92, 160], tgt: [68, 0, 70] },
  { p: 0.565, pos: [138, 26, 83], tgt: [330, 3, 83] },
  { p: 0.69, pos: [234, 12, 94], tgt: [176, 20, 28] },
  { p: 0.81, pos: [266, 30, 132], tgt: [372, 4, 214] },
  { p: 0.97, pos: [332, 84, 172], tgt: [62, 0, 40] },
  { p: 1.00, pos: [334, 85, 173], tgt: [62, 0, 40] },
];
// On tall screens, step back and up so each subject still fits the frame.
const MOBILE_ADJ = [
  { back: 1.25, up: 4, tgt: [10, -2, 0] }, { back: 1.45, up: 10 }, { back: 1.5, up: 6 }, { back: 1.35, up: 8 },
  { back: 1.2, up: 6 }, { back: 1.6, up: 4 }, { back: 1.4, up: 6 }, { back: 1.15, up: 10 }, { back: 1.15, up: 10 },
];
let posCurve, tgtCurve;
function buildPath() {
  const tall = innerWidth / innerHeight < 0.85;
  const P = [], T = [];
  KEYS.forEach((k, i) => {
    const pos = new THREE.Vector3(...k.pos), tgt = new THREE.Vector3(...k.tgt);
    if (tall) {
      const a = MOBILE_ADJ[i];
      if (a.tgt) tgt.add(new THREE.Vector3(...a.tgt));
      pos.sub(tgt).multiplyScalar(a.back).add(tgt); pos.y += a.up;
    }
    P.push(pos); T.push(tgt);
  });
  posCurve = new THREE.CatmullRomCurve3(P, false, 'centripetal');
  tgtCurve = new THREE.CatmullRomCurve3(T, false, 'centripetal');
  camera.fov = tall ? 58 : 42;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
buildPath();
function pathU(p) {
  let i = 0;
  while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
  const t = clamp((p - KEYS[i].p) / (KEYS[i + 1].p - KEYS[i].p));
  return (i + lerp(t, smoother(t), 0.8)) / (KEYS.length - 1);
}

/* ---------- overlay: captions, clock, labels ---------- */
const caps = $$('.cap').map((el) => ({ el, k: +el.dataset.k, w: +el.dataset.w }));
const bar = $('.bar');
const clockEl = $('#clock'), clockSun = $('#clock-sun');
const figProv = $('#fig-provision');
const labels = $$('.label').map((el) => ({ el, ship: anchored[+el.dataset.ship] }));
const CLOCK = [[0, 340], [0.16, 450], [0.42, 780], [0.6, 1090], [0.71, 1220], [0.83, 1300], [1, 1410]];
function clockAt(p) {
  let i = 0; while (i < CLOCK.length - 2 && p > CLOCK[i + 1][0]) i++;
  const [p0, m0] = CLOCK[i], [p1, m1] = CLOCK[i + 1];
  const m = Math.round(lerp(m0, m1, clamp((p - p0) / (p1 - p0))));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
const scrimCol = new THREE.Color();
let lastClock = '';
function writeOverlay(p, e) {
  for (const c of caps) {
    const d = Math.abs(p - c.k);
    let v = 1 - smooth(clamp((d - c.w * 0.45) / (c.w * 0.55)));
    if (reduce) v = v > 0.5 ? 1 : 0;
    c.el.style.setProperty('--v', v.toFixed(3));
    c.el.classList.toggle('is-on', v > 0.01);
    c.el.classList.toggle('is-live', v > 0.6);
  }
  scrimCol.copy(e.fog).convertLinearToSRGB();
  root.style.setProperty('--scrim', `rgba(${(scrimCol.r * 255) | 0},${(scrimCol.g * 255) | 0},${(scrimCol.b * 255) | 0},0.62)`);
  bar.classList.toggle('is-light', p > 0.635);
  bar.style.setProperty('--mark', clamp((p - 0.05) / 0.04).toFixed(2));
  const ck = clockAt(p);
  if (ck !== lastClock) {
    clockEl.textContent = ck; lastClock = ck;
    const sunUp = e.sunVis > 0.5;
    scrimCol.copy(sunUp ? e.sun : new THREE.Color('#dfe6ff')).convertLinearToSRGB();
    clockSun.style.background = `#${scrimCol.getHexString()}`;
    clockSun.style.boxShadow = `0 0 10px #${scrimCol.getHexString()}`;
  }
  // provisioning counter: six months becomes one hour as the cranes load the ship
  const f = clamp((p - 0.225) / 0.06);
  const days = Math.round(lerp(182, 0, smooth(f)));
  figProv.textContent = f <= 0 ? '6 months' : days > 0 ? `${days} days` : '1 hour';
}
const _p = new THREE.Vector3();
const leaders = $('#leaders');
const leaderLines = labels.map(() => {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.innerHTML = '<line /><circle r="2.6" />';
  leaders.appendChild(g);
  return { line: g.firstChild, dot: g.lastChild, g };
});
function writeLabels(p) {
  const vis = 1 - smooth(clamp((Math.abs(p - 0.81) - 0.03) / 0.035));
  leaders.style.opacity = vis;
  if (vis <= 0.01) { labels.forEach((l) => (l.el.style.opacity = 0)); return; }
  const W = innerWidth, H = innerHeight, wide = W >= 760;
  labels.forEach((l, i) => {
    _p.set(l.ship.pos.x, 2.2 * l.ship.sy + 8, l.ship.pos.z).project(camera);
    const sx = ((_p.x + 1) / 2) * W, sy = ((1 - _p.y) / 2) * H;
    // a row of labels across the sky on wide screens, a stack on narrow ones
    // wide: a row across the sky; narrow: a staircase, older ports higher up
    const lh = wide ? 44 : 36;
    const lx = wide ? lerp(W * 0.3, W * 0.84, i / 4) : clamp(sx - 1, 16, W - l.el.offsetWidth - 12);
    const ly = wide ? H * 0.17 : sy - lh - 22 - (4 - i) * 50;
    l.el.style.opacity = vis;
    l.el.style.transform = `translate(${lx}px, ${ly}px)`;
    const ll = leaderLines[i];
    const x0 = lx, y0 = ly + lh;
    ll.line.setAttribute('x1', x0); ll.line.setAttribute('y1', y0);
    ll.line.setAttribute('x2', sx); ll.line.setAttribute('y2', sy);
    ll.dot.setAttribute('cx', sx); ll.dot.setAttribute('cy', sy);
    ll.g.style.opacity = _p.z < 1 ? 1 : 0;
  });
}

/* ---------- scroll ---------- */
let lenis = null;
function startLenis() {
  if (reduce || !window.Lenis) return;
  lenis = new window.Lenis({ lerp: 0.075, wheelMultiplier: 0.85, smoothWheel: true });
}
startLenis();
const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);
let pScroll = clamp(scrollY / maxScroll());
addEventListener('scroll', () => { pScroll = clamp(scrollY / maxScroll()); }, { passive: true });
function goTo(p) {
  const y = p * maxScroll();
  if (lenis) lenis.scrollTo(y, { duration: 2.4 }); else scrollTo(0, y);
}
$$('a[href="#contact"]').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); goTo(1); setTimeout(() => $('#contact').focus({ preventScroll: true }), reduce ? 0 : 2400); }));
$('.mark').addEventListener('click', (ev) => { ev.preventDefault(); goTo(0); });
$('#contact').addEventListener('focusin', () => { if (pScroll < 0.93) goTo(1); });

/* ---------- pointer parallax ---------- */
const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { mouse.x = e.clientX / innerWidth - 0.5; mouse.y = e.clientY / innerHeight - 0.5; } }, { passive: true });

/* ---------- frame ---------- */
const clock = new THREE.Clock();
let time = 0, pCam = pScroll, lastP = -1, dirty = true;
const camPos = new THREE.Vector3(), camTgt = new THREE.Vector3();
const STILL_TIME = 14.2;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (lenis) lenis.raf(performance.now());
  let p;
  if (reduce) {
    // Still frames: jump to the scene nearest the scroll position, no flight in between.
    p = KEYS.reduce((best, k) => (Math.abs(k.p - pScroll) < Math.abs(best - pScroll) ? k.p : best), 0);
    if (p === lastP && !dirty) return;
    time = STILL_TIME;
  } else {
    time += dt;
    pCam += (pScroll - pCam) * Math.min(1, dt * 7);
    p = pCam;
  }
  lastP = p; dirty = false;

  const e = sampleTOD(p);
  // sky, fog, lights
  skyU.uTop.value.copy(e.top); skyU.uHor.value.copy(e.hor); skyU.uBot.value.copy(e.bot);
  skyU.uSun.value.copy(e.dir); skyU.uSunCol.value.copy(e.sun); skyU.uSunVis.value = e.sunVis; skyU.uMoonVis.value = e.moonVis;
  scene.fog.color.copy(e.fog); scene.fog.near = e.fogN; scene.fog.far = e.fogF;
  hemi.color.copy(e.sky); hemi.groundColor.copy(e.gnd); hemi.intensity = e.hemiI;
  sun.color.copy(e.sun); sun.intensity = e.sunI;
  stars.material.opacity = smooth(clamp((e.night - 0.35) / 0.5));
  glowU.uTime.value = time; glowU.uNight.value = e.night; glowU.uFogNear.value = e.fogN; glowU.uFogFar.value = e.fogF;
  waterU.uTime.value = time; farU.uTime.value = time;
  waterU.uDeep.value.copy(e.deep); waterU.uHor.value.copy(e.hor); waterU.uTop.value.copy(e.top);
  waterU.uSun.value.copy(e.dir); waterU.uSunCol.value.copy(e.sun); waterU.uSunI.value = e.sunI; waterU.uNight.value = e.night;
  waterU.fogColor.value.copy(e.fog); waterU.fogNear.value = e.fogN; waterU.fogFar.value = e.fogF;
  wakeMat.uniforms.uDay.value = 1 - e.night * 0.6;

  // camera
  const u = pathU(p);
  posCurve.getPoint(u, camPos); tgtCurve.getPoint(u, camTgt);
  if (!reduce) {
    mouse.sx += (mouse.x - mouse.sx) * Math.min(1, dt * 2.5); mouse.sy += (mouse.y - mouse.sy) * Math.min(1, dt * 2.5);
    camPos.x += Math.sin(time * 0.31) * 0.7; camPos.y += Math.sin(time * 0.53) * 0.45; camPos.z += Math.cos(time * 0.27) * 0.7;
    camTgt.x += mouse.sx * 9; camTgt.y -= mouse.sy * 5;
  }
  camera.position.copy(camPos); camera.lookAt(camTgt);
  sky.position.copy(camPos); stars.position.copy(camPos);
  const step = waterSize / waterSeg;
  water.position.set(Math.round(camTgt.x / step) * step, 0, Math.round(camTgt.z / step) * step);
  farWater.position.x = camPos.x; farWater.position.z = camPos.z;
  // keep the shadow frustum on what we are looking at
  const focus = _v.copy(camTgt).lerp(camPos, 0.25); focus.y = 0;
  sun.target.position.copy(focus);
  sun.position.copy(focus).addScaledVector(e.dir.y > 0.02 ? e.dir : _w.set(e.dir.x, 0.25, e.dir.z).normalize(), 220);

  // world: cranes speed up while the ship is being loaded
  const load = clamp((p - 0.215) / 0.07);
  docked.fill = smooth(load);
  writeCranes(time + load * 40, 1 + (load > 0 && load < 1 ? 1.6 : 0));
  const f = clamp((p - 0.36) / 0.36);
  for (const s of fleet) fleetPose(s, f);
  anchored.forEach((s, k) => { s.yaw = ANCH[k][2] + Math.sin(time * 0.05 + k) * 0.06; });
  const nBoxes = writeShips(time);
  shipBoxes.count = nBoxes; shipBoxes.instanceMatrix.needsUpdate = true;

  // wakes: fleet in transit and tugs
  let wn = 0;
  const transit = f > 0.002 && f < 0.998 ? 1 : 0;
  for (const s of fleet) {
    if (!transit) continue;
    _e.set(0, s.yaw, 0, 'YXZ'); _q.setFromEuler(_e);
    _w.set(0, 0.62, -11.5).applyQuaternion(_q).add(s.pos);
    _m.compose(_w, _q, _s.set(5.5, 1, 26));
    wakes.setMatrixAt(wn++, _m);
  }
  TUGS.forEach((g, i) => {
    const a = time * g.sp + g.ph;
    const x = g.cx + Math.cos(a) * g.rx, z = g.cz + Math.sin(a) * g.rz;
    const dx = -Math.sin(a) * g.rx * Math.sign(g.sp), dz = Math.cos(a) * g.rz * Math.sign(g.sp);
    const yaw = Math.atan2(dx, dz);
    setInst(tugs, i, x, Math.sin(time * 1.1 + i) * 0.15, z, yaw, 1, 1, 1, Math.sin(time * 0.9 + i) * 0.03);
    moveLight(g.l, x, 4.6, z);
    _e.set(0, yaw, 0, 'YXZ'); _q.setFromEuler(_e);
    _m.compose(_w.set(x - Math.sin(yaw) * 4.2, 0.62, z - Math.cos(yaw) * 4.2), _q, _s.set(2.6, 1, 12));
    wakes.setMatrixAt(wn++, _m);
  });
  tugs.instanceMatrix.needsUpdate = true;
  wakes.count = wn; wakes.instanceMatrix.needsUpdate = true;

  // rtg, buoys, turbines, lighthouse
  setInst(rtg, 0, -66 + Math.sin(time * 0.08) * 20, 2.5, -19.5); rtg.instanceMatrix.needsUpdate = true;
  BUOYS.forEach((b, i) => setInst(buoys, i, b.x, Math.sin(time * 1.2 + b.ph) * 0.22 - 0.2, b.z, 0, 1, 1, 1, Math.sin(time * 0.9 + b.ph) * 0.08, Math.cos(time * 0.8 + b.ph) * 0.07));
  buoys.instanceMatrix.needsUpdate = true;
  writeTurbines(time);
  writeTrucks(time);
  lhBeam.rotation.y = time * 0.55;
  beamMat.uniforms.uI.value = smooth(clamp((e.night - 0.15) / 0.45)) * 0.28;
  lhBeam.visible = beamMat.uniforms.uI.value > 0.002;

  // clouds and mist drift; their color follows the sky
  cloudMat.color.copy(e.hor).lerp(_white, 0.35 * (1 - e.night)).multiplyScalar(0.55 * (1 - e.night * 0.7));
  cloudMat.emissive.copy(e.hor).lerp(e.top, 0.25).multiplyScalar(0.62 * (1 - e.night * 0.55));
  CLOUDS.forEach((c, i) => setInst(clouds, i, ((c.x + time * c.sp + 600) % 1500) - 600, c.y, c.z, 0, c.s * 1.3, c.s * 0.34, c.s));
  clouds.instanceMatrix.needsUpdate = true;
  MIST.forEach((m) => { m.material.opacity = e.mist * 0.55; m.material.color.copy(e.fog); m.position.x = m.userData.x + Math.sin(time * 0.05 * m.userData.sp) * 30; m.visible = e.mist > 0.02; });

  // gulls circle whatever we are looking at, and go home at night
  gullCenter.lerp(_w.set(camTgt.x, 0, camTgt.z), Math.min(1, dt * 0.6) || 1);
  const gullScale = 1 - smooth(clamp((e.night - 0.2) / 0.4));
  GULLS.forEach((g, i) => {
    const a = time * g.sp + g.ph;
    const x = gullCenter.x + Math.cos(a) * g.r, z = gullCenter.z + Math.sin(a) * g.r, y = g.y + Math.sin(time * 0.7 + i) * 2;
    const yaw = Math.atan2(-Math.sin(a) * Math.sign(g.sp), Math.cos(a) * Math.sign(g.sp));
    const flap = Math.sin(time * g.fl + i) * 0.5;
    const bank = Math.sign(g.sp) * 0.25;
    const gs = gullScale * smooth(clamp((Math.hypot(x - camPos.x, y - camPos.y, z - camPos.z) - 45) / 25));
    setInst(gullsL, i, x, y, z, yaw, gs, gs, gs, flap + bank);
    setInst(gullsR, i, x, y, z, yaw, gs, gs, gs, -flap + bank);
  });
  gullsL.instanceMatrix.needsUpdate = true; gullsR.instanceMatrix.needsUpdate = true;

  glows.flush(); refl.flush();
  renderer.render(scene, camera);
  writeOverlay(p, e);
  writeLabels(p);
}

/* ---------- boot ---------- */
glows.done(); refl.done();
[yard, shipBoxes, carried, buoys, rocks, truckBoxes].forEach((m) => m.instanceColor && (m.instanceColor.needsUpdate = true));
yard.instanceMatrix.needsUpdate = true;

function resize() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight, false);
  buildPath();
  dirty = true;
}
addEventListener('resize', resize);
reduceMQ.addEventListener('change', (e) => { reduce = e.matches; if (reduce && lenis) { lenis.destroy(); lenis = null; } else if (!reduce) startLenis(); dirty = true; });

let running = false;
function loop() { if (!running) return; frame(); requestAnimationFrame(loop); }
function start() { if (running) return; running = true; clock.getDelta(); requestAnimationFrame(loop); }
function stop() { running = false; }
document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

frame();
start();
const lift = () => requestAnimationFrame(() => requestAnimationFrame(() => {
  fogEl.classList.add('is-lifted');
  fogEl.querySelector('.fog-text').textContent = 'The fog has lifted';
  setTimeout(() => fogEl.remove(), 2200);
}));
(document.fonts?.ready ?? Promise.resolve()).then(lift);
