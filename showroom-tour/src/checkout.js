// Hands the tour cart over to the shop's own checkout.
//
// products.json -> checkout.mode:
//   demo         order summary only (pilot default, no shop connected)
//   enquiry      opens an email to checkout.email listing the items
//   shopify      cart permalink: {store}/cart/{variant}:{qty},...   needs product.shopifyVariantId
//   woocommerce  {store}/?showroom_cart={id}:{qty},... then the cart page
//                needs product.wooProductId and wordpress/showroom-tour-cart.php on the shop
//   link         opens each product's own page (product.url)
//
// For shopify and woocommerce the tour cart is emptied once it is handed over:
// the shop's cart holds the items from then on.

export function checkout(cart, catalog, { showMessage }) {
  const cfg = catalog.checkout ?? { mode: 'demo' };
  const store = (cfg.storeUrl ?? '').replace(/\/$/, '');
  const lines = cart.lines();
  if (!lines.length) return;

  switch (cfg.mode) {
    case 'shopify': {
      const missing = lines.filter((l) => !l.product.shopifyVariantId);
      if (missing.length) return showMessage(`No Shopify variant set for: ${missing.map((l) => l.product.name).join(', ')}`);
      const items = lines.map((l) => `${l.product.shopifyVariantId}:${l.qty}`).join(',');
      cart.clear();
      go(`${store}/cart/${items}`);
      return;
    }

    case 'woocommerce': {
      const missing = lines.filter((l) => !l.product.wooProductId);
      if (missing.length) return showMessage(`No WooCommerce product id set for: ${missing.map((l) => l.product.name).join(', ')}`);
      const items = lines.map((l) => `${l.product.wooProductId}:${l.qty}`).join(',');
      cart.clear();
      go(`${store}/?showroom_cart=${encodeURIComponent(items)}`);
      return;
    }

    case 'link': {
      const withUrl = lines.filter((l) => l.product.url);
      if (!withUrl.length) return showMessage('No product links are configured yet.');
      withUrl.slice(1).forEach((l) => window.open(l.product.url, '_blank', 'noopener'));
      go(withUrl[0].product.url);
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

// Leaves the tour for the shop. When the tour is embedded in an iframe on the
// website, the shop page replaces the whole page rather than loading inside the frame.
function go(url) {
  try {
    window.top.location.href = url;
  } catch {
    window.location.href = url;
  }
}
