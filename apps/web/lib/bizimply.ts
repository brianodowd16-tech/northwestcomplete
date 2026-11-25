import "server-only";
import { bizimplyFileName, bizimplySalesCsv, localDate } from "@round/core";
import { bizimplySettings, daySales, recordSync, syncDone } from "@round/db/integrations";
import type { Venue } from "@round/db/services";
import SftpClient from "ssh2-sftp-client";
import { secretsKey } from "./server";

/** The day's sales file for Bizimply (also offered as a download). */
export async function bizimplyFile(venue: Venue, date: string) {
  const s = await bizimplySettings(venue, secretsKey());
  const cfg = s?.config;
  return { name: bizimplyFileName(venue.slug, date), csv: bizimplySalesCsv(cfg?.location || venue.name, date, await daySales(venue, date), cfg?.headings) };
}

/** Uploads one trading day's sales to the SFTP folder Bizimply collects from. Once per day. */
export async function uploadBizimply(venue: Venue, date: string, opts: { force?: boolean } = {}): Promise<{ result: "sent" | "already" | "not_set_up" | "error"; error?: string }> {
  const s = await bizimplySettings(venue, secretsKey());
  if (!s) return { result: "not_set_up" };
  if (!opts.force && (await syncDone(venue, "bizimply", date))) return { result: "already" };
  const sftp = new SftpClient();
  try {
    const f = await bizimplyFile(venue, date);
    await sftp.connect({ host: s.config.host, port: s.config.port, username: s.config.username, password: s.password, readyTimeout: 15_000 });
    await sftp.put(Buffer.from(f.csv, "utf8"), `${s.config.dir}/${f.name}`);
    await recordSync(venue, "bizimply", date, "done", f.name, null);
    return { result: "sent" };
  } catch (e) {
    await recordSync(venue, "bizimply", date, "error", null, String(e).slice(0, 500));
    return { result: "error", error: String(e instanceof Error ? e.message : e) };
  } finally {
    await sftp.end().catch(() => {});
  }
}

export const yesterday = (venue: Venue) => localDate(new Date(Date.now() - 86_400_000), venue.timezone);
