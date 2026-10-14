(() => {
  'use strict';

  const svg = document.querySelector('.name-modules');
  const caption = document.querySelector('.apply');
  const hero = document.querySelector('.hero');
  if (!svg || !hero) return;

  const NS = 'http://www.w3.org/2000/svg';

  // Letters drawn on a 7-row module grid. '#' is a module whose open outer
  // corners get rounded; 'X' is a module that always keeps square corners.
  // Every module touches its neighbours edge to edge, so strokes stay continuous.
  const GLYPHS = {
    B: ['X####', '#...#', '#...#', '####.', '#...#', '#...#', 'X####'],
    A: ['#####', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    S: ['#####', '#....', '#....', '#####', '....#', '....#', '#####'],
    I: ['#', '#', '#', '#', '#', '#', '#'],
    L: ['#...', '#...', '#...', '#...', '#...', '#...', 'X###'],
    P: ['X####', '#...#', '#...#', '#####', '#....', '#....', '#....'],
    O: ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#####'],
    Z: ['#####', '...##', '..##.', '.###.', '.##..', '##...', '#####'],
    D: ['X####', '#...#', '#...#', '#...#', '#...#', '#...#', 'X####'],
    E: ['X###', '#...', '#...', '###.', '#...', '#...', 'X###'],
    V: ['#...#', '#...#', '#...#', '#...#', '##.##', '.###.', '..#..'],
  };

  const LINES = ['BASIL', 'POZDEEV'];
  const ROWS = 7;
  const LINE_GAP = 2;
  const GAP = 0.09; // seam between modules, in module units
  const H = (1 - GAP) / 2;

  // ---- Lay out modules -------------------------------------------------

  const occupied = new Map(); // "c,r" -> char
  let cols = 0;
  LINES.forEach((word, li) => {
    let x = 0;
    const y0 = li * (ROWS + LINE_GAP);
    [...word].forEach((ch, i) => {
      const g = GLYPHS[ch];
      if (i > 0) x += 1;
      g.forEach((row, r) => {
        [...row].forEach((v, c) => {
          if (v !== '.') occupied.set(`${x + c},${y0 + r}`, v);
        });
      });
      x += g[0].length;
    });
    cols = Math.max(cols, x);
  });
  const rows = LINES.length * ROWS + (LINES.length - 1) * LINE_GAP;

  const has = (c, r) => occupied.has(`${c},${r}`);

  function cellPath(c, r, kind) {
    const square = kind === 'X';
    const up = has(c, r - 1), down = has(c, r + 1);
    const left = has(c - 1, r), right = has(c + 1, r);
    const rad = H;
    const tl = !square && !up && !left ? rad : 0;
    const tr = !square && !up && !right ? rad : 0;
    const br = !square && !down && !right ? rad : 0;
    const bl = !square && !down && !left ? rad : 0;
    const f = (n) => +n.toFixed(4);
    return [
      `M${f(-H + tl)},${f(-H)}`,
      `H${f(H - tr)}`,
      tr ? `A${f(tr)},${f(tr)} 0 0 1 ${f(H)},${f(-H + tr)}` : '',
      `V${f(H - br)}`,
      br ? `A${f(br)},${f(br)} 0 0 1 ${f(H - br)},${f(H)}` : '',
      `H${f(-H + bl)}`,
      bl ? `A${f(bl)},${f(bl)} 0 0 1 ${f(-H)},${f(H - bl)}` : '',
      `V${f(-H + tl)}`,
      tl ? `A${f(tl)},${f(tl)} 0 0 1 ${f(-H + tl)},${f(-H)}` : '',
      'Z',
    ].join('');
  }

  svg.setAttribute('viewBox', `0 0 ${cols} ${rows}`);
  // On narrow screens CSS stretches the modules vertically into a condensed cut.
  svg.setAttribute('preserveAspectRatio', 'none');

  // Paper behind the letters hides the page column guides inside the name block.
  const paper = document.createElementNS(NS, 'rect');
  paper.setAttribute('class', 'paper');
  paper.setAttribute('x', -0.5);
  paper.setAttribute('y', -0.5);
  paper.setAttribute('width', cols + 1);
  paper.setAttribute('height', rows + 1);
  svg.appendChild(paper);

  // Faint construction grid behind the letters.
  const gridGroup = document.createElementNS(NS, 'g');
  gridGroup.setAttribute('class', 'grid-lines');
  for (let x = 0; x <= cols; x++) {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', x); l.setAttribute('x2', x);
    l.setAttribute('y1', 0); l.setAttribute('y2', rows);
    gridGroup.appendChild(l);
  }
  for (let y = 0; y <= rows; y++) {
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('y1', y); l.setAttribute('y2', y);
    l.setAttribute('x1', 0); l.setAttribute('x2', cols);
    gridGroup.appendChild(l);
  }
  svg.appendChild(gridGroup);

  const planGroup = document.createElementNS(NS, 'g');
  const cellGroup = document.createElementNS(NS, 'g');
  svg.appendChild(planGroup);
  svg.appendChild(cellGroup);

  const cells = [];
  occupied.forEach((kind, key) => {
    const [c, r] = key.split(',').map(Number);
    const d = cellPath(c, r, kind);
    const cx = c + 0.5, cy = r + 0.5;

    const plan = document.createElementNS(NS, 'path');
    plan.setAttribute('d', d);
    plan.setAttribute('class', 'plan');
    plan.setAttribute('transform', `translate(${cx} ${cy})`);
    plan.setAttribute('opacity', '0');
    planGroup.appendChild(plan);

    const el = document.createElementNS(NS, 'path');
    el.setAttribute('d', d);
    el.setAttribute('class', 'cell');
    cellGroup.appendChild(el);

    cells.push({
      el, plan, c, r, cx, cy,
      dx: 0, dy: 0, vx: 0, vy: 0, s: 1, vs: 0,
      delay: 0, last: '',
    });
  });

  const TOTAL = cells.length;

  // Apply order: a sweep from left to right, rows nudging it along slightly.
  cells.forEach((cell) => {
    const jitter = ((cell.c * 7 + cell.r * 13) % 10) / 10;
    cell.delay = 220 + (cell.c / (cols - 1)) * 640 + cell.r * 9 + jitter * 50;
  });

  // ---- Motion ------------------------------------------------------------

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const PLAN_MS = 220;
  const CELL_MS = 300;
  const DONE_MS = Math.max(...cells.map((c) => c.delay)) + CELL_MS;

  let start = 0;
  let provisioning = true;
  let pointer = null;           // {x, y} in module units, mouse/pen only
  const ripples = [];           // {x, y, t}
  let running = false;
  let heroVisible = true;
  let lastT = 0;
  let lastCount = -1;

  const easeOutBack = (t) => {
    const c1 = 1.5, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

  function setCaption(text) {
    if (caption && caption.textContent !== text) caption.textContent = text;
  }

  function render(cell, provScale, opacity) {
    const s = cell.s * provScale;
    const key = `${cell.dx.toFixed(3)} ${cell.dy.toFixed(3)} ${s.toFixed(3)} ${opacity.toFixed(2)}`;
    if (key === cell.last) return;
    cell.last = key;
    cell.el.setAttribute(
      'transform',
      `translate(${(cell.cx + cell.dx).toFixed(3)} ${(cell.cy + cell.dy).toFixed(3)}) scale(${s.toFixed(3)})`
    );
    cell.el.setAttribute('opacity', opacity.toFixed(2));
  }

  function finishInstantly() {
    provisioning = false;
    ripples.length = 0;
    pointer = null;
    cells.forEach((cell) => {
      cell.dx = cell.dy = cell.vx = cell.vy = cell.vs = 0;
      cell.s = 1;
      cell.plan.setAttribute('opacity', '1');
      render(cell, 1, 1);
    });
    setCaption(`${TOTAL} modules applied`);
  }

  function toLocal(e) {
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * cols,
      y: ((e.clientY - rect.top) / rect.height) * rows,
    };
  }

  function frame(now) {
    if (!heroVisible || document.hidden) { running = false; return; }

    const dtSteps = Math.min(4, Math.max(1, Math.round((now - (lastT || now - 16.7)) / 16.7)));
    lastT = now;
    const t = now - start;
    let active = false;

    // Provisioning sequence.
    let applied = 0;
    if (provisioning) {
      const planT = clamp01(t / PLAN_MS);
      if (t > DONE_MS + 40) provisioning = false;
      cells.forEach((cell) => {
        const p = clamp01((t - cell.delay) / CELL_MS);
        if (p >= 1) applied++;
        cell.plan.setAttribute('opacity', clamp01(planT * 1.2 - (cell.c / cols) * 0.2).toFixed(2));
      });
      if (t < PLAN_MS) setCaption(`Plan: ${TOTAL} modules to add`);
      else if (applied !== lastCount) {
        lastCount = applied;
        setCaption(applied >= TOTAL ? `${TOTAL} modules applied` : `Applying ${applied} of ${TOTAL}`);
      }
      active = true;
    }

    // Ripples expire.
    for (let i = ripples.length - 1; i >= 0; i--) {
      if (now - ripples[i].t > 1300) ripples.splice(i, 1);
    }
    if (ripples.length) active = true;

    cells.forEach((cell) => {
      let tx = 0, ty = 0, ts = 1;

      if (pointer) {
        const ddx = cell.cx - pointer.x, ddy = cell.cy - pointer.y;
        const d = Math.hypot(ddx, ddy);
        const R = 2.8;
        if (d < R) {
          let f = 1 - d / R;
          f = f * f * (3 - 2 * f);
          const n = d || 1;
          tx += (ddx / n) * f * 0.22;
          ty += (ddy / n) * f * 0.22;
          ts -= f * 0.24;
        }
      }

      for (const rp of ripples) {
        const age = now - rp.t;
        const radius = age * 0.04;
        const ddx = cell.cx - rp.x, ddy = cell.cy - rp.y;
        const d = Math.hypot(ddx, ddy);
        const band = 1.6;
        const w = Math.exp(-Math.pow((d - radius) / band, 2)) * (1 - age / 1300);
        if (w > 0.01) {
          const n = d || 1;
          tx += (ddx / n) * w * 0.32;
          ty += (ddy / n) * w * 0.32;
          ts -= w * 0.16;
        }
      }

      for (let k = 0; k < dtSteps; k++) {
        cell.vx = (cell.vx + (tx - cell.dx) * 0.14) * 0.74;
        cell.vy = (cell.vy + (ty - cell.dy) * 0.14) * 0.74;
        cell.vs = (cell.vs + (ts - cell.s) * 0.14) * 0.74;
        cell.dx += cell.vx;
        cell.dy += cell.vy;
        cell.s += cell.vs;
      }

      const moving =
        Math.abs(cell.vx) + Math.abs(cell.vy) + Math.abs(cell.vs) > 0.0004 ||
        Math.abs(tx - cell.dx) + Math.abs(ty - cell.dy) + Math.abs(ts - cell.s) > 0.0008;
      if (moving) active = true;

      let provScale = 1, opacity = 1;
      if (provisioning) {
        const p = clamp01((t - cell.delay) / CELL_MS);
        provScale = p === 0 ? 0.001 : 0.25 + 0.75 * easeOutBack(p);
        opacity = clamp01(p * 2.2);
      }
      render(cell, provScale, opacity);
    });

    if (active) requestAnimationFrame(frame);
    else running = false;
  }

  function kick() {
    if (running || reduce.matches || !heroVisible || document.hidden) return;
    running = true;
    lastT = 0;
    requestAnimationFrame(frame);
  }

  // Pointer response: mouse and pen push modules aside, a tap sends a ripple.
  hero.addEventListener('pointermove', (e) => {
    if (reduce.matches || e.pointerType === 'touch') return;
    pointer = toLocal(e);
    kick();
  }, { passive: true });

  hero.addEventListener('pointerleave', () => {
    pointer = null;
    kick();
  });

  svg.addEventListener('pointerdown', (e) => {
    if (reduce.matches) return;
    const p = toLocal(e);
    ripples.push({ x: p.x, y: p.y, t: performance.now() });
    if (ripples.length > 4) ripples.shift();
    kick();
  }, { passive: true });

  // Pause while the hero is off screen or the tab is hidden.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      heroVisible = entries[0].isIntersecting;
      if (heroVisible) kick();
    }).observe(svg);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) kick();
  });

  reduce.addEventListener?.('change', () => {
    if (reduce.matches) finishInstantly();
  });

  if (reduce.matches) {
    finishInstantly();
  } else {
    cells.forEach((cell) => render(cell, 0.001, 0));
    setCaption(`Plan: ${TOTAL} modules to add`);
    start = performance.now();
    kick();
  }
})();
