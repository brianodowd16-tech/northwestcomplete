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

    // Shown to buyers after they order and in their confirmation email.
    // Add bank, Revolut or SumUp payment-link details here if you want people to pay straight away.
    'payment_instructions' => "The club will contact you shortly to take payment.\nYour lines go into the draw once payment is received.",
];
