# AstroGod 3D — developer handover

AstroGod 3D is a **static, client-only web page**. There is no server code, database or API key.
Everything (sky data, star catalogue, planet maps, logo, translations) is built into one HTML file.

Live reference copy: https://saiganesh13.github.io/astrogod-3d/

---

## 1. Hosting it on the AstroGod domain (the short version)

1. Take **`index.html`** from this folder.
2. Upload it to any path on the web server or CDN, for example `https://astrogod.io/3d/index.html`.
3. Done. No build step is needed on the server, and no other file has to be uploaded.

It works at any path (root or a subfolder) and on any static host: Nginx, Apache, S3 + CloudFront,
Netlify, Vercel, Firebase Hosting, Cloudflare Pages and similar.

**Server settings that help**

- Serve it with `Content-Type: text/html; charset=utf-8`.
- Turn on gzip or Brotli. The file is about 1.6 MB raw and about 1.0 MB gzipped (most of it is the
  built-in planet images, which are already compressed).
- A short cache (for example `Cache-Control: max-age=300`) makes updates appear quickly.

**Language links.** The part after `#` picks the language, so these can be linked from the main site:

| Link ending | Language |
|---|---|
| `#en` | English only (Sun, Moon, Aries…) |
| `#ta` / `#ta-en` | Tamil script / Tamil-English (Suriyan, Mesham…) |
| `#hi` / `#hi-en` | Hindi / Hindi-English |
| `#te` / `#te-en` | Telugu / Telugu-English |
| `#ml` / `#ml-en` | Malayalam / Malayalam-English |
| `#kn` / `#kn-en` | Kannada / Kannada-English |

