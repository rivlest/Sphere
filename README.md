# Sphere

Sphere is a local **Layer 1** blockchain with **Proof of Work** (double SHA-256), an **account-based** ledger, and the native asset **SPH**.

|               |                                                                       |
| ------------- | --------------------------------------------------------------------- |
| Network       | Sphere                                                                |
| Ticker        | SPH                                                                   |
| Smallest unit | 1 Orb (`1 SPH = 100_000_000` Orbs)                                    |
| Consensus     | Proof of Work, double SHA-256                                         |
| Accounts      | secp256k1 keys, addresses `sph1` + 40 hex characters                  |
| Persistence   | JSON snapshots under `data/` (swap-friendly for LevelDB/SQLite later) |

Smart contracts, staking, sharding, bridges, and Layer 2 are out of scope.

## Requirements

- Node.js 20 or newer

## Join the network and mine SPH

GitHub gives you the **program**. Nodes dial a **seed list** (compiled default plus `--peers`), then gossip `QUERY_PEERS` / `RESPONSE_PEERS` (`addr`) and remember peers in `peers.json`. If you start with `--no-default-seeds` and no `--peers`, you are on a private fork.

A WebSocket node only receives inbound connections if it **listens** on a public IP (or forwarded port) — the same split as Bitcoin listening vs outbound-only nodes. Most miners only dial out to seeds.

**Current public seed (keep this node running 24/7):**

```text
ws://57.128.203.234:6001
```

REST API (wallet / balance): `http://57.128.203.234:3001`

### 1. Clone

```bash
git clone https://github.com/rivlest/Sphere.git
cd Sphere
npm install
```

If this URL 404s, use the GitHub page of the fork you actually cloned.

### 2. Create a wallet (your mining address)

```bash
npm run wallet -- generate --out wallets/moj.json
```

Copy the `sph1…` address from that file. Keep `wallets/moj.json` private (it is gitignored).

### 3. Start a seed node (maintainer / VPS)

Keep this process running. Open **TCP 6001** (P2P) and **TCP 3001** (REST) on the firewall/router. Advertise the public P2P URL so other nodes do not receive `ws://127.0.0.1`.

```bash
npm run start -- --port 3001 --p2p-port 6001 --data-dir data/seed --mine --miner-address sph1YOUR_ADDRESS --p2p-url ws://57.128.203.234:6001
```

Wait a few seconds after start — `curl` to port 3001 can fail while Node is still booting.

Anyone can check the live seed (no SSH):

```bash
curl http://57.128.203.234:3001/status
```

On the seed, `"peers": 0` is normal until someone else connects. `"mining": true` and a rising `height` mean the node is up.

### 4. Mine on the shared chain (everyone else)

```bash
npm run start -- --port 3001 --p2p-port 6001 --mine --miner-address sph1YOUR_ADDRESS --peers ws://57.128.203.234:6001
```

Block rewards (50 SPH, halving every 210_000 blocks) go to `--miner-address`. Target block time is 10 minutes.

After your node starts, check that you joined the same tip:

```bash
curl http://127.0.0.1:3001/status
```

Your `height` should catch up to the seed. On **your** node `peers` should be at least 1 (you are connected to the seed). The seed still shows `peers: 0` until that handshake completes — then it increments.

### 5. Send and receive

```bash
npm run wallet -- balance --wallet wallets/moj.json --node http://127.0.0.1:3001
npm run wallet -- send --wallet wallets/moj.json --to sph1RECIPIENT --amount 1 --fee 0.0001 --node http://127.0.0.1:3001
```

Transfers confirm when any miner includes them in a block.

## Setup

```bash
npm install
```

## Run a node

```bash
npm run start -- --port 3001 --p2p-port 6001 --mine --miner-address sph1<your-address>
```

| Flag              | Meaning                                            |
| ----------------- | -------------------------------------------------- |
| `--port`          | REST API port (default `3001`)                     |
| `--p2p-port`      | WebSocket P2P port (default `6001`)                |
| `--peers`            | Extra bootstrap peers (`ws://host:port`, comma-separated) |
| `--no-default-seeds` | Do not dial the compiled seed list                        |
| `--p2p-url`          | Public `ws://host:port` advertised to other nodes         |
| `--mine`          | Mine empty and mempool blocks in a loop            |
| `--miner-address` | Coinbase recipient (`sph1…`)                       |
| `--data-dir`      | Snapshot directory (default `data`)                |

