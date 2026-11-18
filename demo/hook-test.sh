#!/usr/bin/env bash
# Simula lo que Claude Code le manda al hook, sin abrir Claude Code.
# Si esto pasa y en Claude Code no se bloquea nada, el problema es la instalación del plugin, no Centinela.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pass=0; fail=0
J() { printf '%s' "$@"; }
KEY="$(J 'sk_' 'live_' '51DEMOdemoDEMOdemoDEMOdemo00')"

run() { # run <descripción> <deny|allow> <payload>
  local out
  out=$(printf '%s' "$3" | /bin/sh -c "node '$REPO/bin/centinela.js' hook")
  local got="allow"
  echo "$out" | grep -q '"permissionDecision":"deny"' && got="deny"
  echo "$out" | grep -q '"permissionDecision":"ask"' && got="deny"
  if [ "$got" = "$2" ]; then pass=$((pass+1)); echo "PASS  $1 → $got"; else fail=$((fail+1)); echo "FAIL  $1 → $got (se esperaba $2)"; fi
}

run "Bash: npm install de paquete inexistente" deny \
  '{"hook_event_name":"PreToolUse","tool_name":"Bash","cwd":"/tmp","tool_input":{"command":"npm install supabase-auth-helpers-pro"}}'
run "Bash: npm install zod" allow \
  '{"hook_event_name":"PreToolUse","tool_name":"Bash","cwd":"/tmp","tool_input":{"command":"npm install zod"}}'
run "Read: .env.local" deny \
  '{"hook_event_name":"PreToolUse","tool_name":"Read","cwd":"/tmp","tool_input":{"file_path":"/tmp/app/.env.local"}}'
run "Read: src/index.ts" allow \
  '{"hook_event_name":"PreToolUse","tool_name":"Read","cwd":"/tmp","tool_input":{"file_path":"/tmp/app/src/index.ts"}}'
run "Write: key de Stripe en el código" deny \
  "{\"hook_event_name\":\"PreToolUse\",\"tool_name\":\"Write\",\"cwd\":\"/tmp\",\"tool_input\":{\"file_path\":\"/tmp/app/src/pay.ts\",\"content\":\"const s = '$KEY'\"}}"
run "Bash: git push --force a main" deny \
  '{"hook_event_name":"PreToolUse","tool_name":"Bash","cwd":"/tmp","tool_input":{"command":"git push --force origin main"}}'

echo "Resultado: $pass correctos, $fail fallidos"
[ "$fail" -eq 0 ]
