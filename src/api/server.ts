import cors from 'cors';
import express, { type Express } from 'express';
import type { Server } from 'node:http';
import { mountRoutes } from './routes.js';
import type { SphereNode } from '../node.js';

export async function startApiServer(
  node: SphereNode,
  port: number,
): Promise<{ app: Express; server: Server; port: number }> {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  mountRoutes(app, node);

  const server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(port, () => resolve(listener));
    listener.once('error', reject);
  });

  const address = server.address();
  const bound = address && typeof address === 'object' ? address.port : port;
  return { app, server, port: bound };
}
