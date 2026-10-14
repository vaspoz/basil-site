import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Altitude: a climb from the polders around Breda to the night sky.
 * Scroll position p (0..1) drives camera, time of day and every scene.
 * ------------------------------------------------------------------ */

const root = document.documentElement;
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('world');
const loader = document.getElementById('loader');

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const D2R = Math.PI / 180;
let seed = 1977;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const rr = (a, b) => a + (b - a) * rnd();

function stillMode() { root.classList.add('still'); }

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: REDUCE });
  if (!renderer.getContext()) throw new Error('no gl');
} catch (e) {
  stillMode();
  loader && loader.classList.add('done');
  throw e;
}

THREE.ColorManagement.enabled = false;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
const small = () => Math.min(innerWidth, innerHeight) < 600;
let dprCap = small() ? 1.5 : 2;
let dpr = Math.min(devicePixelRatio || 1, dprCap);
renderer.setPixelRatio(dpr);
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.3, 140000);
camera.rotation.order = 'YXZ';
scene.fog = new THREE.FogExp2(0xc99a93, 0.00016);

/* ---------------- colour: interpolate in OKLab so gradients stay clean ---------------- */
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const l2s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055);
function hexToOk(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = s2l((n >> 16 & 255) / 255), g = s2l((n >> 8 & 255) / 255), b = s2l((n & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function okToColor(L, a, b, out) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  out.setRGB(
    clamp(l2s(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    clamp(l2s(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    clamp(l2s(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)));
  return out;
}

/* ---------------- time of day along the climb ---------------- */
const ENV = {
  dawn:    { zen: '#202f63', hor: '#eea58a', fog: '#c4958f', sun: '#ffc08a', sunEl: 2.2, sunAz: -5, sunI: 1, amb: '#6a6f98', fogD: 0.00016, cLit: '#ffbda3', cSh: '#565a88', stars: 0.18, mist: 1, aur: 0 },
  dawn2:   { zen: '#2c4683', hor: '#f4bc98', fog: '#d1a99c', sun: '#ffcf9c', sunEl: 6, sunAz: -4, sunI: 1, amb: '#7c84a8', fogD: 0.00014, cLit: '#ffcfb3', cSh: '#6a6f96', stars: 0, mist: 0.8, aur: 0 },
  morning: { zen: '#4677c2', hor: '#d3e1ea', fog: '#c1d1dd', sun: '#fff0d8', sunEl: 26, sunAz: -24, sunI: 1, amb: '#9aabc4', fogD: 0.00011, cLit: '#ffffff', cSh: '#9aaecb', stars: 0, mist: 0.25, aur: 0 },
  azure:   { zen: '#1d5bd2', hor: '#b7d1f5', fog: '#b0cbf1', sun: '#fffaf0', sunEl: 48, sunAz: 62, sunI: 1, amb: '#a6bee6', fogD: 0.0001, cLit: '#f6f9ff', cSh: '#7c9bd9', stars: 0, mist: 0, aur: 0 },
  amber:   { zen: '#3162ad', hor: '#f5cd96', fog: '#eec793', sun: '#ffd99c', sunEl: 30, sunAz: 58, sunI: 1, amb: '#c6b69a', fogD: 0.0001, cLit: '#ffe2b2', cSh: '#cc8b52', stars: 0, mist: 0, aur: 0 },
  golden:  { zen: '#33558f', hor: '#ffbf80', fog: '#efb183', sun: '#ffbb74', sunEl: 7, sunAz: 46, sunI: 1, amb: '#a69cb4', fogD: 0.00009, cLit: '#ffd3a2', cSh: '#966c8d', stars: 0, mist: 0, aur: 0 },
  sunset:  { zen: '#262a60', hor: '#ff9070', fog: '#c4787e', sun: '#ff8250', sunEl: -0.6, sunAz: 40, sunI: 0.95, amb: '#6a5884', fogD: 0.0001, cLit: '#ef9581', cSh: '#544776', stars: 0.08, mist: 0, aur: 0 },
  dusk:    { zen: '#0d1535', hor: '#373e7a', fog: '#2a2f62', sun: '#b8687a', sunEl: -8, sunAz: 40, sunI: 0.45, amb: '#30386a', fogD: 0.0001, cLit: '#3d4883', cSh: '#1a1f45', stars: 0.65, mist: 0, aur: 1 },
  night:   { zen: '#040816', hor: '#161e48', fog: '#121838', sun: '#56669e', sunEl: -20, sunAz: 40, sunI: 0.12, amb: '#1b2246', fogD: 0.0001, cLit: '#232c5a', cSh: '#0e132e', stars: 1, mist: 0, aur: 0.6 },
};
const ENV_KEYS = [[0, 'dawn'], [0.09, 'dawn2'], [0.2, 'morning'], [0.33, 'azure'], [0.45, 'amber'], [0.575, 'golden'], [0.7, 'sunset'], [0.79, 'dusk'], [0.89, 'night'], [1, 'night']];
const COLOR_KEYS = ['zen', 'hor', 'fog', 'sun', 'amb', 'cLit', 'cSh'];
for (const k in ENV) for (const c of COLOR_KEYS) ENV[k]['_' + c] = hexToOk(ENV[k][c]);

const env = {};
for (const c of COLOR_KEYS) env[c] = new THREE.Color();
function envAt(p) {
  let i = 0;
  while (i < ENV_KEYS.length - 2 && p > ENV_KEYS[i + 1][0]) i++;
  const [p0, a] = ENV_KEYS[i], [p1, b] = ENV_KEYS[i + 1];
  const t = sstep(p0, p1, p);
  const A = ENV[a], B = ENV[b];
  for (const c of COLOR_KEYS) {
    const x = A['_' + c], y = B['_' + c];
    okToColor(lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t), env[c]);
  }
  for (const k of ['sunEl', 'sunAz', 'sunI', 'fogD', 'stars', 'aur', 'mist']) env[k] = lerp(A[k], B[k], t);
  return env;
}

/* ---------------- camera path ---------------- */
// [p, x, y, z, yaw, pitch]   yaw < 0 turns right, pitch < 0 looks down
const CAM = [
  [0.000, 1.2, 2.4, 0, 3, 7],
  [0.060, 1.2, 3.2, -34, 2.5, 5.5],
  [0.110, 0, 70, -150, 0, -14],
  [0.160, 0, 300, -330, -2, -30],
  [0.200, 10, 520, -480, -4, -20],
  [0.235, 18, 585, -540, -5, -18],
  [0.272, 40, 840, -790, -8, -3],
  [0.302, 60, 1030, -1000, -11, 0],
  [0.338, 80, 1250, -1250, -14, -12],
  [0.372, 100, 1350, -1440, -16, -4],
  [0.428, 120, 1490, -1690, -20, 19],
  [0.465, 130, 1590, -1850, -22, 17],
  [0.500, 140, 1830, -2050, -24, 3],
  [0.540, 160, 2150, -2300, -27, -7],
  [0.600, 180, 2300, -2600, -30, -4],
  [0.640, 190, 2380, -2800, -33, 1],
  [0.700, 210, 2550, -3100, -37, 9],
  [0.760, 230, 2750, -3400, -41, 17],
  [0.820, 245, 2950, -3650, -44, 26],
  [0.880, 255, 3100, -3850, -46, 31],
  [0.940, 262, 3220, -4000, -48, 27],
  [1.000, 270, 3300, -4100, -50, 24],
];
// monotone cubic (Fritsch–Carlson): smooth, and never overshoots below the ground
const TAN = {};
function tangents(keys, col) {
  const n = keys.length, d = [], m = new Array(n).fill(0);
  for (let k = 0; k < n - 1; k++) d.push((keys[k + 1][col] - keys[k][col]) / (keys[k + 1][0] - keys[k][0]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let k = 1; k < n - 1; k++) m[k] = d[k - 1] * d[k] <= 0 ? 0 : (d[k - 1] + d[k]) / 2;
  for (let k = 0; k < n - 1; k++) {
    if (d[k] === 0) { m[k] = m[k + 1] = 0; continue; }
    const a = m[k] / d[k], b = m[k + 1] / d[k];
    if (a < 0) m[k] = 0;
    if (b < 0) m[k + 1] = 0;
    const s2 = a * a + b * b;
    if (s2 > 9) { const tau = 3 / Math.sqrt(s2); m[k] = tau * a * d[k]; m[k + 1] = tau * b * d[k]; }
  }
  return m;
}
function hermite(keys, col, p) {
  const m = TAN[col] || (TAN[col] = tangents(keys, col));
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1][0]) i++;
  const k1 = keys[i], k2 = keys[i + 1];
  const h = k2[0] - k1[0];
  const t = clamp((p - k1[0]) / h);
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * k1[col] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * k2[col] + (t3 - t2) * h * m[i + 1];
}
function camAt(p) {
  return { x: hermite(CAM, 1, p), y: hermite(CAM, 2, p), z: hermite(CAM, 3, p), yaw: hermite(CAM, 4, p) * D2R, pitch: hermite(CAM, 5, p) * D2R };
}
const fwdOf = (yaw) => new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
const rightOf = (yaw) => new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

/* ---------------- shared GLSL ---------------- */
const NOISE = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.3); a *= .5; } return s; }
`;
const FOG = /* glsl */`
uniform vec3 uFogCol; uniform vec3 uSunCol; uniform vec3 uSunDir; uniform float uFogD;
vec3 fogColorDir(vec3 dir){ return mix(uFogCol, uSunCol, pow(max(dot(dir, uSunDir), 0.), 6.) * .5); }
vec3 applyFog(vec3 col, vec3 wp){
  vec3 v = wp - cameraPosition; float d = length(v);
  float f = 1. - exp(-uFogD * uFogD * d * d);
  return mix(col, fogColorDir(v / d), f);
}
`;
const MIST = /* glsl */`
vec3 mist(vec3 col, vec3 wp){
  float d = length(wp - cameraPosition);
  float m = (1. - exp(-d * .0005)) * uMist * (1. - smoothstep(4., 320., cameraPosition.y)) * (1. - smoothstep(10., 70., wp.y));
  return mix(col, fogColorDir(normalize(wp - cameraPosition)) * 1.04, m * .75);
}
`;
const shared = {
  uFogCol: { value: new THREE.Color() },
  uSunCol: { value: new THREE.Color() },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uFogD: { value: 0.00015 },
  uTime: { value: 0 },
  uZen: { value: new THREE.Color() },
  uHor: { value: new THREE.Color() },
  uAmb: { value: new THREE.Color() },
  uMist: { value: 0 },
};

/* ---------------- sky ---------------- */
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(100000, 48, 24),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { ...shared, uSunI: { value: 1 }, uAurora: { value: 0 }, uAurDir: { value: new THREE.Vector3(0, 0, -1) } },
    vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position.z = gl_Position.w; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uZen, uHor; uniform float uSunI, uAurora, uTime; uniform vec3 uAurDir;
      varying vec3 vDir;
      ${NOISE}
      ${FOG}
      void main(){
        vec3 d = normalize(vDir);
        float e = d.y;
        vec3 col = mix(uHor, uZen, pow(clamp(e, 0., 1.), .48));
        float sd = max(dot(d, uSunDir), 0.);
        col += uSunCol * (pow(sd, 5.) * .32 + pow(sd, 60.) * .45) * uSunI;
        col = mix(col, fogColorDir(d), smoothstep(.06, -.015, e));
        float disc = smoothstep(.99955, .99972, sd) * smoothstep(-.012, .004, e - .0);
        col = mix(col, uSunCol * 1.25 + .15, disc * uSunI * step(-.05, uSunDir.y));
        if (uAurora > .001) {
          vec3 a = normalize(vec3(uAurDir.x, 0., uAurDir.z));
          float az = atan(d.x * a.z - d.z * a.x, dot(d.xz, a.xz));
          float sector = smoothstep(1.5, .3, abs(az));
          float curtain = pow(vnoise(vec2(az * 7. + uTime * .05, 3.1)), 2.) * .7 + pow(vnoise(vec2(az * 23. - uTime * .09, 8.)), 3.) * .9;
          float h = smoothstep(.03, .14, e) * (1. - smoothstep(.16, .62, e + .08 * vnoise(vec2(az * 4., uTime * .1))));
          vec3 ac = mix(vec3(.25, .95, .72), vec3(.58, .42, .98), smoothstep(.12, .48, e));
          col += ac * curtain * h * sector * uAurora * .55;
        }
        col += (hash12(gl_FragCoord.xy + fract(uTime)) - .5) / 255.;
        gl_FragColor = vec4(col, 1.);
      }`,
  }),
);
sky.renderOrder = -10;
scene.add(sky);

