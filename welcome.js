// Welcome scene: Brían greets the visitor, they pick a challenge, he answers it.
(() => {
  const root = document.getElementById("welcome");
  if (!root) return;
  const $ = (s, el = root) => el.querySelector(s);
  const $$ = (s, el = root) => [...el.querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const panel = $("#welcome-panel"), reply = $("#welcome-answer"), say = $("#welcome-say");
  const stage = $("#stage"), orbs = $$(".orb"), steps = $$(".journey li");
  const intro = say.textContent;
  let current = null, typer = null, selectedLabel = "";

  const setSteps = (n) => steps.forEach((li) => {
    const i = +li.dataset.step;
    li.classList.toggle("is-active", i === n);
    li.classList.toggle("is-done", i < n);
  });

  // Remember what the visitor came to solve, so the enquiry and booking show it.
  const remember = (key, label) => {
    try {
      const list = (JSON.parse(sessionStorage.getItem("nwc_utm") || "[]") || []).filter((x) => !String(x).startsWith("problem: "));
      list.push("problem: " + key);
      sessionStorage.setItem("nwc_utm", JSON.stringify(list));
      sessionStorage.setItem("nwc_problem", label);
    } catch { /* storage unavailable */ }
  };

  const type = (el, text) => {
    clearInterval(typer);
    if (reduce) { el.textContent = text; return; }
    let i = 0;
    el.textContent = "";
    typer = setInterval(() => {
      i += 2;
      el.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(typer);
    }, 16);
  };

  const select = (key, { focus = true } = {}) => {
    const answer = $(`.answer[data-key="${key}"]`);
    if (!answer) return;
    current = key;
    $$(".answer").forEach((a) => { a.hidden = a !== answer; });
    selectedLabel = $(".answer__title", answer).textContent;
    panel.dataset.state = "answer";
    reply.hidden = false;
    $$(".pill").forEach((p) => p.classList.toggle("is-current", p.dataset.key === key));
    orbs.forEach((o) => o.classList.toggle("is-on", o.dataset.key === key));
    stage.classList.add("has-pick");
    spinTo(key);
    setSteps(2);
    // Typewriter on the answer; the full text stays available to screen readers via textContent updates.
    const p = $(".answer__say", answer);
    type(p, p.dataset.say);
    say.textContent = "Great choice. Here's how I'd help.";
    $("[data-welcome-ask]").dataset.service = answer.dataset.service;
    remember(key, selectedLabel);
    if (focus) {
      $(".answer__title", answer).focus({ preventScroll: true });
      if (matchMedia("(max-width: 979px)").matches) reply.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  };

  const back = () => {
    current = null;
    clearInterval(typer);
    panel.dataset.state = "pick";
    reply.hidden = true;
    orbs.forEach((o) => o.classList.remove("is-on"));
    stage.classList.remove("has-pick");
    say.textContent = intro;
    setSteps(1);
    $(".problem").focus({ preventScroll: true });
  };

  $$(".problem").forEach((b) => b.addEventListener("click", () => select(b.dataset.key)));
  $$(".pill").forEach((b) => b.addEventListener("click", () => select(b.dataset.key, { focus: false })));
  $(".reply__back").addEventListener("click", back);
  // Hovering a challenge lights up its orb in the 3D scene.
  $$(".problem").forEach((b) => {
    const hot = (on) => orbs.forEach((o) => { if (o.dataset.key === b.dataset.key && !current) o.classList.toggle("is-on", on); });
    b.addEventListener("pointerenter", () => hot(true));
    b.addEventListener("pointerleave", () => hot(false));
    b.addEventListener("focus", () => hot(true));
    b.addEventListener("blur", () => hot(false));
    // Gentle 3D tilt that follows the pointer
    if (!reduce) {
      b.addEventListener("pointermove", (e) => {
        if (e.pointerType !== "mouse") return;
        const r = b.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        b.style.setProperty("--ry", `${(x - 0.5) * 8}deg`);
        b.style.setProperty("--rx", `${(0.5 - y) * 6}deg`);
        b.style.setProperty("--mx", `${x * 100}%`);
        b.style.setProperty("--my", `${y * 100}%`);
      });
      b.addEventListener("pointerleave", () => { b.style.setProperty("--ry", "0deg"); b.style.setProperty("--rx", "0deg"); });
    }
  });
  // The booking and contact buttons carry the choice forward.
  $("[data-welcome-ask]").addEventListener("click", (e) => {
    const sel = document.getElementById("service");
    if (sel && e.currentTarget.dataset.service) sel.value = e.currentTarget.dataset.service;
  });

  /* ---- 3D scene: orbit spin, pointer tilt, drag to rotate ---- */
  const angle = {}; orbs.forEach((o) => { angle[o.dataset.key] = +o.style.getPropertyValue("--a"); });
  let spin = 0, target = null, rx = 0, ry = 0, trx = -8, ty = 0, dragging = false, lastX = 0, moved = 0, resumeAt = 0;
  const norm = (a) => ((a % 360) + 540) % 360 - 180;
  function spinTo(key) { target = -angle[key]; if (reduce) { spin = target; paint(); } }
  const scene = $(".stage__scene"), orbit = $(".orbit");
  function paint() {
    orbit.style.setProperty("--spin", spin.toFixed(2));
    orbs.forEach((o) => o.style.setProperty("--spin", spin.toFixed(2)));
    scene.style.setProperty("--rx", rx.toFixed(2));
    scene.style.setProperty("--ry", ry.toFixed(2));
  }
  function frame(t) {
    if (target !== null) {
      const d = norm(target - spin);
      spin += d * 0.09;
      if (Math.abs(d) < 0.2) { spin = target; }
    } else if (!dragging && t > resumeAt && !current) {
      spin += 0.12;
    }
    rx += (trx - rx) * 0.08; ry += (ty - ry) * 0.08;
    paint();
    requestAnimationFrame(frame);
  }
  if (!reduce) {
    trx = -10;
    root.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      const r = stage.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width / 2)) / window.innerWidth, y = (e.clientY - (r.top + r.height / 2)) / window.innerHeight;
      ty = Math.max(-1, Math.min(1, x * 2)) * 14;
      trx = -10 - Math.max(-1, Math.min(1, y * 2)) * 8;
    });
    stage.addEventListener("pointerdown", (e) => { dragging = true; moved = 0; lastX = e.clientX; target = null; stage.classList.add("is-drag"); stage.setPointerCapture(e.pointerId); });
    stage.addEventListener("pointermove", (e) => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; moved += Math.abs(dx); spin += dx * 0.45; });
    const end = (e) => {
      if (!dragging) return;
      dragging = false; stage.classList.remove("is-drag"); resumeAt = performance.now() + 1500;
      if (moved < 6) { // a tap, not a drag: did it land on an orb?
        const hit = document.elementsFromPoint(e.clientX, e.clientY).map((el) => el.closest && el.closest(".orb")).find(Boolean);
        if (hit) select(hit.dataset.key);
      }
    };
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);
    requestAnimationFrame(frame);
  } else {
    orbs.forEach((o) => o.addEventListener("click", () => select(o.dataset.key)));
    paint();
  }

  // Campaign links can open straight onto a challenge: /?problem=connect
  const pre = new URLSearchParams(location.search).get("problem");
  if (pre) select(pre, { focus: false });
})();
