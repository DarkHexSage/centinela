#!/usr/bin/env bash
# Prepara un entorno limpio para grabar el demo de Centinela.
# Uso: bash demo/setup-demo.sh [carpeta]   (por defecto: ~/centinela-demo)
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-$HOME/centinela-demo}"

if [ "$(id -u)" = "0" ]; then
  echo "Aviso: estás como root. Para el demo usá tu usuario normal (su - <usuario>)." >&2
fi
if ! /bin/sh -c 'command -v node' >/dev/null 2>&1; then
  echo "Error: /bin/sh no encuentra 'node'. Claude Code corre los hooks con /bin/sh." >&2
  echo "Solución (nvm): sudo ln -sf \"\$(command -v node)\" /usr/local/bin/node" >&2
  exit 1
fi

case "$TARGET" in
  "$REPO"|"$REPO"/*) echo "Error: la app de demo tiene que estar FUERA del repo de Centinela." >&2; exit 1 ;;
esac

echo "→ Borrando demo anterior y log de Centinela"
rm -rf "$TARGET"
rm -f "${CENTINELA_HOME:-$HOME/.centinela}/log.jsonl"

echo "→ Creando app vulnerable en $TARGET"
node "$REPO/demo/crear-app-vulnerable.js" "$TARGET" >/dev/null
cp "$REPO/demo/CLAUDE.demo.md" "$TARGET/CLAUDE.md"

echo "→ Inicializando git (rama main)"
cd "$TARGET"
git init -q -b main
git add -A
git -c user.name="demo" -c user.email="demo@example.com" commit -qm "app de demo"

cat <<MSG

Listo. Siguientes pasos:

  cd $TARGET
  claude

Dentro de Claude Code (solo la primera vez en esta carpeta):
  /plugin marketplace add $REPO
  /plugin install centinela@centinela        → elegí "local scope"
  /exit   y volvé a abrir: claude
  /mcp    → centinela debe aparecer conectado

Guion completo: $REPO/DEMO.md
MSG
