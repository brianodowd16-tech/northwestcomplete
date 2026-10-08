// Hands the tour cart over to the shop's own checkout.
//
// products.json -> checkout.mode:
//   demo         order summary only (pilot default, no shop connected)
//   enquiry      opens an email to checkout.email listing the items
//   shopify      cart permalink: {store}/cart/{variant}:{qty},...   needs product.shopifyVariantId
//   woocommerce  Store API add-item then /checkout/                  needs product.wooProductId
//                (cookies only flow when the tour is served from the shop's domain;
//                 otherwise it falls back to ?add-to-cart= for the first line)
//   link         opens each product's own page (product.url)

export async function checkout(cart, catalog, { showMessage }) {
  const cfg = catalog.checkout ?? { mode: 'demo' };
  const store = (cfg.storeUrl ?? '').replace(/\/$/, '');
  const lines = cart.lines();
  if (!lines.length) return;

  switch (cfg.mode) {
    case 'shopify': {
      const missing = lines.filter((l) => !l.product.shopifyVariantId);
      if (missing.length) return showMessage(`No Shopify variant set for: ${missing.map((l) => l.product.name).join(', ')}`);
      const items = lines.map((l) => `${l.product.shopifyVariantId}:${l.qty}`).join(',');
      window.location.href = `${store}/cart/${items}`;
      return;
    }

    case 'woocommerce': {
      const missing = lines.filter((l) => !l.product.wooProductId);
      if (missing.length) return showMessage(`No WooCommerce product id set for: ${missing.map((l) => l.product.name).join(', ')}`);
      try {
        const res = await fetch(`${store}/wp-json/wc/store/v1/cart`, { credentials: 'include' });
        const nonce = res.headers.get('Nonce') ?? res.headers.get('X-WC-Store-API-Nonce');
        if (!res.ok || !nonce) throw new Error('Store API unavailable');
        for (const l of lines) {
          const add = await fetch(`${store}/wp-json/wc/store/v1/cart/add-item`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', Nonce: nonce },
            body: JSON.stringify({ id: l.product.wooProductId, quantity: l.qty }),
          });
          if (!add.ok) throw new Error(`add-item failed for ${l.sku}`);
        }
        window.location.href = `${store}/checkout/`;
      } catch {
        const first = lines[0];
        if (lines.length > 1) showMessage('Only the first item could be passed to the shop from this domain. Host the tour on the shop domain to pass the whole cart.');
        window.location.href = `${store}/?add-to-cart=${first.product.wooProductId}&quantity=${first.qty}`;
      }
      return;
    }

    case 'link': {
      const withUrl = lines.filter((l) => l.product.url);
      if (!withUrl.length) return showMessage('No product links are configured yet.');
      withUrl.slice(1).forEach((l) => window.open(l.product.url, '_blank', 'noopener'));
      window.location.href = withUrl[0].product.url;
      return;
    }

    case 'enquiry': {
      if (!cfg.email) return showMessage('Set checkout.email in products.json to enable enquiries.');
      const body = lines.map((l) => `${l.qty} x ${l.product.name} (${l.sku})`).join('\n');
      window.location.href = `mailto:${cfg.email}?subject=${encodeURIComponent('Showroom tour enquiry')}&body=${encodeURIComponent(`${body}\n\nName:\nPhone:\n`)}`;
      return;
    }

    default:
      showMessage('Demo mode: this is where the cart is handed to the shop checkout. Set checkout.mode in products.json to connect your shop.');
  }
}
