# HyTech Proposal App (Vite + Tailwind)

## Prereqs
- Node.js 18+ (recommend 20 LTS)
- npm (comes with Node)

## Run locally
```bash
npm install
npm run dev
```
Open the URL Vite prints (usually http://localhost:5173).

## Build production
```bash
npm run build
npm run preview
```

## Deploy (one option: Vercel)
1. Create a new Git repo and push this folder.
2. Import the repo at https://vercel.com/new.
3. Framework: **Vite** (auto-detected). Build command: `vite build`. Output dir: `dist`.
4. Deploy.

## PWA / Homescreen icon

This project includes a minimal `public/manifest.json` and links in `index.html` so browsers can use the existing `public/LOGO-2017-edit-GOOD.png` as the app icon when saving to a phone homescreen.

For best results replace `public/LOGO-2017-edit-GOOD.png` with properly-sized images:
- 192x192 PNG for Android/Chrome
- 512x512 PNG for Android/Chrome (high-res)
- 180x180 PNG named `apple-touch-icon.png` for iOS

After replacing images, update `public/manifest.json` and the `<link rel="apple-touch-icon">` href in `index.html` if you used different filenames.
