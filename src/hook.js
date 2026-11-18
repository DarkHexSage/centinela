import { evaluate, actionFromClaudeCode, actionFromCursor } from './engine.js';
import { loadConfig } from './config.js';
import { logDecision } from './log.js';
import { sym } from './symbols.js';

const CURSOR_EVENTS = new Set(['beforeShellExecution', 'beforeReadFile', 'preToolUse']);

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
  });
}

function formatReason(decision, reasons) {
  const title = decision === 'deny' ? `${sym.shield} Centinela bloqueó esta acción:`.trim() : `${sym.shield} Centinela pide confirmación:`.trim();
  return [title, ...reasons.map((r) => `${sym.bullet} ${r}`)].join('\n');
}

/**
 * Punto de entrada del hook. Funciona con Claude Code (PreToolUse) y con Cursor
 * (beforeShellExecution / beforeReadFile). Si algo falla internamente, deja pasar la acción:
 * un guardrail roto no debe impedirte trabajar.
 */
export async function runHook() {
  const raw = await readStdin();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const isCursor = CURSOR_EVENTS.has(payload.hook_event_name) && payload.hook_event_name !== 'PreToolUse';
  const action = isCursor ? actionFromCursor(payload) : actionFromClaudeCode(payload);
  if (!action) {
    if (isCursor) process.stdout.write(JSON.stringify({ permission: 'allow' }));
    process.exit(0);
  }

  const config = loadConfig(action.cwd);
  let result;
  try {
    result = await Promise.race([
      evaluate(action, config),
      new Promise((resolve) => setTimeout(() => resolve({ decision: 'allow', reasons: [], timeout: true }), 20000))
    ]);
  } catch (err) {
    logDecision({ host: isCursor ? 'cursor' : 'claude-code', error: String(err) });
    if (isCursor) process.stdout.write(JSON.stringify({ permission: 'allow' }));
    process.exit(0);
  }

  if (result.decision !== 'allow' || result.reasons.length) {
    logDecision({
      host: isCursor ? 'cursor' : 'claude-code',
      cwd: action.cwd,
      kind: action.kind,
      target: action.kind === 'shell' ? action.command?.slice(0, 300) : action.filePath,
      decision: result.decision,
      reasons: result.reasons,
      mode: config.mode
    });
  }

  if (isCursor) {
    let permission = result.decision;
    if (permission === 'ask') permission = config.cursorAskAs || 'deny';
    const msg = result.reasons.length ? formatReason(result.decision, result.reasons) : undefined;
    process.stdout.write(JSON.stringify({ permission, user_message: msg, agent_message: msg }));
    process.exit(0);
  }

  if (result.decision === 'allow') process.exit(0);

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: result.decision,
        permissionDecisionReason: formatReason(result.decision, result.reasons)
      }
    })
  );
  process.exit(0);
}
