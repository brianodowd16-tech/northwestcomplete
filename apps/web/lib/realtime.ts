import "server-only";
import { EVENTS_CHANNEL } from "@round/db";
import { EventEmitter } from "node:events";
import pg from "pg";

// One LISTEN connection per server process, fanned out by topic. Postgres
// NOTIFY means any process (or a future separate app) can publish.

type Bus = { emitter: EventEmitter; ready: Promise<void> };
const g = globalThis as { __roundBus?: Bus };

function bus(): Bus {
  if (g.__roundBus) return g.__roundBus;
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  const ready = (async () => {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    client.on("notification", (msg) => {
      if (!msg.payload) return;
      try {
        const data = JSON.parse(msg.payload) as { topic: string };
        emitter.emit(data.topic, data);
      } catch {
        // ignore malformed payloads
      }
    });
    client.on("error", (err) => {
      console.error("realtime listener error", err);
      g.__roundBus = undefined;
    });
    await client.query(`LISTEN ${EVENTS_CHANNEL}`);
  })();
  g.__roundBus = { emitter, ready };
  return g.__roundBus;
}

export async function subscribe(topic: string, fn: (data: unknown) => void): Promise<() => void> {
  const b = bus();
  await b.ready;
  b.emitter.on(topic, fn);
  return () => b.emitter.off(topic, fn);
}
