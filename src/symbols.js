// Símbolos para la salida en terminal.
// La consola clásica de Windows (la que abre wsl.exe fuera de Windows Terminal) muestra "?"
// en lugar de ✔ ✖ ▲ y emojis. En ese caso usamos texto plano.
//   CENTINELA_ASCII=1  fuerza texto plano
//   CENTINELA_ASCII=0  fuerza símbolos
function detectAscii() {
  const forced = process.env.CENTINELA_ASCII;
  if (forced === '1' || forced === 'true') return true;
  if (forced === '0' || forced === 'false') return false;
  const env = process.env;
  const inWsl = Boolean(env.WSL_DISTRO_NAME || env.WSL_INTEROP);
  const modernTerminal = Boolean(env.WT_SESSION || env.TERM_PROGRAM || env.ALACRITTY_LOG || env.KITTY_WINDOW_ID || env.WEZTERM_PANE);
  if (inWsl && !modernTerminal) return true;
  if (process.platform === 'win32' && !modernTerminal) return true;
  return false;
}

export const ASCII = detectAscii();

export const sym = ASCII
  ? { ok: '[OK]', deny: '[X]', ask: '[!]', bullet: '-', shield: '#', agent: '>', ellipsis: '...' }
  : { ok: '✔', deny: '✖', ask: '▲', bullet: '•', shield: '🛡️', agent: '🤖', ellipsis: '…' };
