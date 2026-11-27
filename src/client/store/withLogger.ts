import type { StateCreator } from 'zustand';
import { sendClientLog } from '../utils/debugLogger';

const SENSITIVE_KEYS = new Set(['doctorToken', 'pin']);

function summarizeValue(key: string, val: unknown): unknown {
  if (SENSITIVE_KEYS.has(key)) return val ? '***' : '';
  if (Array.isArray(val)) return `[Array(${val.length})]`;
  return val;
}

export function withStoreLogger<T extends object>(
  storeName: string,
  creator: StateCreator<T>
): StateCreator<T> {
  return (set, get, api) =>
    creator(
      (partial, replace) => {
        const prev = get();
        if (replace) {
          (set as (next: T, replace: true) => void)(partial as T, true);
        } else {
          set(partial);
        }
        const next = get();
        const diff: Record<string, { from: unknown; to: unknown }> = {};
        for (const key of Object.keys(next) as Array<keyof T>) {
          if (typeof next[key] === 'function') continue;
          if (!Object.is(prev[key], next[key])) {
            diff[String(key)] = {
              from: summarizeValue(String(key), prev[key]),
              to: summarizeValue(String(key), next[key]),
            };
          }
        }
        if (Object.keys(diff).length > 0) {
          sendClientLog(`STORE:${storeName}`, 'state changed', diff, 'STATE');
        }
      },
      get,
      api
    );
}
