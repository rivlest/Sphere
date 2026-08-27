# Sphere

**Sphere** is a public Layer-1 blockchain. The native coin is **SPH**. Anyone with a computer and Node.js 20 can run a node, mine on CPU, and send coins.

| | |
| --- | --- |
| Coin | SPH (1 SPH = 100 000 000 Orbs) |
| Address | `sph1` + 40 hex characters |
| Ledger | UTXO (Bitcoin-style inputs/outputs) |
| Mining | CPU, Argon2id (~4 MiB RAM per hash) |
| Block time | ~10 minutes |
| Block reward | 50 SPH, halving every 210 000 blocks |
| Supply cap | ~21 million SPH |
| License | MIT |

This is **not** Bitcoin, Ethereum, or a hosted wallet. There is no installer, no App Store app, and no official exchange listing. The software is experimental and **unaudited**. Only use funds you can afford to lose.

> **Chain reset.** The live protocol is `blockVersion` **3** (UTXO + Argon2id + compact `bits`). Old account-based snapshots and SHA-256d `data/` directories will not sync. Delete them and start clean.

---

## Is the network up?

Start a node, then:

```bash
curl http://127.0.0.1:3001/status
```

You should see JSON with `"name": "Sphere"`, a `height`, `bits`, and `latestHash`. Rising `height` means blocks are being found. `"peers": 0` is normal until another Sphere node is found (same LAN, `--peers`, or DHT).

The chain lives on every node’s disk (`data/` or `--data-dir`). There is no required VPS. If one machine goes offline, others keep the same blocks.

---

## What you need