/* ---------------- stars + satellite ---------------- */
const starGeo = new THREE.BufferGeometry();
{
  const N = 2600, pos = new Float32Array(N * 3), size = new Float32Array(N), ph = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const u = rnd(), v = rr(-0.08, 1);
    const th = u * Math.PI * 2, y = v, r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(th) * r * 90000, y * 90000, Math.sin(th) * r * 90000], i * 3);
    size[i] = Math.pow(rnd(), 6) * 3.2 + 0.9;
    ph[i] = rnd() * 6.28;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  starGeo.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
}
const starMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  uniforms: { uTime: shared.uTime, uStars: { value: 0 }, uDpr: { value: dpr } },
  vertexShader: /* glsl */`
    attribute float aSize; attribute float aPh; uniform float uTime, uDpr; varying float vA; varying float vY;
    void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_Position.z = gl_Position.w * .9999;
      vA = .65 + .35 * sin(uTime * (1.2 + aPh * .3) + aPh * 9.); vY = normalize(position).y; gl_PointSize = aSize * uDpr; }`,
  fragmentShader: /* glsl */`
    uniform float uStars; varying float vA; varying float vY;
    void main(){ float d = length(gl_PointCoord - .5) * 2.; float a = smoothstep(1., .1, d) * vA * uStars * smoothstep(-.02, .12, vY);
      gl_FragColor = vec4(vec3(.92, .94, 1.), a); }`,
});
const stars = new THREE.Points(starGeo, starMat);
stars.frustumCulled = false;
stars.renderOrder = -9;
scene.add(stars);

