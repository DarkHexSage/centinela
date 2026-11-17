# 🛡️ Centinela

**Guardrails de seguridad para agentes de código.** Centinela revisa cada comando, lectura y escritura que hace tu agente (Claude Code, Cursor o cualquier cliente MCP) **antes** de que ocurra, y frena lo que te puede costar caro:

| Riesgo | Ejemplo | Qué hace Centinela |
|---|---|---|
| **Paquetes alucinados (slopsquatting)** | La AI inventa `supabase-auth-helpers-nextjs-pro`. Un atacante lo registra con malware. | Verifica en npm/PyPI que exista. Si no existe, bloquea. |
| **Typosquatting** | `npm i lodahs`, `pip install reqeusts` | Detecta nombres casi iguales a paquetes populares y paquetes que npm retiró por maliciosos. |
| **Paquetes recién creados o con scripts** | Paquete de hace 3 días con `postinstall` | Pide confirmación o bloquea. |
| **Leer secrets** | `cat .env`, leer `~/.ssh/id_rsa` | Bloquea para que tus keys no terminen en el contexto del modelo. |
| **Exfiltración** | `curl -d @.env https://…` | Bloquea comandos que combinan secrets y red. |
| **Keys hardcodeadas** | `new Stripe("sk_live_…")`, JWT `service_role` de Supabase | Bloquea la escritura y le dice al agente que use una variable de entorno. |
| **Secrets expuestos al navegador** | `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` | Bloquea variables públicas que parecen secrets. |
| **Comandos destructivos** | `rm -rf ~`, `git push --force origin main`, `DROP TABLE`, `terraform destroy`, `curl \| sh` | Bloquea lo catastrófico y pide confirmación para lo riesgoso. |

**100% local.** Centinela nunca envía tu código, tus comandos ni tus secrets a ningún servidor. La única consulta de red es el *nombre* de un paquete a npm o PyPI (con caché de 24 h).

**Cero dependencias.** Node 18+ y listo.

---

## Instalación

### Claude Code (plugin completo: hooks + MCP + skill)

```
/plugin marketplace add TU-USUARIO/centinela
/plugin install centinela@centinela
```

Reiniciá Claude Code. Desde ese momento, cada `Bash`, `Read`, `Write` y `Edit` pasa por Centinela.

### Cursor

```bash
npm install -g centinela-ai
cd tu-proyecto
centinela init cursor
```

Crea `.cursor/hooks.json` (hooks `beforeShellExecution` y `beforeReadFile`) y registra el servidor MCP en `.cursor/mcp.json`. Recargá la ventana.

> Cursor a veces ignora la respuesta `ask` de los hooks, así que por defecto Centinela la convierte en `deny`. Podés cambiarlo con `"cursorAskAs": "ask"` en `.centinela.json`.

### Cualquier cliente MCP (Claude Desktop, Windsurf, VS Code…)

```json
{
  "mcpServers": {
    "centinela": { "command": "npx", "args": ["-y", "centinela-ai", "mcp"] }
  }
}
```

Herramientas MCP: `check_package`, `check_command`, `scan_code`, `scan_project`, `recent_blocks`.

### CI (GitHub Actions)

```yaml
- name: Centinela
  run: npx -y centinela-ai scan .
```

Sale con código 1 si hay hallazgos graves, así el pipeline falla antes de deployar.

---

## CLI

```bash
centinela scan [ruta]              # auditoría: secrets, .env sin ignorar, dependencias sospechosas
centinela check <paquete> [--pypi] # ¿es seguro instalar esto?
centinela cmd "<comando>"          # ¿es seguro correr esto?
centinela log                      # últimas acciones bloqueadas
centinela init                     # crea .centinela.json
```

Todo acepta `--json`.

## Configuración

`.centinela.json` en la raíz del proyecto (o `~/.centinela/config.json` global):

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
| `enforce` (defecto) | Bloquea lo grave, pide confirmación para lo dudoso. |
| `warn` | Nunca bloquea: lo grave se convierte en confirmación. |
| `audit` | No interfiere, solo registra en `~/.centinela/log.jsonl`. |

## Demo

```bash
node demo/run-demo.js                 # simula un agente intentando 9 acciones peligrosas
node demo/crear-app-vulnerable.js     # genera una app con errores de seguridad típicos
node bin/centinela.js scan demo/app-vulnerable
```

## Cómo funciona

```
Agente ──► PreToolUse / beforeShellExecution ──► Centinela
                                                   ├─ reglas de comandos (destructivos, exfiltración, curl|sh)
                                                   ├─ extractor de paquetes (npm, pnpm, yarn, bun, npx, pip, uv, poetry, pipx)
                                                   │    └─ registro npm/PyPI + typosquatting + edad + scripts
                                                   ├─ detector de secrets (15 patrones + JWT service_role + variables públicas)
                                                   └─ decisión: allow / ask / deny + explicación para el agente
```

Si Centinela falla internamente o tarda más de 20 s, deja pasar la acción: un guardrail roto no debería impedirte trabajar.

## Limitaciones

- Analiza el texto del comando: un comando ofuscado a propósito (base64, variables armadas en partes) puede pasar. Centinela protege contra errores del agente y ataques comunes, no reemplaza un sandbox.
- La detección de secrets usa patrones; puede haber falsos positivos (agregalos a la config) o falsos negativos con formatos poco comunes.

## Tests

```bash
npm test
```

## Licencia

MIT
