# Sphere web wallet

Browser wallet for **Sphere (SPH)**. Keys are created and used only on your machine (in memory, or in an encrypted keystore file you download). The node never receives a private key.

This is a demonstration UI. It is **not** audited. Do not use it for money you cannot afford to lose.

## Requirements

- Node.js 20+
- HTTP access to a Sphere node:
  - Public seed: `VITE_SPHERE_NODE_URL=http://57.128.203.234:3001`
  - Local node (repo root): `npm run start -- --port 3001 --p2p-port 6001` → `http://127.0.0.1:3001`
  - Local node that mines: add `--mine --miner-address sph1…`

## See balance from the CLI

From the repo root:

```powershell
cd $env:USERPROFILE\Desktop\Sphere
npm run wallet -- balance --wallet wallets\moj.json --node http://57.128.203.234:3001
```

## Setup

```bash
cd sphere-wallet-web
cp .env.example .env
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

`VITE_SPHERE_NODE_URL` in `.env` is the node REST origin (default `http://127.0.0.1:3001`). After changing it, restart `npm run dev`.

## What you can do

- Create a secp256k1 wallet (`sph1` + first 40 hex characters of `sha256(compressed public key)`)
- Import a raw private key or a PBKDF2 + AES-GCM keystore `{ address, salt, iv, ciphertext }`
- See balance (`GET /balance/:address`)
- Send: fetch UTXOs, coin-select and sign in the browser, `POST /transactions`
- Receive: address + QR, optional `sphere:<address>/?amount=` payment URI
- Market card from `GET /market` (on-chain supply; CoinMarketCap only if SPH is listed on the **node**)
- Recent transfers from `GET /transactions/:address`

## Security

- Keys live in React state for the tab. **Wyloguj** or refresh clears them
- Download and keep the keystore file if you want the wallet again later
- Do **not** store a plaintext private key in `localStorage`
- Never paste a private key into GitHub issues, chat, or email

## Market stats

The dashboard uses `GET /market` on the node:

- Circulating / max supply and holders always come from the chain (~21M SPH cap)
- Price, cap, volume, and rank come from CoinMarketCap only when SPH is listed (`CMC_API_KEY` / `CMC_SLUG` on the **node**). CMC’s `sphere` slug is SPHR and is ignored
- Until a listing or `SPHERE_PRICE_URL` exists, quotes stay unavailable — the node does not invent a price

## Tests

```bash
npm test
```
