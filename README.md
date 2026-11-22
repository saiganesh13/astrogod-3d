# AstroGod 3D

See the real sky at the moment you were born, in 3D.

Enter a date, time and place of birth and AstroGod 3D shows the sky over that place at that moment:

- all planets, the Sun and Moon with true phase lighting and real surface maps (a vakri outer planet at opposition shows fully lit)
- sidereal rasi, degree and nakshatra for every graha (Lahiri ayanamsa), Lagna, Moon sign, tithi, Rahu and Ketu
- vakri, combust and stationary status
- all 88 constellations, with the 12 zodiac constellations in gold, and 5,000+ stars you can hover or search
- English, Tamil, Hindi, Telugu, Malayalam and Kannada, each also as a mix with English (for example `#ta-en`)

Live site: https://saiganesh13.github.io/astrogod-3d/

Full birth charts: [astrogod.io](https://astrogod.io)

## Language links

Add a language code to the link: `#en`, `#ta`, `#ta-en`, `#hi`, `#hi-en`, `#te`, `#te-en`, `#ml`, `#ml-en`, `#kn`, `#kn-en`.

## Building

`index.html` is a single self-contained page built from `src/`:

```
node build.js
```

To preview locally: `node tools/serve.js`, then open http://localhost:8765.

## Credits

- Planet positions: [Astronomy Engine](https://github.com/cosinekitty/astronomy) (MIT)
- 3D rendering: [three.js](https://threejs.org) (MIT)
- Star catalogue, constellation figures and boundaries: [d3-celestial](https://github.com/ofrohn/d3-celestial) (BSD-3-Clause)
- Planet surface maps: [Solar System Scope](https://www.solarsystemscope.com/textures/), CC BY 4.0, based on NASA data
