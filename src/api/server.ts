import cors from 'cors';
import express, { type Express } from 'express';
import type { Server } from 'node:http';
import { mountRoutes } from './routes.js';
import type { SphereNode } from '../node.js';

/**
 * CORS is open by default because the web wallet has no single production origin:
 * operators run Vite on localhost (various ports) and may point a browser at a seed.
 * Home REST binds 127.0.0.1, so open CORS does not publish the API to the internet.
 * Set SPHERE_CORS_ORIGIN to a comma-separated allow-list when you have a fixed wallet host.
 */
export function corsOptions(): cors.CorsOptions {
  const raw = process.env.SPHERE_CORS_ORIGIN?.trim();
  if (!raw || raw === '*') {
    return { origin: true };
  }
  const allowed = raw.split(',').map((item) => item.trim()).filter(Boolean);
  return { origin: allowed };
}

export async function startApiServer(
  node: SphereNode,
  port: number,
  host = '127.0.0.1',
): Promise<{ app: Express; server: Server; port: number }> {
  const app = express();
  app.use(cors(corsOptions()));
  app.use(express.json({ limit: '1mb' }));
  mountRoutes(app, node);

  const server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(port, host, () => resolve(listener));
    listener.once('error', reject);
  });

  const address = server.address();
  const bound = address && typeof address === 'object' ? address.port : port;
  return { app, server, port: bound };
}
