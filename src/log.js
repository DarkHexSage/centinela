import fs from 'node:fs';
import path from 'node:path';
import { centinelaHome } from './config.js';

const logFile = () => path.join(centinelaHome(), 'log.jsonl');

/** Registra cada decisión que no sea "allow". Nunca guarda valores de secrets. */
export function logDecision(entry) {
  try {
    fs.mkdirSync(centinelaHome(), { recursive: true });
    fs.appendFileSync(logFile(), JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
  } catch {
    // El log nunca debe romper el hook.
  }
}

export function readLog(limit = 20) {
  try {
    const lines = fs.readFileSync(logFile(), 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-limit).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
