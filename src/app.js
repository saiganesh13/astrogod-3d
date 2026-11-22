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
    const pts = []; for (let l = 0; l <= 360; l += 2) pts.push(C.eclipticPoint(astro.rEctEqj, l));
    const ticks = [];
    rasiLabels = [];
    for (let k = 0; k < 12; k++) {
      const lb = k * 30 + astro.ayan;
      ticks.push([C.eclipticPoint(astro.rEctEqj, lb, -3), C.eclipticPoint(astro.rEctEqj, lb, 3)]);
      rasiLabels.push({ k, pos: new THREE.Vector3(...C.eclipticPoint(astro.rEctEqj, lb + 15, -4.2)).multiplyScalar(R_LINE) });
    }
    const m1 = new THREE.Mesh(ribbonGeometry([pts], 0.07, R_LINE - 2), lineMat(0xd9b86a, 0.45));
    const m2 = new THREE.Mesh(ribbonGeometry(ticks, 0.09, R_LINE - 2), lineMat(0xd9b86a, 0.6));
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
  $('zIn').addEventListener('click', () => zoomTo(zoomTarget() / 2.5));
  $('zOut').addEventListener('click', () => zoomTo(zoomTarget() * 2.5));
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
        g.textAlign = 'center'; g.font = `${L.native ? '' : 'italic '}400 11px ${FONT}`;
        for (const r of rasiLabels) {
          W3.copy(r.pos).applyMatrix4(skyM); const al = belowAlpha(W3); if (!al) continue;
          const p = project(W3); if (!p) continue;
          g.globalAlpha = al * 0.7; g.fillStyle = '#d9b86a'; g.fillText(F(L.ui.belt, { r: rName(r.k) }), p.x, p.y);
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
      h += `<p>${F(L.ui.retroLine, { w: `<b style="color:var(--vakri)">${L.ui.vakri}</b>`, s: Math.abs(b.speed).toFixed(3) })}</p>`;
      if (b.phaseFraction > 0.985 && ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'].includes(b.id)) h += `<p>${L.ui.opposite}</p>`;
    } else if (b.id !== 'Sun' && b.id !== 'Moon') h += `<p>${F(L.ui.direct, { s: b.speed.toFixed(3) })}</p>`;
    if (b.combust) h += `<p>${F(L.ui.combustLine, { w: `<b style="color:var(--combust)">${L.ui.combust}</b>`, d: b.sunSep.toFixed(1) })}</p>`;
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
    const p = screenOf(tipFor);
    if (!p) { tip.style.left = '-9999px'; return; }
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const o = planets[tipFor];
    const rp = o ? Math.min(W / 3, (o.rad / o.rPos) * pxPerRad() * (o.ring ? 2.2 : 1)) : 0;
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
    if (needsRender) { renderer.render(scene, camera); drawOverlay(); needsRender = false; }
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
