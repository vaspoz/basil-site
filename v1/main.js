// Fleet map: 146 AKS + 15 EKS clusters, with one GitOps reconcile pass on load.
(() => {
  const AKS = 146;
  const EKS = 15;
  const TOTAL = AKS + EKS;

  const canvas = document.getElementById('fleet');
  const stage = document.getElementById('fleet-stage');
  const tip = document.getElementById('fleet-tip');
  const statusEl = document.getElementById('fleet-status');
  const statusText = document.getElementById('fleet-status-text');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');

  const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
  let reduce = reduceMq.matches;

  // Deterministic randomness so every visit looks the same.
  let seed = 20230901;
  const rand = () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const easeOutBack = (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  let colors = {};
  const readColors = () => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    colors = { azure: v('--cobalt'), aws: v('--amber'), ink: v('--ink'), wave: v('--wave'), surface: v('--surface') };
  };

  // Each dot: home position, a drift direction, and a drift amount d (0 = in sync, 1 = drifted).
  const dots = [];
  for (let i = 0; i < TOTAL; i++) {
    const angle = rand() * Math.PI * 2;
    dots.push({
      i,
      cloud: i < AKS ? 'AKS' : 'EKS',
      n: i < AKS ? i + 1 : i - AKS + 1,
      ax: Math.cos(angle),
      ay: Math.sin(angle),
      mag: 0.22 + rand() * 0.2,
      d: 0,
      anim: null,
      x: 0, y: 0, col: 0, row: 0,
    });
  }

  // Roughly a third of the fleet starts out of sync.
  const drifted = dots.filter(() => rand() < 0.3);
  if (!reduce) drifted.forEach((dot) => { dot.d = 1; });

  let W = 0, H = 0, sp = 0, r = 0, rows = 0, colsAks = 0;
  const grid = new Map();

  const layout = () => {
    W = stage.clientWidth;
    if (!W) return;
    const target = W > 560 ? 1.85 : 1.35;
    let best = null;
    for (let rws = 5; rws <= 18; rws++) {
      const ca = Math.ceil(AKS / rws);
      const ce = Math.ceil(EKS / rws);
      const cols = ca + 1 + ce;
      const s = W / (cols + 0.5);
      const h = (rws - 1) * s * 0.866 + s;
      const score = Math.abs(Math.log(W / h / target));
      if (!best || score < best.score) best = { rws, ca, ce, s, h, score };
    }
    rows = best.rws;
    colsAks = best.ca;
    sp = best.s;
    r = sp * 0.27;
    H = Math.round(best.h);
    grid.clear();

    dots.forEach((dot) => {
      const k = dot.cloud === 'AKS' ? dot.i : dot.i - AKS;
      const colInGroup = Math.floor(k / rows);
      const row = rows - 1 - (k % rows); // fill bottom-up, like stacked bars
      const col = dot.cloud === 'AKS' ? colInGroup : colsAks + 1 + colInGroup;
      dot.col = col;
      dot.row = row;
      dot.x = sp / 2 + col * sp + (row % 2 ? sp / 2 : 0);
      dot.y = sp / 2 + row * sp * 0.866;
      grid.set(col + ',' + row, dot);
    });

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(performance.now());
  };

  // ---------- animation state ----------

  let waveStart = -1;
  const WAVE_MS = 1700;
  let hover = null;
  let visible = true;
  let rafId = 0;
  let ambientTimer = 0;
  let introDone = reduce;

  const animate = (dot, from, to, dur, ease, now) => {
    dot.anim = { from, to, dur, ease, start: now };
  };

  const step = (now) => {
    let busy = false;

    if (waveStart >= 0) {
      const t = (now - waveStart) / WAVE_MS;
      const front = -0.08 * W + t * 1.16 * W;
      dots.forEach((dot) => {
        if (dot.d > 0.5 && !dot.anim && dot.x <= front) animate(dot, dot.d, 0, 700, easeOutBack, now);
      });
      if (t >= 1) {
        waveStart = -1;
        introDone = true;
        scheduleAmbient();
      } else busy = true;
    }

    dots.forEach((dot) => {
      const a = dot.anim;
      if (!a) return;
      const t = clamp01((now - a.start) / a.dur);
      dot.d = a.from + (a.to - a.from) * a.ease(t);
      if (t >= 1) { dot.d = a.to; dot.anim = null; } else busy = true;
    });

    updateStatus();
    draw(now);
    if (hover) positionTip(hover);
    return busy;
  };

  const loop = (now) => {
    rafId = 0;
    const busy = step(now);
    if (busy && visible && !document.hidden) rafId = requestAnimationFrame(loop);
  };
  const kick = () => {
    if (!rafId && visible && !document.hidden) rafId = requestAnimationFrame(loop);
  };

  let lastStatus = '';
  const updateStatus = () => {
    const out = dots.reduce((n, dot) => n + (dot.d > 0.5 ? 1 : 0), 0);
    const text = out === 0
      ? `${TOTAL} of ${TOTAL} clusters in sync`
      : waveStart >= 0 || !introDone
        ? `Reconciling, ${out} drifted`
        : `${TOTAL - out} of ${TOTAL} in sync, reconciling`;
    if (text !== lastStatus) {
      lastStatus = text;
      statusText.textContent = text;
      statusEl.classList.toggle('is-drifted', out > 0);
    }
  };

  // ---------- drawing ----------

  const draw = (now) => {
    if (!W) return;
    ctx.clearRect(0, 0, W, H);

    if (waveStart >= 0) {
      const t = (now - waveStart) / WAVE_MS;
      const front = -0.08 * W + t * 1.16 * W;
      const band = Math.max(70, W * 0.14);
      const g = ctx.createLinearGradient(front - band, 0, front + 12, 0);
      g.addColorStop(0, `rgba(${colors.wave}, 0)`);
      g.addColorStop(0.85, `rgba(${colors.wave}, 0.13)`);
      g.addColorStop(1, `rgba(${colors.wave}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(front - band, 0, band + 12, H);
    }

    dots.forEach((dot) => {
      const color = dot.cloud === 'AKS' ? colors.azure : colors.aws;
      const off = dot.d * dot.mag * sp;
      const x = dot.x + dot.ax * off;
      const y = dot.y + dot.ay * off;
      const ringA = clamp01(dot.d);
      const fillA = 1 - ringA;

      if (fillA > 0.01) {
        ctx.globalAlpha = fillA;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (ringA > 0.01) {
        ctx.globalAlpha = ringA;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.25, r * 0.28);
        ctx.beginPath();
        ctx.arc(x, y, r * 0.86, 0, Math.PI * 2);
        ctx.stroke();
        // Faint ghost of where the cluster should be.
        ctx.globalAlpha = ringA * 0.18;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1;

    if (hover) {
      const off = hover.d * hover.mag * sp;
      ctx.strokeStyle = colors.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(hover.x + hover.ax * off, hover.y + hover.ay * off, r * 1.75, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  // ---------- tooltip ----------

  const describe = (dot) => `${dot.cloud} cluster ${dot.n}, ${dot.d > 0.5 ? 'drifted, reconciling' : 'in sync'}`;

  const positionTip = (dot) => {
    const off = dot.d * dot.mag * sp;
    let x = dot.x + dot.ax * off;
    const y = dot.y + dot.ay * off - r;
    tip.textContent = describe(dot);
    const half = tip.offsetWidth / 2;
    x = Math.max(half, Math.min(W - half, x));
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  };

  const setHover = (dot) => {
    if (dot === hover) return;
    hover = dot;
    if (dot) { tip.hidden = false; positionTip(dot); } else tip.hidden = true;
    draw(performance.now());
  };

  const nearest = (px, py) => {
    let best = null, bd = Infinity;
    dots.forEach((dot) => {
      const dx = dot.x - px, dy = dot.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = dot; }
    });
    return bd <= (sp * 0.62) ** 2 ? best : null;
  };

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const rect = canvas.getBoundingClientRect();
    setHover(nearest(e.clientX - rect.left, e.clientY - rect.top));
  });
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    setHover(nearest(e.clientX - rect.left, e.clientY - rect.top));
  });
  canvas.addEventListener('pointerleave', () => {
    if (document.activeElement !== canvas) setHover(null);
  });

  canvas.addEventListener('focus', () => { if (!hover) setHover(dots[0]); });
  canvas.addEventListener('blur', () => setHover(null));
  canvas.addEventListener('keydown', (e) => {
    const cur = hover || dots[0];
    const find = (dc, dr) => {
      for (let k = 1; k <= 3; k++) {
        const hit = grid.get((cur.col + dc * k) + ',' + (cur.row + dr * k));
        if (hit) return hit;
      }
      return null;
    };
    let next = null;
    switch (e.key) {
      case 'ArrowRight': next = find(1, 0); break;
      case 'ArrowLeft': next = find(-1, 0); break;
      case 'ArrowUp': next = find(0, -1); break;
      case 'ArrowDown': next = find(0, 1); break;
      case 'Home': next = dots[0]; break;
      case 'End': next = dots[TOTAL - 1]; break;
      case 'Escape': setHover(null); return;
      default: return;
    }
    e.preventDefault();
    if (next) setHover(next);
  });

  // ---------- ambient drift ----------

  const scheduleAmbient = () => {
    clearTimeout(ambientTimer);
    if (reduce || !visible || document.hidden || !introDone) return;
    ambientTimer = setTimeout(() => {
      const pool = dots.filter((d) => !d.anim && d.d === 0 && d !== hover);
      const dot = pool[Math.floor(Math.random() * pool.length)];
      if (dot) {
        const now = performance.now();
        animate(dot, 0, 1, 900, easeInOut, now);
        kick();
        setTimeout(() => {
          animate(dot, dot.d, 0, 700, easeOutBack, performance.now());
          kick();
          scheduleAmbient();
        }, 2600);
      } else scheduleAmbient();
    }, 6000 + Math.random() * 5000);
  };

  // ---------- lifecycle ----------

  const startIntro = () => {
    if (reduce) { introDone = true; updateStatus(); return; }
    setTimeout(() => { waveStart = performance.now(); kick(); }, 900);
  };

  new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) { kick(); if (introDone) scheduleAmbient(); }
    else clearTimeout(ambientTimer);
  }).observe(canvas);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(ambientTimer);
    else { kick(); if (introDone) scheduleAmbient(); }
  });

  reduceMq.addEventListener('change', (e) => {
    reduce = e.matches;
    if (reduce) {
      clearTimeout(ambientTimer);
      waveStart = -1;
      dots.forEach((dot) => { dot.anim = null; dot.d = 0; });
      introDone = true;
      updateStatus();
      draw(performance.now());
    } else scheduleAmbient();
  });

  darkMq.addEventListener('change', () => { readColors(); draw(performance.now()); });

  let resizeFrame = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(layout);
  }).observe(stage);

  readColors();
  layout();
  updateStatus();
  startIntro();
})();
