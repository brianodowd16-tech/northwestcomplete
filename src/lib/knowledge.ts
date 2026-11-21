import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * The consultation knowledge base. By default it's content/knowledge-base.md
 * in this repo. Set KNOWLEDGE_BASE_URL to a plain-text/Markdown URL (for
 * example a published document) to manage it outside the codebase; it's
 * re-fetched at most once an hour.
 */
let cache: { text: string; at: number } | null = null;
const TTL = 60 * 60 * 1000;

export async function getKnowledgeBase(): Promise<string> {
  if (cache && Date.now() - cache.at < TTL) return cache.text;
  let text = "";
  const url = process.env.KNOWLEDGE_BASE_URL;
  if (url) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) text = (await res.text()).slice(0, 400_000);
    } catch (err) {
      console.error("[knowledge] could not fetch KNOWLEDGE_BASE_URL", err);
    }
  }
  if (!text) text = await fs.readFile(path.join(process.cwd(), "content", "knowledge-base.md"), "utf8");
  cache = { text, at: Date.now() };
  return text;
}
