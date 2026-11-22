// Astronomy + Jyotish calculations. Needs the astronomy-engine global `Astronomy`.
(function (root) {
  const A = root.Astronomy || (typeof require !== 'undefined' ? require('astronomy-engine') : null);
  const DEG = Math.PI / 180;
  const norm360 = x => ((x % 360) + 360) % 360;

  const RASI = ['Mesham', 'Rishabam', 'Mithunam', 'Kadagam', 'Simmam', 'Kanni',
    'Thulam', 'Viruchigam', 'Dhanusu', 'Magaram', 'Kumbam', 'Meenam'];
  const RASI_EN = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
    'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
  const NAKSHATRA = ['Ashwini', 'Bharani', 'Karthigai', 'Rohini', 'Mirugasirisham', 'Thiruvathirai',
    'Punarpoosam', 'Poosam', 'Ayilyam', 'Magam', 'Pooram', 'Uthiram', 'Hastham', 'Chithirai',
    'Swathi', 'Visakam', 'Anusham', 'Kettai', 'Moolam', 'Pooradam', 'Uthiradam', 'Thiruvonam',
    'Avittam', 'Sadhayam', 'Poorattathi', 'Uthirattathi', 'Revathi'];
  const TITHI = ['Prathamai', 'Dvitiyai', 'Tritiyai', 'Chaturthi', 'Panchami', 'Shashti', 'Saptami',
    'Ashtami', 'Navami', 'Dasami', 'Ekadasi', 'Dvadasi', 'Trayodasi', 'Chaturdasi'];

  // Bodies drawn as lit spheres. diam: equatorial radius in km. pole: north pole RA/Dec (J2000, deg).
  const BODIES = [
    { id: 'Sun', graha: 'Suriyan', radius: 696000, pole: [286.13, 63.87] },
    { id: 'Moon', graha: 'Chandran', radius: 1737.4, pole: [270.0, 66.54] },
    { id: 'Mercury', graha: 'Budhan', radius: 2439.7, pole: [281.01, 61.41], combust: 14, combustR: 12 },
    { id: 'Venus', graha: 'Sukran', radius: 6051.8, pole: [272.76, 67.16], combust: 10, combustR: 8 },
    { id: 'Mars', graha: 'Sevvai', radius: 3396.2, pole: [317.68, 52.89], combust: 17 },
    { id: 'Jupiter', graha: 'Guru', radius: 71492, pole: [268.06, 64.50], combust: 11 },
    { id: 'Saturn', graha: 'Sani', radius: 60268, pole: [40.59, 83.54], combust: 15 },
    { id: 'Uranus', graha: 'Uranus', radius: 25559, pole: [257.31, -15.18] },
    { id: 'Neptune', graha: 'Neptune', radius: 24764, pole: [299.36, 43.46] },
  ];
  const AU_KM = 149597870.7;

  function radecVec(raDeg, decDeg) {
    const a = raDeg * DEG, d = decDeg * DEG;
    return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  }
  const rot = (r, v) => [ // same convention as Astronomy.RotateVector
    r.rot[0][0] * v[0] + r.rot[1][0] * v[1] + r.rot[2][0] * v[2],
    r.rot[0][1] * v[0] + r.rot[1][1] * v[1] + r.rot[2][1] * v[2],
    r.rot[0][2] * v[0] + r.rot[1][2] * v[1] + r.rot[2][2] * v[2]];
  const vlen = v => Math.hypot(v[0], v[1], v[2]);
  const vnorm = v => { const l = vlen(v); return [v[0] / l, v[1] / l, v[2] / l]; };
  const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const V = v => [v.x, v.y, v.z];

  // Lahiri (Chitrapaksha) ayanamsa, degrees. Accurate to well under 1 arc-minute for 1900-2100.
  function lahiri(time) {
    const years = time.tt / 365.25;
    return 23.85306 + 0.0139697 * years + 3.1e-9 * years * years;
  }
  // Mean lunar node (Rahu), tropical longitude of date.
  function meanRahu(time) {
    const T = time.tt / 36525;
    return norm360(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + T * T * T / 467441);
  }

  function eclLon(rEqjEct, vEqj) {
    const e = rot(rEqjEct, vEqj);
    return norm360(Math.atan2(e[1], e[0]) / DEG);
  }

  function signInfo(sid) {
    const s = Math.floor(sid / 30);
    const inSign = sid - s * 30;
    const nak = Math.floor(sid / (360 / 27));
    const pada = Math.floor((sid - nak * (360 / 27)) / (360 / 108)) + 1;
    return { sign: s, rasi: RASI[s], rasiEn: RASI_EN[s], deg: inSign, nak, nakshatra: NAKSHATRA[nak], pada };
  }

  function horOf(rEqjHor, v) {
    const h = rot(rEqjHor, vnorm(v)); // x north, y west, z zenith
    return { alt: Math.asin(Math.max(-1, Math.min(1, h[2]))) / DEG, az: norm360(Math.atan2(-h[1], h[0]) / DEG), h };
  }

  // Ascendant (Lagna): ecliptic point on the eastern horizon.
  function ascendant(rEctEqj, rEqjHor) {
    const altOf = lam => { const v = rot(rEctEqj, [Math.cos(lam * DEG), Math.sin(lam * DEG), 0]); return rot(rEqjHor, v); };
    let prev = altOf(0);
    for (let l = 1; l <= 360; l++) {
      const cur = altOf(l);
      // rising crossing: below → above while point lies east (y < 0); ecliptic longitude increases eastward
      if (prev[2] < 0 && cur[2] >= 0 && cur[1] < 0) {
        let lo = l - 1, hi = l;
        for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (altOf(m)[2] < 0) lo = m; else hi = m; }
        return norm360((lo + hi) / 2);
      }
      prev = cur;
    }
    // fallback: crossing with point east regardless of direction
    for (let l = 0; l < 360; l += 0.5) { const c = altOf(l); if (Math.abs(c[2]) < 0.01 && c[1] < 0) return l; }
    return 0;
  }

  function moonPhaseName(p) {
    if (p < 6 || p >= 354) return 'New Moon';
    if (p < 84) return 'Waxing Crescent';
    if (p < 96) return 'First Quarter';
    if (p < 174) return 'Waxing Gibbous';
    if (p < 186) return 'Full Moon';
    if (p < 264) return 'Waning Gibbous';
    if (p < 276) return 'Last Quarter';
    return 'Waning Crescent';
  }

  function compute(utcMs, lat, lon) {
    const date = new Date(utcMs);
    const t = A.MakeTime(date);
    const tm = A.MakeTime(new Date(utcMs - 43200000));
    const tp = A.MakeTime(new Date(utcMs + 43200000));
    const obs = new A.Observer(lat, lon, 0);
    const rEqjHor = A.Rotation_EQJ_HOR(t, obs);
    const rEqjEct = A.Rotation_EQJ_ECT(t);
    const rEctEqj = A.Rotation_ECT_EQJ(t);
    const ayan = lahiri(t);
    const ov = V(A.ObserverVector(t, obs, false));
    const sunG = V(A.GeoVector('Sun', t, true));
    const sunLon = eclLon(rEqjEct, sunG);

    const bodies = BODIES.map(b => {
      const g = V(A.GeoVector(b.id, t, true));
      const topo = vsub(g, ov);
      const lonT = eclLon(rEqjEct, g);
      const lonM = eclLon(A.Rotation_EQJ_ECT(tm), V(A.GeoVector(b.id, tm, true)));
      const lonP = eclLon(A.Rotation_EQJ_ECT(tp), V(A.GeoVector(b.id, tp, true)));
      let speed = lonP - lonM; if (speed > 180) speed -= 360; if (speed < -180) speed += 360; // deg/day
      const sid = norm360(lonT - ayan);
      const il = A.Illumination(b.id, t);
      const dist = vlen(topo); // AU
      const angDiamArcsec = 2 * Math.atan(b.radius / (dist * AU_KM)) / DEG * 3600;
      const light = b.id === 'Sun' ? [0, 0, 1] : vnorm(vsub(sunG, g));
      let sep = Math.abs(lonT - sunLon); if (sep > 180) sep = 360 - sep;
      const retro = speed < 0 && b.id !== 'Sun' && b.id !== 'Moon';
      const combustLim = retro && b.combustR ? b.combustR : b.combust;
      // Body orientation (IAU): north pole + prime meridian, so surface maps face the right way
      let pole = radecVec(b.pole[0], b.pole[1]), prime = null;
      try {
        const ax = A.RotationAxis(b.id, t);
        pole = vnorm([ax.north.x, ax.north.y, ax.north.z]);
        const a0 = ax.ra * 15 * DEG, nn = [-Math.sin(a0), Math.cos(a0), 0];
        const pxn = [pole[1] * nn[2] - pole[2] * nn[1], pole[2] * nn[0] - pole[0] * nn[2], pole[0] * nn[1] - pole[1] * nn[0]];
        const W = ax.spin * DEG, cw = Math.cos(W), sw = Math.sin(W);
        prime = vnorm([nn[0] * cw + pxn[0] * sw, nn[1] * cw + pxn[1] * sw, nn[2] * cw + pxn[2] * sw]);
      } catch (e) { }
      if (!prime) { const a = Math.abs(pole[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]; const c = [a[1] * pole[2] - a[2] * pole[1], a[2] * pole[0] - a[0] * pole[2], a[0] * pole[1] - a[1] * pole[0]]; prime = vnorm(c); }
      return {
        id: b.id, graha: b.graha, pole, prime,
        dir: vnorm(topo), dist, angDiamArcsec, light,
        tropical: lonT, sidereal: sid, ...signInfo(sid),
        speed, retro, stationary: b.id !== 'Sun' && b.id !== 'Moon' && Math.abs(speed) < 0.12 * avgSpeed(b.id),
        combust: combustLim ? (b.id !== 'Sun' && sep < combustLim) : (b.id === 'Moon' ? sep < 12 : false),
        sunSep: sep,
        mag: il.mag, phaseFraction: b.id === 'Sun' ? 1 : il.phase_fraction, phaseAngle: il.phase_angle,
        ...horOf(rEqjHor, topo),
      };
    });

    const moon = bodies.find(b => b.id === 'Moon');
    const phase = A.MoonPhase(t);
    const tithiNum = Math.floor(phase / 12) + 1; // 1..30
    const paksha = tithiNum <= 15 ? 'Shukla Paksha' : 'Krishna Paksha';
    const tIdx = (tithiNum - 1) % 15;
    const tithiName = tIdx === 14 ? (tithiNum === 15 ? 'Pournami' : 'Amavasai') : TITHI[tIdx];

    // Rahu & Ketu (mean nodes) on the ecliptic of date
    const rahuT = meanRahu(t);
    const nodes = [['Rahu', rahuT], ['Ketu', norm360(rahuT + 180)]].map(([id, lt]) => {
      const v = rot(rEctEqj, [Math.cos(lt * DEG), Math.sin(lt * DEG), 0]);
      const sid = norm360(lt - ayan);
      return { id, graha: id, dir: v, tropical: lt, sidereal: sid, ...signInfo(sid), retro: true, ...horOf(rEqjHor, v) };
    });

    const ascT = ascendant(rEctEqj, rEqjHor);
    const ascSid = norm360(ascT - ayan);
    const ascDir = rot(rEctEqj, [Math.cos(ascT * DEG), Math.sin(ascT * DEG), 0]);

    return {
      time: t, rEqjHor, rEqjEct, rEctEqj, ayan, bodies, nodes,
      lagna: { tropical: ascT, sidereal: ascSid, dir: ascDir, ...signInfo(ascSid) },
      moonPhase: { angle: phase, name: moonPhaseName(phase), fraction: moon.phaseFraction, tithiNum, tithiName, paksha },
      sun: bodies[0],
    };
  }

  function avgSpeed(id) {
    return { Mercury: 1.38, Venus: 1.2, Mars: 0.52, Jupiter: 0.083, Saturn: 0.034, Uranus: 0.012, Neptune: 0.006 }[id] || 1;
  }

  // Points along the ecliptic of date (EQJ unit vectors), for drawing.
  function eclipticPoint(rEctEqj, lonDeg, latDeg = 0) {
    const l = lonDeg * DEG, b = latDeg * DEG;
    return rot(rEctEqj, [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)]);
  }

  // ---- time zones ----
  function tzOffsetMinutes(tz, utcMs) {
    const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = {}; for (const x of dtf.formatToParts(new Date(utcMs))) p[x.type] = x.value;
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return Math.round((asUTC - Math.floor(utcMs / 1000) * 1000) / 60000 * 100) / 100;
  }
  function localToUtc(y, mo, d, h, mi, s, tz) {
    const guess = Date.UTC(y, mo - 1, d, h, mi, s || 0);
    const off1 = tzOffsetMinutes(tz, guess);
    let utc = guess - off1 * 60000;
    const off2 = tzOffsetMinutes(tz, utc);
    if (off2 !== off1) utc = guess - off2 * 60000;
    return utc;
  }

  const api = { compute, radecVec, eclipticPoint, tzOffsetMinutes, localToUtc, lahiri, RASI, RASI_EN, NAKSHATRA, BODIES, norm360 };
  root.AstroCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
