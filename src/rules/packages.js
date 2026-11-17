import fs from 'node:fs';
import path from 'node:path';
import { splitSegments, tokenize, stripPrefixes } from '../shell.js';
import { POPULAR_NPM_SET, POPULAR_PYPI_SET, normalizePypi } from '../popular.js';
import { findTyposquatTarget } from '../typosquat.js';
import { lookupPackage } from '../registry.js';

// Flags que consumen el siguiente argumento (para no confundirlos con nombres de paquete).
const NPM_FLAGS_WITH_VALUE = new Set(['--registry', '--prefix', '-w', '--workspace', '--filter', '--tag', '--cwd']);
const PIP_FLAGS_WITH_VALUE = new Set(['-i', '--index-url', '--extra-index-url', '-c', '--constraint', '-t', '--target', '--python', '-p', '--group', '--source']);

/** Convierte "foo@^1.2.0" o "@scope/foo@latest" en el nombre limpio. */
export function npmName(spec) {
  if (/^(https?:|git(\+|:)|file:|github:|link:|workspace:|\.|\/|~)/.test(spec)) return null;
  if (spec.includes('/') && !spec.startsWith('@')) return null; // user/repo de GitHub
  const at = spec.startsWith('@') ? spec.indexOf('@', 1) : spec.indexOf('@');
  const name = at > 0 ? spec.slice(0, at) : spec;
  if (!/^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(name)) return null;
  return name;
}

/** Convierte "foo[extra]>=1.0" en "foo". */
export function pypiName(spec) {
  if (/^(https?:|git\+|file:|\.|\/|~)/.test(spec) || spec.endsWith('.whl') || spec.endsWith('.tar.gz')) return null;
  const m = spec.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)/);
  return m ? m[1] : null;
}

