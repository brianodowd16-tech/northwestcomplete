# TAR Performance website

Static one-page site for TAR Performance (Teelesh, Carrick-on-Shannon, Co. Leitrim) –
mechanical repairs, diagnostics, tyres, ECU remapping and detailing.

No build step: open `index.html` in a browser, or upload the `tar-performance/` folder to any
static host (Netlify, GitHub Pages, Cloudflare Pages, cPanel, etc.).

## Before going live

- **Contact details** – edit the `CONFIG` block at the top of `assets/main.js`
  (phone, WhatsApp number, email). Also update `"telephone"` in the JSON-LD block in `index.html`.
- **Opening hours** – in the Contact section of `index.html`.
- **Prices** – detailing packages currently say "get in touch for a quote"; add prices if wanted.
- **Photos** – drop real workshop/car photos into `assets/` and add them to the hero or cards.

The booking form needs no server: it opens a pre-filled email or WhatsApp message to the business.
