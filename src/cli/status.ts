import { DEFAULT_SEED_REST, LOCAL_REST } from '../network/seeds.js';
import { fetchNodeStatus, firstReachableStatus } from '../statusProbe.js';

function nodeFlag(argv: readonly string[]): string | undefined {
  const index = argv.indexOf('--node');
  if (index >= 0 && argv[index + 1]) return argv[index + 1];
  return undefined;
}

async function main(): Promise<void> {
  if (process.argv.includes('-h') || process.argv.includes('--help')) {
    console.log('Usage: npm run status [-- --node http://127.0.0.1:3001]');
    console.log('Tries localhost, then the public seed. On Windows PowerShell prefer this over curl.');
    return;
  }
  const explicit = nodeFlag(process.argv);
  if (explicit) {
    const body = await fetchNodeStatus(explicit);
    console.log(`Node: ${explicit.replace(/\/$/, '')}`);
    console.log(JSON.stringify(body, null, 2));
    return;
  }
  const { url, body } = await firstReachableStatus([LOCAL_REST, DEFAULT_SEED_REST]);
  console.log(`Node: ${url}`);
  console.log(JSON.stringify(body, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
