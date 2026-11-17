// Servidor MCP sin dependencias (JSON-RPC 2.0 sobre stdio, mensajes separados por salto de línea).
// Así el plugin funciona recién clonado, sin `npm install`.
import readline from 'node:readline';
import path from 'node:path';
import { evaluate } from './engine.js';
import { assessPackage } from './rules/packages.js';
import { scanText } from './rules/secrets.js';
import { scanProject } from './scan.js';
import { loadConfig } from './config.js';
import { readLog } from './log.js';

const VERSION = '0.1.0';

const TOOLS = [
  {
    name: 'check_package',
    description:
      'Verifica si un paquete de npm o PyPI es seguro de instalar ANTES de instalarlo: que exista (no sea un nombre alucinado), que no sea typosquatting de uno popular, que no sea recién creado ni ejecute scripts sospechosos. Usalo siempre que vayas a sugerir o instalar una dependencia que no conocés con certeza.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre del paquete, p. ej. "express" o "@supabase/supabase-js"' },
        ecosystem: { type: 'string', enum: ['npm', 'pypi'], default: 'npm' }
      },
      required: ['name']
    }
  },
  {
    name: 'check_command',
    description:
      'Evalúa un comando de shell antes de ejecutarlo: comandos destructivos, lectura o exfiltración de secrets, curl | sh, git push --force, y paquetes sospechosos dentro de instalaciones.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        cwd: { type: 'string', description: 'Directorio del proyecto (opcional)' }
      },
      required: ['command']
    }
  },
  {
    name: 'scan_code',
    description: 'Busca secrets hardcodeados en un fragmento de código (API keys, tokens, contraseñas, URLs de base de datos, JWT service_role, variables públicas con secrets).',
    inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] }
  },
  {
    name: 'scan_project',
    description: 'Auditoría completa de un proyecto: secrets en el código, archivos .env fuera de .gitignore y dependencias sospechosas en package.json / requirements.txt.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Ruta del proyecto (por defecto, el directorio actual)' },
        checkDeps: { type: 'boolean', default: true }
      }
    }
  },
  {
    name: 'recent_blocks',
    description: 'Muestra las últimas acciones que Centinela bloqueó o marcó, con el motivo.',
    inputSchema: { type: 'object', properties: { limit: { type: 'number', default: 10 } } }
  }
];

async function callTool(name, args = {}) {
  switch (name) {
    case 'check_package': {
      const ecosystem = args.ecosystem === 'pypi' ? 'pypi' : 'npm';
      const r = await assessPackage({ name: args.name, ecosystem }, loadConfig());
      return { verdict: r.decision === 'allow' ? 'seguro' : r.decision === 'ask' ? 'revisar' : 'peligroso', ...r };
    }
    case 'check_command': {
      const r = await evaluate({ kind: 'shell', command: args.command, cwd: args.cwd || process.cwd() });
      return r;
    }
    case 'scan_code':
      return { findings: scanText(args.code) };
    case 'scan_project':
      return scanProject(path.resolve(args.path || process.cwd()), { checkDeps: args.checkDeps !== false });
    case 'recent_blocks':
      return { entries: readLog(args.limit || 10) };
    default:
      throw Object.assign(new Error(`Herramienta desconocida: ${name}`), { code: -32602 });
  }
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

export function runMcpServer() {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
    const { id, method, params } = msg;
    if (id === undefined) return; // notificación (p. ej. notifications/initialized)

    try {
      if (method === 'initialize') {
        return send({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: params?.protocolVersion || '2025-06-18',
            capabilities: { tools: {} },
            serverInfo: { name: 'centinela', version: VERSION },
            instructions:
              'Centinela protege al usuario de dependencias maliciosas o alucinadas y de filtrar secrets. Antes de instalar o recomendar un paquete que no conocés con certeza, llamá check_package.'
          }
        });
      }
      if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
      if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      if (method === 'tools/call') {
        const out = await callTool(params?.name, params?.arguments);
        return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] } });
      }
      if (method === 'resources/list') return send({ jsonrpc: '2.0', id, result: { resources: [] } });
      if (method === 'prompts/list') return send({ jsonrpc: '2.0', id, result: { prompts: [] } });
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Método no soportado: ${method}` } });
    } catch (err) {
      if (err.code === -32602) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: err.message } });
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true } });
    }
  });
}
