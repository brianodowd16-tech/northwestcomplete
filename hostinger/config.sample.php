<?php
// Settings for the Hostinger version of the draw site. Edit before uploading
// (or later in Hostinger's File Manager). This file is never shown to visitors.
return [
    // New orders are emailed here.
    'club_email' => 'secretary.stmichaels.roscommon@gaa.ie',

    // The "from" address on emails. Use an address on your own domain, created in
    // hPanel → Emails, e.g. draw@yourdomain.ie. Left as is, it uses noreply@ your domain.
    'from_email' => 'draw@YOURDOMAIN.ie',

    // Password for /admin.php, where you mark orders paid and print the online cards.
    'admin_password' => '__ADMIN_PASSWORD__',

    // ---- Card payments with SumUp ----
    // Fill in these two and the site takes card payments. Leave them empty and buyers pay the club instead.
    // API key: log in at me.sumup.com → Settings → For developers → API keys → Create. It starts sk_live_
    // and is only shown once, so paste it straight in here. (Not the "public key" on that page.)
    // Merchant code: starts MC, shown under your business name at the top right of me.sumup.com
    // (also under Settings → Business settings).
    'sumup_api_key' => '',
    'sumup_merchant_code' => '',

    // Shown to buyers if they order while card payments are off (or SumUp can't be reached),
    // and in their confirmation email.
    // Add bank, Revolut or SumUp payment-link details here if you want people to pay straight away.
    'payment_instructions' => "The club will contact you shortly to take payment.\nYour lines go into the draw once payment is received.",
];