Mining requires `--miner-address`. Genesis credits **50 SPH** to a known local faucet address so you can send a first transaction without waiting for your own block reward.

### Two nodes on one machine

Terminal 1:

```bash
npm run start -- --port 3001 --p2p-port 6001 --data-dir data/node1 --mine --miner-address <ADDRESS>
```

Terminal 2:

```bash
npm run start -- --port 3002 --p2p-port 6002 --data-dir data/node2 --peers ws://127.0.0.1:6001 --mine --miner-address <ADDRESS>
```

The second node asks the first for its chain on connect, then both gossip `NEW_BLOCK` and `NEW_TRANSACTION`. Conflicting tips are resolved with the **longest valid chain** rule (the replacement chain is fully validated first).

Check height and peer count:

```bash
curl http://127.0.0.1:3001/status
curl http://127.0.0.1:3002/status
```

## Wallet

CLI:

```bash
npm run wallet -- generate --out wallets/alice.json
npm run wallet -- balance --wallet wallets/alice.json --node http://127.0.0.1:3001
npm run wallet -- send --wallet wallets/alice.json --to sph1… --amount 1.5 --fee 0.0001 --node http://127.0.0.1:3001
```

Amounts on the CLI are **SPH decimal strings** converted to integer Orbs. The node never stores SPH as a floating-point value.

### Faucet

Genesis still credits **50 SPH** to the historical coinbase address:

`sph1d0301dcf451b9ecd36a431234b5460ad0f809158`

The private key for that address is **not** in this repository. Optional test drips (if an operator enables them) use `SPHERE_FAUCET_PRIVATE_KEY` in the environment only, with a per-address daily cap (`POST /faucet`).

Watch a recipient:

```bash
npm run wallet -- balance --address sph1<alice> --node http://127.0.0.1:3001
```

Unconfirmed transfers sit in `GET /mempool` until the next block. After a node mines (or a peer does), both nodes should show the same confirmed balance.

### Web wallet

```bash
cd sphere-wallet-web
cp .env.example .env
npm install
npm run dev
```

The SPA talks to the node REST API (`VITE_SPHERE_NODE_URL`, default `http://127.0.0.1:3001`). Private keys stay in the browser. See `sphere-wallet-web/README.md`.

## REST API

| Method | Path                     | Description                                              |
| ------ | ------------------------ | -------------------------------------------------------- |
| GET    | `/status`                | Height, difficulty, peers, mining flag                   |
| GET    | `/blocks?from=&limit=`   | Paginated blocks                                         |
| GET    | `/blocks/:hashOrHeight`  | One block by hash or height                              |
| GET    | `/balance/:address`      | Confirmed balance (Orbs + SPH) and nonce                 |
| GET    | `/mempool`               | Pending transactions                                     |
| GET    | `/price`                 | Simulated SPH/USD demo feed (not a real market)          |
| GET    | `/transactions/:address` | Confirmed + mempool transfers for an address             |
| POST   | `/transactions`          | Submit a signed transaction                              |
| POST   | `/faucet`                | Optional test drip (`SPHERE_FAUCET_PRIVATE_KEY`)         |
| GET    | `/peers`                 | Connected peer URLs                                      |
| POST   | `/peers`                 | `{ "address": "ws://host:port" }`                        |

## Consensus parameters

- Target block time: **600 seconds** (10 minutes, `DEFAULT_CONFIG.targetBlockTimeMs`)
- Difficulty: leading hex zeros in the block hash
- Adjustment: every **10** blocks, work scaled toward the target, change clamped to ×4 / ÷4
- Block reward: **50 SPH**, halving every **210_000** blocks
- Fees from the block are added to the miner’s coinbase
- Mempool: highest fee first, max **500** transactions per block, **1 hour** TTL

## Tests

```bash
npm test
```

Unit tests cover hashing, Merkle roots, PoW, difficulty, blocks, signatures, the mempool, and snapshots. An integration test starts three local nodes, checks chain sync, transaction gossip, and reload-from-disk.

## Project layout

```
src/core              block, chain, PoW, Merkle, transactions
src/wallet            keys, addresses, signatures
src/mempool           pending transactions
src/network           WebSocket P2P
src/api               Express REST API
src/storage           JSON chain snapshots
src/cli               node + wallet-cli
sphere-wallet-web     React / Vite browser wallet
```

`src/storage/persistence.ts` exposes a `ChainStore` interface so a future LevelDB or SQLite backend can replace `JsonFileChainStore` without touching consensus code.
