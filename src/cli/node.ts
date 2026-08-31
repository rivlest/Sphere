import { Command } from 'commander';
import { SphereNode } from '../node.js';
import { isValidAddress } from '../wallet/keys.js';

const program = new Command();

program
  .name('sphere')
  .description('Sphere Proof-of-Work node')
  .option('--port <number>', 'REST API port', '3001')
  .option('--p2p-port <number>', 'P2P listen port (WebSocket; TCP is port+1 when fixed)', '6001')
  .option('--peers <urls>', 'comma-separated extra peer URLs', '')
  .option('--no-default-seeds', 'private node: skip GitHub peer list and public DHT discovery')
  .option('--p2p-url <url>', 'public WebSocket URL advertised to peers, e.g. ws://1.2.3.4:6001')
  .option('--mine', 'mine blocks continuously')
  .option('--miner-address <address>', 'address that receives block rewards')
  .option('--data-dir <path>', 'chain data directory (chain.dat + chain.idx)', 'data')
  .parse(process.argv);

const opts = program.opts<{
  port: string;
  p2pPort: string;
  peers: string;
  p2pUrl?: string;
  defaultSeeds?: boolean;
  mine: boolean;
  minerAddress?: string;
  dataDir: string;
}>();

const peers = opts.peers
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);

if (process.env.SPHERE_DISABLE_MINING === '1' && opts.mine) {
  console.error(
    'Error: SPHERE_DISABLE_MINING=1 (seed/VPS). Mine on a home PC, not this host.',
  );
  process.exit(1);
}

if (opts.mine && (!opts.minerAddress || !isValidAddress(opts.minerAddress))) {
  console.error('Error: --mine requires a valid --miner-address (sph1…)');
  process.exit(1);
}

const node = new SphereNode({
  httpPort: Number(opts.port),
  p2pPort: Number(opts.p2pPort),
  peers,
  advertisedP2pUrl: opts.p2pUrl,
  useDefaultSeeds: opts.defaultSeeds !== false,
  mine: Boolean(opts.mine),
  minerAddress: opts.minerAddress,
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
