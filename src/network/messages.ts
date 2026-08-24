import type { P2PMessage } from '../types.js';

export function encodeMessage(message: P2PMessage): string {
  return JSON.stringify(message);
}

export function decodeMessage(raw: string): P2PMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) return null;
    const type = (parsed as { type: unknown }).type;
    const allowed = [
      'NEW_BLOCK',
      'NEW_TRANSACTION',
      'QUERY_CHAIN',
      'QUERY_PEERS',
      'RESPONSE_CHAIN',
      'RESPONSE_PEERS',
    ];
    if (typeof type !== 'string' || !allowed.includes(type)) return null;
    return parsed as P2PMessage;
  } catch {
    return null;
  }
}
