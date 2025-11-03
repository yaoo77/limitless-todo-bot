import { createHash } from 'node:crypto';

export function computeTaskHash(lifelogId: string, task: string, timestamp: string): string {
  return createHash('sha256').update(`${lifelogId}:${task}:${timestamp}`).digest('hex');
}
