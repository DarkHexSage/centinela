# Reglas del proyecto

- Este proyecto usa el plugin de seguridad Centinela. Verifica cada paquete y cada comando antes de ejecutarlo.
- Cuando el usuario pida instalar un paquete, corré `npm install <paquete>` directamente: Centinela lo verifica.
- Si Centinela bloquea algo, explicale al usuario el motivo y sugerí la alternativa segura.
