import { Command } from 'commander';
import { SphereNode } from '../node.js';
import { isValidAddress } from '../wallet/keys.js';

const program = new Command();

program
  .name('sphere')
  .description('Sphere Proof-of-Work node')
  .option('--port <number>', 'REST API port', '3001')
  .option('--p2p-port <number>', 'P2P WebSocket port', '6001')
  .option('--peers <urls>', 'comma-separated bootstrap peer URLs', '')
  .option('--p2p-url <url>', 'public WebSocket URL advertised to peers, e.g. ws://1.2.3.4:6001')
  .option('--mine', 'mine blocks continuously')
  .option('--miner-address <address>', 'address that receives block rewards')
  .option('--data-dir <path>', 'JSON snapshot directory', 'data')
  .parse(process.argv);

const opts = program.opts<{
  port: string;
  p2pPort: string;
  peers: string;
  p2pUrl?: string;
  mine: boolean;
  minerAddress?: string;
  dataDir: string;
}>();

const peers = opts.peers
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);

if (opts.mine && (!opts.minerAddress || !isValidAddress(opts.minerAddress))) {
  console.error('Error: --mine requires a valid --miner-address (sph1…)');
  process.exit(1);
}

const node = new SphereNode({
  httpPort: Number(opts.port),
  p2pPort: Number(opts.p2pPort),
  peers,
  advertisedP2pUrl: opts.p2pUrl,
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
