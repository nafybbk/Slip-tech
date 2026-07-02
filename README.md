# Karigar Tech Relay — Cloud Collector

Chhota, free-hosting-friendly server jo Karigar Slip Register installations se
silent pings receive karta hai. Aapka local Tech Panel isse data sync karega.

## Render.com par deploy (free tier)

1. Ye folder GitHub pe alag repo mein push karo (jaise `karigar-tech-relay`)
2. https://render.com par jao → New → Web Service
3. Apni GitHub repo connect karo
4. Settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment Variable add karo: `TECH_PANEL_KEY` = koi bhi strong secret (jaise `nafees-tech-2026-xyz`)
5. Deploy hone ke baad URL milega, jaise: `https://karigar-tech-relay.onrender.com`

## Karigar Slip Register mein URL set karo

Har installation ke `server/db.js` mein already ye default set hai:
```
tech_relay_url = https://karigar-tech-relay.onrender.com
```
Agar aapka actual Render URL alag hai, to Settings API se update kar sakte ho,
ya `db.js` mein directly badal do build se pehle.

## Data jo store hota hai

- installation_id (random UUID, per-install)
- app version, platform (win32/darwin/linux)
- business names + created dates (sirf naam, koi financial data nahi)
- first_seen, last_seen, ping_count

## Endpoints

- `POST /api/ping` — installations yahan silently ping karte hain (no auth)
- `GET /api/installations?key=YOUR_KEY` — sab installations
- `GET /api/businesses?key=YOUR_KEY` — sab business names
- `GET /api/summary?key=YOUR_KEY` — quick counts

## Free tier note

Render free tier "spin down" hota hai inactivity par — pehli request thodi slow
ho sakti hai (15-30s cold start). Installations ka background retry logic ise
handle kar leta hai automatically.
