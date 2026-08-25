# Sphere web wallet

Browser wallet for the **Sphere (SPH)** local chain. It is a Vite SPA: private keys are generated and used only in memory (or in an encrypted keystore file you download). The node REST API never receives a private key.

## Requirements

- Node.js 20+
- A running Sphere node (`npm run start -- --port 3001` from the repo root)

## Setup

```bash
cd sphere-wallet-web
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`. Point `VITE_SPHERE_NODE_URL` at the node REST origin (default `http://127.0.0.1:3001`).

## Features

- Create a secp256k1 wallet (`sph1` + first 40 hex chars of `sha256(compressed public key)`)
- Import from a raw private key or a PBKDF2 + AES-GCM keystore `{ address, salt, iv, ciphertext }`
- Dashboard balance (`GET /balance/:address`, Orbs ÷ 100_000_000 = SPH)
- Send: fetch `nextNonce`, hash and sign locally, `POST /transactions`
- Receive: address + QR (`qrcode.react`), optional `sphere:<address>/?amount=` payment URI
- Simulated SPH/USD price from `GET /price` — labeled **Kurs symulowany (demo)** because Sphere has no public market
- Recent transfers from `GET /transactions/:address`

## Security

- Private keys live in React state for the tab session and are cleared on **Wyloguj** or refresh
- **Do not** store plaintext keys in `localStorage`
- This is a demonstration. Do not use it with real funds without a professional audit

## Tests

```bash
npm test
```

## Swap the price feed later

`src/lib/api.ts` → `getPrice()` is the single mapping point. Replace the node URL with an exchange API and adapt the JSON shape to `PriceResponse`.
