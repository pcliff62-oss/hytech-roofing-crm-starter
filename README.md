# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:


## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.


# Backend (local dev)

This repo includes a minimal Express + TypeScript backend (server/) that proxies storage operations to Google Cloud Storage. It is intended for local development only and reads credentials from environment variables.

Required environment variables (set in your shell or a .env file inside /server):

- GCS_PROJECT_ID
- GCS_BUCKET
- GCS_CLIENT_EMAIL
- GCS_PRIVATE_KEY (paste the JSON private_key value; if it contains literal "\\n" sequences they will be normalized)

Run locally:

1. Start the backend in one terminal:

```bash
cd server
npm install
npm run dev
```

2. Start the front-end in another terminal (root):

```bash
npm run dev
```

Vite is configured to proxy /api/* to http://127.0.0.1:4000 during development.
