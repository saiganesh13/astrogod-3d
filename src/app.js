(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const DEG = Math.PI / 180;
  const C = window.AstroCore, D = window.SKYDATA;
  const appEl = $('app');

  if (!window.THREE || !window.Astronomy || !C || !D) {
    appEl.insertAdjacentHTML('beforeend', '<div id="err">The sky engine could not load. Check your internet connection and reload the page.</div>');
    return;
  }

  // ---------- constants ----------
  const ZODIAC = { Ari: 'Mesham', Tau: 'Rishabam', Gem: 'Mithunam', Cnc: 'Kadagam', Leo: 'Simmam', Vir: 'Kanni', Lib: 'Thulam', Sco: 'Viruchigam', Sgr: 'Dhanusu', Cap: 'Magaram', Aqr: 'Kumbam', Psc: 'Meenam' };
  const R_STAR = 1000, R_LINE = 990, R_GROUND = 600;
  const LOOK = {
    Sun: { kind: 4, c1: [1, 0.93, 0.74], c2: [1, 0.8, 0.5], dot: '#ffd27a', diam: 2.0 },
    Moon: { kind: 0, c1: [0.86, 0.85, 0.82], c2: [0.42, 0.42, 0.44], dot: '#e6e6ea', diam: 2.0 },
    Mercury: { kind: 2, c1: [0.62, 0.59, 0.56], c2: [0.40, 0.38, 0.37], dot: '#b9b3ac' },
    Venus: { kind: 3, c1: [1.0, 0.95, 0.82], c2: [0.92, 0.84, 0.64], dot: '#fff1c9' },
    Mars: { kind: 2, c1: [0.86, 0.45, 0.25], c2: [0.58, 0.28, 0.16], dot: '#ff8a5c', caps: 1 },
    Jupiter: { kind: 1, c1: [0.95, 0.89, 0.79], c2: [0.74, 0.55, 0.40], dot: '#f0d3ad' },
    Saturn: { kind: 1, c1: [0.97, 0.90, 0.72], c2: [0.83, 0.72, 0.52], dot: '#ead9a6', ring: true },
    Uranus: { kind: 3, c1: [0.68, 0.88, 0.92], c2: [0.56, 0.79, 0.85], dot: '#a9e3ec' },
    Neptune: { kind: 3, c1: [0.40, 0.56, 0.95], c2: [0.30, 0.44, 0.85], dot: '#7ea0ff' },
    Rahu: { dot: '#b7a4ff' }, Ketu: { dot: '#9fd2ff' }, Lagna: { dot: '#e9c97f' },
  };
  const ORDER = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu', 'Uranus', 'Neptune'];
  const ZOD_IDX = { Ari: 0, Tau: 1, Gem: 2, Cnc: 3, Leo: 4, Vir: 5, Lib: 6, Sco: 7, Sgr: 8, Cap: 9, Aqr: 10, Psc: 11 };

  // ---------- language ----------
  const I = window.I18N, F = I.fill;
  let L = I.pack('ta-en');
  const FONT = 'Inter, "Noto Sans Tamil", "Noto Sans Devanagari", "Noto Sans Telugu", "Noto Sans Malayalam", "Noto Sans Kannada", sans-serif';
  const gName = id => L.t.graha[id] || id;
  const rName = i => L.t.rasi[i];
  const nName = i => L.t.nak[i];
  // "Guru · Jupiter" in the mixed modes, plain local name otherwise
  const planetLabel = id => gName(id);
  function tithiText(num, withNum) {
    const i = (num - 1) % 15, name = i === 14 ? (num === 15 ? L.t.purnima : L.t.amavasya) : L.t.tithi[i];
    const paksha = L.t.paksha[num <= 15 ? 0 : 1];
    if (withNum) return F(L.ui.tithiLine, { paksha: i === 14 ? '' : paksha, tithi: name, n: num }).trim();
    return i === 14 ? name : `${paksha} ${name}`;
  }
  const phaseIdx = p => p < 6 || p >= 354 ? 0 : p < 84 ? 1 : p < 96 ? 2 : p < 174 ? 3 : p < 186 ? 4 : p < 264 ? 5 : p < 276 ? 6 : 7;

  // ---------- state ----------
  const S = {
    lat: 13.0827, lon: 80.2707, tz: 'Asia/Kolkata', place: 'Chennai, Tamil Nadu',
    name: '', baseUtc: Date.now(), utc: Date.now(), isExample: true,
    az: 90, alt: 30, fov: 75,
    opt: { lines: true, labels: true, ecliptic: true, mw: true, atmos: true, ground: true, see: true, noground: false },
    day: 0, twi: 0, atmGlow: 1,
    playing: false, speed: 60, sel: null, astro: null,
  };

  // ---------- three.js ----------
  const glCanvas = $('gl'), ov = $('ov'), octx = ov.getContext('2d');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true });
  } catch (e) {
    appEl.insertAdjacentHTML('beforeend', '<div id="err">This browser could not start 3D graphics (WebGL). Try a recent Chrome, Edge, Safari or Firefox.</div>');
    return;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x050507, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(S.fov, 1, 0.1, 5000);
  const sky = new THREE.Group(); sky.matrixAutoUpdate = false; scene.add(sky);

  const GLSL_NOISE = `
    float hash(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
    float noise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
      return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
    float fbm(vec3 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }`;

  // Day / twilight dome (fixed to the horizon)
  const domeMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector3(0, -1, 0) }, uAtmos: { value: 1 } },
    vertexShader: `varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uSun; uniform float uAtmos; varying vec3 vD;
      void main(){
        vec3 d=normalize(vD); float sa=uSun.y;
        float day=smoothstep(-0.10,0.12,sa); float twi=smoothstep(-0.31,-0.02,sa)*(1.0-day);
        float h=clamp(d.y,0.0,1.0);
        vec2 a=normalize(d.xz+1e-5), b=normalize(uSun.xz+1e-5); float toward=0.5+0.5*dot(a,b);
        vec3 col=vec3(0.014,0.014,0.022);
        vec3 tw=mix(vec3(0.42,0.22,0.16),vec3(0.05,0.07,0.17),pow(h,0.35));
        col=mix(col,tw,uAtmos*twi*(0.30+0.70*toward)*(1.0-0.5*h));
        vec3 dc=mix(vec3(0.42,0.58,0.80),vec3(0.13,0.28,0.58),pow(h,0.5));
        col=mix(col,dc,uAtmos*day*0.72);
        float cs=max(dot(d,uSun),0.0);
        col+=vec3(1.0,0.82,0.55)*(pow(cs,80.0)*0.7+pow(cs,6.0)*0.10)*uAtmos*(day+twi*0.7);
        gl_FragColor=vec4(col,1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1400, 48, 24), domeMat); dome.renderOrder = -3; scene.add(dome);

  // Milky Way (procedural, in galactic coordinates)
  const gnp = C.radecVec(192.85948, 27.12825), gc = C.radecVec(266.40510, -28.93617);
  const mwMat = new THREE.ShaderMaterial({
    uniforms: { uGnp: { value: new THREE.Vector3(...gnp) }, uGc: { value: new THREE.Vector3(...gc) }, uVis: { value: 1 } },
    vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: GLSL_NOISE + `uniform vec3 uGnp; uniform vec3 uGc; uniform float uVis; varying vec3 vP;
      void main(){
        vec3 d=normalize(vP); float b=asin(clamp(dot(d,uGnp),-1.0,1.0));
        vec3 y=cross(uGnp,uGc); float l=atan(dot(d,y),dot(d,uGc));
        float n=fbm(d*6.0)*0.65+fbm(d*18.0)*0.35;
        float band=exp(-pow(b/(0.16+0.05*cos(l)),2.0));
        float bulge=exp(-(l*l*1.6+b*b*14.0));
        float rift=exp(-pow((b-0.03)/0.035,2.0))*smoothstep(1.2,0.1,abs(l-0.35))*0.55;
        float v=(band*(0.45+0.55*cos(l*0.5)*cos(l*0.5))*0.75+bulge*0.9)*(0.35+0.9*n)*(1.0-rift);
        vec3 col=mix(vec3(0.55,0.62,0.85),vec3(0.95,0.85,0.70),bulge);
        gl_FragColor=vec4(col*v*0.16*uVis,1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, transparent: true,
  });
  const mw = new THREE.Mesh(new THREE.SphereGeometry(1200, 96, 48), mwMat); mw.renderOrder = -2; sky.add(mw);

  // Stars
  function bvColor(bv) {
    const T = [[-0.4, [0.62, 0.71, 1.0]], [0.0, [0.80, 0.86, 1.0]], [0.3, [0.95, 0.96, 1.0]], [0.6, [1.0, 0.95, 0.86]], [1.0, [1.0, 0.85, 0.67]], [1.5, [1.0, 0.74, 0.50]], [2.0, [1.0, 0.63, 0.40]]];
    if (bv <= T[0][0]) return T[0][1];
    for (let i = 1; i < T.length; i++) if (bv <= T[i][0]) {
      const [b0, c0] = T[i - 1], [b1, c1] = T[i]; const f = (bv - b0) / (b1 - b0);
      return c0.map((c, k) => c + (c1[k] - c) * f);
    }
    return T[T.length - 1][1];
  }
  {
    const n = D.stars.length / 4, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const ra = D.stars[i * 4], de = D.stars[i * 4 + 1], mag = D.stars[i * 4 + 2], bv = D.stars[i * 4 + 3];
      const v = C.radecVec(ra, de);
      pos.set([v[0] * R_STAR, v[1] * R_STAR, v[2] * R_STAR], i * 3);
      const c = bvColor(bv), k = Math.min(1, Math.max(0.28, 0.32 + (6 - mag) * 0.14));
      col.set([c[0] * k, c[1] * k, c[2] * k], i * 3);
      size[i] = Math.max(1.6, (6.9 - mag) * 1.55);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    var starMat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: dpr }, uVis: { value: 1 } },
      vertexShader: `attribute float size; attribute vec3 color; uniform float uScale; varying vec3 vC;
        void main(){ vC=color; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_PointSize=size*uScale; }`,
      fragmentShader: `uniform float uVis; varying vec3 vC;
        void main(){ vec2 c=gl_PointCoord-0.5; float r=length(c)*2.0; if(r>1.0) discard;
          float a=exp(-r*r*6.0)+0.7*exp(-r*r*40.0); gl_FragColor=vec4(vC*a*uVis,1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    sky.add(new THREE.Points(g, starMat));
  }
  // Star catalogue lookups: unit vectors, "name|designation|constellation", Indian names
  const NS = D.stars.length / 4;
  const starDir = new Float32Array(NS * 3);
  for (let i = 0; i < NS; i++) starDir.set(C.radecVec(D.stars[i * 4], D.stars[i * 4 + 1]), i * 3);
  const SINFO = D.info.map(s => s.split('|'));
  const ALIAS = {}; for (const [key, idx] of D.alias) (ALIAS[idx] = ALIAS[idx] || []).push(key);
  const SAPTA = ['kratu', 'pulaha', 'pulastya', 'atri', 'angiras', 'vasishtha', 'marichi'];
  // Indian name of a star key in the current language, plus a short note
  const aliasName = (key, pack = L) => key.startsWith('nak:') ? pack.t.nak[+key.slice(4)] : pack.star[key];
  const aliasNote = key => key.startsWith('nak:') ? F(L.ui.yogatara, { n: nName(+key.slice(4)) })
    : SAPTA.includes(key) ? L.ui.saptarishi : key === 'dhruva' ? L.ui.poleStar : key === 'abhijit' ? L.ui.nak28 : '';
  const CONS = Object.fromEntries(D.cons.map(([id, name, ra, de, gen]) => [id, { id, name, gen, ra, de }]));
  const starName = i => { const a = ALIAS[i], [nm, desig] = SINFO[i]; return a ? `${aliasName(a[0])} (${nm || desig})` : (nm || desig); };

  // Ribbons: constant-angular-width lines on the sphere (camera sits at the centre)
  function slerpPts(a, b, stepDeg) {
    const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
    const th = Math.acos(dot), n = Math.max(1, Math.ceil(th / (stepDeg * DEG))), out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (th < 1e-6) { out.push(a); continue; }
      const s0 = Math.sin((1 - t) * th) / Math.sin(th), s1 = Math.sin(t * th) / Math.sin(th);
      out.push([a[0] * s0 + b[0] * s1, a[1] * s0 + b[1] * s1, a[2] * s0 + b[2] * s1]);
    }
    return out;
  }
  // Each vertex stores its centre-line point and a sideways offset; the shader scales the offset with zoom
  // so lines keep the same on-screen thickness at any field of view.
  function ribbonGeometry(polylines, widthDeg, R) {
    const verts = [], sides = [], hw = Math.tan(widthDeg * DEG / 2) * R;
    const A = new THREE.Vector3(), B = new THREE.Vector3(), M = new THREE.Vector3(), T = new THREE.Vector3(), Sd = new THREE.Vector3();
    for (const line of polylines) {
      for (let i = 0; i < line.length - 1; i++) {
        const pts = slerpPts(line[i], line[i + 1], 2);
        for (let j = 0; j < pts.length - 1; j++) {
          A.set(...pts[j]); B.set(...pts[j + 1]);
          M.copy(A).add(B).normalize(); T.copy(B).sub(A).normalize(); Sd.crossVectors(M, T).normalize().multiplyScalar(hw);
          A.multiplyScalar(R); B.multiplyScalar(R);
          verts.push(A.x, A.y, A.z, A.x, A.y, A.z, B.x, B.y, B.z, A.x, A.y, A.z, B.x, B.y, B.z, B.x, B.y, B.z);
          sides.push(Sd.x, Sd.y, Sd.z, -Sd.x, -Sd.y, -Sd.z, Sd.x, Sd.y, Sd.z, -Sd.x, -Sd.y, -Sd.z, -Sd.x, -Sd.y, -Sd.z, Sd.x, Sd.y, Sd.z);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('side', new THREE.Float32BufferAttribute(sides, 3));
    return g;
  }
  const ribbonW = { value: 1 };
  const lineMat = (color, opacity) => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uW: ribbonW },
    vertexShader: `attribute vec3 side; uniform float uW; void main(){ gl_Position=projectionMatrix*modelViewMatrix*vec4(position+side*uW,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; void main(){ gl_FragColor=vec4(uColor,uOpacity); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });

  // Constellation figures
  const consGroup = new THREE.Group(); sky.add(consGroup);
  {
    const zod = [], rest = [];
    for (const [id, lines] of Object.entries(D.lines)) {
      const polys = lines.map(fl => { const p = []; for (let i = 0; i < fl.length; i += 2) p.push(C.radecVec(fl[i], fl[i + 1])); return p; });
      (ZODIAC[id.slice(0, 3)] ? zod : rest).push(...polys);
    }
    const zm = lineMat(0xe2bf5a, 0.92), rm = lineMat(0xb3a88f, 0.42);
    const zMesh = new THREE.Mesh(ribbonGeometry(zod, 0.2, R_LINE), zm); zMesh.renderOrder = 1;
    const rMesh = new THREE.Mesh(ribbonGeometry(rest, 0.1, R_LINE), rm); rMesh.renderOrder = 0;
    consGroup.add(rMesh, zMesh);
  }
  // Glowing gold star points at every star of the 12 zodiac figures
  var zodMat;
  {
    const n = D.zod.length, pos = new Float32Array(n * 3), size = new Float32Array(n), col = new Float32Array(n * 3);
    D.zod.forEach((idx, i) => {
      pos.set([starDir[idx * 3] * 985, starDir[idx * 3 + 1] * 985, starDir[idx * 3 + 2] * 985], i * 3);
      const mag = D.stars[idx * 4 + 2];
      size[i] = Math.max(15, (6.6 - mag) * 4.6);
      const c = bvColor(D.stars[idx * 4 + 3]);
      col.set([0.55 + 0.45 * c[0], 0.5 + 0.45 * c[1], 0.45 + 0.4 * c[2]], i * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    zodMat = new THREE.ShaderMaterial({
      uniforms: { uScale: starMat.uniforms.uScale, uVis: starMat.uniforms.uVis },
      vertexShader: `attribute float size; attribute vec3 color; uniform float uScale; varying vec3 vC;
        void main(){ vC=color; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_PointSize=size*uScale; }`,
      fragmentShader: `uniform float uVis; varying vec3 vC;
        void main(){ vec2 c=gl_PointCoord-0.5; float r=length(c)*2.0; if(r>1.0) discard;
          float core=exp(-r*r*38.0), halo=exp(-r*r*5.0)*0.85;
          vec3 col=vec3(1.0,0.80,0.42)*halo+vC*core*1.8;
          gl_FragColor=vec4(col*max(uVis,0.55),1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, zodMat); pts.renderOrder = 2; consGroup.add(pts);
  }
  const consLabels = D.cons.map(([id, name, ra, de]) => ({ id, name, zod: ZODIAC[id], zi: ZOD_IDX[id], pos: new THREE.Vector3(...C.radecVec(ra, de)).multiplyScalar(R_LINE) }));
  const starLabels = D.named.map(([name, ra, de, mag]) => ({ name, mag, pos: new THREE.Vector3(...C.radecVec(ra, de)).multiplyScalar(R_STAR) }));

  // Ecliptic & rasi belt (built per epoch)
  const eclGroup = new THREE.Group(); sky.add(eclGroup);
  let eclBuiltFor = null, rasiLabels = [];
  function buildEcliptic(astro) {
    if (eclBuiltFor !== null && Math.abs(astro.time.tt - eclBuiltFor) < 180) return;
    eclBuiltFor = astro.time.tt;
    eclGroup.children.slice().forEach(c => { eclGroup.remove(c); c.geometry.dispose(); });
    const E = (lon, lat) => C.eclipticPoint(astro.rEctEqj, lon, lat);
    const pts = []; for (let l = 0; l <= 360; l += 2) pts.push(E(l, 0));
    // The 12 rasis as dashed boxes: equal 30° sidereal segments of the zodiac belt (±BAND° from the
    // ecliptic). They are drawn in ivory, apart from the gold star figures, because the signs and the
    // constellations do not line up (e.g. the first degrees of Thulam lie among Virgo's stars).
    const BAND = 10, dashes = [];
    rasiLabels = [];
    for (let k = 0; k < 12; k++) {
      const lb = k * 30 + astro.ayan;
      for (let b = -BAND; b < BAND; b += 2.1) dashes.push([E(lb, b), E(lb, Math.min(BAND, b + 1.2))]);   // sign boundary
      rasiLabels.push({ k, pos: new THREE.Vector3(...E(lb + 15, BAND - 2.6)).multiplyScalar(R_LINE) });
    }
    for (const edge of [-BAND, BAND]) for (let l = 0; l < 360; l += 3) dashes.push([E(l, edge), E(l + 1.6, edge)]);   // belt edges
    const m1 = new THREE.Mesh(ribbonGeometry([pts], 0.06, R_LINE - 2), lineMat(0xd9b86a, 0.35));
    const m2 = new THREE.Mesh(ribbonGeometry(dashes, 0.13, R_LINE - 2), lineMat(0xece4d0, 0.7));
    eclGroup.add(m1, m2);
  }

  // Ground + horizon
  const groundMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 1 }, uDay: { value: 0 } },
    vertexShader: `varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: GLSL_NOISE + `uniform float uOpacity; uniform float uDay; varying vec3 vD;
      void main(){ float h=clamp(-vD.y,0.0,1.0);
        vec3 c=mix(vec3(0.075,0.082,0.07),vec3(0.018,0.022,0.02),pow(h,0.35));
        c*=0.85+0.3*fbm(vD*40.0); c*=1.0+uDay*1.6;
        gl_FragColor=vec4(c,uOpacity); }`,
    side: THREE.BackSide, transparent: true,
  });
  const ground = new THREE.Mesh(new THREE.SphereGeometry(R_GROUND, 64, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), groundMat);
  ground.renderOrder = 10; scene.add(ground);
  const horizonPts = []; for (let a = 0; a <= 360; a += 3) horizonPts.push([Math.sin(a * DEG), 0.0, -Math.cos(a * DEG)]);
  const horizon = new THREE.Mesh(ribbonGeometry([horizonPts], 0.12, R_GROUND - 1), lineMat(0x8b97b8, 0.55)); horizon.renderOrder = 11; scene.add(horizon);

  // Planets
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
  })();
  // Surface maps (Solar System Scope, CC BY 4.0, from NASA mission data), embedded as data URIs by build.js
  const TEX = window.PLANET_TEX || {};
  const texLoader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const blankTex = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, THREE.RGBAFormat); blankTex.needsUpdate = true;
  function loadTex(key, onReady) {
    if (!TEX[key]) return null;
    return texLoader.load(TEX[key], t => { t.wrapS = THREE.RepeatWrapping; t.anisotropy = maxAniso; t.needsUpdate = true; if (onReady) onReady(t); needsRender = true; });
  }

  const planetVS = `varying vec3 vN; varying vec3 vO;
    void main(){ vN=normal; vO=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  // uKind: 0 Moon, 1 gas giant, 2 rocky, 3 cloud-covered/ice giant, 4 Sun
  const planetFS = GLSL_NOISE + `uniform vec3 uLight; uniform vec3 uPole; uniform vec3 uPrime; uniform vec3 uView; uniform vec3 uC1; uniform vec3 uC2;
    uniform float uKind; uniform float uCaps; uniform float uSeed; uniform sampler2D uMap; uniform float uHasMap;
    uniform sampler2D uRingTex; uniform float uRingShadow; uniform float uSkyMix;
    varying vec3 vN; varying vec3 vO;
    vec3 procedural(vec3 n, float lat){
      if(uKind<0.5){ float m=smoothstep(0.50,0.60,fbm(n*2.3+uSeed)); return mix(uC1,uC2,m)*(0.82+0.32*fbm(n*11.0+3.0)); }
      if(uKind<1.5){ float w=lat*8.0+0.45*fbm(n*5.0+uSeed); float b=0.5+0.5*sin(w*3.14159); return mix(uC1,uC2,b*b); }
      if(uKind<2.5){ vec3 c=mix(uC1,uC2,smoothstep(0.38,0.66,fbm(n*3.2+uSeed))); if(uCaps>0.5) c=mix(c,vec3(0.95,0.93,0.9),smoothstep(0.86,0.92,abs(lat))); return c; }
      return mix(uC1,uC2,0.5+0.35*lat+0.15*fbm(n*3.0+uSeed));
    }
    void main(){
      vec3 n=normalize(vN);
      vec3 e=cross(uPole,uPrime);
      float z=dot(n,uPole);
      float lon=atan(dot(n,e),dot(n,uPrime));
      // two seam placements; use whichever is continuous at this pixel (no mipmap seam line)
      float uA=lon/6.2831853+0.5; float uB=fract(uA+0.5)-0.5;
      float u=fwidth(uA)<=fwidth(uB)+1e-5?uA:uB;
      vec2 uv=vec2(u, asin(clamp(z,-1.0,1.0))/3.14159265+0.5);
      vec3 alb = uHasMap>0.5 ? texture2D(uMap,uv).rgb : procedural(n,z);
      float d=dot(n,uLight); float mu=max(dot(n,uView),0.0);
      if(uKind>3.5){ gl_FragColor=vec4(alb*(0.42+0.58*pow(mu,0.5))*1.35,1.0); return; }
      float lambert=max(d,0.0);
      float ls = d>0.0 ? min(1.35, 2.0*d/(d+mu+1e-4)) : 0.0;   // Lommel-Seeliger: airless dusty surfaces
      float lit;
      if(uKind<0.5) lit=ls;
      else if(uKind<1.5) lit=pow(lambert,0.92)*(0.62+0.38*pow(mu,0.5));
      else if(uKind<2.5) lit=0.55*ls+0.45*lambert;
      else lit=smoothstep(-0.07,0.16,d)*(0.42+0.78*lambert);   // thick cloud decks scatter light right to the limb
      // shadow of Saturn's rings on the globe
      if(uRingShadow>0.5){
        float lp=dot(uLight,uPole);
        if(abs(lp)>1e-3){ float t=-dot(n,uPole)/lp;
          if(t>0.0){ float r=length(n+t*uLight); if(r>1.24&&r<2.27){ float a=texture2D(uRingTex,vec2((r-1.24)/1.03,0.5)).a; lit*=1.0-0.8*a; } } }
      }
      vec3 col=alb*lit*1.08;
      if(uKind<0.5) col+=alb*0.022*(1.0-smoothstep(0.0,0.05,d));   // earthshine on the Moon's night side
      // Earth's bright day/twilight sky sits in front of the planet: let it show over the unlit side
      float a=mix(1.0,clamp(max(col.r,max(col.g,col.b))*4.0,0.0,1.0),uSkyMix);
      gl_FragColor=vec4(col,a);
    }`;
  const ringFS = `uniform vec3 uLight; uniform vec3 uPole; uniform vec3 uView; uniform mat3 uRot; uniform sampler2D uRingTex; uniform float uHasMap; varying vec3 vO;
    void main(){
      vec3 p=uRot*vO; float r=length(p); if(r<1.24||r>2.27) discard;
      vec4 t;
      if(uHasMap>0.5) t=texture2D(uRingTex,vec2((r-1.24)/1.03,0.5));
      else { float dn = r<1.53 ? 0.22 : (r<1.95 ? 0.85 : (r<2.03 ? 0.06 : 0.6)); t=vec4(0.9,0.82,0.64,dn); }
      float al=dot(p,uLight); float perp=length(p-al*uLight);
      float sh=(al<0.0 && perp<1.0)?0.08:1.0;                 // the globe's shadow across the rings
      float lp=dot(uLight,uPole), vp=dot(uView,uPole);
      float lit = lp*vp>0.0 ? 0.25+0.75*sqrt(abs(lp)) : 0.22*(1.0-t.a);   // unlit face only glows through thin parts
      gl_FragColor=vec4(t.rgb*lit*sh*1.1, t.a*0.96);
    }`;
  const sphereGeo = new THREE.SphereGeometry(1, 96, 64);
  const ringTex = loadTex('saturn_ring');
  const skyMix = { value: 0 };
  const planets = {};
  C.BODIES.forEach((b, i) => {
    const L = LOOK[b.id];
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uLight: { value: new THREE.Vector3(0, 0, 1) }, uPole: { value: new THREE.Vector3(0, 0, 1) }, uPrime: { value: new THREE.Vector3(1, 0, 0) }, uView: { value: new THREE.Vector3(0, 0, 1) },
        uC1: { value: new THREE.Vector3(...L.c1) }, uC2: { value: new THREE.Vector3(...L.c2) }, uKind: { value: L.kind }, uCaps: { value: L.caps || 0 }, uSeed: { value: i * 7.31 },
        uMap: { value: blankTex }, uHasMap: { value: 0 },
        uRingTex: { value: ringTex || blankTex }, uRingShadow: { value: L.ring && ringTex ? 1 : 0 }, uSkyMix: skyMix,
      },
      vertexShader: planetVS, fragmentShader: planetFS, extensions: { derivatives: true }, transparent: true,
    });
    loadTex(b.id.toLowerCase(), t => { mat.uniforms.uMap.value = t; mat.uniforms.uHasMap.value = 1; });
    const mesh = new THREE.Mesh(sphereGeo, mat); mesh.renderOrder = 2;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(L.dot), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.renderOrder = 5;
    sky.add(mesh, glow);
    const o = { mesh, glow, mat };
    if (L.ring) {
      const rg = new THREE.RingGeometry(1.2, 2.3, 160, 1);
      const rm = new THREE.ShaderMaterial({
        uniforms: { uLight: { value: new THREE.Vector3() }, uPole: { value: new THREE.Vector3() }, uView: { value: new THREE.Vector3() }, uRot: { value: new THREE.Matrix3() }, uRingTex: { value: ringTex || blankTex }, uHasMap: { value: ringTex ? 1 : 0 } },
        vertexShader: `varying vec3 vO; void main(){ vO=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: ringFS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      });
      o.ring = new THREE.Mesh(rg, rm); o.ring.renderOrder = 3; sky.add(o.ring);
    }
    planets[b.id] = o;
  });

  // ---------- astronomy update ----------
  const skyM = new THREE.Matrix4();
  function displayDiamDeg(b) {
    if (LOOK[b.id].diam) return LOOK[b.id].diam;
    const base = Math.min(1.8, Math.max(0.3, 0.2 * Math.sqrt(b.angDiamArcsec)));
    return b.id === 'Saturn' ? base * 0.85 : base;
  }
  function updateSky() {
    const a = C.compute(S.utc, S.lat, S.lon);
    S.astro = a;
    const r = a.rEqjHor.rot; // h_r = sum_c rot[c][r] v_c ; three = (-hy, hz, -hx)
    skyM.set(-r[0][1], -r[1][1], -r[2][1], 0,
      r[0][2], r[1][2], r[2][2], 0,
      -r[0][0], -r[1][0], -r[2][0], 0,
      0, 0, 0, 1);
    sky.matrix.copy(skyM); sky.matrixWorldNeedsUpdate = true;
    buildEcliptic(a);

    const sunWorld = new THREE.Vector3(...a.sun.dir).applyMatrix4(skyM);
    domeMat.uniforms.uSun.value.copy(sunWorld);
    const day = THREE.MathUtils.smoothstep(sunWorld.y, -0.1, 0.12);
    const twi = THREE.MathUtils.smoothstep(sunWorld.y, -0.31, -0.02);
    S.day = day; S.twi = twi;
    applyAtmos();

    for (const b of a.bodies) {
      const o = planets[b.id];
      const rPos = b.id === 'Moon' ? 700 : 720 + 45 * Math.log(1 + b.dist);
      const dir = new THREE.Vector3(...b.dir);
      const pos = dir.clone().multiplyScalar(rPos);
      const rad = rPos * Math.tan(displayDiamDeg(b) / 2 * DEG);
      o.mesh.position.copy(pos); o.mesh.scale.setScalar(rad);
      o.mat.uniforms.uLight.value.set(...b.light);
      o.mat.uniforms.uPole.value.set(...b.pole);
      o.mat.uniforms.uPrime.value.set(...b.prime);
      o.mat.uniforms.uView.value.copy(dir).negate();
      // glow from real brightness (magnitude) and phase
      let gR, gA;
      if (b.id === 'Sun') { gR = 9; gA = 0.95; }
      else if (b.id === 'Moon') { gR = 1.4 + 3.4 * b.phaseFraction; gA = 0.08 + 0.42 * b.phaseFraction; }
      else {
        const B = Math.pow(10, -0.4 * b.mag);
        gR = Math.min(3.4, Math.max(0.55, 0.5 + 0.85 * Math.pow(B, 0.33)));
        gA = Math.min(0.85, Math.max(0.16, 0.2 + 0.24 * Math.log10(1 + 4 * B)));
      }
      o.glow.position.copy(pos); o.glow.scale.setScalar(2 * rPos * Math.tan(gR * DEG));
      o.baseGA = gA;
      o.rPos = rPos; o.rad = rad; o.diam = displayDiamDeg(b);
      if (o.ring) {
        const pole = new THREE.Vector3(...b.pole);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), pole);
        o.ring.position.copy(pos); o.ring.quaternion.copy(q); o.ring.scale.setScalar(rad); o.ring.updateMatrix();
        o.ring.material.uniforms.uRot.value.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q));
        o.ring.material.uniforms.uLight.value.set(...b.light);
        o.ring.material.uniforms.uPole.value.copy(pole);
        o.ring.material.uniforms.uView.value.copy(dir).negate();
      }
    }
    fadeGlows();
    applyOptions(false);
    renderPanel();
    if (S.view !== 'sky') updateSpace();
    needsRender = true;
  }


  // ---------- atmosphere ----------
  // Daylight belongs to Earth's air. Zooming in deep is like leaving Earth: the blue sky and
  // twilight fade out and the ground thins, leaving the night sky (fully night from a 22° view, ~3.5× zoom).
  const zoomAtm = () => THREE.MathUtils.smoothstep(S.fov, 22, 45);
  function applyAtmos() {
    const z = zoomAtm(), day = S.day, twi = S.twi;
    const atm = (S.opt.atmos ? 1 : 0) * z;
    domeMat.uniforms.uAtmos.value = atm;
    starMat.uniforms.uVis.value = 1 - atm * (0.62 * day + 0.25 * Math.max(0, twi - day));
    mwMat.uniforms.uVis.value = S.opt.mw ? (1 - atm * Math.max(day * 0.95, twi * 0.6)) : 0;
    groundMat.uniforms.uDay.value = atm * day;
    groundMat.uniforms.uOpacity.value = (S.opt.see ? 0.5 : 1) * (0.2 + 0.8 * z);
    skyMix.value = atm * Math.max(day, twi * 0.75);
    S.atmGlow = 1 - atm * day * 0.5;
  }

  // ---------- options ----------
  function applyOptions(recompute = true) {
    consGroup.visible = S.opt.lines;
    eclGroup.visible = S.opt.ecliptic;
    mw.visible = S.opt.mw;
    S.opt.ground = !S.opt.noground;
    ground.visible = S.opt.ground;
    applyAtmos();
    document.querySelectorAll('#viewbar .tog').forEach(b => b.setAttribute('aria-pressed', String(!!S.opt[b.dataset.opt])));
    if (recompute) updateSky();
    needsRender = true;
  }
  document.querySelectorAll('#viewbar .tog').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.opt; S.opt[k] = !S.opt[k];
    applyOptions(k === 'atmos' || k === 'mw');
  }));

  // ---------- formatting ----------
  const fmtDeg = x => { const d = Math.floor(x); let m = Math.round((x - d) * 60); let dd = d; if (m === 60) { m = 0; dd++; } return `${dd}°${String(m).padStart(2, '0')}′`; };
  const offStr = mins => { const s = mins < 0 ? '−' : '+'; const a = Math.abs(mins); return `UTC${s}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(Math.round(a % 60)).padStart(2, '0')}`; };
  function fmtLocal(utc) {
    let s;
    try { s = new Intl.DateTimeFormat(L.locale, { timeZone: S.tz, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(utc)); }
    catch (e) { s = new Date(utc).toUTCString(); }
    return `${s} (${offStr(C.tzOffsetMinutes(S.tz, utc))})`;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function statusChips(b) {
    const out = [], u = L.ui;
    if (b.id === 'Rahu' || b.id === 'Ketu') out.push(`<span class="chip v">${u.vakriAlways}</span>`);
    else if (b.retro) out.push(`<span class="chip v">${u.vakri}</span>`);
    if (b.stationary) out.push(`<span class="chip v">${u.stationary}</span>`);
    if (b.combust) out.push(`<span class="chip c">${u.combust}</span>`);
    if (b.phaseFraction != null && b.id !== 'Sun') {
      const p = Math.round(b.phaseFraction * 100);
      if (b.retro && b.phaseFraction > 0.985 && ['Mars', 'Jupiter', 'Saturn'].includes(b.id)) out.push(`<span class="chip g">${u.fullyLit}</span>`);
      else out.push(`<span class="chip s">${F(u.lit, { p })}</span>`);
    }
    if (b.alt < 0) out.push(`<span class="chip h">${u.below}</span>`);
    return out.join('');
  }

  // ---------- panel ----------
  function renderPanel() {
    const a = S.astro; if (!a) return;
    const moon = a.bodies[1], u = L.ui;
    $('who').textContent = S.isExample ? F(u.skyNow, { place: S.place.split(',')[0] }) : (S.name ? F(u.namedSky, { name: S.name }) : u.birthSky);
    $('when').textContent = fmtLocal(S.utc) + (S.utc !== S.baseUtc ? ' · ' + u.shifted : '');
    $('clock').textContent = fmtLocal(S.utc).replace(/ \(.*\)$/, '');
    $('legendNote').textContent = F(u.legendNote, { ayan: fmtDeg(a.ayan) });
    const mp = a.moonPhase;
    const sub = s => `<span class="sub">${esc(s)}</span>`;
    $('keyfacts').innerHTML = `
      <dt>${u.kLagna}</dt><dd><b>${esc(rName(a.lagna.sign))}</b> ${fmtDeg(a.lagna.deg)}</dd>
      <dt>${u.kRasi}</dt><dd><b>${esc(rName(moon.sign))}</b> ${u.moonSignNote}</dd>
      <dt>${u.kStar}</dt><dd><b>${esc(nName(moon.nak))}</b> · ${u.pada} ${moon.pada}</dd>
      <dt>${u.kTithi}</dt><dd>${esc(tithiText(mp.tithiNum))}</dd>
      <dt>${u.kMoon}</dt><dd>${u.phases[phaseIdx(mp.angle)]} · ${F(u.lit, { p: Math.round(mp.fraction * 100) })}</dd>`;
    const all = Object.fromEntries([...a.bodies, ...a.nodes].map(b => [b.id, b]));
    const lagnaSub = '';
    const rows = [`<tr data-id="Lagna"><td><span class="dot" style="background:${LOOK.Lagna.dot}"></span>${u.ascendant}${lagnaSub}</td><td class="deg">${esc(rName(a.lagna.sign))} ${fmtDeg(a.lagna.deg)}${sub(nName(a.lagna.nak) + ' · ' + u.pada + ' ' + a.lagna.pada)}</td><td><span class="chip h">${u.rising}</span></td></tr>`];
    for (const id of ORDER) {
      const b = all[id];
      const second = (L.code === 'en' && (id === 'Rahu' || id === 'Ketu')) ? sub(id === 'Rahu' ? u.nodeNorth : u.nodeSouth) : '';
      rows.push(`<tr data-id="${id}" class="${S.sel === id ? 'sel' : ''}"><td><span class="dot" style="background:${LOOK[id].dot}"></span>${esc(gName(id))}${second}</td>
        <td class="deg">${esc(rName(b.sign))} ${fmtDeg(b.deg)}${sub(nName(b.nak) + ' · ' + u.pada + ' ' + b.pada)}</td><td>${statusChips(b)}</td></tr>`);
    }
    $('ptable').innerHTML = rows.join('');
    drawMoonIcon(mp.angle);
  }
  $('ptable').addEventListener('click', e => {
    const tr = e.target.closest('tr'); if (!tr) return;
    if (isPhone()) setSheet('');   // phones: put the Planets sheet away so the fly-to is visible
    if (S.view !== 'sky') { const id = tr.dataset.id; if (S.view === 'aether') setView('space'); if (SP && SP.bodies[id]) { S.sel = id; renderPanel(); focusSpace(id); showTipFor(id, true); } return; }
    flyTo(tr.dataset.id);
  });

  function drawMoonIcon(phase) {
    const c = $('moonIcon'), g = c.getContext('2d'), R = 54, cx = 64, cy = 64;
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = '#1f1b14'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    const waxing = phase < 180; let s = waxing ? 1 : -1; if (S.lat < 0) s = -s;
    const cs = Math.cos(phase * DEG), rx = Math.abs(cs) * R;
    const grd = g.createRadialGradient(cx - 14, cy - 14, 6, cx, cy, R); grd.addColorStop(0, '#fbf8ef'); grd.addColorStop(1, '#cfcbbf');
    g.fillStyle = grd; g.beginPath();
    g.arc(cx, cy, R, -Math.PI / 2, Math.PI / 2, s < 0);
    g.ellipse(cx, cy, Math.max(rx, 0.01), R, 0, Math.PI / 2, -Math.PI / 2, s * cs > 0);
    g.fill();
    g.strokeStyle = 'rgba(210,174,67,0.45)'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, R + 4, 0, Math.PI * 2); g.stroke();
  }

  // ---------- camera ----------
  function camDir(az, alt) { return new THREE.Vector3(Math.sin(az * DEG) * Math.cos(alt * DEG), Math.sin(alt * DEG), -Math.cos(az * DEG) * Math.cos(alt * DEG)); }
  const FOV_MIN = 0.5, FOV_MAX = 120;
  const clampV = (x, a, b) => Math.max(a, Math.min(b, x));
  function applyCamera() {
    camera.fov = S.fov; camera.updateProjectionMatrix();
    camera.up.set(0, 1, 0); camera.lookAt(camDir(S.az, S.alt));
    camera.updateMatrixWorld();
    starMat.uniforms.uScale.value = dpr * Math.min(2.2, Math.max(0.8, Math.pow(70 / S.fov, 0.45)));
    ribbonW.value = (S.fov / 75) * (H > 0 ? Math.min(1.4, Math.max(0.75, 800 / H)) : 1);
    applyAtmos();
    fadeGlows();
    const z = 75 / S.fov; $('zoomTxt').textContent = (z < 10 ? z.toFixed(1) : Math.round(z)) + '×';
  }
  // A planet's halo is what you see when it is a point of light; as you zoom in and the disc
  // grows, the halo fades so the real surface and its lit/dark halves show cleanly.
  function fadeGlows() {
    if (!H) return;
    const k = (H / 2) / Math.tan(S.fov / 2 * DEG);
    for (const [id, o] of Object.entries(planets)) {
      if (o.baseGA == null) continue;
      const diskPx = 2 * (o.rad / o.rPos) * k;
      const floor = id === 'Sun' ? 0.35 : 0.0;
      o.glow.material.opacity = o.baseGA * S.atmGlow * clampV(1 - (diskPx - 14) / 70, floor, 1);
    }
  }
  // ---- zoom, anchored so the point under the cursor/fingers stays put ----
  const tmpU = new THREE.Vector3();
  function dirAtScreen(x, y) { return tmpU.set((x / W) * 2 - 1, -(y / H) * 2 + 1, 0.5).unproject(camera).normalize().clone(); }
  const azAltOf = v => ({ az: (Math.atan2(v.x, -v.z) / DEG + 360) % 360, alt: Math.asin(clampV(v.y, -1, 1)) / DEG });
  function setFovAnchored(fov, x, y, dir) {
    S.fov = clampV(fov, FOV_MIN, FOV_MAX); applyCamera();
    for (let i = 0; i < 3; i++) {
      const a1 = azAltOf(dir), a2 = azAltOf(dirAtScreen(x, y));
      S.az = (S.az + (((a1.az - a2.az + 540) % 360) - 180) + 360) % 360;
      S.alt = clampV(S.alt + (a1.alt - a2.alt), -89, 89); applyCamera();
    }
    needsRender = true;
  }
  let zoomAnim = null;
  function zoomTo(target, x, y) {
    fly = null;
    const ax = x == null ? W / 2 : x, ay = y == null ? H / 2 : y;
    zoomAnim = { target: clampV(target, FOV_MIN, FOV_MAX), x: ax, y: ay, dir: dirAtScreen(ax, ay) };
  }
  function stepZoom() {
    if (!zoomAnim) return;
    let f = Math.exp(Math.log(S.fov) + (Math.log(zoomAnim.target) - Math.log(S.fov)) * 0.26);
    if (Math.abs(Math.log(f / zoomAnim.target)) < 0.002) f = zoomAnim.target;
    setFovAnchored(f, zoomAnim.x, zoomAnim.y, zoomAnim.dir);
    if (f === zoomAnim.target) zoomAnim = null;
  }
  const zoomTarget = () => zoomAnim ? zoomAnim.target : S.fov;
  $('zIn').addEventListener('click', () => S.view === 'aether' ? aetherZoom(-1) : S.view === 'space' ? spaceZoom(0.3) : zoomTo(zoomTarget() / 2.5));
  $('zOut').addEventListener('click', () => S.view === 'aether' ? aetherZoom(1) : S.view === 'space' ? spaceZoom(3.3) : zoomTo(zoomTarget() * 2.5));
  $('zFit').addEventListener('click', () => zoomTo(isPhone() ? 95 : 78));
  let fly = null;
  function worldOf(id) {
    const a = S.astro; if (!a) return null;
    let v;
    if (id === 'Lagna') v = a.lagna.dir;
    else if (id.startsWith('star:')) { const i = +id.slice(5) * 3; v = [starDir[i], starDir[i + 1], starDir[i + 2]]; }
    else if (id.startsWith('con:')) { const c = CONS[id.slice(4)]; if (!c) return null; v = C.radecVec(c.ra, c.de); }
    else { const b = [...a.bodies, ...a.nodes].find(x => x.id === id); if (!b) return null; v = b.dir; }
    return new THREE.Vector3(...v).applyMatrix4(skyM);
  }
  // sidereal rasi / nakshatra of any sky direction (J2000 unit vector)
  function siderealOf(v) {
    const r = S.astro.rEqjEct.rot;
    const x = r[0][0] * v[0] + r[1][0] * v[1] + r[2][0] * v[2], y = r[0][1] * v[0] + r[1][1] * v[1] + r[2][1] * v[2], z = r[0][2] * v[0] + r[1][2] * v[1] + r[2][2] * v[2];
    const sid = C.norm360(Math.atan2(y, x) / DEG - S.astro.ayan);
    const nak = Math.floor(sid / (360 / 27));
    return { sign: Math.floor(sid / 30), deg: sid % 30, nak, pada: Math.floor((sid - nak * 360 / 27) / (360 / 108)) + 1, lat: Math.asin(Math.max(-1, Math.min(1, z))) / DEG };
  }
  function flyTo(id, instant) {
    const w = worldOf(id); if (!w) return;
    S.sel = id;
    const alt = Math.asin(w.y) / DEG, az = (Math.atan2(w.x, -w.z) / DEG + 360) % 360;
    if (alt < -1 && S.opt.ground && !S.opt.see) { S.opt.see = true; applyOptions(false); toast(L.ui.toastGround); }
    // close-up: the disc (with Saturn's rings) fills about a third of the screen height
    const o = planets[id];
    const fov = id === 'Lagna' ? Math.max(S.fov, 60) : o ? clampV(o.diam * (o.ring ? 2.3 : 1) * 3.2, FOV_MIN, 30)
      : id.startsWith('star:') ? Math.min(S.fov, 24) : id.startsWith('con:') ? clampV(S.fov, 45, 70) : Math.min(S.fov, 30);
    if (id.startsWith('con:') || id.startsWith('star:')) { if (!S.opt.lines && id.startsWith('con:')) { S.opt.lines = true; applyOptions(false); } }
    zoomAnim = null;
    if (instant) { S.az = az; S.alt = Math.max(-89, Math.min(89, alt)); S.fov = fov; applyCamera(); }
    else fly = { t0: performance.now(), dur: 1300, from: { az: S.az, alt: S.alt, fov: S.fov }, to: { az, alt: Math.max(-89, Math.min(89, alt)), fov } };
    renderPanel(); showTipFor(id, true); needsRender = true;
  }

  // ---------- overlay labels ----------
  const tmpV = new THREE.Vector3();
  let W = 1, H = 1;
  function project(world) {
    tmpV.copy(world).applyMatrix4(camera.matrixWorldInverse);
    if (tmpV.z > -1) return null;
    tmpV.applyMatrix4(camera.projectionMatrix);
    if (Math.abs(tmpV.x) > 1.2 || Math.abs(tmpV.y) > 1.2) return null;
    return { x: (tmpV.x + 1) / 2 * W, y: (1 - tmpV.y) / 2 * H };
  }
  function belowAlpha(world) {
    const y = world.y / world.length();
    if (y >= 0 || !S.opt.ground) return 1;
    return S.opt.see ? 0.45 : 0;
  }
  const pxPerRad = () => (H / 2) / Math.tan(S.fov / 2 * DEG);
  const W3 = new THREE.Vector3();
  function drawOverlay() {
    const g = octx; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    g.textBaseline = 'middle';
    const a = S.astro; if (!a) return;
    if (S.opt.labels) {
      // constellations
      for (const c of consLabels) {
        if (!c.zod && !S.opt.lines) continue;
        W3.copy(c.pos).applyMatrix4(skyM); const al = belowAlpha(W3); if (!al) continue;
        const p = project(W3); if (!p) continue;
        g.globalAlpha = al; g.textAlign = 'center';
        if (c.zod) {
          // English: the IAU name (LEO). Other modes: the rasi name alone, same size (THULAM / துலாம்)
          const latin = !L.native;
          const txt = L.code === 'en' ? c.name.toUpperCase() : rName(c.zi);
          g.font = latin ? '600 15px "Source Serif 4", Georgia, serif' : `600 15px ${FONT}`; g.fillStyle = '#f1d797';
          g.fillText(latin ? txt.toUpperCase().split('').join(' ') : txt, p.x, p.y);
        } else if (S.fov < 110) {
          g.font = `400 11px ${FONT}`; g.fillStyle = 'rgba(196,186,162,0.62)';
          g.fillText(c.name, p.x, p.y);
        }
      }
      // bright stars
      g.textAlign = 'left';
      const magLim = S.fov > 70 ? 1.4 : S.fov > 35 ? 2.0 : 2.6;
      g.font = `400 11px ${FONT}`;
      for (const s of starLabels) {
        if (s.mag > magLim) continue;
        W3.copy(s.pos).applyMatrix4(skyM); const al = belowAlpha(W3); if (!al) continue;
        const p = project(W3); if (!p) continue;
        g.globalAlpha = al * 0.8; g.fillStyle = '#ddd5c4'; g.fillText(s.name, p.x + 7, p.y - 6);
      }
      // rasi belt
      if (S.opt.ecliptic) {
        g.textAlign = 'center'; g.font = `500 12px ${FONT}`;
        for (const r of rasiLabels) {
          W3.copy(r.pos).applyMatrix4(skyM); const al = belowAlpha(W3); if (!al) continue;
          const p = project(W3); if (!p) continue;
          // the sign's name in an outlined pill, so it reads as the box's label, not a star figure's
          const txt = F(L.ui.belt, { r: rName(r.k) }), w = g.measureText(txt).width + 16, h = 20;
          g.globalAlpha = al * 0.9;
          g.beginPath();
          if (g.roundRect) g.roundRect(p.x - w / 2, p.y - h / 2, w, h, 10); else g.rect(p.x - w / 2, p.y - h / 2, w, h);
          g.fillStyle = 'rgba(14,12,9,0.72)'; g.fill();
          g.strokeStyle = 'rgba(236,228,208,0.55)'; g.lineWidth = 1; g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]);
          g.fillStyle = '#ece4d0'; g.fillText(txt, p.x, p.y + 0.5);
        }
      }
    }
    // cardinal points
    g.textAlign = 'center'; g.font = `600 13px ${FONT}`;
    const CARD = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];
    for (const [t, az] of CARD) {
      W3.set(Math.sin(az * DEG), 0.0, -Math.cos(az * DEG)).multiplyScalar(R_GROUND);
      const p = project(W3); if (!p) continue;
      g.globalAlpha = t.length === 1 ? 0.95 : 0.55; g.fillStyle = t === 'E' ? '#f1d797' : '#aab4d0';
      g.fillText(t, p.x, p.y + 16);
    }
    // nodes + lagna markers
    const k = pxPerRad();
    const markers = [...a.nodes.map(n => ({ id: n.id, dir: n.dir, label: (n.id === 'Rahu' ? '☊ ' : '☋ ') + gName(n.id) })), { id: 'Lagna', dir: a.lagna.dir, label: `${L.ui.kLagna} ↑ ${rName(a.lagna.sign)}` }];
    for (const m of markers) {
      W3.set(...m.dir).multiplyScalar(R_LINE).applyMatrix4(skyM);
      const al = m.id === 'Lagna' ? 1 : belowAlpha(W3); if (!al) continue;
      const p = project(W3); if (!p) continue;
      g.globalAlpha = al; g.strokeStyle = LOOK[m.id].dot; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(p.x, p.y - 6); g.lineTo(p.x + 6, p.y); g.lineTo(p.x, p.y + 6); g.lineTo(p.x - 6, p.y); g.closePath(); g.stroke();
      g.font = `500 12px ${FONT}`; g.fillStyle = LOOK[m.id].dot; g.textAlign = 'left';
      g.fillText(m.label, p.x + 10, p.y);
      if (S.sel === m.id) { g.beginPath(); g.arc(p.x, p.y, 13, 0, Math.PI * 2); g.stroke(); }
    }
    // planets
    const placed = [];
    for (const b of a.bodies) {
      const o = planets[b.id];
      W3.copy(o.mesh.position).applyMatrix4(skyM); const al = belowAlpha(W3); if (!al) continue;
      const p = project(W3); if (!p) continue;
      const rp = Math.max(4, (o.rad / o.rPos) * k) * (o.ring ? 2.2 : 1);
      g.globalAlpha = al; g.textAlign = 'left';
      g.font = `600 12.5px ${FONT}`; g.fillStyle = LOOK[b.id].dot;
      const nm = planetLabel(b.id);
      const lx = p.x + rp + 8, lw = g.measureText(nm).width + (b.retro ? 60 : 0);
      let ly = p.y - 1;
      // stack labels of planets that sit close together (conjunctions) instead of overprinting
      for (let tries = 0; tries < 8 && placed.some(r => Math.abs(r.y - ly) < 15 && lx < r.x + r.w && r.x < lx + lw); tries++) ly += 15;
      placed.push({ x: lx, y: ly, w: lw });
      g.fillText(nm, lx, ly);
      if (b.retro) {
        const w = g.measureText(nm).width;
        g.font = `600 10.5px ${FONT}`; g.fillStyle = '#E4868D'; g.fillText(L.ui.vakriTag, lx + 6 + w, ly);
      }
      if (S.sel === b.id && rp < 60) { g.strokeStyle = 'rgba(241,215,151,0.8)'; g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y, rp + 5, 0, Math.PI * 2); g.stroke(); }
    }
    // selected / hovered star or constellation
    for (const id of new Set([S.sel, tipFor])) {
      if (!id || !(id.startsWith('star:') || id.startsWith('con:'))) continue;
      const p = screenOf(id); if (!p) continue;
      const isSel = id === S.sel;
      g.globalAlpha = 1; g.strokeStyle = isSel ? 'rgba(241,215,151,0.95)' : 'rgba(241,215,151,0.6)'; g.lineWidth = isSel ? 1.8 : 1.2;
      if (id.startsWith('star:')) {
        g.beginPath(); g.arc(p.x, p.y, isSel ? 11 : 9, 0, Math.PI * 2); g.stroke();
        if (isSel) { g.font = `600 12.5px ${FONT}`; g.fillStyle = '#f5e3b4'; g.textAlign = 'left'; g.fillText(starName(+id.slice(5)), p.x + 16, p.y - 12); }
      } else if (isSel) {
        g.setLineDash([4, 5]); g.beginPath(); g.arc(p.x, p.y, 34, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      }
    }
    g.globalAlpha = 1;
    if (tipFor) positionTip();
  }

  // ---------- tooltip / picking ----------
  const tip = $('tip'); let tipFor = null, tipPinned = false;
  const colourWord = bv => L.ui.colours[bv < 0 ? 0 : bv < 0.3 ? 1 : bv < 0.6 ? 2 : bv < 0.85 ? 3 : bv < 1.4 ? 4 : 5];
  const signLine = (sign, deg, nak, pada) => `<p><b>${esc(rName(sign))}</b> ${fmtDeg(deg)}</p><p>${esc(nName(nak))} · ${L.ui.pada} ${pada}</p>`;
  function altAzLine(w, extra) {
    const alt = Math.asin(clampV(w.y, -1, 1)) / DEG, az = (Math.atan2(w.x, -w.z) / DEG + 360) % 360;
    return `<p>${L.ui.alt} <b>${alt.toFixed(1)}°</b> · ${L.ui.az} ${az.toFixed(0)}°${alt < 0 ? ' · ' + L.ui.belowH : ''}${extra ? ' · ' + extra : ''}</p>`;
  }
  function starInfo(i) {
    const [nm, desig, con] = SINFO[i], mag = D.stars[i * 4 + 2], bv = D.stars[i * 4 + 3];
    const al = ALIAS[i] || [], c = CONS[con];
    const title = al.length ? `${aliasName(al[0])} · ${nm || desig}` : (nm || desig);
    let h = `<h3>${esc(title)}</h3>`;
    if (nm) h += `<p>${esc(desig)}</p>`;
    for (const k of al) { const n = aliasNote(k); if (n) h += `<p style="color:var(--gold)">${esc(n)}</p>`; }
    if (c) { const zi = ZOD_IDX[con]; h += zi == null ? `<p>${F(L.ui.inCon, { c: esc(c.name) })}</p>` : `<p>${F(L.ui.inCon, { c: esc(L.code === 'en' ? c.name : rName(zi)) })}, ${L.ui.zodCon}</p>`; }
    h += `<p>${L.ui.mag} <b>${mag.toFixed(1)}</b> · ${colourWord(bv)} ${L.ui.star} · ${L.ui.vis[mag < 2 ? 0 : mag < 4.5 ? 1 : 2]}</p>`;
    const s = siderealOf([starDir[i * 3], starDir[i * 3 + 1], starDir[i * 3 + 2]]);
    h += `<p>${L.ui.sidPos} <b>${esc(rName(s.sign))} ${fmtDeg(s.deg)}</b> · ${esc(nName(s.nak))} ${L.ui.pada} ${s.pada}</p>`;
    return h + altAzLine(worldOf('star:' + i));
  }
  function conInfo(id) {
    const c = CONS[id]; if (!c) return '';
    let best = -1; for (let i = 0; i < NS; i++) if (SINFO[i][2] === id && (best < 0 || D.stars[i * 4 + 2] < D.stars[best * 4 + 2])) best = i;
    const zi = ZOD_IDX[id], title = zi != null && L.code !== 'en' ? rName(zi) : c.name;
    let h = `<h3>${esc(title)}</h3><p>${zi != null ? (L.code === 'en' ? `${L.ui.zodiacCon} · <b style="color:var(--accent-ink)">${esc(rName(zi))}</b>` : L.ui.zodiacCon) : L.ui.constellation}</p>`;
    if (best >= 0) h += `<p>${L.ui.brightest}: <b>${esc(starName(best))}</b>, ${L.ui.mag} ${D.stars[best * 4 + 2].toFixed(1)}</p>`;
    return h + altAzLine(worldOf('con:' + id));
  }
  function infoFor(id) {
    const a = S.astro; if (!a) return '';
    if (S.view === 'space' && id !== 'Lagna') return infoSpace(id);
    if (id.startsWith('star:')) return starInfo(+id.slice(5));
    if (id.startsWith('con:')) return conInfo(id.slice(4));
    if (id === 'Lagna') {
      const l = a.lagna;
      return `<h3>${L.ui.ascendant}</h3>${signLine(l.sign, l.deg, l.nak, l.pada)}<p>${L.ui.lagnaDesc}</p>`;
    }
    const b = [...a.bodies, ...a.nodes].find(x => x.id === id); if (!b) return '';
    let h = `<h3>${esc(planetLabel(b.id))}</h3>${signLine(b.sign, b.deg, b.nak, b.pada)}`;
    if (b.id === 'Rahu' || b.id === 'Ketu') return h + `<p>${L.ui.node}</p>` + altAzLine(worldOf(b.id));
    if (b.retro) {
      h += `<p>${F(L.ui.retroLine, { w: `<b style="color:var(--retro)">${L.ui.vakri}</b>`, s: Math.abs(b.speed).toFixed(3) })}</p>`;
      if (b.phaseFraction > 0.985 && ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'].includes(b.id)) h += `<p>${L.ui.opposite}</p>`;
    } else if (b.id !== 'Sun' && b.id !== 'Moon') h += `<p>${F(L.ui.direct, { s: b.speed.toFixed(3) })}</p>`;
    if (b.combust) h += `<p>${F(L.ui.combustLine, { w: `<b style="color:var(--text)">${L.ui.combust}</b>`, d: b.sunSep.toFixed(1) })}</p>`;
    if (b.id === 'Moon') { const mp = a.moonPhase; h += `<p>${F(L.ui.moonLit, { ph: L.ui.phases[phaseIdx(mp.angle)], p: Math.round(mp.fraction * 100) })}</p><p>${esc(tithiText(mp.tithiNum, true))}</p>`; }
    else if (b.id !== 'Sun') h += `<p>${F(L.ui.litLine, { p: Math.round(b.phaseFraction * 100), m: b.mag.toFixed(1) })}</p>`;
    const dist = b.id === 'Moon' ? `${Math.round(b.dist * 149597870.7).toLocaleString('en-IN')} km` : `${b.dist.toFixed(2)} AU`;
    return h + altAzLine(worldOf(b.id), dist);
  }
  function showTipFor(id, pin) {
    tipFor = id; tipPinned = !!pin; needsRender = true;
    if (!id) { tip.hidden = true; return; }
    tip.innerHTML = infoFor(id); tip.hidden = false; positionTip();
  }
  function screenOf(id) {
    const a = S.astro;
    if (planets[id]) { W3.copy(planets[id].mesh.position).applyMatrix4(skyM); }
    else { const w = worldOf(id); if (!w) return null; W3.copy(w).multiplyScalar(R_LINE); }
    return project(W3);
  }
  function positionTip() {
    const p = S.view === 'space' ? posSpace[tipFor] : screenOf(tipFor);
    if (!p) { tip.style.left = '-9999px'; return; }
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const o = S.view === 'space' ? null : planets[tipFor];
    const rp = S.view === 'space' ? Math.min(W / 3, p.r || 6) : o ? Math.min(W / 3, (o.rad / o.rPos) * pxPerRad() * (o.ring ? 2.2 : 1)) : 0;
    let x = p.x + rp + 22, y = p.y + Math.min(rp, 40) + 18;
    if (x + tw > W - 10) x = p.x - rp - tw - 22;
    if (y + th > H - 10) y = p.y - th - 18;
    tip.style.left = Math.max(10, x) + 'px'; tip.style.top = Math.max(10, y) + 'px';
  }
  function pick(x, y) {
    const a = S.astro; if (!a) return null;
    let best = null, bd = 26;
    const ids = [...a.bodies.map(b => b.id), 'Rahu', 'Ketu', 'Lagna'];
    for (const id of ids) {
      const p = screenOf(id); if (!p) continue;
      if (planets[id]) { W3.copy(planets[id].mesh.position).applyMatrix4(skyM); if (!belowAlpha(W3)) continue; }
      const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = id; }
    }
    return best || pickStar(x, y);
  }
  // nearest visible star to the pointer; brighter stars get a slightly larger target
  const skyInv = new THREE.Matrix4();
  function pickStar(x, y) {
    skyInv.copy(skyM).transpose();
    const d = dirAtScreen(x, y).applyMatrix4(skyInv);
    const pxRad = (S.fov * DEG) / H, maxAng = 16 * pxRad, cosMax = Math.cos(maxAng);
    const magLim = S.fov > 60 ? 4.8 : S.fov > 25 ? 5.6 : 6.5;
    let best = -1, bs = 1e9;
    for (let i = 0; i < NS; i++) {
      const dot = d.x * starDir[i * 3] + d.y * starDir[i * 3 + 1] + d.z * starDir[i * 3 + 2];
      if (dot < cosMax) continue;
      const mag = D.stars[i * 4 + 2]; if (mag > magLim) continue;
      const px = Math.acos(Math.min(1, dot)) / pxRad;
      const score = px - Math.max(0, 4.5 - mag) * 1.6;
      if (px < 7 + Math.max(0, 4 - mag) * 2 && score < bs) { bs = score; best = i; }
    }
    if (best < 0) return null;
    W3.set(starDir[best * 3], starDir[best * 3 + 1], starDir[best * 3 + 2]).applyMatrix4(skyM);
    return belowAlpha(W3) ? 'star:' + best : null;
  }

  // ---------- input ----------
  let cRect = { left: 0, top: 0 };
  const lx = e => e.clientX - cRect.left, ly = e => e.clientY - cRect.top;
  const pointers = new Map(); let dragMoved = 0, pinchD = 0;
  glCanvas.addEventListener('pointerdown', e => {
    closeSheet();   // touching the sky puts away an open Birth / Planets / Display sheet
    try { glCanvas.setPointerCapture(e.pointerId); } catch (err) { }
    pointers.set(e.pointerId, { x: lx(e), y: ly(e) });
    dragMoved = 0; fly = null; zoomAnim = null; glCanvas.classList.add('dragging');
    if (pointers.size === 2) { const [p1, p2] = [...pointers.values()]; pinchD = Math.hypot(p1.x - p2.x, p1.y - p2.y); }
  });
  glCanvas.addEventListener('pointermove', e => {
    const prev = pointers.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'mouse' && !tipPinned) { const id = pick(lx(e), ly(e)); if (id !== tipFor) showTipFor(id, false); glCanvas.style.cursor = id ? 'pointer' : ''; }
      return;
    }
    const cur = { x: lx(e), y: ly(e) };
    if (pointers.size === 1) {
      const k = S.fov / H, dx = cur.x - prev.x, dy = cur.y - prev.y;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      S.az = (S.az - dx * k + 360) % 360; S.alt = Math.max(-89, Math.min(89, S.alt + dy * k));
    } else if (pointers.size === 2) {
      pointers.set(e.pointerId, cur);
      const [p1, p2] = [...pointers.values()]; const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      if (pinchD && d > 0) { zoomAnim = null; setFovAnchored(S.fov * pinchD / d, mx, my, dirAtScreen(mx, my)); }
      pinchD = d; dragMoved += 10;
    }
    pointers.set(e.pointerId, cur); applyCamera(); needsRender = true;
  });
  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId); glCanvas.classList.remove('dragging');
    if (pointers.size < 2) pinchD = 0;
    if (dragMoved < 6 && pointers.size === 0) {
      // double-click / double-tap: close-up on a planet, otherwise zoom in 2.5× at that spot
      const now = performance.now();
      if (lastTap && now - lastTap.t < 320 && Math.hypot(lx(e) - lastTap.x, ly(e) - lastTap.y) < 30) {
        lastTap = null;
        const hit = pick(lx(e), ly(e));
        if (hit && planets[hit]) flyTo(hit); else zoomTo(zoomTarget() / 3, lx(e), ly(e));
        return;
      }
      lastTap = { t: now, x: lx(e), y: ly(e) };
      const id = pick(lx(e), ly(e));
      if (id) { S.sel = id; showTipFor(id, true); renderPanel(); }
      else { S.sel = null; showTipFor(null); renderPanel(); }
      needsRender = true;
    }
  }
  glCanvas.addEventListener('pointerup', endPointer);
  glCanvas.addEventListener('pointercancel', endPointer);
  let lastTap = null;
  glCanvas.addEventListener('wheel', e => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    zoomTo(zoomTarget() * Math.exp(clampV(dy, -300, 300) * 0.0047), lx(e), ly(e));
  }, { passive: false });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSheet();
    if (e.target && e.target.closest && e.target.closest('input,select,textarea')) return;
    const step = { ArrowLeft: [-3, 0], ArrowRight: [3, 0], ArrowUp: [0, 3], ArrowDown: [0, -3] }[e.key];
    if (step) { S.az = (S.az + step[0] + 360) % 360; S.alt = Math.max(-89, Math.min(89, S.alt + step[1])); applyCamera(); needsRender = true; }
    if (e.key === '+' || e.key === '=') zoomTo(zoomTarget() / 2);
    if (e.key === '-' || e.key === '_') zoomTo(zoomTarget() * 2);
  });

  // ---------- time controls ----------
  document.querySelectorAll('#timebar [data-step]').forEach(b => b.addEventListener('click', () => { S.utc += (+b.dataset.step) * 60000; updateSky(); refreshTip(); }));
  $('btnReset').addEventListener('click', () => { S.utc = S.baseUtc; S.playing = false; syncPlay(); updateSky(); refreshTip(); });
  $('btnPlay').addEventListener('click', () => { S.playing = !S.playing; syncPlay(); });
  $('speed').addEventListener('change', e => { S.speed = +e.target.value; });
  function syncPlay() { const b = $('btnPlay'); b.textContent = S.playing ? L.ui.pause : L.ui.play; b.setAttribute('aria-pressed', String(S.playing)); lastT = performance.now(); }
  function refreshTip() { if (tipFor) tip.innerHTML = infoFor(tipFor); }

  // ---------- form ----------
  // Date of birth is typed as DD/MM/YYYY (slashes added automatically); the app works with YYYY-MM-DD.
  const fDate = $('fDate');
  function isoDate() {
    const m = fDate.value.trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
    if (!m) return '';
    const d = +m[1], mo = +m[2], y = +m[3];
    const t = new Date(Date.UTC(y, mo - 1, d));
    if (y < 1000 || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return '';
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  function setIsoDate(iso) { const [y, m, d] = iso.split('-'); fDate.value = `${d}/${m}/${y}`; }
  fDate.addEventListener('input', e => {
    if (e.inputType && e.inputType.startsWith('delete')) return;   // let backspace work naturally
    const digits = fDate.value.replace(/\D/g, '').slice(0, 8);
    let out = digits.slice(0, 2);
    if (digits.length > 2) out += '/' + digits.slice(2, 4);
    if (digits.length > 4) out += '/' + digits.slice(4);
    if (digits.length === 2 || digits.length === 4) out += '/';
    fDate.value = out;
  });
  fDate.addEventListener('blur', () => { const iso = isoDate(); if (iso) setIsoDate(iso); placeHint(); });
  const fTz = $('fTz');
  (function fillTz() {
    let zones = [];
    try { zones = Intl.supportedValuesOf('timeZone'); } catch (e) { }
    const extra = [...new Set(window.CITIES.map(c => c[4]))];
    zones = [...new Set(['Asia/Kolkata', ...extra, ...zones])].sort();
    fTz.innerHTML = zones.map(z => `<option value="${z}">${z.replace(/_/g, ' ')}</option>`).join('');
  })();
  function setPlace(name, lat, lon, tz) {
    $('fPlace').value = name; $('fLat').value = (+lat).toFixed(4); $('fLon').value = (+lon).toFixed(4);
    if (![...fTz.options].some(o => o.value === tz)) fTz.insertAdjacentHTML('beforeend', `<option value="${tz}">${tz}</option>`);
    fTz.value = tz; placeHint();
  }
  function placeHint() {
    const lat = +$('fLat').value, lon = +$('fLon').value, tz = fTz.value;
    if (!$('fLat').value) { $('placeInfo').textContent = ''; return; }
    let off = '';
    const d = isoDate(), t = $('fTime').value;
    if (d && t) { const [y, m, dd] = d.split('-').map(Number), [hh, mi] = t.split(':').map(Number); off = ' · ' + offStr(C.tzOffsetMinutes(tz, C.localToUtc(y, m, dd, hh, mi, 0, tz))) + ' ' + L.ui.onDate; }
    $('placeInfo').innerHTML = `<b>${Math.abs(lat).toFixed(3)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(3)}°${lon >= 0 ? 'E' : 'W'}</b> · ${tz.replace(/_/g, ' ')}${off}`;
  }
  ['fLat', 'fLon', 'fTz', 'fDate', 'fTime'].forEach(id => $(id).addEventListener('change', placeHint));

  const list = $('placeList'), fPlace = $('fPlace'); let listItems = [], listIdx = -1;
  function renderList() {
    list.innerHTML = listItems.map((c, i) => c.search
      ? `<button type="button" data-i="${i}" class="${i === listIdx ? 'active' : ''}">${F(L.ui.searchWorld, { q: esc(c.q) })}<small>${L.ui.needsNet}</small></button>`
      : `<button type="button" data-i="${i}" class="${i === listIdx ? 'active' : ''}">${esc(c[0])}<small>${esc(c[1])}</small></button>`).join('');
    list.hidden = listItems.length === 0; fPlace.setAttribute('aria-expanded', String(!list.hidden));
  }
  fPlace.addEventListener('input', () => {
    const q = fPlace.value.trim().toLowerCase(); listIdx = -1;
    if (!q) { listItems = []; renderList(); return; }
    const starts = window.CITIES.filter(c => c[0].toLowerCase().startsWith(q));
    const incl = window.CITIES.filter(c => !c[0].toLowerCase().startsWith(q) && (c[0] + ' ' + c[1]).toLowerCase().includes(q));
    listItems = [...starts, ...incl].slice(0, 8);
    if (q.length >= 3) listItems.push({ search: true, q: fPlace.value.trim() });
    renderList();
  });
  fPlace.addEventListener('keydown', e => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { listIdx = Math.min(listItems.length - 1, listIdx + 1); renderList(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { listIdx = Math.max(0, listIdx - 1); renderList(); e.preventDefault(); }
    else if (e.key === 'Enter' && listIdx >= 0) { e.preventDefault(); choose(listIdx); }
    else if (e.key === 'Escape') { listItems = []; renderList(); }
  });
  list.addEventListener('mousedown', e => e.preventDefault());
  list.addEventListener('click', e => { const b = e.target.closest('button'); if (b) choose(+b.dataset.i); });
  fPlace.addEventListener('blur', () => setTimeout(() => { listItems = []; renderList(); }, 150));
  async function choose(i) {
    const c = listItems[i]; if (!c) return;
    if (!c.search) { setPlace(`${c[0]}, ${c[1]}`, c[2], c[3], c[4]); listItems = []; renderList(); return; }
    list.innerHTML = `<button type="button" disabled>${L.ui.searching}</button>`;
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(c.q)}&count=7&language=en&format=json`);
      const j = await r.json();
      const res = (j.results || []).map(x => [x.name, [x.admin1, x.country].filter(Boolean).join(', '), x.latitude, x.longitude, x.timezone || 'UTC']);
      if (!res.length) { toast(L.ui.toastNoPlace); listItems = []; renderList(); return; }
      listItems = res; listIdx = 0; renderList();
    } catch (err) {
      listItems = []; renderList();
      $('advanced').open = true;
      toast(L.ui.toastSearch);
    }
  }

  $('birth').addEventListener('submit', e => {
    e.preventDefault();
    const d = isoDate(), t = $('fTime').value;
    const lat = parseFloat($('fLat').value), lon = parseFloat($('fLon').value);
    if (!d || !t) { toast(L.ui.toastDate + ' (DD/MM/YYYY)'); return; }
    if (!isFinite(lat) || !isFinite(lon)) { toast(L.ui.toastPlace); $('advanced').open = true; return; }
    const [y, m, dd] = d.split('-').map(Number), [hh, mi] = t.split(':').map(Number);
    Object.assign(S, { lat, lon, tz: fTz.value, place: fPlace.value || `${lat.toFixed(2)}, ${lon.toFixed(2)}`, name: $('fName').value.trim(), isExample: false });
    S.baseUtc = S.utc = C.localToUtc(y, m, dd, hh, mi, 0, S.tz);
    S.playing = false; syncPlay();
    try { localStorage.setItem('janmaVaanam', JSON.stringify({ d, t, lat, lon, tz: S.tz, place: S.place, name: S.name })); } catch (err) { }
    $('exampleNote').textContent = ''; showExample = false;
    updateSky(); pointDefault(); if (isPhone()) setSheet('grahas');
  });
  $('btnNow').addEventListener('click', () => {
    const lat = parseFloat($('fLat').value), lon = parseFloat($('fLon').value);
    if (isFinite(lat) && isFinite(lon)) Object.assign(S, { lat, lon, tz: fTz.value, place: fPlace.value || S.place });
    S.baseUtc = S.utc = Date.now(); S.isExample = true; S.name = '';
    updateSky(); pointDefault(); if (isPhone()) setSheet('grahas');
  });

  // ---------- finder: planets, every star, constellations ----------
  const GREEK_NAMES = { 'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'ε': 'epsilon', 'ζ': 'zeta', 'η': 'eta', 'θ': 'theta', 'ι': 'iota', 'κ': 'kappa', 'λ': 'lambda', 'μ': 'mu', 'ν': 'nu', 'ξ': 'xi', 'ο': 'omicron', 'π': 'pi', 'ρ': 'rho', 'σ': 'sigma', 'τ': 'tau', 'υ': 'upsilon', 'φ': 'phi', 'χ': 'chi', 'ψ': 'psi', 'ω': 'omega' };
  const normQ = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[¹²³⁴⁵⁶⁷⁸⁹]/g, '').replace(/\s+/g, ' ').trim();
  // Every entry can be found by its name in any of the languages; it is shown in the current one.
  const PACKS = I.codes.map(c => I.pack(c));
  const allNames = fn => [...new Set(PACKS.map(fn).filter(Boolean).map(normQ))];
  const FIND = [];
  ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Rahu', 'Ketu'].forEach(id => {
    FIND.push({ id, ic: '●', t: () => planetLabel(id), s: () => id === 'Rahu' || id === 'Ketu' ? L.ui.lunarNode : L.ui.planet, keys: allNames(p => p.t.graha[id]), rank: 0 });
  });
  FIND.push({ id: 'Lagna', ic: '↑', t: () => L.ui.ascendant, s: () => L.ui.risingPoint, keys: ['lagna', 'ascendant', ...allNames(p => p.ui.kLagna)], rank: 0 });
  for (const [key, idx] of D.alias) FIND.push({ id: 'star:' + idx, ic: '✦', t: () => `${aliasName(key)} · ${SINFO[idx][0] || SINFO[idx][1]}`, s: () => aliasNote(key), keys: allNames(p => aliasName(key, p)), rank: 1 });
  for (const c of Object.values(CONS)) {
    const zi = ZOD_IDX[c.id];
    FIND.push({ id: 'con:' + c.id, ic: '✧', t: () => zi != null && L.code !== 'en' ? rName(zi) : c.name, s: () => zi != null ? (L.code === 'en' ? `${L.ui.zodiacCon} · ${rName(zi)}` : L.ui.zodiacCon) : L.ui.constellation,
      keys: [normQ(c.name), c.id.toLowerCase()].concat(zi != null ? allNames(p => p.t.rasi[zi]) : []), rank: zi != null ? 1.5 : 3 });
  }
  for (let i = 0; i < NS; i++) {
    const [nm, desig, con] = SINFO[i], mag = D.stars[i * 4 + 2];
    const keys = []; if (nm) keys.push(normQ(nm));
    const parts = normQ(desig).split(' '), first = parts[0], genit = parts.slice(1).join(' '), ab = con.toLowerCase();
    keys.push(parts.join(' '));
    if (GREEK_NAMES[first]) keys.push(`${GREEK_NAMES[first]} ${genit}`, `${first} ${ab}`, `${GREEK_NAMES[first]} ${ab}`);
    else if (/^\d+$/.test(first)) keys.push(`${first} ${ab}`);
    const sub = `${nm ? desig + ' · ' : ''}${CONS[con] ? CONS[con].name : con} · mag ${mag.toFixed(1)}`;
    FIND.push({ id: 'star:' + i, ic: '★', t: () => nm || desig, s: () => sub, keys, rank: (nm ? 2 : desig.startsWith('HIP') ? 5 : 3) + mag / 10 });
  }
  const SUGGEST = ['Moon', 'Jupiter', 'Saturn', 'star:2244', 'star:2856', 'star:874', 'star:433', 'star:2851', 'con:Ori', 'con:Leo'];
  function findSearch(q) {
    const qn = normQ(q);
    if (!qn) return SUGGEST.map(s => FIND.find(f => f.id === s)).filter(Boolean);
    const res = [];
    for (const f of FIND) {
      let sc = 9;
      for (const k of f.keys) { const v = k === qn ? 0 : k.startsWith(qn) ? 1 : k.includes(' ' + qn) ? 2 : k.includes(qn) ? 3 : 9; if (v < sc) sc = v; }
      if (sc < 9) res.push([sc, f.rank, f]);
    }
    res.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return res.slice(0, 10).map(r => r[2]);
  }
  const fFind = $('fFind'), findList = $('findList'); let findItems = [], findIdx = -1;
  function renderFind(header) {
    findList.innerHTML = (header ? `<div class="hd">${header}</div>` : '') + (findItems.length ? findItems.map((f, i) =>
      `<button type="button" data-i="${i}" class="${i === findIdx ? 'active' : ''}"><span class="ic">${f.ic}</span><span class="t">${esc(f.t())}</span><span class="s">${esc(f.s())}</span></button>`).join('')
      : `<div class="hd">${L.ui.noneFound}</div>`);
    findList.hidden = false; fFind.setAttribute('aria-expanded', 'true');
  }
  function closeFind() { findList.hidden = true; findItems = []; fFind.setAttribute('aria-expanded', 'false'); }
  function openFind() { findItems = findSearch(fFind.value); findIdx = fFind.value.trim() ? 0 : -1; renderFind(fFind.value.trim() ? '' : L.ui.tryThese); }
  fFind.addEventListener('focus', openFind);
  fFind.addEventListener('input', openFind);
  fFind.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { findIdx = Math.min(findItems.length - 1, findIdx + 1); renderFind(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { findIdx = Math.max(0, findIdx - 1); renderFind(); e.preventDefault(); }
    else if (e.key === 'Enter') { e.preventDefault(); chooseFind(Math.max(0, findIdx)); }
    else if (e.key === 'Escape') { closeFind(); fFind.blur(); }
  });
  findList.addEventListener('mousedown', e => e.preventDefault());
  findList.addEventListener('click', e => { const b = e.target.closest('button'); if (b) chooseFind(+b.dataset.i); });
  fFind.addEventListener('blur', () => setTimeout(closeFind, 150));
  function chooseFind(i) {
    const f = findItems[i]; if (!f) return;
    fFind.value = f.t(); closeFind(); fFind.blur();
    if (isPhone()) setSheet('');
    flyTo(f.id);
  }

  // ---------- "Open" view: a free-flying 3D solar system at the chosen moment ----------
  // True positions (Astronomy Engine) in the J2000 ecliptic frame, 1 unit = 1 AU. Planets can be
  // real size or enlarged; distances are always true. The sky view is called "Earth".
  S.view = 'sky'; S.bigSize = true;
  S.sp = { orbits: true, names: true, rasi: true, zodiac: true, stars: true, mw: true };   // Open-view display settings
  const AU_KM = 149597870.7, EARTH_DOT = '#7fc8e8';
  const fmtDist = (id, au) => id === 'Moon' ? Math.round(au * AU_KM).toLocaleString('en-IN') + ' km' : au.toFixed(au < 10 ? 2 : 1) + ' AU';
  function lightTime(au) {
    const s = au * 499.005;
    if (s < 90) return s.toFixed(1) + ' s';
    const m = Math.round(s / 60);
    return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
  }
  const lonText = sid => `${rName(Math.floor(sid / 30))} ${fmtDeg(sid % 30)}`;
  const bodyName = id => id === 'Earth' ? L.ui.earth : gName(id);

  function infoSpace(id) {
    const a = S.astro, u = L.ui;
    if (id === 'Earth') return `<h3>${esc(u.earth)}</h3><p>${u.distSun}: <b>${fmtDist('', a.earth.helioDist)}</b> · ${F(u.lightTime, { t: lightTime(a.earth.helioDist) })}</p><p>${u.helioPos}: <b>${esc(lonText(a.earth.helioSid))}</b></p>`;
    const b = [...a.bodies, ...a.nodes].find(x => x.id === id); if (!b) return '';
    let h = `<h3>${esc(planetLabel(id))}</h3>${signLine(b.sign, b.deg, b.nak, b.pada)}`;
    if (id === 'Rahu' || id === 'Ketu') return h + `<p>${u.node}</p>`;
    h += `<p>${u.distEarth}: <b>${fmtDist(id, b.geoDist)}</b>${id === 'Moon' ? '' : ` (${Math.round(b.geoDist * AU_KM / 1e6).toLocaleString('en-IN')} ${u.mkm})`} · ${F(u.lightTime, { t: lightTime(b.geoDist) })}</p>`;
    if (id !== 'Sun') {
      h += `<p>${u.distSun}: <b>${fmtDist('', b.helioDist)}</b></p>`;
      h += `<p>${F(u.elong, { d: b.elong.toFixed(1) })}</p>`;
      if (id !== 'Moon') h += `<p>${u.helioPos}: <b>${esc(lonText(b.helioSid))}</b></p>`;
    }
    if (b.retro) h += `<p><b style="color:var(--retro)">${u.vakri}</b></p>`;
    return h;
  }

  const spaceCanvas = $('space3d');
  const AE = window.Astronomy, ROT_ECL = AE.Rotation_EQJ_ECL();
  const r3 = (r, v) => [r.rot[0][0] * v[0] + r.rot[1][0] * v[1] + r.rot[2][0] * v[2], r.rot[0][1] * v[0] + r.rot[1][1] * v[1] + r.rot[2][1] * v[2], r.rot[0][2] * v[0] + r.rot[1][2] * v[1] + r.rot[2][2] * v[2]];
  const toScene = v => { const e = r3(ROT_ECL, v); return new THREE.Vector3(e[0], e[2], -e[1]); };   // ecliptic plane = x–z, ecliptic north = +y
  const V3 = v => [v.x, v.y, v.z];
  const SPACE_BODIES = [
    { id: 'Sun', km: 696000, big: 20 }, { id: 'Mercury', km: 2439.7, period: 87.969 }, { id: 'Venus', km: 6051.8, period: 224.70 },
    { id: 'Earth', km: 6371, period: 365.256 }, { id: 'Moon', km: 1737.4 }, { id: 'Mars', km: 3389.5, period: 686.98 },
    { id: 'Jupiter', km: 69911, period: 4332.6 }, { id: 'Saturn', km: 58232, period: 10759.2, ring: true },
    { id: 'Uranus', km: 25362, period: 30688.5 }, { id: 'Neptune', km: 24622, period: 60195 },
  ];
  const BIG = 600, MOON_STRETCH = 60;   // Enlarged: planets ×600, Sun ×20, Moon's distance ×60 (so it sits outside Earth)
  const radiusAU = b => b.km / AU_KM * (S.bigSize ? (b.big || BIG) : 1);
  const spColor = id => id === 'Earth' ? EARTH_DOT : LOOK[id].dot;
  const RASI0_J2000 = 23.853;   // Lahiri ayanamsa at J2000 = the sidereal 0° Mesham direction in this frame
  let SP = null, posSpace = {}, spaceZoom = () => { };
  const ctl = { target: new THREE.Vector3(), dist: 0.2, yaw: 0, pitch: 0.3, follow: 'Earth', anim: null, zoomT: null, zoomP: null };

  // ---- realism: shaders for the space view (they write logarithmic depth like three's own materials) ----
  const LDV0 = '#include <common>\n#include <logdepthbuf_pars_vertex>\n', LDV1 = '#include <logdepthbuf_vertex>\n';
  const LDF0 = '#include <logdepthbuf_pars_fragment>\n', LDF1 = '#include <logdepthbuf_fragment>\n';
  const WORLD_VS = LDV0 + 'varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vO;\n' +
    'void main(){ vUv=uv; vO=normal; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w;\n' + LDV1 + '}';
  const shaderMat = (o) => new THREE.ShaderMaterial(Object.assign({ extensions: { derivatives: true, fragDepth: true } }, o));
  // Earth: daylight surface, city lights on the night side, sunlight glinting off the oceans, blue limb
  const earthMat = (day, night, spec) => shaderMat({
    uniforms: { dayMap: { value: day }, nightMap: { value: night }, specMap: { value: spec }, camPos: { value: new THREE.Vector3() } },
    vertexShader: WORLD_VS,
    fragmentShader: LDF0 + 'uniform sampler2D dayMap, nightMap, specMap; uniform vec3 camPos; varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vO;\n' +
      'void main(){ vec3 n=normalize(vN), L=normalize(-vW), V=normalize(camPos-vW); float d=dot(n,L);\n' +
      ' vec3 col=texture2D(dayMap,vUv).rgb*smoothstep(-0.06,0.22,d)*(0.12+0.95*max(d,0.0))*1.18;\n' +
      ' col+=texture2D(nightMap,vUv).rgb*vec3(1.0,0.8,0.5)*(1.0-smoothstep(-0.16,0.06,d))*1.7;\n' +
      ' vec3 H=normalize(L+V); col+=vec3(1.0,0.93,0.8)*pow(max(dot(n,H),0.0),70.0)*texture2D(specMap,vUv).r*0.75*smoothstep(0.0,0.2,d);\n' +
      ' float rim=pow(1.0-max(dot(n,V),0.0),3.0); col+=vec3(0.3,0.55,1.0)*rim*smoothstep(-0.25,0.4,d)*0.55;\n' +
      ' gl_FragColor=vec4(col,1.0);\n' + LDF1 + '}',
  });
  const cloudMat = (clouds) => shaderMat({
    uniforms: { cloudMap: { value: clouds } },
    vertexShader: WORLD_VS,
    fragmentShader: LDF0 + 'uniform sampler2D cloudMap; varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vO;\n' +
      'void main(){ vec3 n=normalize(vN), L=normalize(-vW); float d=dot(n,L); float c=texture2D(cloudMap,vUv).r;\n' +
      ' float lit=smoothstep(-0.08,0.25,d)*(0.2+0.85*max(d,0.0)); gl_FragColor=vec4(vec3(1.0)*lit, c*(0.12+0.83*smoothstep(-0.12,0.2,d)));\n' + LDF1 + '}',
    transparent: true, depthWrite: false,
  });
  // a thin glowing shell where a planet has an air or haze layer, bright only on the sunlit side
  const atmosMat = (color, strength) => shaderMat({
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength }, camPos: { value: new THREE.Vector3() } },
    vertexShader: WORLD_VS,
    fragmentShader: LDF0 + 'uniform vec3 uColor; uniform float uStrength; uniform vec3 camPos; varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vO;\n' +
      'void main(){ vec3 n=normalize(vN), L=normalize(-vW), V=normalize(camPos-vW); float rim=pow(1.0-abs(dot(n,V)),3.5);\n' +
      ' gl_FragColor=vec4(uColor*rim*smoothstep(-0.3,0.5,dot(n,L))*uStrength,1.0);\n' + LDF1 + '}',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const ATMOS = { Earth: ['#5b9cff', 1.1], Venus: ['#f5dca0', 0.8], Mars: ['#e8a27a', 0.35], Jupiter: ['#eadbc0', 0.28], Saturn: ['#efe1b8', 0.25], Uranus: ['#a8ecf4', 0.6], Neptune: ['#6f93ff', 0.6] };
  // the Sun's surface: its map, slowly boiling granulation, darker towards the edge
  const sunSurfaceMat = (map) => shaderMat({
    uniforms: { map: { value: map }, uTime: { value: 0 }, camPos: { value: new THREE.Vector3() } },
    vertexShader: WORLD_VS,
    fragmentShader: LDF0 + GLSL_NOISE + 'uniform sampler2D map; uniform float uTime; uniform vec3 camPos; varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying vec3 vO;\n' +
      'void main(){ vec3 n=normalize(vN), V=normalize(camPos-vW); float mu=max(dot(n,V),0.0);\n' +
      ' vec3 base=texture2D(map,vUv+vec2(uTime*0.0008,0.0)).rgb; float g=fbm(vO*38.0+vec3(0.0,0.0,uTime*0.12)); float g2=fbm(vO*9.0-vec3(uTime*0.03));\n' +
      ' vec3 col=base*(0.78+0.42*g)*(0.85+0.3*g2); col=mix(col,vec3(1.0,0.86,0.55),0.25); col*=(0.42+0.58*pow(mu,0.45))*1.45;\n' +
      ' gl_FragColor=vec4(col,1.0);\n' + LDF1 + '}',
  });
  // the corona: a camera-facing glow with moving streamers and flares (prominences) at the edge
  const CORONA_R = 7;   // in solar radii
  const coronaMat = () => shaderMat({
    uniforms: { uTime: { value: 0 }, uFade: { value: 0 } },
    vertexShader: LDV0 + 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);\n' + LDV1 + '}',
    fragmentShader: LDF0 + GLSL_NOISE + 'uniform float uTime; uniform float uFade; varying vec2 vUv;\n' +
      'void main(){ vec2 p=(vUv-0.5)*' + (2 * CORONA_R).toFixed(1) + '; float r=length(p); float an=atan(p.y,p.x); float e=max(r-1.0,0.0);\n' +
      ' vec3 dir=vec3(cos(an),sin(an),0.0);\n' +
      ' float glow=exp(-e*2.4)*0.85+exp(-e*0.7)*0.12;\n' +
      ' float st=fbm(dir*2.6+vec3(0.0,0.0,uTime*0.05)); float rays=pow(st,3.2)*exp(-e*0.75)*2.2;\n' +
      ' float fl=fbm(vec3(an*6.0, e*3.0-uTime*0.35, uTime*0.07))*exp(-e*2.6);\n' +
      ' float pr=smoothstep(0.58,0.74,fbm(vec3(an*7.0, e*14.0-uTime*0.18, 2.0+uTime*0.02)))*smoothstep(0.34,0.02,e)*step(0.0,r-0.985);\n' +
      ' vec3 col=vec3(1.0,0.87,0.62)*(glow+rays+fl*0.55)+vec3(1.0,0.36,0.14)*pr*1.6;\n' +
      ' col*=smoothstep(' + CORONA_R.toFixed(1) + ',' + (CORONA_R * 0.6).toFixed(1) + ',r);\n' +
      ' gl_FragColor=vec4(col*uFade,1.0);\n' + LDF1 + '}',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  // sharp 4k–8k maps (in hd/), fetched only when you get close to a body
  const HD_FILES = { Earth: { map: 'earth.jpg', night: 'earth_night.jpg', clouds: 'earth_clouds.jpg', spec: 'earth_spec.jpg' }, Moon: { map: 'moon.jpg' }, Mars: { map: 'mars.jpg' },
    Jupiter: { map: 'jupiter.jpg' }, Saturn: { map: 'saturn.jpg' }, Mercury: { map: 'mercury.jpg' }, Venus: { map: 'venus.jpg' }, Sun: { map: 'sun.jpg' } };
  const hdState = {};
  function maybeHD(id, rp) {
    if (rp < 150 || hdState[id] || !HD_FILES[id] || !SP) return;
    hdState[id] = 'loading';
    const o = SP.bodies[id], aniso = SP.ren.capabilities.getMaxAnisotropy();
    for (const [slot, file] of Object.entries(HD_FILES[id])) {
      new THREE.TextureLoader().load('hd/' + file, t => {
        if (slot !== 'clouds' && slot !== 'spec') t.encoding = THREE.sRGBEncoding;
        t.anisotropy = aniso; t.wrapS = THREE.RepeatWrapping;
        const m = o.mesh.material;
        if (id === 'Earth') { if (slot === 'map') m.uniforms.dayMap.value = t; else if (slot === 'night') m.uniforms.nightMap.value = t; else if (slot === 'spec') m.uniforms.specMap.value = t; else if (o.clouds) o.clouds.material.uniforms.cloudMap.value = t; }
        else if (m.uniforms && m.uniforms.map) m.uniforms.map.value = t;
        else { m.map = t; m.needsUpdate = true; }
        hdState[id] = 'sharp'; needsRender = true;
      }, undefined, () => { hdState[id] = 'unavailable'; });
    }
  }
  // per frame: animate the Sun when it is close enough to show its corona
  function spaceFrame(now) {
    const sun = SP.bodies.Sun, k = (H / 2) / Math.tan(SP.cam.fov / 2 * DEG);
    const rp = radiusAU(sun.b) / Math.max(SP.cam.position.distanceTo(sun.mesh.position), 1e-9) * k;
    const fade = THREE.MathUtils.smoothstep(rp, 18, 90);
    const t = now / 1000;
    sun.corona.material.uniforms.uFade.value = fade; sun.corona.visible = fade > 0.001;
    sun.corona.quaternion.copy(SP.cam.quaternion);
    sun.mesh.material.uniforms.uTime.value = t; sun.corona.material.uniforms.uTime.value = t;
    SP.glow.material.opacity = 1 - 0.75 * fade;
    for (const o of Object.values(SP.bodies)) { const u = o.mesh.material.uniforms; if (u && u.camPos) u.camPos.value.copy(SP.cam.position); if (o.atmos) o.atmos.material.uniforms.camPos.value.copy(SP.cam.position); }
    return fade > 0.001 && rp < 60000;   // keep animating while the corona is in view
  }

  function buildSpace() {
    const ren = new THREE.WebGLRenderer({ canvas: spaceCanvas, antialias: true, logarithmicDepthBuffer: true });
    ren.setPixelRatio(dpr); ren.setClearColor(0x030305, 1); ren.outputEncoding = THREE.sRGBEncoding;
    const scn = new THREE.Scene(), cam = new THREE.PerspectiveCamera(55, 1, 1e-7, 1e7);
    scn.add(new THREE.AmbientLight(0xffffff, 0.06));
    scn.add(new THREE.PointLight(0xfff4e0, 1.7, 0, 0));
    // backdrop that travels with the camera: stars and the gold zodiac figures (for orientation)
    const back = new THREE.Group(); scn.add(back);
    {   // the Milky Way: the Earth view's galactic band, turned into this frame
      const m = new THREE.ShaderMaterial({
        uniforms: { uGnp: { value: toScene(gnp).normalize() }, uGc: { value: toScene(gc).normalize() }, uVis: { value: 1.35 } },
        vertexShader: mwMat.vertexShader, fragmentShader: mwMat.fragmentShader,
        side: THREE.BackSide, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true,
      });
      const mwS = new THREE.Mesh(new THREE.SphereGeometry(4800, 96, 48), m); mwS.renderOrder = -11; mwS.name = 'milkyway'; back.add(mwS);
    }
    {
      const pos = new Float32Array(NS * 3), col = new Float32Array(NS * 3), size = new Float32Array(NS);
      for (let i = 0; i < NS; i++) {
        const p = toScene([starDir[i * 3], starDir[i * 3 + 1], starDir[i * 3 + 2]]).multiplyScalar(5000);
        pos.set([p.x, p.y, p.z], i * 3);
        const mag = D.stars[i * 4 + 2], c = bvColor(D.stars[i * 4 + 3]), k = Math.min(1, Math.max(0.28, 0.32 + (6 - mag) * 0.14));
        col.set([c[0] * k, c[1] * k, c[2] * k], i * 3); size[i] = Math.max(1.5, (6.9 - mag) * 1.4);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('size', new THREE.BufferAttribute(size, 1));
      const m = new THREE.ShaderMaterial({
        uniforms: { uScale: { value: dpr } },
        vertexShader: `attribute float size; attribute vec3 color; uniform float uScale; varying vec3 vC; void main(){ vC=color; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_PointSize=size*uScale; }`,
        fragmentShader: `varying vec3 vC; void main(){ vec2 c=gl_PointCoord-0.5; float r=length(c)*2.0; if(r>1.0) discard; float a=exp(-r*r*6.0)+0.7*exp(-r*r*40.0); gl_FragColor=vec4(vC*a,1.0); }`,
        transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const pts = new THREE.Points(g, m); pts.renderOrder = -10; pts.name = 'stars'; back.add(pts);
      const seg = [];
      for (const [id, lines] of Object.entries(D.lines)) {
        if (!ZODIAC[id.slice(0, 3)]) continue;
        for (const fl of lines) for (let i = 0; i + 3 < fl.length; i += 2) {
          seg.push(toScene(C.radecVec(fl[i], fl[i + 1])).multiplyScalar(4990), toScene(C.radecVec(fl[i + 2], fl[i + 3])).multiplyScalar(4990));
        }
      }
      const zl = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seg), new THREE.LineBasicMaterial({ color: 0xe2bf5a, transparent: true, opacity: 0.4, depthTest: false, depthWrite: false }));
      zl.renderOrder = -9; zl.name = 'zodiac'; back.add(zl);
    }
    // the 12 rasi directions on the ecliptic plane (sidereal 30° boundaries), to steer by
    {
      const pts = [];
      for (let k = 0; k < 12; k++) {
        const lon = (k * 30 + RASI0_J2000) * DEG;
        pts.push(new THREE.Vector3(Math.cos(lon) * 0.05, 0, -Math.sin(lon) * 0.05), new THREE.Vector3(Math.cos(lon) * 45, 0, -Math.sin(lon) * 45));
      }
      const sp = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xece4d0, dashSize: 0.25, gapSize: 0.35, transparent: true, opacity: 0.22, depthWrite: false }));
      sp.computeLineDistances(); sp.name = 'spokes'; scn.add(sp);
    }
    // bodies
    const geo = new THREE.SphereGeometry(1, 128, 96), bodies = {};
    const ldTex = key => { if (!TEX[key]) return null; const t = texLoader.load(TEX[key], () => { needsRender = true; }); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; return t; };
    for (const b of SPACE_BODIES) {
      const map = ldTex(b.id.toLowerCase());
      let mat;
      if (b.id === 'Sun') mat = sunSurfaceMat(map);
      else if (b.id === 'Earth') { const lin = key => { const t = ldTex(key); if (t) t.encoding = THREE.LinearEncoding; return t; }; mat = earthMat(map, ldTex('earth_night'), lin('earth_spec')); }
      else mat = new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0, color: map ? 0xffffff : spColor(b.id) });
      const mesh = new THREE.Mesh(geo, mat); scn.add(mesh);
      const o = { b, mesh };
      if (b.id === 'Earth') {   // cloud layer just above the surface
        const ct = ldTex('earth_clouds'); if (ct) ct.encoding = THREE.LinearEncoding;
        o.clouds = new THREE.Mesh(geo, cloudMat(ct)); o.clouds.scale.setScalar(1.008); o.clouds.renderOrder = 1; mesh.add(o.clouds);
      }
      if (ATMOS[b.id]) { o.atmos = new THREE.Mesh(geo, atmosMat(...ATMOS[b.id])); o.atmos.scale.setScalar(b.id === 'Earth' ? 1.035 : 1.03); o.atmos.renderOrder = 2; mesh.add(o.atmos); }
      if (b.id === 'Sun') { o.corona = new THREE.Mesh(new THREE.PlaneGeometry(2 * CORONA_R, 2 * CORONA_R), coronaMat()); o.corona.renderOrder = 3; scn.add(o.corona); }
      if (b.ring) {
        const rg = new THREE.RingGeometry(1.24, 2.27, 160, 1), uv = rg.attributes.uv, p = rg.attributes.position;
        for (let i = 0; i < uv.count; i++) { const r = Math.hypot(p.getX(i), p.getY(i)); uv.setXY(i, (r - 1.24) / 1.03, 0.5); }
        const rm = new THREE.MeshStandardMaterial({ map: ldTex('saturn_ring'), transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1, metalness: 0 });
        const ring = new THREE.Mesh(rg, rm); ring.rotation.x = -Math.PI / 2; mesh.add(ring);
      }
      bodies[b.id] = o;
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd27a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    scn.add(glow);
    const orbits = new THREE.Group(), moonOrbit = new THREE.Group(); scn.add(orbits, moonOrbit);
    return { ren, scn, cam, back, bodies, glow, orbits, moonOrbit, orbitsAt: null, moonAt: null, bigAt: null };
  }

  function dashedLoop(pts, color, opacity) {
    const r = pts.reduce((s, p) => s + p.length(), 0) / pts.length || 1;
    const m = new THREE.LineDashedMaterial({ color, dashSize: 2 * Math.PI * r / 200, gapSize: 2 * Math.PI * r / 260, transparent: true, opacity, depthWrite: false });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), m); line.computeLineDistances(); return line;
  }
  function clearGroup(g) { for (const c of g.children.slice()) { g.remove(c); c.geometry.dispose(); c.material.dispose(); } }

  function updateSpace() {
    if (!SP || !S.astro) return;
    const t = AE.MakeTime(new Date(S.utc));
    const earthP = toScene(V3(AE.HelioVector('Earth', t)));
    for (const { b, mesh } of Object.values(SP.bodies)) {
      let p;
      if (b.id === 'Sun') p = new THREE.Vector3();
      else if (b.id === 'Earth') p = earthP.clone();
      else if (b.id === 'Moon') p = earthP.clone().add(toScene(V3(AE.GeoMoon(t))).multiplyScalar(S.bigSize ? MOON_STRETCH : 1));
      else p = toScene(V3(AE.HelioVector(b.id, t)));
      mesh.position.copy(p); mesh.scale.setScalar(radiusAU(b));
      try {   // face the right way: IAU north pole + prime meridian (texture longitude 0 sits on local +x)
        const ax = AE.RotationAxis(b.id, t), pole = [ax.north.x, ax.north.y, ax.north.z];
        const a0 = ax.ra * 15 * DEG, nn = [-Math.sin(a0), Math.cos(a0), 0];
        const pxn = [pole[1] * nn[2] - pole[2] * nn[1], pole[2] * nn[0] - pole[0] * nn[2], pole[0] * nn[1] - pole[1] * nn[0]];
        const w = ax.spin * DEG, m = [0, 1, 2].map(i => nn[i] * Math.cos(w) + pxn[i] * Math.sin(w));
        const P = toScene(pole).normalize(), M = toScene(m).normalize(), Z = new THREE.Vector3().crossVectors(M, P);
        mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(M, P, Z));
      } catch (e) { }
    }
    SP.glow.scale.setScalar(radiusAU(SP.bodies.Sun.b) * 9);
    SP.bodies.Sun.corona.position.copy(SP.bodies.Sun.mesh.position); SP.bodies.Sun.corona.scale.setScalar(radiusAU(SP.bodies.Sun.b));
    // orbits: one full lap from this moment (rebuilt only when the date moves a lot)
    if (SP.orbitsAt === null || Math.abs(S.utc - SP.orbitsAt) > 2 * 365.25 * 864e5) {
      SP.orbitsAt = S.utc; clearGroup(SP.orbits);
      for (const b of SPACE_BODIES) {
        if (!b.period) continue;
        const pts = [];
        for (let i = 0; i <= 360; i++) pts.push(toScene(V3(AE.HelioVector(b.id, AE.MakeTime(new Date(S.utc + i / 360 * b.period * 864e5))))));
        SP.orbits.add(dashedLoop(pts, spColor(b.id), 0.5));
      }
    }
    if (SP.moonAt === null || SP.bigAt !== S.bigSize || Math.abs(S.utc - SP.moonAt) > 5 * 864e5) {
      SP.moonAt = S.utc; SP.bigAt = S.bigSize; clearGroup(SP.moonOrbit);
      const pts = [];
      for (let i = 0; i <= 180; i++) pts.push(toScene(V3(AE.GeoMoon(AE.MakeTime(new Date(S.utc + i / 180 * 27.3217 * 864e5))))).multiplyScalar(S.bigSize ? MOON_STRETCH : 1));
      SP.moonOrbit.add(dashedLoop(pts, 0xe6e6ea, 0.45));
    }
    SP.moonOrbit.position.copy(earthP);
    if (ctl.follow && !ctl.anim) ctl.target.copy(SP.bodies[ctl.follow].mesh.position);
    placeCam(); needsRender = true;
  }

  function placeCam() {
    if (!SP) return;
    const c = Math.cos(ctl.pitch);
    SP.cam.position.set(ctl.target.x + ctl.dist * c * Math.cos(ctl.yaw), ctl.target.y + ctl.dist * Math.sin(ctl.pitch), ctl.target.z + ctl.dist * c * Math.sin(ctl.yaw));
    SP.cam.up.set(0, 1, 0); SP.cam.lookAt(ctl.target); SP.cam.updateMatrixWorld();
    SP.back.position.copy(SP.cam.position);
  }
  const fitDist = id => { const b = SP.bodies[id].b; return radiusAU(b) * (b.ring ? 7 : 4.5); };
  const minDist = () => ctl.follow ? radiusAU(SP.bodies[ctl.follow].b) * 1.25 : 2e-6;
  function focusSpace(id) {
    if (!SP || !SP.bodies[id]) return;
    ctl.follow = id;
    // arrive on the sunlit side, a little off the Sun line, so the planet shows as a bright gibbous
    const p = SP.bodies[id].mesh.position;
    const toYaw = id === 'Sun' ? ctl.yaw : Math.atan2(-p.z, -p.x) + 0.6;
    const dYaw = ((toYaw - ctl.yaw) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    ctl.anim = { t0: performance.now(), dur: 1700, from: ctl.target.clone(), id, fromD: ctl.dist, toD: fitDist(id), fromYaw: ctl.yaw, dYaw, fromPitch: ctl.pitch, toPitch: id === 'Sun' ? ctl.pitch : 0.28 };
    needsRender = true;
  }
  function stepSpaceAnim(now) {
    if (ctl.zoomT && !ctl.anim) {   // gliding zoom
      const d0 = ctl.dist;
      let d1 = Math.exp(Math.log(d0) + (Math.log(ctl.zoomT) - Math.log(d0)) * 0.24);
      if (Math.abs(Math.log(d1 / ctl.zoomT)) < 0.003) { d1 = ctl.zoomT; ctl.zoomT = null; }
      if (ctl.zoomP) ctl.target.addScaledVector(new THREE.Vector3().subVectors(ctl.zoomP, ctl.target), 1 - d1 / d0);
      ctl.dist = d1; placeCam();
      return true;
    }
    const an = ctl.anim; if (!an) return false;
    const t = Math.min(1, (now - an.t0) / an.dur), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    ctl.target.copy(an.from).lerp(SP.bodies[an.id].mesh.position, e);
    ctl.dist = Math.exp(Math.log(an.fromD) + (Math.log(an.toD) - Math.log(an.fromD)) * e);
    ctl.yaw = an.fromYaw + an.dYaw * e; ctl.pitch = an.fromPitch + (an.toPitch - an.fromPitch) * e;
    if (t >= 1) ctl.anim = null;
    placeCam(); return true;
  }
  function startView() {   // beside Earth: its sunlit side half in view, the Sun and inner planets beyond
    const e = SP.bodies.Earth.mesh.position;
    ctl.follow = 'Earth'; ctl.anim = null; ctl.target.copy(e);
    ctl.yaw = Math.atan2(e.z, e.x) + 0.95; ctl.pitch = 0.32; ctl.dist = fitDist('Earth') * 2.4;
    placeCam();
  }

  // labels, rasi directions and the hint, drawn over the 3D scene
  function drawSpaceOverlay() {
    const g = octx; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    posSpace = {};
    const v = new THREE.Vector3();
    const proj = p => { v.copy(p).project(SP.cam); if (v.z > 1 || v.z < -1) return null; return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H }; };
    const camD = SP.cam.position.length();
    // rasi names along their directions, at a few distances so some are always in view
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `500 11px ${FONT}`;
    for (const R of S.sp.rasi ? [1.25, 6, 32] : []) {
      if (R < camD * 0.12 || R > camD * 40) continue;   // skip a ring that would be too small (crowded) or too far
      for (let k = 0; k < 12; k++) {
        const lon = (k * 30 + 15 + RASI0_J2000) * DEG, p = proj(new THREE.Vector3(Math.cos(lon) * R, 0, -Math.sin(lon) * R));
        if (!p || p.x < -40 || p.x > W + 40 || p.y < -20 || p.y > H + 20) continue;
        g.globalAlpha = 0.5; g.fillStyle = '#ece4d0'; g.fillText(rName(k), p.x, p.y);
      }
    }
    g.globalAlpha = 1;
    // bodies: a marker ring while small, always a name
    const k = (H / 2) / Math.tan(SP.cam.fov / 2 * DEG);
    const placed = [];
    for (const { b, mesh } of Object.values(SP.bodies)) {
      const p = proj(mesh.position); if (!p) continue;
      const dCam = SP.cam.position.distanceTo(mesh.position);
      const rp = radiusAU(b) / Math.max(dCam, 1e-9) * k;
      posSpace[b.id] = { x: p.x, y: p.y, r: Math.max(rp, 6) };
      maybeHD(b.id, rp);
      if (p.x < -60 || p.x > W + 60 || p.y < -30 || p.y > H + 30) continue;
      const c = spColor(b.id), sel = S.sel === b.id;
      if (rp < 9) { g.strokeStyle = c; g.globalAlpha = 0.9; g.lineWidth = sel ? 2 : 1.3; g.beginPath(); g.arc(p.x, p.y, sel ? 9 : 7, 0, 2 * Math.PI); g.stroke(); }
      const lx = p.x + Math.min(Math.max(rp, 7), W / 3) + 7;
      let ly = p.y;
      for (let n = 0; n < 6 && placed.some(q => Math.abs(q.y - ly) < 15 && lx < q.x + q.w && q.x < lx + 80); n++) ly += 15;
      placed.push({ x: lx, y: ly, w: 80 });
      if (S.sp.names) { g.globalAlpha = 1; g.textAlign = 'left'; g.font = `600 12.5px ${FONT}`; g.fillStyle = c; g.fillText(bodyName(b.id), lx, ly); }
    }
    g.globalAlpha = 1; g.lineWidth = 1;
    g.font = `500 11.5px ${FONT}`; g.fillStyle = 'rgba(236,228,208,0.7)'; g.textAlign = 'left';
    g.fillText(L.ui.spaceHint, 16, isPhone() ? 124 : 78);
    if (tipFor) positionTip();
  }
  function pickSpace(x, y) {
    let best = null, bd = 1e9;
    for (const [id, p] of Object.entries(posSpace)) { const d = Math.hypot(p.x - x, p.y - y); if (d < Math.max(22, p.r + 6) && d < bd) { bd = d; best = id; } }
    return best;
  }

  // free camera: drag = orbit, right-drag / Shift-drag / two fingers = move, wheel / pinch = zoom
  {
    const ptr = new Map(); let moved = 0, pan = false, pinch = 0, mid = null;
    const lxy = e => { const r = spaceCanvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const panBy = (dx, dy) => {
      const right = new THREE.Vector3().setFromMatrixColumn(SP.cam.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(SP.cam.matrixWorld, 1);
      const s = ctl.dist * 2 * Math.tan(SP.cam.fov / 2 * DEG) / H;
      ctl.target.addScaledVector(right, -dx * s).addScaledVector(up, dy * s);
      ctl.follow = null; ctl.anim = null; placeCam();
    };
    // Zoom glides to a target distance. When not locked onto a body it heads for the point under the
    // cursor (that point stays put on screen), so a few scrolls carry you across the solar system.
    const zoomBy = (f, x, y) => {
      if (!SP) return;
      const from = ctl.zoomT || ctl.dist;
      ctl.zoomT = clampV(from * f, minDist(), 120);
      ctl.zoomP = null;
      if (!ctl.follow && x != null) {
        const ray = new THREE.Vector3((x / W) * 2 - 1, -(y / H) * 2 + 1, 0.5).unproject(SP.cam).sub(SP.cam.position).normalize();
        const view = new THREE.Vector3().subVectors(ctl.target, SP.cam.position).normalize();
        ctl.zoomP = SP.cam.position.clone().addScaledVector(ray, ctl.dist / Math.max(0.2, ray.dot(view)));
      }
      needsRender = true;
    };
    const zoomDirect = f => { if (!SP) return; ctl.zoomT = null; ctl.dist = clampV(ctl.dist * f, minDist(), 120); placeCam(); needsRender = true; };
    spaceCanvas.addEventListener('contextmenu', e => e.preventDefault());
    spaceCanvas.addEventListener('pointerdown', e => {
      if (S.view === 'aether') return;
      closeSheet();
      try { spaceCanvas.setPointerCapture(e.pointerId); } catch (err) { }
      ptr.set(e.pointerId, lxy(e)); moved = 0; pan = e.button === 2 || e.shiftKey; ctl.anim = null;
      if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
    });
    spaceCanvas.addEventListener('pointermove', e => {
      if (!SP || S.view === 'aether') return;
      const prev = ptr.get(e.pointerId), cur = lxy(e);
      if (!prev) {
        if (e.pointerType === 'mouse' && !tipPinned) { const id = pickSpace(...cur); spaceCanvas.style.cursor = id ? 'pointer' : ''; if (id !== tipFor) showTipFor(id, false); }
        return;
      }
      ptr.set(e.pointerId, cur);
      if (ptr.size === 1) {
        const dx = cur[0] - prev[0], dy = cur[1] - prev[1]; moved += Math.abs(dx) + Math.abs(dy);
        if (pan) panBy(dx, dy);
        else { ctl.yaw += dx * 0.006; ctl.pitch = clampV(ctl.pitch + dy * 0.006, -1.5, 1.5); placeCam(); }
      } else if (ptr.size === 2) {
        const [a, b] = [...ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (pinch && d) zoomDirect(Math.pow(pinch / d, 1.7));   // a small pinch goes a long way
        if (mid) panBy(m[0] - mid[0], m[1] - mid[1]);
        pinch = d; mid = m; moved += 10;
      }
      needsRender = true;
    });
    const up = e => {
      if (!ptr.has(e.pointerId)) return;
      ptr.delete(e.pointerId); if (ptr.size < 2) { pinch = 0; mid = null; }
      if (moved < 6 && ptr.size === 0) {
        const id = pickSpace(...lxy(e));
        if (id) { S.sel = id; renderPanel(); focusSpace(id); showTipFor(id, true); }
      }
    };
    spaceCanvas.addEventListener('pointerup', up); spaceCanvas.addEventListener('pointercancel', up);
    // wheel: one notch ≈ ×1.6, and it speeds up (to ≈ ×4 a notch) while you keep scrolling
    let lastWheel = 0, streak = 0;
    spaceCanvas.addEventListener('wheel', e => {
      if (S.view === 'aether') return;
      e.preventDefault(); ctl.anim = null;
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      const now = performance.now();
      streak = now - lastWheel < 220 ? Math.min(streak + 1, 8) : 0; lastWheel = now;
      const boost = Math.abs(dy) >= 50 ? 1 + streak * 0.25 : 1;
      zoomBy(Math.exp(clampV(dy, -300, 300) * 0.0047 * boost), ...lxy(e));
    }, { passive: false });
    window.addEventListener('keydown', e => {
      if (S.view !== 'space' || !SP || (e.target && e.target.closest && e.target.closest('input,select,textarea'))) return;
      const step = 40, keys = { ArrowLeft: [step, 0], a: [step, 0], ArrowRight: [-step, 0], d: [-step, 0], ArrowUp: [0, step], w: [0, step], ArrowDown: [0, -step], s: [0, -step] };
      const mv = keys[e.key]; if (mv) { panBy(mv[0], mv[1]); needsRender = true; }
      if (e.key === '+' || e.key === '=') zoomBy(0.45, W / 2, H / 2);
      if (e.key === '-' || e.key === '_') zoomBy(2.2, W / 2, H / 2);
    });
    spaceZoom = f => zoomBy(f, W / 2, H / 2);
  }

  function applySpaceOpts() {
    document.querySelectorAll('[data-sopt]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sopt === 'big' ? S.bigSize : !!S.sp[b.dataset.sopt])));
    if (!SP) return;
    SP.scn.getObjectByName('stars').visible = S.sp.stars;
    SP.scn.getObjectByName('milkyway').visible = S.sp.mw;
    SP.scn.getObjectByName('zodiac').visible = S.sp.zodiac;
    SP.scn.getObjectByName('spokes').visible = S.sp.rasi && S.view === 'space';
    SP.back.visible = S.view !== 'aether';
    SP.orbits.visible = SP.moonOrbit.visible = S.sp.orbits;
    needsRender = true;
  }
  document.querySelectorAll('[data-sopt]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.sopt === 'big') setBig(!S.bigSize); else S.sp[b.dataset.sopt] = !S.sp[b.dataset.sopt];
    applySpaceOpts();
  }));
  function setView(view) {
    const prev = S.view;
    S.view = view;
    appEl.classList.toggle('mode-space', view === 'space');
    appEl.classList.toggle('mode-aether', view === 'aether');
    document.querySelectorAll('#viewSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    showTipFor(null); S.sel = null; renderPanel();
    if (prev === 'aether' && view !== 'aether') leaveAether();
    if (view !== 'sky') {
      const first = !SP;
      if (first) SP = buildSpace();
      resize(); updateSpace(); if (first) startView();
      if (view === 'aether' && prev !== 'aether') enterAether();
      applySpaceOpts();
    }
    needsRender = true;
  }
  function setBig(big) {
    S.bigSize = big;
    document.querySelectorAll('#sizeSeg button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.size === 'big') === big)));
    if (!SP) return;
    updateSpace();
    if (ctl.follow) { const f = fitDist(ctl.follow); if (ctl.dist > f * 20 || ctl.dist < f) ctl.dist = f; ctl.dist = clampV(ctl.dist, minDist(), 120); placeCam(); }
    needsRender = true;
  }
  document.querySelectorAll('#viewSeg button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  document.querySelectorAll('#sizeSeg button').forEach(b => b.addEventListener('click', () => setBig(b.dataset.size === 'big')));
  $('spaceHome').addEventListener('click', () => { if (SP) focusSpace('Earth'); });


  // ---------- To Aether: out from Earth, past the stars and galaxies, into the dark void ----------
  // One camera path on a log scale (aeth.lD = log10 of the viewing distance in light-years), drawn in
  // three passes so every scale keeps precision: galaxies (unit 1 million ly), stars and the Milky Way
  // (unit 1 ly), then the solar system scene itself (unit 1 AU) while it is still close.
  const LY_AU = 63241.077, AETH_MAX = 10.3;
  const AETH_SPEED = { slow: 0.45, normal: 0.95, fast: 2.0, home: 4.0 };   // decades of distance per second
  const aeth = { lD: 0, lD0: 0, lDT: null, rate: 9, yaw: 0, pitch: 0.32, playing: false, dir: 1, hold: 0, speed: 'normal', rush: false, lastT: 0, userAt: 0, focus: null, focusOn: false, fk: 0, cap: '', capT: 0, tour: null, tourT: null, free: null };
  let AET = null, posAether = [], aetherZoom = () => { };
  const sstep = (x, a, b) => { const t = clampV((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const rng = seed => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const gauss = r => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
  const radec3 = (ra, dec) => toScene(C.radecVec(ra, dec)).normalize();
  const easeIO = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  // Out here everything is added light, so the shaders skip depth (z = 0) and only clip what is behind you.
  const AET_K = { value: 800 }, AET_MAXPX = { value: 80 }, MW_MAXPX = { value: 24 }, GAS_MAXPX = { value: 400 }, POP_MAXPX = { value: 160 };
  const CPTS_VS = `attribute vec3 color; attribute float size; uniform float uK; uniform float uVis; uniform float uMaxPx; varying vec3 vC; varying float vA;
    void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); float d=length(mv.xyz); float px=size*uK/max(d,1e-12);
      float a=uVis*smoothstep(0.5*size,2.5*size,d);
      if(px<1.5){ a*=px*px/2.25; px=1.5; }
      if(px>uMaxPx){ a*=pow(uMaxPx/px,2.0); px=uMaxPx; }
      vC=color; vA=a; gl_Position=projectionMatrix*mv; gl_Position.z=0.0; gl_PointSize=a<0.002?0.0:px; }`;
  const CPTS_FS = `varying vec3 vC; varying float vA; void main(){ vec2 c=gl_PointCoord-0.5; float r=length(c)*2.0; if(r>1.0) discard; gl_FragColor=vec4(vC*exp(-r*r*4.5)*vA,1.0); }`;
  const GAS_FS = `varying vec3 vC; varying float vA; void main(){ vec2 c=gl_PointCoord-0.5; float r2=dot(c,c)*4.0; if(r2>1.0) discard; gl_FragColor=vec4(vC*exp(-r2*2.6)*(1.0-r2)*vA,1.0); }`;
  const addMat = o => new THREE.ShaderMaterial(Object.assign({ transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }, o));
  const cptsMat = () => addMat({ uniforms: { uK: AET_K, uMaxPx: AET_MAXPX, uVis: { value: 1 } }, vertexShader: CPTS_VS, fragmentShader: CPTS_FS });
  const gasMat = () => addMat({ uniforms: { uK: AET_K, uMaxPx: GAS_MAXPX, uVis: { value: 1 } }, vertexShader: CPTS_VS, fragmentShader: GAS_FS });
  // stars at their (estimated) distances: brightness follows from absolute magnitude and how far you are
  const STAR3_VS = `attribute vec3 color; attribute float absMag; uniform float uScale; uniform float uVis; varying vec3 vC;
    void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); float d=max(length(mv.xyz),1e-12);
      float m=absMag+2.1714724*log(d/32.6156);
      float k=clamp(0.32+(6.0-m)*0.14,0.0,1.0)*clamp((8.6-m)/2.6,0.0,1.0)*uVis;
      vC=color*k; gl_Position=projectionMatrix*mv; gl_Position.z=0.0; gl_PointSize=k<0.004?0.0:clamp((6.9-m)*1.4,1.5,13.0)*uScale; }`;
  const STAR3_FS = `varying vec3 vC; void main(){ vec2 c=gl_PointCoord-0.5; float r=length(c)*2.0; if(r>1.0) discard; float a=exp(-r*r*6.0)+0.7*exp(-r*r*40.0); gl_FragColor=vec4(vC*a,1.0); }`;
  // A disc galaxy is three pieces: its face-on image (a flat card), an edge-on image that turns to face you
  // when you see the disc from the side (with the dark dust lane), and a round 3D bulge of old stars.
  const FACE_VS = `uniform float uVis; uniform float uSize; uniform vec3 uN; varying vec2 vUv; varying float vA;
    void main(){ vUv=uv; vec3 c=(modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz; vec3 v=cameraPosition-c; float d=length(v);
      float h=abs(dot(v,uN)), ci=h/d; vA=uVis*max(smoothstep(0.45*uSize,1.3*uSize,d),smoothstep(0.04*uSize,0.17*uSize,h))*smoothstep(0.03,0.3,ci);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position.z=0.0; }`;
  const FACE_FS = `uniform sampler2D map; uniform vec3 uCol; varying vec2 vUv; varying float vA; void main(){ gl_FragColor=vec4(texture2D(map,vUv).rgb*uCol*vA,1.0); }`;
  const EDGE_VS = `uniform float uVis; uniform float uSize; uniform float uH; uniform vec3 uN; varying vec2 vUv; varying float vA;
    void main(){ vUv=uv; vec3 c=(modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz; vec3 v=cameraPosition-c; float d=length(v); v/=d;
      float ci=abs(dot(v,uN)); vec3 u=cross(uN,v); float lu=length(u); u=lu>1e-4?u/lu:vec3(1.0,0.0,0.0);
      vec3 w=c+u*position.x*uSize+uN*position.y*uSize*uH;
      vA=uVis*(1.0-smoothstep(0.07,0.3,ci))*smoothstep(0.45*uSize,1.3*uSize,d);
      gl_Position=projectionMatrix*viewMatrix*vec4(w,1.0); gl_Position.z=0.0; }`;
  const EDGE_FS = `uniform sampler2D map; uniform vec3 uCol; varying vec2 vUv; varying float vA; void main(){ vec4 t=texture2D(map,vUv); gl_FragColor=vec4(t.rgb*uCol*vA,t.a*vA); }`;
  const BULGE_VS = `uniform float uVis; uniform float uSize; uniform float uQ; uniform float uRot; varying vec2 vUv; varying float vA;
    void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(0.0,0.0,0.0,1.0); float d=length(mv.xyz);
      vec2 p=position.xy*uSize*vec2(1.0,uQ); float c=cos(uRot), s=sin(uRot); mv.xy+=vec2(c*p.x-s*p.y,s*p.x+c*p.y);
      vA=uVis*smoothstep(0.06*uSize,0.35*uSize,d); gl_Position=projectionMatrix*mv; gl_Position.z=0.0; }`;
  // far-away galaxies: tiny pictures picked from an atlas, turned and tilted, or a soft dot when too small
  const POP_VS = `attribute vec3 color; attribute float size; attribute vec3 shape; uniform float uK; uniform float uVis; uniform float uMaxPx;
    varying vec3 vC; varying float vA; varying vec3 vS; varying float vPx;
    void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); float d=length(mv.xyz); float px=size*uK/max(d,1e-12);
      float a=uVis*smoothstep(0.7*size,3.0*size,d);
      if(px<1.5){ a*=px*px/2.25; px=1.5; }
      if(px>uMaxPx){ a*=pow(uMaxPx/px,2.0); px=uMaxPx; }
      vC=color; vA=a; vS=shape; vPx=px; gl_Position=projectionMatrix*mv; gl_Position.z=0.0; gl_PointSize=a<0.002?0.0:px; }`;
  const POP_FS = `uniform sampler2D map; varying vec3 vC; varying float vA; varying vec3 vS; varying float vPx;
    void main(){ vec2 p=gl_PointCoord-0.5; float r=length(p)*2.0;
      float cr=cos(vS.y), sr=sin(vS.y); vec2 q=vec2(cr*p.x-sr*p.y,sr*p.x+cr*p.y); q.y/=vS.z;
      float inside=step(abs(q.x),0.5)*step(abs(q.y),0.5);
      vec2 tile=vec2(mod(vS.x,4.0),floor(vS.x/4.0)+0.001);
      vec3 col=texture2D(map,(tile+clamp(q+0.5,0.01,0.99))/4.0).rgb*inside;
      float dt=exp(-r*r*5.0)*step(r,1.0)*0.8;
      col=mix(vec3(dt),col*1.5,smoothstep(2.5,7.0,vPx));
      gl_FragColor=vec4(col*vC*vA,1.0); }`;

  // ---- procedural galaxy images: drawn once into float buffers, then uploaded as textures ----
  const NOISE = (() => { const r = rng(99), a = new Float32Array(65536); for (let i = 0; i < a.length; i++) a[i] = r(); return a; })();
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const i0 = xi & 255, i1 = (xi + 1) & 255, j0 = (yi & 255) << 8, j1 = ((yi + 1) & 255) << 8;
    const a = NOISE[j0 + i0], b = NOISE[j0 + i1], c = NOISE[j1 + i0], d = NOISE[j1 + i1];
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  function fbm2(x, y, o) { let s = 0, w = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += w * vnoise(x * f, y * f); n += w; f *= 2.03; w *= 0.5; } return s / n; }
  const raster = (W, H) => ({ W, H, E: new Float32Array(W * H * 3), A: new Float32Array(W * H) });
  // a soft blob of light; (x, y) in -1..1 of a square region (ox, oy, N) of the raster
  function splat(R, ox, oy, N, x, y, rad, col, k) {
    const cx = (x + 1) / 2 * N - 0.5, cy = (y + 1) / 2 * N - 0.5, pr = Math.max(0.6, rad * N / 2), e = Math.ceil(pr * 2.5);
    for (let j = Math.max(0, Math.floor(cy - e)); j <= Math.min(N - 1, Math.ceil(cy + e)); j++)
      for (let i = Math.max(0, Math.floor(cx - e)); i <= Math.min(N - 1, Math.ceil(cx + e)); i++) {
        const w = k * Math.exp(-((i - cx) ** 2 + (j - cy) ** 2) / (pr * pr)), q = ((oy + j) * R.W + ox + i) * 3;
        R.E[q] += col[0] * w; R.E[q + 1] += col[1] * w; R.E[q + 2] += col[2] * w;
      }
  }
  // a disc galaxy seen face-on: old yellow disc, blue spiral arms with dark dust lanes on their inner edge, pink star-forming knots
  function faceImg(P, R, ox, oy, N) {
    const n = P.n || 0, tp = Math.tan((P.pitch || 15) * DEG), sp = Math.sin((P.pitch || 15) * DEG), sd = (P.seed || 1) * 7.31;
    const yc = P.young || [0.5, 0.66, 1.0], oc = P.old || [1.0, 0.82, 0.6], fl = P.flocc || 0, rOut = P.rOut || 0.92, rIn = P.rIn || 0.08;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / N * 2 - 1, y = (j + 0.5) / N * 2 - 1, r = Math.hypot(x, y); if (r > 1) continue;
      const th = Math.atan2(y, x), lr = Math.log(Math.max(r, 1e-3) / P.r0);
      const n1 = fbm2(x * 5 + sd, y * 5 - sd, 4), n2 = fbm2(x * 17 - sd, y * 17 + sd, 3), n3 = fbm2(x * 46 + sd, y * 46, 2);
      const edge = 1 - sstep(r, rOut * 0.75, rOut), disk = Math.exp(-r / P.h) * edge;
      let arm = 0, lane = 0;
      if (n) {
        const w = P.armW * (0.45 + r), wd = w * 0.36;
        for (let k = 0; k < n; k++) {
          let D = th - (P.th0 + k * 2 * Math.PI / n + lr / tp); D -= 2 * Math.PI * Math.round(D / (2 * Math.PI));
          const dp = D * r * sp, a = P.amps ? P.amps[k] : 1;
          arm += a * Math.exp(-((dp / w) ** 2)); lane += a * Math.exp(-(((dp - w * 0.55) / wd) ** 2));
        }
        const m = sstep(r, rIn, rIn + 0.12) * edge; arm *= m; lane *= m;
      }
      const clump = Math.max(0, n2 - 0.3) * 2.4;
      const floc = fl * sstep(n1, 0.47, 0.72) * sstep(r, rIn * 0.6, rIn + 0.1) * edge;
      const young = ((P.armK || 1) * (arm * (1 - fl) + floc * 1.6) * (0.3 + 0.8 * clump) * 0.8 + 0.15 * disk) * (0.55 + 0.9 * n3);
      const old = disk * (1.25 + 0.45 * arm) * (0.8 + 0.4 * n1);
      let bar = 0;
      if (P.bar) { const ca = Math.cos(P.bar[1] * DEG), sa = Math.sin(P.bar[1] * DEG), xb = x * ca + y * sa, yb = -x * sa + y * ca; bar = 0.9 * Math.exp(-1.5 * ((xb / P.bar[0]) ** 2 + (yb / (P.bar[0] * 0.3)) ** 2)); }
      let ring = 0, rlane = 0;
      if (P.ring) { const g = (r - P.ring[0]) / 0.04; ring = P.ring[1] * Math.exp(-g * g) * (0.3 + 1.4 * Math.max(0, n2 - 0.3)); rlane = P.ring[2] * Math.exp(-(((r - P.ring[0] - 0.025) / 0.03) ** 2)) * (0.4 + n1); }
      const fil = 0.4 * sstep(n2, 0.5, 0.72) * sstep(r, 0.1, 0.25) * edge;
      const tau = (P.dust || 0) * (lane * (0.2 + 1.0 * n1) + 0.6 * fil) + rlane;
      const tr = Math.exp(-1.7 * tau), core = (P.core || 0) * Math.exp(-r / 0.028);
      const q = ((oy + j) * R.W + ox + i) * 3, ey = young + ring;
      for (let c = 0; c < 3; c++) R.E[q + c] += (oc[c] * (old + bar) + yc[c] * ey) * tr + core * [1, 0.93, 0.8][c];
      R.A[(oy + j) * R.W + ox + i] = 1 - tr;
    }
    const r_ = rng((P.seed || 1) + 7);
    for (let s = 0; s < (P.hii || 0); s++) {   // star-forming regions and young clusters along the arms
      let x, y;
      if (n && r_() > fl) { const k = Math.floor(r_() * n), rr = rIn + 0.04 + Math.pow(r_(), 0.85) * (rOut * 0.82 - rIn), t = P.th0 + k * 2 * Math.PI / n + Math.log(rr / P.r0) / tp + gauss(r_) * 0.12; x = rr * Math.cos(t); y = rr * Math.sin(t); }
      else { const rr = rIn + Math.sqrt(r_()) * (rOut * 0.75 - rIn), t = r_() * 2 * Math.PI; x = rr * Math.cos(t); y = rr * Math.sin(t); }
      const pink = r_() < 0.5;
      splat(R, ox, oy, N, x, y, (pink ? 0.006 : 0.004) * (0.5 + r_()), pink ? [1.0, 0.36, 0.52] : [0.66, 0.78, 1.0], (pink ? 0.5 : 0.35) * (P.hiiK || 1) * (0.15 + Math.pow(r_(), 3) * 1.6));
    }
    if (P.comp) splat(R, ox, oy, N, P.comp[0], P.comp[1], P.comp[2], [1.0, 0.8, 0.58], P.comp[3]);
    return R;
  }
  // the same disc seen edge-on: a thin bright plane split by a dark dust lane (alpha = how much it hides what is behind)
  function edgeImg(P, W, H) {
    const R = raster(W, H), sd = (P.seed || 1) * 3.7, hr = H / W, oc = P.old || [1.0, 0.82, 0.6], yc = P.young || [0.55, 0.68, 1.0], rOut = P.rOut || 0.92;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = (i + 0.5) / W * 2 - 1, z = ((j + 0.5) / H * 2 - 1) * hr, ax = Math.abs(x), az = Math.abs(z);
      const n1 = fbm2(x * 9 + sd, z * 40, 3), n2 = fbm2(x * 34 - sd, z * 90 + sd, 3);
      const span = 1 - sstep(ax, rOut * 0.7, rOut);
      const disk = Math.exp(-ax / P.h) * span * Math.exp(-az / (P.z0 || 0.02));
      const thin = (P.armK || 1) * 0.5 * Math.exp(-ax / (P.h * 1.7)) * span * Math.exp(-az / ((P.z0 || 0.02) * 0.35)) * (0.3 + 1.2 * Math.max(0, n2 - 0.25));
      const lane = (P.dust || 0) * 1.7 * Math.exp(-(((z - (P.zoff || 0)) / (P.zd || 0.012)) ** 2)) * (1 - sstep(ax, rOut * 0.55, rOut * 0.95)) * (0.45 + 1.1 * n1);
      const plume = P.plume ? P.plume * Math.exp(-((x / 0.13) ** 2)) * Math.exp(-az / 0.11) * Math.max(0, n2 - 0.35) * 2.5 : 0;
      const tr = Math.exp(-2.2 * lane), q = (j * W + i) * 3;
      for (let c = 0; c < 3; c++) R.E[q + c] = (oc[c] * disk * 0.8 + yc[c] * thin) * tr + [1.0, 0.25, 0.32][c] * plume;
      R.A[j * W + i] = (1 - tr) * 0.92;
    }
    return R;
  }
  // a smooth ball of old stars (elliptical galaxies and bulges), brightest at the centre
  function bulgeImg(N, c = 9, p = 0.45) {
    const R = raster(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / N * 2 - 1, y = (j + 0.5) / N * 2 - 1, r = Math.hypot(x, y); if (r > 1) continue;
      const I = Math.exp(-c * Math.pow(r, p)) * (1 - sstep(r, 0.7, 1.0)), q = (j * N + i) * 3, wc = Math.exp(-r / 0.05);
      R.E[q] = I * (1.0 + 0.0 * wc); R.E[q + 1] = I * (0.84 + 0.1 * wc); R.E[q + 2] = I * (0.62 + 0.22 * wc);
    }
    return R;
  }
  // irregular galaxies (like the Magellanic Clouds): lumpy, blue, with a bar and pink nebulae
  function irrImg(P, R, ox, oy, N) {
    const sd = (P.seed || 1) * 5.1, r_ = rng((P.seed || 1) + 3), ca = Math.cos((P.ang || 0) * DEG), sa = Math.sin((P.ang || 0) * DEG);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i + 0.5) / N * 2 - 1, y = (j + 0.5) / N * 2 - 1, xr = x * ca + y * sa, yr = -x * sa + y * ca;
      const n1 = fbm2(x * 4 + sd, y * 4 - sd, 4), n2 = fbm2(x * 13 - sd, y * 13 + sd, 3);
      const body = Math.exp(-2.2 * ((xr / (P.a || 0.7)) ** 2 + (yr / (P.b || 0.5)) ** 2)) * (0.35 + 1.3 * Math.max(0, n1 - 0.32));
      const bar = P.bar ? Math.exp(-((((xr - P.bar[2]) / P.bar[0]) ** 2) + ((yr - P.bar[3]) / (P.bar[0] * 0.3)) ** 2) * 1.6) * 0.8 : 0;
      const clump = Math.max(0, n2 - 0.45) * 3 * body;
      const q = ((oy + j) * R.W + ox + i) * 3;
      for (let c = 0; c < 3; c++) R.E[q + c] += [0.8, 0.82, 0.95][c] * body * 0.7 + [1.0, 0.88, 0.7][c] * bar + [0.55, 0.7, 1.0][c] * clump;
    }
    for (let s = 0; s < (P.hii || 0); s++) {
      const x = gauss(r_) * (P.a || 0.7) * 0.4, y = gauss(r_) * (P.b || 0.5) * 0.4, xr = x * ca - y * sa, yr = x * sa + y * ca;
      const pink = r_() < 0.55; splat(R, ox, oy, N, xr, yr, (pink ? 0.012 : 0.008) * (0.5 + r_()), pink ? [1.0, 0.3, 0.48] : [0.6, 0.75, 1.0], pink ? 0.5 : 0.35);
    }
    if (P.tarantula) splat(R, ox, oy, N, P.tarantula[0], P.tarantula[1], 0.03, [1.0, 0.35, 0.55], 1.4);
    return R;
  }
  function toTex(R, gain, alpha) {
    const d = new Uint8Array(R.W * R.H * 4);
    for (let p = 0, n = R.W * R.H; p < n; p++) {
      for (let c = 0; c < 3; c++) d[p * 4 + c] = Math.round(255 * (1 - Math.exp(-R.E[p * 3 + c] * gain)));
      d[p * 4 + 3] = alpha ? Math.round(255 * clampV(R.A[p], 0, 1)) : 255;
    }
    const t = new THREE.DataTexture(d, R.W, R.H, THREE.RGBAFormat);
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4; t.needsUpdate = true;
    return t;
  }
  let BULGE_TEX = null, ELL_TEX = null;

  const KNOWN_LY = { 'Rigil Kentaurus': 4.37, Toliman: 4.37, Sirius: 8.6, Procyon: 11.5, Altair: 16.7, Vega: 25, Fomalhaut: 25, Pollux: 34, Arcturus: 36.7, Capella: 42.9, Castor: 51, Aldebaran: 65, Regulus: 79,
    Achernar: 139, Spica: 250, Canopus: 310, Polaris: 433, Betelgeuse: 548, Antares: 550, Rigel: 863, Deneb: 2615, Hadar: 390, Acrux: 320, Mimosa: 280 };
  // [label key, RA°, Dec°, distance (million ly), diameter (million ly), look, position angle°, inclination°]
  const GALAXIES = [
    ['andromeda', 10.6847, 41.2690, 2.54, 0.22, 'andromeda', 38, 77], ['Triangulum', 23.4621, 30.6599, 2.73, 0.061, 'triangulum', 23, 54],
    ['lmc', 80.8942, -69.7561, 0.163, 0.032, 'lmc', 170, 35], ['smc', 13.1866, -72.8286, 0.20, 0.019, 'smc', 45, 60],
    ["Bode's Galaxy", 148.888, 69.065, 11.8, 0.09, 'bode', 157, 59], ['Cigar Galaxy', 148.968, 69.680, 12, 0.037, 'cigar', 65, 82],
    ['Centaurus A', 201.365, -43.019, 12, 0.06, 'cenA', 115, 75], ['Sombrero', 189.998, -11.623, 31.1, 0.05, 'sombrero', 90, 84],
    ['Whirlpool', 202.47, 47.195, 23, 0.076, 'whirlpool', 163, 20], ['Pinwheel', 210.802, 54.349, 21, 0.17, 'pinwheel', 39, 18],
    ['M87', 187.706, 12.391, 53.5, 0.12, 'm87'],
  ];
  // how each one looks: face = disc image, edge = edge-on image, bulge = size of the central ball (× diameter), ell = elliptical only
  const LOOKS = {
    andromeda: { N: 512, face: { n: 2, pitch: 13, r0: 0.12, th0: 0.4, h: 0.28, armW: 0.036, armK: 0.5, dust: 1.1, flocc: 0.55, ring: [0.5, 0.45, 0.9], core: 0.7, rIn: 0.16, rOut: 0.95, hii: 320, hiiK: 0.6, seed: 3 }, bulge: 0.36, bk: 1.3 },
    triangulum: { face: { n: 2, pitch: 30, r0: 0.07, th0: 1.2, h: 0.3, armW: 0.05, armK: 1.1, dust: 0.45, flocc: 0.6, core: 0.4, rIn: 0.05, rOut: 0.95, hii: 420, hiiK: 1.2, seed: 5, young: [0.48, 0.64, 1.0] }, bulge: 0.08, bk: 0.5 },
    bode: { face: { n: 2, pitch: 13, r0: 0.1, th0: 2.2, h: 0.22, armW: 0.032, armK: 0.95, dust: 0.85, flocc: 0.15, core: 0.8, rIn: 0.13, rOut: 0.92, hii: 360, seed: 7 }, bulge: 0.3, bk: 1.1 },
    whirlpool: { face: { n: 2, pitch: 19, r0: 0.07, th0: 0.6, h: 0.26, armW: 0.04, armK: 1.5, dust: 1.2, flocc: 0.08, core: 0.7, rIn: 0.07, rOut: 0.9, hii: 560, hiiK: 1.1, seed: 9, comp: [0.05, 0.86, 0.06, 2.2] }, bulge: 0.14, bk: 0.85 },
    pinwheel: { face: { n: 4, amps: [1, 0.7, 0.9, 0.45], pitch: 25, r0: 0.05, th0: 2.9, h: 0.3, armW: 0.035, armK: 1.2, dust: 0.7, flocc: 0.35, core: 0.5, rIn: 0.05, rOut: 0.95, hii: 640, hiiK: 1.1, seed: 11 }, bulge: 0.05, bk: 0.5 },
    sombrero: { face: { n: 0, h: 0.3, dust: 0.25, ring: [0.7, 0.55, 1.5], core: 0.6, rIn: 0.1, rOut: 0.95, hii: 0, seed: 13 }, edge: { h: 0.32, z0: 0.03, zd: 0.03, zoff: -0.012, dust: 1.5, armK: 0.8, rOut: 0.96, seed: 13 }, bulge: 0.75, bk: 1.5, soft: true },
    cigar: { face: { n: 0, h: 0.26, dust: 0.9, flocc: 0.8, core: 0.5, rIn: 0.02, rOut: 0.9, hii: 160, hiiK: 1.3, seed: 17 }, edge: { h: 0.3, z0: 0.06, zd: 0.03, dust: 1.4, armK: 1.3, plume: 1.4, rOut: 0.9, seed: 17 }, bulge: 0.15, bk: 0.6 },
    cenA: { ell: { size: 2.2, q: 0.85, k: 1.3 }, edge: { h: 0.4, z0: 0.05, zd: 0.05, dust: 1.7, armK: 0.6, rOut: 0.62, seed: 19, young: [1.0, 0.55, 0.6] } },
    m87: { ell: { size: 4.5, q: 0.95, k: 1.6 } },
    lmc: { irr: { a: 0.8, b: 0.6, ang: 10, bar: [0.32, 0, -0.1, -0.08], hii: 120, tarantula: [0.22, 0.12], seed: 23 } },
    smc: { irr: { a: 0.85, b: 0.42, ang: 35, hii: 70, seed: 29 } },
  };
  const galName = k => L.ui[k] || k;

  function buildAether() {
    const ly = new THREE.Scene(), mly = new THREE.Scene();
    const camL = new THREE.PerspectiveCamera(55, W / H, 1e-9, 1e12), camM = new THREE.PerspectiveCamera(55, W / H, 1e-12, 1e9);
    const nG = toScene(gnp).normalize(), cG = toScene(gc).normalize(), GC = cG.clone().multiplyScalar(26000);
    const e1 = GC.clone().negate().addScaledVector(nG, GC.dot(nG)).normalize(), e2 = new THREE.Vector3().crossVectors(nG, e1);
    const inDisc = (R, th, z) => GC.clone().addScaledVector(e1, R * Math.cos(th)).addScaledVector(e2, R * Math.sin(th)).addScaledVector(nG, z);
    const cloud = () => ({ pos: [], col: [], size: [], shape: [], add(p, c, s, sh) { this.pos.push(p.x, p.y, p.z); this.col.push(c[0], c[1], c[2]); this.size.push(s); if (sh) this.shape.push(sh[0], sh[1], sh[2]); } });
    const geoOf = cl => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cl.pos), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cl.col), 3)); g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(cl.size), 1));
      if (cl.shape.length) g.setAttribute('shape', new THREE.BufferAttribute(new Float32Array(cl.shape), 3));
      return g;
    };
    const mkPoints = (cl, scn, name, mat) => { const p = new THREE.Points(geoOf(cl), mat || cptsMat()); p.frustumCulled = false; p.name = name; scn.add(p); return p; };
    const plane = new THREE.PlaneGeometry(1, 1);
    const A = { ly, mly, camL, camM, GC, nG, named: [], labels: [], gals: [] };
    A.qGal = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nG);
    if (!BULGE_TEX) { BULGE_TEX = toTex(bulgeImg(256), 1.6, false); ELL_TEX = toTex(bulgeImg(256, 6.5, 0.6), 2.2, false); }
    const mkFace = (scn, tex, pos, diam, a, n, col) => {
      const m = addMat({ uniforms: { map: { value: tex }, uCol: { value: new THREE.Vector3(...col) }, uVis: { value: 1 }, uSize: { value: diam }, uN: { value: n.clone() } }, vertexShader: FACE_VS, fragmentShader: FACE_FS, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(plane, m); mesh.frustumCulled = false; mesh.renderOrder = 0;
      mesh.position.copy(pos); mesh.scale.setScalar(diam);
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(a, new THREE.Vector3().crossVectors(n, a), n));
      scn.add(mesh); return mesh;
    };
    const mkEdge = (scn, tex, pos, diam, n, col, hr) => {
      const m = new THREE.ShaderMaterial({ uniforms: { map: { value: tex }, uCol: { value: new THREE.Vector3(...col) }, uVis: { value: 1 }, uSize: { value: diam }, uH: { value: hr }, uN: { value: n.clone() } },
        vertexShader: EDGE_VS, fragmentShader: EDGE_FS, side: THREE.DoubleSide, transparent: true, depthTest: false, depthWrite: false,
        blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
      const mesh = new THREE.Mesh(plane, m); mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.position.copy(pos); scn.add(mesh); return mesh;
    };
    const mkBulge = (scn, pos, size, k, q, rot, tex) => {
      const m = addMat({ uniforms: { map: { value: tex || BULGE_TEX }, uCol: { value: new THREE.Vector3(k, k, k) }, uVis: { value: 1 }, uSize: { value: size }, uQ: { value: q || 1 }, uRot: { value: rot || 0 } }, vertexShader: BULGE_VS, fragmentShader: FACE_FS });
      const mesh = new THREE.Mesh(plane, m); mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.position.copy(pos); scn.add(mesh); return mesh;
    };

    {   // the catalogue stars in 3D
      const r = rng(7), pos = new Float32Array(NS * 3), col = new Float32Array(NS * 3), am = new Float32Array(NS);
      for (let i = 0; i < NS; i++) {
        const m = D.stars[i * 4 + 2], bv = D.stars[i * 4 + 3], nm = SINFO[i][0];
        let dly = KNOWN_LY[nm];
        if (!dly) {   // estimated from colour: hot blue stars and red giants are bright, so they are farther
          const b = isFinite(bv) ? bv : 0.6;
          const M = (b < 0 ? -1.6 : b < 0.3 ? 0.9 : b < 0.6 ? 2.6 : b < 0.9 ? 1.9 : 0.4) + (r() - 0.5) * 1.4;
          dly = clampV(3.26156 * Math.pow(10, (m - M + 5) / 5), 6, 4000);
        }
        const p = toScene([starDir[i * 3], starDir[i * 3 + 1], starDir[i * 3 + 2]]).multiplyScalar(dly);
        pos.set([p.x, p.y, p.z], i * 3); col.set(bvColor(bv), i * 3); am[i] = m - 5 * Math.log10(dly / 32.6156);
        if (KNOWN_LY[nm]) A.named.push({ i, p, absMag: am[i] });
        if (nm === 'Rigil Kentaurus') { A.alphaCen = p.clone(); A.alphaCenI = i; }
      }
      const mk = (P, Cc, M, name) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('color', new THREE.BufferAttribute(Cc, 3)); g.setAttribute('absMag', new THREE.BufferAttribute(M, 1));
        const pts = new THREE.Points(g, addMat({ uniforms: { uScale: { value: dpr }, uVis: { value: 1 } }, vertexShader: STAR3_VS, fragmentShader: STAR3_FS }));
        pts.frustumCulled = false; pts.name = name; ly.add(pts); return pts;
      };
      A.stars = mk(pos, col, am, 'stars3d');
      A.sunPt = mk(new Float32Array(3), new Float32Array(bvColor(0.65)), new Float32Array([4.83]), 'sun');
      // the countless fainter stars of our part of the galaxy, too faint to see from Earth
      const NF = isPhone() ? 14000 : 24000, fp = new Float32Array(NF * 3), fc = new Float32Array(NF * 3), fm = new Float32Array(NF);
      const gx = new THREE.Vector3(1, 0, 0).applyQuaternion(A.qGal), gz = new THREE.Vector3(0, 0, 1).applyQuaternion(A.qGal);
      for (let i = 0; i < NF; i++) {
        const R = 150 + Math.sqrt(r()) * 4200, th = r() * 2 * Math.PI, p = gx.clone().multiplyScalar(R * Math.cos(th)).addScaledVector(gz, R * Math.sin(th)).addScaledVector(nG, gauss(r) * 350);
        fp.set([p.x, p.y, p.z], i * 3); const bv = -0.2 + Math.pow(r(), 0.7) * 1.8; fc.set(bvColor(bv), i * 3); fm[i] = bv < 0.2 ? -2.2 + r() * 2.5 : -0.6 + r() * 3.5;
      }
      A.field = mk(fp, fc, fm, 'fieldStars');
    }
    {   // the Oort cloud: a faint shell of icy bodies far beyond the planets
      const c = cloud(), r = rng(11);
      for (let i = 0; i < 4000; i++) {
        const d = new THREE.Vector3(gauss(r), gauss(r), gauss(r)).normalize(), k = 0.3 + 0.35 * r();
        c.add(d.multiplyScalar(0.03 * Math.pow(55, r())), [0.6 * k, 0.72 * k, 0.95 * k], 0.0004 + 0.0005 * r());
      }
      A.oort = mkPoints(c, ly, 'oort');
    }
    {   // the asteroid belt (with Jupiter's Trojans) and the Kuiper belt, drawn with the planets
      const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
      const r = rng(13), mkBelt = (n, f, col, op) => {
        const pos = new Float32Array(n * 3), cl = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { const p = f(i); pos.set([p.x, p.y, p.z], i * 3); const k = 0.55 + 0.45 * r(); cl.set([col[0] * k, col[1] * k, col[2] * k], i * 3); }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
        const m = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.3 * dpr, map: dotTex, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: op, depthWrite: false }));
        m.frustumCulled = false; m.visible = false; SP.scn.add(m); return m;
      };
      const J = SP.bodies.Jupiter.mesh.position, jA = Math.atan2(J.z, J.x);
      const ring = (R0, R1, inc) => { const R = R0 + (R1 - R0) * Math.pow(r(), 0.9), t = r() * 2 * Math.PI; return new THREE.Vector3(R * Math.cos(t), R * Math.sin(gauss(r) * inc), R * Math.sin(t)); };
      A.ast = mkBelt(5200, i => {
        if (i < 4300) return ring(2.15, 3.3, 0.09);
        const t = jA + (i % 2 ? 1 : -1) * Math.PI / 3 + gauss(r) * 0.22, R = 5.2 + gauss(r) * 0.15;
        return new THREE.Vector3(R * Math.cos(t), R * Math.sin(gauss(r) * 0.15), R * Math.sin(t));
      }, [0.78, 0.7, 0.6], 0.7);
      A.kb = mkBelt(6000, () => ring(30, 50, 0.12), [0.62, 0.72, 0.9], 0.55);
    }
    {   // the Milky Way: bar and bulge, four trailing arms, a thin disc; the Sun sits between two arms
      const c = cloud(), r = rng(21), pitch = 13 * DEG, th0 = 0.15 - Math.log(26000 / 4000) / Math.tan(pitch), K = 0.045;
      const barA = 27 * DEG, bar = e1.clone().multiplyScalar(Math.cos(barA)).addScaledVector(e2, Math.sin(barA)), barP = new THREE.Vector3().crossVectors(nG, bar);
      const N = isPhone() ? 40000 : 60000;
      for (let i = 0; i < N; i++) {
        const u = r();
        if (u < 0.14) {
          const p = GC.clone().addScaledVector(bar, gauss(r) * 5200).addScaledVector(barP, gauss(r) * 1900).addScaledVector(nG, gauss(r) * 1400), k = K * 0.6 * (0.6 + 0.6 * r());
          c.add(p, [1.0 * k, 0.8 * k, 0.55 * k], 350 + 300 * r());
        } else if (u < 0.86) {
          let R = 3500 + (-Math.log(1 - r() * 0.985)) * 9500; if (R > 52000) R = 3500 + r() * 48000;
          const arm = i % 4, th = th0 + arm * Math.PI / 2 + Math.log(R / 4000) / Math.tan(pitch) + gauss(r) * 0.11;
          const p = inDisc(R + gauss(r) * (500 + R * 0.025), th, gauss(r) * (220 + 0.004 * R));
          const q = r(), k = K * (arm % 2 ? 1 : 0.7) * (q < 0.06 ? 1.5 : 0.7 + 0.5 * r()), cc = q < 0.06 ? [1.0, 0.45, 0.6] : q < 0.6 ? [0.62, 0.74, 1.0] : [0.95, 0.9, 0.8];
          c.add(p, cc.map(x => x * k * 2), 160 + 260 * r());
        } else {
          const R = -Math.log(1 - r() * 0.99) * 11000, k = K * 0.55;
          c.add(inDisc(R, r() * 2 * Math.PI, gauss(r) * 600), [0.9 * k, 0.85 * k, 0.75 * k].map(x => x * 2), 450 + 450 * r());
        }
      }
      A.mw = mkPoints(c, ly, 'mwStars', addMat({ uniforms: { uK: AET_K, uMaxPx: MW_MAXPX, uVis: { value: 1 } }, vertexShader: CPTS_VS, fragmentShader: CPTS_FS }));   // smaller sparks, so flying through stays sharp
      // the picture of the whole galaxy: same arms, bar angle and Sun position as the particles above
      const MWD = 115000, look = { n: 4, amps: [0.55, 1, 0.55, 1], pitch: 13, r0: 4000 / (MWD / 2), th0, h: 0.2, armW: 0.042, armK: 1.0, dust: 0.85, flocc: 0.22,
        bar: [0.24, 27], core: 0.25, rIn: 0.08, rOut: 0.9, hii: isPhone() ? 600 : 900, hiiK: 0.7, seed: 21 };
      const NM = isPhone() ? 512 : 1024;
      A.mwFace = mkFace(ly, toTex(faceImg(look, raster(NM, NM), 0, 0, NM), 1.5, false), GC, MWD, e1, nG, [1.25, 1.25, 1.25]);
      A.mwEdge = mkEdge(ly, toTex(edgeImg({ h: 0.2, z0: 0.016, zd: 0.011, dust: 1.1, armK: 1.1, rOut: 0.9, seed: 21 }, 512, 64), 1.6, true), GC, MWD, nG, [1.2, 1.2, 1.2], 0.125);
      A.mwBulge = mkBulge(ly, GC, 30000, 0.75, 0.7, 0);
      // globular clusters swarming round the centre
      const gcl = cloud();
      for (let i = 0; i < 160; i++) { const d = new THREE.Vector3(gauss(r), gauss(r), gauss(r)).normalize(), R = 3000 + (-Math.log(1 - r() * 0.97)) * 13000, k = 0.18 + 0.2 * r(); gcl.add(GC.clone().addScaledVector(d, R), [1.0 * k, 0.86 * k, 0.66 * k], 220 + 200 * r()); }
      A.glob = mkPoints(gcl, ly, 'globulars');
    }
    {   // the band of the Milky Way across the sky, while you are still inside it
      const m = addMat({
        uniforms: { uGnp: { value: nG.clone() }, uGc: { value: cG.clone() }, uVis: { value: 1.35 } },
        vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position.z=0.0; }',
        fragmentShader: mwMat.fragmentShader, side: THREE.BackSide,
      });
      A.band = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), m); A.band.frustumCulled = false; ly.add(A.band);
    }
    {   // named galaxies, Local Group dwarfs, the Virgo Cluster and the galaxies of our local volume
      const near = cloud();
      for (const [key, ra, dec, dist, diam, lk, pa, inc] of GALAXIES) {
        const lE = new THREE.Vector3(...C.radecVec(ra, dec)), pos = toScene(V3(lE)).multiplyScalar(dist), LK = LOOKS[lk];
        const lg = dist < 5, G = { key, lg, parts: [] };
        const east = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 1), lE).normalize(), north = new THREE.Vector3().crossVectors(lE, east);
        const a = north.clone().multiplyScalar(Math.cos((pa || 0) * DEG)).addScaledVector(east, Math.sin((pa || 0) * DEG)), mm = new THREE.Vector3().crossVectors(lE, a);
        const nn = lE.clone().multiplyScalar(Math.cos((inc || 0) * DEG)).addScaledVector(mm, Math.sin((inc || 0) * DEG));
        const aS = toScene(V3(a)).normalize(), nS = toScene(V3(nn)).normalize();
        if (LK.ell) {
          const ang = Math.atan2(aS.y, Math.hypot(aS.x, aS.z));
          G.parts.push(mkBulge(mly, pos, diam * LK.ell.size, LK.ell.k, LK.ell.q, ang, ELL_TEX)); G.parts.push(mkBulge(mly, pos, diam * LK.ell.size * 0.4, LK.ell.k * 0.8, LK.ell.q, ang));
          near.add(pos, [0.95, 0.82, 0.62].map(x => x * 0.8), diam * 0.6);
        } else if (LK.irr) {
          const N = 256, R = raster(N, N); irrImg(LK.irr, R, 0, 0, N);
          G.parts.push(mkFace(mly, toTex(R, 1.4, false), pos, diam, aS, nS, [1.2, 1.2, 1.25]));
          G.parts.push(mkBulge(mly, pos, diam * 0.7, 0.18, 0.7, 0));   // its thickness, seen from the side
          near.add(pos, [0.5, 0.5, 0.55], diam * 0.3);
        }
        if (LK.face) {
          const N = LK.N || 256;
          G.parts.push(mkFace(mly, toTex(faceImg(LK.face, raster(N, N), 0, 0, N), 1.5, false), pos, diam, aS, nS, [1.3, 1.3, 1.3]));
          near.add(pos, [0.5, 0.48, 0.45], diam * 0.3);
        }
        if (LK.face || LK.edge) {
          const f = LK.face || {}, ep = LK.edge || { h: f.h, z0: 0.018, zd: 0.012, dust: (f.dust || 0.5) * 0.9, armK: f.armK, rOut: f.rOut, seed: f.seed, young: f.young };
          G.parts.push(mkEdge(mly, toTex(edgeImg(ep, 256, 64), 1.6, true), pos, diam, nS, [1.25, 1.25, 1.25], 0.25));
        }
        if (LK.bulge) G.parts.push(mkBulge(mly, pos, diam * LK.bulge, LK.bk, 0.8, 0, LK.soft ? ELL_TEX : null));
        A.gals.push(G);
        A.labels.push({ key, pos, diamLy: diam * 1e6, posLy: pos.clone().multiplyScalar(1e6),
          vis: key === 'lmc' || key === 'smc' ? lD => sstep(lD, 4.6, 5.0) * (1 - sstep(lD, 7.0, 7.5)) : lg ? lD => sstep(lD, 5.2, 5.6) * (1 - sstep(lD, 7.6, 8.1)) : lD => sstep(lD, 6.6, 7.0) * (1 - sstep(lD, 8.4, 8.9)) });
      }
      A.galPts = mkPoints(near, mly, 'galPts');
      // a small atlas of galaxy pictures for the crowds: spirals, barred spirals, ellipticals, lenticulars, irregulars
      const AT = 128, atlas = raster(AT * 4, AT * 4), r = rng(31);
      const tiles = [
        { n: 2, pitch: 14, r0: 0.08, th0: 0, h: 0.24, armW: 0.05, armK: 1.3, dust: 0.9, core: 0.9, rIn: 0.1, rOut: 0.9, hii: 40, seed: 41 },
        { n: 2, pitch: 22, r0: 0.07, th0: 1, h: 0.28, armW: 0.06, armK: 1.4, dust: 0.8, flocc: 0.3, core: 0.6, rIn: 0.07, rOut: 0.9, hii: 50, seed: 42 },
        { n: 3, pitch: 18, r0: 0.07, th0: 2, h: 0.26, armW: 0.05, armK: 1.2, dust: 0.7, flocc: 0.5, core: 0.5, rIn: 0.07, rOut: 0.92, hii: 50, seed: 43 },
        { n: 2, pitch: 16, r0: 0.25, th0: 0.3, h: 0.26, armW: 0.05, armK: 1.3, dust: 0.9, bar: [0.3, 0], core: 0.8, rIn: 0.3, rOut: 0.9, hii: 40, seed: 44 },
        { n: 2, pitch: 10, r0: 0.12, th0: 2.5, h: 0.22, armW: 0.04, armK: 0.9, dust: 1.0, ring: [0.45, 0.5, 0.8], core: 1.1, rIn: 0.14, rOut: 0.9, hii: 30, seed: 45 },
        { n: 2, pitch: 25, r0: 0.2, th0: 1.7, h: 0.3, armW: 0.06, armK: 1.5, dust: 0.6, bar: [0.24, 0], core: 0.6, rIn: 0.24, rOut: 0.92, hii: 50, seed: 46 },
        null, null, null, null,   // ellipticals
        { n: 0, h: 0.2, dust: 0.1, core: 1.2, rIn: 0.1, rOut: 0.85, seed: 47 }, { n: 0, h: 0.24, dust: 0.3, ring: [0.55, 0.2, 0.5], core: 1.0, rIn: 0.1, rOut: 0.85, seed: 48 },   // lenticulars
        'irr', 'irr',
        { n: 2, pitch: 14, r0: 0.1, th0: 0.9, h: 0.25, armW: 0.05, armK: 1.2, dust: 1.1, core: 0.8, rIn: 0.1, rOut: 0.9, hii: 40, seed: 49 },
        { n: 4, pitch: 20, r0: 0.06, th0: 0.2, h: 0.28, armW: 0.04, armK: 1.2, dust: 0.8, flocc: 0.4, core: 0.6, rIn: 0.06, rOut: 0.92, hii: 60, seed: 50 },
      ];
      const B = bulgeImg(AT), BE = bulgeImg(AT, 6.5, 0.6);
      tiles.forEach((t, k) => {
        const ox = (k % 4) * AT, oy = Math.floor(k / 4) * AT;
        if (t === 'irr') irrImg({ a: 0.6, b: 0.4, ang: 30 * k, hii: 12, seed: 60 + k }, atlas, ox, oy, AT);
        else if (t) faceImg(t, atlas, ox, oy, AT);
        const bk = t === null ? 1.8 : t === 'irr' ? 0 : t.n === 0 ? 0.9 : 0.35, bs = t === null ? 1 : 0.4;   // ellipticals: the whole tile is the ball; spirals: a small bulge
        if (bk) for (let j = 0; j < AT; j++) for (let i = 0; i < AT; i++) {
          const si = Math.floor(((i + 0.5) / AT - 0.5) / bs * AT + AT / 2), sj = Math.floor(((j + 0.5) / AT - 0.5) / bs * AT + AT / 2);
          if (si < 0 || sj < 0 || si >= AT || sj >= AT) continue;
          const q = ((oy + j) * atlas.W + ox + i) * 3, s = (sj * AT + si) * 3;
          for (let c = 0; c < 3; c++) atlas.E[q + c] += (t === null ? BE : B).E[s + c] * bk;
        }
      });
      const atlasTex = toTex(atlas, 1.5, false);
      const popMat = () => addMat({ uniforms: { map: { value: atlasTex }, uK: AET_K, uMaxPx: POP_MAXPX, uVis: { value: 1 } }, vertexShader: POP_VS, fragmentShader: POP_FS });
      const ELL = [6, 7, 8, 9], S0 = [10, 11], SPI = [0, 1, 2, 3, 4, 5, 14, 15], IRR = [12, 13];
      const pick = a => a[Math.floor(r() * a.length)];
      const galaxy = (cl, p, type, diam, k) => {   // type: 'e' elliptical, 's' spiral, 'i' irregular
        const tile = type === 'e' ? (r() < 0.3 ? pick(S0) : pick(ELL)) : type === 'i' ? pick(IRR) : pick(SPI);
        const q = type === 'e' ? 0.6 + 0.4 * r() : type === 'i' ? 0.5 + 0.5 * r() : 0.15 + 0.85 * Math.abs(Math.cos(r() * Math.PI / 2));
        const tint = type === 'e' ? [1.0, 0.9, 0.78] : type === 'i' ? [0.85, 0.9, 1.05] : [0.95, 0.97, 1.05];
        cl.add(p, tint.map(x => x * k), diam * 2.6, [tile, r() * Math.PI * 2, q]);
      };
      const dw = cloud();
      const M31 = radec3(10.6847, 41.2690).multiplyScalar(2.54);
      for (let i = 0; i < 44; i++) {   // dwarf galaxies around the Milky Way and Andromeda, and the two close companions of Andromeda
        const host = i < 22 ? new THREE.Vector3() : M31, s = i < 22 ? 0.3 : 0.22;
        galaxy(dw, host.clone().add(new THREE.Vector3(gauss(r), gauss(r), gauss(r)).multiplyScalar(s)), r() < 0.6 ? 'e' : 'i', 0.004 + 0.006 * r(), 0.4 + 0.3 * r());
      }
      galaxy(dw, M31.clone().add(new THREE.Vector3(0.012, -0.01, 0.006)), 'e', 0.008, 1.0);    // M32
      galaxy(dw, M31.clone().add(new THREE.Vector3(-0.02, 0.028, -0.01)), 'e', 0.017, 0.9);    // M110
      A.dwarfs = mkPoints(dw, mly, 'dwarfs', popMat());
      const vc = cloud(), M87 = radec3(187.706, 12.391).multiplyScalar(53.5);
      for (let i = 0; i < 420; i++) {   // the Virgo Cluster: mostly ellipticals in the dense core, spirals round the edges
        const off = new THREE.Vector3(gauss(r), gauss(r), gauss(r)).multiplyScalar(2.4), core = off.length() < 2.6;
        galaxy(vc, M87.clone().add(off), core && r() < 0.75 ? 'e' : r() < 0.85 ? 's' : 'i', 0.02 + 0.06 * Math.pow(r(), 2), 0.55 + 0.45 * r());
      }
      const sgp = radec3(283.75, 15.70), sx = new THREE.Vector3().crossVectors(sgp, new THREE.Vector3(0, 1, 0)).normalize(), sy = new THREE.Vector3().crossVectors(sgp, sx);
      const groups = []; for (let i = 0; i < 45; i++) { const R = 8 + (-Math.log(1 - r() * 0.98)) * 38, th = r() * 2 * Math.PI; groups.push(M87.clone().multiplyScalar(0.45).addScaledVector(sx, R * Math.cos(th)).addScaledVector(sy, R * Math.sin(th)).addScaledVector(sgp, gauss(r) * 9)); }
      for (let i = 0; i < 2600; i++) {   // groups and loose galaxies of the local supercluster, flattened into its plane
        let p;
        if (i < 1350) p = groups[i % groups.length].clone().add(new THREE.Vector3(gauss(r), gauss(r), gauss(r)).multiplyScalar(1.6));
        else { const R = (-Math.log(1 - r() * 0.98)) * 45, th = r() * 2 * Math.PI; p = M87.clone().multiplyScalar(0.45).addScaledVector(sx, R * Math.cos(th)).addScaledVector(sy, R * Math.sin(th)).addScaledVector(sgp, gauss(r) * 14); }
        if (p.length() < 4) continue;
        const u = r(); galaxy(vc, p, u < 0.25 ? 'e' : u < 0.88 ? 's' : 'i', 0.02 + 0.06 * Math.pow(r(), 2), 0.45 + 0.5 * r());
      }
      A.volume = mkPoints(vc, mly, 'volume', popMat());
      const icl = cloud();   // the faint glow of hot gas and loose stars that fills the cluster
      icl.add(M87, [0.5, 0.42, 0.34].map(x => x * 0.22), 9); icl.add(M87, [0.6, 0.5, 0.4].map(x => x * 0.3), 3.5);
      for (const gp of groups.slice(0, 20)) icl.add(gp, [0.35, 0.36, 0.5].map(x => x * 0.08), 5);
      A.icl = mkPoints(icl, mly, 'clusterGlow', gasMat());
      A.virgo = M87;
      A.M31ly = M31.clone().multiplyScalar(1e6);
      A.LGCly = M31.clone().multiplyScalar(0.5e6);
    }
    {   // the cosmic web: clusters joined by long filaments of galaxies and gas, with empty voids between
      const r = rng(41), nodes = [radec3(187.706, 12.391).multiplyScalar(53.5)];
      for (let i = 0; i < 80; i++) nodes.push(new THREE.Vector3(gauss(r), gauss(r), gauss(r)).normalize().multiplyScalar(2000 * Math.cbrt(r())));
      const edges = new Set();
      nodes.forEach((a, i) => nodes.map((b, j) => [j, a.distanceTo(b)]).filter(([j]) => j !== i).sort((x, y) => x[1] - y[1]).slice(0, 3).forEach(([j]) => edges.add(i < j ? i + ',' + j : j + ',' + i)));
      const c = cloud(), gas = cloud(), col = () => { const k = 0.28 + 0.22 * r(); return (r() < 0.55 ? [0.7, 0.76, 1.0] : [1.0, 0.86, 0.7]).map(x => x * k); };
      const E = [...edges].map(s => s.split(',').map(Number));
      for (const [i, j] of E) {
        const a = nodes[i], b = nodes[j], len = a.distanceTo(b), n = Math.round(len / 5), s = 7 + 0.02 * len;
        for (let k = 0; k < n; k++) c.add(a.clone().lerp(b, r()).add(new THREE.Vector3(gauss(r), gauss(r), gauss(r)).multiplyScalar(s)), col(), 2 + 4 * r());
        for (let k = 0, m = Math.round(len / 22); k < m; k++) gas.add(a.clone().lerp(b, r()).add(new THREE.Vector3(gauss(r), gauss(r), gauss(r)).multiplyScalar(s * 1.6)), [0.3, 0.34, 0.75].map(x => x * (0.05 + 0.04 * r())), 40 + 50 * r());
      }
      for (const a of nodes) {
        for (let k = 0; k < 220; k++) c.add(a.clone().add(new THREE.Vector3(gauss(r), gauss(r), gauss(r)).multiplyScalar(16)), col().map(x => x * 1.4), 2 + 4 * r());
        gas.add(a, [0.85, 0.62, 0.5].map(x => x * 0.12), 90 + 60 * r()); gas.add(a, [1.0, 0.85, 0.7].map(x => x * 0.25), 28);
      }
      for (let k = 0; k < 16000; k++) { const [i, j] = E[Math.floor(r() * E.length)]; c.add(nodes[i].clone().lerp(nodes[j], r()).add(new THREE.Vector3(gauss(r), gauss(r), gauss(r)).multiplyScalar(55)), col().map(x => x * 0.6), 3 + 5 * r()); }
      A.web = mkPoints(c, mly, 'web');
      A.webGas = mkPoints(gas, mly, 'webGas', gasMat());
    }
    return A;
  }

  // where the camera looks and from where, for a given scale
  const _av = new THREE.Vector3();
  const angWrap = a => ((a % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  const aetherPitch = lD => lD < 3.2 ? 0.32 : lD < 5.8 ? 0.32 + 0.58 * sstep(lD, 3.3, 4.6) : 0.9 - 0.62 * sstep(lD, 5.8, 6.8);
  const qAt = lD => new THREE.Quaternion().slerp(AET.qGal, sstep(lD, 3.4, 4.6));
  // the free-explore path: Earth → Sun → centre of the galaxy → centre of the Local Group as you pull back
  function pathT(lD) {
    const A = AET, s1 = sstep(lD, aeth.lD0 + 0.3, -4.4), s2 = sstep(lD, 3.7, 4.8), s3 = sstep(lD, 5.9, 6.5);
    return SP.bodies.Earth.mesh.position.clone().divideScalar(LY_AU).multiplyScalar(1 - s1).lerp(A.GC, s2).lerp(A.LGCly, s3);
  }
  function aetherCams() {
    const A = AET, lD = aeth.lD, d = Math.pow(10, lD) * (1 + Math.max(0, H / W * 0.75 - 1) * sstep(lD, 4.0, 5.0));   // pull back a little more on a tall phone screen
    let T;
    if (aeth.playing && aeth.tourT) T = aeth.tourT.clone();
    else {
      T = pathT(lD);
      if (aeth.free) T.lerp(aeth.free.T, 1 - sstep(lD - aeth.free.lD, 0.3, 1.5));   // stay where the Journey was paused, until you pull far back
    }
    if (aeth.focus && aeth.fk > 0) T.lerp(aeth.focus.pos, easeIO(aeth.fk));
    const q = qAt(lD);
    const cp = Math.cos(aeth.pitch), dir = new THREE.Vector3(cp * Math.cos(aeth.yaw), Math.sin(aeth.pitch), cp * Math.sin(aeth.yaw)).applyQuaternion(q);
    const P = T.clone().addScaledVector(dir, d);
    A.camL.position.copy(P); A.camL.up.set(0, 1, 0).applyQuaternion(q); A.camL.lookAt(T);
    A.camL.near = d * 1e-3; A.camL.far = d * 1e4 + 5e6; A.camL.updateProjectionMatrix(); A.camL.updateMatrixWorld();
    A.camM.position.copy(P).multiplyScalar(1e-6); A.camM.quaternion.copy(A.camL.quaternion);
    A.camM.near = d * 1e-9; A.camM.far = d * 1e-2 + 1e5; A.camM.updateProjectionMatrix(); A.camM.updateMatrixWorld();
    SP.cam.position.copy(P).multiplyScalar(LY_AU); SP.cam.quaternion.copy(A.camL.quaternion); SP.cam.updateMatrixWorld();
    A.T = T; A.P = P; A.d = d;
  }
  function setVis(o, v) { o.material.uniforms.uVis.value = v; o.visible = v > 0.001; }
  // Planets are drawn enlarged; during a close-up of one body the others shrink back, so Jupiter does not loom beside the Moon.
  const FULL_SIZE = new Set(['Sun', 'Earth', 'Moon']), SUBJ = { earth: {}, moon: {}, earthMoon: {}, sun: {} };
  function aetherSubject() {
    const val = (m, id) => m ? (m[id] ? 1 : 0) : 1, out = {};
    let mA = null, mB = null, e = 1;
    if (aeth.playing && aeth.tour && !(aeth.tour.route[aeth.tour.i].cruise && aeth.tour.hold <= 0)) { const t = aeth.tour; mA = SUBJ[t.from.key] || null; mB = SUBJ[t.route[t.i].key] || null; e = t.hold > 0 ? 1 : easeIO(t.u); }
    else { const close = 1 - sstep(aeth.lD, -4.9, -4.4); if (close <= 0) return null; mA = null; e = close; mB = {}; for (const { b, mesh } of Object.values(SP.bodies)) if (SP.cam.position.distanceTo(mesh.position) < radiusAU(b) * 14) mB[b.id] = 1; }
    if (!mA && !mB) return null;
    for (const id of Object.keys(SP.bodies)) out[id] = val(mA, id) * (1 - e) + val(mB, id) * e;
    return out;
  }
  function aetherRender(now) {
    const A = AET, lD = aeth.lD;
    AET_K.value = (H * dpr / 2) / Math.tan(55 / 2 * DEG); AET_MAXPX.value = 30 * dpr; GAS_MAXPX.value = 420 * dpr; POP_MAXPX.value = 150 * dpr; MW_MAXPX.value = 12 * dpr;
    aetherCams();
    const voidF = 1 - sstep(lD, 9.4, 10.1), inside = 0.35 + 0.65 * sstep(lD, 4.5, 5.5);
    setVis(A.stars, 1 - sstep(lD, 3.8, 4.6));
    setVis(A.sunPt, sstep(lD, -2.6, -1.4) * (1 - sstep(lD, 4.2, 5.0))); setVis(A.field, sstep(lD, 1.1, 1.8) * (1 - sstep(lD, 3.7, 4.4)));
    setVis(A.oort, 0.8 * sstep(lD, -2.4, -1.5) * (1 - sstep(lD, 0.6, 1.6)));
    setVis(A.band, (S.sp.mw ? 1.35 : 0) * (1 - sstep(lD, 3.2, 4.1))); A.band.position.copy(A.camL.position);
    const mwIn = sstep(lD, 3.2, 4.1);
    setVis(A.mw, mwIn * (1 - 0.55 * sstep(lD, 4.6, 5.4)) * (1 - sstep(lD, 6.2, 7.0)));
    setVis(A.glob, mwIn * (1 - sstep(lD, 5.6, 6.4)));
    setVis(A.mwFace, sstep(lD, 3.4, 4.4) * voidF); setVis(A.mwEdge, sstep(lD, 3.4, 4.4) * voidF); setVis(A.mwBulge, 0.9 * sstep(lD, 3.6, 4.4) * voidF);
    A.mwFace.material.uniforms.uCol.value.setScalar(1.25 * (0.5 + 0.5 * sstep(lD, 4.2, 4.9)));   // not washed out up close
    for (const G of A.gals) { const v = (G.lg ? inside : sstep(lD, 4.5, 5.8)) * voidF; for (const m of G.parts) setVis(m, v); }
    setVis(A.galPts, inside * voidF); setVis(A.dwarfs, sstep(lD, 4.8, 5.6) * voidF);
    setVis(A.volume, sstep(lD, 5.2, 6.2) * voidF); setVis(A.icl, sstep(lD, 6.4, 7.0) * voidF);
    setVis(A.web, sstep(lD, 7.3, 8.3) * voidF); setVis(A.webGas, sstep(lD, 7.6, 8.5) * voidF);
    const of = 1 - sstep(lD, -3.0, -1.6);   // orbits fade as the planets shrink away
    for (const l of SP.orbits.children) l.material.opacity = 0.5 * of;
    for (const l of SP.moonOrbit.children) l.material.opacity = 0.45 * of;
    const av = sstep(lD, -4.7, -4.3) * (1 - sstep(lD, -2.7, -2.1)), kv = sstep(lD, -3.9, -3.3) * (1 - sstep(lD, -1.6, -1.1));
    A.ast.material.opacity = 0.6 * av; A.ast.visible = av > 0.01; A.kb.material.opacity = 0.6 * kv; A.kb.visible = kv > 0.01;
    const sub = aetherSubject();
    for (const { b, mesh } of Object.values(SP.bodies)) if (!FULL_SIZE.has(b.id)) mesh.scale.setScalar(radiusAU(b) * (0.1 + 0.9 * (sub ? sub[b.id] || 0 : 1)));
    const ren = SP.ren; ren.autoClear = false; ren.clear();
    ren.render(A.mly, A.camM); ren.render(A.ly, A.camL);
    if (lD < -1.1) { A.sunAnim = spaceFrame(now); ren.clearDepth(); ren.render(SP.scn, SP.cam); } else A.sunAnim = false;
  }

  // ---------- the Journey: stops at Earth, the Moon and the Sun, then one long flight out to the void, passing everything ----------
  const CRUISE = { slow: 0.32, normal: 0.6, fast: 1.2, home: 3.0 };   // decades of distance per second on the long flight
  const CRUISE_EASE = [-4.0, -2.6, 0.4, 2.5, 5.0, 6.5, 7.8, 9.2];     // a little slower (never stopping) as each wonder goes by
  function makeRoute() {
    const B = SP.bodies, at = id => B[id].mesh.position.clone(), lyv = p => p.clone().divideScalar(LY_AU), lA = au => Math.log10(au / LY_AU);
    const E = at('Earth'), Mo = at('Moon'), t = AE.MakeTime(new Date(S.utc)), O = () => new THREE.Vector3();
    const geoLy = id => { try { return (id === 'Moon' ? AE.GeoMoon(t).Length() : AE.GeoVector(id, t, true).Length()) / LY_AU; } catch (e) { return null; } };
    const lit = (p, side) => Math.atan2(-p.z, -p.x) + side;   // look from the sunlit side
    const out = [], add = (key, o) => out.push(Object.assign({ key, hold: 1.2, yaw: null, pitch: null }, o));
    const home = { T: lyv(E), lD: aeth.lD0, yaw: lit(E, 0.6), pitch: 0.3, sub: () => L.ui.youHere };
    add('earth', Object.assign({ hold: 1.0 }, home));
    const moon = { T: lyv(Mo), lD: lA(fitDist('Moon') * 2.6), yaw: lit(Mo, 0.45), pitch: 0.16, cap: () => bodyName('Moon'), subLy: geoLy('Moon') };
    add('moon', Object.assign({ hold: 2.2 }, moon));
    add('earthMoon', { T: lyv(E.clone().lerp(Mo, 0.4)), lD: lA(E.distanceTo(Mo) * 2.6), pitch: 0.6, hold: 1.2, sub: () => ' ' });
    const sun = { T: O(), lD: lA(fitDist('Sun') * 2.3), yaw: Math.atan2(E.z, E.x) + 0.5, pitch: 0.15, cap: () => bodyName('Sun'), subLy: geoLy('Sun') };
    add('sun', Object.assign({ hold: 2.6 }, sun));
    add('aether', { T: O(), lD: AETH_MAX, hold: 3.5, cruise: true, sub: () => L.ui.aetherLine });
    // the way back: one flight in to the Sun, then the Moon, then home (the Earth button flies straight home)
    const back = [Object.assign({ key: 'sun', hold: 1.8, cruise: true }, sun), Object.assign({ key: 'moon', hold: 1.6 }, moon), Object.assign({ key: 'earth', hold: 0.3 }, home)];
    return { out, back, rush: [Object.assign({ key: 'earth', hold: 0.3, cruise: true }, home)] };
  }
  const capOf = w => w.cap ? w.cap() : L.ui.stage[w.key] || '';
  const subOf = w => w.sub ? w.sub() : w.subLy != null ? F(L.ui.distFrom, { d: fmtLy(w.subLy) }) : null;
  function startTour(dir, rush) {
    const R = makeRoute(), route = dir > 0 ? R.out : rush ? R.rush : R.back, lD = aeth.lD, sunLD = R.out[3].lD;
    let i = dir < 0 ? 0 : Math.abs(lD - aeth.lD0) < 0.05 && !aeth.free ? 1 : lD > sunLD + 0.1 ? route.length - 1 : route.findIndex(w => w.lD > lD + 0.15);
    if (i < 0) i = route.length - 1;
    const T0 = (AET.T || pathT(lD)).clone();
    aeth.tour = { route, i, dir, rush, from: { key: Math.abs(lD - aeth.lD0) < 0.05 && !aeth.free ? 'earth' : null, T: T0, lD, yaw: aeth.yaw, pitch: aeth.pitch, cap: aeth.cap, sub: null } };
    aeth.tourT = T0; aeth.focus = null; aeth.focusOn = false; aeth.fk = 0; aeth.free = null; aeth.lDT = null;
    setupSeg();
  }
  function setupSeg() {
    const t = aeth.tour, a = t.from, b = t.route[t.i], v = AETH_SPEED[t.rush ? 'home' : aeth.speed] * (t.dir < 0 ? 1.6 : 1);   // the way home is quicker
    const hi = Math.max(a.lD, b.lD);
    t.bump = Math.max(0, Math.log10(Math.max(a.T.distanceTo(b.T), 1e-30) * 1.3) - hi);
    t.da = Math.pow(10, a.lD); t.db = Math.pow(10, b.lD); t.dp = Math.pow(10, hi + t.bump);
    t.dur = Math.max(2.6 * Math.pow(0.95 / v, 0.7), (Math.abs(a.lD - b.lD) + 2 * t.bump) / v * 1.25);
    t.wy = b.yaw; t.wp = b.pitch != null ? b.pitch : aetherPitch(b.lD);
    t.u = 0; t.hold = 0;
  }
  function finishTour() {
    Object.assign(aeth, { playing: false, rush: false, tour: null, tourT: null, free: null, dir: 1, lD: aeth.lD0 });
    syncJourney();
  }
  function tourStep(dt, now) {
    const t = aeth.tour, a = t.from, b = t.route[t.i], v = AETH_SPEED[t.rush ? 'home' : aeth.speed];
    if (t.hold > 0) {
      t.hold -= dt; aeth.yaw += dt * 0.035;   // a slow turn while stopped, to look around
      if (t.hold <= 0) {
        const from = { key: b.key, T: aeth.tourT.clone(), lD: aeth.lD, yaw: aeth.yaw, pitch: aeth.pitch, cap: capOf(b), sub: subOf(b) };
        if (t.i + 1 < t.route.length) { t.from = from; t.i++; setupSeg(); }
        else if (t.dir > 0) { aeth.cap = from.cap; startTour(-1, false); aeth.tour.from = Object.assign(aeth.tour.from, { key: b.key, cap: from.cap, sub: from.sub }); }
        else finishTour();
      }
      return;
    }
    if (b.cruise) { cruiseStep(t, a, b, dt, now); return; }
    t.u = Math.min(1, t.u + dt / t.dur);
    const e = easeIO(t.u);
    aeth.lD = a.lD + (b.lD - a.lD) * e + t.bump * Math.sin(Math.PI * e);
    const d = Math.pow(10, aeth.lD);
    // the target slides over in step with the zoom, so it never races across the screen
    let k;
    if (t.bump > 0.01) k = e < 0.5 ? 0.5 * (d - t.da) / Math.max(t.dp - t.da, 1e-30) : 0.5 + 0.5 * (t.dp - d) / Math.max(t.dp - t.db, 1e-30);
    else if (Math.abs(t.db - t.da) > 1e-3 * Math.max(t.da, t.db)) k = (d - t.da) / (t.db - t.da);
    else k = e;
    aeth.tourT = a.T.clone().lerp(b.T, clampV(k, 0, 1));
    if (now - aeth.userAt > 2500) {
      if (t.wy != null) { const want = a.yaw + angWrap(t.wy - a.yaw) * e; aeth.yaw += angWrap(want - aeth.yaw) * Math.min(1, dt * 2.5); }
      else aeth.yaw += dt * 0.04;
      const wantP = a.pitch + (t.wp - a.pitch) * e; aeth.pitch += (wantP - aeth.pitch) * Math.min(1, dt * 2.5);
    }
    if (t.u >= 1) t.hold = t.rush ? 0.05 : b.hold * Math.pow(0.95 / v, 0.5) ;
  }
  // the long flight: steady speed on the log scale, easing off at both ends, the view centring on whatever is biggest
  function cruiseStep(t, a, b, dt, now) {
    const sg = Math.sign(b.lD - a.lD) || 1, lD = aeth.lD;
    const ease = CRUISE_EASE.reduce((s, c) => s + Math.exp(-(((lD - c) / 0.5) ** 2)), 0);
    const ends = Math.min(1, 0.2 + Math.abs(lD - a.lD) * 1.1, 0.2 + Math.abs(b.lD - lD) * 1.1);
    const v = CRUISE[t.rush ? 'home' : aeth.speed] * (t.dir < 0 ? 1.5 : 1) * (1 - 0.35 * Math.min(1, ease)) * ends;
    aeth.lD += sg * v * dt;
    const done = (b.lD - aeth.lD) * sg <= 0.002;
    if (done) aeth.lD = b.lD;
    aeth.tourT = a.T.clone().lerp(pathT(aeth.lD), sstep(Math.abs(aeth.lD - a.lD), 0, 0.8)).lerp(b.T, 1 - sstep(Math.abs(b.lD - aeth.lD), 0, 0.8));
    if (now - aeth.userAt > 2500) {
      if (aeth.lD > 5.4) {   // among the galaxies: turn side-on to the line from us to Andromeda, so both are in view
        const u = AET.LGCly.clone().normalize().applyQuaternion(AET.qGal.clone().invert());
        aeth.yaw += angWrap(Math.atan2(u.z, u.x) + Math.PI / 2 - aeth.yaw) * Math.min(1, dt * 0.8) * sstep(aeth.lD, 5.4, 6.0);
      } else aeth.yaw += dt * 0.045;
      aeth.pitch += (aetherPitch(aeth.lD) - aeth.pitch) * Math.min(1, dt * 0.6);
      if (b.yaw != null) {   // coming home: settle into the starting view of Earth
        const w = 1 - sstep(aeth.lD, b.lD + 0.3, b.lD + 1.6);
        aeth.yaw += angWrap(b.yaw - aeth.yaw) * Math.min(1, dt * 2.5) * w; aeth.pitch += (b.pitch - aeth.pitch) * Math.min(1, dt * 2.5) * w;
      }
    }
    if (done) t.hold = t.rush ? 0.05 : b.hold * (b.key === 'aether' ? Math.pow(0.95 / AETH_SPEED[aeth.speed], 0.5) : 1);
  }
  function aetherStep(now) {
    const dt = Math.min(0.25, Math.max(0, (now - (aeth.lastT || now)) / 1000)); aeth.lastT = now;
    let moving = false;
    if (aeth.playing && aeth.tour) { moving = true; tourStep(dt, now); }
    else if (aeth.lDT != null) {
      aeth.lD += (aeth.lDT - aeth.lD) * Math.min(1, dt * aeth.rate);
      if (Math.abs(aeth.lDT - aeth.lD) < 0.002) { aeth.lD = aeth.lDT; aeth.lDT = null; }
      moving = true;
    }
    const fkT = aeth.focusOn ? 1 : 0;
    if (aeth.focus && Math.abs(aeth.fk - fkT) > 0.002) { aeth.fk = clampV(aeth.fk + Math.sign(fkT - aeth.fk) * dt / 2.2, 0, 1); moving = true; }
    else { aeth.fk = fkT; if (!fkT) aeth.focus = null; }
    return moving || !!(AET && AET.sunAnim) || now - aeth.capT < 700;
  }

  const AETH_STAGES = [[0.02, 'earth'], [0.8, 'earthMoon'], [6, 'inner'], [70, 'solar'], [600, 'kuiper'], [3000, 'edge'], [3 * LY_AU, 'oort'], [60 * LY_AU, 'near'], [3000 * LY_AU, 'hood'],
    [2.5e5 * LY_AU, 'milky'], [1.2e7 * LY_AU, 'local'], [3e8 * LY_AU, 'virgo'], [3.5e9 * LY_AU, 'web']];
  function fmtLy(ly) {
    const u = L.ui, au = ly * LY_AU, n = (x, dg) => x.toLocaleString('en-IN', { maximumFractionDigits: dg });
    if (au < 0.05) return n(Math.round(au * AU_KM), 0) + ' km';
    if (au < 1) return n(au * AU_KM / 1e6, 1) + ' ' + u.mkm;
    if (au < 3000) return n(au, au < 10 ? 2 : 0) + ' AU';
    if (ly < 1e6) return n(ly, ly < 10 ? 2 : ly < 100 ? 1 : 0) + ' ' + u.ly;
    if (ly < 1e9) return n(ly / 1e6, ly < 1e7 ? 2 : ly < 1e8 ? 1 : 0) + ' ' + u.mly;
    return n(ly / 1e9, 2) + ' ' + u.gly;
  }
  function drawAetherOverlay(now) {
    const g = octx, A = AET, lD = aeth.lD; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    posAether = [];
    const proj = (cam, p) => {
      _av.copy(p).applyMatrix4(cam.matrixWorldInverse); if (_av.z >= 0) return null;
      _av.applyMatrix4(cam.projectionMatrix); const x = (_av.x + 1) / 2 * W, y = (1 - _av.y) / 2 * H;
      return x < -80 || x > W + 80 || y < -40 || y > H + 40 ? null : { x, y };
    };
    const k = (H / 2) / Math.tan(55 / 2 * DEG), placed = [];
    const label = (text, x, y, color, alpha, font, align) => {
      if (alpha < 0.02) return;
      g.font = font; const w = g.measureText(text).width, x0 = clampV(align === 'center' ? x - w / 2 : x, 6, Math.max(6, W - 6 - w));   // keep labels on screen
      if (placed.some(q => x0 < q.x + q.w && q.x < x0 + w && Math.abs(q.y - y) < 14)) return;
      placed.push({ x: x0, y, w }); g.globalAlpha = alpha; g.fillStyle = color; g.textAlign = 'left'; g.fillText(text, x0, y);
    };
    g.textBaseline = 'middle'; g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = 6;
    const names = S.sp.names;
    // planets, while the solar system is close
    const pa = 1 - sstep(lD, -3.4, -2.8);
    if (pa > 0.01) for (const { b, mesh } of Object.values(SP.bodies)) {
      const p = proj(SP.cam, mesh.position); if (!p) continue;
      const rp = mesh.scale.x / Math.max(SP.cam.position.distanceTo(mesh.position), 1e-12) * k;
      maybeHD(b.id, rp);
      posAether.push({ kind: 'planet', id: b.id, x: p.x, y: p.y, r: Math.max(22, rp + 6) });
      const c = spColor(b.id);
      if (rp < 9) { g.globalAlpha = 0.9 * pa; g.strokeStyle = c; g.lineWidth = 1.3; g.beginPath(); g.arc(p.x, p.y, 7, 0, 2 * Math.PI); g.stroke(); }
      if (names) label(bodyName(b.id), p.x + Math.min(Math.max(rp, 7), W / 3) + 7, p.y, c, pa, `600 12.5px ${FONT}`);
    }
    // the two belts, labelled on the side nearest you
    if (names) {
      const beltLabel = (R, a, text) => { if (a < 0.02) return; const p = proj(SP.cam, new THREE.Vector3(Math.cos(aeth.yaw) * R, 0, Math.sin(aeth.yaw) * R)); if (p) label(text, p.x, p.y + 14, '#cdbf9e', a * 0.85, `500 11.5px ${FONT}`, 'center'); };
      beltLabel(2.75, sstep(lD, -4.9, -4.5) * (1 - sstep(lD, -3.6, -3.1)), L.ui.asteroidBelt);
      beltLabel(42, sstep(lD, -3.4, -3.0) * (1 - sstep(lD, -1.9, -1.4)), L.ui.kuiperBelt);
    }
    // the brightest nearby stars by name
    const sa = sstep(lD, -1.4, -0.6) * (1 - sstep(lD, 2.9, 3.5));
    if (names && sa > 0.01) for (const s of A.named) {
      const p = proj(A.camL, s.p); if (!p) continue;
      const m = s.absMag + 5 * Math.log10(Math.max(A.camL.position.distanceTo(s.p), 1e-9) / 32.6156);
      if (m > 3.2) continue;
      label(starName(s.i), p.x + 8, p.y, '#ece4d0', sa * Math.min(1, (3.2 - m) / 1.5) * 0.85, `500 11.5px ${FONT}`);
    }
    // the nearest star
    const ca = sstep(lD, 0.3, 0.7) * (1 - sstep(lD, 1.7, 2.2));
    if (ca > 0.01 && A.alphaCen) { const p = proj(A.camL, A.alphaCen); if (p) { g.globalAlpha = ca; g.strokeStyle = '#ece4d0'; g.lineWidth = 1.3; g.beginPath(); g.arc(p.x, p.y, 7, 0, 2 * Math.PI); g.stroke(); label(starName(A.alphaCenI) + ' · 4.37 ' + L.ui.ly, p.x + 12, p.y, '#ece4d0', ca, `600 12px ${FONT}`); } }
    // you are here
    const ya = sstep(lD, 0.5, 1.1) * (1 - sstep(lD, 6.3, 6.9));
    if (ya > 0.01) {
      const p = proj(A.camL, new THREE.Vector3());
      if (p) {
        g.globalAlpha = ya; g.strokeStyle = '#e2bf5a'; g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y, 8, 0, 2 * Math.PI); g.stroke();
        label(`${L.ui.youHere} · ${bodyName('Sun')}`, p.x + 14, p.y, '#e2bf5a', ya, `600 12.5px ${FONT}`);
        posAether.push({ kind: 'home', x: p.x, y: p.y, r: 20 });
      }
    }
    // the black hole at the centre of the galaxy
    const ba = sstep(lD, 3.85, 4.05) * (1 - sstep(lD, 4.6, 4.85));
    if (names && ba > 0.01) { const p = proj(A.camL, A.GC); if (p) { g.globalAlpha = ba * 0.8; g.strokeStyle = '#ece4d0'; g.lineWidth = 1; g.beginPath(); g.arc(p.x, p.y, 5, 0, 2 * Math.PI); g.stroke(); label(L.ui.sgrA, p.x + 10, p.y + 12, '#ece4d0', ba * 0.85, `500 11.5px ${FONT}`); } }
    const voidF = 1 - sstep(lD, 9.3, 9.9);
    // our galaxy
    const ma = sstep(lD, 4.5, 5.0) * (1 - sstep(lD, 8.4, 9.0));
    if (ma > 0.01) {
      const p = proj(A.camL, A.GC);
      if (p) {
        const rp = 50000 / Math.max(A.camL.position.distanceTo(A.GC), 1) * k;
        if (names) label(L.ui.milkyWay, p.x, p.y + Math.min(rp * 0.4, H / 4) + 16, '#e2bf5a', ma, `600 13px ${FONT}`, 'center');
        posAether.push({ kind: 'gal', lab: { key: 'milkyWay', posLy: A.GC, diamLy: 1e5 }, x: p.x, y: p.y, r: Math.max(26, rp * 0.5) });
      }
    }
    // other galaxies
    for (const lab of A.labels) {
      let a = lab.vis(lD) * voidF;
      if (aeth.focusOn && aeth.focus && aeth.focus.key === lab.key) a = 1;
      const p = proj(A.camM, lab.pos); if (!p) continue;
      const rp = lab.diamLy / 2 / Math.max(A.camL.position.distanceTo(lab.posLy), 1) * k;
      if (a > 0.05 || rp > 12) posAether.push({ kind: 'gal', lab, x: p.x, y: p.y, r: Math.max(20, rp * 0.8) });
      if (names) label(galName(lab.key), p.x + Math.max(rp * 0.55, 6) + 6, p.y, '#ece4d0', a * 0.9, `500 12px ${FONT}`);
    }
    const va = sstep(lD, 7.1, 7.6) * (1 - sstep(lD, 9.1, 9.6));
    if (names && va > 0.01) { const p = proj(A.camM, A.virgo); if (p) label(L.ui.virgoCl, p.x, p.y - 18, '#ece4d0', va * 0.85, `600 12.5px ${FONT}`, 'center'); }
    // the stage you are in, and how far from Earth
    const live = () => F(L.ui.distFrom, { d: fmtLy(A.P.distanceTo(SP.bodies.Earth.mesh.position.clone().divideScalar(LY_AU))) });
    let cap, sub;
    const focusName = aeth.focusOn && aeth.focus ? (aeth.focus.key === 'milkyWay' ? L.ui.milkyWay : galName(aeth.focus.key)) : null;
    if (focusName) { cap = focusName; sub = live(); }
    else if (aeth.playing && aeth.tour && !(aeth.tour.route[aeth.tour.i].cruise && aeth.tour.hold <= 0)) {
      const t = aeth.tour, b = t.route[t.i], to = t.hold > 0 || t.u > 0.5;
      cap = to ? capOf(b) : t.from.cap || capOf(b); sub = (to ? subOf(b) : t.from.sub) || live();
    } else {
      const dAU = A.d * LY_AU; let st = 'aether'; for (const [lim, key] of AETH_STAGES) if (dAU < lim) { st = key; break; }
      cap = L.ui.stage[st]; sub = st === 'aether' ? L.ui.aetherLine : live();
    }
    if (cap !== aeth.cap) { aeth.cap = cap; aeth.capT = now; }
    const fade = Math.min(1, (now - aeth.capT) / 600);
    const tb = $('timebar'), sr = $('stage').getBoundingClientRect(), tr = tb && tb.offsetParent ? tb.getBoundingClientRect() : null;
    const cy = tr ? tr.top - sr.top - 44 : H - 70;
    g.textAlign = 'center'; g.globalAlpha = fade; g.shadowBlur = 10;
    let fs = isPhone() ? 20 : 24; g.font = `600 ${fs}px "Source Serif 4", ${FONT}`;
    while (fs > 14 && g.measureText(cap).width > W - 32) { fs -= 1; g.font = `600 ${fs}px "Source Serif 4", ${FONT}`; }   // long names in some languages: shrink to fit
    g.fillStyle = '#e2bf5a'; g.fillText(cap, W / 2, cy);
    g.font = `500 12.5px ${FONT}`; g.fillStyle = 'rgba(236,228,208,0.8)'; g.fillText(sub, W / 2, cy + 24);
    g.shadowBlur = 0; g.globalAlpha = 1; g.textAlign = 'left';
    g.font = `500 11.5px ${FONT}`; g.fillStyle = 'rgba(236,228,208,0.7)';
    const zr = $('zoombar').getBoundingClientRect();
    if (!isPhone()) g.fillText(L.ui.aetherHint, 16, zr.bottom - sr.top + 16);
    else {   // wrap to the screen width on phones
      let line = '', y = zr.bottom - sr.top + 16;
      for (const w of L.ui.aetherHint.split(' ')) {
        if (line && g.measureText(line + ' ' + w).width > W - 32) { g.fillText(line, 16, y); y += 15; line = w; } else line = line ? line + ' ' + w : w;
      }
      if (line) g.fillText(line, 16, y);
    }
  }
  function pickAether(x, y) {
    let best = null, bd = 1e9;
    for (const p of posAether) { const d = Math.hypot(p.x - x, p.y - y); if (d < p.r && d < bd) { bd = d; best = p; } }
    return best;
  }

  function syncJourney() {
    const b = $('aJourney'); if (b) b.setAttribute('aria-pressed', String(aeth.playing && !aeth.rush));
    document.querySelectorAll('#speedSeg button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.speed === aeth.speed)));
    needsRender = true;
  }
  function stopJourney() {
    if (!aeth.playing) return;
    if (aeth.tourT) aeth.free = { T: aeth.tourT.clone(), lD: aeth.lD };   // stay right here; scrolling carries on from this spot
    Object.assign(aeth, { playing: false, rush: false, tour: null, tourT: null });
    syncJourney();
  }
  function focusGalaxy(lab) {
    stopJourney();
    aeth.focus = { key: lab.key, pos: lab.posLy.clone(), minLD: Math.log10(lab.diamLy * 0.7) };
    if (!aeth.focusOn) aeth.fk = 0;
    aeth.focusOn = true; aeth.rate = 1.6; aeth.lDT = Math.log10(lab.diamLy * 2.2); needsRender = true;
  }
  function enterAether() {
    if (!AET) AET = buildAether();
    const e = SP.bodies.Earth.mesh.position;
    aeth.lD0 = Math.log10(fitDist('Earth') * 2.4 / LY_AU);
    Object.assign(aeth, { lD: aeth.lD0, lDT: null, yaw: Math.atan2(-e.z, -e.x) + 0.6, pitch: 0.3, playing: false, rush: false, dir: 1, hold: 0, focus: null, focusOn: false, fk: 0, lastT: performance.now(), cap: '', tour: null, tourT: null, free: null });
    SP.back.visible = false; SP.scn.getObjectByName('spokes').visible = false; SP.ren.setClearColor(0x000000, 1);
    syncJourney();
  }
  function leaveAether() {
    if (!SP) return;
    aeth.playing = false; aeth.tour = null; SP.ren.autoClear = true; SP.ren.setClearColor(0x030305, 1); SP.back.visible = true;
    for (const l of SP.orbits.children) l.material.opacity = 0.5;
    for (const l of SP.moonOrbit.children) l.material.opacity = 0.45;
    if (AET) { AET.ast.visible = false; AET.kb.visible = false; }
    for (const { b, mesh } of Object.values(SP.bodies)) mesh.scale.setScalar(radiusAU(b));
    placeCam();
  }
  $('aJourney').addEventListener('click', () => {
    if (aeth.playing && !aeth.rush) { stopJourney(); return; }
    const dir = aeth.lD >= AETH_MAX - 0.01 ? -1 : 1;
    aeth.playing = true; aeth.rush = false; aeth.userAt = 0; aeth.lastT = performance.now();
    startTour(dir, false); syncJourney();
  });
  document.querySelectorAll('#speedSeg button').forEach(b => b.addEventListener('click', () => { aeth.speed = b.dataset.speed; if (aeth.tour) { const t = aeth.tour, u = t.u, h = t.hold; setupSeg(); t.u = u; t.hold = h; } syncJourney(); }));
  $('aetherHome').addEventListener('click', () => {
    if (aeth.lD <= aeth.lD0 + 0.01 && !aeth.focusOn && !aeth.free) return;
    aeth.playing = true; aeth.rush = true; aeth.lastT = performance.now();
    startTour(-1, true); syncJourney();
  });
  // looking around: drag = turn, wheel / pinch / ± = travel in or out, tap a galaxy to visit it
  {
    const ptr = new Map(); let moved = 0, pinch = 0, lastWheel = 0, streak = 0;
    const lxy = e => { const r = spaceCanvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const minLD = () => aeth.focusOn && aeth.focus ? aeth.focus.minLD : aeth.lD0 - 0.35;
    const setLD = (v, glide) => { v = clampV(v, minLD(), AETH_MAX); aeth.rate = 9; if (glide) aeth.lDT = v; else { aeth.lD = v; aeth.lDT = null; } needsRender = true; };
    aetherZoom = dec => { stopJourney(); setLD((aeth.lDT != null ? aeth.lDT : aeth.lD) + dec, true); };
    spaceCanvas.addEventListener('pointerdown', e => {
      if (S.view !== 'aether') return;
      closeSheet();
      try { spaceCanvas.setPointerCapture(e.pointerId); } catch (err) { }
      ptr.set(e.pointerId, lxy(e)); moved = 0;
      if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); }
    });
    spaceCanvas.addEventListener('pointermove', e => {
      if (S.view !== 'aether' || !AET) return;
      const prev = ptr.get(e.pointerId), cur = lxy(e);
      if (!prev) { if (e.pointerType === 'mouse') spaceCanvas.style.cursor = pickAether(...cur) ? 'pointer' : ''; return; }
      ptr.set(e.pointerId, cur);
      if (ptr.size === 1) {
        const dx = cur[0] - prev[0], dy = cur[1] - prev[1]; moved += Math.abs(dx) + Math.abs(dy);
        aeth.yaw += dx * 0.005; aeth.pitch = clampV(aeth.pitch + dy * 0.005, -1.5, 1.5); aeth.userAt = performance.now();
      } else if (ptr.size === 2) {
        const [a, b] = [...ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch && d) { stopJourney(); setLD(aeth.lD + Math.log10(pinch / d) * 2.4, false); }
        pinch = d; moved += 10;
      }
      needsRender = true;
    });
    const up = e => {
      if (!ptr.has(e.pointerId)) return;
      ptr.delete(e.pointerId); if (ptr.size < 2) pinch = 0;
      if (moved < 6 && ptr.size === 0) {
        const hit = pickAether(...lxy(e)); if (!hit) return;
        if (hit.kind === 'planet') { setView('space'); S.sel = hit.id; renderPanel(); focusSpace(hit.id); showTipFor(hit.id, true); }
        else if (hit.kind === 'gal') focusGalaxy(hit.lab);
      }
    };
    spaceCanvas.addEventListener('pointerup', up); spaceCanvas.addEventListener('pointercancel', up);
    spaceCanvas.addEventListener('wheel', e => {
      if (S.view !== 'aether') return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY, now = performance.now();
      streak = now - lastWheel < 220 ? Math.min(streak + 1, 8) : 0; lastWheel = now;
      aetherZoom(clampV(dy, -300, 300) * 0.0028 * (Math.abs(dy) >= 50 ? 1 + streak * 0.25 : 1));
    }, { passive: false });
    window.addEventListener('keydown', e => {
      if (S.view !== 'aether' || !AET || (e.target && e.target.closest && e.target.closest('input,select,textarea,button'))) return;
      const turn = { ArrowLeft: [-0.08, 0], a: [-0.08, 0], ArrowRight: [0.08, 0], d: [0.08, 0], ArrowUp: [0, 0.08], w: [0, 0.08], ArrowDown: [0, -0.08], s: [0, -0.08] }[e.key];
      if (turn) { aeth.yaw += turn[0]; aeth.pitch = clampV(aeth.pitch + turn[1], -1.5, 1.5); aeth.userAt = performance.now(); needsRender = true; }
      if (e.key === '+' || e.key === '=') aetherZoom(-0.5);
      if (e.key === '-' || e.key === '_') aetherZoom(0.5);
    });
  }


  // ---------- phone sheets ----------
  const isPhone = () => window.matchMedia('(max-width: 1023px)').matches;
  function setSheet(name) {
    if (name) appEl.dataset.sheet = name; else delete appEl.dataset.sheet;
    document.querySelectorAll('#mtabs button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.sheet || '') === (name || ''))));
  }
  document.querySelectorAll('#mtabs button').forEach(b => b.addEventListener('click', () => setSheet(appEl.dataset.sheet === b.dataset.sheet ? '' : b.dataset.sheet)));
  // × on a panel: on phones it closes the sheet; on wider screens it tucks the panel away behind a small chip
  document.querySelectorAll('.xclose').forEach(b => b.addEventListener('click', e => {
    e.preventDefault();
    if (isPhone()) setSheet('');
    else appEl.classList.add('hide-' + b.dataset.close);
    needsRender = true;
  }));
  document.querySelectorAll('.reopen').forEach(b => b.addEventListener('click', () => appEl.classList.remove('hide-' + b.dataset.open)));
  const closeSheet = () => { if (isPhone() && appEl.dataset.sheet) setSheet(''); };

  // An open info card closes on the next click or tap anywhere (tapping another planet or star
  // in the sky opens that one's card instead, a moment later on release).
  document.addEventListener('pointerdown', e => {
    if (!tipFor || !tipPinned || e.target.closest('#tip')) return;
    S.sel = null; showTipFor(null); renderPanel();
  }, true);

  // Phones: pull a sheet down by its heading (or keep pulling once its content is at the top) to close it.
  document.querySelectorAll('.sheet-panel').forEach(panel => {
    let y0 = null, dy = 0, dragging = false, fromHead = false;
    const begin = (y, target) => { y0 = y; dy = 0; dragging = false; fromHead = !!target.closest('.sheet-head, .sheet-grab'); };
    const move = (y, ev) => {
      if (y0 == null) return;
      const d = y - y0;
      if (!dragging) {
        if (d > 8 && (fromHead || panel.scrollTop <= 0)) dragging = true;
        else if (Math.abs(d) > 8) { y0 = null; return; }       // a normal scroll of the sheet's content
      }
      if (dragging) {
        if (ev.cancelable) ev.preventDefault();
        dy = Math.max(0, d);
        panel.style.setProperty('transform', `translate(-50%, ${dy}px)`, 'important');
        panel.style.setProperty('transition', 'none');
      }
    };
    const end = () => {
      if (y0 == null) return;
      if (dragging) {
        if (dy > 70) setSheet('');
        panel.style.removeProperty('transform'); panel.style.removeProperty('transition');
      }
      y0 = null; dragging = false;
    };
    panel.addEventListener('touchstart', e => { if (isPhone() && e.touches.length === 1) begin(e.touches[0].clientY, e.target); }, { passive: true });
    panel.addEventListener('touchmove', e => move(e.touches[0].clientY, e), { passive: false });
    panel.addEventListener('touchend', end); panel.addEventListener('touchcancel', end);
    // mouse (narrow desktop windows): drag the heading down
    panel.addEventListener('mousedown', e => { if (isPhone() && e.target.closest('.sheet-head, .sheet-grab') && !e.target.closest('button')) begin(e.clientY, e.target); });
    window.addEventListener('mousemove', e => move(e.clientY, e));
    window.addEventListener('mouseup', end);
    // trackpad / mouse wheel: scrolling further up once the sheet is already at its top closes it
    let lastWheel = 0, gestureAtTop = false, pull = 0;
    panel.addEventListener('wheel', e => {
      if (!isPhone()) return;
      const now = performance.now();
      if (now - lastWheel > 250) { gestureAtTop = panel.scrollTop <= 0; pull = 0; }   // a new scroll gesture
      lastWheel = now;
      if (gestureAtTop && e.deltaY < 0) { pull -= e.deltaY; if (pull > 160) { pull = 0; gestureAtTop = false; setSheet(''); } }
    }, { passive: true });
  });

  // ---------- toast ----------
  let toastT;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 5200); }

  // ---------- light / dark theme ----------
  function isDark() {
    const t = document.documentElement.dataset.theme;
    return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  document.querySelectorAll('[data-action="theme"]').forEach(b => b.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('ag-theme', next); } catch (e) { }
  }));

  // ---------- language switching ----------
  let showExample = false;
  const SCRIPT_FONT = { hi: ['Noto Sans Devanagari', 'अ'], ta: ['Noto Sans Tamil', 'அ'], te: ['Noto Sans Telugu', 'అ'], ml: ['Noto Sans Malayalam', 'അ'], kn: ['Noto Sans Kannada', 'ಅ'] };
  const langSel = $('langSel');
  langSel.innerHTML = I.LANGS.map(([c, n]) => `<option value="${c}">${n}</option>`).join('');
  langSel.addEventListener('change', () => applyLanguage(langSel.value));
  window.addEventListener('hashchange', () => { const c = location.hash.slice(1); if (I.codes.includes(c) && c !== L.code) applyLanguage(c); });
  function applyLanguage(code, booting) {
    if (!I.codes.includes(code)) code = 'ta-en';
    L = I.pack(code);
    document.documentElement.lang = code.slice(0, 2);
    langSel.value = code;
    try { localStorage.setItem('janmaVaanamLang', code); } catch (e) { }
    if (location.hash.slice(1) !== code) location.hash = code;   // a shareable link for each language
    const get = path => path.split('.').reduce((o, k) => (o == null ? o : o[k]), L.ui);
    document.querySelectorAll('[data-i18n]').forEach(el => { const v = get(el.dataset.i18n); if (v != null) el.textContent = v; });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => { const v = get(el.dataset.i18nPh); if (v != null) { el.placeholder = v; if (el.id === 'fFind') el.setAttribute('aria-label', v); } });
    langSel.setAttribute('aria-label', L.ui.lang);
    document.querySelectorAll('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', get(el.dataset.i18nAria) || 'Close'));
    $('exampleNote').innerHTML = showExample ? L.ui.example : '';
    syncPlay();
    placeHint();
    if (!booting) { renderPanel(); refreshTip(); if (!findList.hidden) openFind(); }
    // load the script's font for the sky labels, then redraw them
    const sf = SCRIPT_FONT[code.slice(0, 2)];
    if (sf && !L.mix && document.fonts && document.fonts.load) document.fonts.load(`500 12px "${sf[0]}"`, sf[1]).then(() => { needsRender = true; }).catch(() => { });
    needsRender = true;
  }

  // ---------- initial view ----------
  function pointDefault() {
    const a = S.astro; S.sel = null; showTipFor(null);
    const moon = a.bodies[1];
    const up = a.bodies.filter(b => b.alt > 8 && b.id !== 'Sun').sort((x, y) => x.mag - y.mag);
    let az, alt;
    if (moon.alt > 8) { az = moon.az; alt = Math.min(moon.alt, 55); }
    else if (up.length) { az = up[0].az; alt = Math.min(up[0].alt, 55); }
    else { az = (Math.atan2(...(() => { const w = worldOf('Lagna'); return [w.x, -w.z]; })()) / DEG + 360) % 360; alt = 22; }
    S.az = az; S.alt = alt; S.fov = isPhone() ? 95 : 78; applyCamera(); renderPanel(); needsRender = true;
  }

  // ---------- resize + loop ----------
  function resize() {
    const st = $('stage'); W = st.clientWidth || window.innerWidth; H = st.clientHeight || window.innerHeight;
    cRect = glCanvas.getBoundingClientRect();
    renderer.setSize(W, H, false);
    ov.width = Math.round(W * dpr); ov.height = Math.round(H * dpr);
    if (SP) { SP.ren.setSize(W, H, false); SP.cam.aspect = W / H; SP.cam.updateProjectionMatrix(); }
    if (AET) for (const c of [AET.camL, AET.camM]) { c.aspect = W / H; c.updateProjectionMatrix(); }
    camera.aspect = W / H; applyCamera(); needsRender = true;
  }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(() => resize()).observe($('stage'));

  let needsRender = true, lastT = performance.now(), lastSkyUpdate = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (S.playing) {
      const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
      S.utc += dt * S.speed * 60000;
      if (now - lastSkyUpdate > 33) { updateSky(); refreshTip(); lastSkyUpdate = now; }
    }
    if (fly) {
      const t = Math.min(1, (now - fly.t0) / fly.dur), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      let dAz = ((fly.to.az - fly.from.az + 540) % 360) - 180;
      S.az = (fly.from.az + dAz * e + 360) % 360; S.alt = fly.from.alt + (fly.to.alt - fly.from.alt) * e;
      S.fov = Math.exp(Math.log(fly.from.fov) + (Math.log(fly.to.fov) - Math.log(fly.from.fov)) * e);
      applyCamera(); needsRender = true; if (t >= 1) fly = null;
    }
    stepZoom();
    if (S.view === 'aether' && SP && AET) {
      if (aetherStep(now)) needsRender = true;
      if (needsRender) { aetherRender(now); drawAetherOverlay(now); needsRender = false; }
    } else if (S.view === 'space' && SP) {
      if (stepSpaceAnim(now)) needsRender = true;
      if (spaceFrame(now)) needsRender = true;
      if (needsRender) { SP.ren.render(SP.scn, SP.cam); drawSpaceOverlay(); needsRender = false; }
    } else if (needsRender) { renderer.render(scene, camera); drawOverlay(); needsRender = false; }
  }

  // ---------- boot ----------
  function todayIn(tz) {
    const p = {}; for (const x of new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())) p[x.type] = x.value;
    return { d: `${p.year}-${p.month}-${p.day}`, t: `${p.hour}:${p.minute}` };
  }
  let saved = null; try { saved = JSON.parse(localStorage.getItem('janmaVaanam') || 'null'); } catch (e) { }
  if (saved && saved.d && saved.t && isFinite(saved.lat)) {
    $('fName').value = saved.name || ''; setIsoDate(saved.d); $('fTime').value = saved.t;
    setPlace(saved.place, saved.lat, saved.lon, saved.tz);
    const [y, m, dd] = saved.d.split('-').map(Number), [hh, mi] = saved.t.split(':').map(Number);
    Object.assign(S, { lat: saved.lat, lon: saved.lon, tz: saved.tz, place: saved.place, name: saved.name || '', isExample: false });
    S.baseUtc = S.utc = C.localToUtc(y, m, dd, hh, mi, 0, S.tz);
  } else {
    const n = todayIn('Asia/Kolkata');
    setIsoDate(n.d); $('fTime').value = n.t; setPlace('Chennai, Tamil Nadu', 13.0827, 80.2707, 'Asia/Kolkata');
    showExample = true;
    if (isPhone()) setTimeout(() => toast(L.ui.toastPhone), 600);
  }
  // language: #code in the link wins, then the viewer's last choice, then Tamil + English
  let savedLang = null; try { savedLang = localStorage.getItem('janmaVaanamLang'); } catch (e) { }
  const hashLang = location.hash.slice(1);
  applyLanguage(I.codes.includes(hashLang) ? hashLang : I.codes.includes(savedLang) ? savedLang : 'ta-en', true);
  resize(); updateSky(); pointDefault();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { needsRender = true; });
  requestAnimationFrame(loop);
})();
