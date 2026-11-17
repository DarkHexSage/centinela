#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHook } from '../src/hook.js';
import { runMcpServer } from '../src/mcp.js';
import { scanProject } from '../src/scan.js';
import { evaluate } from '../src/engine.js';
import { assessPackage } from '../src/rules/packages.js';
import { loadConfig, DEFAULT_CONFIG } from '../src/config.js';
import { readLog } from '../src/log.js';

const BIN = fileURLToPath(import.meta.url);
const [, , cmd, ...args] = process.argv;
const json = args.includes('--json');
const positional = args.filter((a) => !a.startsWith('--'));

const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`
};
const icon = { deny: c.red('✖ BLOQUEADO'), ask: c.yellow('▲ REVISAR'), allow: c.green('✔ OK') };

const HELP = `
${c.bold('🛡️  Centinela')} — guardrails de seguridad para agentes de código

Uso:
  centinela scan [ruta]              Audita un proyecto (secrets, .env, dependencias). Sale con código 1 si hay hallazgos graves (ideal para CI).
  centinela check <paquete> [--pypi] Verifica un paquete antes de instalarlo.
  centinela cmd "<comando>"          Evalúa un comando de shell.
  centinela log                      Últimas acciones bloqueadas o marcadas.
  centinela init                     Crea .centinela.json con la configuración por defecto.
  centinela init cursor              Instala el hook en Cursor (.cursor/hooks.json del proyecto).
  centinela init claude              Instala el hook en Claude Code (.claude/settings.json del proyecto).
  centinela hook                     (interno) Punto de entrada del hook.
  centinela mcp                      (interno) Inicia el servidor MCP por stdio.

Opciones: --json
`;

function printDecision(r) {
  console.log(`${icon[r.decision]}`);
  for (const reason of r.reasons) console.log(`  • ${reason}`);
}

function mergeJson(file, mutate) {
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {}
  mutate(data);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

async function main() {
  switch (cmd) {
    case 'hook':
      return runHook();
    case 'mcp':
      return runMcpServer();

    case 'scan': {
      const root = positional[0] || '.';
      if (!json) console.log(c.dim(`Escaneando ${path.resolve(root)} …`));
      const r = await scanProject(root, { checkDeps: !args.includes('--no-deps') });
      if (json) {
        console.log(JSON.stringify(r, null, 2));
      } else {
        if (!r.findings.length) console.log(c.green(`\n✔ Sin hallazgos. Revisé ${r.summary.dependenciesChecked} dependencias.`));
        for (const f of r.findings) {
          const sev = f.severity === 'high' ? c.red('ALTO ') : c.yellow('MEDIO');
          console.log(`${sev}  ${f.file}${f.line ? ':' + f.line : ''}\n       ${f.message}`);
        }
        if (r.findings.length) console.log(`\n${c.bold(`${r.summary.high} altos, ${r.summary.medium} medios`)} · ${r.summary.dependenciesChecked} dependencias revisadas`);
      }
      process.exit(r.summary.high > 0 ? 1 : 0);
    }

    case 'check': {
      const name = positional[0];
      if (!name) return console.log(HELP);
      const ecosystem = args.includes('--pypi') ? 'pypi' : 'npm';
      const r = await assessPackage({ name, ecosystem }, loadConfig());
      if (json) return console.log(JSON.stringify(r, null, 2));
      console.log(c.bold(`${name} (${ecosystem})`));
      printDecision(r);
      if (r.info?.createdAt) console.log(c.dim(`  creado: ${r.info.createdAt.slice(0, 10)} · versión: ${r.info.latestVersion}`));
      process.exit(r.decision === 'deny' ? 1 : 0);
    }

    case 'cmd': {
      const command = positional.join(' ');
      const r = await evaluate({ kind: 'shell', command, cwd: process.cwd() });
      if (json) return console.log(JSON.stringify(r, null, 2));
      console.log(c.bold(`$ ${command}`));
      printDecision(r);
      process.exit(r.decision === 'deny' ? 1 : 0);
    }

    case 'log': {
      const entries = readLog(Number(positional[0]) || 20);
      if (json) return console.log(JSON.stringify(entries, null, 2));
      if (!entries.length) return console.log('Sin registros todavía.');
      for (const e of entries) {
        console.log(`${c.dim(e.ts)} ${icon[e.decision] || e.decision} ${c.dim(e.host || '')}\n  ${e.target || ''}`);
        for (const r of e.reasons || []) console.log(`  • ${r}`);
      }
      return;
    }

    case 'init': {
      const target = positional[0];
      const hookCmd = `node "${BIN}" hook`;
      if (target === 'cursor') {
        mergeJson(path.join(process.cwd(), '.cursor', 'hooks.json'), (d) => {
          d.version = 1;
          d.hooks = d.hooks || {};
          for (const ev of ['beforeShellExecution', 'beforeReadFile']) {
            d.hooks[ev] = (d.hooks[ev] || []).filter((h) => !String(h.command).includes('centinela'));
            d.hooks[ev].push({ command: hookCmd, timeout: 25 });
          }
        });
        mergeJson(path.join(process.cwd(), '.cursor', 'mcp.json'), (d) => {
          d.mcpServers = d.mcpServers || {};
          d.mcpServers.centinela = { command: 'node', args: [BIN, 'mcp'] };
        });
        return console.log(c.green('✔ Centinela instalado en Cursor (.cursor/hooks.json y .cursor/mcp.json). Recargá la ventana.'));
      }
      if (target === 'claude') {
        mergeJson(path.join(process.cwd(), '.claude', 'settings.json'), (d) => {
          d.hooks = d.hooks || {};
          d.hooks.PreToolUse = (d.hooks.PreToolUse || []).filter((m) => !JSON.stringify(m).includes('centinela'));
          d.hooks.PreToolUse.push({
            matcher: 'Bash|Read|Grep|Write|Edit|MultiEdit|NotebookEdit',
            hooks: [{ type: 'command', command: hookCmd, timeout: 25 }]
          });
        });
        return console.log(c.green('✔ Hook de Centinela agregado a .claude/settings.json. Para la versión completa (hooks + MCP + skill) instalá el plugin: /plugin install centinela'));
      }
      const file = path.join(process.cwd(), '.centinela.json');
      if (fs.existsSync(file)) return console.log('.centinela.json ya existe.');
      fs.writeFileSync(file, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
      return console.log(c.green('✔ Creado .centinela.json'));
    }

    default:
      console.log(HELP);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(cmd === 'hook' ? 0 : 2);
});
