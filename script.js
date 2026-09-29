// Shown to visitors as a fallback if the form can't be sent.
const CONTACT_EMAIL = "hello@northwestcomplete.com";

document.documentElement.classList.add("js");

// Sticky nav background on scroll
const nav = document.querySelector(".nav");
const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 10);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

// Mobile menu
const toggle = document.querySelector(".nav__toggle");
const menu = document.getElementById("mobile-menu");
const setMenu = (open) => {
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  menu.hidden = !open;
};
toggle.addEventListener("click", () => setMenu(menu.hidden));
menu.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });

// Reveal on scroll
const revealEls = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  revealEls.forEach((el) => io.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add("is-visible"));
}

// Cursor-follow glow on service cards
document.querySelectorAll(".card").forEach((card) => {
  card.addEventListener("pointermove", (e) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${e.clientX - r.left}px`);
    card.style.setProperty("--my", `${e.clientY - r.top}px`);
  });
});

// Buttons that pre-select a service in the contact form
document.querySelectorAll("[data-service]").forEach((link) => {
  link.addEventListener("click", () => {
    const select = document.getElementById("service");
    if (select) select.value = link.dataset.service;
  });
});

// Contact details
document.querySelectorAll("[data-contact-email]").forEach((a) => {
  a.href = `mailto:${CONTACT_EMAIL}`;
  a.textContent = CONTACT_EMAIL;
});
document.getElementById("year").textContent = new Date().getFullYear();

// Contact form: validate, then send to contact.php on the server
const form = document.getElementById("contact-form");
if (form) {
  const status = form.querySelector(".form__status");
  const submitBtn = form.querySelector('button[type="submit"]');
  document.getElementById("form-started").value = Date.now();

  const setStatus = (msg, isError) => {
    status.textContent = msg;
    status.classList.toggle("is-error", Boolean(isError));
  };

  // Result of a no-JavaScript submission (contact.php redirects back here)
  const params = new URLSearchParams(location.search);
  if (params.has("sent")) setStatus("Thanks, your enquiry has been sent. We'll be in touch within one working day.");
  if (params.has("error")) setStatus(`Your enquiry could not be sent. Please email us at ${CONTACT_EMAIL}.`, true);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    let valid = true;
    form.querySelectorAll("[required]").forEach((field) => {
      const ok = field.value.trim() !== "" && field.checkValidity();
      field.classList.toggle("is-invalid", !ok);
      if (!ok) valid = false;
    });
    if (!valid) {
      setStatus("Please fill in your name, a valid email and a message.", true);
      return;
    }

    submitBtn.disabled = true;
    setStatus("Sending…");
    try {
      const res = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { "X-Requested-With": "fetch" },
      });
      const data = await res.json();
      setStatus(data.message, !data.ok);
      if (data.ok) form.reset();
    } catch {
      setStatus(`Your enquiry could not be sent. Please email us at ${CONTACT_EMAIL}.`, true);
    } finally {
      submitBtn.disabled = false;
      document.getElementById("form-started").value = Date.now();
    }
  });
}
