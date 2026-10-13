// Helpers shared by the landing and success pages.

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function euro(cents, { trim = false } = {}) {
  const v = cents / 100;
  const whole = trim && Number.isInteger(v);
  return v.toLocaleString('en-IE', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2,
  });
}

export function countdown(el, iso, onDone) {
  if (!el) return;
  const end = Date.parse(iso);
  const pad = (n) => String(n).padStart(2, '0');
  const tick = () => {
    const ms = end - Date.now();
    if (ms <= 0) { clearInterval(timer); onDone?.(); return; }
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
    el.textContent = d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m` : `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
  };
  const timer = setInterval(tick, 1000);
  tick();
}

let revealObserver;
export function observeReveals() {
  if (reduceMotion() || !('IntersectionObserver' in window)) {
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-in'));
    return;
  }
  revealObserver ??= new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); revealObserver.unobserve(e.target); }
  }, { threshold: .12, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal:not(.is-in)').forEach((el) => revealObserver.observe(el));
}

/** Rolling-digit odometer, like a pump's mechanical counter. */
export function setOdometer(el, value) {
  const str = String(value).padStart(4, '0');
  el.textContent = '';
  el.setAttribute('aria-label', String(value));
  [...str].forEach((ch, i) => {
    const digit = document.createElement('span');
    digit.className = 'odometer__digit';
    const strip = document.createElement('span');
    strip.className = 'odometer__strip';
    strip.setAttribute('aria-hidden', 'true');
    // Two full spins then land on the digit, so every column rolls.
    for (let n = 0; n < 30; n++) {
      const s = document.createElement('span');
      s.textContent = n % 10;
      strip.append(s);
    }
    digit.append(strip);
    el.append(digit);
    const target = 20 + Number(ch);
    strip.style.transitionDelay = `${i * 120}ms`;
    requestAnimationFrame(() => requestAnimationFrame(() => { strip.style.transform = `translateY(-${target}em)`; }));
  });
}

/** Gentle snowfall. Skipped entirely for reduced-motion users. */
export function startSnow(canvas) {
  if (!canvas || reduceMotion()) return;
  const ctx = canvas.getContext('2d');
  let w, h, flakes;
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.width = innerWidth * dpr;
    h = canvas.height = innerHeight * dpr;
    const count = Math.round(Math.min(90, innerWidth / 14));
    flakes = Array.from({ length: count }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: (Math.random() * 1.8 + .6) * dpr, v: (Math.random() * .5 + .25) * dpr,
      drift: Math.random() * Math.PI * 2, o: Math.random() * .5 + .25,
    }));
  };
  resize();
  addEventListener('resize', resize);
  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    for (const f of flakes) {
      f.y += f.v; f.drift += .01; f.x += Math.sin(f.drift) * .3;
      if (f.y > h) { f.y = -5; f.x = Math.random() * w; }
      ctx.globalAlpha = f.o;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fillStyle = '#eef3ff'; ctx.fill();
    }
    if (!document.hidden) requestAnimationFrame(draw);
    else document.addEventListener('visibilitychange', () => requestAnimationFrame(draw), { once: true });
  };
  requestAnimationFrame(draw);
}
