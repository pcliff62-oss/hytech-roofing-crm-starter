HyTech Auth Server (dev)

This is a minimal Express + SQLite auth server implementing:
- POST /api/auth/login  -> returns access token, sets HttpOnly refresh cookie
- POST /api/auth/refresh -> rotates refresh token, returns new access token
- POST /api/auth/logout -> revokes refresh token and clears cookie
- GET  /api/me -> protected example endpoint (requires Bearer access token)

Run locally:

1. cd server
2. npm install
3. node index.js

Dev user: username `admin`, password set by `DEV_ADMIN_PASS` env or default `password`.

Notes:
- This is for development/demo only. In production, use a robust migration, strong secrets, HTTPS, and hardened token storage.
