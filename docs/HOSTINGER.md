# Putting the draw site on Hostinger

This version takes **orders now, paid to the club**. Buyers order online, the order is emailed to the club and to the buyer, and the club marks it paid on the admin page. Card payment (Stripe or SumUp) can be switched on later.

It works on any Hostinger plan with PHP 8.1 or newer, the default.

## Upload (10 minutes)

1. In **hPanel**, open your website, then **Files → File Manager**, then the `public_html` folder.
2. Delete Hostinger's placeholder files from `public_html` (e.g. `default.php`), unless something else lives there.
3. Click **Upload**, choose `stmichaels-draw-hostinger.zip`, then right-click it → **Extract** into `public_html`. Delete the zip afterwards.
   The files must sit directly in `public_html`, not in a subfolder.
4. Turn on HTTPS: **Security → SSL** (free), then switch on **Force HTTPS**.

## Settings (`config.php`)

Open `config.php` in File Manager and check these settings:

- `club_email`: where new orders are sent. It's already set to the secretary's address.
- `from_email`: create a mailbox such as `draw@yourdomain.ie` under **Emails**, and put it here. Emails sent from your own domain are much less likely to land in spam.
- `admin_password`: the password for the admin page. Change it if you like.
- `payment_instructions`: shown to buyers after they order and in their email. Add Revolut, bank or SumUp payment-link details here to let people pay straight away.

## Check it works

1. Place a €5 order on your site with your own email.
2. Check that both emails arrive: the order email at the club address and the confirmation at yours. If they don't, look in spam, and check `from_email` is a real mailbox on your domain.
3. Open `https://yourdomain/admin.php`, log in, and press **Mark paid**. The order shows "Card 1, line 1".
4. Delete the test order before launch: open `data/orders.php` in File Manager and remove its line. Keep the first line, which keeps the file private.

## Day to day

- **New orders** arrive by email. Each one has the buyer's phone and email; reply or ring to take payment.
- **When someone pays**, open `admin.php` and press **Mark paid**. This puts their lines on the online cards, in the order payments are recorded.
- **Back up** with **Download spreadsheet** on the admin page every few days.

## On the night

After online entries close (7pm on 30 December), go to `admin.php` → **Print online cards** → **Print cards**. Each card prints on its own A4 page, in the same layout as the paper cards: lines 1–20, name and contact details, seller. Only paid orders appear. Put the cards in with the paper cards.

## Changing prices, prizes or dates

Edit `draw.json` in File Manager. The website and the order form both read it, so prices can't be changed by a buyer.
