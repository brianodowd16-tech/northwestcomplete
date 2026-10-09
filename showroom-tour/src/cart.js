// In-tour cart. Lines are kept per tour in localStorage so the cart survives a
// reload; storage failures (private mode, blocked site data) are ignored.

export function createCart(tourId, products) {
  const key = `showroom-cart:${tourId}`;
  const listeners = new Set();
  let lines = new Map();
  // The shop's per-order limit (e.g. one showroom model left), when it sets one.
  const cap = (sku, qty) => Math.min(qty, products.get(sku)?.maxQty ?? Infinity);

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
    // Returns how many were actually added after the shop's limit.
    add(sku, qty = 1) {
      const before = lines.get(sku) ?? 0;
      const after = cap(sku, before + qty);
      if (after > before) {
        lines.set(sku, after);
        commit();
      }
      return after - before;
    },
    setQty(sku, qty) {
      if (qty > 0) lines.set(sku, cap(sku, qty));
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
