# Groceries-App

Hebrew RTL family grocery list — a single-page React-via-CDN app with a spiral-notebook aesthetic, deployed on Vercel with shared state across all family devices via Vercel KV.

## Features

- **Hebrew RTL** throughout
- **Shared list** across all family devices (polled every 30 s, instant on focus)
- **Drag to reorder** items (dotted handle on the left edge of each row)
- **Swipe left to delete** an item
- **Pin** frequent items so they survive a list reset
- **Quantity** stepper per item (2× milk, 12× eggs, …)
- **Per-member identity** — tap an avatar in the header to switch the active family member
- **History** of past lists, with one-tap restore
- **Smart suggestions** derived from history frequency + recency (no hardcoded list)
- **Confetti** when the whole list is checked off
- **Scrollable** list area for long shopping trips

## Local development

```sh
npm install
vercel dev          # spins up local Vercel runtime with /api/state
```

You can also open `index.html` directly in a browser — the app renders with seed data and shows a "לא מחובר" badge because `/api/state` isn't reachable. Useful for visual checks; full functionality needs `vercel dev` or a real deployment.

## Deploying to Vercel

1. **Push to GitHub** (or run `vercel link` against this directory).
2. **Create a KV database** in the Vercel dashboard → *Storage → Create → KV* → connect it to this project. Vercel auto-injects `KV_REST_API_URL` and `KV_REST_API_TOKEN` into the function environment.
3. `vercel --prod`
4. Open the deployed URL on every family member's phone. The first request seeds the KV with the default list; subsequent users see the shared state.

No build step — `index.html` is served statically; `api/state.js` runs on Vercel's serverless runtime.

## Notes

- The app polls every 30 s while the tab is visible and refetches immediately on window focus, so KV usage stays comfortably within the Hobby-tier quota for a 5-person family.
- Concurrent edits use optimistic local updates with a `version` field on the server. If two devices write at the same time, the slower one gets a 409 and adopts the server state (its in-flight change is dropped — last-write-wins is OK for grocery lists).
- The active family-member identity (`me`) is stored in `localStorage` per device — it's not shared.