With no code in the link, the page opens in Tamil-English (or the visitor's last choice).

---

## 2. What the page loads from outside

| What | From | Needed? |
|---|---|---|
| three.js r128 (3D rendering) | `cdnjs.cloudflare.com` | Yes, unless built with `--inline-libs` |
| Astronomy Engine 2.1.19 (planet positions) | `cdn.jsdelivr.net` | Yes, unless built with `--inline-libs` |
| Fonts: Inter, Source Serif 4, Noto Sans Tamil/Devanagari/Telugu/Malayalam/Kannada | `fonts.googleapis.com`, `fonts.gstatic.com` | No; falls back to system fonts |
| Worldwide city search ("Search worldwide for…") | `geocoding-api.open-meteo.com` (free, no key) | No; ~130 cities are built in, and visitors can type coordinates |

**No outside scripts at all:** run `node build.js --inline-libs`. That puts both libraries (from `vendor/`)
inside `index.html` (about 2.3 MB, still one file).

**If the domain uses a Content-Security-Policy,** allow at least:

```
script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;
style-src  'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src   https://fonts.gstatic.com;
img-src    'self' data: blob:;
connect-src https://geocoding-api.open-meteo.com;
```

With `--inline-libs`, the two CDN hosts can be dropped from `script-src`.

**Browser storage (per visitor, `localStorage`):** `janmaVaanam` (last birth details), `janmaVaanamLang`
(language), `ag-theme` (light/dark, the same key the AstroGod app uses). Nothing is sent anywhere.

---

## 3. Project layout

```
index.html            ← the built page. This is what gets hosted.
build.js              ← builds index.html from src/ (and dist/artifact.html for claude.ai)
src/
  page.html           ← markup + all CSS (AstroGod design tokens, light/dark, layouts)
  app.js              ← the app: 3D scene, labels, zoom, panels, search, language switching
  astro-core.js       ← astronomy + Jyotish maths (positions, Lahiri ayanamsa, Lagna, nakshatra, tithi, vakri)
  i18n.js             ← every word on the page, in all 11 language modes
  cities.js           ← built-in cities with coordinates and time zones
  sky-data.js         ← generated star catalogue, constellation figures, Indian star names
textures/             ← planet surface maps (Solar System Scope, CC BY 4.0)
brand/                ← AstroGod logo (figure + wordmark) and the two astrologer photos for the banners
vendor/               ← local copies of three.js r128 and Astronomy Engine 2.1.19 (for --inline-libs)
tools/
  makedata.js         ← regenerates src/sky-data.js from d3-celestial data files
  serve.js            ← tiny local web server for testing
```

---

## 4. Making changes

Requires Node.js 18 or newer. No `npm install` is needed.

```
node build.js                  # rebuild index.html after editing anything in src/, textures/ or brand/
node build.js --inline-libs    # same, with three.js and Astronomy Engine built in
node tools/serve.js            # preview at http://localhost:8765
```

Always edit the files in `src/`, then rebuild. Do not edit `index.html` by hand; it is overwritten by every build.

**Common edits**

| To change… | Edit |
|---|---|
| Text in any language, button labels, banner copy | `src/i18n.js` (`EN` for English; `UI.hi`, `UI.ta`… for native scripts; `MIX` for the -English modes) |
| Graha / rasi / nakshatra / tithi names | `TERMS` in `src/i18n.js` |
| Indian star names (yogataras, Saptarishi…) | `ALIAS` in `tools/makedata.js`, then regenerate `sky-data.js` (below) |
| Banner links (currently all `https://astrogod.io`) | `src/page.html`, search for `astrogod.io` |
| Colours, spacing, layout | the `:root` tokens and rules at the top of `src/page.html` |
| Logo or astrologer photos | replace the files in `brand/` (same names), rebuild |
| Built-in city list | `src/cities.js` |

**Regenerating the star data** (only needed if `tools/makedata.js` changes): download these files from
`https://cdn.jsdelivr.net/npm/d3-celestial@0.7.35/data/` into one folder: `stars.6.json`,
`starnames.json`, `constellations.json`, `constellations.lines.json`, `constellations.bounds.json`. Then:

```
node tools/makedata.js <that folder> src/sky-data.js
node build.js
```

---

## 5. How it works (for whoever maintains it)

- **Astronomy:** Astronomy Engine gives geocentric/topocentric positions, phases, magnitudes and each body's
  rotation axis. `astro-core.js` turns these into sidereal positions (Lahiri ayanamsa), rasi/nakshatra/pada,
  Lagna (ecliptic point on the eastern horizon), mean Rahu/Ketu, tithi, vakri (from the daily motion),
  combustion and stationary status. Time zones come from the browser's `Intl` data, so historical offsets
  (for example India's +6:30 war time) are handled.
- **3D:** a three.js scene with the camera at the centre of the celestial sphere. Planets are lit from the
  Sun's real direction with real surface maps, so phases, crescents and Saturn's ring shadows are correct.
  Labels are drawn on a 2D canvas on top.
- **Sky features:** 5,044 stars to magnitude 6, all 88 constellations (the 12 zodiac figures in gold),
  the 12 rasi signs as dashed 30° boxes, Milky Way, daylight/twilight sky, see-through or no ground,
  and the sky turning to night when zoomed in.
- **Layouts:** desktop (1024 px and wider) has a sidebar; phones and tablets get a top bar, bottom tabs and
  bottom sheets (swipe down or tap the sky to close).

---

## 6. Things to know

- **Translations:** the Hindi, Tamil, Telugu, Malayalam and Kannada text was machine-written and should be
  read by native speakers before a big launch. Every word is in `src/i18n.js`.
- **Rahu/Ketu** use the mean node. Some panchangams use the true node, which can differ by up to about 1.5°.
- **Nakshatra yogataras:** the commonly used identifications are built in; a few (Hastham, Poosam,
  Ayilyam, Revathi) differ between traditions.
- **Banners** promote astrologer calls and signing up on AstroGod only; there are deliberately no
  paid-feature promotions.

## 7. Credits and licences (keep these on the page)

- Astronomy Engine — MIT
- three.js — MIT
- d3-celestial star catalogue, constellation lines and boundaries — BSD-3-Clause
- Planet surface maps — Solar System Scope, **CC BY 4.0** (the credit line in the Planets panel must stay)
- AstroGod logo and astrologer photos — AstroGod's own assets
