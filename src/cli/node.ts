import { Command } from 'commander';
import { SphereNode } from '../node.js';
import { isValidAddress } from '../wallet/keys.js';
import { parseAddress } from '../wallet/address.js';
import { assertWillJoinNetwork } from './networkGuard.js';
import { sphereCoreLabel } from '../version.js';

const program = new Command();

program
  .name('sphere')
  .version(sphereCoreLabel())
  .description('Sphere Proof-of-Work node')
  .option('--port <number>', 'REST API port', '3001')
  .option('--p2p-port <number>', 'P2P listen port (WebSocket; TCP is port+1 when fixed)', '6001')
  .option('--peers <urls>', 'comma-separated extra peer URLs', '')
  .option('--no-default-seeds', 'private node: skip GitHub peer list and public DHT discovery')
  .option('--p2p-url <url>', 'public WebSocket URL advertised to peers, e.g. ws://1.2.3.4:6001')
  .option('--public', 'bind REST on 0.0.0.0 (default is 127.0.0.1)')
  .option('--rpc-bind <host>', 'REST bind address', '127.0.0.1')
  .option('--mine', 'mine blocks continuously')
  .option('--miner-address <address>', 'address that receives block rewards')
  .option('--data-dir <path>', 'chain data directory (chain.dat + chain.idx)', 'data')
  .parse(process.argv);

const opts = program.opts<{
  port: string;
  p2pPort: string;
  peers: string;
  p2pUrl?: string;
  public?: boolean;
  rpcBind?: string;
  defaultSeeds?: boolean;
  mine: boolean;
  minerAddress?: string;
  dataDir: string;
}>();

const peers = opts.peers
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);

try {
  assertWillJoinNetwork(opts.defaultSeeds !== false, peers);
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}

if (process.env.SPHERE_DISABLE_MINING === '1' && opts.mine) {
  console.error(
    'Error: SPHERE_DISABLE_MINING=1 (seed/VPS). Mine on a home PC, not this host.',
  );
  process.exit(1);
}

let minerAddress = opts.minerAddress;
if (minerAddress) {
  try {
    minerAddress = parseAddress(minerAddress).canonical;
  } catch {
    console.error('Error: --miner-address must be a sph1 address (checksum or legacy 40-hex)');
    process.exit(1);
  }
}

if (opts.mine && (!minerAddress || !isValidAddress(minerAddress))) {
  console.error('Error: --mine requires a valid --miner-address (sph1…)');
  process.exit(1);
}

const node = new SphereNode({
  httpPort: Number(opts.port),
  p2pPort: Number(opts.p2pPort),
  peers,
  advertisedP2pUrl: opts.p2pUrl,
  publicRpc: Boolean(opts.public),
  rpcBind: opts.public ? '0.0.0.0' : opts.rpcBind,
  useDefaultSeeds: opts.defaultSeeds !== false,
  mine: Boolean(opts.mine),
  minerAddress,
  dataDir: opts.dataDir,
});

const shutdown = async () => {
  console.log('\n[sphere] shutting down…');
  await node.stop();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

void node.start().catch((error: unknown) => {
  console.error('[sphere] failed to start:', error);
  process.exit(1);
});
