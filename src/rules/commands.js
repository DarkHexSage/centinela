import path from 'node:path';
import os from 'node:os';
import { splitSegments, tokenize, stripPrefixes } from '../shell.js';
import { isSecretFile } from './secrets.js';

// Reglas para comandos de shell. Cada regla devuelve { decision, reason } o null.

const READERS = new Set(['cat', 'less', 'more', 'head', 'tail', 'bat', 'nl', 'strings', 'xxd', 'od', 'base64', 'grep', 'rg', 'awk', 'sed', 'cp', 'scp', 'type', 'jq', 'source', '.']);
const NETWORK = /\b(curl|wget|nc|ncat|netcat|scp|rsync|ftp|sftp|telnet|socat|http|https|xh)\b/;
const CRITICAL_RM_TARGETS = new Set(['/', '/*', '~', '~/', '~/*', '$HOME', '${HOME}', '$HOME/', '*', '.', './', '..', '../', '/home', '/usr', '/etc', '/var', '/opt', '/bin', '/lib', 'C:\\', 'C:/']);
const PROTECTED_BRANCHES = /\b(main|master|production|prod|release)\b/;

function isOutside(target, cwd) {
  if (!target || target.startsWith('-')) return false;
  const expanded = target.replace(/^~(?=$|\/)/, os.homedir()).replace(/^\$HOME|^\$\{HOME\}/, os.homedir());
  const abs = path.resolve(cwd || process.cwd(), expanded);
  const rel = path.relative(cwd || process.cwd(), abs);
  return rel.startsWith('..') || path.isAbsolute(rel);
}

