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

Public seed (keep this process running 24/7):

| | |
| --- | --- |
| P2P | `ws://57.128.203.234:6001` |
| REST | [http://57.128.203.234:3001](http://57.128.203.234:3001) |

```bash
curl http://57.128.203.234:3001/status
```

You should see JSON with `"name": "Sphere"`, a `height`, `bits`, and `latestHash`. Rising `height` means blocks are being found. `"peers": 0` on the seed is normal until someone else connects.

If `curl` fails, the seed is down — you can still run a private chain, but you will not join the public network.

---

## What you need

- **Node.js 20 or newer** (LTS from [nodejs.org](https://nodejs.org/) — tick “npm” on Windows)
- **Git** ([git-scm.com](https://git-scm.com/download/win) on Windows). After install, **close every terminal and open a new one**, or `git` will not be found.
- A CPU and about **4 MB RAM per mining attempt** (any normal PC or VPS from the last decade)
- Outbound internet (to dial the seed). Opening ports is optional; only do that if you want others to connect **in**

Windows, macOS, and Linux all work. Mining runs in the Sphere node, on CPU — not in the browser and not on a GPU miner.

---

## Quick start (mine on the public chain)

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

If the `Sphere` folder is already on your Desktop (`destination path already exists`):

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

Copy the `sph1…` **address**. That is where block rewards go.

The file `wallets/moj.json` is your **private key**. Back it up offline. Do not put it in git, Discord, email, or a screenshot. `wallets/` is gitignored on purpose.

### 4. Start a node and mine

```bash
npm run start -- --port 3001 --p2p-port 6001 --mine --miner-address sph1PASTE_YOUR_ADDRESS
```

Leave this window open. The node dials the compiled seed list automatically.

Wait ~10 seconds, then in a **second** terminal:

```bash
curl http://127.0.0.1:3001/status
```

- `peers` ≥ 1 — you reached the seed
- `height` matches (or is catching up to) [the seed `/status`](http://57.128.203.234:3001/status) — same chain
- `mining` is `true`

Block rewards (50 SPH) go to `--miner-address` when **your** node finds a block. Target spacing is 10 minutes; with few miners a block can take less or more. You do not need to open ports to mine.

### 5. Send coins (after you have a balance)

```bash
npm run wallet -- balance --wallet wallets/moj.json --node http://127.0.0.1:3001
npm run wallet -- send --wallet wallets/moj.json --to sph1RECIPIENT --amount 1 --fee 0.0001 --node http://127.0.0.1:3001
```

Amounts are **SPH decimals** (max 8 places), stored on chain as integer Orbs. Transfers sit in the mempool until some miner includes them in a block.

---

## Web wallet

```bash
cd sphere-wallet-web
cp .env.example .env
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Default node URL is `http://127.0.0.1:3001` (your local node). Keys stay in the browser. Details: [`sphere-wallet-web/README.md`](sphere-wallet-web/README.md).

To talk to the public seed’s REST API instead, set `VITE_SPHERE_NODE_URL=http://57.128.203.234:3001`. You still sign locally; the seed never receives your private key. Use this only if you understand you are trusting that server for **balances and broadcast**, not for custody.

---

## How mining works (plain language)

1. Every block header is hashed with **Argon2id** (memory-hard). One try costs real RAM, not just a SHA-256d tick. Transaction ids and Merkle trees stay double SHA-256.
2. A block is valid if `hash ≤ bitsToTarget(bits)`.
3. Genesis starts **easy** (`bits` `0x20ffffff`) so the first blocks can be found with almost no hashrate.
4. About every **144 blocks** (~1 day at 10 min), difficulty moves toward a 10-minute average, at most **×1.4 harder or easier**.
5. If no block appears for **>100 minutes**, difficulty eases immediately (and after a long outage can fall back to genesis). The chain cannot freeze forever.
6. “Harder than Bitcoin” means **each hash is more expensive**, not that Sphere matches Bitcoin’s global SHA-256d farms.

You mine by running `npm run start -- --mine --miner-address …`. There is no separate miner binary yet.

---

## Run a public node (optional)

Most people only dial **out** to the seed. To accept inbound peers (help the network):

1. VPS with a public IP
2. Open **TCP 3001** (REST), **TCP 6001** (P2P WebSocket), **TCP 6002** (P2P TCP) when using `--p2p-port 6001`
3. Fresh data directory (do not copy an old chain)
4. Advertise the public WebSocket URL:

```bash
npm run start -- --port 3001 --p2p-port 6001 --data-dir ~/sphere-data --mine --miner-address sph1YOUR_ADDRESS --p2p-url ws://YOUR.PUBLIC.IP:6001
```

`--no-default-seeds` plus no `--peers` starts a **private fork**, not the public chain.

To **reset the current public seed** (`57.128.203.234`) onto GitHub `master` (wipes old chain data, keeps `wallets/seed.json`, installs `systemd`):

```bash
curl -fsSL https://raw.githubusercontent.com/rivlest/Sphere/master/scripts/reset-public-seed.sh | bash
```

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
| `--no-default-seeds` | Do not dial the compiled seed list |
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

Base URL: your node (`http://127.0.0.1:3001`) or the seed (`http://57.128.203.234:3001`).

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

## Consensus (reference)

- Header PoW: Argon2id, `memoryCost` 4096 KiB, `timeCost` 1, `parallelism` 1, 32-byte raw digest, salt `sphere-hdr-v2pad`
- Compact `bits`: 1-byte exponent + 3-byte mantissa (unsigned); valid if hash ≤ target
- Genesis `bits`: `0x20ffffff` (easiest allowed)
- Retarget every **144** blocks: `new_target = old × actual / expected`, clamped to ×1.4 / ÷1.4
- Stall valve: gap **>10×** target spacing (100 min) eases ×1.4 per such window, capped at genesis
- Mempool: highest fee first, max 500 transactions per block, 1 hour TTL
- P2P: libp2p (WebSocket + TCP, Noise, Identify, ping, Kademlia `/sphere/kad/1.0.0`)

---

## Troubleshooting

| Problem | What to try |
| --- | --- |
| `git` / `node` not found | Install Git and Node 20, **close and reopen** the terminal |
| `Permission denied` creating `Sphere` | You are in `C:\WINDOWS\system32`. Run `cd $env:USERPROFILE\Desktop` first |
| `destination path 'Sphere' already exists` | Do not clone again. `cd $env:USERPROFILE\Desktop\Sphere` |
| `npm install` fails on `argon2` | 64-bit OS? Node 20+? Then install C build tools (Windows: “Desktop development with C++”) and retry |
| `curl` to `:3001` fails | Wait 10s after start; check the node window for errors; is another app using 3001? |
| `peers`: 0 on **your** node | Firewall/outbound WebSocket; try `--peers ws://57.128.203.234:6001`; seed may be down |
| `height` never matches the seed | You started with old `data/` — stop the node, delete that data dir, start again. Or you used `--no-default-seeds` |
| Mining is `true` but balance is 0 | You have not won a block yet, or `--miner-address` is not the wallet you are checking |
| Second local node will not start | Port clash: first node uses 6001 **and** 6002. Use `--p2p-port 6101` for the second |

Tests: `npm test` from the repo root.

---

## Project layout

```
src/core              blocks, chain, PoW, Merkle, transactions
src/wallet            keys, addresses, signatures
src/mempool           pending transactions
src/network           libp2p (WebSocket + TCP, Sphere DHT, bootstrap)
src/api               Express REST API
src/storage           append-only chain.dat + chain.idx
src/cli               node + wallet-cli
sphere-wallet-web     browser wallet (Vite / React)
```

Convert a UTXO `chain.json` with `npm run migrate-chain -- --from data/chain.json --to data-bin`. Account-based snapshots cannot be converted.

---

## License

[MIT](LICENSE)
