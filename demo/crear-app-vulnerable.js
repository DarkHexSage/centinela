#!/usr/bin/env node
// Crea demo/app-vulnerable: una app con errores de seguridad típicos para mostrar `centinela scan`.
// Se genera en el momento (y está en .gitignore) para que el repo no contenga keys falsas
// que GitHub bloquearía con push protection.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'app-vulnerable');
const j = (...p) => p.join('');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const serviceRole = `${j('ey', 'JhbGciOiJIUzI1NiJ9')}.${b64({ iss: 'supabase', ref: 'demo', role: 'service_role' })}.dEmOfIrMaNoReAlXyZ123456`;

const files = {
  'package.json': JSON.stringify(
    {
      name: 'app-vulnerable',
      private: true,
      dependencies: {
        next: '15.0.0',
        react: '19.0.0',
        '@supabase/supabase-js': '2.45.0',
        lodahs: '0.0.1-security',
        'supabase-auth-helpers-nextjs-pro': '1.0.0'
      }
    },
    null,
    2
  ),
  '.gitignore': 'node_modules\n',
  '.env.local': 'SUPABASE_URL=https://demo.supabase.co\n',
  '.env.example': 'NEXT_PUBLIC_SUPABASE_URL=\nNEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=\n',
  'src/lib/supabase.ts': `import { createClient } from '@supabase/supabase-js';\n\n// TODO: mover a variables de entorno\nexport const supabaseAdmin = createClient(\n  'https://demo.supabase.co',\n  '${serviceRole}'\n);\n`,
  'src/lib/payments.ts': `import Stripe from 'stripe';\n\nexport const stripe = new Stripe('${j('sk_', 'live_', '51DEMOdemoDEMOdemoDEMOdemo00')}');\nexport const DATABASE_URL = '${j('postgresql://postgres:', 'MiClaveSuperSecreta2026', '@db.demo.supabase.co:5432/postgres')}';\n`
};

for (const [rel, content] of Object.entries(files)) {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
console.log(`Listo: ${root}\nAhora corré: node bin/centinela.js scan demo/app-vulnerable`);
