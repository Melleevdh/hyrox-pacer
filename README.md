# Hyrox Pacer

Splits voor je Hyrox op je Garmin, met vrienden te delen.

- `web/` – website + API (Vercel). Accounts, schema's met 16 doeltijden, horloge koppelen.
- `garmin/` – Connect IQ-app voor Venu 2, 2S, 2 Plus, 3, 3S en Venu 4. Haalt het actieve schema op en laat tijdens de race zien of je voor of achter ligt. Zie [garmin/LEESMIJ.md](garmin/LEESMIJ.md).

## Hoe het werkt
1. Op het horloge verschijnt de eerste keer een koppelcode van 6 cijfers.
2. Op de website vul je die code in; het horloge hoort dan bij jouw account.
3. Bij elke start haalt het horloge het **actieve** schema op via `GET /api/watch?id=<apparaat>`.

## Website
- Geen npm-packages; Vercel Functions in `web/api`, statische pagina in `web/public`.
- Opslag: Upstash Redis (via de Vercel Marketplace). Env: `KV_REST_API_URL`, `KV_REST_API_TOKEN`.
- `SESSION_SECRET`: willekeurige lange tekst voor het ondertekenen van login-cookies.
- Vercel-project: root directory `web`.