- **Node.js 20 or newer** (LTS from [nodejs.org](https://nodejs.org/) — tick “npm” on Windows)
- **Git** ([git-scm.com](https://git-scm.com/download/win) on Windows). After install, **close every terminal and open a new one**, or `git` will not be found.
- A CPU and about **4 MB RAM per mining attempt** (any normal PC from the last decade)
- Outbound internet (to find other nodes). Open ports only if others should connect **in**.

Windows, macOS, and Linux all work. The wallet talks to your local node’s REST API (`http://127.0.0.1:3001`).

---

## Quick start

Do **1 → 2 → 3** once. After that pick **only what you need** from the table.

| I want to… | What to run |
| --- | --- |
| See my balance / open the web wallet | Wallet CLI or web wallet against `http://127.0.0.1:3001` |
| Send SPH | Same as balance |
| Earn 50 SPH block rewards | `npm run start -- --mine --miner-address sph1…` |

`0 SPH` is normal until you win a block or someone sends you coins.

### 1. Install Node.js and Git

- Windows: [Node.js LTS](https://nodejs.org/) and [Git for Windows](https://git-scm.com/download/win). Open **PowerShell** or **Git Bash** after install.
- macOS: `brew install node git` or the Node.js installer.
- Linux: Node 20+ from your package manager or [nodejs.org](https://nodejs.org/).

Check:

```bash
node -v
npm -v
git -v
```

`node -v` must be `v20` or higher.

### 2. Download Sphere and install dependencies

**Windows (PowerShell):** do not run this from `C:\WINDOWS\system32` — clone will fail with `Permission denied`. Open a **new** PowerShell (Start → PowerShell), then:

```powershell
cd $env:USERPROFILE\Desktop
git clone https://github.com/rivlest/Sphere.git
cd Sphere
npm install
```

If the `Sphere` folder is already on your Desktop:

```powershell
cd $env:USERPROFILE\Desktop\Sphere
npm install
```

If `git` is not recognized, close PowerShell and open a new window (or use **Git Bash** from the Start menu).

**macOS / Linux:**

```bash
cd ~
git clone https://github.com/rivlest/Sphere.git
cd Sphere
npm install
```

`npm install` downloads Argon2 (native). On 64-bit Windows, Linux, and Apple Silicon it should use a prebuilt binary. If it tries to compile and fails, install your platform’s C build tools and run `npm install` again.

### 3. Create a wallet

```bash
npm run wallet -- generate --out wallets/moj.json
```

Copy the `sph1…` **address**.

The file `wallets/moj.json` is your **private key**. Back it up offline. Do not put it in git, Discord, email, or a screenshot. `wallets/` is gitignored on purpose.

### 4. See your balance

Start a node (step 5) if it is not already running. Then, from the `Sphere` folder:

Windows PowerShell:

```powershell
cd $env:USERPROFILE\Desktop\Sphere
npm run wallet -- balance --wallet wallets\moj.json
```

macOS / Linux:

```bash
cd ~/Sphere
npm run wallet -- balance --wallet wallets/moj.json
```

Only an address, no JSON file:

```bash
npm run wallet -- balance --address sph1YOUR_ADDRESS
```

`--node` defaults to `http://127.0.0.1:3001`.

### 5. Local node

Sync and REST on `http://127.0.0.1:3001`. Leave this window open.

```bash
npm run start -- --port 3001 --p2p-port 6001
```

Then in a **second** terminal, from the `Sphere` folder:

```bash
npm run wallet -- balance --wallet wallets/moj.json
curl http://127.0.0.1:3001/status
```

Same Wi-Fi: other Sphere nodes appear via mDNS. Across the internet: `--peers ws://THEIR.IP:6001` or a reachable `--p2p-url`. After the first successful connect, URLs are stored in `data/peers.json`.

### 6. Mine

```bash
npm run start -- --port 3001 --p2p-port 6001 --mine --miner-address sph1PASTE_YOUR_ADDRESS
```

Leave this window open. Mining runs on **this** computer.

Wait ~10 seconds, then in a **second** terminal:

```bash
curl http://127.0.0.1:3001/status
```

- `mining` is `true`
- `height` increases when this node (or a peer) finds a block

Rewards (50 SPH) go to `--miner-address` when your node finds a block. Target spacing is 10 minutes. You do not need to open ports to mine.

Do not run two `npm run start` on the same ports. To add mining, stop the node (Ctrl+C) and start again with `--mine`.

### 7. Send coins

```bash
npm run wallet -- send --wallet wallets/moj.json --to sph1RECIPIENT --amount 1 --fee 0.0001
```

Amounts are SPH decimals (max 8 places). Transfers sit in the mempool until a miner includes them in a block.

---

## Web wallet

HTTP to a node. Keys stay in the browser.

**A — your node** (repo root, leave it running):

```bash
npm run start -- --port 3001 --p2p-port 6001
```

Then:

```powershell
cd $env:USERPROFILE\Desktop\Sphere\sphere-wallet-web
copy .env.example .env
```

Keep `VITE_SPHERE_NODE_URL=http://127.0.0.1:3001`.

Then:

```powershell
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The node never receives your private key.

macOS / Linux: `cp .env.example .env` instead of `copy`. More detail: [`sphere-wallet-web/README.md`](sphere-wallet-web/README.md).

---

## How mining works

1. Every block header is hashed with **Argon2id** (memory-hard). One try costs real RAM, not just a SHA-256d tick. Transaction ids and Merkle trees stay double SHA-256.
2. A block is valid if `hash ≤ bitsToTarget(bits)`.
3. Genesis starts **easy** (`bits` `0x20ffffff`) so the first blocks can be found with almost no hashrate.
4. About every **144 blocks** (~1 day at 10 min), difficulty moves toward a 10-minute average, at most **×1.4 harder or easier**.
5. If no block appears for **>100 minutes**, difficulty eases immediately (and after a long outage can fall back to genesis). The chain cannot freeze forever.
6. “Harder than Bitcoin” means **each hash is more expensive**, not that Sphere matches Bitcoin’s global SHA-256d farms.

You mine by running `npm run start -- --mine --miner-address …`. There is no separate miner binary yet.

---

## Run a reachable node

Not required. Use this if you want others on the internet to dial **in** (home PC with port forward, or any always-on host):

1. Public IP or forwarded **TCP 3001**, **TCP 6001**, **TCP 6002** when using `--p2p-port 6001`
2. Fresh data directory (do not copy an old chain)
3. Advertise the public WebSocket URL:

```bash
npm run start -- --port 3001 --p2p-port 6001 --data-dir ~/sphere-data --p2p-url ws://YOUR.PUBLIC.IP:6001
```

Add that `ws://…` URL to [`bootstrap-peers.json`](bootstrap-peers.json) if you want new clones to find you without `--peers`.

`--no-default-seeds` plus no `--peers` starts a **private fork**, not the public chain.

### Two nodes on one computer

Use **different** REST ports, P2P ports, and data dirs. The node also binds **P2P TCP on `p2p-port + 1`**, so do not pick 6002 for the second node if the first already uses 6001 (that TCP port is taken).

```bash
npm run start -- --port 3001 --p2p-port 6001 --data-dir data/node1 --mine --miner-address sph1…
npm run start -- --port 3002 --p2p-port 6101 --data-dir data/node2 --peers ws://127.0.0.1:6001 --mine --miner-address sph1…
```

Longest valid chain wins; the replacement is fully validated first.

---

## Node flags

| Flag | Meaning |
| --- | --- |
| `--port` | REST API port (default `3001`) |
| `--p2p-port` | WebSocket P2P port (default `6001`; TCP is this + 1) |
| `--peers` | Extra bootstrap peers, comma-separated `ws://host:port` |
| `--no-default-seeds` | Private node: skip GitHub peer list and public DHT |
| `--p2p-url` | Public `ws://host:port` advertised to others |
| `--mine` | Mine in a loop |
| `--miner-address` | Coinbase recipient (`sph1…`) — required with `--mine` |
| `--data-dir` | Chain directory (`chain.dat` + `chain.idx`, default `data`) |

---

## Money and genesis

- **Reward:** 50 SPH per block, halved every 210 000 blocks (Bitcoin-style; ~21M SPH lifetime cap).
- **Fees** from transactions in a block go to that block’s miner.
- **Genesis** credits 50 SPH to the project-fund address  
  `sph10252f9a9770a9c19606a2a72b776c59e7bb597c6`  
  The matching key is **not** in this repository. The old leaked faucet address `sph1d0301dcf451b9ecd36a431234b5460ad0f809158` does **not** control coins on this chain.
- Optional operator drips: `SPHERE_FAUCET_PRIVATE_KEY` and `POST /faucet` (per-address daily cap). This is not an airdrop for everyone.

---

## REST API

Base URL: your node (`http://127.0.0.1:3001`).

| Method | Path | Description |
| --- | --- | --- |
| GET | `/status` | Height, `bits`, work (`difficulty`), peers, mining, tip hash |
| GET | `/blocks?from=&limit=` | Paginated blocks |
| GET | `/blocks/:hashOrHeight` | One block |
| GET | `/balance/:address` | Spendable UTXOs (Orbs + SPH) |
| GET | `/utxos/:address` | UTXOs for coin selection |
| GET | `/mempool` | Pending transactions |
| GET | `/price` | SPH/USD from `SPHERE_PRICE_URL` (`null` if unset) |
| GET | `/market` | On-chain supply; CoinMarketCap quote if configured |
| GET | `/transactions/:address` | Confirmed + mempool activity |
| POST | `/transactions` | Broadcast a signed transaction |
| POST | `/faucet` | Optional test drip |
| GET | `/peers` | Connected peer URLs |
| POST | `/peers` | `{ "address": "ws://host:port" }` |

CORS is enabled so the browser wallet can call a local node.

---

## Consensus

- Header PoW: Argon2id, `memoryCost` 4096 KiB, `timeCost` 1, `parallelism` 1, 32-byte raw digest, salt `sphere-hdr-v2pad`
- Compact `bits`: 1-byte exponent + 3-byte mantissa (unsigned); valid if hash ≤ target
- Genesis `bits`: `0x20ffffff` (easiest allowed)
- Retarget every **144** blocks: `new_target = old × actual / expected`, clamped to ×1.4 / ÷1.4
- Stall valve: gap **>10×** target spacing (100 min) eases ×1.4 per such window, capped at genesis
- Mempool: highest fee first, max 500 transactions per block, 1 hour TTL
- P2P: libp2p (WebSocket + TCP, Noise, Identify, ping, Kademlia `/sphere/kad/1.0.0`, mDNS, optional public DHT + circuit relay)

---

## Troubleshooting

| Problem | What to try |
| --- | --- |
| `git` / `node` not found | Install Git and Node 20, **close and reopen** the terminal |
| `Permission denied` creating `Sphere` | You are in `C:\WINDOWS\system32`. Run `cd $env:USERPROFILE\Desktop` first |
| `destination path 'Sphere' already exists` | Do not clone again. `cd $env:USERPROFILE\Desktop\Sphere` |
| `npm install` fails on `argon2` | 64-bit OS? Node 20+? Then install C build tools (Windows: “Desktop development with C++”) and retry |
| `curl` to `:3001` fails | Wait 10s after start; check the node window for errors; is another app using 3001? |
| `peers`: 0 | Wait; same LAN uses mDNS. Across the internet use `--peers ws://host:6001` or `--p2p-url`. After one connect, see `data/peers.json` |
| `height` never matches a friend | Different data dirs / old `data/` — stop, delete that dir, start again. Or you used `--no-default-seeds` |
| Balance is 0 | No coins yet. Mine with the same `sph1` as `--miner-address`, or get a transfer |
| `curl` / wallet cannot reach `:3001` | Start `npm run start` in another terminal, or pass `--node` to a running node |
| Second local node will not start | Port clash: first node uses 6001 **and** 6002. Use `--p2p-port 6101` for the second |

Tests: `npm test` from the repo root.

---

## Project layout

```
src/core              blocks, chain, PoW, Merkle, transactions
src/wallet            keys, addresses, signatures
src/mempool           pending transactions
src/network           libp2p (WebSocket + TCP, Sphere DHT, mDNS, discovery)
src/api               Express REST API
src/storage           append-only chain.dat + chain.idx
src/cli               node + wallet-cli
sphere-wallet-web     browser wallet (Vite / React)
```

Convert a UTXO `chain.json` with `npm run migrate-chain -- --from data/chain.json --to data-bin`. Account-based snapshots cannot be converted.

---

## License

[MIT](LICENSE)
