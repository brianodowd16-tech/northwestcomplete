# gasworkshousecarrick.com

A custom one-page WordPress theme for **Gasworks House**, a boutique hen and stag house in Carrick-on-Shannon.

![Desktop preview](preview-desktop.png)

## What's on the page

- **Hero**: headline, key facts (guests, bedrooms, bathrooms, minimum nights) and a booking button
- **The house**: description and a feature checklist
- **Photo gallery**: your 4 photos are built in, so the site works straight away. Choose different photos in the Customizer to replace them.
- **Hens & stags**: a hen/stag toggle with party ideas for each
- **Carrick-on-Shannon**: things to do, directions and a Google Map
- **Reviews**: hidden until you add real guest reviews
- **FAQ**
- **Direct booking**: a live availability calendar synced with Airbnb, price breakdown and request-to-book (see below)
- A sticky "Book" button on mobile, SEO meta tags and Google structured data (LodgingBusiness)

## Install on Hostinger WordPress

1. Download `gasworks-house.zip` from this folder. If you change the theme, rebuild it with `./build.sh`.
2. In WordPress admin go to **Appearance → Themes → Add New Theme → Upload Theme**, choose the zip, then click **Install Now** and **Activate**.
3. Go to **Appearance → Customize → Gasworks House** and fill in each section:
   - **Booking & contact**: your Airbnb listing URL (the main button then says "Book on Airbnb"), email, phone and WhatsApp
   - **The house**: guest numbers, bedrooms, bathrooms, description and features
   - **Photo gallery**: optional. Pick up to 8 photos to replace the built-in ones. The first one is shown largest.
   - **Hero & SEO**: a large landscape hero photo (about 2000px wide) and your Google description
   - **Things to do & location**: add your address or Eircode for the map
   - **Reviews & FAQ**
4. Optional: add a logo under **Customize → Site Identity**, and set the site title to "Gasworks House Carrick".
5. If Hostinger's **LiteSpeed Cache** is on, purge the cache after each change (**LiteSpeed Cache → Toolbox → Purge All**).
6. Set up bookings (next section), then send yourself a test request. If the email doesn't arrive, the request is still saved under **Bookings**. For reliable email, set up Hostinger email and an SMTP plugin such as WP Mail SMTP.
7. Under **Settings → General**, set the timezone to **Dublin** so "today" is correct on the calendar.

## Direct booking & Airbnb sync

Everything is under **Bookings → Settings & Airbnb sync** in WordPress.

**Connect Airbnb (two-way calendar sync):**

1. **Airbnb → website:** in Airbnb, open your listing's **Calendar → Availability → Sync calendars → Export calendar**. Copy the link (it looks like `https://www.airbnb.ie/calendar/ical/50016674.ics?s=…`) and paste it into the settings page. Airbnb bookings then block those dates on your website. The site checks every hour, and again just before accepting a request.
2. **Website → Airbnb:** copy the **export link** shown on the settings page. In Airbnb go to **Sync calendars → Import calendar**, paste it and name it "Website". Airbnb then blocks dates booked on your site. Only the dates are shared, never guest details.

Airbnb only re-reads imported calendars every few hours, so there's a small window where someone could book the same dates on Airbnb. Requests are held rather than auto-confirmed, so you'll always spot a clash before confirming, and the Confirm button refuses if the dates now clash.

**How a booking works:**

1. The guest picks dates on the calendar (booked nights are greyed out, and the minimum stay is enforced) and sees the price.
2. They send a request. The dates are **held** (default 3 days) and blocked on your site and on Airbnb, and both of you get an email.
3. In **Bookings**, click **Confirm & email guest**. The guest gets your payment instructions (bank details or a Stripe/Revolut payment link). Or click **Decline**, and they get a polite email.
4. Requests you don't act on expire after the hold period, and the dates free up again.

You can also add phone or email bookings, or block dates for maintenance, with **Bookings → Add booking or block dates**. There's no card payment built in; guests pay using your payment instructions.

**Prices:** set a nightly price for the whole house, an optional Friday/Saturday price, a cleaning fee and a refundable damage deposit. Leave the price blank to take requests without showing prices.

## ⚠️ Check the default wording before going live

The site comes filled with starter copy. **Update anything that isn't accurate for your property:**

- 5 bedrooms and 3 bathrooms (sleeps up to 30 is confirmed; the minimum stay is set in the booking settings)
- The feature list. I wrote it from your photos, so add anything else you offer, like Wi-Fi, parking or a speaker
- The FAQ answers and house rules (confetti policy, noise and so on)

Lists in the Customizer use one item per line. Things to do, getting here, reviews and FAQs use the format `Title | Description`.

## Files

```
gasworks-house/
  style.css            theme header
  functions.php        setup, assets, SEO meta and structured data
  front-page.php       the one-page homepage
  header.php, footer.php, index.php, 404.php
  inc/defaults.php     starter copy (you can override all of it in the Customizer)
  inc/customizer.php   Customizer panel
  inc/booking/core.php   availability, pricing, calendar sync (import/export)
  inc/booking/api.php    public API used by the calendar
  inc/booking/admin.php  Bookings screen, confirm/decline, settings page
  assets/css/main.css
  assets/js/main.js    mobile menu, tabs, lightbox
  assets/js/booking.js availability calendar and booking form
```
