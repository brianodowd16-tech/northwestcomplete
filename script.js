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

// Audit checkout: send details to the server, then go to Revolut's payment page
const checkoutForm = document.getElementById("checkout-form");
if (checkoutForm) {
  const status = checkoutForm.querySelector(".form__status");
  const button = checkoutForm.querySelector('button[type="submit"]');
  if (new URLSearchParams(location.search).has("error")) {
    status.textContent = `We couldn't start the payment. Please try again, or email ${CONTACT_EMAIL}.`;
    status.classList.add("is-error");
  }
  checkoutForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    let valid = true;
    checkoutForm.querySelectorAll("[required]").forEach((field) => {
      const ok = field.type === "checkbox" ? field.checked : field.value.trim() !== "" && field.checkValidity();
      field.classList.toggle("is-invalid", !ok);
      if (!ok) valid = false;
    });
    if (!valid) {
      status.textContent = "Please enter your name and email, and tick the box to agree.";
      status.classList.add("is-error");
      return;
    }
    button.disabled = true;
    status.classList.remove("is-error");
    status.textContent = "Taking you to secure payment…";
    try {
      const res = await fetch(checkoutForm.action, {
        method: "POST",
        body: new FormData(checkoutForm),
        headers: { "X-Requested-With": "fetch" },
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message);
      window.location.href = data.checkout_url;
    } catch (err) {
      status.textContent = err.message || `We couldn't start the payment. Please try again, or email ${CONTACT_EMAIL}.`;
      status.classList.add("is-error");
      button.disabled = false;
    }
  });
}

// Payment result: poll the server until Revolut confirms the payment
const result = document.getElementById("payment-result");
if (result) {
  const ref = new URLSearchParams(location.search).get("ref") || "";
  const $ = (id) => document.getElementById(id);
  const show = (state, eyebrow, title, text) => {
    result.dataset.state = state;
    $("result-eyebrow").textContent = eyebrow;
    $("result-title").textContent = title;
    $("result-text").textContent = text;
    const icon = result.querySelector(".result__icon");
    if (state !== "checking") icon.textContent = state === "paid" ? "✓" : "!";
    if (state !== "checking") $("result-actions").hidden = false;
  };
  const showRef = () => { $("result-ref").hidden = false; $("result-ref").textContent = `Reference: ${ref}`; };
  let tries = 0;
  const check = async () => {
    tries += 1;
    try {
      const res = await fetch(`api/order-status.php?ref=${encodeURIComponent(ref)}`, { cache: "no-store" });
      const data = await res.json();
      if (data.status === "paid") {
        showRef();
        return show("paid", "Payment received", "Your audit is booked.",
          `Thanks! We've received ${data.amount} and sent a confirmation to ${data.email} with your next steps for scheduling the audit.`);
      }
      if (data.status === "failed") {
        return show("failed", "Payment not completed", "Your payment didn't go through.",
          "No money has been taken. You can try again, or contact us if the problem continues.");
      }
      if (data.status === "unknown") {
        return show("unknown", "Payment", "We couldn't find this booking.",
          `If you've paid, email ${CONTACT_EMAIL} with your name and we'll sort it out.`);
      }
    } catch { /* keep trying */ }
    if (tries < 20) return setTimeout(check, 3000);
    showRef();
    show("pending", "Payment processing", "Your payment is still processing.",
      `We'll email you as soon as it's confirmed. If you don't hear from us within an hour, contact ${CONTACT_EMAIL}.`);
  };
  if (ref) check();
  else show("unknown", "Payment", "We couldn't find this booking.", `If you've paid, email ${CONTACT_EMAIL} and we'll sort it out.`);
}
