<?php
/**
 * Settings for the audit checkout and automations.
 *
 * Copy this file to nwc-config.php in the folder ABOVE public_html on
 * Hostinger (e.g. /home/u123456789/domains/northwestcomplete.com/nwc-config.php
 * when the site is in .../northwestcomplete.com/public_html). Never put the
 * real file in public_html or commit it to GitHub.
 */
return [
    // --- Revolut Merchant API (Revolut Business > Merchant > API) ---
    'revolut_secret_key'     => '',       // sk_... secret key
    'revolut_webhook_secret' => '',       // leave empty: api/revolut-setup.php saves it for you
    'sandbox'                => true,     // true while testing with sandbox keys, then false

    // --- The product ---
    'site_url'     => 'https://northwestcomplete.com',
    'audit_amount' => 50000,              // in cents: 50000 = €500.00
    'currency'     => 'EUR',
    'audit_name'   => 'Comprehensive systems audit',

    // --- Emails ---
    'notify_email' => 'hello@northwestcomplete.com',  // gets a notification for every paid audit
    'from_email'   => 'hello@northwestcomplete.com',  // must be a real mailbox on the domain
    'from_name'    => 'Northwest Complete',
    'booking_url'  => '',                 // optional: Calendly / Microsoft Bookings link sent to the client

    // --- Admin ---
    'admin_key' => '',                    // long random string; needed to open /api/xero-connect.php

    // --- Xero (developer.xero.com > My Apps > New app, "Web app") ---
    // Redirect URI: https://northwestcomplete.com/api/xero-connect.php
    'xero_client_id'            => '',
    'xero_client_secret'        => '',
    // If Xero rejects these scopes for a new app, use the scopes Xero lists for it
    // that cover invoices, payments and contacts.
    'xero_scopes'               => 'offline_access accounting.transactions accounting.contacts',
    'xero_sales_account_code'   => '200', // revenue account for audit income
    'xero_payment_account_code' => '',    // code of your Revolut Business bank account in Xero
    'xero_line_amount_types'    => 'NoTax', // not VAT registered. Once registered: Inclusive or Exclusive
    'xero_tax_type'             => '',    // only needed once VAT registered
    'xero_email_invoice'        => true,  // Xero emails the paid invoice to the client

    // --- HubSpot (Settings > Integrations > Private apps) ---
    // Scopes: crm.objects.contacts.read/write, crm.objects.deals.write
    'hubspot_token'     => '',
    'hubspot_pipeline'  => 'default',
    'hubspot_dealstage' => 'closedwon',

    // --- Optional: send each paid order to another tool (n8n, Make, Zapier) ---
    'automation_webhook_url'    => '',
    'automation_webhook_secret' => '',
];
