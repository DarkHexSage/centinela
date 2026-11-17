import { loadConfig } from './config.js';
import { assessCommand } from './rules/commands.js';
import { extractPackages, assessPackage } from './rules/packages.js';
import { scanText, isSecretFile, isEnvFile } from './rules/secrets.js';

const RANK = { allow: 0, ask: 1, deny: 2 };

function worst(a, b) {
  return RANK[b] > RANK[a] ? b : a;
}

/**
 * Evalúa una acción del agente.
 * action: { kind: 'shell'|'read'|'write', command?, filePath?, content? , cwd? }
 * Devuelve { decision: allow|ask|deny, reasons: string[], packages?: [] }
 */
export async function evaluate(action, config = loadConfig(action.cwd)) {
  let decision = 'allow';
  const reasons = [];
  const extra = {};

  if (action.kind === 'shell' && action.command) {
    for (const r of assessCommand(action.command, { cwd: action.cwd, config })) {
      decision = worst(decision, r.decision);
      reasons.push(r.reason);
    }
    const pkgs = extractPackages(action.command, action.cwd);
    if (pkgs.length) {
      const results = await Promise.all(pkgs.map((p) => assessPackage(p, config).then((r) => ({ ...p, ...r }))));
      extra.packages = results.map(({ name, ecosystem, decision, reasons }) => ({ name, ecosystem, decision, reasons }));
      for (const r of results) {
        decision = worst(decision, r.decision);
        reasons.push(...r.reasons);
      }
    }
  }

  if (action.kind === 'read' && action.filePath) {
    const allowed = (config.allowReadPaths || []).some((p) => action.filePath.includes(p));
    if (isSecretFile(action.filePath) && !allowed) {
      decision = worst(decision, 'deny');
      reasons.push(
        `Leer "${action.filePath}" metería tus secrets en el contexto del agente (y en los logs del proveedor). ` +
          'Si necesitás saber qué variables existen, leé el .env.example.'
      );
    }
  }

  if (action.kind === 'write' && typeof action.content === 'string') {
    // Escribir secrets en un .env es lo correcto; en cualquier otro archivo, no.
    const target = action.filePath || '';
    const findings = scanText(action.content).filter((f) => !(isEnvFile(target) && f.id !== 'client-exposed-secret'));
    extra.findings = findings;
    for (const f of findings) {
      decision = worst(decision, f.severity === 'high' ? 'deny' : 'ask');
      reasons.push(
        f.id === 'client-exposed-secret'
          ? `${f.label}, línea ${f.line}. Quitale el prefijo público y usala solo en código de servidor.`
          : `${f.label} en la línea ${f.line} (${f.preview}). Usá una variable de entorno en lugar de escribirlo en el código.`
      );
    }
  }

  // Modos
  if (config.mode === 'audit') decision = 'allow';
  if (config.mode === 'warn' && decision === 'deny') decision = 'ask';

  return { decision, reasons, ...extra };
}

/** Traduce el payload de Claude Code (PreToolUse) a una acción de Centinela. */
export function actionFromClaudeCode(payload) {
  const { tool_name: tool, tool_input: input = {}, cwd } = payload;
  switch (tool) {
    case 'Bash':
      return { kind: 'shell', command: input.command, cwd };
    case 'Read':
    case 'NotebookRead':
      return { kind: 'read', filePath: input.file_path || input.notebook_path, cwd };
    case 'Grep':
      return input.path ? { kind: 'read', filePath: input.path, cwd } : null;
    case 'Write':
      return { kind: 'write', filePath: input.file_path, content: input.content, cwd };
    case 'Edit':
      return { kind: 'write', filePath: input.file_path, content: input.new_string, cwd };
    case 'MultiEdit':
      return { kind: 'write', filePath: input.file_path, content: (input.edits || []).map((e) => e.new_string).join('\n'), cwd };
    case 'NotebookEdit':
      return { kind: 'write', filePath: input.notebook_path, content: input.new_source, cwd };
    default:
      return null;
  }
}

/** Traduce el payload de Cursor (beforeShellExecution / beforeReadFile). */
export function actionFromCursor(payload) {
  const cwd = payload.cwd || payload.workspace_roots?.[0];
  if (payload.hook_event_name === 'beforeShellExecution') return { kind: 'shell', command: payload.command, cwd };
  if (payload.hook_event_name === 'beforeReadFile') return { kind: 'read', filePath: payload.file_path, cwd };
  if (payload.hook_event_name === 'preToolUse' && payload.tool_name) return actionFromClaudeCode(payload);
  return null;
}
