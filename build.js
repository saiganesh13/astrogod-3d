// Builds two self-contained pages from src/: index.html (full document, open or host anywhere)
// and dist/artifact.html (body-only, for the claude.ai artifact). Run: node build.js
const fs = require('fs'), path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
let page = src('page.html');
// Planet surface maps from textures/ are embedded as data URIs so the page stays a single file.
const texDir = path.join(__dirname, 'textures');
const tex = {};
for (const f of fs.readdirSync(texDir)) {
  const ext = path.extname(f).slice(1), mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  tex[path.basename(f, '.' + ext)] = 'data:' + mime + ';base64,' + fs.readFileSync(path.join(texDir, f)).toString('base64');
}
page = page.replace('<script src="textures.js"></script>', () => '<script>window.PLANET_TEX=' + JSON.stringify(tex) + ';</script>');
for (const f of ['sky-data.js', 'cities.js', 'astro-core.js', 'i18n.js', 'app.js']) {
  page = page.replace(`<script src="${f}"></script>`, () => `<script>\n${src(f)}\n</script>`);
}
// AstroGod logo (figure + wordmark) from brand/
const png = f => 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'brand', f)).toString('base64');
const jpg = f => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(__dirname, 'brand', f)).toString('base64');
page = page.split('%%ASTRO1%%').join(jpg('astrologer1.jpg')).split('%%ASTRO2%%').join(jpg('astrologer2.jpg'));
page = page.split('%%LOGO_FIGURE%%').join(png('logo_figure.png')).split('%%LOGO_WORDMARK%%').join(png('logo_wordmark.png'));
// Optional: `node build.js --inline-libs` puts three.js and Astronomy Engine (from vendor/) inside
// index.html, so the page needs no script CDN at all.
if (process.argv.includes('--inline-libs')) {
  const LIBS = {
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js': 'three.min.js',
    'https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/astronomy.browser.min.js': 'astronomy.browser.min.js',
  };
  for (const [url, file] of Object.entries(LIBS)) {
    const tag = '<script src="' + url + '"></script>';
    if (!page.includes(tag)) throw new Error('library tag not found: ' + url);
    page = page.replace(tag, () => '<script>\n' + fs.readFileSync(path.join(__dirname, 'vendor', file), 'utf8') + '\n</script>');
  }
  console.log('libraries inlined from vendor/');
}
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'artifact.html'), page);
const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${page.replace('<div id="app">', '</head>\n<body>\n<div id="app">')}\n</body>\n</html>\n`;
fs.writeFileSync(path.join(__dirname, 'index.html'), full);
console.log('built', (full.length / 1024).toFixed(0) + ' KB');
