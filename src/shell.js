// Tokenizador de shell sencillo: separa un comando en segmentos (&&, ||, ;, |, saltos de línea)
// y cada segmento en palabras, respetando comillas simples y dobles.

export function splitSegments(command) {
  const segments = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      cur += c;
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && i + 1 < command.length) cur += command[++i];
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      cur += c;
      continue;
    }
    if (c === '\\' && i + 1 < command.length) {
      cur += c + command[++i];
      continue;
    }
    const two = command.slice(i, i + 2);
    if (two === '&&' || two === '||') {
      segments.push(cur);
      cur = '';
      i++;
      continue;
    }
    if (c === ';' || c === '|' || c === '\n' || c === '&') {
      segments.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  segments.push(cur);
  return segments.map((s) => s.trim()).filter(Boolean);
}

export function tokenize(segment) {
  const tokens = [];
  let cur = '';
  let quote = null;
  let has = false;
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i];
    if (quote) {
      if (c === quote) quote = null;
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      has = true;
      continue;
    }
    if (c === '\\' && i + 1 < segment.length) {
      cur += segment[++i];
      has = true;
      continue;
    }
    if (/\s/.test(c)) {
      if (has || cur) tokens.push(cur);
      cur = '';
      has = false;
      continue;
    }
    cur += c;
    has = true;
  }
  if (has || cur) tokens.push(cur);
  return tokens;
}

/** Quita prefijos que no cambian el comando real: sudo, env VAR=x, time, nohup, etc. */
export function stripPrefixes(tokens) {
  let t = [...tokens];
  let changed = true;
  while (changed && t.length) {
    changed = false;
    if (['sudo', 'time', 'nohup', 'exec', 'command', 'nice'].includes(t[0])) {
      t.shift();
      while (t[0]?.startsWith('-')) t.shift();
      changed = true;
    } else if (t[0] === 'env') {
      t.shift();
      changed = true;
    } else if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t[0])) {
      t.shift();
      changed = true;
    }
  }
  return t;
}
