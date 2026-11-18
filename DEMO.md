# Cómo probar y grabar el demo de Centinela

Guía para dejar todo funcionando y grabar un video de unos 2 minutos. Los pasos están probados en Linux y en WSL (Kali/Ubuntu).

## 0. Requisitos (una sola vez)

| Qué | Cómo comprobarlo |
|---|---|
| Node 18 o superior, **visible para `/bin/sh`** | `/bin/sh -c 'node -v'` |
| Claude Code instalado **con tu usuario normal** (no root) | `claude --version` |
| Windows Terminal, si estás en WSL | Si ves `?` en vez de ✔ ✖, estás en la consola vieja |

Claude Code ejecuta los hooks con `/bin/sh`, que no carga nvm. Si `/bin/sh -c 'node -v'` falla:

```bash
sudo ln -sf "$(command -v node)" /usr/local/bin/node
```

## 1. Probar que Centinela funciona (2 min)

Desde la carpeta del repo:

```bash
npm test                  # 13 tests: el motor completo
npm run demo:checks       # cada regla, una por una, con PASS/FAIL
npm run demo:hook         # simula lo que Claude Code le manda al hook
```

Las tres tienen que terminar con **0 fallidos**. Si `demo:hook` pasa pero en Claude Code no se bloquea nada, el problema es la instalación del plugin, no Centinela.

## 2. Preparar el escenario (antes de cada toma)

```bash
npm run demo:setup        # crea ~/centinela-demo limpio y borra el log
cd ~/centinela-demo
claude
```

`demo:setup` crea una app Next.js con errores típicos (keys hardcodeadas, `.env.local` fuera de `.gitignore`, paquetes falsos) **fuera del repo**, con su propio git en la rama `main` y un `CLAUDE.md` que le dice al agente que deje las verificaciones a Centinela.

Como la carpeta se recrea, el plugin se instala de nuevo cada vez. Dentro de Claude Code:

```
/plugin marketplace add /ruta/a/centinela      (solo la primera vez)
/plugin install centinela@centinela            → "local scope"
/exit
```

Abrí `claude` otra vez y comprobá:

```
/hooks    → PreToolUse muestra centinela.js
/mcp      → centinela conectado (si dice ✘, entrá y elegí "Reconnect")
/clear
```

## 3. Grabar: 6 tomas, unos 2 minutos

| # | Qué mostrar | Qué hacer | Qué decir |
|---|---|---|---|
| 1 | Banner o logo (5 s) | — | "Los agentes de AI instalan paquetes que no existen, leen tus secrets y hacen push a main. Centinela lo frena antes de que pase." |
| 2 | Terminal (20 s) | `npm run demo:checks -- --grabar` | "Revisa cada paquete contra npm y PyPI, detecta nombres falsos y sabe qué comandos tocan tus secrets o destruyen tu trabajo." |
| 3 | Claude Code (30 s) | Prompt: **Install supabase-auth-helpers-pro for the login**. Después, `Ctrl+O` sobre la llamada a centinela. | "La AI quiso instalar un paquete que no existe. Centinela lo frenó y el agente pasó al paquete oficial." |
| 4 | Claude Code (30 s) | Prompt: **yes, do all of that**. Esperá el mensaje rojo al leer `.env.local`. | "Mientras trabajaba, intentó leer mi archivo de secrets. Bloqueado: tus keys nunca llegan al modelo." |
| 5 | Terminal (15 s) | `node bin/centinela.js log` | "Todo lo que bloqueó, con el motivo." |
| 6 | Terminal (20 s) | `node bin/centinela.js scan ~/centinela-demo; echo $?` | "El mismo motor en CI: encuentra lo que quedó y falla el pipeline antes del deploy. 100% local, cero dependencias. Claude Code, Cursor y cualquier cliente MCP." |

Cerrá con el logo y `/plugin install centinela`.

**Consejos de edición:** hacé zoom en cada "BLOQUEADO", cortá las esperas del agente y agregá subtítulos (muchos jueces ven sin sonido).

**Toma de respaldo:** si el agente se comporta distinto, `npm run demo` muestra la misma historia (9 acciones, 8 bloqueadas) igual cada vez.

## 4. Problemas comunes

| Síntoma | Causa y solución |
|---|---|
| `PreToolUse:Bash hook failed … node: not found` | `/bin/sh` no ve Node. Hacé el enlace del paso 0. |
| `/mcp` muestra `✘ plugin:centinela` | Falló antes (por ejemplo, sin Node) y Claude Code espera para reintentar. Entrá en `/mcp`, elegí centinela y **Reconnect**. |
| El agente revisa el paquete con `npm view` y nunca intenta instalar | Es Claude siendo cuidadoso. Asegurate de que el `CLAUDE.md` de la demo exista y de que el MCP esté conectado: así consulta a Centinela en lugar de revisar por su cuenta. |
| "New MCP server found in this project" al abrir Claude Code | Abriste Claude Code dentro del repo de Centinela. La demo va en `~/centinela-demo`. |
| Ves `?` en lugar de ✔ ✖ | Consola vieja de Windows. Usá Windows Terminal, o forzá texto plano con `CENTINELA_ASCII=1`. |
| El prompt dice `root` | Grabá con tu usuario normal: un demo de seguridad corriendo como root no se ve bien, y Claude Code limita algunas funciones como root. |
| "Allowed by auto mode" en cada comando | Normal: es el modo de permisos de Claude Code. Centinela igual decide antes y bloquea lo peligroso. |
