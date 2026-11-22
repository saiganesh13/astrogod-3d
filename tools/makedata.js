// Builds src/sky-data.js from d3-celestial data files (stars to mag 6, figures, names, boundaries).
// Usage: node tools/makedata.js <dir with d3-celestial data/*.json> <out sky-data.js>
const fs = require('fs'), path = require('path');
const dl = process.argv[2], out = process.argv[3];
const J = f => JSON.parse(fs.readFileSync(path.join(dl, f), 'utf8'));
const stars = J('stars.6.json'), names = J('starnames.json'), cl = J('constellations.lines.json'), cn = J('constellations.json'), cb = J('constellations.bounds.json');
const r = (x, n = 2) => +x.toFixed(n); const ra = l => r(l < 0 ? l + 360 : l);
const GREEK = 'αβγδεζηθικλμνξοπρστυφχψω';
const SUP = { 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const gen = Object.fromEntries(cn.features.map(f => [f.id, f.properties.gen]));

// --- constellation membership from IAU boundaries ---
const wrap = x => { x = ((x + 180) % 360 + 360) % 360 - 180; return x; };
const polys = cb.features.map(f => ({ id: f.id.slice(0, 3), ring: f.geometry.coordinates[0] }))
  .filter(p => { let s = 0; for (let i = 0; i < p.ring.length - 1; i++) s += wrap(p.ring[i + 1][0] - p.ring[i][0]); return Math.abs(s) < 180; });
function conOf(lonDeg, dec) {
  for (const p of polys) {
    // unwrap the ring into continuous RA (relative to the star) so it never breaks at the 0h/24h seam
    const R = p.ring, X = [wrap(R[0][0] - lonDeg)];
    for (let i = 1; i < R.length; i++) X.push(X[i - 1] + wrap(R[i][0] - R[i - 1][0]));
    for (const px of [0, 360, -360]) {
      let inside = false;
      for (let i = 0, j = R.length - 1; i < R.length; j = i++) {
        const xi = X[i], yi = R[i][1], xj = X[j], yj = R[j][1];
        if ((yi > dec) !== (yj > dec) && px < (xj - xi) * (dec - yi) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) return p.id;
    }
  }
  return dec > 0 ? 'UMi' : 'Oct'; // the two polar constellations are whatever is left over
}

const S = [], info = [], named = [], byKey = [];
let checks = 0; const mism = [];
stars.features.forEach((f, idx) => {
  const [l, b] = f.geometry.coordinates; const m = f.properties.mag;
  let bv = parseFloat(f.properties.bv); if (isNaN(bv)) bv = 0.6;
  S.push(ra(l), r(b), r(m), r(bv, 1));
  const n = names[f.id] || {};
  const con = gen[n.c] ? n.c : conOf(l, b);
  if (gen[n.c]) { checks++; if (conOf(l, b) !== n.c) mism.push(n.c + '→' + conOf(l, b)); }
  let desig = '';
  const by = n.bayer || '';
  if (by && GREEK.includes(by[0])) desig = by[0] + (SUP[by.slice(1)] || by.slice(1)) + ' ' + (gen[con] || con);
  else if (n.flam) desig = n.flam + ' ' + (gen[con] || con);
  else if (by) desig = by + ' ' + (gen[con] || con);
  else desig = 'HIP ' + f.id;
  info.push([n.name || '', desig, con].join('|'));
  byKey.push({ idx, m, con, bayer: by, flam: n.flam || '', name: n.name || '' });
  if (n.name && m < 2.6) named.push([n.name, ra(l), r(b), r(m)]);
});

// --- stars that form the 12 zodiac figures ---
const ZOD = ['Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir', 'Lib', 'Sco', 'Sgr', 'Cap', 'Aqr', 'Psc'];
const zod = new Set();
const L = {};
for (const f of cl.features) {
  L[f.id] = f.geometry.coordinates.map(line => line.flatMap(([l, b]) => [ra(l), r(b)]));
  if (!ZOD.includes(f.id)) continue;
  for (const line of f.geometry.coordinates) for (const [l, b] of line) {
    let best = -1, bd = 1e9;
    for (let i = 0; i < S.length / 4; i++) {
      const dra = wrap(S[i * 4] - (l < 0 ? l + 360 : l)) * Math.cos(b * Math.PI / 180), dd = S[i * 4 + 1] - b, d = dra * dra + dd * dd;
      if (d < bd) { bd = d; best = i; }
    }
    if (bd < 0.05) zod.add(best); else console.warn('no star for vertex', f.id, l, b);
  }
}

// --- Indian names: nakshatra yogataras and other traditional stars ---
const ALIAS = [
  ['Ashwini', 'β Ari', 'Yogatara of Ashwini nakshatra'], ['Bharani', '41 Ari', 'Yogatara of Bharani nakshatra'],
  ['Karthigai', 'η Tau', 'Yogatara of Karthigai nakshatra (Pleiades)'], ['Rohini', 'α Tau', 'Yogatara of Rohini nakshatra'],
  ['Mirugasirisham', 'λ Ori', 'Yogatara of Mirugasirisham nakshatra'], ['Thiruvathirai', 'α Ori', 'Yogatara of Thiruvathirai nakshatra'],
  ['Punarpoosam', 'β Gem', 'Yogatara of Punarpoosam nakshatra'], ['Poosam', 'δ Cnc', 'Yogatara of Poosam nakshatra'],
  ['Ayilyam', 'ε Hya', 'Yogatara of Ayilyam nakshatra'], ['Magam', 'α Leo', 'Yogatara of Magam nakshatra'],
  ['Pooram', 'δ Leo', 'Yogatara of Pooram nakshatra'], ['Uthiram', 'β Leo', 'Yogatara of Uthiram nakshatra'],
  ['Hastham', 'δ Crv', 'Yogatara of Hastham nakshatra'], ['Chithirai', 'α Vir', 'Yogatara of Chithirai nakshatra; anchors the Lahiri ayanamsa'],
  ['Swathi', 'α Boo', 'Yogatara of Swathi nakshatra'], ['Visakam', 'α Lib', 'Yogatara of Visakam nakshatra'],
  ['Anusham', 'δ Sco', 'Yogatara of Anusham nakshatra'], ['Kettai', 'α Sco', 'Yogatara of Kettai nakshatra'],
  ['Moolam', 'λ Sco', 'Yogatara of Moolam nakshatra'], ['Pooradam', 'δ Sgr', 'Yogatara of Pooradam nakshatra'],
  ['Uthiradam', 'σ Sgr', 'Yogatara of Uthiradam nakshatra'], ['Thiruvonam', 'α Aql', 'Yogatara of Thiruvonam nakshatra'],
  ['Avittam', 'β Del', 'Yogatara of Avittam nakshatra'], ['Sadhayam', 'λ Aqr', 'Yogatara of Sadhayam nakshatra'],
  ['Poorattathi', 'α Peg', 'Yogatara of Poorattathi nakshatra'], ['Uthirattathi', 'γ Peg', 'Yogatara of Uthirattathi nakshatra'],
  ['Revathi', 'ζ Psc', 'Yogatara of Revathi nakshatra'], ['Abhijit', 'α Lyr', 'Abhijit, the 28th nakshatra'],
  ['Dhruva', 'α UMi', 'Dhruva nakshatra, the Pole Star'], ['Agastya', 'α Car', 'Agastya nakshatra'],
  ['Lubdhaka', 'α CMa', 'Lubdhaka (Mriga Vyadha), the hunter'], ['Brahma Hridaya', 'α Aur', 'Brahma Hridaya'],
  ['Kratu', 'α UMa', 'Saptarishi: Kratu'], ['Pulaha', 'β UMa', 'Saptarishi: Pulaha'], ['Pulastya', 'γ UMa', 'Saptarishi: Pulastya'],
  ['Atri', 'δ UMa', 'Saptarishi: Atri'], ['Angiras', 'ε UMa', 'Saptarishi: Angiras'], ['Vasishtha', 'ζ UMa', 'Saptarishi: Vasishtha'],
  ['Marichi', 'η UMa', 'Saptarishi: Marichi'], ['Arundhati', '80 UMa', 'Arundhati, beside Vasishtha'],
];
const alias = [];
// language-neutral keys: 'nak:<0-26>' for yogataras, otherwise a name key (see src/i18n.js STAR)
const KEY = { Abhijit: 'abhijit', Dhruva: 'dhruva', Agastya: 'agastya', Lubdhaka: 'lubdhaka', 'Brahma Hridaya': 'brahmahridaya', Kratu: 'kratu', Pulaha: 'pulaha', Pulastya: 'pulastya', Atri: 'atri', Angiras: 'angiras', Vasishtha: 'vasishtha', Marichi: 'marichi', Arundhati: 'arundhati' };
let nakN = 0;
for (const [nm, key, note] of ALIAS) {
  const [d, con] = key.split(' ');
  const c = byKey.filter(s => s.con === con && (/^\d+$/.test(d) ? s.flam === d : s.bayer.startsWith(d))).sort((a, b) => a.m - b.m)[0];
  if (!c) { console.warn('alias not found', nm, key); continue; }
  alias.push([note.startsWith('Yogatara of') ? 'nak:' + (nakN++) : KEY[nm], c.idx]);
  console.log('alias', nm.padEnd(15), key.padEnd(7), '→', (c.name || '-').padEnd(15), 'mag', c.m);
}

const C = cn.features.map(f => [f.id, f.properties.name, ra(f.geometry.coordinates[0]), r(f.geometry.coordinates[1]), f.properties.gen]);
const js = 'window.SKYDATA=' + JSON.stringify({ stars: S, info, named, lines: L, cons: C, zod: [...zod], alias }) + ';';
fs.writeFileSync(out, js);
const cnt = {}; info.forEach(s => { const c = s.split('|')[2]; cnt[c] = (cnt[c] || 0) + 1; });
console.log('boundary check:', checks - mism.length, '/', checks, 'agree', mism.slice(0, 12).join(' '));
console.log('stars', S.length / 4, 'zodiac figure stars', zod.size, 'aliases', alias.length, 'constellations used', Object.keys(cnt).length, 'bytes', js.length);
