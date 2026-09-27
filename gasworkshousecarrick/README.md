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
- **Enquiry form**: each enquiry is emailed to you and also saved under **Dashboard → Enquiries**, so none are lost if an email doesn't arrive
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
6. Send yourself a test enquiry from the form. If the email doesn't arrive, it's still saved under **Enquiries**. For reliable email, set up Hostinger email and an SMTP plugin such as WP Mail SMTP.

## ⚠️ Check the default wording before going live

The site comes filled with starter copy. **Update anything that isn't accurate for your property:**

- Sleeps 12, 5 bedrooms, 3 bathrooms, 2-night minimum
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
  inc/enquiry.php      enquiry form handler and Enquiries admin screen
  assets/css/main.css
  assets/js/main.js    mobile menu, tabs, lightbox, date checks and form token refresh
```
