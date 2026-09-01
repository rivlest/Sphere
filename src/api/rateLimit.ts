import type { NextFunction, Request, Response } from 'express';

export function rateLimit(options: { windowMs: number; max: number }) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const cutoff = now - options.windowMs;
    const recent = (hits.get(ip) ?? []).filter((at) => at > cutoff);
    if (recent.length >= options.max) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    recent.push(now);
    hits.set(ip, recent);
    next();
  };
}
