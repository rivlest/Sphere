import express, { type Express } from 'express';
import type { Server } from 'node:http';
import { mountRoutes } from './routes.js';
import type { SphereNode } from '../node.js';

export async function startApiServer(
  node: SphereNode,
  port: number,
): Promise<{ app: Express; server: Server; port: number }> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    next();
  });
  mountRoutes(app, node);

  const server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(port, () => resolve(listener));
    listener.once('error', reject);
  });

  const address = server.address();
  const bound = address && typeof address === 'object' ? address.port : port;
  return { app, server, port: bound };
}
