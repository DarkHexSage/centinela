<p align="center">
  <img src="landing/centinela-logo.png" width="96" alt="Centinela">
</p>

<h1 align="center">Centinela</h1>

<p align="center">
  <strong>Guardrails de seguridad para agentes de código.</strong><br>
  Revisa cada comando, lectura y escritura de tu agente de AI <em>antes</em> de que ocurra.<br>
  Claude Code · Cursor · cualquier cliente MCP · CI
</p>

<p align="center">
  <img alt="tests" src="https://img.shields.io/badge/tests-15%20passing-3ddc97">
  <img alt="dependencias" src="https://img.shields.io/badge/dependencias-0-3ddc97">
  <img alt="node" src="https://img.shields.io/badge/node-%E2%89%A518-0e1726">
  <img alt="licencia" src="https://img.shields.io/badge/licencia-MIT-0e1726">
</p>

---

## El problema

Los agentes de código ya no solo sugieren: **ejecutan**. Instalan paquetes, leen archivos, escriben código y hacen push. Y cometen errores que un humano no cometería:

- **Inventan paquetes.** La AI recomienda `supabase-auth-helpers-pro`, que no existe. Si un atacante registra ese nombre (*slopsquatting*), el próximo `npm install` ejecuta su código en tu máquina.
- **Leen tus secrets.** Para "entender la configuración", el agente hace `cat .env.local` y tus API keys terminan en el contexto del modelo, en logs y en el historial.
- **Escriben keys en el código.** El cliente de Supabase con la `service_role` pegada, o un `sk_live_` de Stripe en un archivo que se commitea.
- **Rompen cosas.** `git push --force` a main, `rm -rf`, `DROP TABLE`, `terraform destroy`.

Que el agente sea cuidadoso a veces no alcanza. **Centinela no depende de que el agente sea cuidadoso:** revisa cada acción, cada vez.

## Cómo se ve

El agente intenta leer tus secrets y Centinela lo frena:

```
● Bash(cat .env.local)
  ⎿  Error: PreToolUse:Bash hook error: 🛡️ Centinela bloqueó esta acción:
     • Intenta leer ".env.local", que contiene secrets. Si el agente necesita
       saber qué variables existen, que lea el .env.example.
```

El agente recibe la explicación y sigue por el camino seguro. En las pruebas, después del bloqueo, el propio agente lo reportó así:

> *"Update .env.local to the new variable names. Centinela didn't let me read it."*

Y con un paquete inventado:

```
$ centinela check supabase-auth-helpers-pro
✖ BLOQUEADO
  • "supabase-auth-helpers-pro" NO existe en npm. Probablemente es un nombre
    alucinado por la AI. Si alguien lo registra después ("slopsquatting"),
    instalarlo ejecutaría su código.
```

🎬 **Video del demo:** [TU-ENLACE-AL-VIDEO]

## Inicio rápido (Claude Code)

```
/plugin marketplace add DarkHexSage/centinela
/plugin install centinela@centinela
```

Reiniciá Claude Code. Listo: desde ese momento, cada `Bash`, `Read`, `Grep`, `Write` y `Edit` del agente pasa por Centinela.

Para comprobarlo: `/hooks` muestra el hook de Centinela en **PreToolUse**, y `/mcp` muestra el servidor `centinela` conectado.

