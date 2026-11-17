---
name: centinela-audit
description: Auditoría de seguridad de un proyecto antes de publicarlo o deployarlo — secrets hardcodeados, .env sin ignorar, dependencias alucinadas o typosquatting, variables públicas con secrets. Usar cuando el usuario pida "revisá la seguridad", "¿está listo para producción?", "auditá el proyecto" o antes de un deploy.
---

# Auditoría con Centinela

1. Corré la herramienta MCP `scan_project` sobre la raíz del proyecto (o `node ${CLAUDE_PLUGIN_ROOT}/bin/centinela.js scan . --json` si el MCP no está disponible).
2. Agrupá los hallazgos por severidad. Para cada uno explicá en lenguaje simple:
   - **Qué** encontraste (archivo y línea, nunca el valor completo del secret).
   - **Por qué** es un riesgo real (qué podría hacer un atacante).
   - **El fix exacto**: mover el valor a una variable de entorno, agregar `.env` a `.gitignore`, renombrar una variable `NEXT_PUBLIC_*` que contiene un secret, reemplazar un paquete sospechoso por el legítimo.
3. Si un secret ya estuvo en el código o en git, decile al usuario que **lo rote** en el proveedor: borrarlo del archivo no alcanza porque queda en el historial.
4. Aplicá los fixes solo después de que el usuario los apruebe. No leas archivos `.env`: para saber qué variables existen, usá `.env.example`.
5. Terminá con un resumen corto: cuántos hallazgos altos/medios quedan y si el proyecto está listo para deployar.

Antes de instalar o recomendar cualquier dependencia que no conozcas con certeza, verificála con la herramienta `check_package`.
