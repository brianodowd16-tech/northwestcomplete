'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Minimal durable order store backed by a single JSON file.
 * All mutations are serialised through a promise queue and written atomically
 * (write temp file, then rename), which is plenty for a club draw's volume.
 */
class OrderStore {
  constructor(file, { startNumber = 1001 } = {}) {
    this.file = path.resolve(file);
    this.startNumber = startNumber;
    this.queue = Promise.resolve();
    this.data = this.#load();
  }

  #load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return { nextNumber: parsed.nextNumber ?? this.startNumber, orders: parsed.orders ?? {} };
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      return { nextNumber: this.startNumber, orders: {} };
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

  ticketsSold() {
    return Object.values(this.data.orders).reduce((sum, o) => sum + o.tickets.length, 0);
  }

  all() {
    return Object.values(this.data.orders).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /**
   * Record a paid order and allocate ticket numbers. Idempotent per id, so the
   * webhook and the success-page fallback can both call it safely.
   */
  fulfil({ id, ticketCount, amount, currency, customer = {}, bundleId, soldBy = null }) {
    return this.#exclusive(() => {
      const existing = this.data.orders[id];
      if (existing) return existing;
      if (!Number.isInteger(ticketCount) || ticketCount < 1) throw new Error('ticketCount must be a positive integer');

      const first = this.data.nextNumber;
      const tickets = Array.from({ length: ticketCount }, (_, i) => first + i);
      const order = {
        id,
        bundleId,
        tickets,
        amount,
        currency,
        customer: { name: customer.name ?? null, email: customer.email ?? null, phone: customer.phone ?? null },
        soldBy,
        createdAt: new Date().toISOString(),
      };
      this.data.nextNumber = first + ticketCount;
      this.data.orders[id] = order;
      this.#persist();
      return order;
    });
  }
}

module.exports = { OrderStore };