const satGeo = new THREE.BufferGeometry();
satGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
const satMat = new THREE.PointsMaterial({ color: 0xfff4e0, size: 3.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
const satellite = new THREE.Points(satGeo, satMat);
satellite.frustumCulled = false;
scene.add(satellite);

/* ---------------- the ground: procedural polder ---------------- */
const TOWN = new THREE.Vector2(560, -1780);
const groundMat = new THREE.ShaderMaterial({
  fog: false,
  uniforms: { ...shared },
  vertexShader: /* glsl */`varying vec3 vWp; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: /* glsl */`
    uniform vec3 uZen, uHor, uAmb; uniform float uTime, uMist;
    varying vec3 vWp;
    ${NOISE}
    ${FOG}
    ${MIST}
    float band(float d, float hw){ float fw = max(fwidth(d), 1e-3); return clamp((hw - d) / fw + .5, 0., 1.) * clamp(2. * hw / fw, 0., 1.); }
    float inR(float x, float a, float b){ return band(abs(x - (a + b) * .5), (b - a) * .5); }
    vec3 pick(float h, float h2, float bulb){
      vec3 g = vec3(.36, .44, .24);
      if (bulb > .5 && h > .25) { float k = floor(h2 * 5.);
        vec3 t = k < 1. ? vec3(.7,.24,.24) : k < 2. ? vec3(.84,.7,.3) : k < 3. ? vec3(.76,.46,.56) : k < 4. ? vec3(.5,.38,.6) : vec3(.82,.8,.74);
        return mix(t, g, .22); }
      if (h < .66) return mix(vec3(.3, .41, .19), vec3(.39, .49, .23), h2);
      if (h < .8) return mix(vec3(.45, .52, .25), vec3(.52, .57, .29), h2);
      if (h < .88) return mix(vec3(.38, .31, .23), vec3(.45, .37, .27), h2);
      if (h < .93) return mix(vec3(.62, .58, .37), vec3(.68, .63, .41), h2);
      if (h < .97) return vec3(.25, .35, .18);
      return vec3(.6, .66, .7);
    }
    vec3 water(vec3 V, vec2 p){
      vec2 q = p * .07 + vec2(uTime * .12, uTime * .09);
      vec3 n = normalize(vec3((vnoise(q) - .5) * .1, 1., (vnoise(q + 7.3) - .5) * .1));
      vec3 R = reflect(V, n);
      vec3 skyc = mix(uHor, uZen, pow(clamp(R.y, 0., 1.), .5));
      skyc += uSunCol * pow(max(dot(R, uSunDir), 0.), 6.) * .3;
      float fres = .22 + .78 * pow(1. - clamp(-V.y, 0., 1.), 5.);
      vec3 c = mix(vec3(.09, .14, .17), skyc, fres);
      c += uSunCol * pow(max(dot(R, uSunDir), 0.), 260.) * 3. * step(-.03, uSunDir.y);
      return c;
    }
    void main(){
      vec2 p = vWp.xz;
      vec3 V = normalize(vWp - cameraPosition);
      vec2 B = vec2(820., 560.);
      vec2 bc = floor(p / B);
      vec2 bl = p - bc * B;
      float sp = hash12(bc + 21.7);
      float splitAt = mix(.3, .7, hash12(bc + 5.9)) * B.x;
      vec2 sid = bc;
      if (sp > .45 && bl.x > splitAt) sid += vec2(37.1, 11.3);
      float h = hash12(sid);
      float pastureOnly = step(.42, hash12(sid + 2.2));
      float bulb = step(hash12(bc * 1.37 + 4.1), .07) * step(-3500., p.y) * step(p.y, 600.);
      float alongX = step(.5, h);
      float sw = mix(24., 44., hash12(bc + 7.));
      float coord = mix(bl.x, bl.y, alongX);
      float si = floor(coord / sw);
      float sf = coord - si * sw;
      float hs = hash12(vec2(si, h * 91.7) + sid);
      float hs2 = hash12(vec2(si * 1.7, h * 13.1) - sid);
      if (pastureOnly > .5) { hs *= .66; hs2 = .35 + hs2 * .4; }
      vec3 c = pick(hs, hs2, bulb);
      float fwc = fwidth(coord);
      float vis = 1. - smoothstep(.1 * sw, .4 * sw, fwc);
      c = mix(vec3(.35, .44, .22), c, vis);
      float tex = vnoise(p * .045) * .6 + vnoise(p * .23) * .4;
      c *= .8 + .36 * tex;
      c = mix(c, c * vec3(.92, 1.04, .9), smoothstep(.45, .75, vnoise(p * .0021)));
      float fw4 = fwidth(coord * 3.);
      c *= 1. - .07 * (.5 + .5 * sin(coord * 3.)) * (1. - smoothstep(.4, 1.4, fw4));
      vec3 L = uAmb * .78 + uHor * .22 * (1. - smoothstep(.1, .5, uSunDir.y)) + uSunCol * max(uSunDir.y, 0.) * .9;
      c *= L;
      vec3 W = water(V, p);
      float sh = smoothstep(.5, .66, fbm(p * .0009 + vec2(uTime * .006, 0.) + 4.2));
      c *= 1. - sh * .32 * smoothstep(.05, .35, uSunDir.y);
      W *= 1. - sh * .2;
      if (hs > .97 && bulb < .5) c = mix(c, W * 1.1 + .05, .55 * vis);
      float dd = min(sf, sw - sf);
      c = mix(c, mix(W, vec3(.16, .22, .2) * L, .45), band(dd, .5) * .9);
      if (sp > .45) c = mix(c, W * .85, band(abs(bl.x - splitAt), .9));
      float dx = min(bl.x, B.x - bl.x);
      float dz = min(bl.y, B.y - bl.y);
      c = mix(c, W, band(dx, 3.4));
      c = mix(c, vec3(.4, .39, .37) * L, band(abs(dz - 7.), 1.8));
      // river Mark
      float xr = 2600. + 380. * sin(p.y * .0011) + 150. * sin(p.y * .0031 + 1.);
      c = mix(c, vec3(.3, .4, .22) * L, inR(p.x - xr, -34., 34.));
      c = mix(c, W, inR(p.x - xr, -26., 26.));
      // Breda: rooftops inside a ring canal
      vec2 tv = p - vec2(${TOWN.x.toFixed(1)}, ${TOWN.y.toFixed(1)});
      float tr = length(tv);
      if (tr < 480.) {
        float ta = atan(tv.y, tv.x);
        float edge = 315. + 48. * sin(3. * ta + 1.) + 26. * sin(5. * ta + 2.3);
        vec2 cs = vec2(17., 12.);
        vec2 cc = floor(p / cs);
        vec2 cl = p - cc * cs;
        float hh = hash12(cc + 3.3);
        vec3 roof = hh < .45 ? vec3(.62, .36, .27) : hh < .75 ? vec3(.42, .43, .45) : vec3(.3, .4, .22);
        roof *= .85 + .3 * hash12(cc * 2.1);
        roof *= L;
        float street = max(band(min(cl.x, cs.x - cl.x), 1.4), band(min(cl.y, cs.y - cl.y), 1.1));
        roof = mix(roof, vec3(.55, .53, .5) * L, street);
        float um = 1. - smoothstep(edge - 8., edge + 4., tr);
        c = mix(c, roof, um);
        c = mix(c, W, band(abs(tr - edge - 16.), 7.) * smoothstep(-.2, .4, sin(ta * 2. + 1.)));
      }
      // the road out of town: asphalt with red cycle lanes, verges, and the canal
      float m = step(p.y, 240.) * (1. - smoothstep(-1.5, 0., p.y - 240.));
      vec3 verge = vec3(.33, .45, .2) * L * (.88 + .24 * tex);
      c = mix(c, verge, m * inR(p.x, -12., 33.));
      c = mix(c, vec3(.5, .26, .21) * L * (.92 + .1 * tex), m * inR(p.x, -3.4, 3.4));
      c = mix(c, vec3(.23, .23, .24) * L * (.9 + .15 * tex), m * inR(p.x, -2.05, 2.05));
      c = mix(c, W, m * inR(p.x, 13.5, 29.));
      c = mist(c, vWp);
      c = applyFog(c, vWp);
      c += (hash12(gl_FragCoord.xy) - .5) / 255.;
      gl_FragColor = vec4(c, 1.);
    }`,
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(160000, 160000, 96, 96), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.set(0, 0, -3000);
scene.add(ground);

/* ---------------- lights for meshes ---------------- */
const sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
const hemi = new THREE.HemisphereLight(0xaabbdd, 0x3a3a2c, 1.0);
scene.add(sunLight, hemi, sunLight.target);

const lambert = (opts = {}) => new THREE.MeshLambertMaterial({ color: 0xffffff, ...opts });
const dummy = new THREE.Object3D();
function instanced(geo, mat, list) {
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  const c = new THREE.Color();
  list.forEach((it, i) => {
    dummy.position.set(it.p[0], it.p[1], it.p[2]);
    dummy.rotation.set(0, it.r || 0, 0);
    dummy.scale.set(it.s[0], it.s[1], it.s[2]);
    dummy.updateMatrix();
    m.setMatrixAt(i, dummy.matrix);
    m.setColorAt(i, c.set(it.c));
  });
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.frustumCulled = false;
  return m;
}
const nearRoad = (x, z) => z < 300 && x > -16 && x < 36;

// trees: painted billboards, lit by the sun and rim-lit when backlit
const townR = (a) => 315 + 48 * Math.sin(3 * a + 1) + 26 * Math.sin(5 * a + 2.3);
const inTown = (x, z, pad = 0) => { const dx = x - TOWN.x, dz = z - TOWN.y; return Math.hypot(dx, dz) < townR(Math.atan2(dz, dx)) + pad; };
const treeTex = (() => {
  const TW = 256, TH = 512, c = document.createElement('canvas'); c.width = TW * 3; c.height = TH;
  const g = c.getContext('2d');
  // envelope per kind: poplar (tall, narrow), round crown, low wide willow; leaves are many small dabs
  const env = [
    (y) => 0.34 * Math.sin(Math.PI * Math.min(1, Math.pow(y, 0.75))) * (y < 0.08 ? 0 : 1),
    (y) => (y < 0.34 ? 0 : 0.42 * Math.sqrt(Math.max(0, 1 - Math.pow((y - 0.66) / 0.33, 2)))),
    (y) => (y < 0.22 ? 0 : 0.47 * Math.sqrt(Math.max(0, 1 - Math.pow((y - 0.5) / 0.3, 2)))),
  ];
  const draw = (k, x, blur) => {
    x.clearRect(0, 0, TW, TH);
    x.filter = blur ? `blur(${blur}px)` : 'none';
    x.fillStyle = '#fff';
    const N = k === 0 ? 2200 : 1700;
    let s0 = 11 + k * 101;
    const R = () => (s0 = (s0 * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < N; i++) {
      const y = R(), w = env[k](y);
      if (w <= 0) continue;
      const off = R() * 2 - 1, px = 0.5 + off * w * (0.75 + 0.25 * R());
      const r = ((k === 0 ? 3.4 : 4.4) + R() * 5) * (1 - 0.6 * Math.abs(off));
      x.beginPath(); x.arc(px * TW, (1 - y) * TH, r, 0, 7); x.fill();
    }
    for (let y = 0.1; y < 1; y += 0.005) { const w = env[k](y) * 0.6; if (w > 0) x.fillRect((0.5 - w) * TW, (1 - y) * TH - 2, 2 * w * TW, 4); }
    x.filter = 'none';
    return x.getImageData(0, 0, TW, TH).data;
  };
  const cc = document.createElement('canvas'); cc.width = TW; cc.height = TH;
  const x = cc.getContext('2d', { willReadFrequently: true });
  const out = g.createImageData(TW * 3, TH);
  for (let k = 0; k < 3; k++) {
    const full = draw(k, x, 0), soft = draw(k, x, 3);
    for (let y = 0; y < TH; y++) for (let xx = 0; xx < TW; xx++) {
      const i = (y * TW + xx) * 4, o = (y * TW * 3 + k * TW + xx) * 4;
      const a = full[i + 3];
      const leaf = 0.78 + 0.22 * Math.sin(xx * 0.9 + y * 0.45) * Math.sin(y * 0.65 - xx * 0.3);
      out.data[o] = clamp((0.3 + 0.7 * (1 - y / TH)) * leaf) * 255;
      out.data[o + 1] = clamp((1 - soft[i + 3] / 255) * 1.6) * a;
      out.data[o + 2] = 0;
      out.data[o + 3] = a;
      const trunkTop = TH * (k === 0 ? 0.9 : k === 1 ? 0.64 : 0.76);
      if (y > trunkTop && Math.abs(xx - TW / 2) < TW * 0.018 + 1 && a < 250) { out.data[o] = 40; out.data[o + 1] = 0; out.data[o + 3] = 255; }
    }
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; return t;
})();
function treeBillboards(list) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.getAttribute('position'));
  geo.setAttribute('uv', base.getAttribute('uv'));
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(new Float32Array(list.flatMap((t) => [t.x, 0, t.z])), 3));
  geo.setAttribute('aSc', new THREE.InstancedBufferAttribute(new Float32Array(list.flatMap((t) => [t.w, t.h])), 2));
  geo.setAttribute('aTile', new THREE.InstancedBufferAttribute(new Float32Array(list.map((t) => t.k)), 1));
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(list.flatMap((t) => t.c)), 3));
  geo.instanceCount = list.length;
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    fog: false, alphaToCoverage: true, uniforms: { ...shared, uTex: { value: treeTex } },
    vertexShader: /* glsl */`
      attribute vec3 aOff; attribute vec2 aSc; attribute float aTile; attribute vec3 aTint;
      varying vec2 vUv; varying vec3 vWp; varying float vTile; varying vec3 vTint;
      void main(){
        vec3 toCam = cameraPosition - aOff; toCam.y = 0.; toCam = normalize(toCam + vec3(1e-4, 0., 0.));
        vec3 right = vec3(toCam.z, 0., -toCam.x);
        vec3 wp = aOff + right * position.x * aSc.x + vec3(0., (position.y + .5) * aSc.y, 0.);
        vWp = wp; vUv = uv; vTile = aTile; vTint = aTint;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uTex; uniform vec3 uAmb; uniform float uMist;
      varying vec2 vUv; varying vec3 vWp; varying float vTile; varying vec3 vTint;
      ${FOG}
      ${MIST}
      void main(){
        vec4 t = texture2D(uTex, vec2((clamp(vUv.x, .01, .99) + floor(vTile + .5)) / 3., vUv.y));
        if (t.a < .45) discard;
        vec3 V = normalize(vWp - cameraPosition);
        vec3 c = vTint * (uAmb * .62 + uSunCol * max(uSunDir.y, 0.) * .9 * (.4 + .6 * t.r));
        float back = pow(max(dot(V, uSunDir), 0.), 4.) * smoothstep(-.05, .1, uSunDir.y);
        c += uSunCol * t.g * back * .7;
        c = mist(c, vWp);
        c = applyFog(c, vWp);
        gl_FragColor = vec4(c, 1.);
      }`,
  }));
  mesh.frustumCulled = false;
  scene.add(mesh);
}
{
  const G = [[0.17, 0.24, 0.12], [0.2, 0.28, 0.14], [0.15, 0.22, 0.11], [0.23, 0.3, 0.15]];
  const trees = [];
  const tree = (x, z, k, w, h) => trees.push({ x, z, k, w, h, c: G[Math.floor(rnd() * G.length)] });
  for (let z = -26; z > -5200; z -= 11.5) { const h = rr(19, 24); tree(-11 + rr(-0.4, 0.4), z + rr(-1, 1), 0, h * 0.42, h); }
  for (let z = 30; z > -2200; z -= rr(30, 90)) tree(36 + rr(-2, 2), z, 2, rr(9, 13), rr(8, 10));
  for (let k = -24; k < 5; k++) {
    for (let bx = -9; bx < 9; bx++) {
      if (rnd() > 0.22) continue;
      const z = k * 560 + 12, x0 = bx * 820 + 10;
      const kind = rnd() < 0.35 ? 0 : 1;
      for (let x = x0; x < x0 + 800; x += kind ? rr(8, 12) : rr(6, 8)) {
        if (nearRoad(x, z) || inTown(x, z, 30)) continue;
        const h = kind ? rr(9, 13) : rr(17, 23);
        tree(x, z + rr(-1.5, 1.5), kind, kind ? h * 0.95 : h * 0.42, h);
      }
    }
  }
  // farmsteads
  const houses = [], roofs = [];
  for (let i = 0; i < 90; i++) {
    const x = rr(-7000, 7000), z = rr(-14000, 1500);
    if (Math.abs(x) < 120 || inTown(x, z, 200)) continue;
    const r = rnd() < 0.5 ? 0 : Math.PI / 2;
    const w = rr(9, 12), l = rr(14, 20), hgt = rr(4, 5.5);
    houses.push({ p: [x, hgt / 2, z], s: [w, hgt, l], r, c: '#c9bba6' });
    roofs.push({ p: [x, hgt, z], s: [w * 1.08, rr(5, 7), l * 1.04], r, c: rnd() < 0.6 ? '#a4533c' : '#5c5f68' });
    const bw = rr(14, 20), bl = rr(28, 44);
    houses.push({ p: [x + 24, 3.5, z + 10], s: [bw, 7, bl], r, c: '#a39a8b' });
    roofs.push({ p: [x + 24, 7, z + 10], s: [bw * 1.06, 6, bl * 1.02], r, c: '#55585f' });
    for (let t = 0; t < 7; t++) tree(x + rr(-30, 50), z + rr(-30, 40), 1, rr(10, 14), rr(10, 14));
  }
  // Breda: brick houses, slate and tile roofs, trees in the gardens
  for (let gx = -400; gx <= 400; gx += 20) {
    for (let gz = -400; gz <= 400; gz += 15) {
      const x = TOWN.x + gx + rr(-3, 3), z = TOWN.y + gz + rr(-2, 2);
      if (!inTown(x, z, -12) || rnd() < 0.34 || Math.hypot(gx, gz) < 60) continue;
      if (rnd() < 0.12) { tree(x, z, 1, rr(9, 13), rr(9, 13)); continue; }
      const w = rr(8, 12), l = rr(10, 15), hgt = rr(7, 13);
      const r = rnd() < 0.5 ? 0 : Math.PI / 2;
      houses.push({ p: [x, hgt / 2, z], s: [w, hgt, l], r, c: ['#b9806a', '#c79a80', '#a8745f', '#d8cbb6'][Math.floor(rnd() * 4)] });
      roofs.push({ p: [x, hgt, z], s: [w * 1.04, rr(4, 6.5), l], r, c: rnd() < 0.6 ? '#b0583f' : '#61646d' });
    }
  }
  treeBillboards(trees);
  scene.add(instanced(new THREE.BoxGeometry(1, 1, 1), lambert(), houses));
  const prism = new THREE.BufferGeometry();
  prism.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5,
    0.5, 0, -0.5, -0.5, 0, -0.5, 0, 1, -0.5,
    -0.5, 0, -0.5, -0.5, 0, 0.5, 0, 1, 0.5, -0.5, 0, -0.5, 0, 1, 0.5, 0, 1, -0.5,
    0.5, 0, 0.5, 0.5, 0, -0.5, 0, 1, -0.5, 0.5, 0, 0.5, 0, 1, -0.5, 0, 1, 0.5,
  ], 3));
  prism.computeVertexNormals();
  scene.add(instanced(prism, lambert({ side: THREE.DoubleSide }), roofs));
}

// Grote Kerk tower, the landmark of Breda
{
  const g = new THREE.Group();
  const stone = lambert({ color: 0x9a8f80 });
  const dark = lambert({ color: 0x3f4046 });
  const add = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; g.add(m); return m; };
  add(new THREE.BoxGeometry(15, 52, 15), stone, 26);
  add(new THREE.CylinderGeometry(6.2, 7.4, 22, 8), stone, 63);
  add(new THREE.CylinderGeometry(4.4, 5, 10, 8), stone, 79);
  add(new THREE.ConeGeometry(4.6, 16, 8), dark, 92);
  const nave = new THREE.Mesh(new THREE.BoxGeometry(26, 24, 72), stone);
  nave.position.set(0, 12, 44); g.add(nave);
  const nr = new THREE.Mesh(new THREE.ConeGeometry(19, 14, 4, 1), dark);
  nr.rotation.y = Math.PI / 4; nr.scale.set(1, 1, 2.6); nr.position.set(0, 31, 44); g.add(nr);
  g.position.set(TOWN.x, 0, TOWN.y);
  scene.add(g);
}

// windmills and wind turbines
const spinners = [];
function windmill(x, z, rot, s = 1) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(3, 5.4, 18, 8), lambert({ color: 0x2c2926 }));
  body.position.y = 9; g.add(body);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(3.7, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), lambert({ color: 0x3b3631 }));
  cap.position.y = 18; g.add(cap);
  const hub = new THREE.Group(); hub.position.set(0, 18.6, 3.9); g.add(hub);
  const sailMat = lambert({ color: 0xd9d1c3 });
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2;
    const sail = new THREE.Mesh(new THREE.BoxGeometry(2.1, 12.5, 0.2), sailMat); sail.position.set(1.0, 7, 0); arm.add(sail);
    const spar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 14, 0.3), lambert({ color: 0x2a2724 })); spar.position.y = 7; arm.add(spar);
    hub.add(arm);
  }
  g.position.set(x, 0, z); g.rotation.y = rot; g.scale.setScalar(s);
  scene.add(g);
  spinners.push({ o: hub, speed: 0.55 });
}
windmill(-170, -560, 0.25, 1.1);
windmill(420, -1320, -0.3);
windmill(-900, -2600, 0.1);
{
  const white = lambert({ color: 0xe6e9ec });
  for (let i = 0; i < 12; i++) {
    const g = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 2.4, 92, 8), white); tower.position.y = 46; g.add(tower);
    const nac = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.4, 9), white); nac.position.set(0, 93, -1); g.add(nac);
    const hub = new THREE.Group(); hub.position.set(0, 93, 3.8); g.add(hub);
    for (let b = 0; b < 3; b++) {
      const arm = new THREE.Group(); arm.rotation.z = b * Math.PI * 2 / 3;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.8, 48, 0.4), white); blade.position.y = 24; arm.add(blade);
      hub.add(arm);
    }
    hub.rotation.z = rnd() * 6;
    g.position.set(-3300 + i * 600, 0, -6800 + rr(-60, 60));
    scene.add(g);
    spinners.push({ o: hub, speed: rr(0.9, 1.15) });
  }
}

// small life: cyclists, cows, geese
function spriteTex(draw, w = 128, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
}
const bikeTex = spriteTex((g) => {
  g.strokeStyle = '#17161c'; g.fillStyle = '#17161c'; g.lineWidth = 6; g.lineCap = 'round';
  g.beginPath(); g.arc(34, 98, 20, 0, 7); g.stroke();
  g.beginPath(); g.arc(94, 98, 20, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(34, 98); g.lineTo(58, 70); g.lineTo(88, 72); g.lineTo(94, 98); g.moveTo(58, 70); g.lineTo(64, 98); g.lineTo(88, 72); g.stroke();
  g.lineWidth = 10; g.beginPath(); g.moveTo(60, 66); g.lineTo(70, 30); g.lineTo(86, 60); g.stroke();
  g.beginPath(); g.arc(70, 18, 10, 0, 7); g.fill();
  g.lineWidth = 7; g.beginPath(); g.moveTo(62, 66); g.lineTo(70, 84); g.lineTo(64, 98); g.stroke();
});
const cyclists = [];
{
  const mat = new THREE.SpriteMaterial({ map: bikeTex, transparent: true, depthWrite: false });
  for (let i = 0; i < 12; i++) {
    const s = new THREE.Sprite(mat);
    const away = i % 3 !== 0;
    s.scale.set(1.9, 1.9, 1);
    s.position.set(away ? -2.7 : 2.7, 0.95, -rr(20, 760));
    scene.add(s);
    cyclists.push({ s, v: away ? -rr(4.2, 6) : rr(4.5, 6.2) });
  }
}
{
  const cows = [];
  for (let i = 0; i < 34; i++) {
    const x = rr(46, 190), z = rr(-90, -420);
    cows.push({ p: [x, 0.85, z], s: [2.3, 1.3, 0.85], r: rr(0, 3), c: rnd() < 0.55 ? '#efebe2' : '#23211f' });
  }
  scene.add(instanced(new THREE.BoxGeometry(1, 1, 1), lambert(), cows));
}
const gooseTex = spriteTex((g) => {
  g.strokeStyle = '#1d1b22'; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(10, 46); g.quadraticCurveTo(40, 30, 64, 62); g.quadraticCurveTo(88, 30, 118, 46); g.stroke();
});
const geese = new THREE.Group();
{
  const mat = new THREE.SpriteMaterial({ map: gooseTex, transparent: true, depthWrite: false, opacity: 0.9 });
  for (let i = 0; i < 11; i++) {
    const s = new THREE.Sprite(mat);
    const side = i === 0 ? 0 : (i % 2 ? 1 : -1), rank = Math.ceil(i / 2);
    s.position.set(-rank * 7, rank * 0.6 * (rnd() * 0.4 + 0.8), side * rank * 6.5);
    s.scale.set(3.2, 1.6, 1);
    s.userData.ph = rnd() * 6;
    geese.add(s);
  }
  scene.add(geese);
}

/* ---------------- career landmarks ---------------- */
const BEACONS = [
  { name: 'EPAM Systems', years: '2015–2018', x: -170, z: -1040 },
  { name: 'BNP Paribas Cardif', years: '2018–2020', x: 150, z: -1220 },
  { name: 'Volksbank', years: '2020–2022', x: -210, z: -1420 },
  { name: 'Ctac', years: '2022–2023', x: 140, z: -1600 },
  { name: 'Freelance, Breda', years: '2023–now', x: TOWN.x - 70, z: TOWN.y + 40 },
];
const beaconUniforms = { uVis: { value: 0 }, uTime: shared.uTime };
const beaconMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  uniforms: beaconUniforms,
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
  fragmentShader: /* glsl */`uniform float uVis, uTime; varying vec2 vUv;
    void main(){ float a = pow(1. - vUv.y, 1.8) * uVis * (.75 + .25 * sin(uTime * 1.6 - vUv.y * 6.)); gl_FragColor = vec4(vec3(1., .9, .72), a * .85); }`,
});
const ringMat = new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
const labelsEl = document.getElementById('labels');
for (const b of BEACONS) {
  const col = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 190, 16, 1, true), beaconMat);
  col.position.set(b.x, 95, b.z);
  scene.add(col);
  const ring = new THREE.Mesh(new THREE.RingGeometry(8, 11, 48), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.set(b.x, 0.4, b.z);
  scene.add(ring);
  const el = document.createElement('div');
  el.className = 'lbl';
  el.innerHTML = `<b>${b.name}</b><span>${b.years}</span>`;
  labelsEl.appendChild(el);
  b.el = el; b.v = new THREE.Vector3(b.x, 0, b.z);
}

/* ---------------- clouds: an Azure layer and an AWS layer ---------------- */
const puffTex = (() => {
  const S = 1024, T = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  for (let q = 0; q < 4; q++) {
    const ox = (q % 2) * T, oy = Math.floor(q / 2) * T, k = T / 256;
    g.save(); g.beginPath(); g.rect(ox, oy, T, T); g.clip();
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 34; i++) {
      const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 0.7) * 70 * k;
      const x = ox + 128 * k + Math.cos(a) * r * 1.25, y = oy + 140 * k + Math.sin(a) * r * 0.5 - rnd() * 30 * k;
      const rad = rr(24, 58) * k;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.62, 'rgba(255,255,255,0.62)'); gr.addColorStop(0.86, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(ox, oy, T, T);
    }
    g.globalCompositeOperation = 'source-atop';
    const lg = g.createLinearGradient(0, oy + 70 * k, 0, oy + 200 * k);
    lg.addColorStop(0, '#ffffff'); lg.addColorStop(0.45, '#e2e2e2'); lg.addColorStop(0.75, '#9a9a9a'); lg.addColorStop(1, '#4a4a4a');
    g.fillStyle = lg; g.fillRect(ox, oy, T, T);
    g.globalCompositeOperation = 'destination-in';
    const rg = g.createRadialGradient(ox + T / 2, oy + T / 2, 84 * k, ox + T / 2, oy + T / 2, 118 * k);
    rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(ox, oy, T, T);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t;
})();

function makeLayer({ y, thick, count, center, radius, cov, scale, lit, shade, density }) {
  const layer = { y, thick, lit: new THREE.Color(lit), shade: new THREE.Color(shade) };
  // the far-reaching sheet
  const sheetU = {
    ...shared, uY: { value: y }, uCov: { value: cov }, uScale: { value: scale }, uOpacity: { value: 1 },
    uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uDense: { value: density },
  };
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(170000, 170000, 64, 64), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, uniforms: sheetU,
    vertexShader: /* glsl */`varying vec3 vWp; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uY, uCov, uScale, uOpacity, uTime, uDense; uniform vec3 uLit, uShade;
      varying vec3 vWp;
      ${NOISE}
      ${FOG}
      void main(){
        vec2 q = vWp.xz * uScale + vec2(uTime * .004, uTime * .002);
        vec2 w = vec2(fbm(q * .5 + 3.1), fbm(q * .5 + 7.7));
        vec2 qw = q + (w - .5) * 1.6;
        float n = fbm(qw);
        float cov = uCov - uDense * smoothstep(-300., -2600., vWp.z);
        float d = smoothstep(cov, cov + mix(.16, .08, step(uY, cameraPosition.y)), n);
        float thick = smoothstep(cov, cov + .32, n);
        float n2 = fbm(qw + uSunDir.xz * .09);
        float lit = clamp(.5 + (n - n2) * 6., 0., 1.);
        float above = step(uY, cameraPosition.y);
        vec3 top = mix(uShade, uLit, clamp(.2 + thick * .6 + lit * .4, 0., 1.));
        vec3 under = mix(uShade * .95, uLit, clamp((1. - thick) * .6 + lit * .3, 0., 1.));
        vec3 col = mix(under, top, above);
        vec3 V = normalize(vWp - cameraPosition);
        col += uSunCol * pow(max(dot(V, uSunDir), 0.), 10.) * (1. - thick) * .9;
        float dist = length(vWp - cameraPosition);
        col = applyFog(col, vWp);
        float a = d * uOpacity * (1. - smoothstep(.7, 1., 1. - exp(-uFogD * uFogD * dist * dist)) * .35);
        a *= smoothstep(15., 140., abs(cameraPosition.y - uY));
        if (a < .004) discard;
        gl_FragColor = vec4(col, a);
      }`,
  }));
  sheet.rotation.x = -Math.PI / 2;
  sheet.position.set(0, y, -3000);
  scene.add(sheet);
  layer.sheet = sheet; layer.sheetU = sheetU;

  // volume near the climb: billboards, sorted back to front every frame
  const base = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.getAttribute('position'));
  geo.setAttribute('uv', base.getAttribute('uv'));
  const src = [];
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * radius;
    const w = rr(200, 520);
    src.push({ x: center.x + Math.cos(a) * r, y: y + (rnd() - 0.45) * thick, z: center.z + Math.sin(a) * r, w, h: w * rr(0.5, 0.62), rot: rr(-0.12, 0.12), tile: Math.floor(rnd() * 4) });
  }
  const aOff = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  const aSc = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
  const aMisc = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
  aOff.setUsage(THREE.DynamicDrawUsage); aSc.setUsage(THREE.DynamicDrawUsage); aMisc.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aOff', aOff); geo.setAttribute('aSc', aSc); geo.setAttribute('aMisc', aMisc);
  geo.instanceCount = count;
  const puffU = { ...shared, uTex: { value: puffTex }, uLit: sheetU.uLit, uShade: sheetU.uShade, uOpacity: { value: 1 }, uNear: { value: 240 } };
  const puffs = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, uniforms: puffU,
    vertexShader: /* glsl */`
      attribute vec3 aOff; attribute vec2 aSc; attribute vec2 aMisc; uniform float uNear;
      varying vec2 vUv; varying float vFade; varying vec3 vWp; varying vec2 vTile;
      void main(){
        vec4 mv = viewMatrix * vec4(aOff, 1.);
        float c = cos(aMisc.x), s = sin(aMisc.x);
        vec2 p = position.xy * aSc;
        mv.xy += vec2(c * p.x - s * p.y, s * p.x + c * p.y);
        float tl = floor(aMisc.y + .5);
        vUv = uv; vTile = vec2(mod(tl, 2.), floor(tl / 2. + .01)); vWp = aOff;
        vFade = smoothstep(uNear * .1, uNear, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uTex; uniform vec3 uLit, uShade; uniform float uOpacity;
      varying vec2 vUv; varying float vFade; varying vec3 vWp; varying vec2 vTile;
      ${FOG}
      void main(){
        vec2 tuv = (vUv * .96 + .02 + floor(vTile + .5)) * .5;
        vec4 t = texture2D(uTex, tuv);
        vec3 col = mix(uShade, uLit, t.r);
        col = applyFog(col, vWp);
        float a = t.a * uOpacity * vFade;
        if (a < .004) discard;
        gl_FragColor = vec4(col, a);
      }`,
  }));
  puffs.frustumCulled = false;
  scene.add(puffs);
  layer.puffs = puffs; layer.puffU = puffU; layer.src = src; layer.order = src.map((_, i) => i);
  layer.aOff = aOff; layer.aSc = aSc; layer.aMisc = aMisc;
  return layer;
}
const c30 = camAt(0.302), c50 = camAt(0.5);
const azureLayer = makeLayer({ y: 1030, thick: 210, count: small() ? 90 : 150, center: new THREE.Vector3(c30.x, 0, c30.z - 300), radius: 2600, cov: 0.53, scale: 0.0011, lit: '#f6f9ff', shade: '#7c9bd9', density: 0.02 });
const awsLayer = makeLayer({ y: 1830, thick: 230, count: small() ? 90 : 150, center: new THREE.Vector3(c50.x, 0, c50.z - 300), radius: 2600, cov: 0.6, scale: 0.0009, lit: '#ffe6bd', shade: '#d9a273', density: 0.3 });
const layers = [azureLayer, awsLayer];
const tmpV = new THREE.Vector3();
function sortLayer(L) {
  const cp = camera.position;
  const d = L.src.map((s) => (s.x - cp.x) ** 2 + (s.y - cp.y) ** 2 + (s.z - cp.z) ** 2);
  L.order.sort((a, b) => d[b] - d[a]);
  const o = L.aOff.array, sc = L.aSc.array, m = L.aMisc.array;
  L.order.forEach((k, i) => {
    const s = L.src[k];
    o[i * 3] = s.x; o[i * 3 + 1] = s.y; o[i * 3 + 2] = s.z;
    sc[i * 2] = s.w; sc[i * 2 + 1] = s.h;
    m[i * 2] = s.rot; m[i * 2 + 1] = s.tile;
  });
  L.aOff.needsUpdate = L.aSc.needsUpdate = L.aMisc.needsUpdate = true;
}

/* ---------------- cluster lights ---------------- */
function glowPoints(list, color, twinkle = 1, core = '#ffffff') {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(list.flatMap((l) => l.p), 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(list.map((l) => l.s), 1));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(list.map(() => rnd()), 1));
  const u = { uTime: shared.uTime, uPx: { value: 900 }, uVis: { value: 0 }, uColor: { value: new THREE.Color(color) }, uCore: { value: new THREE.Color(core) }, uTw: { value: twinkle } };
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, uniforms: u,
    vertexShader: /* glsl */`
      attribute float aSize; attribute float aSeed; uniform float uTime, uPx, uTw; varying float vTw;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); vTw = 1. - uTw * .3 * (.5 + .5 * sin(uTime * 1.3 + aSeed * 40.));
        gl_PointSize = clamp(aSize * uPx / -mv.z, 3., 220.); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor, uCore; uniform float uVis; varying float vTw;
      void main(){ float d = length(gl_PointCoord - .5) * 2.; float core = smoothstep(.2, .04, d); float halo = pow(max(1. - d, 0.), 1.7);
        vec3 c = mix(uColor, uCore, core); float a = clamp(halo * .75 + core, 0., 1.) * uVis * vTw; if (a < .005) discard; gl_FragColor = vec4(c, a); }`,
  }));
  pts.frustumCulled = false;
  pts.renderOrder = 8;
  scene.add(pts);
  return { pts, u };
}
const AZ = (() => {
  const c = camAt(0.338), f = fwdOf(c.yaw), r = rightOf(c.yaw), list = [];
  for (let i = 0; i < 146; i++) {
    const d = rr(380, 2300), lat = rr(-1, 1) * (d * 0.75 + 200);
    const p = new THREE.Vector3(c.x, 0, c.z).addScaledVector(f, d).addScaledVector(r, lat);
    list.push({ p: [p.x, 1165 - Math.pow(rnd(), 1.6) * 150, p.z], s: rr(60, 92) });
  }
  const pts = glowPoints(list, '#2f66f0', 1, '#f2f7ff');
  // a faint mesh between neighbours: one platform
  const seg = [];
  list.forEach((a, i) => {
    const near = list.map((b, j) => [j, (a.p[0] - b.p[0]) ** 2 + (a.p[2] - b.p[2]) ** 2]).filter(([j]) => j !== i).sort((x, y) => x[1] - y[1]).slice(0, 2);
    for (const [j] of near) if (j > i || rnd() < 0.5) seg.push(...a.p, ...list[j].p);
  });
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
  const lm = new THREE.LineBasicMaterial({ color: 0x3d6fe6, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const lines = new THREE.LineSegments(lg, lm); lines.frustumCulled = false; scene.add(lines);
  return { ...pts, lm };
})();
const AW = (() => {
  const c = camAt(0.445), f = fwdOf(c.yaw), r = rightOf(c.yaw), list = [], seg = [];
  for (let i = 0; i < 15; i++) {
    const d = rr(300, 1200), lat = rr(-1, 1) * (d * 0.55 + 100);
    const p = new THREE.Vector3(c.x, 0, c.z).addScaledVector(f, d).addScaledVector(r, lat);
    const y = rr(1660, 1730);
    list.push({ p: [p.x, y, p.z], s: rr(170, 240) });
    seg.push(p.x, y + 6, p.z, p.x, 1790, p.z);
  }
  const pts = glowPoints(list, '#ff8a1e', 0.5, '#fff1c8');
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
  const lm = new THREE.LineBasicMaterial({ color: 0xc8701e, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const lines = new THREE.LineSegments(lg, lm); lines.frustumCulled = false; lines.renderOrder = 7; scene.add(lines);
  return { ...pts, lm };
})();

/* ---------------- a cluster assembling itself above the clouds ---------------- */
const BUILD = (() => {
  const S = [];
  const add = (a, b) => S.push(...a, ...b);
  const hex = (r, y) => Array.from({ length: 6 }, (_, i) => { const a = i * Math.PI / 3 + Math.PI / 6; return [Math.cos(a) * r, y, Math.sin(a) * r]; });
  const outer = hex(130, 0), inner = hex(68, 0), lower = hex(92, -28);
  for (let i = 0; i < 6; i++) add(outer[i], outer[(i + 1) % 6]);
  for (let i = 0; i < 6; i++) { add(inner[i], inner[(i + 1) % 6]); add(inner[i], outer[i]); add(inner[i], outer[(i + 1) % 6]); add(inner[i], [0, 0, 0]); }
  for (let i = 0; i < 6; i++) { add(lower[i], lower[(i + 1) % 6]); add(lower[i], outer[i]); add(lower[i], outer[(i + 1) % 6]); add(lower[i], [0, -58, 0]); }
  const towers = [[inner[0], 170], [inner[2], 128], [inner[4], 104], [[0, 0, 0], 70]];
  const levels = 13;
  for (let L = 0; L < levels; L++) {
    for (const [b, h] of towers) {
      const y0 = h * L / levels, y1 = h * (L + 1) / levels, w = 9;
      const c = [[-w, -w], [w, -w], [w, w], [-w, w]];
      for (let q = 0; q < 4; q++) {
        const a = c[q], n = c[(q + 1) % 4];
        add([b[0] + a[0], y0, b[2] + a[1]], [b[0] + a[0], y1, b[2] + a[1]]);
        add([b[0] + a[0], y1, b[2] + a[1]], [b[0] + n[0], y1, b[2] + n[1]]);
        add([b[0] + a[0], y0, b[2] + a[1]], [b[0] + n[0], y1, b[2] + n[1]]);
      }
    }
  }
  const tops = towers.slice(0, 3).map(([b, h]) => [b[0], h * 0.82, b[2]]);
  for (let k = 0; k < 3; k++) {
    const a = tops[k], b = tops[(k + 1) % 3];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const p0 = a.map((v, j) => lerp(v, b[j], t0)), p1 = a.map((v, j) => lerp(v, b[j], t1));
      const q0 = [...p0], q1 = [...p1]; q0[1] -= 12; q1[1] -= 12;
      add(p0, p1); add(q0, q1); add(i % 2 ? p0 : q0, i % 2 ? q1 : p1);
    }
  }
  for (const [b, h] of towers.slice(0, 3)) add([b[0], h, b[2]], [b[0], h + 34, b[2]]);
  // every segment becomes a beam, revealed in build order
  const nSeg = S.length / 6;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const idx = new Float32Array(nSeg);
  const u = { ...shared, uCount: { value: 0 }, uVis: { value: 0 } };
  const lines = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({
    transparent: true, fog: false, uniforms: u,
    vertexShader: /* glsl */`attribute float aIdx; varying float vI; varying vec3 vN; varying vec3 vWp;
      void main(){ vI = aIdx; mat4 m = modelMatrix * instanceMatrix; vN = normalize(mat3(m) * normal); vec4 w = m * vec4(position, 1.); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`uniform float uCount, uVis; varying float vI; varying vec3 vN; varying vec3 vWp;
      ${FOG}
      void main(){ if (vI > uCount) discard; float fresh = smoothstep(uCount - 24., uCount, vI);
        float l = .5 + .5 * max(dot(normalize(vN), uSunDir), 0.);
        vec3 c = mix(vec3(.86, .74, .62) * l + uSunCol * .25 * l, vec3(1., .97, .9), fresh);
        c = applyFog(c, vWp);
        gl_FragColor = vec4(c, uVis); }`,
  }), nSeg);
  const A = new THREE.Vector3(), B2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
  for (let i = 0; i < nSeg; i++) {
    A.fromArray(S, i * 6); B2.fromArray(S, i * 6 + 3);
    const len = A.distanceTo(B2);
    dummy.position.copy(A).add(B2).multiplyScalar(0.5);
    q.setFromUnitVectors(up, B2.clone().sub(A).normalize());
    dummy.quaternion.copy(q);
    dummy.scale.set(1.25, len + 1.25, 1.25);
    dummy.updateMatrix();
    lines.setMatrixAt(i, dummy.matrix);
    idx[i] = i;
  }
  dummy.quaternion.identity();
  geo.setAttribute('aIdx', new THREE.InstancedBufferAttribute(idx, 1));
  const c = camAt(0.6), f = fwdOf(c.yaw), r = rightOf(c.yaw);
  lines.position.set(c.x, 0, c.z).addScaledVector(f, 640).addScaledVector(r, 170);
  lines.position.y = 2140;
  lines.scale.setScalar(1.55);
  lines.rotation.y = 0.3;
  lines.frustumCulled = false;
  scene.add(lines);
  return { lines, u, n: nSeg, base: lines.position.clone(), f, r };
})();

/* ---------------- deploys: contrails moving in sync ---------------- */
const JETS = (() => {
  const c = camAt(0.705), f = fwdOf(c.yaw), r = rightOf(c.yaw);
  const N = 150, SEGS = 28;
  const pos = [], uAttr = [], stag = [], far = [], heads = [];
  for (let i = 0; i < N; i++) {
    const d = rr(1700, 6500), up = rr(-260, 1500) * (d / 4000), lat = rr(-0.25, 0.25) * d;
    const ang = rr(-0.1, 0.1), L = rr(0.9, 1.25) * d;
    const ctr = new THREE.Vector3(c.x, c.y + up, c.z).addScaledVector(f, d).addScaledVector(r, lat);
    const dir = r.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
    const a = ctr.clone().addScaledVector(dir, -L), b = ctr.clone().addScaledVector(dir, L);
    a.y -= d * 0.05; b.y += d * 0.05;
    const st = rnd();
    for (let s = 0; s < SEGS; s++) {
      const t0 = s / SEGS, t1 = (s + 1) / SEGS;
      const p0 = a.clone().lerp(b, t0), p1 = a.clone().lerp(b, t1);
      pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
      uAttr.push(t0, t1); stag.push(st, st); far.push(d, d);
    }
    heads.push({ a, b, st });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(uAttr, 1));
  g.setAttribute('aSt', new THREE.Float32BufferAttribute(stag, 1));
  g.setAttribute('aFar', new THREE.Float32BufferAttribute(far, 1));
  const u = { uT: { value: 0 }, uVis: { value: 0 }, uCol: { value: new THREE.Color('#ffe6cf') } };
  const lines = new THREE.LineSegments(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: u,
    vertexShader: /* glsl */`attribute float aU; attribute float aSt; attribute float aFar; uniform float uT; varying float vU; varying float vH; varying float vF;
      float headOf(float st){ float slow = clamp(uT / .5, 0., 1.) * (.12 + .5 * st); float snap = smoothstep(.5, .66, uT); return mix(slow, 1.02, snap); }
      void main(){ vU = aU; vH = headOf(aSt); vF = 1. - smoothstep(1500., 7000., aFar) * .75; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: /* glsl */`uniform float uVis; uniform vec3 uCol; varying float vU; varying float vH; varying float vF;
      void main(){ if (vU > vH) discard; float a = exp(-(vH - vU) * 3.2) * .7 + .05; gl_FragColor = vec4(uCol, a * uVis * vF * .8); }`,
  }));
  lines.frustumCulled = false;
  scene.add(lines);
  const hg = new THREE.BufferGeometry();
  const hp = new Float32Array(N * 3);
  hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
  const hm = new THREE.PointsMaterial({ color: 0xfff8ee, size: 2.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const hpts = new THREE.Points(hg, hm); hpts.frustumCulled = false; scene.add(hpts);
  return { lines, u, heads, hp, hg, hm };
})();
function jetHead(st, T) { const slow = clamp(T / 0.5) * (0.12 + 0.5 * st); const snap = sstep(0.5, 0.66, T); return Math.min(lerp(slow, 1.02, snap), 1); }

/* ---------------- guardrails: a lattice settling over the sky ---------------- */
const LAT = (() => {
  const c = camAt(0.82), C = new THREE.Vector3(c.x, c.y, c.z);
  const COLS = 40, ROWS = 30, R = 3800;
  const grid = [], scat = [], st = [];
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const az = c.yaw + lerp(-58, 58, i / (COLS - 1)) * D2R, el = lerp(4, 64, j / (ROWS - 1)) * D2R;
    const dir = new THREE.Vector3(-Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    grid.push(C.clone().addScaledVector(dir, R));
    const sd = dir.clone().add(new THREE.Vector3(rr(-0.25, 0.25), rr(-0.2, 0.2), rr(-0.25, 0.25))).normalize();
    scat.push(C.clone().addScaledVector(sd, R * rr(0.55, 1.35)));
    st.push(rnd());
  }
  const mk = (ids) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(ids.flatMap((k) => [scat[k].x, scat[k].y, scat[k].z]), 3));
    g.setAttribute('aGrid', new THREE.Float32BufferAttribute(ids.flatMap((k) => [grid[k].x, grid[k].y, grid[k].z]), 3));
    g.setAttribute('aSt', new THREE.Float32BufferAttribute(ids.map((k) => st[k]), 1));
    return g;
  };
  const u = { uT: { value: 0 }, uVis: { value: 0 }, uTime: shared.uTime, uDpr: { value: dpr } };
  const vs = /* glsl */`attribute vec3 aGrid; attribute float aSt; uniform float uT, uTime, uDpr; varying float vS;
    void main(){ float s = smoothstep(aSt * .55, aSt * .55 + .45, uT); vS = s;
      vec3 p = mix(position + vec3(sin(uTime * .3 + aSt * 30.), cos(uTime * .25 + aSt * 17.), 0.) * 40., aGrid, s);
      gl_PointSize = (1.6 + 1.6 * s) * uDpr; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); }`;
  const pts = new THREE.Points(mk(grid.map((_, k) => k)), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: u, vertexShader: vs,
    fragmentShader: /* glsl */`uniform float uVis; varying float vS; void main(){ float d = length(gl_PointCoord - .5) * 2.;
      vec3 c = mix(vec3(1., .72, .42), vec3(.55, .95, .86), vS); gl_FragColor = vec4(c, smoothstep(1., .2, d) * uVis * (.55 + .45 * vS)); }`,
  }));
  const ids = [];
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const k = j * COLS + i;
    if (i < COLS - 1) ids.push(k, k + 1);
    if (j < ROWS - 1) ids.push(k, k + COLS);
  }
  const lines = new THREE.LineSegments(mk(ids), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: u, vertexShader: vs,
    fragmentShader: /* glsl */`uniform float uVis, uT; varying float vS; void main(){ gl_FragColor = vec4(vec3(.5, .9, .82), pow(vS, 4.) * uVis * .22 * smoothstep(.55, 1., uT)); }`,
  }));
  pts.frustumCulled = lines.frustumCulled = false;
  scene.add(pts, lines);
  return { u };
})();

/* ---------------- DOM: captions, altimeter ---------------- */
const scenes = [...document.querySelectorAll('.scene')].map((el) => ({
  el, p: +el.dataset.p, i: +el.dataset.in, h: +el.dataset.hold, o: +el.dataset.out, last: -1,
}));
const swapEl = document.querySelector('.fig-swap');
const altEl = document.getElementById('altimeter');
const altTape = document.getElementById('altTape');
const altValue = document.getElementById('altValue');
const PX_PER_M = 0.085;
const tickLabels = [];
{
  const frag = document.createDocumentFragment();
  for (let m = 0; m <= 11500; m += 250) {
    const t = document.createElement('div');
    t.className = 'tick' + (m % 1000 === 0 ? ' major' : '');
    t.style.top = `${-m * PX_PER_M}px`;
    if (m % 1000 === 0) { const i = document.createElement('i'); i.textContent = m.toLocaleString('en-US').replace(',', ' '); t.appendChild(i); tickLabels.push([m, i]); }
    frag.appendChild(t);
  }
  altTape.appendChild(frag);
}
const ALT_MAP = [[0, 0], [520, 640], [1030, 2400], [1830, 5200], [2400, 8000], [3300, 11000]];
function metres(y) {
  for (let i = 0; i < ALT_MAP.length - 1; i++) {
    const [y0, m0] = ALT_MAP[i], [y1, m1] = ALT_MAP[i + 1];
    if (y <= y1) return lerp(m0, m1, clamp((y - y0) / (y1 - y0)));
  }
  return 11000;
}

/* ---------------- state for a given scroll position ---------------- */
const sunDir = new THREE.Vector3();
let uiDark = null, lastAlt = -1;
function setWorld(p, t, dt) {
  const c = camAt(p);
  camera.position.set(c.x, c.y, c.z);
  camera.rotation.set(c.pitch, c.yaw, 0);
  camera.near = clamp(c.y * 0.006, 0.25, 12);
  camera.updateProjectionMatrix();

  const E = envAt(p);
  const el = E.sunEl * D2R, az = E.sunAz * D2R;
  sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();

  // inside a cloud the world goes soft and takes the cloud's colour
  let fogD = E.fogD;
  const fogCol = E.fog.clone();
  for (const L of layers) {
    const k = 1 - sstep(60, 190, Math.abs(c.y - L.y));
    if (k > 0) { fogD = lerp(fogD, 0.0016, k); fogCol.lerp(L.lit, k * 0.85); }
  }
  const between = sstep(1120, 1260, c.y) * (1 - sstep(1640, 1760, c.y));
  if (between > 0) fogCol.lerp(tmpCol.set('#c3d3ee'), between * 0.55);
  shared.uFogCol.value.copy(fogCol);
  shared.uSunCol.value.copy(E.sun);
  shared.uSunDir.value.copy(sunDir);
  shared.uFogD.value = fogD;
  shared.uZen.value.copy(E.zen);
  shared.uHor.value.copy(E.hor);
  shared.uAmb.value.copy(E.amb);
  shared.uTime.value = t;
  shared.uMist.value = E.mist;
  scene.fog.color.copy(fogCol);
  scene.fog.density = fogD;
  sky.material.uniforms.uSunI.value = E.sunI;
  sky.material.uniforms.uAurora.value = E.aur;
  sky.material.uniforms.uAurDir.value.copy(fwdOf(camAt(0.84).yaw));
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);
  starMat.uniforms.uStars.value = E.stars;

  sunLight.color.copy(E.sun);
  sunLight.intensity = Math.PI * 1.1 * clamp(sunDir.y * 4 + 0.12);
  sunLight.position.copy(camera.position).addScaledVector(sunDir, 1000);
  sunLight.target.position.copy(camera.position);
  hemi.color.copy(E.amb);
  hemi.groundColor.copy(E.amb).multiplyScalar(0.45);
  hemi.intensity = Math.PI * 0.62;

  // cloud colours follow the light
  const cloudT = [[azureLayer, '#f6f9ff', '#86a3dc'], [awsLayer, '#ffe6bd', '#d9a273']];
  for (const [L, lit, sh] of cloudT) {
    const local = L === azureLayer ? (1 - sstep(0.44, 0.54, p)) * (1 - sstep(0, 0.1, 0.24 - p)) : sstep(0.3, 0.38, p) * (1 - sstep(0.54, 0.64, p));
    tmpCol.set(lit); L.sheetU.uLit.value.copy(E.cLit).lerp(tmpCol, local * 0.75);
    tmpCol.set(sh); L.sheetU.uShade.value.copy(E.cSh).lerp(tmpCol, local * 0.75);
  }
  for (const L of layers) {
    const near = Math.abs(c.y - L.y) < 1400;
    L.puffs.visible = near;
    const dy = Math.abs(c.y - L.y);
    L.puffU.uOpacity.value = 1 - sstep(500, 1100, dy) * 0.7;
    L.puffU.uNear.value = lerp(240, 900, sstep(120, 320, dy));
    if (near) sortLayer(L);
    const dist = c.y - L.y;
    L.sheet.renderOrder = L.puffs.renderOrder = dist > 0 ? 2 + (3000 - Math.abs(dist)) / 3000 : 2 + (3000 - Math.abs(dist)) / 3000;
  }
  azureLayer.sheet.renderOrder = c.y > azureLayer.y ? 1 : 3;
  azureLayer.puffs.renderOrder = c.y > azureLayer.y ? 1.5 : 3.5;
  awsLayer.sheet.renderOrder = c.y > awsLayer.y ? 1 : 3;
  awsLayer.puffs.renderOrder = c.y > awsLayer.y ? 1.5 : 3.5;
  if (c.y > awsLayer.y) { azureLayer.sheet.renderOrder = 0.5; azureLayer.puffs.renderOrder = 0.7; }
  if (c.y < azureLayer.y) { awsLayer.sheet.renderOrder = 4; awsLayer.puffs.renderOrder = 4.5; }

  // ground life
  for (const s of spinners) s.o.rotation.z -= s.speed * dt;
  for (const cy of cyclists) {
    cy.s.position.z += cy.v * dt;
    if (cy.s.position.z < -780) cy.s.position.z = -20;
    if (cy.s.position.z > 4) cy.s.position.z = -760;
  }
  const gv = 1 - sstep(0.14, 0.2, p);
  geese.visible = gv > 0.01;
  if (geese.visible) {
    const gx = ((t * 9) % 520) - 260;
    geese.position.set(c.x + gx, 62 + Math.sin(t * 0.3) * 3, Math.min(c.z, 0) - 240);
    geese.children.forEach((g) => { g.scale.y = 1.6 * (0.55 + 0.45 * Math.abs(Math.sin(t * 3.2 + g.userData.ph))); g.material.opacity = 0.9 * gv; });
  }

  // landmarks
  const bv = sstep(0.07, 0.12, p) * (1 - sstep(0.26, 0.3, p));
  beaconUniforms.uVis.value = bv;
  ringMat.opacity = bv * 0.75;
  const lv = sstep(0.145, 0.175, p) * (1 - sstep(0.24, 0.265, p));
  labelsEl.style.opacity = lv.toFixed(3);
  if (lv > 0.001) {
    const w = innerWidth, h = innerHeight;
    for (const b of BEACONS) {
      tmpV.copy(b.v).project(camera);
      const on = tmpV.z < 1 && Math.abs(tmpV.x) < 1.1 && Math.abs(tmpV.y) < 1.1;
      const sx = (tmpV.x + 1) / 2 * w, flip = sx > w * 0.6;
      b.el.classList.toggle('flip', flip);
      b.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${((1 - tmpV.y) / 2 * h - 8).toFixed(1)}px, 0)${flip ? ' translateX(-100%)' : ''}`;
      b.el.style.visibility = on ? 'visible' : 'hidden';
    }
  }

  // cluster lights
  const px = renderer.getDrawingBufferSize(tmpV2).y / (2 * Math.tan(camera.fov * D2R / 2));
  AZ.u.uPx.value = AW.u.uPx.value = px;
  const azv = sstep(0.26, 0.31, p) * (1 - sstep(0.39, 0.44, p));
  AZ.u.uVis.value = azv; AZ.lm.opacity = azv * 0.4;
  const awv = sstep(0.385, 0.425, p) * (1 - sstep(0.5, 0.535, p));
  AW.u.uVis.value = awv; AW.lm.opacity = awv * 0.55;

  // the build: slow for "6 months", then everything in an "hour"
  const bt = clamp((p - 0.548) / (0.602 - 0.548));
  const count = bt < 0.5 ? (bt / 0.5) * 0.1 * BUILD.n : lerp(0.1 * BUILD.n, BUILD.n + 30, sstep(0.5, 1, bt));
  BUILD.u.uCount.value = count;
  BUILD.u.uVis.value = sstep(0.52, 0.55, p) * (1 - sstep(0.7, 0.76, p) * 0.7);
  BUILD.lines.position.copy(BUILD.base).addScaledVector(BUILD.r, camera.aspect < 0.8 ? -175 : 0);
  BUILD.lines.position.y = BUILD.base.y + Math.sin(t * 0.4) * 3;
  if (swapEl) swapEl.style.setProperty('--swap', sstep(0.572, 0.598, p).toFixed(3));

  // deploys
  const jt = clamp((p - 0.655) / (0.738 - 0.655));
  JETS.u.uT.value = jt;
  const jv = sstep(0.64, 0.665, p) * (1 - sstep(0.8, 0.86, p));
  JETS.u.uVis.value = jv;
  JETS.hm.opacity = jv * (jt > 0.98 ? 0.35 : 1);
  if (jv > 0.001) {
    JETS.heads.forEach((hd, i) => {
      const k = jetHead(hd.st, jt);
      JETS.hp[i * 3] = lerp(hd.a.x, hd.b.x, k); JETS.hp[i * 3 + 1] = lerp(hd.a.y, hd.b.y, k); JETS.hp[i * 3 + 2] = lerp(hd.a.z, hd.b.z, k);
    });
    JETS.hg.attributes.position.needsUpdate = true;
  }

  // guardrails
  LAT.u.uT.value = clamp((p - 0.765) / (0.84 - 0.765));
  LAT.u.uVis.value = sstep(0.745, 0.78, p) * (1 - sstep(0.93, 1, p) * 0.55);

  // satellite: crosses the night sky, blinking
  const sv = sstep(0.855, 0.9, p);
  satMat.opacity = sv * (0.35 + 0.65 * (Math.sin(t * 5.5) > 0.82 ? 1 : 0.25));
  if (sv > 0) {
    const ph = ((t * 0.018) % 1) * 1.4 - 0.7;
    const a = camAt(0.95).yaw + ph * 1.5, e = (40 + 16 * Math.sin(ph * 2.2)) * D2R;
    satGeo.attributes.position.setXYZ(0, camera.position.x - Math.sin(a) * Math.cos(e) * 60000, camera.position.y + Math.sin(e) * 60000, camera.position.z - Math.cos(a) * Math.cos(e) * 60000);
    satGeo.attributes.position.needsUpdate = true;
  }

  // captions
  for (const s of scenes) {
    const v = sstep(s.i, s.i + 0.022, p) * (1 - sstep(s.h, s.o, p));
    const q = Math.round(v * 200) / 200;
    if (q !== s.last) {
      s.last = q;
      s.el.style.setProperty('--v', q);
      s.el.classList.toggle('on', q > 0.01);
    }
  }

  // altimeter
  const m = metres(c.y);
  const mr = Math.round(m / 10) * 10;
  if (mr !== lastAlt) {
    lastAlt = mr;
    altValue.textContent = mr.toLocaleString('en-US').replace(',', ' ');
  }
  altTape.style.transform = `translate3d(0, ${(m * PX_PER_M).toFixed(1)}px, 0)`;
  for (const [tm, te] of tickLabels) te.style.opacity = Math.abs(tm - m) < 230 ? 0 : '';
  altEl.style.opacity = (sstep(0.02, 0.06, p) * (1 - sstep(0.93, 0.97, p))).toFixed(3);
  const dark = p > 0.245 && p < 0.53;
  if (dark !== uiDark) { uiDark = dark; altEl.style.setProperty('--ui', dark ? 'rgba(16, 38, 82, .85)' : 'rgba(251, 241, 228, .86)'); }
}
const tmpCol = new THREE.Color();
const tmpV2 = new THREE.Vector2();

/* ---------------- sizing ---------------- */
function resize() {
  const w = innerWidth, h = innerHeight, a = w / h;
  camera.aspect = a;
  camera.fov = a < 0.7 ? 66 : a < 1.1 ? 58 : 48;
  camera.updateProjectionMatrix();
  dprCap = small() ? 1.5 : 2;
  dpr = Math.min(devicePixelRatio || 1, dprCap, dpr || dprCap);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h);
  starMat.uniforms.uDpr.value = dpr;
  LAT.u.uDpr.value = dpr;
}
resize();
addEventListener('resize', () => { dpr = Math.min(devicePixelRatio || 1, small() ? 1.5 : 2); resize(); });

