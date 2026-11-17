import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const DEFAULT_CONFIG = {
  // enforce: bloquea lo grave y pregunta lo dudoso.
  // warn:    nunca bloquea; lo grave se convierte en pregunta.
  // audit:   solo registra en el log, no interfiere.
  mode: 'enforce',
  minPackageAgeDays: 30,
  minWeeklyDownloads: 100,
  // Qué hacer si no hay internet para verificar un paquete: allow | ask | deny
  offline: 'allow',
  // Cursor a veces ignora "ask"; por eso lo convertimos en deny (configurable).
  cursorAskAs: 'deny',
  allowPackages: [],
  allowCommands: [],
  allowReadPaths: [],
  registryTimeoutMs: 4000
};

export function centinelaHome() {
  return process.env.CENTINELA_HOME || path.join(os.homedir(), '.centinela');
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Mezcla: valores por defecto < ~/.centinela/config.json < <proyecto>/.centinela.json */
export function loadConfig(cwd = process.cwd()) {
  const global = readJson(path.join(centinelaHome(), 'config.json')) || {};
  const local = readJson(path.join(cwd, '.centinela.json')) || {};
  const merged = { ...DEFAULT_CONFIG, ...global, ...local };
  for (const key of ['allowPackages', 'allowCommands', 'allowReadPaths']) {
    merged[key] = [...(DEFAULT_CONFIG[key] || []), ...(global[key] || []), ...(local[key] || [])];
  }
  return merged;
}
