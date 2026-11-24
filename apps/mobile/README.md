# The Snug Club for iOS and Android

A native shell (Capacitor 8) around the web app. The app opens `APP_URL` (+ `START_PATH`), so menu changes and fixes need no store update.

## Build

Needs a Mac with Xcode for iOS, and Android Studio for Android.

```bash
pnpm install
cd apps/mobile
APP_URL=https://app.thesnugclub.ie pnpm add:ios && pnpm add:android   # first time only
APP_URL=https://app.thesnugclub.ie pnpm sync
pnpm ios       # opens Xcode: set the team, signing and version, then Archive
pnpm android   # opens Android Studio: Build > Generate Signed Bundle
```

## One app, or one per venue

- **The Snug Club** (default): guests find venues, staff use the bar/kitchen screens and back office.
- **A venue's own app**: `APP_ID=ie.thesnugclub.<venue> APP_NAME="<Venue>" START_PATH=/v/<slug>`, plus the venue's icon. Each is a separate store listing under your developer account (or the venue's).

Every venue also gets an installable web app (PWA) with its own name, colour and icon at `/v/<slug>`, with no store needed.

## Before submitting

- **Apple guideline 4.2 (minimum functionality):** Apple can reject apps that are just a website. Add native value before submitting: push notifications for "your drinks are ready" (`@capacitor/push-notifications` with APNs/FCM) are the planned first step.
- **Apple Pay inside the iOS app:** WebKit turns Apple Pay off in web views that inject scripts, which Capacitor does. Card payments on the myPOS page still work; test Apple Pay in the iOS build before launch. Google Pay works in the Android web view only if myPOS's page supports it there.
- **Accounts:** Apple Developer Program (company account needs a D-U-N-S number) and Google Play Console (new personal accounts need a 14-day closed test with 12 testers).
- **Privacy:** App Store privacy labels and the Play data safety form: phone number, name, email, date of birth, purchase history. No tracking.
