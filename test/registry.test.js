// Pruebas contra los registros reales. Si no hay internet, se saltan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { assessPackage } from '../src/rules/packages.js';
import { lookupPackage } from '../src/registry.js';
import { DEFAULT_CONFIG } from '../src/config.js';

process.env.CENTINELA_HOME = path.join(os.tmpdir(), `centinela-test-${process.pid}`);

const online = await lookupPackage('left-pad', 'npm', { useCache: false }).then((r) => !r.offline);

test('npm: un paquete inventado se bloquea', { skip: !online && 'sin internet' }, async () => {
  const r = await assessPackage({ name: 'nextjs-supabase-auth-shield-zz91', ecosystem: 'npm' }, DEFAULT_CONFIG);
  assert.equal(r.decision, 'deny');
  assert.match(r.reasons[0], /NO existe/);
});

test('pypi: un nombre alucinado se bloquea y sugiere el correcto', { skip: !online && 'sin internet' }, async () => {
  const r = await assessPackage({ name: 'reqeusts', ecosystem: 'pypi' }, DEFAULT_CONFIG);
  assert.equal(r.decision, 'deny');
  assert.match(r.reasons[0], /requests/);
});

test('npm: paquete establecido y no popular pasa', { skip: !online && 'sin internet' }, async () => {
  const r = await assessPackage({ name: 'left-pad', ecosystem: 'npm' }, DEFAULT_CONFIG);
  assert.notEqual(r.decision, 'deny');
});
