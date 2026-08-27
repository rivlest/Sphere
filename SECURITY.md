# Security

Sphere is experimental software. It has **not** had a professional audit. Do not store money you cannot afford to lose.

## Private keys

- Wallet JSON from `npm run wallet -- generate` contains a **private key**. Anyone with that file can spend the coins.
- Never commit `wallets/`, paste a key into a chat, issue, pull request, or screenshot.
- The browser wallet never sends the private key to the node. The node only sees addresses and signed transactions.
- If a key leaked, move funds to a new address immediately (and assume the old address is empty).

## Reporting a vulnerability

Open a GitHub issue **without** private keys, seed phrases, or server credentials. If the bug allows theft or chain halt, describe the impact and a way to reproduce on a private test node.

## Network

- Nodes find each other via mDNS (LAN), `data/peers.json`, `--peers`, [`bootstrap-peers.json`](bootstrap-peers.json) on GitHub, and DHT. No VPS is required to keep the chain.
- A reachable `--p2p-url` is optional help for inbound peers. It cannot spend your coins.
- `POST /faucet` is an optional operator drip. It is not an exchange and not a way to recover a lost key.
