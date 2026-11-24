import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The native app loads the live web app, so menus, prices and fixes reach phones without a store update.
 *
 * One build per brand:
 *   The Snug Club app (find venues, staff screens):  APP_ID=ie.thesnugclub.app APP_NAME="The Snug Club"
 *   A venue's own white-label app:                     APP_ID=ie.thesnugclub.mjoconnors APP_NAME="MJ O'Connor's" START_PATH=/v/mj-oconnors
 */
const appUrl = (process.env.APP_URL ?? "https://app.thesnugclub.ie").replace(/\/$/, "");
const startPath = process.env.START_PATH ?? "/";
if (!/^https:\/\//.test(appUrl) && process.env.NODE_ENV === "production") throw new Error("APP_URL must be https for store builds");

const config: CapacitorConfig = {
  appId: process.env.APP_ID ?? "ie.thesnugclub.app",
  appName: process.env.APP_NAME ?? "The Snug Club",
  webDir: "www", // offline fallback only
  server: {
    url: `${appUrl}${startPath}`,
    cleartext: appUrl.startsWith("http://"), // local testing only
    // Hosted checkouts must open inside the app so guests come back to their order afterwards.
    allowNavigation: ["*.mypos.com", "mypos.com", "*.revolut.com", "search.google.com"],
  },
  ios: { contentInset: "automatic", limitsNavigationsToAppBoundDomains: false },
  android: { allowMixedContent: false },
};

export default config;
