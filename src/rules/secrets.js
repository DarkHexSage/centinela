// Detección de secrets en texto (código que el agente va a escribir, o archivos del proyecto).
// severity: high -> se bloquea; medium -> se pregunta.

const PATTERNS = [
  { id: 'aws-access-key', label: 'AWS Access Key', severity: 'high', re: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { id: 'github-token', label: 'GitHub token', severity: 'high', re: /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/g },
  { id: 'anthropic-key', label: 'Anthropic API key', severity: 'high', re: /\bsk-ant-[a-z0-9]{2,}-[A-Za-z0-9_-]{20,}/g },
  { id: 'openai-key', label: 'OpenAI API key', severity: 'high', re: /\bsk-(?!ant-)(proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}\b/g },
  { id: 'stripe-live', label: 'Stripe live secret key', severity: 'high', re: /\b(sk|rk)_live_[A-Za-z0-9]{20,}\b/g },
  { id: 'stripe-test', label: 'Stripe test secret key', severity: 'medium', re: /\bsk_test_[A-Za-z0-9]{20,}\b/g },
  { id: 'slack-token', label: 'Slack token', severity: 'high', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g },
  { id: 'sendgrid-key', label: 'SendGrid API key', severity: 'high', re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g },
  { id: 'twilio-key', label: 'Twilio API key', severity: 'medium', re: /\bSK[0-9a-f]{32}\b/g },
  { id: 'google-api-key', label: 'Google API key', severity: 'medium', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: 'private-key', label: 'Llave privada', severity: 'high', re: /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY-----/g },
  {
    id: 'db-url-password',
    label: 'URL de base de datos con contraseña',
    severity: 'high',
    re: /\b(postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqp):\/\/[^:\s/'"]+:([^@\s'"]+)@[^\s'"]+/g,
    validate: (m) => !isPlaceholder(m[2])
  },
  {
    id: 'jwt-service-role',
    label: 'JWT con rol service_role (Supabase)',
    severity: 'high',
    re: /\beyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g,
    validate: (m) => {
      try {
        const payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
        return payload.role === 'service_role';
      } catch {
        return false;
      }
    }
  },
  {
    id: 'generic-secret',
    label: 'Contraseña/secret hardcodeado',
    severity: 'medium',
    re: /\b([A-Za-z0-9_]*(?:password|passwd|secret|api_?key|access_?token|auth_?token|private_?key)[A-Za-z0-9_]*)\s*[:=]\s*["'`]([^"'`\s]{8,})["'`]/gi,
    validate: (m) => !isPlaceholder(m[2])
  }
];

// Variables que el framework manda al navegador: nunca deberían contener un secret.
const CLIENT_ENV_RE = /\b((?:NEXT_PUBLIC|VITE|EXPO_PUBLIC|REACT_APP|NUXT_PUBLIC|PUBLIC|GATSBY)_[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|STRIPE_SK|OPENAI|ANTHROPIC|ADMIN)[A-Z0-9_]*)\b/g;

const PLACEHOLDER_RE = /^(x+|\*+|\.+|your[-_].*|<.*>|\$\{.*\}|\{\{.*\}\}|changeme|change[-_]me|password|secret|example|test|dummy|placeholder|todo|redacted|process\.env.*|.*_here|none|null|undefined)$/i;

export function isPlaceholder(value) {
  if (!value) return true;
  return PLACEHOLDER_RE.test(value) || /^(.)\1+$/.test(value) || value.startsWith('$');
}

export function redact(value) {
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '…' + value.slice(-2);
}

/**
 * Busca secrets en un texto. Devuelve [{ id, label, severity, line, preview }]
 * El preview siempre va enmascarado: Centinela nunca muestra ni guarda el secret completo.
 */
export function scanText(text) {
  if (!text || typeof text !== 'string') return [];
  const findings = [];
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(text))) {
      if (p.validate && !p.validate(m)) continue;
      const line = text.slice(0, m.index).split('\n').length;
      findings.push({ id: p.id, label: p.label, severity: p.severity, line, preview: redact(m[0]) });
    }
  }
  CLIENT_ENV_RE.lastIndex = 0;
  let m;
  while ((m = CLIENT_ENV_RE.exec(text))) {
    const line = text.slice(0, m.index).split('\n').length;
    findings.push({
      id: 'client-exposed-secret',
      label: `Variable pública "${m[1]}" parece un secret (todo lo que empieza con ese prefijo se envía al navegador)`,
      severity: 'high',
      line,
      preview: m[1]
    });
  }
  // Un mismo hallazgo puede caer en dos patrones (p. ej. genérico + específico): quitamos duplicados por línea.
  const seen = new Set();
  return findings.filter((f) => {
    const k = `${f.line}:${f.id === 'generic-secret' ? 'g' : f.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).filter((f, _, all) => !(f.id === 'generic-secret' && all.some((o) => o !== f && o.line === f.line && o.id !== 'generic-secret')));
}

// Archivos que contienen secrets por naturaleza.
const SECRET_FILE_PATTERNS = [
  /(^|[\\/])\.env(\.(?!example$|sample$|template$|dist$|defaults$)[\w.-]+)?$/i,
  /(^|[\\/])\.dev\.vars$/i,
  /(^|[\\/])id_(rsa|dsa|ecdsa|ed25519)$/i,
  /\.(pem|key|p12|pfx|keystore|jks)$/i,
  /(^|[\\/])\.aws[\\/]credentials$/i,
  /(^|[\\/])\.ssh[\\/]/i,
  /(^|[\\/])\.npmrc$/i,
  /(^|[\\/])\.pypirc$/i,
  /(^|[\\/])\.netrc$/i,
  /(^|[\\/])\.docker[\\/]config\.json$/i,
  /(^|[\\/])\.kube[\\/]config$/i,
  /(^|[\\/])kubeconfig(\.ya?ml)?$/i,
  /(^|[\\/])(credentials|service[-_]?account[\w-]*|gcp[-_]key[\w-]*)\.json$/i,
  /(^|[\\/])secrets?\.(json|ya?ml|toml)$/i,
  /(^|[\\/])\.git-credentials$/i,
  /(^|[\\/])\.config[\\/]gh[\\/]hosts\.yml$/i
];

export function isSecretFile(filePath) {
  if (!filePath) return false;
  return SECRET_FILE_PATTERNS.some((re) => re.test(filePath));
}

export function isEnvFile(filePath) {
  return /(^|[\\/])\.env(\.[\w.-]+)?$/i.test(filePath || '') && !/\.(example|sample|template)$/i.test(filePath);
}
