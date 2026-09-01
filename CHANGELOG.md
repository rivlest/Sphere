# Changelog

Sphere software version (`GET /status` → `"version": "Sphere core x.y"`). This is **not** `blockVersion` (that stays **3** until a hard fork).

Format: **x.y.z** internally — bump **y** for a public node/wallet release, **z** for a small fix. `/status` shows only **x.y**.

---

## 1.2.1 — 2026-09-01

- Warn when GitHub `master` is newer: node log, `GET /status` (`outdated`), wallet CLI, web wallet. Update with `git pull`.
- `GET /status` `version` is `Sphere core x.y` (not a bare semver string).

## 1.2.0 — 2026-09-01

First build that reports `version` on `/status`.

- Coinbase maturity: 100 blocks (~16.7 h), from height 5328. No chain reset.
- Checksummed `sph1` display addresses in CLI and web wallet. On-chain form unchanged; legacy 40-hex still works.
- Escalating peer bans (15 min → 4 h → 1 day).
- Rate limits on heavy REST (`/blocks`, address history), not only broadcasts.
- `--no-default-seeds` without `--peers` refuses to start (no silent private fork).
- Clearer wallet error when the node is down.

## 1.1.0 — 2026-09-01

- Reorgs follow cumulative work, not chain length.
- Home REST binds `127.0.0.1` by default (`--public` on seeds).
- Headers-first P2P sync, mainnet checkpoints, UTXO snapshots.
- CPU mining on worker threads (`SPHERE_MINE_WORKERS`).

## 1.0.0

Live protocol **v3** (UTXO + Argon2id + compact `bits`). Genesis 2026-08-25.
