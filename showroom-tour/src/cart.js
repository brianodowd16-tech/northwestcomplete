// In-tour cart. Lines are kept per tour in localStorage so the cart survives a
// reload; storage failures (private mode, blocked site data) are ignored.

export function createCart(tourId, products) {
  const key = `showroom-cart:${tourId}`;
  const listeners = new Set();
  let lines = new Map();

  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? '[]');
    lines = new Map(saved.filter(([sku, qty]) => products.has(sku) && qty > 0));
  } catch {
    // start empty
  }

  function commit() {
    try {
      localStorage.setItem(key, JSON.stringify([...lines]));
    } catch {
      // not persisted, still works for this visit
    }
    listeners.forEach((fn) => fn(cart));
  }

  const cart = {
    add(sku, qty = 1) {
      lines.set(sku, (lines.get(sku) ?? 0) + qty);
      commit();
    },
    setQty(sku, qty) {
      if (qty > 0) lines.set(sku, qty);
      else lines.delete(sku);
      commit();
    },
    clear() {
      lines.clear();
      commit();
    },
    lines() {
      return [...lines].map(([sku, qty]) => ({ sku, qty, product: products.get(sku) }));
    },
    count() {
      let n = 0;
      lines.forEach((q) => (n += q));
      return n;
    },
    total() {
      return cart.lines().reduce((sum, l) => sum + l.product.price * l.qty, 0);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return cart;
}
