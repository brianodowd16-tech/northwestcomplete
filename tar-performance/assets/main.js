// ---------------------------------------------------------------
// Business contact details – edit these and the whole site updates.
// ---------------------------------------------------------------
const CONFIG = {
  phoneDisplay: '000 000 0000',          // shown on the page
  phoneIntl: '+353000000000',            // used for tel: links
  whatsapp: '353000000000',              // international format, no + or spaces
  email: 'info@tarperformance.ie',
};

document.addEventListener('DOMContentLoaded', () => {
  // Apply contact details
  document.querySelectorAll('[data-phone-link]').forEach(a => { a.href = `tel:${CONFIG.phoneIntl}`; });
  document.querySelectorAll('[data-phone-text]').forEach(el => { el.textContent = CONFIG.phoneDisplay; });
  document.querySelectorAll('[data-whatsapp-link]').forEach(a => { a.href = `https://wa.me/${CONFIG.whatsapp}`; });
  document.querySelectorAll('[data-email-link]').forEach(a => { a.href = `mailto:${CONFIG.email}`; });
  document.querySelectorAll('[data-email-text]').forEach(el => { el.textContent = CONFIG.email; });

  document.getElementById('year').textContent = new Date().getFullYear();

  // Mobile nav
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  const setOpen = open => {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  toggle.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setOpen(false)));

  // Header shadow on scroll
  const header = document.querySelector('.site-header');
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 10);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // "Book" buttons on detailing packages preselect the service
  const form = document.getElementById('booking-form');
  const serviceSelect = form.elements.service;
  document.querySelectorAll('[data-service]').forEach(btn => {
    btn.addEventListener('click', () => { serviceSelect.value = btn.dataset.service; });
  });

  // Booking form: compose an email or WhatsApp message (no backend needed)
  const status = form.querySelector('.form-status');
  let sendVia = 'email';
  form.querySelectorAll('[data-send]').forEach(btn => {
    btn.addEventListener('click', () => { sendVia = btn.dataset.send; });
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    const missing = ['name', 'phone', 'service'].filter(k => !String(d[k] || '').trim());
    form.querySelectorAll('input, select').forEach(el => el.classList.toggle('invalid', missing.includes(el.name)));
    if (missing.length) {
      status.textContent = 'Please fill in your name, phone number and the service you need.';
      status.className = 'form-status error';
      return;
    }

    const lines = [
      `Booking enquiry – ${d.service}`,
      '',
      `Name: ${d.name}`,
      `Phone: ${d.phone}`,
      d.car && `Car: ${d.car}`,
      d.reg && `Reg: ${d.reg}`,
      d.date && `Preferred date: ${d.date}`,
      d.message && `\nDetails:\n${d.message}`,
    ].filter(Boolean);
    const body = lines.join('\n');

    if (sendVia === 'whatsapp') {
      window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(body)}`, '_blank', 'noopener');
    } else {
      const subject = `Booking enquiry – ${d.service}`;
      window.location.href = `mailto:${CONFIG.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }
    status.textContent = 'Thanks! Your message is ready to send – we\'ll be in touch soon.';
    status.className = 'form-status ok';
  });
});
