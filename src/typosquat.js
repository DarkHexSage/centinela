import { POPULAR_NPM, POPULAR_PYPI, POPULAR_NPM_SET, POPULAR_PYPI_SET, normalizePypi } from './popular.js';

// Distancia de Damerau-Levenshtein (versión "optimal string alignment"):
// cuenta inserciones, borrados, sustituciones y trasposiciones de letras vecinas.
export function damerau(a, b) {
  const al = a.length, bl = b.length;
  if (Math.abs(al - bl) > 3) return 99;
  const d = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) d[i][0] = i;
  for (let j = 0; j <= bl; j++) d[0][j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[al][bl];
}

const strip = (s) => s.replace(/[-_.]/g, '');

/**
 * Si `name` se parece sospechosamente a un paquete popular (sin ser él), devuelve ese paquete.
 */
export function findTyposquatTarget(name, ecosystem) {
  const isPy = ecosystem === 'pypi';
  const n = isPy ? normalizePypi(name) : name.toLowerCase();
  const set = isPy ? POPULAR_PYPI_SET : POPULAR_NPM_SET;
  if (set.has(n)) return null;
  const list = isPy ? POPULAR_PYPI.map(normalizePypi) : POPULAR_NPM;

  // El mismo nombre con o sin separadores (p. ej. "react-dom" vs "reactdom").
  for (const p of list) {
    if (strip(p) === strip(n)) return p;
  }

  // Paquete con scope que imita al original: "@react/dom", "@types-node".
  const bare = n.startsWith('@') ? n.split('/').pop() : n;

  for (const p of list) {
    const pb = p.startsWith('@') ? p.split('/').pop() : p;
    if (pb.length < 4) continue;
    const limit = pb.length >= 9 ? 2 : 1;
    const dist = damerau(bare, pb);
    if (dist > 0 && dist <= limit) return p;
  }
  return null;
}
