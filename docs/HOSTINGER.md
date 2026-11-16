# Putting the draw site on Hostinger

Buyers pick their lines, fill in a short order form, and **pay by card with SumUp** in the same pop-up. Once SumUp confirms the payment, the order is marked paid, the lines go on the online cards, and the club and the buyer get emails.

If the SumUp settings are empty, or SumUp can't be reached, the site takes the order anyway and the buyer pays the club ("order now, pay the club"). The club then marks the order paid on the admin page.

It works on any Hostinger plan with PHP 8.1 or newer, the default.

## Upload (10 minutes)

1. In **hPanel**, open your website, then **Files → File Manager**, then the `public_html` folder.
2. Delete Hostinger's placeholder files from `public_html` (e.g. `default.php`), unless something else lives there.
3. Click **Upload**, choose `stmichaels-draw-hostinger.zip`, then right-click it → **Extract** into `public_html`. Delete the zip afterwards.
   The files must sit directly in `public_html`, not in a subfolder.
4. Turn on HTTPS: **Security → SSL** (free), then switch on **Force HTTPS**.

## Updating a site that's already live

1. In File Manager, open `config.php` and copy your `sumup_api_key`, `sumup_merchant_code` and `from_email` somewhere safe for a minute.
2. Select everything in `public_html` **except the `data` folder** and delete it. The `data` folder holds your orders, so keep it.
3. Upload the new zip, **Extract** it into `public_html`, and delete the zip.
4. Open the new `config.php` and paste your settings back in.
5. Open the site and press **Ctrl+F5** (or **Cmd+Shift+R** on a Mac) once, so your browser fetches the new version.

Deleting the old files first matters: if an extract leaves an old file in place, the old and new versions get mixed and ordering stops working. From this version on, every page also asks for its own version of the scripts, so browsers and Hostinger can't serve stale copies.

## Settings (`config.php`)

Open `config.php` in File Manager and check these settings:

- `club_email`: where new orders are sent. It's already set to the secretary's address.
- `from_email`: create a mailbox such as `draw@yourdomain.ie` under **Emails**, and put it here. Emails sent from your own domain are much less likely to land in spam.
- `admin_password`: the password for the admin page. Change it if you like.
- `sumup_api_key` and `sumup_merchant_code`: these switch on card payments.
  - **API key:** log in at me.sumup.com → **Settings → For developers → API keys → Create**. It starts `sk_live_` and is shown only once, so paste it straight in. Don't use the "public key" on that page.
  - **Merchant code:** starts `MC`. It's shown under your business name at the top right of me.sumup.com, and also under **Settings → Business settings**.
- `payment_instructions`: used only when card payments are off or SumUp can't be reached. It's shown to buyers after they order and in their email.

## Check it works

1. The home page should say "Secure card payment by SumUp". If it still says "Pay the club directly", the SumUp settings in `config.php` are empty or mistyped.
2. Place a real €5 order with your own card. The card form appears in the pop-up. After paying you see "You're in".
3. Check that both emails arrive: "PAID draw order…" at the club address and "You're in…" at yours. If they don't, look in spam, and check `from_email` is a real mailbox on your domain.
4. Open `https://yourdomain/admin.php` and log in. The order shows **Paid by card**, "Card 1, line 1", and the SumUp transaction code. The payment also appears in your SumUp dashboard.
5. Refund the €5 from the SumUp dashboard if you like. Then delete the test order: open `data/orders.php` in File Manager and remove its line, keeping the first line, which keeps the file private.

There's nothing to set up for SumUp notifications: each payment tells SumUp where to send them (`/sumup-webhook.php`). The site only counts an order as paid after reading it back from SumUp and checking the amount, currency and reference match.

## Day to day

- **Card payments need no action.** You get a "PAID draw order" email, and the lines are already on the online cards.
- **"Card payment not completed"** on the admin page means someone filled in the form but didn't finish paying. Their phone and email are there if you want to follow up. If they then pay you another way, press **Mark paid**.
- **Orders taken while card payments were off** arrive as "New draw order" emails. Ring or reply to take payment, then press **Mark paid**.
- **Back up** with **Download spreadsheet** on the admin page every few days.

## On the night

After online entries close (7pm on 30 December), go to `admin.php` → **Print online cards** → **Print cards**. Each card prints on its own A4 page, in the same layout as the paper cards: lines 1–20, name and contact details, seller. Only paid orders appear. Put the cards in with the paper cards.

## Changing prices, prizes or dates

Edit `draw.json` in File Manager. The website and the order form both read it, so prices can't be changed by a buyer.
