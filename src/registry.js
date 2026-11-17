import fs from 'node:fs';
import path from 'node:path';
import { centinelaHome } from './config.js';
import { normalizePypi } from './popular.js';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function cacheFile() {
  return path.join(centinelaHome(), 'registry-cache.json');
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(cacheFile(), 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(cache) {
  try {
    fs.mkdirSync(centinelaHome(), { recursive: true });
    fs.writeFileSync(cacheFile(), JSON.stringify(cache));
  } catch {}
}

async function fetchJson(url, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (res.status === 404) return { status: 404 };
    if (!res.ok) return { status: res.status, error: true };
    return { status: 200, body: await res.json() };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Información mínima de un paquete:
 * { exists, createdAt, latestVersion, hasInstallScripts, weeklyDownloads, deprecated, offline }
 */
export async function lookupPackage(name, ecosystem, { timeoutMs = 4000, useCache = true } = {}) {
  const key = `${ecosystem}:${ecosystem === 'pypi' ? normalizePypi(name) : name}`;
  const cache = useCache ? loadCache() : {};
  const hit = cache[key];
  if (hit && Date.now() - hit.cachedAt < CACHE_TTL_MS) return hit.info;

  let info;
  try {
    info = ecosystem === 'pypi' ? await lookupPypi(name, timeoutMs) : await lookupNpm(name, timeoutMs);
  } catch {
    return { offline: true };
  }
  if (info.offline) return info;
  if (useCache) {
    cache[key] = { cachedAt: Date.now(), info };
    saveCache(cache);
  }
  return info;
}

async function lookupNpm(name, timeoutMs) {
  const encoded = name.startsWith('@') ? '@' + encodeURIComponent(name.slice(1)) : encodeURIComponent(name);
  const res = await fetchJson(`https://registry.npmjs.org/${encoded}`, timeoutMs);
  if (res.status === 404) return { exists: false };
  if (res.error) return { offline: true };
  const doc = res.body;
  const latestVersion = doc['dist-tags']?.latest;
  const latest = latestVersion ? doc.versions?.[latestVersion] : undefined;
  const scripts = latest?.scripts || {};
  const info = {
    exists: true,
    createdAt: doc.time?.created || null,
    latestVersion: latestVersion || null,
    hasInstallScripts: Boolean(scripts.preinstall || scripts.install || scripts.postinstall),
    deprecated: Boolean(latest?.deprecated),
    versionCount: Object.keys(doc.versions || {}).length,
    weeklyDownloads: null
  };
  // La API de descargas es otro host; si falla, seguimos sin ese dato.
  try {
    const dl = await fetchJson(`https://api.npmjs.org/downloads/point/last-week/${encoded}`, Math.min(timeoutMs, 2500));
    if (dl.status === 200 && typeof dl.body?.downloads === 'number') info.weeklyDownloads = dl.body.downloads;
  } catch {}
  return info;
}

async function lookupPypi(name, timeoutMs) {
  const res = await fetchJson(`https://pypi.org/pypi/${encodeURIComponent(normalizePypi(name))}/json`, timeoutMs);
  if (res.status === 404) return { exists: false };
  if (res.error) return { offline: true };
  const doc = res.body;
  let createdAt = null;
  for (const files of Object.values(doc.releases || {})) {
    for (const f of files) {
      const t = f.upload_time_iso_8601 || f.upload_time;
      if (t && (!createdAt || t < createdAt)) createdAt = t;
    }
  }
  return {
    exists: true,
    createdAt,
    latestVersion: doc.info?.version || null,
    // Los paquetes de Python con solo sdist pueden ejecutar setup.py al instalar.
    hasInstallScripts: !(doc.urls || []).some((u) => u.packagetype === 'bdist_wheel'),
    deprecated: Boolean(doc.info?.yanked),
    versionCount: Object.keys(doc.releases || {}).length,
    weeklyDownloads: null
  };
}
