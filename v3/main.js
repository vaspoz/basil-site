(() => {
  'use strict';

  const root = document.documentElement;
  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const smallQuery = window.matchMedia('(max-width: 860px)');

  const AMBER = [242, 165, 65];
  const AQUA = [127, 209, 199];
  const CHALK = [236, 231, 221];
  const MUTED = [154, 172, 171];

  const SERIF = '"Bodoni Moda", Didot, Georgia, serif';
  const SANS = '"Hanken Grotesk", system-ui, sans-serif';

  const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const smooth = (a, b, v) => {
    const x = clamp((v - a) / (b - a));
    return x * x * (3 - 2 * x);
  };
  const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const mix = (c1, c2, t, a = 1) =>
    rgba([lerp(c1[0], c2[0], t) | 0, lerp(c1[1], c2[1], t) | 0, lerp(c1[2], c2[2], t) | 0], a);

  function prng(seed) {
    let a = seed;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  /* Readout: a figure and a label at the top of a scene */

  function readoutMetrics(R) {
    const value = Math.round(clamp(R.w * 0.062, 26, 46));
    const label = R.w < 420 ? 13 : 15;
    return { value, label, height: value + label * 1.5 + 22 };
  }

  function drawReadout(ctx, R, value, label, color) {
    const m = readoutMetrics(R);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    ctx.font = `500 ${m.value}px ${SERIF}`;
    ctx.fillText(value, R.x, R.y + m.value * 0.86);
    ctx.fillStyle = rgba(MUTED);
    ctx.font = `400 ${m.label}px ${SANS}`;
    ctx.fillText(label, R.x, R.y + m.value * 0.86 + m.label * 1.6);
    return m.height;
  }

  /* Scene 1: six months of calendar days collapse into one hour */

  const calendar = (() => {
    const monthLengths = [31, 30, 31, 30, 31, 29];
    const days = [];
    let dayIndex = 0;
    monthLengths.forEach((len, m) => {
      const offset = (dayIndex + 2) % 7;
      for (let d = 0; d < len; d++) {
        const slot = offset + d;
        days.push({ month: m, col: slot % 7, row: Math.floor(slot / 7), index: dayIndex });
        dayIndex++;
      }
    });
    const total = days.length;
    const SPAN = 0.62;
    const DUR = 0.38;
    days.forEach((day) => {
      day.start = ((total - 1 - day.index) / (total - 1)) * SPAN;
    });

    function draw(ctx, R, t) {
      let arrived = 0;
      let progress = 0;
      for (const day of days) {
        day.u = clamp((t - day.start) / DUR);
        if (day.u >= 1) arrived++;
        progress += day.u;
      }
      progress /= total;
      const remaining = total - arrived;

      const top = drawReadout(
        ctx,
        R,
        remaining > 0 ? `${remaining} days` : '1 hour',
        'to a production-ready AKS cluster',
        remaining > 0 ? rgba(AMBER) : rgba(AQUA)
      );

      const area = { x: R.x, y: R.y + top, w: R.w, h: R.h - top };
      const labelH = area.w < 420 ? 18 : 24;
      const p = Math.min(area.w / 23.4, (area.h - 2 * labelH - 24) / 12.6, 32);
      const s = p * 0.74;
      const gapX = p * 1.2;
      const blockW = 7 * p - (p - s);
      const blockH = 6 * p - (p - s);
      const gapY = Math.max(16, p * 0.9);
      const totalW = 3 * blockW + 2 * gapX;
      const totalH = 2 * (labelH + blockH) + gapY;
      const ox = area.x + (area.w - totalW) / 2;
      const oy = area.y + Math.max(0, (area.h - totalH) / 2);
      const cx = ox + totalW / 2;
      const cy = oy + totalH / 2;

      const blockOrigin = (m) => {
        const bc = m % 3;
        const br = Math.floor(m / 3);
        return [ox + bc * (blockW + gapX), oy + br * (labelH + blockH + gapY) + labelH];
      };

      ctx.font = `400 ${area.w < 420 ? 12 : 14}px ${SANS}`;
      ctx.fillStyle = rgba(MUTED, 0.9 - 0.6 * progress);
      ctx.textAlign = 'left';
      for (let m = 0; m < 6; m++) {
        const [bx, by] = blockOrigin(m);
        ctx.fillText(`Month ${m + 1}`, bx, by - (area.w < 420 ? 6 : 9));
      }

      ctx.lineWidth = 1;
      for (const day of days) {
        const [bx, by] = blockOrigin(day.month);
        const hx = bx + day.col * p;
        const hy = by + day.row * p;
        if (day.u > 0) {
          ctx.strokeStyle = rgba(CHALK, 0.13 * clamp(day.u * 3));
          ctx.strokeRect(hx + 0.5, hy + 0.5, s - 1, s - 1);
        }
        if (day.u >= 1) continue;
        const e = easeInOut(day.u);
        const size = lerp(s, s * 0.32, e);
        const x = lerp(hx + s / 2, cx, e) - size / 2;
        const y = lerp(hy + s / 2, cy, e) - size / 2;
        const a = 1 - clamp((day.u - 0.78) / 0.22);
        ctx.fillStyle = mix(AMBER, AQUA, clamp((day.u - 0.45) / 0.55), a);
        roundRect(ctx, x, y, size, size, Math.min(2, size / 4));
        ctx.fill();
      }

      if (progress > 0) {
        const f = arrived / total;
        const S = p * 2.2 * easeOut(clamp(f * 1.08));
        if (S > 0.5) {
          ctx.fillStyle = mix(AMBER, AQUA, clamp(f * 1.6), 1);
          roundRect(ctx, cx - S / 2, cy - S / 2, S, S, Math.min(4, S / 5));
          ctx.fill();
        }
        if (remaining === 0) {
          ctx.fillStyle = rgba(CHALK);
          ctx.font = `500 ${area.w < 420 ? 14 : 16}px ${SANS}`;
          ctx.textBaseline = 'middle';
          ctx.fillText('1 hour', cx + p * 1.1 + 10, cy);
          ctx.textBaseline = 'alphabetic';
        }
      }
    }

    return { draw };
  })();

  /* Scene 2: 150 slow deployments snap to near-instant, in sync */

  const deploys = (() => {
    const N = 150;
    const MAX_MIN = 31;
    const rand = prng(20230901);
    const bars = [];
    for (let i = 0; i < N; i++) {
      const wait = rand() * 4;
      const len = 20 + rand() * (10 - wait);
      bars.push({ wait, len, start: (i / (N - 1)) * 0.45 });
    }
    const DUR = 0.55;
    const INSTANT = 0.4;

    function draw(ctx, R, t) {
      let last = 0;
      for (const b of bars) {
        b.e = easeInOut(clamp((t - b.start) / DUR));
        b.s = lerp(b.wait, 0, b.e);
        b.l = lerp(b.len, INSTANT, b.e);
        last = Math.max(last, b.s + b.l);
      }
      const done = last <= INSTANT + 0.01;
      const top = drawReadout(
        ctx,
        R,
        done ? 'Near-instant' : `${Math.round(last)} min`,
        done ? 'for all 150 clusters to update' : 'until the last of 150 clusters is updated',
        done ? rgba(AQUA) : rgba(AMBER)
      );

      const axisH = 26;
      const area = { x: R.x, y: R.y + top, w: R.w, h: R.h - top - axisH };
      const pitch = area.h / N;
      const thick = Math.max(1, pitch * 0.6);
      const xOf = (min) => area.x + (min / MAX_MIN) * area.w;

      ctx.lineWidth = 1;
      ctx.font = `400 ${area.w < 420 ? 12 : 13}px ${SANS}`;
      ctx.textBaseline = 'alphabetic';
      for (const m of [0, 10, 20, 30]) {
        const x = Math.round(xOf(m)) + 0.5;
        ctx.strokeStyle = rgba(CHALK, m === 0 ? 0.22 : 0.08);
        ctx.beginPath();
        ctx.moveTo(x, area.y);
        ctx.lineTo(x, area.y + area.h);
        ctx.stroke();
        ctx.fillStyle = rgba(MUTED);
        ctx.textAlign = m === 30 ? 'right' : m === 0 ? 'left' : 'center';
        ctx.fillText(m === 30 ? '30 min' : String(m), m === 30 ? x + 1 : x, area.y + area.h + 19);
      }
      ctx.textAlign = 'left';

      for (let i = 0; i < N; i++) {
        const b = bars[i];
        const y = area.y + i * pitch + (pitch - thick) / 2;
        if (b.s > 0.05) {
          ctx.fillStyle = rgba(CHALK, 0.1 * (1 - b.e));
          ctx.fillRect(xOf(0), y + thick / 2 - 0.5, xOf(b.s) - xOf(0), 1);
        }
        const w = Math.max(3, xOf(b.s + b.l) - xOf(b.s));
        ctx.fillStyle = mix(AMBER, AQUA, b.e, lerp(0.92, 1, b.e));
        ctx.fillRect(xOf(b.s), y, w, thick);
      }
    }

    return { draw };
  })();

  /* Scene 3: 1200 subscriptions settle onto one baseline */

  const guardrails = (() => {
    const N = 1200;
    const rand = prng(1200100);
    const gauss = () => {
      let u = 0;
      let v = 0;
      while (u === 0) u = rand();
      while (v === 0) v = rand();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    const clumps = Array.from({ length: 11 }, () => ({
      x: 0.08 + rand() * 0.84,
      y: 0.08 + rand() * 0.84,
      sd: 0.04 + rand() * 0.08,
    }));
    const dots = [];
    for (let i = 0; i < N; i++) {
      let x;
      let y;
      if (rand() < 0.68) {
        const c = clumps[(rand() * clumps.length) | 0];
        x = c.x + gauss() * c.sd;
        y = c.y + gauss() * c.sd;
      } else {
        x = rand();
        y = rand();
      }
      dots.push({
        bx: clamp(x, 0.01, 0.99),
        by: clamp(y, 0.01, 0.99),
        size: 0.45 + rand() * 1.1,
        alpha: 0.35 + rand() * 0.6,
      });
    }

    const DIVISORS = [20, 24, 25, 30, 40, 48, 50, 60];
    let layoutKey = '';
    let cols = 0;
    let rows = 0;
    function assign(aspect) {
      const key = aspect.toFixed(2);
      if (key === layoutKey) return;
      layoutKey = key;
      const ideal = Math.sqrt(N * aspect);
      cols = DIVISORS.reduce((best, d) => (Math.abs(d - ideal) < Math.abs(best - ideal) ? d : best), 40);
      rows = N / cols;
      const order = dots.map((_, i) => i).sort((a, b) => dots[a].bx - dots[b].bx);
      for (let c = 0; c < cols; c++) {
        const chunk = order.slice(c * rows, (c + 1) * rows).sort((a, b) => dots[a].by - dots[b].by);
        chunk.forEach((idx, r) => {
          dots[idx].col = c;
          dots[idx].row = r;
          dots[idx].start = (c / Math.max(1, cols - 1)) * 0.5;
        });
      }
    }

    function draw(ctx, R, t) {
      let aligned = 0;
      for (const d of dots) {
        d.u = clamp((t - (d.start || 0)) / 0.5);
        if (d.u >= 1) aligned++;
      }
      const top = drawReadout(
        ctx,
        R,
        aligned >= N ? '1200+' : String(aligned),
        aligned >= N ? 'subscriptions on one baseline' : 'of 1200+ subscriptions on one baseline',
        aligned > 0 ? rgba(AQUA) : rgba(AMBER)
      );

      const area = { x: R.x, y: R.y + top + 4, w: R.w, h: R.h - top - 8 };
      assign(area.w / area.h);
      const pitch = Math.min(area.w / cols, area.h / rows);
      const gw = pitch * cols;
      const gh = pitch * rows;
      const gx = area.x + (area.w - gw) / 2 + pitch / 2;
      const gy = area.y + (area.h - gh) / 2 + pitch / 2;
      const baseR = clamp(pitch * 0.26, 0.9, 3.2);

      for (const d of dots) {
        const e = easeInOut(d.u);
        const x = lerp(area.x + d.bx * area.w, gx + d.col * pitch, e);
        const y = lerp(area.y + d.by * area.h, gy + d.row * pitch, e);
        const r = lerp(baseR * d.size, baseR, e);
        ctx.fillStyle = mix(AMBER, AQUA, e, lerp(d.alpha, 1, e));
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    return { draw };
  })();

  const scenes = [calendar, deploys, guardrails];

  /* Canvas helpers */

  function fit(canvas, w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const W = Math.round(w * dpr);
    const H = Math.round(h * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return ctx;
  }

  function sceneRect(w, h) {
    const small = w < 520;
    const padX = small ? 20 : clamp(w * 0.085, 28, 88);
    const padY = small ? 18 : clamp(h * 0.13, 32, 120);
    const maxH = small ? h : Math.min(h - 2 * padY, (w - 2 * padX) * 1.05);
    const innerH = small ? h - 2 * padY : maxH;
    return { x: padX, y: (h - innerH) / 2, w: w - 2 * padX, h: innerH };
  }

  /* Sticky scroll story */

  const stage = document.querySelector('.stage');
  const stageCanvas = document.querySelector('.stage-canvas');
  const chapters = Array.from(document.querySelectorAll('.chapter'));
  const stills = Array.from(document.querySelectorAll('.still'));

  let ticking = false;
  let stillMode = false;

  function storyProgress() {
    const vh = window.innerHeight;
    const pinTop = smallQuery.matches ? stage.getBoundingClientRect().height : 0;
    const span = vh - pinTop;
    return chapters.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        p: clamp((pinTop - r.top) / Math.max(1, r.height - span)),
        enter: clamp((vh - r.top) / Math.max(1, span)),
      };
    });
  }

  const toT = (p) => clamp((p - 0.08) / 0.78);

  function drawStage() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    const ctx = fit(stageCanvas, w, h);
    const R = sceneRect(w, h);
    const states = storyProgress();

    let i = 0;
    for (let k = 1; k < states.length; k++) if (states[k].enter > 0) i = k;

    const e = states[i].enter;
    if (i > 0 && e < 1) {
      if (e < 0.5) {
        ctx.globalAlpha = 1 - smooth(0.2, 0.5, e);
        scenes[i - 1].draw(ctx, R, toT(states[i - 1].p));
      } else {
        ctx.globalAlpha = smooth(0.5, 0.8, e);
        scenes[i].draw(ctx, R, toT(states[i].p));
      }
    } else {
      ctx.globalAlpha = 1;
      scenes[i].draw(ctx, R, toT(states[i].p));
    }
    ctx.globalAlpha = 1;
  }

  /* Still images for reduced motion: before and after side by side */

  function drawStill(canvas) {
    const scene = scenes[Number(canvas.dataset.scene)];
    const w = canvas.clientWidth;
    if (!w) return;
    const wide = w >= 520;
    const h = Math.round(wide ? w * 0.5 : w * 1.35);
    canvas.style.height = `${h}px`;
    const ctx = fit(canvas, w, h);
    const pad = wide ? 28 : 18;
    let a;
    let b;
    if (wide) {
      const half = (w - pad * 3) / 2;
      a = { x: pad, y: pad, w: half, h: h - pad * 2 };
      b = { x: pad * 2 + half, y: pad, w: half, h: h - pad * 2 };
      ctx.strokeStyle = rgba(CHALK, 0.12);
      ctx.beginPath();
      ctx.moveTo(Math.round(w / 2) + 0.5, pad);
      ctx.lineTo(Math.round(w / 2) + 0.5, h - pad);
      ctx.stroke();
    } else {
      const half = (h - pad * 3) / 2;
      a = { x: pad, y: pad, w: w - pad * 2, h: half };
      b = { x: pad, y: pad * 2 + half, w: w - pad * 2, h: half };
      ctx.strokeStyle = rgba(CHALK, 0.12);
      ctx.beginPath();
      ctx.moveTo(pad, Math.round(h / 2) + 0.5);
      ctx.lineTo(w - pad, Math.round(h / 2) + 0.5);
      ctx.stroke();
    }
    scene.draw(ctx, a, 0);
    scene.draw(ctx, b, 1);
  }

  function render() {
    ticking = false;
    if (stillMode) stills.forEach(drawStill);
    else drawStage();
  }

  function request() {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(render);
    }
  }

  function setMode() {
    stillMode = reduceQuery.matches;
    root.classList.toggle('still-mode', stillMode);
    request();
  }

  if (!stage || !stageCanvas || !chapters.length) return;

  setMode();
  window.addEventListener('scroll', () => { if (!stillMode) request(); }, { passive: true });
  window.addEventListener('resize', request, { passive: true });
  reduceQuery.addEventListener('change', setMode);
  smallQuery.addEventListener('change', request);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(request);
    document.fonts.load(`500 40px ${SERIF}`).then(request, () => {});
  }
})();
