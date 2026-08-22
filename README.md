# Groceries-App

Hebrew RTL family grocery list app, using the notebook variation from the prototype. The UI source is `src/app.jsx`, compiled to `app.js` (React loads pinned from unpkg with SRI); shared state is stored as one JSON blob in Vercel KV through `api/state.js`. A service worker (`sw.js`) caches the shell and fonts for offline use.

## Editing the UI

After changing `src/app.jsx`, rebuild the bundle:

```
npm run build:ui
```

Commit both `src/app.jsx` and `app.js`; deploys need no build step.

## Deploy to Vercel

1. Run `npm install`.
2. Link the project with `vercel link`, or import the repository on vercel.com.
3. In the Vercel dashboard, open Storage, create a KV database, and connect it to this project. Vercel injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
4. Optional but recommended: set a `LIST_PASSWORD` environment variable in the Vercel project. Share this password with the family separately from the URL.
5. Run `vercel --prod`.
6. Open the deployed URL on each family member's phone. A fresh KV store starts with an empty shared list.

## Add to Home Screen

The app includes a PWA manifest and icon. On iOS Safari, use Share, then "Add to Home Screen". On Android Chrome, open the browser menu and choose "Install app" or "Add to Home screen".

## Local preview

Opening `index.html` directly shows the notebook UI with an empty local fallback state. API sync requires Vercel dev or a deployed Vercel project with KV environment variables available.