export function assessCommand(command, { cwd, config } = {}) {
  const results = [];
  const add = (decision, reason) => results.push({ decision, reason });

  for (const re of config?.allowCommands || []) {
    try {
      if (new RegExp(re).test(command)) return [];
    } catch {}
  }

  const lower = command.toLowerCase();

  // --- Comandos catastróficos (en cualquier parte del comando) ---
  if (/:\(\)\s*\{\s*:\|:&\s*\};\s*:/.test(command)) add('deny', 'Fork bomb detectada.');
  if (/\bmkfs(\.\w+)?\b/.test(command)) add('deny', 'mkfs formatea un disco completo.');
  if (/\bdd\b[^|;&]*\bof=\/dev\/(sd|nvme|disk|hd|xvd)/.test(command)) add('deny', 'dd escribiendo directo sobre un disco.');
  if (/>\s*\/dev\/(sd|nvme|disk)/.test(command)) add('deny', 'Escritura directa sobre un disco.');

  // --- Descargar y ejecutar código remoto ---
  if (/\b(curl|wget|iwr|invoke-webrequest)\b[^|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/i.test(command) || /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(python3?|node|perl|ruby)\b/.test(command)) {
    add('ask', 'Descarga un script de internet y lo ejecuta sin revisarlo (curl | sh).');
  }

  // --- Exfiltración de secrets: leer un archivo sensible + red en el mismo comando ---
  const mentionsSecretFile = tokenize(command).some((t) => isSecretFile(t.replace(/^@/, '')) || /\$\(cat\s+[^)]*\.env/.test(t));
  if (mentionsSecretFile && NETWORK.test(command)) {
    add('deny', 'Posible exfiltración: el comando toca un archivo con secrets y además usa la red.');
  }
  if (/\b(printenv|env)\b\s*(\||$)/.test(command.trim()) && NETWORK.test(command)) {
    add('deny', 'Posible exfiltración: envía las variables de entorno por la red.');
  }

  for (const seg of splitSegments(command)) {
    const t = stripPrefixes(tokenize(seg));
    if (!t.length) continue;
    const [cmd, ...args] = t;
    const base = path.basename(cmd);

    // --- Lectura de archivos de secrets ---
    if (READERS.has(base)) {
      const target = args.find((a) => !a.startsWith('-') && isSecretFile(a));
      if (target && !(config?.allowReadPaths || []).some((p) => target.includes(p))) {
        add('deny', `Intenta leer "${target}", que contiene secrets. Si el agente necesita saber qué variables existen, que lea el .env.example.`);
      }
    }
    if ((base === 'printenv' || base === 'env') && args.length === 0) {
      add('ask', 'Mostraría todas las variables de entorno (incluidas API keys) en el contexto del agente.');
    }
    if (base === 'export' && args.some((a) => /^-p$/.test(a))) {
      add('ask', 'Mostraría todas las variables de entorno.');
    }

    // --- Borrado ---
    if (base === 'rm' || base === 'rmdir' || base === 'del' || base === 'shred') {
      const recursive = args.some((a) => /^-[a-zA-Z]*[rR]/.test(a) || a === '--recursive');
      const targets = args.filter((a) => !a.startsWith('-'));
      const critical = targets.find((a) => CRITICAL_RM_TARGETS.has(a) || /^\/\w*\/?\*?$/.test(a) && a.split('/').filter(Boolean).length <= 1);
      if (recursive && critical) add('deny', `Borrado recursivo de "${critical}": podría destruir todo el proyecto o el sistema.`);
      else if (recursive && targets.some((a) => isOutside(a, cwd))) {
        add('ask', `Borrado recursivo fuera del proyecto: ${targets.filter((a) => isOutside(a, cwd)).join(', ')}`);
      }
      if (targets.some((a) => /(^|\/)\.git\/?$/.test(a))) add('ask', 'Borraría el historial de git (.git).');
    }
    if (base === 'find' && args.includes('-delete') && args[0] && (CRITICAL_RM_TARGETS.has(args[0]) || isOutside(args[0], cwd))) {
      add('ask', `find -delete sobre "${args[0]}".`);
    }

    // --- Git destructivo ---
    if (base === 'git') {
      const sub = args.find((a) => !a.startsWith('-'));
      const rest = args.slice(args.indexOf(sub) + 1);
      if (sub === 'push' && rest.some((a) => a === '--force' || a === '-f' || /^-[a-zA-Z]*f/.test(a) || a.startsWith('+') || a === '--force-with-lease' || a === '--mirror')) {
        if (rest.some((a) => PROTECTED_BRANCHES.test(a))) add('deny', 'git push --force sobre una rama protegida (main/master/production).');
        else add('ask', 'git push --force reescribe el historial remoto.');
      }
      if (sub === 'push' && rest.includes('--delete') && rest.some((a) => PROTECTED_BRANCHES.test(a))) add('deny', 'Borraría una rama protegida en el remoto.');
      if (sub === 'reset' && rest.includes('--hard')) add('ask', 'git reset --hard descarta cambios sin commitear.');
      if (sub === 'clean' && rest.some((a) => /^-[a-zA-Z]*f/.test(a))) add('ask', 'git clean -f borra archivos que no están en git (puede incluir tu .env).');
      if (sub === 'checkout' && rest.includes('--') && rest.includes('.')) add('ask', 'git checkout -- . descarta todos los cambios locales.');
      if (sub === 'restore' && rest.includes('.') && !rest.includes('--staged')) add('ask', 'git restore . descarta todos los cambios locales.');
      if (sub === 'filter-branch' || (sub === 'filter-repo')) add('ask', 'Reescritura masiva del historial de git.');
      if (sub === 'add' && rest.some((a) => isSecretFile(a))) add('deny', 'Agregaría un archivo con secrets al repositorio.');
      if (sub === 'config' && rest.some((a) => /credential\.helper/.test(a))) add('ask', 'Cambia cómo git guarda tus credenciales.');
    }

    // --- Permisos y privilegios ---
    if (base === 'chmod' && args.some((a) => /^(-R|--recursive)$/.test(a)) && args.some((a) => /^0?777$|^a\+rwx$/.test(a))) {
      add('ask', 'chmod -R 777 deja todo con permisos de escritura para cualquiera.');
    }
    if (tokenize(seg)[0] === 'sudo') add('ask', 'Ejecuta con privilegios de administrador (sudo).');

    // --- Infraestructura y bases de datos ---
    if (base === 'terraform' && args.includes('destroy')) add('ask', 'terraform destroy elimina infraestructura.');
    if (base === 'terraform' && args.includes('apply') && args.includes('-auto-approve')) add('ask', 'terraform apply sin revisión (-auto-approve).');
    if (base === 'kubectl' && args[0] === 'delete' && (args.some((a) => /^(ns|namespace|namespaces|pv|pvc|node|nodes|crd)$/.test(a)) || args.includes('--all') || args.includes('-A'))) {
      add('ask', 'kubectl delete masivo o de recursos críticos.');
    }
    if (base === 'helm' && args[0] === 'uninstall') add('ask', 'helm uninstall elimina un release.');
    if (base === 'docker' && args[0] === 'system' && args[1] === 'prune' && args.some((a) => a === '-a' || a === '--volumes')) add('ask', 'docker system prune borra imágenes y/o volúmenes (datos).');
    if (base === 'docker' && args[0] === 'volume' && (args[1] === 'rm' || args[1] === 'prune')) add('ask', 'Borra volúmenes de Docker (posibles datos de bases de datos).');
    if (base === 'supabase' && args[0] === 'db' && args[1] === 'reset') add('ask', 'supabase db reset borra todos los datos de la base local/linkeada.');
    if ((base === 'prisma' || args[0] === 'prisma') && (args.includes('--force-reset') || (args.includes('migrate') && args.includes('reset')))) {
      add('ask', 'Prisma reset borra la base de datos.');
    }
    if (['npm', 'pnpm', 'yarn'].includes(base) && args[0] === 'publish') add('ask', 'Publica un paquete al registro público.');
    if (base === 'vercel' && (args.includes('--prod') || args.includes('--production'))) add('ask', 'Deploy directo a producción.');
    if (base === 'vercel' && args[0] === 'env' && args[1] === 'pull') add('ask', 'Descarga las variables de entorno de producción a un archivo local.');
  }

  // SQL destructivo dentro de cualquier cliente (psql, mysql, supabase, sqlite3, prisma db execute)
  if (/\b(drop\s+(database|schema|table)|truncate\s+(table\s+)?\w)/i.test(lower) && /\b(psql|mysql|mariadb|sqlite3|supabase|prisma|mongosh|pgcli|duckdb)\b/.test(lower)) {
    add('ask', 'Ejecuta SQL destructivo (DROP/TRUNCATE).');
  }
  if (/\bdelete\s+from\s+\w+\s*(;|$|["'])/i.test(command) && /\b(psql|mysql|sqlite3|supabase)\b/i.test(lower)) {
    add('ask', 'DELETE sin WHERE: borraría toda la tabla.');
  }

  return results;
}
