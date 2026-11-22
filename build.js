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
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'artifact.html'), page);
const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${page.replace('<div id="app">', '</head>\n<body>\n<div id="app">')}\n</body>\n</html>\n`;
fs.writeFileSync(path.join(__dirname, 'index.html'), full);
console.log('built', (full.length / 1024).toFixed(0) + ' KB');