/* ---------------- still frames for reduced motion ---------------- */
if (REDUCE) {
  stillMode();
  requestAnimationFrame(() => {
    for (const s of scenes) {
      setWorld(s.p, 30, 0);
      renderer.render(scene, camera);
      s.el.style.setProperty('--still', `url(${canvas.toDataURL('image/jpeg', 0.84)})`);
    }
    for (const s of scenes) { s.el.style.removeProperty('--v'); s.el.classList.add('on'); }
    labelsEl.style.opacity = 0;
  });
} else {
  /* ---------------- the climb ---------------- */
  const spacer = document.getElementById('spacer');
  const Lenis = window.Lenis;
  const lenis = Lenis ? new Lenis({ lerp: 0.075, wheelMultiplier: 0.85, touchMultiplier: 1.4 }) : null;
  const progress = () => {
    if (lenis && lenis.limit > 0) return clamp(lenis.animatedScroll / lenis.limit);
    const lim = document.documentElement.scrollHeight - innerHeight;
    return lim > 0 ? clamp(scrollY / lim) : 0;
  };
  const toContact = (e) => {
    e && e.preventDefault();
    const end = document.documentElement.scrollHeight - innerHeight;
    if (lenis) lenis.scrollTo(end, { duration: 5, easing: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2) });
    else scrollTo({ top: end, behavior: 'auto' });
    setTimeout(() => document.querySelector('.mail').focus({ preventScroll: true }), lenis ? 5100 : 50);
  };
  document.querySelector('.skip').addEventListener('click', toContact);
  if (location.hash === '#contact') requestAnimationFrame(() => { scrollTo(0, document.documentElement.scrollHeight); });

  const clock = new THREE.Clock();
  let t = 0, frames = 0, slow = 0, first = true;
  const started = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;
    if (lenis) lenis.raf(now);
    setWorld(progress(), t, dt);
    renderer.render(scene, camera);
    if (first) {
      first = false;
      const wait = Math.max(0, 1100 - (performance.now() - started));
      document.fonts.ready.then(() => setTimeout(() => loader.classList.add('done'), wait));
    }
    // adapt resolution if the device struggles
    frames++;
    if (dt > 0.026) slow++;
    if (frames === 90) {
      if (slow > 45 && dpr > 1) { dpr = Math.max(1, dpr - 0.35); renderer.setPixelRatio(dpr); renderer.setSize(innerWidth, innerHeight); starMat.uniforms.uDpr.value = dpr; LAT.u.uDpr.value = dpr; }
      frames = slow = 0;
    }
  }
  requestAnimationFrame(frame);
}