function readRequirements(file, cwd) {
  try {
    const content = fs.readFileSync(path.resolve(cwd || process.cwd(), file), 'utf8');
    return content
      .split('\n')
      .map((l) => l.replace(/#.*/, '').trim())
      .filter((l) => l && !l.startsWith('-'))
      .map(pypiName)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function collectArgs(args, flagsWithValue) {
  const out = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (flagsWithValue.has(a)) {
      i++;
      continue;
    }
    if (a.startsWith('-')) continue;
    out.push(a);
  }
  return out;
}

/**
 * Detecta instalaciones o ejecuciones de paquetes dentro de un comando.
 * Devuelve [{ name, ecosystem: 'npm'|'pypi', via }]
 */
export function extractPackages(command, cwd) {
  const found = [];
  for (const seg of splitSegments(command)) {
    let t = stripPrefixes(tokenize(seg));
    if (!t.length) continue;
    const [cmd, sub, ...rest] = t;

    // npm / pnpm / yarn / bun
    if (cmd === 'npm' && ['install', 'i', 'add', 'isntall', 'in'].includes(sub)) {
      collectArgs(rest, NPM_FLAGS_WITH_VALUE).forEach((s) => push(npmName(s), 'npm', 'npm install'));
    } else if ((cmd === 'pnpm' || cmd === 'yarn' || cmd === 'bun') && ['add', 'install', 'i'].includes(sub)) {
      collectArgs(rest, NPM_FLAGS_WITH_VALUE).forEach((s) => push(npmName(s), 'npm', `${cmd} ${sub}`));
    } else if (cmd === 'yarn' && sub === 'global' && rest[0] === 'add') {
      collectArgs(rest.slice(1), NPM_FLAGS_WITH_VALUE).forEach((s) => push(npmName(s), 'npm', 'yarn global add'));
    } else if (cmd === 'npx' || cmd === 'bunx' || (cmd === 'pnpm' && sub === 'dlx') || (cmd === 'npm' && sub === 'exec')) {
      // npx ejecuta el paquete directamente: si no existe y alguien lo registra, corre su código.
      const args = cmd === 'npx' || cmd === 'bunx' ? [sub, ...rest] : rest;
      const pkgFlag = args.findIndex((a) => a === '-p' || a === '--package');
      const spec = pkgFlag >= 0 ? args[pkgFlag + 1] : args.find((a) => !a.startsWith('-'));
      if (spec) push(npmName(spec), 'npm', cmd === 'npm' ? 'npm exec' : cmd);
    }

    // pip / uv / poetry / pipx
    let pipArgs = null;
    if ((cmd === 'pip' || cmd === 'pip3') && sub === 'install') pipArgs = rest;
    else if (/^python[\d.]*$/.test(cmd) && sub === '-m' && (rest[0] === 'pip' || rest[0] === 'pip3') && rest[1] === 'install') pipArgs = rest.slice(2);
    else if (cmd === 'uv' && sub === 'pip' && rest[0] === 'install') pipArgs = rest.slice(1);
    else if (cmd === 'uv' && sub === 'add') pipArgs = rest;
    else if (cmd === 'poetry' && sub === 'add') pipArgs = rest;
    else if (cmd === 'pipx' && (sub === 'install' || sub === 'run')) pipArgs = rest;
    else if (cmd === 'uvx') pipArgs = [sub, ...rest].slice(0, 1);

    if (pipArgs) {
      for (let i = 0; i < pipArgs.length; i++) {
        const a = pipArgs[i];
        if (a === '-r' || a === '--requirement') {
          readRequirements(pipArgs[++i], cwd).forEach((n) => push(n, 'pypi', 'requirements'));
          continue;
        }
        if (PIP_FLAGS_WITH_VALUE.has(a)) {
          i++;
          continue;
        }
        if (a.startsWith('-')) continue;
        push(pypiName(a), 'pypi', cmd);
      }
    }
  }

  function push(name, ecosystem, via) {
    if (!name) return;
    if (found.some((f) => f.name === name && f.ecosystem === ecosystem)) return;
    found.push({ name, ecosystem, via });
  }
  return found;
}

function daysSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

/**
 * Evalúa un paquete y devuelve { decision: allow|ask|deny, reasons: [], info }
 */
export async function assessPackage(pkg, config) {
  const { name, ecosystem } = pkg;
  const registryName = ecosystem === 'pypi' ? 'PyPI' : 'npm';
  const normalized = ecosystem === 'pypi' ? normalizePypi(name) : name;
  const allow = (config.allowPackages || []).map((p) => (ecosystem === 'pypi' ? normalizePypi(p) : p));
  if (allow.includes(normalized)) return { decision: 'allow', reasons: [], info: { allowlisted: true } };

  const popular = ecosystem === 'pypi' ? POPULAR_PYPI_SET.has(normalized) : POPULAR_NPM_SET.has(normalized);
  if (popular) return { decision: 'allow', reasons: [], info: { popular: true } };

  const reasons = [];
  let decision = 'allow';
  const raise = (d) => {
    const rank = { allow: 0, ask: 1, deny: 2 };
    if (rank[d] > rank[decision]) decision = d;
  };

  const target = findTyposquatTarget(name, ecosystem);
  const info = await lookupPackage(name, ecosystem, { timeoutMs: config.registryTimeoutMs });

  if (info.offline) {
    raise(config.offline || 'allow');
    reasons.push(`No pude verificar "${name}" en ${registryName} (sin conexión).`);
    if (target) {
      raise('ask');
      reasons.push(`Además, "${name}" se parece mucho a "${target}". Verificá que sea el que querés.`);
    }
    return { decision, reasons, info };
  }

  if (!info.exists) {
    raise('deny');
    reasons.push(
      `"${name}" NO existe en ${registryName}. Probablemente es un nombre alucinado por la AI. ` +
        `Si alguien lo registra después ("slopsquatting"), instalarlo ejecutaría su código.` +
        (target ? ` ¿Quisiste decir "${target}"?` : '')
    );
    return { decision, reasons, info };
  }

  if (/-security$/.test(info.latestVersion || '')) {
    raise('deny');
    reasons.push(`npm retiró "${name}" por contener código malicioso (versión de seguridad ${info.latestVersion}).` + (target ? ` ¿Quisiste decir "${target}"?` : ''));
    return { decision, reasons, info };
  }

  const age = daysSince(info.createdAt);
  const isNew = age !== null && age < config.minPackageAgeDays;

  if (target) {
    raise(isNew ? 'deny' : 'ask');
    reasons.push(`"${name}" se parece mucho al paquete popular "${target}" (posible typosquatting).`);
  }
  if (isNew) {
    raise('ask');
    reasons.push(`"${name}" se publicó hace solo ${age} día(s). Los paquetes maliciosos suelen ser nuevos.`);
  }
  if (info.weeklyDownloads !== null && info.weeklyDownloads < config.minWeeklyDownloads) {
    raise('ask');
    reasons.push(`"${name}" tiene muy pocas descargas (${info.weeklyDownloads} la última semana).`);
  }
  if (info.hasInstallScripts && ecosystem === 'npm' && (isNew || target)) {
    raise('deny');
    reasons.push(`"${name}" ejecuta scripts al instalarse (preinstall/postinstall), una técnica común de malware.`);
  }
  if (info.deprecated) {
    raise('ask');
    reasons.push(`La última versión de "${name}" está marcada como deprecada.`);
  }
  return { decision, reasons, info };
}
