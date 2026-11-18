import fs from 'node:fs';
import path from 'node:path';
import { scanText, isEnvFile } from './rules/secrets.js';
import { assessPackage, npmName, pypiName } from './rules/packages.js';
import { loadConfig } from './config.js';

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out', '.vercel', '.turbo', 'coverage', '.venv', 'venv', '__pycache__', '.cache', 'vendor', '.svelte-kit', '.nuxt', 'target']);
const TEXT_EXT = /\.(example|sample|template|js|mjs|cjs|jsx|ts|tsx|vue|svelte|astro|py|rb|php|go|rs|java|kt|cs|swift|json|ya?ml|toml|ini|cfg|conf|env|sh|bash|zsh|ps1|sql|md|txt|html|xml|tf|tfvars|properties|gradle|dockerfile)$/i;
const MAX_FILE = 1024 * 1024;

function* walk(dir, root) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) yield* walk(full, root);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

function gitignoreCovers(root, rel) {
  try {
    const lines = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    const base = path.basename(rel);
    return lines.some((p) => {
      const clean = p.replace(/^\//, '').replace(/\/$/, '');
      if (clean === rel || clean === base) return true;
      const re = new RegExp('^' + clean.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      return re.test(base) || re.test(rel);
    });
  } catch {
    return false;
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    })
  );
  return out;
}

/**
 * Escanea un proyecto completo: secrets en el código, .env sin ignorar y dependencias sospechosas.
 */
export async function scanProject(root, { checkDeps = true } = {}) {
  root = path.resolve(root);
  const config = loadConfig(root);
  const findings = [];

  for (const file of walk(root, root)) {
    const rel = path.relative(root, file);
    const name = path.basename(file);
    if (isEnvFile(rel)) {
      if (!gitignoreCovers(root, rel)) {
        findings.push({ type: 'secret-file', severity: 'high', file: rel, message: `${rel} no está en .gitignore: tus secrets terminarían en el repositorio.` });
      }
      continue; // Los secrets dentro de .env están donde deben estar.
    }
    if (!TEXT_EXT.test(name) && name !== 'Dockerfile') continue;
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      continue;
    }
    if (stat.size > MAX_FILE) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const f of scanText(text)) {
      findings.push({ type: 'secret', severity: f.severity, file: rel, line: f.line, message: f.id === 'client-exposed-secret' ? f.label : `${f.label} (${f.preview})` });
    }
  }

  const deps = [];
  if (checkDeps) {
    const pkgJson = path.join(root, 'package.json');
    if (fs.existsSync(pkgJson)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
        for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
          for (const [name, version] of Object.entries(pkg[section] || {})) {
            if (/^(file:|link:|workspace:|git|https?:|github:)/.test(String(version))) continue;
            const n = npmName(name);
            if (n) deps.push({ name: n, ecosystem: 'npm', via: 'package.json' });
          }
        }
      } catch {}
    }
    const req = path.join(root, 'requirements.txt');
    if (fs.existsSync(req)) {
      for (const line of fs.readFileSync(req, 'utf8').split('\n')) {
        const l = line.replace(/#.*/, '').trim();
        if (!l || l.startsWith('-')) continue;
        const n = pypiName(l);
        if (n) deps.push({ name: n, ecosystem: 'pypi', via: 'requirements.txt' });
      }
    }
    const results = await mapLimit(deps, 6, (d) => assessPackage(d, config).then((r) => ({ ...d, ...r })));
    for (const r of results) {
      if (r.decision === 'allow') continue;
      findings.push({
        type: 'dependency',
        severity: r.decision === 'deny' ? 'high' : 'medium',
        file: r.via,
        message: r.reasons.join(' ')
      });
    }
  }

  const summary = {
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    dependenciesChecked: deps.length
  };
  return { root, summary, findings };
}
