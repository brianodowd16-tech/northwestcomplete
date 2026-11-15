'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Minimal durable order store backed by a single JSON file.
 * All mutations are serialised through a promise queue and written atomically
 * (write temp file, then rename), which is plenty for a club draw's volume.
 *
 * Online lines are laid out like the paper draw cards: numbered cards of
 * `linesPerCard` lines each, so they can be printed and entered alongside them.
 */
class OrderStore {
  constructor(file, { linesPerCard = 20 } = {}) {
    this.file = path.resolve(file);
    this.linesPerCard = linesPerCard;
    this.queue = Promise.resolve();
    this.data = this.#load();
  }

  #load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return { nextSlot: parsed.nextSlot ?? 0, orders: parsed.orders ?? {} };
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      return { nextSlot: 0, orders: {} };
    }
  }

  #persist() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  #exclusive(fn) {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => {});
    return run;
  }

  get(id) {
    return this.data.orders[id] ?? null;
  }

  linesSold() {
    return Object.values(this.data.orders).reduce((sum, o) => sum + o.lines.length, 0);
  }

  all() {
    return Object.values(this.data.orders).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** Remember that the Stripe payment now carries this order's card and line references. */
  markLabelled(id) {
    return this.#exclusive(() => {
      const order = this.data.orders[id];
      if (!order || order.stripeLabelled) return;
      order.stripeLabelled = true;
      this.#persist();
    });
  }

  /**
   * Record a paid order and place its lines on the online cards. Idempotent per id, so the
   * webhook and the success-page fallback can both call it safely. An order that fits on one
   * card is kept together: if the current card hasn't room, it starts on the next card.
   */
  fulfil({ id, lineCount, amount, currency, customer = {}, bundleId, soldBy = null }) {
    return this.#exclusive(() => {
      const existing = this.data.orders[id];
      if (existing) return existing;
      if (!Number.isInteger(lineCount) || lineCount < 1) throw new Error('lineCount must be a positive integer');

      const per = this.linesPerCard;
      let slot = this.data.nextSlot;
      const used = slot % per;
      if (used !== 0 && lineCount > per - used) slot += per - used;
      const lines = Array.from({ length: lineCount }, (_, i) => ({ card: Math.floor((slot + i) / per) + 1, line: ((slot + i) % per) + 1 }));

      const order = {
        id,
        bundleId,
        lines,
        amount,
        currency,
        customer: { name: customer.name ?? null, email: customer.email ?? null, phone: customer.phone ?? null },
        soldBy,
        createdAt: new Date().toISOString(),
      };
      this.data.nextSlot = slot + lineCount;
      this.data.orders[id] = order;
      this.#persist();
      return order;
    });
  }

  /** Every card with its lines filled in, in card order, for printing. */
  cards() {
    const cards = [];
    for (const order of this.all()) {
      for (const { card, line } of order.lines) {
        cards[card - 1] ??= { card, lines: [] };
        cards[card - 1].lines[line - 1] = order;
      }
    }
    return cards.filter(Boolean);
  }
}

/** "Card 3, lines 1-7" style reference for an order's lines. */
function describeLines(lines) {
  const byCard = new Map();
  for (const { card, line } of lines) byCard.set(card, [...(byCard.get(card) ?? []), line]);
  return [...byCard].map(([card, ls]) => {
    const first = ls[0];
    const last = ls[ls.length - 1];
    return `Card ${card}, line${ls.length > 1 ? `s ${first}-${last}` : ` ${first}`}`;
  }).join('; ');
}

module.exports = { OrderStore, describeLines };
