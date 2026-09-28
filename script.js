// Where contact form enquiries are sent (opens the visitor's email client).
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

// Contact details
document.querySelectorAll("[data-contact-email]").forEach((a) => {
  a.href = `mailto:${CONTACT_EMAIL}`;
  a.textContent = CONTACT_EMAIL;
});
document.getElementById("year").textContent = new Date().getFullYear();

// Contact form: validate, then open a pre-filled email
const form = document.getElementById("contact-form");
const status = form.querySelector(".form__status");
form.addEventListener("submit", (e) => {
  e.preventDefault();
  let valid = true;
  form.querySelectorAll("[required]").forEach((field) => {
    const ok = field.value.trim() !== "" && field.checkValidity();
    field.classList.toggle("is-invalid", !ok);
    if (!ok) valid = false;
  });
  if (!valid) {
    status.textContent = "Please fill in your name, a valid email and a message.";
    status.classList.add("is-error");
    return;
  }
  const d = Object.fromEntries(new FormData(form));
  const subject = `Enquiry: ${d.service}${d.business ? ` - ${d.business}` : ""}`;
  const body = `Name: ${d.name}\nBusiness: ${d.business || "-"}\nEmail: ${d.email}\nService: ${d.service}\n\n${d.message}`;
  window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  status.classList.remove("is-error");
  status.textContent = `Opening your email app with the enquiry filled in. If nothing opens, email us at ${CONTACT_EMAIL}.`;
});