> **Requisito:** Node 18 o superior, visible para `/bin/sh` (Claude Code ejecuta los hooks con `/bin/sh`). Si usás nvm, mirá [Problemas comunes](#problemas-comunes).

---

## Qué detecta

### Dependencias

| Riesgo | Ejemplo | Decisión |
|---|---|---|
| Paquete que no existe (alucinado) | `npm i supabase-auth-helpers-pro` | ✖ Bloquea, y sugiere el nombre parecido si lo hay |
| Paquete que npm retiró por malicioso | `npm i lodahs` (versión `0.0.1-security`) | ✖ Bloquea y sugiere `lodash` |
| Typosquatting de un paquete popular | `pip install reqeusts`, `npm i expresss` | ✖ Bloquea si es nuevo; ▲ pide confirmación si no |
| Paquete recién publicado | Creado hace menos de 30 días | ▲ Pide confirmación |
| Paquete casi sin uso | Menos de 100 descargas por semana | ▲ Pide confirmación |
| Scripts de instalación sospechosos | `postinstall` en un paquete nuevo o con nombre parecido a otro | ✖ Bloquea |

Funciona con `npm`, `pnpm`, `yarn`, `bun`, `npx`, `bunx`, `pip`, `python -m pip`, `uv`, `poetry`, `pipx` y archivos `requirements.txt`. `npx tsc`, `npx next` y los comandos ya instalados en el proyecto se reconocen y no generan falsos positivos.

### Secrets

| Riesgo | Ejemplo | Decisión |
|---|---|---|
| Leer archivos con secrets | `cat .env.local`, `head ~/.ssh/id_rsa`, `cat .env*`, leer `credentials.json` | ✖ Bloquea, y sugiere leer `.env.example` |
| Exfiltración | `curl -d @.env https://…`, `printenv \| curl …` | ✖ Bloquea |
| Keys en el código | `new Stripe("sk_live_…")`, URL de Postgres con contraseña | ✖ Bloquea la escritura |
| JWT `service_role` de Supabase | El agente pega la service role en un cliente | ✖ Bloquea (decodifica el JWT y revisa el rol; la `anon` key pública pasa) |
| Secrets expuestos al navegador | `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`, `VITE_*_SECRET` | ✖ Bloquea |
| Secrets en git | `git add .env` | ✖ Bloquea |

Detecta 14 tipos de credenciales: AWS, GitHub, OpenAI, Anthropic, Stripe (live y test), Slack, SendGrid, Twilio, Google, llaves privadas, URLs de base de datos, JWT `service_role` y contraseñas genéricas. Escribir secrets **dentro** de un `.env` está permitido: ahí es donde deben estar.

### Comandos destructivos

| Riesgo | Ejemplo | Decisión |
|---|---|---|
| Borrado catastrófico | `rm -rf /`, `rm -rf ~`, fork bombs, `mkfs`, `dd` sobre un disco | ✖ Bloquea |
| Historial de git | `git push --force` a main/master/production | ✖ Bloquea |
| | `git push --force` a otra rama, `git reset --hard`, `git clean -f` | ▲ Pide confirmación |
| Código remoto sin revisar | `curl … \| sh` | ▲ Pide confirmación |
| Bases de datos e infraestructura | `DROP TABLE`, `DELETE` sin `WHERE`, `supabase db reset`, `terraform destroy`, `kubectl delete ns` | ▲ Pide confirmación |
| Publicar o deployar | `npm publish`, `vercel --prod` | ▲ Pide confirmación |

Lo normal pasa sin fricción: `npm install zod`, `rm -rf node_modules`, `git push origin main`.

---

## Instalación

### Claude Code: plugin completo

```
/plugin marketplace add DarkHexSage/centinela
/plugin install centinela@centinela
```

El plugin instala tres piezas:

| Pieza | Qué hace |
|---|---|
| **Hooks** (`PreToolUse`) | Revisan cada acción y la permiten, piden confirmación o la bloquean. Es la capa que no depende del agente. |
| **Servidor MCP** | Le da al agente herramientas para consultar a Centinela *antes* de actuar, como `check_package`. |
| **Skill `centinela-audit`** | Auditoría de seguridad del proyecto antes de un deploy, con explicación y fix para cada hallazgo. |

Si solo querés el hook en un proyecto, sin plugin: `centinela init claude`.

### Cursor

```bash
npm install -g github:DarkHexSage/centinela
cd tu-proyecto
centinela init cursor
```

Crea `.cursor/hooks.json` (hooks `beforeShellExecution` y `beforeReadFile`) y registra el servidor MCP en `.cursor/mcp.json`. Recargá la ventana.

> Cursor a veces ignora la respuesta `ask` de los hooks, así que Centinela la convierte en `deny` por defecto. Se cambia con `"cursorAskAs": "ask"` en `.centinela.json`.

### Cualquier cliente MCP (Claude Desktop, Windsurf, VS Code…)

```json
{
  "mcpServers": {
    "centinela": { "command": "npx", "args": ["-y", "github:DarkHexSage/centinela", "mcp"] }
  }
}
```

| Herramienta MCP | Para qué |
|---|---|
| `check_package` | ¿Es seguro instalar este paquete de npm o PyPI? |
| `check_command` | ¿Es seguro correr este comando? |
| `scan_code` | Busca secrets en un fragmento de código |
| `scan_project` | Auditoría completa de un proyecto |
| `recent_blocks` | Últimas acciones bloqueadas, con el motivo |

### CI (GitHub Actions)

```yaml
name: Seguridad
on: [push, pull_request]
jobs:
  centinela:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npx -y github:DarkHexSage/centinela scan .
```

Sale con código `1` si hay hallazgos graves, así el pipeline falla antes del deploy.

---

## CLI

```bash
centinela scan [ruta]              # auditoría: secrets, .env fuera de .gitignore, dependencias sospechosas
centinela check <paquete> [--pypi] # ¿es seguro instalar esto?
centinela cmd "<comando>"          # ¿es seguro correr esto?
centinela log [n]                  # últimas acciones bloqueadas o marcadas
centinela init                     # crea .centinela.json
centinela init cursor              # instala el hook y el MCP en Cursor
centinela init claude              # instala solo el hook en .claude/settings.json
```

Todos aceptan `--json`. Sin instalar nada: `node bin/centinela.js <comando>` desde el repo.

Ejemplo de `scan`:

```
$ centinela scan ./mi-app
ALTO   .env.local
       .env.local no está en .gitignore: tus secrets terminarían en el repositorio.
ALTO   src/lib/payments.ts:3
       Stripe live secret key (sk_l…00)
ALTO   src/lib/supabase.ts:6
       JWT con rol service_role (Supabase) (eyJh…56)
ALTO   package.json
       npm retiró "lodahs" por contener código malicioso. ¿Quisiste decir "lodash"?

4 altos, 0 medios · 5 dependencias revisadas
```

---

## Cómo funciona

```
              Agente (Claude Code, Cursor…)
                          │
          quiere ejecutar, leer o escribir algo
                          │
                          ▼
     ┌──────── Hook PreToolUse / beforeShellExecution ────────┐
     │                                                        │
     │  Centinela                                             │
     │   ├─ Reglas de comandos ── destructivos, exfiltración, │
     │   │                        curl | sh, git, SQL, infra  │
     │   ├─ Extractor de paquetes ── npm/pnpm/yarn/bun/npx,   │
     │   │      │                    pip/uv/poetry/pipx       │
     │   │      └─ Registro npm/PyPI: existe, retirado,        │
     │   │         typosquatting, edad, descargas, scripts    │
     │   └─ Detector de secrets ── 14 tipos, JWT, variables   │
     │                             públicas, comodines        │
     │                                                        │
     └──────── decisión: permitir / confirmar / bloquear ─────┘
                          │
             + explicación para que el agente
               se corrija solo
```

- **Paquetes:** consulta el registro de npm o PyPI, detecta nombres parecidos a 365 paquetes populares de npm y PyPI (distancia de Damerau-Levenshtein y variantes sin guiones) y reconoce los paquetes que npm reemplazó por `0.0.1-security`.
- **Secrets:** el valor nunca se muestra ni se guarda completo. Los reportes y el log usan una vista enmascarada (`sk_l…00`).
- **Comodines:** `cat .env*`, `head ~/.ssh/id_*` o `cat .env.{local,production}` se evalúan como lo haría la shell, contra los archivos reales de la carpeta.
- **Si Centinela falla** internamente o tarda más de 20 segundos, deja pasar la acción: un guardrail roto no debería impedirte trabajar.

## Privacidad

**100% local.** Centinela nunca envía tu código, tus comandos ni tus secrets a ningún servidor. La única consulta de red es el **nombre** de un paquete al registro de npm o PyPI, con caché de 24 horas. El log (`~/.centinela/log.jsonl`) solo guarda qué se bloqueó y por qué, nunca el valor de un secret.

## Configuración

`.centinela.json` en la raíz del proyecto, o `~/.centinela/config.json` para todos tus proyectos:

```json
{
  "mode": "enforce",
  "minPackageAgeDays": 30,
  "minWeeklyDownloads": 100,
  "offline": "allow",
  "allowPackages": ["mi-paquete-interno"],
  "allowCommands": ["^git push --force-with-lease origin feature/"],
  "allowReadPaths": [".env.test"]
}
```

| Modo | Comportamiento |
|---|---|
| `enforce` (por defecto) | Bloquea lo grave y pide confirmación para lo dudoso. |
| `warn` | Nunca bloquea: lo grave se convierte en confirmación. |
| `audit` | No interfiere, solo registra en el log. Útil para medir antes de activar. |

| Variable de entorno | Para qué |
|---|---|
| `CENTINELA_HOME` | Carpeta del log, la caché y la config global (por defecto `~/.centinela`) |
| `CENTINELA_ASCII=1` | Fuerza salida en texto plano (`[BLOQUEADO]`) para consolas que no muestran ✔ ✖ |

---

## Probado

| Prueba | Comando | Resultado |
|---|---|---|
| Suite completa (reglas, registro real de npm/PyPI, motor, adaptadores) | `npm test` | 15 tests |
| Cada regla, una por una | `npm run demo:checks` | 9/9 |
| Simulación de lo que Claude Code le manda al hook | `npm run demo:hook` | 6/6 |
| Agente real en Claude Code, en Linux y WSL | [DEMO.md](DEMO.md) | Bloqueó el paquete inventado y la lectura de `.env.local` |

### Probalo vos

```bash
git clone https://github.com/DarkHexSage/centinela && cd centinela
npm test
npm run demo           # un agente simulado intenta 9 acciones peligrosas
npm run demo:setup     # crea ~/centinela-demo: una app con errores típicos, lista para Claude Code
```

La guía paso a paso para probarlo con un agente real y grabar el demo está en [DEMO.md](DEMO.md).

## Problemas comunes

| Síntoma | Solución |
|---|---|
| `PreToolUse:Bash hook failed … node: not found` | `/bin/sh` no encuentra Node (pasa con nvm). Ejecutá `sudo ln -sf "$(command -v node)" /usr/local/bin/node` |
| `/mcp` muestra `✘ plugin:centinela` | Falló antes de que Node estuviera disponible. Entrá en `/mcp`, elegí centinela y **Reconnect** |
| Ves `?` en lugar de ✔ ✖ | Consola vieja de Windows. Usá Windows Terminal, o `CENTINELA_ASCII=1` |
| Algo legítimo queda bloqueado | Agregalo a `allowPackages`, `allowCommands` o `allowReadPaths` en `.centinela.json` |

## Limitaciones

- Analiza el texto de cada acción. Un comando ofuscado a propósito (base64, variables armadas por partes, un script que instala por dentro) puede pasar. Centinela protege contra los errores del agente y los ataques comunes; no reemplaza un sandbox.
- La detección de secrets usa patrones: puede haber falsos positivos (se agregan a la config) o formatos poco comunes que no reconozca.
- La edad y las descargas de un paquete son señales, no pruebas. Un paquete viejo y popular también puede ser comprometido.

## Estructura

```
bin/centinela.js         CLI: scan, check, cmd, log, init, hook, mcp
src/engine.js            Motor de decisión (permitir / confirmar / bloquear)
src/rules/               Reglas de comandos, paquetes y secrets
src/registry.js          Consultas a npm y PyPI con caché
src/mcp.js               Servidor MCP sin dependencias
src/hook.js              Adaptador para Claude Code y Cursor
hooks/  .mcp.json        Configuración del plugin de Claude Code
skills/centinela-audit/  Skill de auditoría
demo/                    Scripts de demostración y prueba
test/                    Tests
```

## Licencia

MIT. Hecho en Costa Rica por [DarkHexSage](https://github.com/DarkHexSage) · SecureDev.
