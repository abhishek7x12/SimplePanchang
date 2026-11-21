/* ============================================================================
   PANCHANG MODULE — sections of this file, in order (search for the heading):
     • Small astronomy toolkit          Meeus low-precision Sun/Moon longitudes, Moon rise/set
     • Time helpers                     fmtTime, local-time conversion
     • Panchang element names (Hindi)   Tithi / Nakshatra / Yoga / Karana / Rashi / Ritu / Ayan / Masa
     • Next-transition finders          findNextChange and its two callers
     • Rahu Kaal / Yamagandam / Gulika, Abhijit, Brahma Muhurt, Bhadra
     • Choghadiya
     • Location handling                PCH state, profile/birth storage, Chandrabal / Tarabal
     • GPS location: due-process flow, geocoding, sun-times fetch
     • VRAT / TYOHAR and PUBLIC HOLIDAYS modules
     • pchRunCalculation                the one render pipeline
     • ELEMENT DETAIL PAGE              tap-for-timeline
     • (outside the IIFE) page switching, profile modal + photo crop, settings, footers
   ============================================================================ */


(function(){

  /* ── Small astronomy toolkit (Meeus low-precision Sun/Moon) ── */
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  function norm360(x) { x = x % 360; return x < 0 ? x + 360 : x; }
  function julianDay(date) {
    // date is a JS Date in UTC
    return date.getTime() / 86400000 + 2440587.5;
  }
  function T_fromJD(jd) { return (jd - 2451545.0) / 36525; }

  // Apparent geocentric ecliptic longitude of the Sun (degrees)
  function sunLongitude(jd) {
    const T = T_fromJD(jd);
    const L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
    const M  = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
    const Mr = M * D2R;
    const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr)
            + (0.019993 - 0.000101 * T) * Math.sin(2 * Mr)
            + 0.000289 * Math.sin(3 * Mr);
    const trueLong = L0 + C;
    const omega = 125.04 - 1934.136 * T;
    // Empirical correction for the terms the low-precision (Meeus ch.25)
    // formula omits — Venus/Mars/Jupiter/Moon perturbations and a small
    // constant bias. Coefficients were least-squares fitted against the Swiss
    // Ephemeris apparent Sun over 1950-2100 (residual: 1.6 min std, 5 min max
    // of Sun motion, vs ~14 min max before). Keeps Sankranti / Rashi-change
    // timings from drifting by several minutes with the season.
    const pA = (153.23 + 22518.7541 * T) * D2R;
    const pB = (216.57 + 45037.5082 * T) * D2R;
    const pC = (312.69 + 32964.3577 * T) * D2R;
    const pD = (350.74 + 445267.1142 * T - 0.00144 * T * T) * D2R;
    const pH = (353.40 + 65928.7155 * T) * D2R;
    const corr = -0.00157
      + 0.00042 * Math.sin(pA) - 0.00128 * Math.cos(pA)
      - 0.00091 * Math.sin(pB) + 0.00123 * Math.cos(pB)
      + 0.00083 * Math.sin(pC) - 0.00178 * Math.cos(pC)
      + 0.00108 * Math.sin(pD) - 0.00143 * Math.cos(pD)
      - 0.00057 * Math.sin(pH) + 0.00050 * Math.cos(pH)
      + 0.00014 * Math.sin(L0 * D2R);
    const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * D2R) + corr;
    return norm360(appLong);
  }

  // Geocentric ecliptic longitude of the Moon (degrees) — reduced Meeus ch.47 series
  function moonLongitude(jd) {
    const T = T_fromJD(jd);
    const Lp = norm360(218.3164477 + 481267.88123421 * T - 0.0015786*T*T + T*T*T/538841);
    const D  = norm360(297.8501921 + 445267.1114034 * T - 0.0018819*T*T + T*T*T/545868);
    const M  = norm360(357.5291092 + 35999.0502909 * T - 0.0001536*T*T + T*T*T/24490000);
    const Mp = norm360(134.9633964 + 477198.8675055 * T - 0.0087414*T*T + T*T*T/69699);
    const F  = norm360(93.2720950 + 483202.0175233 * T - 0.0036539*T*T - T*T*T/3526000);
    const Dr = D*D2R, Mr = M*D2R, Mpr = Mp*D2R, Fr = F*D2R;
    // Main periodic terms for longitude (0.000001deg units), largest ~15 terms
    let dL = 0;
    dL += 6288774 * Math.sin(Mpr);
    dL += 1274027 * Math.sin(2*Dr - Mpr);
    dL += 658314  * Math.sin(2*Dr);
    dL += 213618  * Math.sin(2*Mpr);
    dL += -185116 * Math.sin(Mr);
    dL += -114332 * Math.sin(2*Fr);
    dL += 58793   * Math.sin(2*Dr - 2*Mpr);
    dL += 57066   * Math.sin(2*Dr - Mr - Mpr);
    dL += 53322   * Math.sin(2*Dr + Mpr);
    dL += 45758   * Math.sin(2*Dr - Mr);
    dL += -40923  * Math.sin(Mr - Mpr);
    dL += -34720  * Math.sin(Dr);
    dL += -30383  * Math.sin(Mr + Mpr);
    dL += 15327   * Math.sin(2*Dr - 2*Fr);
    dL += -12528  * Math.sin(Mpr + 2*Fr);
    dL += 10980   * Math.sin(Mpr - 2*Fr);
    dL += 10675   * Math.sin(4*Dr - Mpr);
    dL += 7113    * Math.sin(2*Mr - Mpr);
    dL += -6773   * Math.sin(2*Dr + Mr);
    dL += -6472   * Math.sin(4*Dr - 2*Mpr);
    const longitude = Lp + dL / 1000000;
    return norm360(longitude);
  }

  function sunMoonLongitudes(jd) {
    return { sun: sunLongitude(jd), moon: moonLongitude(jd) };
  }

  /* ── Local mean solar time helpers ── */
  function toDate(jd) { return new Date((jd - 2440587.5) * 86400000); }
  function fmtTime(date, tzOffsetMin) {
    if (!date) return '—';
    const local = new Date(date.getTime() + tzOffsetMin * 60000);
    let h = local.getUTCHours(), m = local.getUTCMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    let h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + ':' + String(m).padStart(2,'0') + ' ' + ampm;
  }
  function addMinutes(date, mins) { return new Date(date.getTime() + mins * 60000); }
  // Converts a timezone-less local ISO string ("YYYY-MM-DDTHH:MM") that
  // represents wall-clock time AT tzOffsetMin (minutes east of UTC) into a
  // Date object holding the correct absolute UTC instant.
  function parseLocalISOToUTCDate(isoStr, tzOffsetMin) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(isoStr);
    if (!m) return null;
    const [, y, mo, d, h, mi] = m.map(Number);
    return new Date(Date.UTC(y, mo - 1, d, h, mi) - tzOffsetMin * 60000);
  }

  /* ── Rise/set search for the Moon (Sun rise/set comes from Open-Meteo) ──
     Standard altitude-crossing search using topocentric-ish geocentric
     approximation (adequate for a best-effort Panchang display). ── */
  function moonEquatorial(jd) {
    const T = T_fromJD(jd);
    const lambda = moonLongitude(jd) * D2R;
    // approximate ecliptic latitude of Moon (short series, few terms)
    const D  = norm360(297.8501921 + 445267.1114034 * T) * D2R;
    const M  = norm360(357.5291092 + 35999.0502909 * T) * D2R;
    const Mp = norm360(134.9633964 + 477198.8675055 * T) * D2R;
    const F  = norm360(93.2720950 + 483202.0175233 * T) * D2R;
    let beta = 5128122 * Math.sin(F) + 280602 * Math.sin(Mp + F) + 277693 * Math.sin(Mp - F)
             + 173237 * Math.sin(2*D - F) + 55413 * Math.sin(2*D - Mp + F) + 45115 * Math.sin(2*D - Mp - F);
    beta = (beta / 1000000) * D2R;
    const eps = (23.4392911 - 0.0130042 * T) * D2R;
    const ra = Math.atan2(Math.sin(lambda)*Math.cos(eps) - Math.tan(beta)*Math.sin(eps), Math.cos(lambda));
    const dec = Math.asin(Math.sin(beta)*Math.cos(eps) + Math.cos(beta)*Math.sin(eps)*Math.sin(lambda));
    return { ra: norm360(ra*R2D), dec: dec*R2D };
  }
  function gmst(jd) {
    const T = T_fromJD(jd);
    let g = 280.46061837 + 360.98564736629*(jd-2451545.0) + 0.000387933*T*T - T*T*T/38710000;
    return norm360(g);
  }
  function moonAltitude(jd, lat, lon) {
    const eq = moonEquatorial(jd);
    const lst = norm360(gmst(jd) + lon);
    let ha = norm360(lst - eq.ra);
    if (ha > 180) ha -= 360;
    const har = ha * D2R, decr = eq.dec * D2R, latr = lat * D2R;
    const alt = Math.asin(Math.sin(latr)*Math.sin(decr) + Math.cos(latr)*Math.cos(decr)*Math.cos(har));
    return alt * R2D;
  }
  // scan in 10-min steps to find rise & set crossings of altitude=0 (with ~0.125deg
  // refraction+radius correction). Window extends up to 48h past local midnight
  // because the Moon rises ~50min later each day, so a rise late in the day
  // often doesn't set until after the next midnight — without the extended
  // window that set would be missed and show as N/A.
  function findMoonRiseSet(jdMidnightUTC, lat, lon) {
    const H0 = 0.125; // approx correction for horizon dip/refraction/semidiameter
    let prevAlt = moonAltitude(jdMidnightUTC, lat, lon) + H0;
    let rise = null, set = null;
    const stepMin = 10;
    const maxMin = 2880; // 48h
    for (let m = stepMin; m <= maxMin; m += stepMin) {
      const jd = jdMidnightUTC + m/1440;
      const alt = moonAltitude(jd, lat, lon) + H0;
      if (prevAlt < 0 && alt >= 0 && !rise) rise = jdMidnightUTC + (m - stepMin/2)/1440;
      if (prevAlt >= 0 && alt < 0 && !set) set = jdMidnightUTC + (m - stepMin/2)/1440;
      prevAlt = alt;
      if (rise && set) break;
    }
    return { riseJD: rise, setJD: set };
  }

  /* ── Panchang element names (Hindi) ── */
  const TITHI_NAMES = ['प्रतिपदा','द्वितीया','तृतीया','चतुर्थी','पंचमी','षष्ठी','सप्तमी','अष्टमी','नवमी','दशमी','एकादशी','द्वादशी','त्रयोदशी','चतुर्दशी','पूर्णिमा','प्रतिपदा','द्वितीया','तृतीया','चतुर्थी','पंचमी','षष्ठी','सप्तमी','अष्टमी','नवमी','दशमी','एकादशी','द्वादशी','त्रयोदशी','चतुर्दशी','अमावस्या'];
  const NAKSHATRA_NAMES = ['अश्विनी','भरणी','कृत्तिका','रोहिणी','मृगशिरा','आर्द्रा','पुनर्वसु','पुष्य','आश्लेषा','मघा','पूर्वा फाल्गुनी','उत्तरा फाल्गुनी','हस्त','चित्रा','स्वाति','विशाखा','अनुराधा','ज्येष्ठा','मूल','पूर्वाषाढ़ा','उत्तराषाढ़ा','श्रवण','धनिष्ठा','शतभिषा','पूर्वाभाद्रपद','उत्तराभाद्रपद','रेवती'];
  const YOGA_NAMES = ['विष्कुम्भ','प्रीति','आयुष्मान','सौभाग्य','शोभन','अतिगण्ड','सुकर्मा','धृति','शूल','गण्ड','वृद्धि','ध्रुव','व्याघात','हर्षण','वज्र','सिद्धि','व्यतीपात','वरीयान','परिघ','शिव','सिद्ध','साध्य','शुभ','शुक्ल','ब्रह्म','ऐन्द्र','वैधृति'];
  const KARANA_NAMES = ['किंस्तुघ्न','बव','बालव','कौलव','तैतिल','गरज','वणिज','विष्टि (भद्रा)','शकुनि','चतुष्पद','नाग'];
  const WEEKDAY_NAMES = ['रविवार','सोमवार','मंगलवार','बुधवार','गुरुवार','शुक्रवार','शनिवार'];
  const RASHI_NAMES = ['मेष','वृषभ','मिथुन','कर्क','सिंह','कन्या','तुला','वृश्चिक','धनु','मकर','कुम्भ','मीन'];
  // Traditional 6 Hindu Vaidik Ritus (seasons), each spanning 60° of the
  // Sun's sidereal (nirayana) longitude starting from Mesha (Aries) 0°.
  const RITU_NAMES = ['वसंत ऋतु','ग्रीष्म ऋतु','वर्षा ऋतु','शरद ऋतु','हेमंत ऋतु','शिशिर ऋतु'];

  // Lahiri (Chitrapaksha) mean ayanamsa, degrees — fitted to the Swiss
  // Ephemeris Lahiri value over 1900-2100 (max error < 0.001 s of arc; the
  // true curve is essentially linear, ~50.27"/yr, with a tiny quadratic term).
  // The previous fit ran ~0.017° low in 2026 (and drifted to ~0.085° by 2100),
  // which made every Sankranti / Rashi change fire ~25-30 min too EARLY.
  // The Sun's apparent longitude below already includes nutation, so the MEAN
  // ayanamsa is the correct one to subtract.
  // The constant term carries a +0.0061° (~9 min of Sun motion) calibration to
  // the published Drik Panchang Sankranti moments (Makar 2025/26/27/28, Kark
  // 2026/27): with it the app agrees with Drik to within ~2 min, including
  // for years that were not used for the calibration.
  function ayanamsa(jd) {
    const x = (jd - 2451545.0) / 365.25 + 100; // years since 1900
    return 22.46661 + 0.01396274 * x + 0.0000000307 * x * x;
  }
  function siderealLongitude(tropicalLong, jd) {
    return norm360(tropicalLong - ayanamsa(jd));
  }
  function getChandraRashi(moonTropicalLong, jd) {
    const sidereal = siderealLongitude(moonTropicalLong, jd);
    return RASHI_NAMES[Math.floor(sidereal / 30)];
  }
  // Drik Ritu (matches drikpanchang.com's "Indian Seasons"): unlike Rashi/
  // Nakshatra, which are sidereal (nirayana), the 6 Ritus are pinned to the
  // Sun's TROPICAL (sayana) longitude — i.e. to the real solstices/equinox,
  // not to the precessing sidereal zodiac. Confirmed against drikpanchang's
  // published cut points: Grishma begins when the Sun enters tropical
  // Vrishabha (~Apr 20), Varsha at the Summer Solstice/tropical Karka
  // (~Jun 21), Sharad at tropical Kanya (~Aug 23), Hemant at tropical
  // Vrishchika (~Oct 23), Shishir at the Winter Solstice/tropical Makara
  // (~Dec 22), and Vasant at tropical Meena (~Feb 19) — i.e. Ritu boundaries
  // sit exactly 30° "behind" the sidereal Rashi boundaries, at Sun tropical
  // longitude 30/90/150/210/270/330. This never drifts with ayanamsa (the
  // sidereal-based scheme did, and the old civil-calendar-month
  // approximation was off by ~3 weeks from the real dates above).
  function drikRituIndexAt(jd) {
    return Math.floor(norm360(sunLongitude(jd) + 30) / 60);
  }
  function getDrikRitu(jd) {
    return RITU_NAMES[drikRituIndexAt(jd)];
  }
  // Ayan (half-year), on the traditional NIRAYANA (sidereal) basis — unlike
  // the Ritus above, Ayan is tied to Sankranti, not to the real solstice:
  // Uttarayan  = Makar Sankranti -> Karka Sankranti (sidereal Sun 270° -> 90°,
  //              starts ~14/15 Jan),
  // Dakshinayan = Karka Sankranti -> Makar Sankranti (sidereal 90° -> 270°,
  //              starts ~16/17 Jul, ends ~14/15 Jan).
  // (The old tropical 90°/270° test ended Dakshinayan on ~22 Dec, which
  // contradicted the Sankranti dates shown elsewhere in the app.)
  function ayanIndexAt(jd) {
    const lon = siderealLongitude(sunLongitude(jd), jd);
    return (lon >= 90 && lon < 270) ? 1 : 0;
  }
  function getAyan(jd) {
    return ayanIndexAt(jd) === 1 ? 'दक्षिणायन' : 'उत्तरायण';
  }

  function getTithi(sun, moon) {
    const diff = norm360(moon - sun);
    const idx = Math.floor(diff / 12);
    const paksha = idx < 15 ? 'शुक्ल पक्ष' : 'कृष्ण पक्ष';
    return { name: TITHI_NAMES[idx], index: idx, paksha: paksha };
  }
  // Nakshatra and Yoga are sidereal (nirayana) divisions — both need the
  // ayanamsa subtracted, unlike Tithi/Karana whose ayanamsa terms cancel
  // out because they're computed from a Moon-minus-Sun difference.
  function getNakshatra(moonTropicalLong, jd) {
    const sidereal = siderealLongitude(moonTropicalLong, jd);
    const idx = Math.floor(sidereal / (360/27));
    return NAKSHATRA_NAMES[idx];
  }
  function getYoga(sunTropicalLong, moonTropicalLong, jd) {
    const siderealSun = siderealLongitude(sunTropicalLong, jd);
    const siderealMoon = siderealLongitude(moonTropicalLong, jd);
    const idx = Math.floor(norm360(siderealSun + siderealMoon) / (360/27));
    return YOGA_NAMES[idx];
  }
  function karanaName(idx) {            // karana-index (0–59) → name
    if (idx === 0) return KARANA_NAMES[0];
    if (idx === 57) return KARANA_NAMES[8];
    if (idx === 58) return KARANA_NAMES[9];
    if (idx === 59) return KARANA_NAMES[10];
    return KARANA_NAMES[1 + ((idx - 1) % 7)];
  }
  function getKarana(sun, moon) { return karanaName(Math.floor(norm360(moon - sun) / 6)); }
  function vikramSamvat(date) {
    const y = date.getFullYear(), m = date.getMonth() + 1;
    return (m >= 4 ? y + 57 : y + 56);
  }
  // Vikram Samvat in force at an instant (JD). The new year starts at Chaitra
  // Shukla Pratipada — the New Moon that opens the Chaitra amanta month (mid
  // March to mid April) — not on 1 April, so the year flips on that exact instant.
  // Amanta month index 0 = Chaitra … 11 = Phalguna. Chaitra..Margashirsha (0-8)
  // always fall after the new year within the same Gregorian year; Paush (9) spans
  // Dec–Jan; Magha/Phalguna (10, 11) fall in Jan–Mar, i.e. before the new year.
  function vikramSamvatAt(jd) {
    const tz = (PCH && PCH.tzOffsetMin) || 330;
    const local = toDate(jd + tz / 1440);
    const y = local.getUTCFullYear(), mo = local.getUTCMonth() + 1;
    const m = amantaMasaIndexFixed(jd);
    return (m <= 8 || (m === 9 && mo >= 6)) ? y + 57 : y + 56;
  }

  const MASA_NAMES = ['चैत्र','वैशाख','ज्येष्ठ','आषाढ़','श्रावण','भाद्रपद','आश्विन','कार्तिक','मार्गशीर्ष','पौष','माघ','फाल्गुन'];
  function getSuryaRashi(sunTropicalLong, jd) {
    const sidereal = siderealLongitude(sunTropicalLong, jd);
    return RASHI_NAMES[Math.floor(sidereal / 30)];
  }
  // Index-at helpers for locating the next Rashi transition (Sankranti for
  // the Sun, ~once a month; Rashi change for the Moon, roughly every 2.25
  // days) via findNextTransitionSlow's coarse-scan-then-bisect approach.
  function suryaRashiIndexAt(jd) {
    return Math.floor(siderealLongitude(sunLongitude(jd), jd) / 30);
  }
  function chandraRashiIndexAt(jd) {
    return Math.floor(siderealLongitude(moonLongitude(jd), jd) / 30);
  }
  // A lunar (Amanta) month's name must stay fixed for its whole span — it
  // is only allowed to change at the Amavasya that starts the next month,
  // never mid-month. So we anchor the masa to the Sun's sidereal rashi AT
  // THE START of the current Amanta month (the most recent New Moon), not
  // to the Sun's live position "right now". Using the live position was a
  // bug: whenever a Sankranti (Sun changing sidereal rashi) fell partway
  // through an ongoing lunar month, the displayed masa would silently jump
  // to the next name mid-month even though no Amavasya/Purnima had passed.
  //
  // findAmantaMasaStartJD scans backward until it finds the tail of the
  // *previous* month (tithi index 29, Krishna Chaturdashi/Amavasya), then
  // reuses findNextTransition to bisect the precise Amavasya-end instant —
  // i.e. the moment the current Amanta month began.
  function findAmantaMasaStartJD(jd) {
    const stepDays = 0.25; // 6-hour steps, back up to 40 days
    // If jd itself falls on tithi index 29 (the Amavasya day), step back
    // 1.5 days first — more than a tithi's max duration (~26h) — so the
    // scan starts strictly *after* exiting that occurrence. Otherwise the
    // very first check would self-match jd's own Amavasya and hand off to
    // findNextTransition, which searches *forward* from there and would
    // return the *upcoming* month-start (hours away) instead of the
    // current month's actual start (~29.5 days earlier) — making the
    // Amavasya day itself look like it already belonged to the next
    // amanta month (e.g. 12 Aug 2026, Shravan/Hariyali Amavasya, was
    // showing as "Bhadrapad" instead of "Shravan").
    //
    // For every other tithi, jd itself is the correct starting point —
    // unconditionally offsetting would skip past any transition that
    // falls between (jd - 1.5) and jd (e.g. jd on tithi 0, the day right
    // after Amavasya, needs that very transition, not one further back).
    let cur = (tithiIndexAt(jd) === 29) ? jd - 1.5 : jd;
    for (let i = 0; i < 160; i++) {
      if (tithiIndexAt(cur) === 29) return findNextTransition(cur, tithiIndexAt);
      cur -= stepDays;
    }
    return jd; // fallback (should not happen — no lunar month exceeds ~30 days)
  }
  // Forward counterpart of findAmantaMasaStartJD: finds the NEXT Amavasya
  // boundary (tithi 29→0 crossing) strictly after afterJD, i.e. the end of
  // the Amanta month that starts at afterJD.
  function findNextAmavasyaJD(afterJD) {
    const stepDays = 0.25;
    let cur = afterJD + 0.01;
    for (let i = 0; i < 160; i++) {
      if (tithiIndexAt(cur) === 29) return findNextTransition(cur, tithiIndexAt);
      cur += stepDays;
    }
    return afterJD; // fallback
  }
  // A month's masa is named after the rashi the Sun ENTERS via Sankranti
  // during that lunar month (not the rashi it was in at the start) — e.g.
  // if the Sun crosses into Karka partway through a lunar month, that whole
  // month is Ashadh, even though it began while the Sun was still in
  // Mithuna. If NO Sankranti falls inside the month (rashi at start ==
  // rashi at end), the month has no solar transit of its own — that makes
  // it Adhik (intercalary) Masa, which by convention borrows the name of
  // the following (regular) month, found by recursing forward.
  function amantaMasaIndexForMonth(startJD, endJD, depth) {
    depth = depth || 0;
    const rStart = Math.floor(siderealLongitude(sunLongitude(startJD), startJD) / 30);
    const rEnd = Math.floor(siderealLongitude(sunLongitude(endJD), endJD) / 30);
    if (rStart !== rEnd || depth > 3) return rEnd;
    const nextEndJD = findNextAmavasyaJD(endJD);
    return amantaMasaIndexForMonth(endJD, nextEndJD, depth + 1);
  }
  // amantaMasaIndexFixed is called for many nearby `jd` values in quick
  // succession — once per day when building the Vrat/Tyohar list (up to
  // ~365 calls per render), and again at every coarse-scan step when
  // findNextTransitionSlow hunts for the next Purnimant Masa boundary.
  // Each *uncached* call independently re-scans up to 40 days backward and
  // forward (findAmantaMasaStartJD / findNextAmavasyaJD) to relocate the
  // current Amanta month — expensive, and almost always redundant, since
  // the Amanta month a given jd falls in changes only once every ~29.5
  // days. Caching the last-resolved [startJD, endJD) window turns the
  // overwhelmingly common case (the next jd asked about is still inside
  // that same window) into an O(1) lookup instead of a fresh ~40-day scan.
  // A handful of recent windows (most-recent-first) rather than just one: anything that looks at
  // neighbouring months — the Masa/Paksha timeline looks back to the previous month and ahead to
  // the next — would otherwise evict and recompute (~2,000 Sun/Moon evaluations each) in a loop.
  const _AMANTA_WINDOW_SLOTS = 6;
  const _amantaMasaWindows = []; // [{ startJD, endJD, idx }, …]
  function amantaMasaIndexFixed(jd) {
    for (let i = 0; i < _amantaMasaWindows.length; i++) {
      const w = _amantaMasaWindows[i];
      if (jd >= w.startJD && jd < w.endJD) {
        if (i > 0) { _amantaMasaWindows.splice(i, 1); _amantaMasaWindows.unshift(w); }
        return w.idx;
      }
    }
    const startJD = findAmantaMasaStartJD(jd);
    const endJD = findNextAmavasyaJD(startJD);
    const idx = amantaMasaIndexForMonth(startJD, endJD);
    _amantaMasaWindows.unshift({ startJD: startJD, endJD: endJD, idx: idx });
    if (_amantaMasaWindows.length > _AMANTA_WINDOW_SLOTS) _amantaMasaWindows.pop();
    return idx;
  }
  // Purnimant masa: the fixed Amanta-month index (see above), shifted
  // forward by one month during Krishna Paksha, since in the Purnimanta
  // scheme the month name carries over from the preceding Purnima until
  // the next one (e.g. Amanta Ashwin Krishna Paksha = Purnimanta Kartik
  // Krishna Paksha, as with Diwali).
  function getPurnimantMasa(jd, tithiIndex) {
    let idx = amantaMasaIndexFixed(jd);
    if (tithiIndex >= 15) idx = (idx + 1) % 12;
    return MASA_NAMES[idx];
  }
  // Disha Shool: the direction one should avoid traveling towards on a given
  // weekday, per traditional Vaidik Panchang convention.
  // रविवार-पश्चिम, सोमवार-पूर्व, मंगलवार-उत्तर, बुधवार-उत्तर,
  // गुरुवार-दक्षिण, शुक्रवार-पश्चिम, शनिवार-पूर्व
  const DISHA_SHOOL_NAMES = ['पश्चिम','पूर्व','उत्तर','उत्तर','दक्षिण','पश्चिम','पूर्व'];
  function getDishaShool(weekdayIdx) {
    return DISHA_SHOOL_NAMES[weekdayIdx];
  }

  /* ── Next-transition finder for Tithi/Nakshatra/Yoga/Karana ──
     Scans forward in 5-min steps (up to ~2 days) for the index (as returned
     by indexFn(jd)) to change, then bisects to refine the crossing time. */
  function findNextChange(jdNow, indexFn, stepDays, maxIter) {
    const startIdx = indexFn(jdNow);
    let jd = jdNow;
    for (let i = 0; i < maxIter; i++) {
      jd += stepDays;
      if (indexFn(jd) !== startIdx) {
        let lo = jd - stepDays, hi = jd;
        for (let b = 0; b < 20; b++) {
          const mid = (lo + hi) / 2;
          if (indexFn(mid) === startIdx) lo = mid; else hi = mid;
        }
        return hi;
      }
    }
    return null;
  }
  function findNextTransition(jdNow, indexFn) { return findNextChange(jdNow, indexFn, 5 / 1440, 600); }
  function tithiIndexAt(jd) {
    const { sun, moon } = sunMoonLongitudes(jd);
    return Math.floor(norm360(moon - sun) / 12);
  }
  function nakshatraIndexAt(jd) {
    const moon = moonLongitude(jd);
    return Math.floor(siderealLongitude(moon, jd) / (360 / 27));
  }
  function yogaIndexAt(jd) {
    const sun = sunLongitude(jd), moon = moonLongitude(jd);
    const s = siderealLongitude(sun, jd), m = siderealLongitude(moon, jd);
    return Math.floor(norm360(s + m) / (360 / 27));
  }
  function karanaIndexAt(jd) {
    const { sun, moon } = sunMoonLongitudes(jd);
    return Math.floor(norm360(moon - sun) / 6);
  }
  function purnimantMasaIndexAt(jd) {
    const { sun, moon } = sunMoonLongitudes(jd);
    const tIdx = Math.floor(norm360(moon - sun) / 12);
    let idx = amantaMasaIndexFixed(jd);
    if (tIdx >= 15) idx = (idx + 1) % 12;
    return idx;
  }
  // Coarser-step counterpart of findNextTransition, for quantities that can
  // stay unchanged for many days (Paksha: up to ~15 days; Purnimant Masa:
  // also changes only at a Paksha boundary, so ~15 days max) — scans in
  // 6-hour steps up to maxDays out, then bisects for a precise crossing.
  function findNextTransitionSlow(jdNow, indexFn, maxDays) {
    return findNextChange(jdNow, indexFn, 0.25, Math.ceil((maxDays || 20) / 0.25));
  }
  // Next Ritu transition: the Sun's tropical longitude next crosses one of
  // the six 30°/90°/150°/210°/270°/330° boundaries (see drikRituIndexAt).
  // Each Ritu spans ~61 days, so 65 is a safe search window.
  function findRituTransitionJD(jdNow) {
    return findNextTransitionSlow(jdNow, drikRituIndexAt, 65);
  }

  /* ── Rahu Kaal / Yamagandam / Gulika Kaal — divide sunrise→sunset into 8 equal parts ── */
  const RAHU_SLOT   = [8,2,7,5,6,4,3]; // Sun..Sat -> slot index (1-8), classic table
  const YAMA_SLOT    = [5,4,3,2,1,7,6];
  const GULIKA_SLOT  = [7,6,5,4,3,2,1];
  function kaalWindow(sunrise, sunset, weekdayIdx, slotTable) {
    const totalMin = (sunset - sunrise) / 60000;
    const part = totalMin / 8;
    const slot = slotTable[weekdayIdx]; // 1-indexed
    const start = addMinutes(sunrise, (slot - 1) * part);
    const end = addMinutes(sunrise, slot * part);
    return { start, end };
  }
  function abhijitWindow(sunrise, sunset) {
    const noon = new Date((sunrise.getTime() + sunset.getTime()) / 2);
    return { start: addMinutes(noon, -24), end: addMinutes(noon, 24) };
  }
  // Brahma Muhurt: the 48-minute window ending 48 minutes before sunrise
  // (i.e. starting 1h36m before sunrise) — the traditional pre-dawn period
  // considered most auspicious for waking, meditation and study.
  function brahmaMuhurtWindow(sunrise) {
    return { start: addMinutes(sunrise, -96), end: addMinutes(sunrise, -48) };
  }
  // Bhadra Kaal: the span(s) of the day governed by the Vishti karana —
  // traditionally considered inauspicious for starting new/auspicious work.
  // Karana index (0-59, per karanaIndexAt) maps to Vishti when it falls on
  // one of the 7 repeating movable karanas at cycle-position 7 (Bava,
  // Balava, Kaulava, Taitila, Garija, Vanija, Vishti), i.e. indices
  // 7,14,21,28,35,42,49,56 — matching the same mapping used by getKarana().
  function isVishtiKaranaIdx(idx) {
    if (idx < 1 || idx > 56) return false; // excludes fixed karanas (0, 57-59)
    return ((idx - 1) % 7) === 6;
  }
  // Scans the local calendar day (00:00–24:00) in 5-min steps for Vishti
  // karana runs, then bisects each run's edges for a precise start/end.
  function findBhadraKaalToday(jdMidnightUTC) {
    const stepMin = 5;
    const runsRaw = [];
    let runStart = null;
    for (let m = 0; m <= 1440; m += stepMin) {
      const jd = jdMidnightUTC + m / 1440;
      const vishti = isVishtiKaranaIdx(karanaIndexAt(jd));
      if (vishti && runStart === null) runStart = jd;
      if (!vishti && runStart !== null) { runsRaw.push([runStart, jd]); runStart = null; }
    }
    if (runStart !== null) runsRaw.push([runStart, jdMidnightUTC + 1]);
    if (!runsRaw.length) return null;
    const refine = (jd, wasVishtiBefore) => {
      let lo = jd - stepMin/1440, hi = jd;
      for (let b = 0; b < 20; b++) {
        const mid = (lo + hi) / 2;
        const v = isVishtiKaranaIdx(karanaIndexAt(mid));
        if (v === wasVishtiBefore) lo = mid; else hi = mid;
      }
      return hi;
    };
    const [rs, re] = runsRaw[0];
    const start = rs === jdMidnightUTC ? rs : refine(rs, false);
    const end = re === jdMidnightUTC + 1 ? re : refine(re, true);
    return { start: toDate(start), end: toDate(end) };
  }

  /* ── Choghadiya ── */
  const CHOGH_DAY_SEQ = {
    0: ['उद्वेग','चर','लाभ','अमृत','काल','शुभ','रोग','उद्वेग'], // Sun
    1: ['अमृत','काल','शुभ','रोग','उद्वेग','चर','लाभ','अमृत'],   // Mon
    2: ['रोग','उद्वेग','चर','लाभ','अमृत','काल','शुभ','रोग'],   // Tue
    3: ['लाभ','अमृत','काल','शुभ','रोग','उद्वेग','चर','लाभ'],   // Wed
    4: ['शुभ','रोग','उद्वेग','चर','लाभ','अमृत','काल','शुभ'],   // Thu
    5: ['चर','लाभ','अमृत','काल','शुभ','रोग','उद्वेग','चर'],    // Fri
    6: ['काल','शुभ','रोग','उद्वेग','चर','लाभ','अमृत','काल']    // Sat
  };
  const CHOGH_NIGHT_SEQ = {
    0: ['शुभ','अमृत','चर','रोग','काल','लाभ','उद्वेग','शुभ'],
    1: ['चर','रोग','काल','लाभ','उद्वेग','शुभ','अमृत','चर'],
    2: ['काल','लाभ','उद्वेग','शुभ','अमृत','चर','रोग','काल'],
    3: ['उद्वेग','शुभ','अमृत','चर','रोग','काल','लाभ','उद्वेग'],
    4: ['अमृत','चर','रोग','काल','लाभ','उद्वेग','शुभ','अमृत'],
    5: ['रोग','काल','लाभ','उद्वेग','शुभ','अमृत','चर','रोग'],
    6: ['लाभ','उद्वेग','शुभ','अमृत','चर','रोग','काल','लाभ']
  };
  const CHOGH_TYPE = { 'अमृत':'good','शुभ':'good','लाभ':'good','चर':'neutral','उद्वेग':'bad','रोग':'bad','काल':'bad' };

  // The Choghadiya in force between local midnight and sunrise belongs to the
  // PREVIOUS day's night (it runs from yesterday's sunset to today's sunrise and
  // follows yesterday's weekday sequence), so a calendar day is really covered
  // by three spans: prevNight (yesterday's sunset -> today's sunrise), day, night.
  function choghSlots(seq, from, to) {
    const part = (to - from) / 8;
    return seq.map((name, i) => ({
      name,
      start: new Date(from.getTime() + i * part),
      end: new Date(from.getTime() + (i + 1) * part)
    }));
  }
  function buildChoghadiya(sunrise, sunset, nextSunrise, weekdayIdx, prevSunset) {
    const prevWeekdayIdx = (weekdayIdx + 6) % 7;
    return {
      prevNightRows: (prevSunset && prevSunset < sunrise) ? choghSlots(CHOGH_NIGHT_SEQ[prevWeekdayIdx], prevSunset, sunrise) : [],
      dayRows: choghSlots(CHOGH_DAY_SEQ[weekdayIdx], sunrise, sunset),
      nightRows: choghSlots(CHOGH_NIGHT_SEQ[weekdayIdx], sunset, nextSunrise)
    };
  }

  /* ── Location handling ── */
  let PCH = { lat: null, lon: null, name: '', state: '', tzOffsetMin: 330, customDateTime: null }; // default IST offset fallback; customDateTime null = live "now"


  /* ── Busy overlay (glass blur + animated icon) ──
     Shown only for user-initiated work: GPS lookup, city search and the
     calculation that follows. Silent 60-second background refreshes never
     show it. Overlay appears instantly, stays at least MIN_MS so a cached
     (instant) calculation doesn't flash, then fades out. */
  const pchBusy = (function () {
    const MIN_MS = 420, FAILSAFE_MS = 30000;
    const STAGES = {
      gps:    { icon: 'gps',    title: 'आपका स्थान पता किया जा रहा है',   sub: 'GPS से लोकेशन ली जा रही है…' },
      search: { icon: 'search', title: 'स्थान खोजा जा रहा है',            sub: 'कृपया प्रतीक्षा करें…' },
      sun:    { icon: 'sun',    title: 'पंचांग तैयार हो रहा है',           sub: 'सूर्योदय / सूर्यास्त का समय लिया जा रहा है…' },
      calc:   { icon: 'moon',   title: 'पंचांग की गणना हो रही है',         sub: 'तिथि, नक्षत्र, योग व करण निकाले जा रहे हैं…' }
    };
    const ICONS = {
      gps: '<svg viewBox="0 0 64 64" class="pchb-svg"><circle class="pchb-ring r1" cx="32" cy="34" r="8"/><circle class="pchb-ring r2" cx="32" cy="34" r="8"/><g class="pchb-pin"><path d="M32 8c-8.8 0-16 6.9-16 15.5C16 35 32 54 32 54s16-19 16-30.5C48 14.9 40.8 8 32 8z"/><circle cx="32" cy="23.5" r="6" class="pchb-hole"/></g></svg>',
      search: '<svg viewBox="0 0 64 64" class="pchb-svg"><g class="pchb-lens"><circle cx="28" cy="28" r="14" class="pchb-lens-ring"/><path d="M38.5 38.5L53 53" class="pchb-handle"/></g></svg>',
      sun: '<svg viewBox="0 0 64 64" class="pchb-svg"><g class="pchb-rays">' +
           [0,45,90,135,180,225,270,315].map(function (a) { return '<path d="M32 6v8" transform="rotate(' + a + ' 32 32)"/>'; }).join('') +
           '</g><circle cx="32" cy="32" r="11" class="pchb-sun"/></svg>',
      moon: '<svg viewBox="0 0 64 64" class="pchb-svg"><circle cx="32" cy="32" r="22" class="pchb-orbit"/><g class="pchb-spin"><circle cx="32" cy="10" r="5" class="pchb-dot"/></g><path class="pchb-moon" d="M36 16a16 16 0 1 0 12 26A13 13 0 0 1 36 16z"/></svg>'
    };
    let el = null, shownAt = 0, active = false, stage = '', hideTimer = null, failsafe = null;

    function build() {
      if (el) return el;
      el = document.createElement('div');
      el.id = 'pch-busy';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.innerHTML = '<div class="pchb-card"><div class="pchb-icon"></div>' +
        '<div class="pchb-title"></div><div class="pchb-sub"></div>' +
        '<div class="pchb-bar"><i></i></div></div>';
      document.body.appendChild(el);
      return el;
    }
    function paint(name, titleOverride) {
      const st = STAGES[name]; if (!st) return;
      build();
      if (stage !== name) {
        stage = name;
        el.querySelector('.pchb-icon').innerHTML = ICONS[st.icon];
      }
      el.querySelector('.pchb-title').textContent = titleOverride || st.title;
      el.querySelector('.pchb-sub').textContent = st.sub;
    }
    return {
      isActive: function () { return active; },
      show: function (name, titleOverride) {
        build();
        clearTimeout(hideTimer);
        paint(name, titleOverride);
        if (!active) { active = true; shownAt = Date.now(); el.classList.remove('out'); void el.offsetWidth; el.classList.add('on'); }
        clearTimeout(failsafe);
        failsafe = setTimeout(function () { pchBusy.hide(true); }, FAILSAFE_MS);
      },
      set: function (name) { if (active) paint(name); },
      hide: function (now) {
        if (!active) return;
        clearTimeout(failsafe);
        const wait = now ? 0 : Math.max(0, MIN_MS - (Date.now() - shownAt));
        clearTimeout(hideTimer);
        hideTimer = setTimeout(function () {
          active = false;
          el.classList.remove('on'); el.classList.add('out');
        }, wait);
      }
    };
  })();
  let pchLastChogh = null; // { prevNightRows, dayRows, nightRows } from the most recent calculation

  // Home card: the Choghadiya running right now plus the next three.
  // Day and night slots are chained (day 1-8, then night 1-8) so the window
  // rolls over from day into night naturally.
  function pchChoghRowHTML(r, tz, isNow) {
    return '<div class="pch-chogh-row"><span class="pch-chogh-name ' + (CHOGH_TYPE[r.name]||'neutral') + '">' + r.name + '</span><span class="pch-chogh-time">' + (isNow ? '<span class="pch-chogh-nowtag">अभी</span>' : '') + fmtTime(r.start, tz) + ' – ' + fmtTime(r.end, tz) + '</span></div>';
  }
  function pchChoghNowIndex(all) {
    const now = PCH.customDateTime ? new Date(PCH.customDateTime) : new Date();
    for (let i = 0; i < all.length; i++) {
      if (now >= all[i].start && now < all[i].end) return i;
    }
    return -1; // outside every known slot (e.g. yesterday's sunset could not be resolved)
  }
  // Chronological chain: previous night (midnight -> sunrise part), day, night.
  function pchChoghAll() {
    return pchLastChogh.prevNightRows.concat(pchLastChogh.dayRows, pchLastChogh.nightRows);
  }
  function pchRenderChoghadiya() {
    if (!pchLastChogh) return;
    const tz = PCH.tzOffsetMin || 330;
    const all = pchChoghAll();
    const cur = pchChoghNowIndex(all);
    // no running slot found: start the list from today's first day slot
    const from = cur < 0 ? pchLastChogh.prevNightRows.length : cur;
    const html = all.slice(from, from + 4).map((r, k) => pchChoghRowHTML(r, tz, cur >= 0 && k === 0)).join('');
    document.getElementById('pch-choghadiya-list').innerHTML = html;
    document.getElementById('pch-chogh-title').textContent = 'चौघड़िया';
  }
  function pchRenderChoghadiyaFull() {
    if (!pchLastChogh) return;
    const tz = PCH.tzOffsetMin || 330;
    const all = pchChoghAll();
    const cur = pchChoghNowIndex(all);
    const nowRow = cur >= 0 ? all[cur] : null;
    const prevEl = document.getElementById('chogh-full-prev');
    const prevSec = document.getElementById('chogh-full-prev-section');
    const dayEl = document.getElementById('chogh-full-day');
    const nightEl = document.getElementById('chogh-full-night');
    // Previous night's slots are only shown while the selected time is still
    // before today's sunrise; after that they are history and just add clutter.
    const beforeSunrise = !!nowRow && pchLastChogh.prevNightRows.indexOf(nowRow) !== -1;
    if (prevSec) prevSec.style.display = beforeSunrise ? '' : 'none';
    if (prevEl) prevEl.innerHTML = beforeSunrise ? pchLastChogh.prevNightRows.map(r => pchChoghRowHTML(r, tz, r === nowRow)).join('') : '';
    if (dayEl) dayEl.innerHTML = pchLastChogh.dayRows.map(r => pchChoghRowHTML(r, tz, r === nowRow)).join('');
    if (nightEl) nightEl.innerHTML = pchLastChogh.nightRows.map(r => pchChoghRowHTML(r, tz, r === nowRow)).join('');
  }
  // ── Muhurt: auspicious dates of the month for particular works ──
  // Keyed by 'YYYY-MM'. To add a month, add another key. A work with no date that month can be left out, or given days: [] and a note.
  const PCH_MUHURT_DATES = {
    '2026-11': [
      { label: 'शुभ विवाह मुहूर्तः',          days: [21, 22, 24, 25, 26, 30] },
      { label: 'नींव (गृहारंभ) मुहूर्तः',  days: [1, 2, 4, 11, 12, 14, 20, 21, 25, 26, 28, 29, 30] },
      { label: 'जीर्णोद्धार गृह प्रवेश मुहूर्तः',     days: [4, 6, 7, 11, 12, 14, 20, 21, 25, 26, 28] },
      { label: 'देव प्रतिष्ठा मुहूर्तः',        days: [1, 11, 14, 15, 20, 25, 26, 28, 29] },
      { label: 'व्यापार प्रारंभ मुहूर्तः',      days: [1, 4, 6, 7, 11, 15, 20, 21, 25, 26, 28, 29] },
      { label: 'प्रसूति स्नान मुहूर्तः',        days: [12, 19, 26] }
    ],
    '2026-12': [
      { label: 'शुभ विवाह मुहूर्तः',          days: [2, 3, 4, 5, 11, 12] },
      { label: 'नींव (गृहारंभ) मुहूर्तः',  days: [2, 3, 4, 5, 10, 11, 14] },
      { label: 'जीर्णोद्धार गृह प्रवेश मुहूर्तः',     days: [2, 3, 4, 5, 10, 11, 12, 14] },
      { label: 'देव प्रतिष्ठा मुहूर्तः',        days: [2, 3, 11, 12, 13, 14] },
      { label: 'व्यापार प्रारंभ मुहूर्तः',      days: [2, 3, 4, 5, 11, 12] },
      { label: 'प्रसूति स्नान मुहूर्तः',        days: [3, 6, 20, 22] }
    ],
    '2027-01': [
      { label: 'शुभ विवाह मुहूर्तः', days: [15, 20, 24, 30, 31] },
      { label: 'नींव (गृहारंभ) मुहूर्तः', days: [28, 29] },
      { label: 'जीर्णोद्धार गृह प्रवेश मुहूर्तः', days: [15, 20, 22, 27, 28] },
      { label: 'देव प्रतिष्ठा मुहूर्तः', days: [15, 20, 28, 29] },
      { label: 'व्यापार प्रारंभ मुहूर्तः', days: [16, 20, 22, 27, 28, 29] }
    ],
    '2027-02': [
      { label: 'शुभ विवाह मुहूर्तः', days: [10, 11, 21, 22, 25] },
      { label: 'नींव (गृहारंभ) मुहूर्तः', days: [8, 18, 19, 22, 25] },
      { label: 'जीर्णोद्धार गृह प्रवेश मुहूर्तः', days: [8, 10, 11, 15, 18, 22, 24, 25, 27] },
      { label: 'देव प्रतिष्ठा मुहूर्तः', days: [11, 15, 18, 19, 22, 25] },
      { label: 'व्यापार प्रारंभ मुहूर्तः', days: [8, 11, 12, 18, 19, 22, 25, 26] }
    ],
    '2027-03': [
      { label: 'शुभ विवाह मुहूर्तः', days: [1, 2, 3, 4, 9, 10, 14] },
      { label: 'नींव (गृहारंभ) मुहूर्तः', days: [10, 11] },
      { label: 'जीर्णोद्धार गृह प्रवेश मुहूर्तः', days: [10, 11, 15] },
      { label: 'देव प्रतिष्ठा मुहूर्तः', days: [10, 11, 14] },
      { label: 'व्यापार प्रारंभ मुहूर्तः', days: [4, 5, 6, 10, 11, 14] }
    ],
    '2027-04': [
      { label: 'शुभ विवाह मुहूर्तः', days: [18, 21, 23, 25, 26, 28] },
      { label: 'नींव (गृहारंभ) मुहूर्तः', days: [19, 23, 28] },
      { label: 'जीर्णोद्धार गृह प्रवेश मुहूर्तः', days: [19] },
      { label: 'देव प्रतिष्ठा मुहूर्तः', days: [18, 19, 23, 28] },
      { label: 'व्यापार प्रारंभ मुहूर्तः', days: [18, 23, 28, 29] }
    ],
    '2027-05': [
      { label: 'शुभ विवाह मुहूर्तः', days: [7, 8, 9, 15, 20, 21, 22, 23, 24, 30] },
      { label: 'नींव (गृहारंभ) मुहूर्तः', days: [12, 17, 21, 26] },
      { label: 'जीर्णोद्धार गृह प्रवेश मुहूर्तः', days: [12, 17] },
      { label: 'देव प्रतिष्ठा मुहूर्तः', days: [12, 17, 21, 26, 30] },
      { label: 'व्यापार प्रारंभ मुहूर्तः', days: [3, 8, 9, 12, 17, 26, 28, 31] }
    ],
    '2027-06': [
      { label: 'शुभ विवाह मुहूर्तः', days: [1, 4, 5, 10, 13, 16, 19, 20, 21, 26] },
      { label: 'नींव (गृहारंभ) मुहूर्तः', days: [14, 16, 21] },
      { label: 'जीर्णोद्धार गृह प्रवेश मुहूर्तः', days: [14] },
      { label: 'देव प्रतिष्ठा मुहूर्तः', days: [10, 14, 16, 21] },
      { label: 'व्यापार प्रारंभ मुहूर्तः', days: [2, 7, 13, 14, 21, 24, 25, 27] }
    ],
    '2027-07': [
      { label: 'शुभ विवाह मुहूर्तः', days: [7, 9, 12, 14, 15, 16] },
      { label: 'जीर्णोद्धार गृह प्रवेश मुहूर्तः', days: [5] },
      { label: 'व्यापार प्रारंभ मुहूर्तः', days: [2, 5, 9, 11, 14, 21, 24, 26, 30] }
    ],
    '2027-08': [
      { label: 'शुभ विवाह मुहूर्तः', days: [], note: 'कोई मुहूर्त नहीं (चातुर्मास)' },
      { label: 'जीर्णोद्धार गृह प्रवेश मुहूर्तः', days: [], note: 'कोई मुहूर्त नहीं (चातुर्मास)' },
      { label: 'व्यापार प्रारंभ मुहूर्तः', days: [6, 8, 11, 15, 22, 27, 29] }
    ],
    '2027-09': [
      { label: 'शुभ विवाह मुहूर्तः', days: [], note: 'कोई मुहूर्त नहीं (चातुर्मास)' },
      { label: 'जीर्णोद्धार गृह प्रवेश मुहूर्तः', days: [], note: 'कोई मुहूर्त नहीं (चातुर्मास)' },
      { label: 'व्यापार प्रारंभ मुहूर्तः', days: [2, 3, 5, 11, 13] }
    ],
    '2027-10': [
      { label: 'शुभ विवाह मुहूर्तः', days: [], note: 'कोई मुहूर्त नहीं (चातुर्मास)' },
      { label: 'जीर्णोद्धार गृह प्रवेश मुहूर्तः', days: [], note: 'कोई मुहूर्त नहीं (चातुर्मास)' },
      { label: 'व्यापार प्रारंभ मुहूर्तः', days: [1, 2, 4, 8, 10, 15, 20, 22, 27] }
    ],
    '2027-11': [
      { label: 'शुभ विवाह मुहूर्तः', days: [11, 15, 22, 23, 24, 28, 29, 30] },
      { label: 'नींव (गृहारंभ) मुहूर्तः', days: [10, 11, 12, 24] },
      { label: 'जीर्णोद्धार गृह प्रवेश मुहूर्तः', days: [10, 11, 12] },
      { label: 'व्यापार प्रारंभ मुहूर्तः', days: [1, 5, 8, 10, 12, 18, 24, 26] }
    ],
    '2027-12': [
      { label: 'शुभ विवाह मुहूर्तः', days: [2, 8, 9, 13] },
      { label: 'नींव (गृहारंभ) मुहूर्तः', days: [2, 3, 9] },
      { label: 'जीर्णोद्धार गृह प्रवेश मुहूर्तः', days: [2, 3, 9] },
      { label: 'व्यापार प्रारंभ मुहूर्तः', days: [3, 4, 5, 8, 10] }
    ]
  };
  const PCH_MUHURT_MONTHS_HI = ['जनवरी','फ़रवरी','मार्च','अप्रैल','मई','जून','जुलाई','अगस्त','सितंबर','अक्टूबर','नवंबर','दिसंबर'];
  let pchMuhurtDatesKey = '';
  let pchMuhurtSelYmd = '';   // selected local date 'YYYY-MM-DD' (its day gets the blue square)
  let pchMuhurtViewYm = '';   // month currently shown 'YYYY-MM' (user can move it with the ‹ › buttons)
  function pchMuhurtShiftYm(ym, dir) {
    let y = parseInt(ym.slice(0, 4), 10), m = parseInt(ym.slice(5, 7), 10) + dir;
    if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
    return y + '-' + (m < 10 ? '0' : '') + m;
  }
  function pchMuhurtDraw() {
    const listEl = document.getElementById('pch-muhurt-dates-list');
    if (!listEl) return;
    const ym = pchMuhurtViewYm;
    const rows = PCH_MUHURT_DATES[ym];
    const day = (pchMuhurtSelYmd.slice(0, 7) === ym) ? parseInt(pchMuhurtSelYmd.slice(8, 10), 10) : 0;
    const mi = parseInt(ym.slice(5, 7), 10) - 1;
    document.getElementById('pch-muhurt-dates-month').textContent = PCH_MUHURT_MONTHS_HI[mi] + ' ' + ym.slice(0, 4);
    const prevB = document.getElementById('pch-muhurt-prev'), nextB = document.getElementById('pch-muhurt-next');
    if (prevB) prevB.disabled = !PCH_MUHURT_DATES[pchMuhurtShiftYm(ym, -1)];
    if (nextB) nextB.disabled = !PCH_MUHURT_DATES[pchMuhurtShiftYm(ym, 1)];
    listEl.innerHTML = rows.map(function (r) {
      return '<div class="pch-mdate-row"><span class="pch-mdate-label">' + r.label + '</span> ' +
        '<span class="pch-mdate-days">' +
        (r.days.length
          ? r.days.map(function (d) { return '<span class="pch-mdate-day' + (d === day ? ' is-today' : '') + '">' + d + '</span>'; }).join(', ')
          : (r.note || '')) +
        '</span></div>';
    }).join('');
  }
  window.pchMuhurtNav = function (dir) {
    const next = pchMuhurtShiftYm(pchMuhurtViewYm, dir);
    if (!PCH_MUHURT_DATES[next]) return;
    pchMuhurtViewYm = next;
    pchMuhurtDraw();
  };
  // ymd = 'YYYY-MM-DD' of the selected local date; its month is shown first and the selected day is highlighted.
  function pchRenderMuhurtDates(ymd) {
    if (ymd === pchMuhurtDatesKey) return;
    const sec = document.getElementById('pch-muhurt-dates-section');
    const listEl = document.getElementById('pch-muhurt-dates-list');
    if (!sec || !listEl) return;
    pchMuhurtDatesKey = ymd;
    pchMuhurtSelYmd = ymd;
    const ym = ymd.slice(0, 7);
    if (!PCH_MUHURT_DATES[ym]) { sec.style.display = 'none'; return; }
    pchMuhurtViewYm = ym;   // selecting another date always brings back that date's month
    pchMuhurtDraw();
    sec.style.display = '';
  }
  window.showChoghadiyaFull = function showChoghadiyaFull() {
    pchRenderChoghadiyaFull();
    showSecondaryPage('page-choghadiya');
  };

  // ── चंद्रबल / ताराबल ──
  // Both need the person's own Janma Rashi (Moon sign) / Janma Nakshatra.
  // Rather than ask for those directly, we ask for birth date + time (which
  // people actually know) and derive Rashi/Nakshatra the same way "today's"
  // values are derived — via the Moon's sidereal longitude at that instant.
  // Birth details are stored only in localStorage (no user account).
  const CHANDRABALAM_GOOD_HOUSES = [1,3,6,7,10,11]; // house-from-janma-rashi considered auspicious
  const TARA_NAMES = ['जन्म','संपत','विपत','क्षेम','प्रत्यक्','साधक','वध (नैधन)','मित्र','परम मित्र'];
  const TARA_GOOD  = [false, true, false, true, false, true, false, true, true];
  function balamHouse(rashiIdx, birthRashiIdx) { return ((rashiIdx - birthRashiIdx + 12) % 12) + 1; }
  function isGoodHouse(house) { return CHANDRABALAM_GOOD_HOUSES.indexOf(house) !== -1; }
  function taraIndex(nakIdx, birthNakIdx) { return (nakIdx - birthNakIdx + 27) % 9; }   // 27 is a multiple of 9

  function pchBirthStorageKey() {
    return 'pch_birth_panchang-user';
  }
  function pchProfileStorageKey() {
    return 'pch_profile_panchang-user';
  }

  // Older profiles stored one fullName; split it at the last space (first name, last name).
  function pchSplitName(full) {
    full = String(full || '').trim();
    const i = full.lastIndexOf(' ');
    return i === -1 ? { firstName: full, lastName: '' } : { firstName: full.slice(0, i).trim(), lastName: full.slice(i + 1).trim() };
  }

  // Unified local-only profile (name, photo, birth). Migrates legacy birth key.
  function pchGetProfile() {
    try {
      const raw = localStorage.getItem(pchProfileStorageKey());
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p === 'object') {
          const legacyName = (p.firstName == null && p.lastName == null) ? pchSplitName(p.fullName) : null;
          return {
            firstName: legacyName ? legacyName.firstName : (p.firstName || ''),
            lastName: legacyName ? legacyName.lastName : (p.lastName || ''),
            photo: p.photo || '',
            birthDate: p.birthDate || '',
            birthTime: p.birthTime || '12:00'
          };
        }
      }
    } catch (e) { /* ignore */ }
    // Migrate from legacy birth-only key
    try {
      const legacy = localStorage.getItem(pchBirthStorageKey());
      if (legacy) {
        const saved = JSON.parse(legacy);
        if (saved && saved.birthDate) {
          return {
            firstName: '',
            lastName: '',
            photo: '',
            birthDate: saved.birthDate,
            birthTime: saved.birthTime || '12:00'
          };
        }
      }
    } catch (e) { /* ignore */ }
    return { firstName: '', lastName: '', photo: '', birthDate: '', birthTime: '12:00' };
  }

  function pchSaveProfile(profile) {
    try {
      const prev = pchGetProfile();
      const next = {
        firstName: profile.firstName != null ? profile.firstName : prev.firstName,
        lastName: profile.lastName != null ? profile.lastName : prev.lastName,
        photo: profile.photo != null ? profile.photo : prev.photo,
        birthDate: profile.birthDate != null ? profile.birthDate : prev.birthDate,
        birthTime: profile.birthTime != null ? profile.birthTime : prev.birthTime
      };
      localStorage.setItem(pchProfileStorageKey(), JSON.stringify(next));
      // Keep legacy birth key in sync for any older code paths
      if (next.birthDate) {
        localStorage.setItem(pchBirthStorageKey(), JSON.stringify({
          birthDate: next.birthDate,
          birthTime: next.birthTime || '12:00'
        }));
      }
      return next;
    } catch (e) { /* storage unavailable */ return null; }
  }

  // Reads birth details from unified profile (localStorage only).
  function pchGetBirthDetails() {
    const p = pchGetProfile();
    if (p && p.birthDate) {
      return { birthDate: p.birthDate, birthTime: p.birthTime || '12:00' };
    }
    return null;
  }

  window.pchGetProfile = pchGetProfile;
  window.pchSaveProfile = pchSaveProfile;

  // Derives { rashiIdx, nakshatraIdx } (0-based) from a birth date/time
  // string pair, assuming Indian Standard Time (the vast majority of
  // members' birth records will be IST; this matches the tzOffsetMin
  // fallback used throughout the rest of the Panchang).
  // Returns { rashiIdx, nakshatraIdx }, or null when the saved birth details are
  // unusable (corrupt storage, hand-edited profile…) so callers can ask again
  // instead of rendering NaN-derived garbage.
  function pchBirthIndices(birthDate, birthTime) {
    const [y, mo, d] = String(birthDate).split('-').map(Number);
    const [hh, mm] = String(birthTime || '12:00').split(':').map(Number);
    if (![y, mo, d, hh, mm].every(Number.isFinite)) return null;
    const istMinutes = hh * 60 + mm;
    const utcDate = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0) + (istMinutes - 330) * 60000);
    const jdBirth = julianDay(utcDate);
    const rashiIdx = chandraRashiIndexAt(jdBirth);
    const nakshatraIdx = nakshatraIndexAt(jdBirth);
    if (!Number.isInteger(rashiIdx) || !Number.isInteger(nakshatraIdx)) return null;
    return { rashiIdx: rashiIdx, nakshatraIdx: nakshatraIdx };
  }

  function pchRenderBalam(chandraRashiIdx, currentNakshatraIdx) {
    const chandEl = document.getElementById('pch-chandrabalam');
    const taraEl = document.getElementById('pch-tarabalam');
    if (!chandEl || !taraEl) return;

    const birth = pchGetBirthDetails();
    const idx = birth ? pchBirthIndices(birth.birthDate, birth.birthTime) : null;
    if (!idx) {   // nothing saved, or what is saved can't be used → ask (again)
      const prompt = '<a href="javascript:void(0)" onclick="openProfileModal()" style="color:var(--gold,#B8860B); text-decoration:underline;">जन्म विवरण दर्ज करें</a>';
      chandEl.innerHTML = prompt;
      taraEl.innerHTML = prompt;
      return;
    }

    const house = balamHouse(chandraRashiIdx, idx.rashiIdx);
    const chandGood = isGoodHouse(house);
    chandEl.innerHTML = '<span style="color:' + (chandGood ? '#1E7A4A' : '#B23A2E') + ';">' +
      (chandGood ? 'शुभ' : 'अशुभ') + '</span> (' + house + 'वां भाव)';

    const taraIdx = taraIndex(currentNakshatraIdx, idx.nakshatraIdx);
    const taraGood = TARA_GOOD[taraIdx];
    taraEl.innerHTML = TARA_NAMES[taraIdx] + ' <span style="color:' + (taraGood ? '#1E7A4A' : '#B23A2E') + ';">(' +
      (taraGood ? 'शुभ' : 'अशुभ') + ')</span>';
  }

  let pchRefreshTimer = null;
  let pchPageObserver = null;
  let pchWasVisible = false;

  function pchIsPageVisible() {
    const el = document.getElementById('page-panchang');
    if (!el) return false;
    if (el.style.display === 'none') return false;
    const cs = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (cs && cs.display === 'none') return false;
    return true;
  }

  function pchStopTimers() {
    if (pchRefreshTimer) { clearTimeout(pchRefreshTimer); pchRefreshTimer = null; }
  }

  function pchStartTimers() {
    pchStopTimers();
    // Full recompute (Tithi/Nakshatra/Yoga/Karana/Choghadiya etc.) exactly
    // when the current minute changes — skipped while a custom timestamp
    // override is active, since the result for a fixed instant doesn't
    // change. Scheduled with a one-off timeout to the next minute boundary,
    // then re-armed after each recompute, so it stays aligned indefinitely.
    function scheduleNextMinuteTick() {
      const now = new Date();
      const msToNextMinute = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
      pchRefreshTimer = setTimeout(() => {
        if (!pchIsPageVisible()) { pchStopTimers(); return; }
        if (PCH.lat !== null && !PCH.customDateTime) pchRunCalculation();
        scheduleNextMinuteTick();
      }, msToNextMinute);
    }
    scheduleNextMinuteTick();
  }

  // Any code path that makes #page-panchang visible (button click, back
  // navigation, deep link, etc.) is caught here and forces a fresh
  // recalculation — this does not depend on showPanchang() being the only
  // entry point.
  function pchInitVisibilityWatch() {
    const el = document.getElementById('page-panchang');
    if (!el || pchPageObserver) return;
    pchPageObserver = new MutationObserver(() => {
      const visibleNow = pchIsPageVisible();
      if (visibleNow && !pchWasVisible) {
        if (PCH.lat !== null) pchRunCalculation();
        pchStartTimers();
      } else if (!visibleNow && pchWasVisible) {
        pchStopTimers();
      }
      pchWasVisible = visibleNow;
    });
    pchPageObserver.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
    // Also recompute whenever the browser tab/app regains focus or visibility
    // while the Panchang page happens to be open.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && pchIsPageVisible() && PCH.lat !== null) pchRunCalculation();
    });
    window.addEventListener('focus', () => {
      if (pchIsPageVisible() && PCH.lat !== null) pchRunCalculation();
    });
  }

  // Re-run the calculation if a location is already chosen. Exposed because the
  // profile code below lives outside this closure and cannot see PCH.
  window.pchRecalcIfReady = function() {
    if (PCH.lat !== null) pchRunCalculation();
  };

  window.showPanchang = function() {
    showSecondaryPage('page-panchang');
    pchInitVisibilityWatch();
    if (PCH.lat === null) {
      document.getElementById('pch-content').style.display = 'none';
      pchHideLocationSection();
      pchAutoFetchGPS();
    } else {
      pchRunCalculation();
    }
    pchWasVisible = true;
    pchStartTimers();
  };

  // Hides the location section and, if it was open as the popup, closes the popup and unlocks page scrolling.
  function pchHideLocationSection() {
    const sec = document.getElementById('pch-location-section');
    if (sec) { sec.style.display = 'none'; sec.classList.remove('is-popup'); }
    document.body.style.overflow = '';
    lmReset();
  }
  // Cancel: outside tap, × or Esc. Whatever was picked in the popup is discarded.
  window.pchCloseLocationPopup = function () {
    pchHideLocationSection();
    pchSetStatus('');
  };
  function pchShowLocationBar() {
    const bar = document.getElementById('pch-badle-bar');
    if (bar) bar.style.display = 'flex';
    // A silent background refresh (every minute) must not close the picker while someone is
    // choosing in it; the popup closes only through OK / cancel. The first-open inline
    // variant still hides as soon as a calculation starts.
    const sec = document.getElementById('pch-location-section');
    if (!(sec && sec.classList.contains('is-popup'))) pchHideLocationSection();
    pchShowGpsLoading(false);
  }

  // "अभी (Live)" — clear any custom override and go back to live time.
  window.pchResetToLiveDateTime = function() {
    PCH.customDateTime = null;
    if (PCH.lat !== null) { pchBusy.show('calc'); pchRunCalculation(); }
  };

  // Opens the location · date · time picker as a popup over the panchang (like the profile popup).
  // The panchang stays visible behind it. Nothing is applied until OK; outside tap / × / Esc cancels.
  window.pchOpenLocationSelector = function() {
    const sec = document.getElementById('pch-location-section');
    if (sec) sec.classList.add('is-popup');
    document.body.style.overflow = 'hidden';
    pchRevealLocationSection();
    pchSetStatus('');
    const sheet = sec && sec.querySelector('.pch-loc-sheet');
    if (sheet) sheet.scrollTop = 0;
  };

  function pchSetStatus(msg, isError) {
    const el = document.getElementById('pch-location-status');
    el.textContent = msg;
    el.style.color = isError ? '#B23A2E' : 'var(--ink-soft)';
  }

  function pchShowGpsLoading(show) {
    const el = document.getElementById('pch-gps-loading');
    if (el) el.style.display = show ? 'flex' : 'none';
  }

  function pchRevealLocationSection() {
    const sec = document.getElementById('pch-location-section');
    if (sec) sec.style.display = '';
    lmInit();
  }

  // ── GPS location: due-process flow ──
  // 1. Secure-context check (geolocation is blocked entirely on non-HTTPS
  //    pages, regardless of permission state).
  // 2. Where supported, check navigator.permissions first so we can show
  //    the *right* message (e.g. "enable permission" vs "enable device
  //    GPS") instead of one generic failure message.
  // 3. On any failure, the location-selector section (hidden by default)
  //    is revealed so the user can retry GPS or enter a city manually.

  function pchGpsFallbackHint() {
    return PCH.lat === null ? '' : ' कृपया नीचे शहर मैन्युअल रूप से लिखें।';   // no manual entry on the initial GPS gate
  }

  const PCH_GPS_GATE_DENIED_MSG = 'GPS location की अनुमति अवरुद्ध है। कृपया मोबाइल/ब्राउज़र की सेटिंग्स में जाकर इस ऐप की Location को अनुमति दें, फिर वापस आकर “दोबारा कोशिश करें” दबाएँ, या नीचे से जयपुर, राजस्थान का पंचांग देखें।';
  const PCH_GPS_DENIED_MSG_POPUP = 'GPS location की अनुमति अवरुद्ध है। कृपया अनुमति देने के लिए मोबाइल की सेटिंग्स में जाएं और एप्लिकेशन की GPS location को अनुमति दें। अथवा नीचे शहर मैन्युअल रूप से लिखें।';

  function pchFailGps(msg, wasAuto) {
    pchBusy.hide(true);
    if (wasAuto) pchShowGpsLoading(false);
    // Initial open, no location yet -> GPS gate (no manual entry). Once a Panchang exists the gate is never used.
    if (PCH.lat === null) { pchShowGpsGate(msg); return; }
    pchRevealLocationSection();
    pchSetStatus(msg, true);
  }

  /* ── GPS permission modal (full-screen; only on app open, until a location exists) ──
     Flow: consent checkbox -> GPS, or "continue with Jaipur, Rajasthan" as the fallback. */
  let pchGateBound = false, pchGateTried = false;
  function pchShowGpsGate(msg) {
    const g = document.getElementById('pch-gps-gate'); if (!g) return;
    g.hidden = false;
    document.body.style.overflow = 'hidden';
    document.getElementById('gps-gate-err').textContent = msg || '';
    const btn = document.getElementById('gps-gate-btn'), alt = document.getElementById('gps-jaipur-btn');
    btn.disabled = false; alt.disabled = false;
    btn.textContent = msg ? 'दोबारा कोशिश करें' : 'हाँ, सटीक पंचांग दिखाएँ';
    window.pchGateConsentChanged();
    if (!pchGateBound) {
      pchGateBound = true;
      // Coming back from the phone/browser settings after a failed attempt: try again automatically.
      document.addEventListener('visibilitychange', function () {
        const gg = document.getElementById('pch-gps-gate');
        if (document.visibilityState === 'visible' && gg && !gg.hidden && PCH.lat === null && pchGateTried && !document.getElementById('gps-gate-btn').disabled) pchGateStart();
      });
    }
    try { document.getElementById('gps-consent-cb').focus(); } catch (e) { /* ignore */ }
  }
  function pchHideGpsGate() {
    const g = document.getElementById('pch-gps-gate');
    if (g) g.hidden = true;
    document.body.style.overflow = '';
  }
  window.pchGateConsentChanged = function () {
    const cb = document.getElementById('gps-consent-cb'), btn = document.getElementById('gps-gate-btn');
    btn.setAttribute('aria-disabled', cb.checked ? 'false' : 'true');
    document.getElementById('gps-consent').classList.remove('need');
  };
  function pchGateStart() {
    const btn = document.getElementById('gps-gate-btn');
    btn.disabled = true;
    btn.textContent = 'स्थान पता किया जा रहा है…';
    document.getElementById('gps-gate-err').textContent = '';
    pchGateTried = true;
    pchRequestGPS(true);
  }
  // "GPS चालू करें": only after the consent box is ticked.
  window.pchGateRetry = function () {
    const cb = document.getElementById('gps-consent-cb');
    if (!cb.checked) {
      const row = document.getElementById('gps-consent');
      row.classList.remove('need'); void row.offsetWidth; row.classList.add('need');
      try { cb.focus(); } catch (e) { /* ignore */ }
      return;
    }
    pchGateStart();
  };
  // Fallback: no GPS -> Jaipur, Rajasthan, so the Panchang can still be calculated.
  window.pchGateUseJaipur = function () {
    PCH.lat = 26.9124; PCH.lon = 75.7873; PCH.name = 'Jaipur'; PCH.state = 'Rajasthan';
    PCH.tzOffsetMin = 330; PCH.customDateTime = null;
    pchHideGpsGate();
    pchSetStatus('');
    pchBusy.show('sun', 'Jaipur के लिए पंचांग तैयार हो रहा है');
    pchRunCalculation();
  };

  function pchHandleGpsSuccess(pos, wasAuto) {
    PCH.lat = pos.coords.latitude;
    PCH.lon = pos.coords.longitude;
    PCH.name = 'वर्तमान GPS स्थान';
    pchHideGpsGate();
    // (No separate timezone-resolution request here — pchRunCalculation()'s
    // own sun-times fetch resolves PCH.tzOffsetMin from the same Open-Meteo
    // endpoint a moment later, so a dedicated call first would just be a
    // second, redundant network round-trip before the page can show data.)
    if (wasAuto) pchShowGpsLoading(false);
    pchSetStatus('स्थान मिल गया: वर्तमान GPS स्थान (' + PCH.lat.toFixed(3) + ', ' + PCH.lon.toFixed(3) + ')');
    PCH.state = '';
    pchBusy.show('sun');
    pchRunCalculation();
    pchResolveGpsState(PCH.lat, PCH.lon);
  }

  // GPS gives only coordinates, so the state / union territory comes from a free reverse-geocoding
  // lookup. Runs after the panchang is already shown; when the state arrives the lists (holidays,
  // location label) re-render for it. Silent on failure — state simply stays blank.
  async function pchResolveGpsState(lat, lon) {
    try {
      const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const to = ctl ? setTimeout(function () { ctl.abort(); }, 8000) : null;
      const res = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + lat + '&longitude=' + lon + '&localityLanguage=en', { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
      if (to) clearTimeout(to);
      const d = await res.json();
      const st = String((d && d.principalSubdivision) || '').trim();
      // ignore a stale answer if the location changed meanwhile
      if (!st || PCH.lat !== lat || PCH.lon !== lon || PCH.name !== 'वर्तमान GPS स्थान' || PCH.state === st) return;
      PCH.state = st;
      pchSetStatus('स्थान मिल गया: वर्तमान GPS स्थान, ' + st + ' (' + lat.toFixed(3) + ', ' + lon.toFixed(3) + ')');
      pchRunCalculation();
    } catch (e) { /* offline / blocked: leave state blank */ }
  }

  function pchGpsErrorMsg(err) {
    if (err && err.code === err.PERMISSION_DENIED) return PCH.lat === null ? PCH_GPS_GATE_DENIED_MSG : PCH_GPS_DENIED_MSG_POPUP;
    if (err && err.code === err.POSITION_UNAVAILABLE) return 'स्थान की जानकारी नहीं मिल पाई। कृपया अपने डिवाइस की लोकेशन सेवा (GPS) चालू करें और दोबारा प्रयास करें।' + pchGpsFallbackHint();
    if (err && err.code === err.TIMEOUT) return 'स्थान पता करने में अधिक समय लग रहा है।' + pchGpsFallbackHint();
    return 'GPS स्थान प्राप्त नहीं हो सका।' + pchGpsFallbackHint();
  }
  function pchHandleGpsError(err, wasAuto) {
    pchFailGps(pchGpsErrorMsg(err), wasAuto);
  }

  // wasAuto = true when this was the silent attempt on page-open (loading
  // indicator + no location-selector shown yet); false when the user
  // explicitly tapped "वर्तमान GPS स्थान" from the already-visible selector.
  // Geolocation can't work at all without the API or a secure (HTTPS) page —
  // report that once, here, for both the silent and the user-initiated path.
  function pchGpsUnavailable(wasAuto) {
    if (!navigator.geolocation) {
      pchFailGps('इस डिवाइस/ब्राउज़र पर GPS उपलब्ध नहीं है।' + pchGpsFallbackHint(), wasAuto);
      return true;
    }
    if (window.isSecureContext === false) {
      pchFailGps('GPS केवल सुरक्षित (HTTPS) पेज पर काम करता है।' + pchGpsFallbackHint(), wasAuto);
      return true;
    }
    return false;
  }
  function pchRequestGPS(wasAuto) {
    if (pchGpsUnavailable(wasAuto)) return;
    if (!wasAuto) pchSetStatus('आपका स्थान पता किया जा रहा है…');
    navigator.geolocation.getCurrentPosition(
      (pos) => pchHandleGpsSuccess(pos, wasAuto),
      (err) => pchHandleGpsError(err, wasAuto),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }
    );
  }

  // Called automatically when the Panchang page opens with no location
  // set yet. Location selector stays hidden and a lightweight loading
  // indicator shows instead; permission state is checked first (where
  // supported) so we don't surprise the user with a native prompt if
  // they've already denied it — instead the selector is revealed right
  // away with a clear explanation.
  function pchAutoFetchGPS() {
    pchBusy.show('gps');
    pchShowGpsLoading(true);
    if (pchGpsUnavailable(true)) return;
    // No native prompt before the user has seen the explanation and consented in our own modal.
    function askConsent(msg) { pchBusy.hide(true); pchShowGpsLoading(false); pchShowGpsGate(msg || ''); }
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then((status) => {
        status.onchange = function () {   // allowed from settings while the modal is open
          const gg = document.getElementById('pch-gps-gate');
          if (status.state === 'granted' && PCH.lat === null && gg && !gg.hidden && !document.getElementById('gps-gate-btn').disabled) pchGateStart();
        };
        if (status.state === 'granted') { pchRequestGPS(true); return; }   // already allowed earlier: no modal needed
        if (status.state === 'denied') { askConsent(PCH_GPS_GATE_DENIED_MSG); return; }
        askConsent('');                                                    // 'prompt': explain + consent first
      }).catch(() => askConsent(''));
    } else {
      askConsent('');
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     LOCATION · DATE · TIME PICKER  (the "Change Location & Time" popup)
     Three divided parts + OK. Every choice only edits a draft (LM.d);
     PCH / the calendar are touched only when OK is tapped. Outside tap,
     × and Esc cancel and drop the draft.
       d.loc  { lat, lon, name, state, mode:'gps'|'manual', iana?, tz? } | null
       d.date 'YYYY-MM-DD' (the place's own calendar day)
       d.mode 'now' | 'sunrise' | 'custom'     d.time 'HH:MM' (custom only)
     ══════════════════════════════════════════════════════════════════ */
  const LM = { d: null, initSig: '', bound: false, gpsBusy: false, gpsTok: 0, searchTok: 0, searchTimer: null,
               results: [], hot: -1, selLabel: '', sunCache: new Map(), sun: null };
  const LM_GPS_NAME = 'वर्तमान GPS स्थान';
  const lmEl = function (id) { return document.getElementById(id); };

  // Offset (minutes east of UTC) of an IANA zone at an instant; null if the zone is unknown.
  function lmIanaOffset(iana, utcMs) {
    try {
      const p = {};
      new Intl.DateTimeFormat('en-US', { timeZone: iana, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
        .formatToParts(new Date(utcMs)).forEach(function (x) { p[x.type] = x.value; });
      const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
      return Math.round((asUTC - Math.floor(utcMs / 1000) * 1000) / 60000);
    } catch (e) { return null; }
  }
  // The draft place's UTC offset for a given day (its own zone, not the browser's).
  function lmTzFor(dateStr) {
    const l = LM.d && LM.d.loc;
    if (l && l.iana) {
      let ms = Date.now();
      if (dateStr) { const p = dateStr.split('-').map(Number); ms = Date.UTC(p[0], p[1] - 1, p[2], 12); }
      const o = lmIanaOffset(l.iana, ms);
      if (o !== null) return o;
    }
    if (l && typeof l.tz === 'number') return l.tz;
    return (PCH && PCH.tzOffsetMin) || 330;
  }
  function lmTodayS() { return ymdAtOffset(new Date(), lmTzFor(null)); }
  function lmHM(date, tz) {
    const l = new Date(date.getTime() + tz * 60000);
    return pad2(l.getUTCHours()) + ':' + pad2(l.getUTCMinutes());
  }
  function lmFmt12(hm) {
    const p = hm.split(':').map(Number);
    return fmtTime(new Date(Date.UTC(2000, 0, 1, p[0], p[1])), 0);
  }
  function lmSig() {
    const d = LM.d;
    return [d.loc ? d.loc.lat + ',' + d.loc.lon : '', d.date, d.mode, d.mode === 'custom' ? d.time : ''].join('|');
  }
  function lmPlaceLabel(loc) {
    if (loc.mode === 'gps') return LM_GPS_NAME + (loc.state ? ', ' + loc.state : ' (' + loc.lat.toFixed(3) + ', ' + loc.lon.toFixed(3) + ')');
    return loc.name + (loc.state ? ', ' + loc.state : '');
  }
  function lmSetOn(el, on) { el.classList.toggle('is-active', !!on); if (el.tagName === 'BUTTON') el.setAttribute('aria-pressed', on ? 'true' : 'false'); }

  // Forget the draft (popup closed / calculation took over).
  function lmReset() {
    LM.d = null; LM.gpsBusy = false; LM.gpsTok++; LM.searchTok++;
    clearTimeout(LM.searchTimer); LM.results = []; LM.hot = -1; LM.selLabel = '';
  }

  // Fresh draft from what is currently applied (or an empty one on the very first open).
  function lmInit() {
    lmBind();
    lmReset();
    const has = PCH.lat !== null, tz = PCH.tzOffsetMin || 330;
    const loc = has ? { lat: PCH.lat, lon: PCH.lon, name: PCH.name, state: PCH.state || '', mode: PCH.name === LM_GPS_NAME ? 'gps' : 'manual', tz: tz } : null;
    let date = ymdAtOffset(new Date(), tz), mode = 'now', time = '';
    if (has && PCH.customDateTime) {
      date = ymdAtOffset(PCH.customDateTime, tz);
      const si = pchCal.sunInfo;
      if (pchCal.followNow) mode = 'now';
      else if (si && si.sunrise && Math.abs(si.sunrise.getTime() - PCH.customDateTime.getTime()) < 60000) mode = 'sunrise';
      else { mode = 'custom'; time = lmHM(PCH.customDateTime, tz); }
    }
    LM.d = { loc: loc, date: date, mode: mode, time: time };
    LM.initSig = lmSig();
    const inp = lmEl('lm-search-input');
    LM.selLabel = (loc && loc.mode === 'manual') ? lmPlaceLabel(loc) : '';
    inp.value = LM.selLabel;
    lmHideResults();
    lmRender();
    lmEnsureSunrise();
  }

  function lmRender() {
    const d = LM.d; if (!d) return;
    const loc = d.loc;
    // ── 1 · place
    const lv = lmEl('lm-loc-val');
    lv.textContent = loc ? lmPlaceLabel(loc) : 'अभी चुना नहीं गया';
    lv.classList.toggle('is-empty', !loc);
    const gps = lmEl('lm-gps');
    lmSetOn(gps, !!loc && loc.mode === 'gps' && !LM.gpsBusy);
    gps.classList.toggle('is-busy', LM.gpsBusy);
    const picked = !!loc && loc.mode === 'manual' && lmEl('lm-search-input').value.trim() === LM.selLabel && !!LM.selLabel;
    lmEl('lm-search').classList.toggle('is-selected', picked);
    // ── 2 · date
    const tz = lmTzFor(d.date), today = lmTodayS(), isToday = d.date === today;
    const dEl = lmEl('lm-date');
    dEl.min = new Date(pchCalMinUTC()).toISOString().slice(0, 10);
    dEl.max = new Date(pchCalMaxUTC()).toISOString().slice(0, 10);
    dEl.value = d.date;
    lmSetOn(lmEl('lm-today'), isToday);
    lmSetOn(dEl, !isToday);
    const dp = d.date.split('-').map(Number);
    lmEl('lm-date-val').textContent = dp[2] + ' ' + MONTH_NAMES_HI[dp[1] - 1] + ' ' + dp[0] + ', ' + WEEKDAY_NAMES[new Date(Date.UTC(dp[0], dp[1] - 1, dp[2])).getUTCDay()];
    // ── 3 · time
    let shown = '—', hm = '';
    if (d.mode === 'now') { const n = new Date(); shown = fmtTime(n, tz); hm = lmHM(n, tz); }
    else if (d.mode === 'sunrise') {
      const s = LM.sun;
      if (s && s.sunrise) { shown = fmtTime(s.sunrise, s.tz); hm = lmHM(s.sunrise, s.tz); }
      else shown = (s === null) ? '…' : '—';
    } else if (d.time) { shown = lmFmt12(d.time); hm = d.time; }
    lmEl('lm-time-val').textContent = shown;
    lmEl('lm-time').value = hm;
    lmSetOn(lmEl('lm-now'), d.mode === 'now');
    lmSetOn(lmEl('lm-sunrise'), d.mode === 'sunrise');
    lmSetOn(lmEl('lm-time'), d.mode === 'custom');
    lmEl('lm-ok').disabled = !loc || LM.gpsBusy;
  }

  // Sunrise for the draft place + day (shown as the time while "सूर्योदय" is chosen).
  // Own request on purpose: the draft place is not PCH yet.
  async function lmEnsureSunrise() {
    const d = LM.d;
    if (!d || d.mode !== 'sunrise' || !d.loc) return;
    const key = d.loc.lat + ',' + d.loc.lon + ',' + d.date;
    if (LM.sunCache.has(key)) { LM.sun = LM.sunCache.get(key); lmRender(); return; }
    LM.sun = null; lmRender();
    let out = false;
    try {
      const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + d.loc.lat + '&longitude=' + d.loc.lon + '&daily=sunrise&timezone=auto&start_date=' + d.date + '&end_date=' + d.date, { cache: 'no-store' });
      const data = await res.json();
      if (data && data.daily && data.daily.sunrise) {
        const tz = typeof data.utc_offset_seconds === 'number' ? data.utc_offset_seconds / 60 : lmTzFor(d.date);
        out = { sunrise: parseLocalISOToUTCDate(data.daily.sunrise[0], tz), tz: tz };
        LM.sunCache.set(key, out);
      }
    } catch (e) { /* offline / out of range: show — (OK still falls back to the offline estimate) */ }
    const nd = LM.d;
    if (!nd || !nd.loc || nd.mode !== 'sunrise' || (nd.loc.lat + ',' + nd.loc.lon + ',' + nd.date) !== key) return;   // changed meanwhile
    LM.sun = out; lmRender();
  }

  /* ── events ── */
  function lmBind() {
    if (LM.bound) return;
    LM.bound = true;
    const dEl = lmEl('lm-date'), tEl = lmEl('lm-time'), sEl = lmEl('lm-search-input');
    [dEl, tEl].forEach(function (el) {                       // the whole box opens the picker, not only its icon
      el.addEventListener('click', function () { try { if (typeof el.showPicker === 'function') el.showPicker(); } catch (e) { /* needs a user gesture / unsupported */ } });
    });
    function dateChosen() {
      if (!LM.d || !dEl.value) return;
      let v = dEl.value;
      if (dEl.min && v < dEl.min) v = dEl.min;
      if (dEl.max && v > dEl.max) v = dEl.max;
      LM.d.date = v; lmRender(); lmEnsureSunrise();
    }
    dEl.addEventListener('change', dateChosen);               // 'change' only: 'input' would fire while a year is still being typed
    function timeChosen() {
      if (!LM.d || !tEl.value) return;
      LM.d.mode = 'custom'; LM.d.time = tEl.value; lmRender();
    }
    tEl.addEventListener('change', timeChosen);
    tEl.addEventListener('input', timeChosen);
    sEl.addEventListener('input', lmOnSearchInput);
    sEl.addEventListener('keydown', lmOnSearchKey);
    lmEl('lm-results').addEventListener('click', function (e) {
      const li = e.target.closest('.lm-res'); if (li) lmChoose(+li.getAttribute('data-i'));
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !LM.d) return;
      const sec = lmEl('pch-location-section');
      if (!sec || !sec.classList.contains('is-popup')) return;
      if (!lmEl('lm-results').hidden) { lmHideResults(); return; }   // first Esc closes the list, second cancels
      pchCloseLocationPopup();
    });
  }

  window.lmPickToday = function () { if (!LM.d) return; LM.d.date = lmTodayS(); lmRender(); lmEnsureSunrise(); };
  window.lmPickNow = function () { if (!LM.d) return; LM.d.mode = 'now'; lmRender(); };
  window.lmPickSunrise = function () { if (!LM.d) return; LM.d.mode = 'sunrise'; lmRender(); lmEnsureSunrise(); };

  /* ── GPS ── */
  window.lmUseGPS = function () {
    if (!LM.d || LM.gpsBusy) return;
    pchSetStatus('');
    if (!navigator.geolocation) { pchSetStatus('इस डिवाइस/ब्राउज़र पर GPS उपलब्ध नहीं है।' + pchGpsFallbackHint(), true); return; }
    if (window.isSecureContext === false) { pchSetStatus('GPS केवल सुरक्षित (HTTPS) पेज पर काम करता है।' + pchGpsFallbackHint(), true); return; }
    LM.gpsBusy = true;
    const tok = ++LM.gpsTok;
    lmRender();
    navigator.geolocation.getCurrentPosition(function (pos) {
      if (tok !== LM.gpsTok || !LM.d) return;                 // popup closed / cancelled meanwhile
      LM.gpsBusy = false;
      let iana = ''; try { iana = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* ignore */ }
      const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude, name: LM_GPS_NAME, state: '', mode: 'gps', iana: iana, tz: -new Date().getTimezoneOffset() };
      LM.d.loc = loc;
      LM.selLabel = ''; lmEl('lm-search-input').value = ''; lmHideResults();
      lmRender(); lmEnsureSunrise();
      lmResolveGpsState(loc);
    }, function (err) {
      if (tok !== LM.gpsTok || !LM.d) return;
      LM.gpsBusy = false;
      lmRender();
      pchSetStatus(pchGpsErrorMsg(err), true);
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
  };
  async function lmResolveGpsState(loc) {                     // state / UT for the header and the holiday lists
    try {
      const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const to = ctl ? setTimeout(function () { ctl.abort(); }, 8000) : null;
      const res = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + loc.lat + '&longitude=' + loc.lon + '&localityLanguage=en', { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
      if (to) clearTimeout(to);
      const st = String(((await res.json()) || {}).principalSubdivision || '').trim();
      if (st && LM.d && LM.d.loc === loc) { loc.state = st; lmRender(); }
    } catch (e) { /* offline / blocked: coordinates stay in the header */ }
  }

  /* ── manual search (Open-Meteo geocoding) ── */
  function lmHideResults() {
    const ul = lmEl('lm-results'); ul.hidden = true; ul.innerHTML = ''; LM.results = []; LM.hot = -1;
    lmEl('lm-search-input').setAttribute('aria-expanded', 'false');
  }
  function lmShowNote(text) {
    const ul = lmEl('lm-results');
    ul.innerHTML = ''; const li = document.createElement('li'); li.className = 'lm-res lm-res-note'; li.textContent = text; ul.appendChild(li);
    ul.hidden = false; LM.results = []; LM.hot = -1;
  }
  function lmRenderResults() {
    const ul = lmEl('lm-results'); ul.innerHTML = '';
    LM.results.forEach(function (r, i) {
      const sub = [r.admin2, r.admin1, r.country].filter(function (v, k, a) { return v && a.indexOf(v) === k; }).join(', ');
      const li = document.createElement('li');
      li.className = 'lm-res'; li.setAttribute('role', 'option'); li.setAttribute('data-i', i);
      const n = document.createElement('div'); n.className = 'lm-res-name'; n.textContent = r.name;
      const s = document.createElement('div'); s.className = 'lm-res-sub'; s.textContent = sub;
      li.appendChild(n); if (sub) li.appendChild(s); ul.appendChild(li);
    });
    ul.hidden = false;
    lmEl('lm-search-input').setAttribute('aria-expanded', 'true');
    LM.hot = -1;
  }
  function lmOnSearchInput() {
    const v = lmEl('lm-search-input').value.trim();
    lmEl('lm-search').classList.toggle('is-selected', !!LM.d && !!LM.d.loc && LM.d.loc.mode === 'manual' && v === LM.selLabel && !!v);
    clearTimeout(LM.searchTimer);
    pchSetStatus('');
    if (v.length < 2) { LM.searchTok++; lmHideResults(); return; }
    if (v === LM.selLabel) { LM.searchTok++; lmHideResults(); return; }
    LM.searchTimer = setTimeout(function () { lmSearch(v); }, 450);
  }
  async function lmSearch(q) {
    const tok = ++LM.searchTok;
    clearTimeout(LM.searchTimer);
    lmShowNote('खोजा जा रहा है…');
    try {
      const res = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q) + '&count=10&language=en&format=json', { cache: 'no-store' });
      const data = await res.json();
      if (tok !== LM.searchTok || !LM.d) return;              // newer query / popup closed
      const rs = data.results || [];
      if (!rs.length) { lmShowNote('“' + q + '” के लिए कोई स्थान नहीं मिला। कृपया दूसरा नाम आज़माएँ।'); return; }
      LM.results = rs; lmRenderResults();
    } catch (e) {
      if (tok === LM.searchTok && LM.d) lmShowNote('स्थान खोजने में त्रुटि हुई। कृपया इंटरनेट कनेक्शन जाँचें।');
    }
  }
  function lmOnSearchKey(e) {
    const n = LM.results.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!n) return;
      e.preventDefault();
      LM.hot = (LM.hot + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      const items = lmEl('lm-results').querySelectorAll('.lm-res');
      items.forEach(function (li, i) { li.classList.toggle('is-hot', i === LM.hot); });
      if (items[LM.hot]) items[LM.hot].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (LM.hot >= 0) lmChoose(LM.hot);
      else if (n === 1) lmChoose(0);
      else { const v = lmEl('lm-search-input').value.trim(); if (v.length >= 2) lmSearch(v); }
    }
  }
  function lmChoose(i) {
    const r = LM.results[i]; if (!r || !LM.d) return;
    LM.d.loc = { lat: r.latitude, lon: r.longitude, name: r.name, state: r.admin1 || '', mode: 'manual', iana: r.timezone || '' };
    LM.selLabel = lmPlaceLabel(LM.d.loc);
    const inp = lmEl('lm-search-input'); inp.value = LM.selLabel; inp.blur();
    LM.searchTok++; clearTimeout(LM.searchTimer);
    lmHideResults(); pchSetStatus('');
    lmRender(); lmEnsureSunrise();
  }

  /* ── OK ── */
  window.lmConfirm = function () {
    const d = LM.d;
    if (!d || !d.loc || LM.gpsBusy) return;
    // text typed in the search box but no place picked from the list yet
    const typed = lmEl('lm-search-input').value.trim();
    if (typed && (d.loc.mode === 'gps' || typed !== LM.selLabel)) {
      pchSetStatus('कृपया सूची में से अपना स्थान चुनें।', true);
      if (lmEl('lm-results').hidden && typed.length >= 2) lmSearch(typed);
      return;
    }
    const first = PCH.lat === null;
    if (!first && lmSig() === LM.initSig) { pchCloseLocationPopup(); return; }   // nothing changed
    const loc = d.loc, mode = d.mode, time = d.time, tz = lmTzFor(d.date);
    const locChanged = first || loc.lat !== PCH.lat || loc.lon !== PCH.lon || (loc.mode === 'gps') !== (PCH.name === LM_GPS_NAME);
    let p = d.date.split('-').map(Number), y = p[0], m = p[1] - 1, day = p[2];
    pchHideLocationSection();                                // closes the popup and drops the draft
    pchSetStatus('');
    if (locChanged) {
      PCH.lat = loc.lat; PCH.lon = loc.lon; PCH.name = loc.name; PCH.state = loc.state || '';
      PCH.tzOffsetMin = tz;                                  // refined by the sun-times fetch that follows
    }
    if (first || !pchCal.open) {                             // nothing to anchor a date to yet: plain calculation
      PCH.customDateTime = null;
      pchBusy.show('sun', loc.name + ' के लिए पंचांग तैयार हो रहा है');
      pchRunCalculation();
      if (loc.mode === 'gps' && !loc.state) pchResolveGpsState(PCH.lat, PCH.lon);
      return;
    }
    pchBusy.show('calc');
    // keep the day inside the calendar window
    const u = Date.UTC(y, m, day), lo = pchCalMinUTC(), hi = pchCalMaxUTC();
    if (u < lo || u > hi) { const c = new Date(Math.min(Math.max(u, lo), hi)); y = c.getUTCFullYear(); m = c.getUTCMonth(); day = c.getUTCDate(); }
    const isToday = pchCalIsToday({ y: y, m: m, d: day });
    if (mode === 'sunrise') {
      window.pchCalSelect(y, m, day, true);                  // sunrise of that day (Open-Meteo, offline fallback)
    } else if (mode === 'now' && isToday) {
      window.pchCalSelect(y, m, day);                        // today + now = back to live
    } else {
      pchCal.sel = { y: y, m: m, d: day }; pchCal.y = y; pchCal.m = m; pchCal.sunInfo = null; pchCalRender();
      if (mode === 'custom') window.pchCalTimeChanged(time);
      else window.pchCalLive();                              // another day, running at the current time of day
    }
    if (locChanged && loc.mode === 'gps' && !loc.state) pchResolveGpsState(PCH.lat, PCH.lon);
  };

  // Sunrise/sunset for a given location+date never changes, but
  // pchRunCalculation() re-runs every minute the page is open (to keep
  // Tithi/Nakshatra/Yoga/Karana live) and, until this cache existed, that
  // meant re-fetching both today's and tomorrow's sun times from the
  // Open-Meteo API over the network every 60 seconds indefinitely — pure
  // waste of battery/data, and needless load on the API. Caching by
  // "lat,lon,date" makes every call after the first same-day one instant
  // and offline-safe, with zero risk of staleness (the underlying value is
  // fixed once the day/location are fixed).
  const _sunTimesCache = new Map();
  async function pchFetchSunTimes(dateStr) {
    const cacheKey = PCH.lat + ',' + PCH.lon + ',' + dateStr;
    if (_sunTimesCache.has(cacheKey)) return _sunTimesCache.get(cacheKey);
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + PCH.lat + '&longitude=' + PCH.lon
      + '&daily=sunrise,sunset&timezone=auto&start_date=' + dateStr + '&end_date=' + dateStr;
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    // Out-of-range dates / API errors come back without `daily` — throw so the
    // failure is NOT cached as an empty result (callers may fall back).
    if (!data || !data.daily || !data.daily.sunrise) throw new Error('sun data unavailable');
    // Open-Meteo returns utc_offset_seconds for the queried location, and
    // sunrise/sunset as timezone-less local ISO strings (e.g. "2026-07-11T06:10").
    // We must resolve the offset FIRST, then convert those local strings into
    // true UTC instants ourselves — letting `new Date(...)` parse a
    // timezone-less string directly would use the *browser's* local time
    // zone instead of the location's, corrupting every downstream time.
    const tzOffsetMin = (typeof data.utc_offset_seconds === 'number') ? data.utc_offset_seconds / 60 : (PCH.tzOffsetMin || 330);
    PCH.tzOffsetMin = tzOffsetMin;
    const result = {
      sunrise: data.daily && data.daily.sunrise ? parseLocalISOToUTCDate(data.daily.sunrise[0], tzOffsetMin) : null,
      sunset: data.daily && data.daily.sunset ? parseLocalISOToUTCDate(data.daily.sunset[0], tzOffsetMin) : null
    };
    _sunTimesCache.set(cacheKey, result);
    return result;
  }

  // Offline sunrise/sunset for a "YYYY-MM-DD" date at the current location.
  function pchApproxSunTimes(dateStr) {
    const p = dateStr.split('-').map(Number), tz = PCH.tzOffsetMin || 330;
    const r = pchApproxSunriseSetMin(p[0], p[1] - 1, p[2], tz);
    const base = Date.UTC(p[0], p[1] - 1, p[2]);
    return { sunrise: new Date(base + (r.rise - tz) * 60000), sunset: new Date(base + (r.set - tz) * 60000), approx: true };
  }
  // Open-Meteo first; if it can't answer (offline, or a date beyond its
  // forecast window) use the offline approximation, flagged `approx: true`.
  // A failed date is not re-requested for 10 minutes so the per-minute
  // refresh doesn't hammer the API.
  const _sunFailAt = new Map();
  async function pchSunTimesWithFallback(dateStr) {
    const key = PCH.lat + ',' + PCH.lon + ',' + dateStr;
    if (!_sunTimesCache.has(key)) {
      const f = _sunFailAt.get(key);
      if (f && Date.now() - f < 600000) return pchApproxSunTimes(dateStr);
    }
    try {
      const r = await pchFetchSunTimes(dateStr);
      if (r && r.sunrise && r.sunset) return r;
      throw new Error('empty');
    } catch (e) {
      _sunFailAt.set(key, Date.now());
      return pchApproxSunTimes(dateStr);
    }
  }

  function pad2(n){ return String(n).padStart(2,'0'); }
  // Calendar date at a given UTC offset (minutes east of UTC), read via the
  // same "shift the instant, then read UTC getters" trick used everywhere
  // else in this module. ymd() above reads the *browser's* local date,
  // which is only correct when the browser happens to be in the same time
  // zone as the Panchang location being viewed — for a location in a
  // different zone (e.g. checking Panchang for a city back home while
  // travelling abroad), ymd() can name the wrong calendar day for a few
  // hours around either midnight, fetching sunrise/sunset for the wrong
  // date. ymdAtOffset fixes that by deriving the date at the *location's*
  // own offset instead of the browser's.
  function ymdAtOffset(date, tzOffsetMin) {
    const local = new Date(date.getTime() + tzOffsetMin * 60000);
    return local.getUTCFullYear() + '-' + pad2(local.getUTCMonth() + 1) + '-' + pad2(local.getUTCDate());
  }

  /* ══════════════════════════════════════════════════════════════════
     VRAT / TYOHAR MODULE — Hindu fasts (Ekadashi/Gyaras, Purnima,
     Amavasya, Pradosh, Sankashti/Vinayaka Chaturthi) & major festivals.
     Computed by scanning Purnimant masa + paksha + tithi day-by-day
     using the same Sun/Moon longitude engine as the rest of Panchang,
     then matched against a curated festival table (North-Indian /
     Purnimant convention). Solar (Sankranti) festivals are detected
     separately via the Sun's sidereal Rashi. ── */
  const MONTH_NAMES_HI = ['जनवरी','फरवरी','मार्च','अप्रैल','मई','जून','जुलाई','अगस्त','सितम्बर','अक्टूबर','नवम्बर','दिसम्बर'];

  const VRAT_TYOHAR_MAP = {
    'चैत्र|शुक्ल|1': 'चैत्र नवरात्रि प्रारंभ / गुड़ी पड़वा (नव संवत्सर)',
    'चैत्र|शुक्ल|2': 'चेटी चंड (सिंधी नववर्ष)',
    'चैत्र|शुक्ल|9': 'राम नवमी',
    'चैत्र|शुक्ल|11': 'कामदा एकादशी',
    'चैत्र|शुक्ल|13': 'महावीर जयंती',
    'चैत्र|शुक्ल|15': 'हनुमान जयंती (चैत्र पूर्णिमा)',
    'चैत्र|कृष्ण|1': 'होली (धुलंडी / रंगों वाली होली)',
    'चैत्र|कृष्ण|11': 'पापमोचिनी एकादशी',
    'पौष|कृष्ण|11': 'सफला एकादशी',
    'पौष|शुक्ल|11': 'पौष पुत्रदा एकादशी',
    'वैशाख|शुक्ल|3': 'अक्षय तृतीया',
    'वैशाख|शुक्ल|11': 'मोहिनी एकादशी',
    'वैशाख|कृष्ण|11': 'वरुथिनी एकादशी',
    'ज्येष्ठ|शुक्ल|10': 'गंगा दशहरा',
    'ज्येष्ठ|शुक्ल|11': 'निर्जला एकादशी',
    'ज्येष्ठ|शुक्ल|15': 'ज्येष्ठ पूर्णिमा (वट सावित्री)',
    'ज्येष्ठ|कृष्ण|11': 'अपरा एकादशी',
    'आषाढ़|शुक्ल|2': 'जगन्नाथ रथ यात्रा',
    'आषाढ़|शुक्ल|11': 'देवशयनी एकादशी',
    'आषाढ़|शुक्ल|15': 'गुरु पूर्णिमा',
    'आषाढ़|कृष्ण|11': 'योगिनी एकादशी',
    'श्रावण|शुक्ल|3': 'हरियाली तीज',
    'श्रावण|शुक्ल|5': 'नाग पंचमी',
    'श्रावण|शुक्ल|11': 'श्रावण पुत्रदा एकादशी',
    'श्रावण|शुक्ल|15': 'रक्षाबंधन (श्रावणी पूर्णिमा)',
    'श्रावण|कृष्ण|11': 'कामिका एकादशी',
    'भाद्रपद|कृष्ण|3': 'कजरी तीज',
    'भाद्रपद|कृष्ण|8': 'श्री कृष्ण जन्माष्टमी',
    'भाद्रपद|कृष्ण|11': 'अजा एकादशी',
    'भाद्रपद|शुक्ल|3': 'हरतालिका तीज',
    'भाद्रपद|शुक्ल|4': 'गणेश चतुर्थी',
    'भाद्रपद|शुक्ल|11': 'परिवर्तिनी एकादशी',
    'भाद्रपद|शुक्ल|15': 'भाद्रपद पूर्णिमा / श्राद्ध पक्ष प्रारंभ (पितृ पक्ष)',
    'आश्विन|शुक्ल|1': 'शारदीय नवरात्रि प्रारंभ',
    'आश्विन|शुक्ल|6': 'कल्पारंभ (दुर्गा पूजा)',
    'आश्विन|शुक्ल|7': 'नवपत्रिका पूजा (दुर्गा पूजा)',
    'आश्विन|शुक्ल|8': 'महाअष्टमी (दुर्गाष्टमी)',
    'आश्विन|शुक्ल|9': 'महानवमी',
    'आश्विन|शुक्ल|10': 'विजयादशमी (दशहरा)',
    'आश्विन|शुक्ल|11': 'पापांकुशा एकादशी',
    'आश्विन|शुक्ल|15': 'शरद पूर्णिमा',
    'आश्विन|कृष्ण|11': 'इन्दिरा एकादशी',
    'कार्तिक|कृष्ण|4': 'करवा चौथ',
    'कार्तिक|कृष्ण|11': 'रमा एकादशी',
    'कार्तिक|कृष्ण|13': 'धनतेरस',
    'कार्तिक|कृष्ण|14': 'नरक चतुर्दशी (छोटी दीपावली)',
    'कार्तिक|कृष्ण|15': 'दीपावली (अमावस्या)',
    'कार्तिक|शुक्ल|1': 'गोवर्धन पूजा',
    'कार्तिक|शुक्ल|2': 'भाई दूज',
    'कार्तिक|शुक्ल|6': 'छठ पूजा',
    'कार्तिक|शुक्ल|11': 'देवउठनी एकादशी',
    'कार्तिक|शुक्ल|15': 'कार्तिक पूर्णिमा / देव दीपावली',
    'मार्गशीर्ष|शुक्ल|11': 'मोक्षदा एकादशी',
    'मार्गशीर्ष|कृष्ण|11': 'उत्पन्ना एकादशी',
    'माघ|शुक्ल|5': 'वसंत पंचमी (सरस्वती पूजा)',
    'माघ|शुक्ल|11': 'जया एकादशी',
    'माघ|शुक्ल|15': 'माघी पूर्णिमा',
    'माघ|कृष्ण|11': 'षटतिला एकादशी',
    'फाल्गुन|शुक्ल|11': 'आमलकी एकादशी',
    'फाल्गुन|शुक्ल|15': 'होलिका दहन (फाल्गुन पूर्णिमा)',
    'फाल्गुन|कृष्ण|11': 'विजया एकादशी',
    'फाल्गुन|कृष्ण|14': 'महाशिवरात्रि'
  };

  // ── Extra observances (from the Vrat/Tyohar master list Nov 2026 – Dec 2027) ──
  // Names that ride along on a masa|paksha|tithi key (same day-picking rule as that key).
  const PCH_VRAT_EXTRA = {
    'कार्तिक|कृष्ण|13': ['धन्वंतरि जयंती', 'यम दीपम'],
    'कार्तिक|कृष्ण|14': ['काली चौदस'],
    'कार्तिक|कृष्ण|15': ['लक्ष्मी पूजा'],
    'कार्तिक|शुक्ल|1': ['अन्नकूट', 'बलि प्रतिपदा', 'गुजराती नव वर्ष'],
    'कार्तिक|शुक्ल|2': ['यम द्वितीया', 'चित्रगुप्त पूजा'],
    'कार्तिक|शुक्ल|5': ['लाभ पंचमी'],
    'कार्तिक|शुक्ल|6': ['स्कंद षष्ठी'],
    'कार्तिक|शुक्ल|8': ['गोपाष्टमी'],
    'कार्तिक|शुक्ल|9': ['अक्षय नवमी', 'जगद्धात्री पूजा'],
    'कार्तिक|शुक्ल|11': ['भीष्म पंचक प्रारंभ'],
    'कार्तिक|शुक्ल|12': ['तुलसी विवाह'],
    'कार्तिक|शुक्ल|14': ['वैकुंठ चतुर्दशी'],
    'कार्तिक|शुक्ल|15': ['गुरु नानक जयंती'],
    'मार्गशीर्ष|कृष्ण|8': ['कालभैरव जयंती'],
    'मार्गशीर्ष|शुक्ल|5': ['विवाह पंचमी'],
    'मार्गशीर्ष|शुक्ल|6': ['चंपा षष्ठी', 'स्कंद षष्ठी'],
    'मार्गशीर्ष|शुक्ल|11': ['गीता जयंती', 'वैकुंठ एकादशी'],
    'मार्गशीर्ष|शुक्ल|12': ['मत्स्य द्वादशी'],
    'मार्गशीर्ष|शुक्ल|15': ['दत्तात्रेय जयंती', 'अन्नपूर्णा जयंती'],
    'पौष|शुक्ल|7': ['गुरु गोबिंद सिंह जयंती'],
    'पौष|शुक्ल|15': ['शाकंभरी पूर्णिमा'],
    'माघ|कृष्ण|4': ['सकट चौथ'],
    'माघ|कृष्ण|15': ['मौनी अमावस्या'],
    'माघ|शुक्ल|1': ['माघ गुप्त नवरात्रि प्रारंभ'],
    'माघ|शुक्ल|4': ['गणेश जयंती'],
    'माघ|शुक्ल|7': ['रथ सप्तमी', 'नर्मदा जयंती'],
    'माघ|शुक्ल|8': ['भीष्म अष्टमी'],
    'माघ|शुक्ल|15': ['गुरु रविदास जयंती'],
    'फाल्गुन|कृष्ण|8': ['जानकी जयंती'],
    'फाल्गुन|शुक्ल|8': ['अन्नपूर्णा अष्टमी'],
    'फाल्गुन|शुक्ल|11': ['रंगभरी एकादशी'],
    'फाल्गुन|शुक्ल|15': ['लक्ष्मी जयंती'],
    'चैत्र|शुक्ल|1': ['उगादी', 'हिंदू नव वर्ष (विक्रम संवत {SAMVAT})'],
    'चैत्र|शुक्ल|3': ['गौरी पूजा', 'गणगौर', 'मत्स्य जयंती'],
    'चैत्र|शुक्ल|8': ['महाअष्टमी (दुर्गा अष्टमी)'],
    'चैत्र|शुक्ल|9': ['स्वामी नारायण जयंती'],
    'चैत्र|कृष्ण|7': ['शीतला सप्तमी'],
    'चैत्र|कृष्ण|8': ['शीतला अष्टमी', 'बसोड़ा'],
    'वैशाख|शुक्ल|3': ['मातंगी जयंती'],
    'वैशाख|शुक्ल|5': ['शंकराचार्य जयंती', 'सूरदास जयंती'],
    'वैशाख|शुक्ल|7': ['गंगा सप्तमी'],
    'वैशाख|शुक्ल|8': ['बगलामुखी जयंती'],
    'वैशाख|शुक्ल|9': ['सीता नवमी'],
    'वैशाख|शुक्ल|15': ['बुद्ध पूर्णिमा', 'कूर्म जयंती'],
    'ज्येष्ठ|कृष्ण|1': ['नारद जयंती'],
    'ज्येष्ठ|कृष्ण|15': ['वट सावित्री व्रत', 'शनि जयंती'],
    'ज्येष्ठ|शुक्ल|15': ['कबीरदास जयंती'],
    'आषाढ़|शुक्ल|1': ['आषाढ़ गुप्त नवरात्रि प्रारंभ'],
    'आषाढ़|शुक्ल|11': ['चातुर्मास प्रारंभ'],
    'आषाढ़|शुक्ल|15': ['व्यास पूजा'],
    'श्रावण|कृष्ण|15': ['हरियाली अमावस्या'],
    'श्रावण|शुक्ल|7': ['तुलसीदास जयंती'],
    'श्रावण|शुक्ल|15': ['गायत्री जयंती'],
    'भाद्रपद|कृष्ण|4': ['बहुला चौथ'],
    'भाद्रपद|कृष्ण|15': ['पोला', 'पिठोरी अमावस्या'],
    'भाद्रपद|शुक्ल|3': ['वराह जयंती'],
    'भाद्रपद|शुक्ल|5': ['ऋषि पंचमी'],
    'भाद्रपद|शुक्ल|8': ['राधा अष्टमी', 'महालक्ष्मी व्रत प्रारंभ'],
    'भाद्रपद|शुक्ल|12': ['वामन जयंती'],
    'भाद्रपद|शुक्ल|14': ['अनंत चतुर्दशी', 'गणेश विसर्जन'],
    'आश्विन|कृष्ण|1': ['पितृ पक्ष प्रारंभ (श्राद्ध प्रारंभ)'],
    'आश्विन|कृष्ण|8': ['जीवित्पुत्रिका व्रत (जितिया)'],
    'आश्विन|कृष्ण|15': ['सर्व पितृ अमावस्या', 'महालया अमावस्या'],
    'आश्विन|शुक्ल|1': ['घटस्थापना'],
    'आश्विन|शुक्ल|5': ['उपांग ललिता व्रत'],
    'आश्विन|शुक्ल|8': ['सरस्वती पूजा'],
    'आश्विन|शुक्ल|9': ['शारदीय नवरात्रि पारण'],
    'आश्विन|शुक्ल|15': ['कोजागरी पूजा', 'वाल्मीकि जयंती']
  };
  // Sankashti Chaturthi has a different name in each (purnimanta) month.
  const PCH_SANKASHTI = {
    'कार्तिक': 'वक्रतुंड', 'मार्गशीर्ष': 'गणाधिप', 'पौष': 'अखुरथ', 'माघ': 'लंबोदर', 'फाल्गुन': 'द्विजप्रिय', 'चैत्र': 'भालचंद्र',
    'वैशाख': 'विकट', 'ज्येष्ठ': 'एकदंत', 'आषाढ़': 'कृष्णपिंगल', 'श्रावण': 'गजानन', 'भाद्रपद': 'हेरंब', 'आश्विन': 'विघ्नराज'
  };
  // Observances that are judged by a DIFFERENT part of the day than the tithi's own key rule, or that
  // recur every month: each gets its own day-pick (rule) and merges onto the same date as the others.
  //   pri: 0 = festival, 1 = named vrat, 2 = monthly minor vrat (decides which name leads a day's list)
  const PCH_VRAT_SEP = [
    { id: 'अहोई', test: s => s.masa === 'कार्तिक' && s.pakshaShort === 'कृष्ण' && s.tithiNum === 8, label: 'अहोई अष्टमी', rule: 'pradosh', pri: 0 },
    { id: 'गोवत्स', test: s => s.masa === 'कार्तिक' && s.pakshaShort === 'कृष्ण' && s.tithiNum === 12, label: 'गोवत्स द्वादशी', rule: 'pradosh', pri: 1 },
    { id: 'परशुराम', test: s => s.masa === 'वैशाख' && s.pakshaShort === 'शुक्ल' && s.tithiNum === 3, label: 'परशुराम जयंती', rule: 'pradosh', pri: 0 },
    { id: 'नृसिंह', test: s => s.masa === 'वैशाख' && s.pakshaShort === 'शुक्ल' && s.tithiNum === 14, label: 'नृसिंह जयंती', rule: 'pradosh', pri: 0 },
    { id: 'कालाष्टमी', test: s => s.pakshaShort === 'कृष्ण' && s.tithiNum === 8, label: 'कालाष्टमी', rule: 'nishita', pri: 2 },
    { id: 'मासिक-शिवरात्रि', test: s => s.pakshaShort === 'कृष्ण' && s.tithiNum === 14, label: 'मासिक शिवरात्रि', rule: 'nishita', pri: 2 },
    { id: 'मासिक-दुर्गाष्टमी', test: s => s.pakshaShort === 'शुक्ल' && s.tithiNum === 8, label: 'मासिक दुर्गाष्टमी', rule: 'udaya', pri: 2 }
  ];
  const PCH_VRAT_RULE_DYN = {};            // pseudo-key -> rule (filled as SEP entries register)
  const PCH_PRADOSH_WD = ['रवि', 'सोम', 'भौम', 'बुध', 'गुरु', 'शुक्र', 'शनि'];
  const PCH_SANKRANTI = [
    ['मेष', 'मेष संक्रांति, बैसाखी'], ['वृषभ', 'वृषभ संक्रांति'], ['मिथुन', 'मिथुन संक्रांति'], ['कर्क', 'कर्क संक्रांति'],
    ['सिंह', 'सिंह संक्रांति'], ['कन्या', 'कन्या संक्रांति, विश्वकर्मा पूजा'], ['तुला', 'तुला संक्रांति'], ['वृश्चिक', 'वृश्चिक संक्रांति'],
    ['धनु', 'धनु संक्रांति'], ['मकर', 'मकर संक्रांति (पोंगल, उत्तरायण, माघ बिहू)'], ['कुम्भ', 'कुंभ संक्रांति'], ['मीन', 'मीन संक्रांति']
  ];
  // Fixed civil-date observances (month, day, name)
  const PCH_FIXED_DAYS = [
    [1, 12, 'स्वामी विवेकानंद जयंती, राष्ट्रीय युवा दिवस'], [1, 26, 'गणतंत्र दिवस'], [2, 19, 'छत्रपति शिवाजी महाराज जयंती'],
    [4, 14, 'डॉ. अंबेडकर जयंती'], [8, 15, 'स्वतंत्रता दिवस'], [10, 2, 'गांधी जयंती'], [12, 25, 'क्रिसमस']
  ];
  // Eclipses: instant of greatest eclipse (UTC). The civil date shown is that instant in the user's own
  // time zone. Whether it is visible from a given place is not worked out here.
  const PCH_ECLIPSES = [
    ['2027-02-06T16:00:00Z', 'सूर्य ग्रहण (कंकणाकृति)'], ['2027-02-20T22:13:00Z', 'चंद्र ग्रहण (उपच्छाया)'],
    ['2027-07-18T16:03:00Z', 'चंद्र ग्रहण (उपच्छाया)'], ['2027-08-02T10:07:00Z', 'सूर्य ग्रहण (पूर्ण)'],
    ['2027-08-17T07:14:00Z', 'चंद्र ग्रहण (उपच्छाया)']
  ];

  // Returns { sun, moon, tithi, masa, pakshaShort, tithiNum } for a given JD
  function pchPanchangSnapshotAt(jd) {
    const { sun, moon } = sunMoonLongitudes(jd);
    const tithi = getTithi(sun, moon);
    const masa = getPurnimantMasa(jd, tithi.index);
    const pakshaShort = tithi.paksha.replace(' पक्ष', '');
    const tithiNum = (tithi.index % 15) + 1; // 1-15 within the paksha
    return { sun, moon, tithi, masa, pakshaShort, tithiNum };
  }

  // Comma-separated names for a masa|paksha|tithi key (festival first, then extras, then the generic
  // vrat name for that tithi); null when the tithi carries nothing.
  function pchVratLabelFor(masa, pakshaShort, tithiNum) {
    const key = masa + '|' + pakshaShort + '|' + tithiNum;
    const base = VRAT_TYOHAR_MAP[key];
    const out = [];
    if (base) out.push(base);
    (PCH_VRAT_EXTRA[key] || []).forEach(function (x) { out.push(x); });
    if (tithiNum === 11 && !base) out.push('एकादशी (गयारस) व्रत');
    if (tithiNum === 15 && pakshaShort === 'शुक्ल' && !base) out.push(masa + ' पूर्णिमा');
    if (tithiNum === 15 && pakshaShort === 'कृष्ण' && !base) { out.push(masa + ' अमावस्या'); out.push('दर्श अमावस्या'); }
    if (tithiNum === 13) out.push('प्रदोष व्रत');                       // weekday name added once the date is known
    if (tithiNum === 4 && pakshaShort === 'कृष्ण') out.push((PCH_SANKASHTI[masa] ? PCH_SANKASHTI[masa] + ' ' : '') + 'संकष्टी चतुर्थी');
    if (tithiNum === 4 && pakshaShort === 'शुक्ल') out.push('विनायक चतुर्थी');
    return out.length ? out.join(', ') : null;
  }

  // Scans forward `daysAhead` calendar days (local, using PCH.tzOffsetMin —
  // defaults to IST 330 if location/tz hasn't resolved yet) and returns a
  // sorted array of upcoming vrat/tyohar events: { dateObj, label, masa, paksha, windows }
  // windows = [{ name, kind, start, end }] – the time window for each label (end null = a single instant)
  // (dateObj = UTC midnight of the local civil date, like the holiday events)
  // ── Sankranti helpers ──────────────────────────────────────────────────
  // Approximate local sunrise/sunset (minutes after local midnight) for a
  // local calendar date, from PCH.lat/lon. Falls back to 06:00 / 18:00 when
  // no location is set or the sun doesn't rise/set (polar).
  function pchApproxSunriseSetMin(y, m, d, tz) {
    if (!PCH || PCH.lat === null || PCH.lon === null) return { rise: 360, set: 1080 };
    const jd = julianDay(new Date(Date.UTC(y, m, d, 12, 0, 0) - tz * 60000)); // ~local noon
    const T = T_fromJD(jd);
    const L0 = norm360(280.46646 + 36000.76983 * T);
    const lam = sunLongitude(jd) * D2R, eps = 23.4393 * D2R;
    const ra = norm360(Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) * R2D);
    let eot = L0 - 0.0057183 - ra; eot = ((eot + 540) % 360) - 180; // degrees
    const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
    const latr = PCH.lat * D2R;
    const cosH = (Math.sin(-0.833 * D2R) - Math.sin(latr) * Math.sin(dec)) / (Math.cos(latr) * Math.cos(dec));
    if (cosH > 1 || cosH < -1) return { rise: 360, set: 1080 };
    const H = Math.acos(cosH) * R2D;
    const noon = 720 - 4 * PCH.lon - 4 * eot + tz; // local solar noon, minutes
    return { rise: noon - 4 * H, set: noon + 4 * H };
  }
  // Exact JD at which the Sun enters sidereal मकर or कर्क in the given
  // Gregorian year (null if not found).
  // Every instant in [fromJD, toJD) at which the Sun enters sidereal `rashi`
  // (1-day scan, then 40-round bisection of each crossing).
  function pchSankrantiCrossings(rashi, fromJD, toJD) {
    const found = [];
    let cur = fromJD;
    let prevR = getSuryaRashi(sunLongitude(cur), cur);
    while (cur < toJD) {
      const next = cur + 1;
      const curR = getSuryaRashi(sunLongitude(next), next);
      if (curR === rashi && prevR !== rashi) {
        let lo = cur, hi = next;
        for (let b = 0; b < 40; b++) {
          const mid = (lo + hi) / 2;
          if (getSuryaRashi(sunLongitude(mid), mid) === rashi) hi = mid; else lo = mid;
        }
        found.push(hi);
      }
      prevR = curR; cur = next;
    }
    return found;
  }
  function pchFindSankrantiJD(year, rashi) {
    const from = julianDay(new Date(Date.UTC(year, rashi === 'मकर' ? 0 : 5, rashi === 'मकर' ? 1 : 25)));
    const found = pchSankrantiCrossings(rashi, from, from + 45);
    return found.length ? found[0] : null;
  }
  // Panchang observance day for a Sankranti instant (jd), as a local {y,m,d}:
  //  • मकर: Punya Kaal runs FORWARD from the moment, so if the Sun enters
  //    after local sunset the observance moves to the next day (e.g. 2027:
  //    moment 21:1x IST on 14 Jan -> observed Fri 15 Jan).
  //  • कर्क: Punya Kaal is the period BEFORE the moment, so if the Sun enters
  //    before local sunrise the observance is the previous day.
  function pchSankrantiObservedDay(jd, rashi, tz) {
    const loc = new Date(toDate(jd).getTime() + tz * 60000);
    const y = loc.getUTCFullYear(), m = loc.getUTCMonth(), d = loc.getUTCDate();
    const minOfDay = loc.getUTCHours() * 60 + loc.getUTCMinutes() + loc.getUTCSeconds() / 60;
    const sr = pchApproxSunriseSetMin(y, m, d, tz);
    let shift = 0;
    if (rashi === 'मकर' && minOfDay >= sr.set) shift = 1;
    else if (rashi === 'कर्क' && minOfDay < sr.rise) shift = -1;
    const dt = new Date(Date.UTC(y, m, d + shift));
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
  }

  /* ── Which part of the day decides the date of each observance ──────────
     A tithi can span two civil days, so "which day?" depends on the observance:
       udaya     – tithi at sunrise (most vrats; Ekadashi, Purnima, Navratri …)
       pradosh   – tithi during Pradosh (sunset → +2h24m): Dhanteras, Choti
                   Diwali, Diwali (Lakshmi Pujan), Pradosh Vrat
       nishita   – tithi at midnight: Janmashtami, Mahashivratri
       moonrise  – tithi at moonrise: Karva Chauth, Sankashti Chaturthi
       madhyahna – tithi at midday: Ram Navami, Ganesh/Vinayaka Chaturthi,
                   Akshaya Tritiya
       aparahna  – tithi in the afternoon: Vijayadashami (Dussehra)
     Holika Dahan is a Pradosh festival with an extra Bhadra check (see
     pchHolikaBhadraShift); Holi (Dhulandi) is simply the day after Dahan. */
  const PCH_VRAT_RULE_BY_KEY = {
    'कार्तिक|कृष्ण|13': 'pradosh',     // धनतेरस
    'कार्तिक|कृष्ण|14': 'pradosh',     // नरक चतुर्दशी (छोटी दीपावली)
    'कार्तिक|कृष्ण|15': 'pradosh',     // दीपावली
    'फाल्गुन|शुक्ल|15': 'pradosh',     // होलिका दहन (+ भद्रा जाँच)
    'भाद्रपद|कृष्ण|8': 'nishita',      // जन्माष्टमी
    'फाल्गुन|कृष्ण|14': 'nishita',     // महाशिवरात्रि
    'कार्तिक|कृष्ण|4': 'moonrise',     // करवा चौथ
    'चैत्र|शुक्ल|9': 'madhyahna',      // राम नवमी
    'वैशाख|शुक्ल|3': 'madhyahna',      // अक्षय तृतीया
    'भाद्रपद|शुक्ल|4': 'madhyahna',    // गणेश चतुर्थी
    'आश्विन|शुक्ल|10': 'aparahna'      // विजयादशमी
  };
  // If the tithi covers the observance window on two consecutive days, the later
  // day is taken for these (Diwali family); everything else takes the earlier day.
  const PCH_VRAT_LATE_TIE = { 'कार्तिक|कृष्ण|13': 1, 'कार्तिक|कृष्ण|14': 1, 'कार्तिक|कृष्ण|15': 1 };

  function pchVratRuleFor(key, pakshaShort, tithiNum) {
    if (PCH_VRAT_RULE_DYN[key]) return PCH_VRAT_RULE_DYN[key];
    if (PCH_VRAT_RULE_BY_KEY[key]) return PCH_VRAT_RULE_BY_KEY[key];
    if (VRAT_TYOHAR_MAP[key]) return 'udaya';                       // named festival without a special rule
    if (tithiNum === 13) return 'pradosh';                          // generic प्रदोष व्रत
    if (tithiNum === 4) return pakshaShort === 'कृष्ण' ? 'moonrise' : 'madhyahna';   // संकष्टी / विनायक
    return 'udaya';
  }

  // Vishti-karana (Bhadra) runs that overlap [jdFrom, jdTo], as [{ start, end }] (JD).
  // The scan is widened by 14 h each side (a Vishti karana lasts ≤ ~14 h) so a run that
  // is already on, or still on, at the edge of the window is returned whole.
  function pchVishtiRunsBetween(jdFrom, jdTo) {
    const step = 10 / 1440, a = jdFrom - 14 / 24, b = jdTo + 14 / 24;
    const isV = function (jd) { return isVishtiKaranaIdx(karanaIndexAt(jd)); };
    const edge = function (outJD, inJD) {            // bisect the instant the state flips
      let lo = outJD, hi = inJD;
      const inState = isV(inJD);
      for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (isV(mid) === inState) hi = mid; else lo = mid; }
      return (lo + hi) / 2;
    };
    const runs = [];
    let prevJD = a, prevV = isV(a), start = prevV ? a : null;
    for (let jd = a + step; jd <= b + 1e-9; jd += step) {
      const v = isV(jd);
      if (v && !prevV) start = edge(prevJD, jd);
      if (!v && prevV) { runs.push({ start: start, end: edge(jd, prevJD) }); start = null; }
      prevJD = jd; prevV = v;
    }
    return runs.filter(function (r) { return r.end > jdFrom && r.start < jdTo; });
  }

  // Holika Dahan must not be lit in Bhadra. For the civil day D that has Purnima at
  // Pradosh, returns 0 if Dahan stays on D, or 1 if it moves to the next evening:
  //   • no Bhadra during Pradosh                       → D
  //   • Bhadra over before midnight                    → D (lit after Bhadra ends)
  //   • Bhadra runs past midnight but its Punchha
  //     (65–75 % of the Bhadra span) falls between
  //     sunset and midnight                            → D (lit in Bhadra Punchha)
  //   • otherwise (Bhadra blocks the whole first night) → next day's Pradosh, even if
  //     Purnima has just ended by then (e.g. 2023, 2026).
  // Also returns the Dahan time window { kind, start, end } (JD):
  //   no Bhadra → Pradosh (caller clips it to Purnima); after Bhadra → Bhadra end to
  //   midnight (to Pradosh end if Bhadra ends inside Pradosh); Punchha → the Punchha
  //   span inside sunset–midnight; next evening → that day's Pradosh.
  function pchHolikaBhadraShift(y, m, D, tz) {
    const sr = pchApproxSunriseSetMin(y, m, D, tz), sn = pchApproxSunriseSetMin(y, m, D + 1, tz);
    const jdAt = function (min) { return julianDay(new Date(Date.UTC(y, m, D) + (min - tz) * 60000)); };
    const pStart = jdAt(sr.set), pEnd = jdAt(sr.set + 144), midnight = jdAt((sr.set + 1440 + sn.rise) / 2);
    let run = null;
    pchVishtiRunsBetween(pStart, midnight + 0.2).forEach(function (r) {
      if (r.end > pStart && r.start < pEnd) run = r;
    });
    const KIND = 'दहन मुहूर्त';
    if (!run) return { shift: 0, plain: true, win: { kind: KIND, start: pStart, end: pEnd } };
    if (run.end <= midnight) {
      return { shift: 0, win: { kind: KIND + ' (भद्रा समाप्त होने पर)', start: run.end, end: run.end < pEnd ? pEnd : midnight } };
    }
    const len = run.end - run.start;
    const punchhaStart = run.start + 0.65 * len, punchhaEnd = run.start + 0.75 * len;
    if (punchhaEnd > pStart && punchhaStart < midnight) {
      return { shift: 0, win: { kind: KIND + ' (भद्रा पुच्छ)', start: Math.max(punchhaStart, pStart), end: Math.min(punchhaEnd, midnight) } };
    }
    const next = pchApproxSunriseSetMin(y, m, D + 1, tz);
    const jdNext = function (min) { return julianDay(new Date(Date.UTC(y, m, D + 1) + (min - tz) * 60000)); };
    return { shift: 1, win: { kind: KIND, start: jdNext(next.set), end: jdNext(next.set + 144) } };
  }

  // Start/end JD of the tithi that is running at jd (30-min walk, then bisection).
  function pchTithiSpanAround(jd) {
    const idx = tithiIndexAt(jd), step = 30 / 1440;
    const edge = function (inJD, outJD) {
      let lo = inJD, hi = outJD;
      for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (tithiIndexAt(mid) === idx) lo = mid; else hi = mid; }
      return (lo + hi) / 2;
    };
    let start = jd - 1, end = jd + 1, a = jd;
    for (let i = 0; i < 60; i++) { const n = a - step; if (tithiIndexAt(n) !== idx) { start = edge(a, n); break; } a = n; }
    a = jd;
    for (let i = 0; i < 60; i++) { const n = a + step; if (tithiIndexAt(n) !== idx) { end = edge(a, n); break; } a = n; }
    return { start: start, end: end };
  }

  // The time window that matters for a picked festival, by its rule:
  //   udaya → the tithi's own span;  pradosh / madhyahna / aparahna → that part of the
  //   day clipped to the tithi;  nishita → ±24 min around midnight;  moonrise → the
  //   moonrise instant. Falls back to the tithi span if the window and tithi don't overlap.
  function pchVratWindowFor(h, y, m, baseDay, tz) {
    if (h.win) return h.win;
    if (h.ref === undefined) return null;
    const rule = pchVratRuleFor(h.key, h.snap.pakshaShort, h.snap.tithiNum);
    const D = baseDay + h.d;
    const sr = pchApproxSunriseSetMin(y, m, D, tz), sn = pchApproxSunriseSetMin(y, m, D + 1, tz);
    const jdAt = function (min) { return julianDay(new Date(Date.UTC(y, m, D) + (min - tz) * 60000)); };
    const span = pchTithiSpanAround(h.ref), day = sr.set - sr.rise;
    const clip = function (a, b, kind) {
      const st = Math.max(a, span.start), en = Math.min(b, span.end);
      return en > st ? { kind: kind, start: st, end: en } : null;
    };
    let w = null;
    if (rule === 'pradosh') w = clip(jdAt(sr.set), jdAt(sr.set + 144), 'प्रदोष काल');
    else if (rule === 'madhyahna') w = clip(jdAt(sr.rise + day * 0.4), jdAt(sr.rise + day * 0.6), 'मध्याह्न काल');
    else if (rule === 'aparahna') w = clip(jdAt(sr.rise + day * 0.6), jdAt(sr.rise + day * 0.8), 'अपराह्न काल');
    else if (rule === 'nishita') { const mid = (sr.set + 1440 + sn.rise) / 2; w = { kind: 'निशीथ काल', start: jdAt(mid - 24), end: jdAt(mid + 24) }; }
    else if (rule === 'moonrise') w = { kind: 'चंद्रोदय', start: h.ref, end: null };
    return w || { kind: 'तिथि', start: span.start, end: span.end };
  }

  // Moonrise (minutes after local midnight) for a local civil date, or null.
  function pchMoonriseLocalMin(y, m, d, tz) {
    if (!PCH || PCH.lat === null || PCH.lon === null) return null;
    const jdMid = julianDay(new Date(Date.UTC(y, m, d) - tz * 60000));
    const r = findMoonRiseSet(jdMid, PCH.lat, PCH.lon);
    return r && r.riseJD ? (r.riseJD - jdMid) * 1440 : null;
  }

  // Tithi the observance is based on: the snapshot's tithi when we have one, else derived from the
  // festival key ("masa|paksha|number"), e.g. the derived Holi (Dhulandi) entry.
  function pchVratTithiName(h) {
    if (h.snap && h.snap.tithi) return h.snap.tithi.name;
    const parts = String(h.key).split('|');
    return TITHI_NAMES[(parts[1] === 'कृष्ण' ? 15 : 0) + (+parts[2]) - 1] || '';
  }

  function pchBuildVratTyoharList(daysAhead, startYMD) { // startYMD (optional): local {y,m,d} to start from instead of today
    const tz = (PCH && PCH.tzOffsetMin) || 330;
    const now = (PCH && PCH.customDateTime) || new Date();
    const localNow = new Date(now.getTime() + tz * 60000);
    const y = startYMD ? startYMD.y : localNow.getUTCFullYear(), m = startYMD ? startYMD.m : localNow.getUTCMonth(), baseDay = startYMD ? startYMD.d : localNow.getUTCDate();

    // Keyed by local "y-m-d" so a Sankranti and a Tithi-based Vrat/Tyohar
    // that land on the same calendar day get merged into one entry
    // (e.g. "जगन्नाथ रथ यात्रा, कर्क संक्रांति") instead of two list items.
    const byDate = {};

    // For every civil day, sample the panchang at the moments that matter for each rule
    // (sunrise/midday, Pradosh, midnight, moonrise, afternoon) using the location's real
    // sunrise/sunset — not a fixed 06:00 — and score each festival key per day.
    // Scan 2 days before the range and 1 after it so a tithi straddling the edge is
    // judged against the same neighbouring days as everywhere else.
    const hits = {};   // key -> [{ d, score, snap, label }]
    const register = function (key, label, r, pri, d, snap, rule, weight, jd) {
      // A key sampled by the wrong rule only registers a faint fallback presence
      // (used when its own window is skipped entirely by a very short tithi).
      const w = (r === rule) ? weight : 0.01;
      const arr = hits[key] || (hits[key] = []);
      let h = null;
      for (let i = 0; i < arr.length; i++) if (arr[i].d === d) { h = arr[i]; break; }
      if (!h) { h = { d: d, score: 0, snap: snap, label: label, key: key, pri: pri }; arr.push(h); }
      h.score += w;
      if (h.refW === undefined || w > h.refW) { h.refW = w; h.ref = jd; }   // instant used later to find the tithi span / window
    };
    const addHit = function (d, snap, rule, weight, jd) {
      const key = snap.masa + '|' + snap.pakshaShort + '|' + snap.tithiNum;
      const label = pchVratLabelFor(snap.masa, snap.pakshaShort, snap.tithiNum);
      if (label) register(key, label, pchVratRuleFor(key, snap.pakshaShort, snap.tithiNum), undefined, d, snap, rule, weight, jd);
      PCH_VRAT_SEP.forEach(function (sp) {
        if (!sp.test(snap)) return;
        const pk = sp.id + '#' + snap.masa;                 // one cluster per month for the monthly ones
        PCH_VRAT_RULE_DYN[pk] = sp.rule;
        register(pk, sp.label, sp.rule, sp.pri, d, snap, rule, weight, jd);
      });
    };
    const nakDays = [];                                      // nakshatra-based observances (Thai Pusam, Onam)

    for (let d = -2; d <= daysAhead + 8; d++) {
      const D = baseDay + d;
      const sr = pchApproxSunriseSetMin(y, m, D, tz);
      const sn = pchApproxSunriseSetMin(y, m, D + 1, tz);
      const span = sr.set - sr.rise;
      const sample = function (rule, mins, weight) {
        mins.forEach(function (min) {
          const jd = julianDay(new Date(Date.UTC(y, m, D) + (min - tz) * 60000));
          addHit(d, pchPanchangSnapshotAt(jd), rule, weight, jd);
        });
      };

      // udaya: sunrise counts fully, midday half (rescues a tithi that never touches a sunrise)
      sample('udaya', [sr.rise], 1);
      sample('udaya', [sr.rise + span * 0.5], 0.5);
      // nakshatra at sunrise: Thai Pusam (Pushya, Sun in Makara, near Purnima) and Onam (Shravana, Sun in Simha, Bhadrapada Shukla)
      if (d >= 0 && d <= daysAhead) {
        const jdSr = julianDay(new Date(Date.UTC(y, m, D) + (sr.rise - tz) * 60000));
        const nk = nakshatraIndexAt(jdSr);
        if (nk === 7 || nk === 21) {
          const ri = suryaRashiIndexAt(jdSr), sn0 = pchPanchangSnapshotAt(jdSr), ti = tithiIndexAt(jdSr);
          if (nk === 7 && ri === 9 && ti >= 11 && ti <= 17) nakDays.push({ d: d, label: 'थाई पूसम', snap: sn0 });
          if (nk === 21 && ri === 4 && sn0.masa === 'भाद्रपद' && sn0.pakshaShort === 'शुक्ल') nakDays.push({ d: d, label: 'ओणम (थिरुवोणम)', snap: sn0 });
        }
      }
      // madhyahna / aparahna: 40–60% / 60–80% of the daylight
      sample('madhyahna', [sr.rise + span * 0.4, sr.rise + span * 0.5, sr.rise + span * 0.6], 1);
      sample('aparahna', [sr.rise + span * 0.6, sr.rise + span * 0.7, sr.rise + span * 0.8], 1);
      // pradosh: from sunset for 2h24m
      sample('pradosh', [sr.set + 1, sr.set + 36, sr.set + 72, sr.set + 108, sr.set + 143], 1);
      // nishita: around the middle of the night
      const mid = (sr.set + 1440 + sn.rise) / 2;
      sample('nishita', [mid - 24, mid, mid + 24], 1);
      // moonrise: only worth locating when Krishna Chaturthi is possible that evening
      const ti = function (min) { return tithiIndexAt(julianDay(new Date(Date.UTC(y, m, D) + (min - tz) * 60000))); };
      if (ti(sr.set) === 18 || ti(sr.set + 300) === 18) {
        const mr = pchMoonriseLocalMin(y, m, D, tz);
        sample('moonrise', [mr !== null ? mr + 1 : sr.set + 150], 1);
      }
    }

    // One date per occurrence: group consecutive days of the same key, keep the best-scoring day.
    const picked = [];
    const HOLIKA_KEY = 'फाल्गुन|शुक्ल|15', HOLI_KEY = 'चैत्र|कृष्ण|1';
    const holikaDays = [];                       // every Holika Dahan in range (a long range spans two years)
    delete hits[HOLI_KEY];                       // Holi is derived from Dahan below, not from its own tithi
    Object.keys(hits).forEach(function (key) {
      const arr = hits[key].sort(function (a, b) { return a.d - b.d; });
      const lateTie = !!PCH_VRAT_LATE_TIE[key];
      let cluster = [];
      const flush = function () {
        if (!cluster.length) return;
        let best = cluster[0];
        cluster.forEach(function (h) {
          if (h.score > best.score + 1e-9 || (lateTie && Math.abs(h.score - best.score) <= 1e-9 && h.d > best.d)) best = h;
        });
        if (key === HOLIKA_KEY && best.score >= 1) {       // Purnima really is at Pradosh → run the Bhadra check
          const info = pchHolikaBhadraShift(y, m, baseDay + best.d, tz);
          const win = { kind: info.win.kind, start: info.win.start, end: info.win.end };
          if (info.plain) {                                // no Bhadra: Dahan only while Purnima lasts
            const sp = pchTithiSpanAround(best.ref);
            win.start = Math.max(win.start, sp.start); win.end = Math.min(win.end, sp.end);
          }
          best = { d: best.d + info.shift, score: best.score, snap: best.snap, label: best.label, key: best.key, ref: best.ref, win: win };
        }
        if (key === HOLIKA_KEY) holikaDays.push(best.d);
        const pushIf = function (o) { if (o.d >= 0 && o.d <= daysAhead) picked.push(o); };
        const snapOnDay = function (dd) {
          const sr = pchApproxSunriseSetMin(y, m, baseDay + dd, tz);
          return pchPanchangSnapshotAt(julianDay(new Date(Date.UTC(y, m, baseDay + dd) + (sr.rise - tz) * 60000)));
        };
        const dowOf = function (dd) { return new Date(Date.UTC(y, m, baseDay + dd)).getUTCDay(); };
        if (best.score >= 0.5) {
          // Varalakshmi Vratam: the Friday on/before Shravana Purnima
          if (key === 'श्रावण|शुक्ल|15') { const dd = best.d - ((dowOf(best.d) - 5 + 7) % 7); pushIf({ d: dd, score: 1, key: key + '@वरलक्ष्मी', label: 'वरलक्ष्मी व्रत', snap: snapOnDay(dd), pri: 0 }); }
          // Vaishnava Janmashtami: the day on which Ashtami also holds at sunrise (Udaya Ashtami)
          if (key === 'भाद्रपद|कृष्ण|8') {
            const srN = pchApproxSunriseSetMin(y, m, baseDay + best.d + 1, tz);
            const jdN = julianDay(new Date(Date.UTC(y, m, baseDay + best.d + 1) + (srN.rise - tz) * 60000));
            if (tithiIndexAt(jdN) === 22) { const dd = best.d + 1; pushIf({ d: dd, score: 1, key: key + '@वैष्णव', label: 'वैष्णव श्री कृष्ण जन्माष्टमी', snap: snapOnDay(dd), pri: 0 }); }
          }
          // Dahi Handi: the day after Janmashtami
          if (key === 'भाद्रपद|कृष्ण|8') { const dd = best.d + 1; pushIf({ d: dd, score: 1, key: key + '@दही-हांडी', label: 'दही हांडी', snap: snapOnDay(dd), pri: 1 }); }
          // Vaishnava Ekadashi (separate next-day entry) intentionally NOT shown: each Ekadashi appears once, on the
          // Smarta/udaya day. (Vaishnava Janmashtami above is kept.)
        }
        pushIf(best);
        cluster = [];
      };
      arr.forEach(function (h) {
        if (cluster.length && h.d - cluster[cluster.length - 1].d > 2) flush();
        cluster.push(h);
      });
      flush();
    });
    nakDays.forEach(function (n) { picked.push({ d: n.d, score: 1, key: 'नक्षत्र@' + n.label, label: n.label, snap: n.snap, pri: 0 }); });
    // Holi (Dhulandi / रंगों वाली होली) is the day after Holika Dahan
    holikaDays.forEach(function (hd) {
      if (hd + 1 >= 0 && hd + 1 <= daysAhead) {
        picked.push({ d: hd + 1, score: 1, key: HOLI_KEY, label: VRAT_TYOHAR_MAP[HOLI_KEY], snap: { masa: 'चैत्र', pakshaShort: 'कृष्ण' } });
      }
    });
    picked.sort(function (a, b) { return a.d - b.d || (a.key < b.key ? -1 : 1); });
    picked.forEach(function (h) {
      // dateObj = UTC midnight of the LOCAL civil date, so getUTCDate()/getUTCMonth()/getUTCDay()
      // read the right day for any time zone (the old "local 06:00 instant" named the wrong
      // day for zones ahead of UTC+6 / behind UTC-18, e.g. Singapore).
      const civil = new Date(Date.UTC(y, m, baseDay + h.d));
      const dateKey = civil.getUTCFullYear() + '-' + civil.getUTCMonth() + '-' + civil.getUTCDate();
      byDate[dateKey] = byDate[dateKey] || { dateObj: civil, labels: [], pris: [], windows: [], masa: h.snap.masa, paksha: h.snap.pakshaShort, tithi: pchVratTithiName(h) };
      // final text: weekday-named Pradosh, Somvati Amavasya, Vikram Samvat year
      const dow = civil.getUTCDay();
      let text = h.label.replace('{SAMVAT}', String(civil.getUTCFullYear() + 57));
      text = text.replace(/(^|, )प्रदोष व्रत/, '$1' + PCH_PRADOSH_WD[dow] + ' प्रदोष व्रत');
      const plainKey = String(h.key).indexOf('#') < 0 && String(h.key).indexOf('@') < 0;
      if (plainKey && h.snap && h.snap.pakshaShort === 'कृष्ण' && h.snap.tithiNum === 15 && dow === 1) text += ', सोमवती अमावस्या';
      // lead name: festivals (0) first, then named vrats (1), then monthly minor vrats (2)
      const tn = h.snap && h.snap.tithiNum;
      const pri = h.pri !== undefined ? h.pri
        : ((VRAT_TYOHAR_MAP[h.key] || PCH_VRAT_EXTRA[h.key]) && tn !== 11 ? 0 : ((tn === 11 || tn === 15 || tn === 4) ? 1 : 2));
      if (byDate[dateKey].leadPri === undefined || pri < byDate[dateKey].leadPri) {
        byDate[dateKey].leadPri = pri;
        byDate[dateKey].masa = h.snap.masa; byDate[dateKey].paksha = h.snap.pakshaShort; byDate[dateKey].tithi = pchVratTithiName(h);
      }
      byDate[dateKey].labels.push(text);
      byDate[dateKey].pris.push(pri);
      const w = pchVratWindowFor(h, y, m, baseDay, tz);
      if (w) byDate[dateKey].windows.push({ name: text.split(', ')[0], kind: w.kind, start: toDate(w.start), end: w.end ? toDate(w.end) : null });
    });

    // Solar Sankranti — Sun entering sidereal मकर or कर्क rashi. Found via
    // precise bisection of the exact crossing instant (rather than a fixed
    // 06:00 daily sample), then attributed to whichever local calendar date
    // that instant actually falls on, then shifted by the Panchang
    // sunrise/sunset rule in pchSankrantiObservedDay (मकर after sunset ->
    // next day; कर्क before sunrise -> previous day).
    const jdRangeStart = julianDay(new Date(Date.UTC(y, m, baseDay, 6, 0, 0) - tz * 60000)) - 1;
    const jdRangeEnd = jdRangeStart + daysAhead + 2;
    const rangeStartUTC = Date.UTC(y, m, baseDay);
    const inRange = function (utcMidnight) { const n = Math.round((utcMidnight - rangeStartUTC) / 86400000); return n >= 0 && n <= daysAhead; };
    const entryFor = function (civil) {              // civil = UTC midnight of the local date
      const dk = civil.getUTCFullYear() + '-' + civil.getUTCMonth() + '-' + civil.getUTCDate();
      if (!byDate[dk]) {
        const sr = pchApproxSunriseSetMin(civil.getUTCFullYear(), civil.getUTCMonth(), civil.getUTCDate(), tz);
        const sn = pchPanchangSnapshotAt(julianDay(new Date(civil.getTime() + (sr.rise - tz) * 60000)));
        byDate[dk] = { dateObj: civil, labels: [], pris: [], windows: [], masa: sn.masa, paksha: sn.pakshaShort, tithi: sn.tithi.name };
      }
      return byDate[dk];
    };
    PCH_SANKRANTI.forEach(function (entry) {
      const rashi = entry[0], label = entry[1];
      const spri = (rashi === 'मकर' || rashi === 'मेष') ? -1 : 1;
      const seen = {};
      pchSankrantiCrossings(rashi, jdRangeStart, jdRangeEnd).forEach(function (hi) {
        const crossLocal = new Date(toDate(hi).getTime() + tz * 60000);
        const yr = crossLocal.getUTCFullYear();
        if (seen[yr]) return;
        seen[yr] = true;
        const obs = pchSankrantiObservedDay(hi, rashi, tz);   // मकर after sunset -> next day; कर्क before sunrise -> previous day
        const dateOnly = new Date(Date.UTC(obs.y, obs.m, obs.d));
        if (!inRange(dateOnly.getTime())) return;
        const e = entryFor(dateOnly);
        e.labels.push(label); e.pris.push(spri);
        e.windows.push({ name: label.split(', ')[0].replace(/\s*\(.*$/, ''), kind: 'संक्रमण', start: toDate(hi), end: null });
        if (rashi === 'मकर') {                                 // Lohri / Bhogi Pongal the day before, Mattu Pongal the day after
          [[-1, 'लोहड़ी, भोगी पोंगल'], [1, 'मट्टू पोंगल']].forEach(function (dv) {
            const c = new Date(Date.UTC(obs.y, obs.m, obs.d + dv[0]));
            if (!inRange(c.getTime())) return;
            const e2 = entryFor(c); e2.labels.push(dv[1]); e2.pris.push(0);
          });
        }
      });
    });
    // Fixed civil-date observances
    for (let d = 0; d <= daysAhead; d++) {
      const c = new Date(Date.UTC(y, m, baseDay + d));
      PCH_FIXED_DAYS.forEach(function (f) {
        if (c.getUTCMonth() + 1 === f[0] && c.getUTCDate() === f[1]) { const e = entryFor(c); e.labels.push(f[2]); e.pris.push(0); }
      });
    }
    // Eclipses — civil date of the greatest-eclipse instant in the user's own time zone
    PCH_ECLIPSES.forEach(function (ec) {
      const t = new Date(ec[0]);
      const l = new Date(t.getTime() + tz * 60000);
      const c = new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()));
      if (!inRange(c.getTime())) return;
      const e = entryFor(c);
      e.labels.push(ec[1]); e.pris.push(1);
      e.windows.push({ name: ec[1].replace(/\s*\(.*$/, ''), kind: 'ग्रहण मध्य', start: t, end: null });
    });

    const events = Object.keys(byDate).map(function (k) {
      const e = byDate[k];
      const order = e.labels.map(function (t, i) { return i; }).sort(function (a, b) { return (e.pris[a] - e.pris[b]) || (a - b); });
      return { dateObj: e.dateObj, label: order.map(function (i) { return e.labels[i]; }).join(', '), masa: e.masa, paksha: e.paksha, tithi: e.tithi, windows: e.windows };
    });
    events.sort((a, b) => a.dateObj - b.dateObj);
    return events;
  }

  // "प्रदोष काल: 5:42 PM – 8:06 PM" lines for an event; endpoints on another civil day get a date prefix.
  function pchVratWinHTML(ev) {
    const wins = (ev.windows || []).filter(Boolean);
    if (!wins.length) return '';
    const tz = (PCH && PCH.tzOffsetMin) || 330, civil = ev.dateObj;
    const loc = function (date) { return new Date(date.getTime() + tz * 60000); };
    const sameDay = function (a, b) { return a.getUTCDate() === b.getUTCDate() && a.getUTCMonth() === b.getUTCMonth(); };
    const hm = function (l) { const h = l.getUTCHours(); return ((h % 12) || 12) + ':' + pad2(l.getUTCMinutes()) + (h >= 12 ? ' PM' : ' AM'); };
    const dm = function (l) { return l.getUTCDate() + ' ' + MONTH_NAMES_HI[l.getUTCMonth()].slice(0, 3) + ' '; };
    // start gets a date only if it is not on the festival's own day; end only if it is not on the start's day
    const text = function (w) {
      const a = loc(w.start);
      let t = (sameDay(a, civil) ? '' : dm(a)) + hm(a);
      if (w.end) { const b = loc(w.end); t += ' – ' + (sameDay(b, a) ? '' : dm(b)) + hm(b); }
      return t;
    };
    return wins.map(function (w) {
      const who = wins.length > 1 ? w.name.replace(/\s*\([^)]*\)/g, '') + ' · ' : '';
      return '<div class="vrat-win"><span class="vrat-win-ico" aria-hidden="true">⏱</span><span>' + who + w.kind + ': ' + text(w) + '</span></div>';
    }).join('');
  }

  // Tag for a Vrat/Tyohar or holiday item:
  //   "अभी" – the viewed instant (selected date/time, else live now) lies inside one of the event's time windows
  //           (e.g. प्रदोष काल, निशीथ काल, दहन मुहूर्त);
  //   "आज"  – the event is on the viewed civil date but its window has not started / has ended, or it has no
  //           window (all-day holidays, single-instant events such as Sankranti or moonrise).
  // ev.dateObj = UTC midnight of the event's local civil date.
  function pchEvTag(ev) {
    const tz = (PCH && PCH.tzOffsetMin) || 330;
    const now = (PCH && PCH.customDateTime) ? PCH.customDateTime : new Date();
    const l = new Date(now.getTime() + tz * 60000);
    const d = ev.dateObj;
    if (d.getUTCFullYear() !== l.getUTCFullYear() || d.getUTCMonth() !== l.getUTCMonth() || d.getUTCDate() !== l.getUTCDate()) return '';
    const live = (ev.windows || []).some(function (w) { return w && w.end && now >= w.start && now < w.end; });
    return '<span class="pch-muhurt-nowtag">' + (live ? 'अभी' : 'आज') + '</span>';
  }

  function pchVratItemHTML(ev) {
    const d = ev.dateObj;
    const dayNum = d.getUTCDate();
    const monthShort = MONTH_NAMES_HI[d.getUTCMonth()].slice(0, 3);
    const weekday = WEEKDAY_NAMES[d.getUTCDay()];
    return '<div class="vrat-item">'
      + '<div class="vrat-date-badge"><span class="vrat-date-num">' + dayNum + '</span><span class="vrat-date-mon">' + monthShort + '</span></div>'
      + '<div class="vrat-info"><div class="vrat-name">' + ev.label + pchEvTag(ev) + '</div>'
      + '<div class="vrat-sub">' + weekday + ' · ' + ev.masa + ' ' + ev.paksha + ' पक्ष' + (ev.tithi ? ' · ' + ev.tithi : '') + '</div>' + pchVratWinHTML(ev) + '</div>'
      + '</div>';
  }

  // Vrat/Tyohar and holiday lists run up to this date (inclusive); after it they
  // fall back to the end of the current year. It tracks how far the hand-entered
  // HOL_* tables further down (India Post, Islamic, state festivals) reach —
  // add the next year's rows to those tables BEFORE moving this date, or the
  // later part of the list will silently be missing those holidays.
  // Calendar / Vrat-Tyohar / Public-Holiday lists always cover a rolling window:
  // the current month + the next two months (last day of month+2 is the end).
  function pchWindowEndUTC(y, m) { return Date.UTC(y, m + 3, 0); }
  function pchVratDaysAhead(localNow) {
    const todayUtc = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate());
    const endUtc = pchWindowEndUTC(localNow.getUTCFullYear(), localNow.getUTCMonth());
    return Math.max(1, Math.round((endUtc - todayUtc) / 86400000));
  }

  let PCH_VRAT_EVENTS = [];
  let pchVratRenderedKey = null;   // see the cache check in pchRunCalculation

  window.pchRenderVratTyohar = function pchRenderVratTyohar() {
    const tz = (PCH && PCH.tzOffsetMin) || 330;
    const nowBase = (PCH && PCH.customDateTime) ? PCH.customDateTime.getTime() : Date.now();
    const localNow = new Date(nowBase + tz * 60000);
    const daysAhead = Math.max(45, pchVratDaysAhead(localNow)); // always enough runway for at least 5 upcoming events
    PCH_VRAT_EVENTS = pchBuildVratTyoharList(daysAhead);
    const listEl = document.getElementById('pch-vrat-list');
    if (!listEl) return;
    const upcoming = PCH_VRAT_EVENTS.slice(0, 3);
    listEl.innerHTML = upcoming.length
      ? upcoming.map(pchVratItemHTML).join('')
      : '<div style="padding:10px 2px; color:var(--ink-soft); font-size:13px;">कोई आगामी व्रत-त्योहार नहीं मिला।</div>';
  };

  // Full list shows ONE calendar month at a time (1st .. last day), starting with the
  // current month. Navigation bounds are the same as the calendar's.
  const pchVratMon = { y: 0, m: 0, swipeBound: false };

  function pchVratMonthEvents(y, m) {
    const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const prev = new Date(Date.UTC(y, m, 0));   // start one day early, same as the calendar's builder
    return pchBuildVratTyoharList(dim + 1, { y: prev.getUTCFullYear(), m: prev.getUTCMonth(), d: prev.getUTCDate() })
      .filter(function (ev) { return ev.dateObj.getUTCFullYear() === y && ev.dateObj.getUTCMonth() === m; });
  }

  function pchRenderVratTyoharFull(dir) {
    const listEl = document.getElementById('vrat-full-list');
    if (!listEl) return;
    const y = pchVratMon.y, m = pchVratMon.m;
    const events = pchVratMonthEvents(y, m);
    const titleEl = document.getElementById('vrat-month-title');
    if (titleEl) titleEl.textContent = MONTH_NAMES_HI[m] + ' ' + y;
    const prevB = document.getElementById('vrat-month-prev'), nextB = document.getElementById('vrat-month-next');
    if (prevB) prevB.disabled = Date.UTC(y, m, 1) <= pchCalMinUTC();
    if (nextB) nextB.disabled = Date.UTC(y, m + 1, 1) > pchCalMaxUTC();
    listEl.innerHTML = events.length
      ? events.map(pchVratItemHTML).join('')
      : '<div style="padding:10px 2px; color:var(--ink-soft); font-size:13px;">इस माह कोई व्रत-त्योहार नहीं मिला।</div>';
    if (dir) {
      listEl.classList.remove('pch-cal-in-next', 'pch-cal-in-prev');
      void listEl.offsetWidth;
      listEl.classList.add(dir > 0 ? 'pch-cal-in-next' : 'pch-cal-in-prev');
    }
  }

  window.pchVratNav = function (dir) {
    let y = pchVratMon.y, m = pchVratMon.m + dir;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    if (Date.UTC(y, m + 1, 0) < pchCalMinUTC() || Date.UTC(y, m, 1) > pchCalMaxUTC()) return;
    pchVratMon.y = y; pchVratMon.m = m;
    pchRenderVratTyoharFull(dir);
  };

  // Swipe left → next month, right → previous (same gesture rules as the calendar).
  function pchVratBindSwipe() {
    if (pchVratMon.swipeBound) return;
    const el = document.getElementById('page-vrattyohar');
    if (!el) return;
    pchVratMon.swipeBound = true;
    let sx = 0, sy = 0, st = 0;
    el.addEventListener('touchstart', function (e) { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); }, { passive: true });
    el.addEventListener('touchend', function (e) {
      const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - st < 700) window.pchVratNav(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  const HOL_STATE_CODE_MAP = {
    'andhra pradesh': 'AP', 'arunachal pradesh': 'AR', 'assam': 'AS', 'bihar': 'BR',
    'chhattisgarh': 'CG', 'goa': 'GA', 'gujarat': 'GJ', 'haryana': 'HR',
    'himachal pradesh': 'HP', 'jharkhand': 'JH', 'karnataka': 'KA', 'kerala': 'KL',
    'madhya pradesh': 'MP', 'maharashtra': 'MH', 'manipur': 'MN', 'meghalaya': 'ML',
    'mizoram': 'MZ', 'nagaland': 'NL', 'odisha': 'OD', 'orissa': 'OD', 'punjab': 'PB',
    'rajasthan': 'RJ', 'sikkim': 'SK', 'tamil nadu': 'TN', 'telangana': 'TG',
    'tripura': 'TR', 'uttar pradesh': 'UP', 'uttarakhand': 'UK', 'west bengal': 'WB',
    'andaman and nicobar islands': 'AN', 'chandigarh': 'CH',
    'dadra and nagar haveli and daman and diu': 'DN', 'delhi': 'DL', 'nct of delhi': 'DL',
    'national capital territory of delhi': 'DL', 'nct': 'DL', 'andaman & nicobar islands': 'AN', 'andaman and nicobar': 'AN', 'dadra and nagar haveli': 'DN', 'daman and diu': 'DN', 'jammu & kashmir': 'JK', 'uttaranchal': 'UK',
    'jammu and kashmir': 'JK', 'ladakh': 'LA', 'lakshadweep': 'LD', 'puducherry': 'PY'
  };
  function pchStateCode(stateName) {
    if (!stateName) return '';
    const code = HOL_STATE_CODE_MAP[String(stateName).trim().toLowerCase()];
    return code || '';
  }

  window.showVratTyoharFull = function showVratTyoharFull() {
    const t = pchCalToday();
    pchVratMon.y = t.y; pchVratMon.m = t.m;     // always open on the current month
    pchVratBindSwipe();
    pchRenderVratTyoharFull();
    showSecondaryPage('page-vrattyohar');
  };

  /* ══════════════════════════════════════════════════════════════════
     PUBLIC HOLIDAYS MODULE
     Combines: (a) fixed-date national holidays, (b) Good Friday (exact,
     via the Gauss/Meeus Easter algorithm), and (c) lunar/Hindu-calendar
     government holidays re-derived from the Vrat/Tyohar tithi scan
     above (so Holi, Diwali, Dussehra, Janmashtami, Guru Nanak Jayanti,
     Buddha Purnima, Mahavir Jayanti, Mahashivratri etc. land on the
     astronomically-correct date rather than a guessed one).
     Central/State Government & Bank dates are generally reliable;
     CBSE / State Education Board / High Court / District Court dates
     (esp. summer & winter vacations) are indicative approximations —
     clearly disclaimed in the UI — since those are set by yearly
     administrative notification, not astronomy. ── */
  // Official India Post 2026 holiday list (as published on
  // indiapost.gov.in/holidays-list) — used verbatim, in preference to
  // any computed/approximate date, for the 'post' category.
  const HOL_INDIAPOST_2026 = [
    { y: 2026, m: 1,  d: 26, name: 'गणतंत्र दिवस' },
    { y: 2026, m: 3,  d: 31, name: 'महावीर जयंती' },
    { y: 2026, m: 4,  d: 3,  name: 'गुड फ्राइडे' },
    { y: 2026, m: 5,  d: 1,  name: 'बुद्ध पूर्णिमा' },
    { y: 2026, m: 8,  d: 15, name: 'स्वतंत्रता दिवस' },
    { y: 2026, m: 10, d: 2,  name: 'गांधी जयंती' },
    { y: 2026, m: 10, d: 20, name: 'दशहरा (विजयादशमी)' },
    { y: 2026, m: 11, d: 8,  name: 'दीपावली' },
    { y: 2026, m: 11, d: 24, name: 'गुरु नानक जयंती' },
    { y: 2026, m: 12, d: 25, name: 'क्रिसमस' }
  ];

  // Islamic-calendar gazetted holidays for 2026 — moon-sighting based, so
  // given as fixed published dates (per DoPT central-government gazetted
  // holiday circular OM No.12/2/2023-JCA and the RBI/India Post 2026
  // calendars) rather than computed, same as India Post's own list above.
  // These are compulsory central gazetted holidays and standard bank
  // holidays, and were previously missing from every category except
  // 'post' — corrected here.
  const HOL_ISLAMIC_2026 = [
    { y: 2026, m: 3,  d: 21, name: 'ईद-उल-फितर', cats: ['state'] },
    { y: 2026, m: 5,  d: 27, name: 'ईद-उल-जुहा (बकरीद)', cats: ['state'] },
    { y: 2026, m: 6,  d: 26, name: 'मुहर्रम', cats: ['state'] },
    { y: 2026, m: 8,  d: 26, name: 'ईद-ए-मिलाद (पैगंबर मोहम्मद जन्मदिवस)', cats: ['state'] }
  ];

  // 2027 — dates per DoPT holiday list for 2027 (OM dated
  // 16.07.2026). India Post follows the 14 compulsory central holidays.
  // Eid-ul-Fitr depends on moon sighting and may shift by a day.
  // Extended to the full year 2027 (DoPT central-government holiday list for 2027). The
  // moon-sighting holidays (Islamic list below) may shift by a day.
  const HOL_INDIAPOST_2027 = [
    { y: 2027, m: 1,  d: 26, name: 'गणतंत्र दिवस' },
    { y: 2027, m: 3,  d: 26, name: 'गुड फ्राइडे' },
    { y: 2027, m: 4,  d: 19, name: 'महावीर जयंती' },
    { y: 2027, m: 5,  d: 20, name: 'बुद्ध पूर्णिमा' },
    { y: 2027, m: 8,  d: 15, name: 'स्वतंत्रता दिवस' },
    { y: 2027, m: 10, d: 2,  name: 'गांधी जयंती' },
    { y: 2027, m: 10, d: 10, name: 'दशहरा (विजयादशमी)' },
    { y: 2027, m: 10, d: 29, name: 'दीपावली' },
    { y: 2027, m: 11, d: 14, name: 'गुरु नानक जयंती' },
    { y: 2027, m: 12, d: 25, name: 'क्रिसमस' }
  ];
  const HOL_ISLAMIC_2027 = [
    { y: 2027, m: 3, d: 10, name: 'ईद-उल-फितर', cats: ['state'] },
    { y: 2027, m: 5, d: 17, name: 'ईद-उल-जुहा (बकरीद)', cats: ['state'] },
    { y: 2027, m: 6, d: 15, name: 'मुहर्रम', cats: ['state'] },
    { y: 2027, m: 8, d: 15, name: 'ईद-ए-मिलाद (पैगंबर मोहम्मद जन्मदिवस)', cats: ['state'] }
  ];

  const HOL_CAT_LABEL = { central: 'केंद्र सरकार', state: 'राज्य सरकार', bank: 'बैंक', post: 'भारतीय डाक', cbse: 'CBSE Schools', edu: 'RBSE Schools', hc: 'उच्च न्यायालय', cc: 'जिला न्यायालय' };
  const HOL_CAT_ORDER = ['central', 'state', 'bank', 'post', 'cbse', 'edu', 'hc', 'cc'];

  // Fixed (solar-calendar) dates — reliable every year
  // Regional groupings used by the `states` whitelist below (2-letter
  // codes match HOL_STATE_CODE_MAP). A rule with no `states` field applies
  // nationwide; a rule WITH `states` only applies for a user located in
  // one of those states/UTs — this is what makes the list location-aware
  // instead of showing the same "state government holiday" chip to every
  // user regardless of where they are.
  const HOL_REGION_MAHA_GOA = ['MH', 'GA'];
  const HOL_REGION_HINDI_BELT = ['UP', 'UK', 'HR', 'PB', 'HP', 'DL', 'RJ', 'BR', 'JH', 'MP', 'CG'];
  const HOL_REGION_NORTHEAST = ['MZ', 'NL', 'TR', 'ML', 'SK', 'MN', 'AR', 'AS'];

  const HOL_FIXED = [
    // New Year's Day is NOT a uniform RBI bank holiday nationwide — it is
    // notified under the Negotiable Instruments Act only in specific
    // states/UTs (chiefly the Northeast). Gated by `states`; if you're
    // outside this list, treat this as "not officially confirmed" rather
    // than absent, since exact NI-Act notifications can shift year to
    // year — check the local RBI circular if it matters.
    { m: 1, d: 1,  name: 'नववर्ष', cats: ['bank'], states: HOL_REGION_NORTHEAST },
    { m: 1, d: 14, solar: 'मकर', name: 'मकर संक्रांति', cats: ['state', 'bank'], states: ['GJ', 'MH', 'KA', 'AP', 'TG', 'WB', 'OD', 'MP', 'CG'] },
    { m: 1, d: 14, solar: 'मकर', name: 'पोंगल', cats: ['state', 'bank'], states: ['TN'] },
    { m: 1, d: 14, name: 'माघ बिहू', cats: ['state', 'bank'], states: ['AS'] },
    { m: 1, d: 26, name: 'गणतंत्र दिवस', cats: ['state'] },
    { m: 2, d: 19, name: 'छत्रपति शिवाजी महाराज जयंती', cats: ['state', 'bank'], states: ['MH'] },
    { m: 4, d: 13, name: 'बैसाखी', cats: ['state', 'bank'], states: ['PB', 'HR', 'CH'] },
    { m: 4, d: 14, name: 'डॉ. भीमराव अम्बेडकर जयंती', cats: ['state'] },
    { m: 5, d: 1,  name: 'महाराष्ट्र दिवस', cats: ['state', 'bank'], states: ['MH'] },
    { m: 8, d: 15, name: 'स्वतंत्रता दिवस', cats: ['state'] },
    { m: 10, d: 2, name: 'गांधी जयंती', cats: ['state'] },
    { m: 12, d: 25, name: 'क्रिसमस', cats: ['state'] }
  ];

  // Year-specific state/regional lunar festivals whose date isn't derived
  // from the Vrat/Tyohar scan (different masa-naming convention per
  // region). Same pattern as HOL_INDIAPOST_2026 / HOL_ISLAMIC_2026 above.
  const HOL_STATE_LUNAR_2026 = [
    { y: 2026, m: 3, d: 19, name: 'गुड़ी पाड़वा', cats: ['state', 'bank'], states: ['MH'] },
    { y: 2026, m: 3, d: 19, name: 'उगादी', cats: ['state', 'bank'], states: ['KA', 'AP', 'TG'] }
  ];

  // Rajasthan state-government holiday list (official dates). For a Rajasthan location this list is
  // the ONLY source of the 'state' category — the computed/generic state entries are dropped (see
  // pchBuildPublicHolidays). Names match the generic ones so they merge with central/bank chips.
  // Eid-ul-Fitr, Bakrid, Muharram and Id-e-Milad dates are tentative (moon sighting).
  const HOL_RAJASTHAN = [
    { y: 2026, m: 11, d: 8,  name: 'दीपावली' },
    { y: 2026, m: 11, d: 9,  name: 'गोवर्धन पूजा' },
    { y: 2026, m: 11, d: 11, name: 'भाई दूज' },
    { y: 2026, m: 11, d: 24, name: 'गुरु नानक जयंती' },
    { y: 2026, m: 12, d: 25, name: 'क्रिसमस' },
    { y: 2027, m: 1,  d: 26, name: 'गणतंत्र दिवस' },
    { y: 2027, m: 2,  d: 13, name: 'देवनारायण जयंती' },
    { y: 2027, m: 3,  d: 6,  name: 'महाशिवरात्रि' },
    { y: 2027, m: 3,  d: 10, name: 'ईद-उल-फितर' },
    { y: 2027, m: 3,  d: 22, name: 'होली' },
    { y: 2027, m: 3,  d: 23, name: 'होली' },
    { y: 2027, m: 3,  d: 26, name: 'गुड फ्राइडे' },
    { y: 2027, m: 4,  d: 14, name: 'डॉ. भीमराव अम्बेडकर जयंती' },
    { y: 2027, m: 4,  d: 15, name: 'राम नवमी' },
    { y: 2027, m: 4,  d: 19, name: 'महावीर जयंती' },
    { y: 2027, m: 5,  d: 17, name: 'ईद-उल-जुहा (बकरीद)' },
    { y: 2027, m: 6,  d: 7,  name: 'महाराणा प्रताप जयंती' },
    { y: 2027, m: 6,  d: 15, name: 'मुहर्रम' },
    { y: 2027, m: 6,  d: 16, name: 'मुहर्रम' },
    { y: 2027, m: 8,  d: 15, name: 'स्वतंत्रता दिवस' },
    { y: 2027, m: 8,  d: 15, name: 'ईद-ए-मिलाद (पैगंबर मोहम्मद जन्मदिवस)' },
    { y: 2027, m: 8,  d: 17, name: 'रक्षाबंधन' },
    { y: 2027, m: 8,  d: 25, name: 'जन्माष्टमी' },
    { y: 2027, m: 9,  d: 10, name: 'रामदेव जयंती व तेजा दशमी' },
    { y: 2027, m: 10, d: 2,  name: 'गांधी जयंती' },
    { y: 2027, m: 10, d: 7,  name: 'दुर्गा अष्टमी' },
    { y: 2027, m: 10, d: 9,  name: 'दशहरा (विजयादशमी)' },
    { y: 2027, m: 10, d: 29, name: 'दीपावली' },
    { y: 2027, m: 10, d: 30, name: 'गोवर्धन पूजा' },
    { y: 2027, m: 12, d: 25, name: 'क्रिसमस' }
  ];

  // District / Civil (subordinate) court holiday list, Nov 2026 – Dec 2027 (official list, Rajasthan).
  // This is the ONLY source of the 'cc' category — generic/computed entries no longer carry 'cc'.
  // Single days: [y, m, d, name]; vacation spans: [y, m, dayFrom, dayTo, name] (within one month).
  // 28 Nov 2026 (4th Sat) is a WORKING day for subordinate courts. Kota district also gets the day
  // after Janmashtami off (not modelled — location is state-level only).
  const HOL_CIVILCOURT = [
    [2026, 11, 24, 'गुरु नानक जयंती'],
    [2026, 12, 25, 'क्रिसमस'],
    [2027, 1, 1, 'नववर्ष'],
    [2027, 1, 26, 'गणतंत्र दिवस'],
    [2027, 3, 6, 'महाशिवरात्रि'],
    [2027, 3, 10, 'ईद-उल-फितर'],
    [2027, 3, 21, 'होली'],
    [2027, 3, 22, 'होली'],
    [2027, 3, 26, 'गुड फ्राइडे'],
    [2027, 4, 14, 'डॉ. भीमराव अम्बेडकर जयंती'],
    [2027, 4, 15, 'राम नवमी'],
    [2027, 4, 19, 'महावीर जयंती'],
    [2027, 5, 17, 'ईद-उल-जुहा (बकरीद)'],
    [2027, 6, 7, 'महाराणा प्रताप जयंती'],
    [2027, 6, 16, 'मुहर्रम'],
    [2027, 8, 15, 'स्वतंत्रता दिवस'],
    [2027, 8, 15, 'ईद-ए-मिलाद (पैगंबर मोहम्मद जन्मदिवस)'],
    [2027, 8, 17, 'रक्षाबंधन'],
    [2027, 8, 25, 'जन्माष्टमी'],
    [2027, 9, 10, 'रामदेव जयंती व तेजा दशमी'],
    [2027, 10, 2, 'गांधी जयंती'],
    [2027, 11, 14, 'गुरु नानक जयंती'],
    [2027, 12, 25, 'क्रिसमस'],
    [2026, 11, 14, 'द्वितीय शनिवार'],
    [2026, 12, 12, 'द्वितीय शनिवार'],
    [2027, 1, 9, 'द्वितीय शनिवार'],
    [2027, 2, 13, 'द्वितीय शनिवार'],
    [2027, 3, 13, 'द्वितीय शनिवार'],
    [2027, 4, 10, 'द्वितीय शनिवार'],
    [2027, 5, 8, 'द्वितीय शनिवार'],
    [2027, 6, 12, 'द्वितीय शनिवार'],
    [2027, 7, 10, 'द्वितीय शनिवार'],
    [2027, 8, 14, 'द्वितीय शनिवार'],
    [2027, 9, 11, 'द्वितीय शनिवार'],
    [2027, 10, 9, 'द्वितीय शनिवार'],
    [2027, 11, 13, 'द्वितीय शनिवार'],
    [2027, 12, 11, 'द्वितीय शनिवार'],
    [2026, 12, 26, 'चतुर्थ शनिवार'],
    [2027, 1, 23, 'चतुर्थ शनिवार'],
    [2027, 2, 27, 'चतुर्थ शनिवार'],
    [2027, 3, 27, 'चतुर्थ शनिवार'],
    [2027, 4, 24, 'चतुर्थ शनिवार'],
    [2027, 5, 22, 'चतुर्थ शनिवार'],
    [2027, 6, 26, 'चतुर्थ शनिवार'],
    [2027, 7, 24, 'चतुर्थ शनिवार'],
    [2027, 8, 28, 'चतुर्थ शनिवार'],
    [2027, 9, 25, 'चतुर्थ शनिवार'],
    [2027, 10, 23, 'चतुर्थ शनिवार'],
    [2027, 11, 27, 'चतुर्थ शनिवार']
  ];
  const HOL_CIVILCOURT_RANGES = [
    [2026, 11, 7, 13, 'दीपावली अवकाश'],
    [2026, 12, 25, 31, 'शीतकालीन अवकाश'],
    [2027, 5, 31, 31, 'ग्रीष्मावकाश'],
    [2027, 6, 1, 27, 'ग्रीष्मावकाश'],
    [2027, 10, 7, 9, 'दशहरा अवकाश'],
    [2027, 10, 27, 31, 'दीपावली अवकाश'],
    [2027, 12, 25, 31, 'शीतकालीन अवकाश']
  ];

  // Rajasthan High Court holiday list, Nov 2026 – Dec 2027 (official list).
  // This is the ONLY source of the 'hc' category — generic/computed entries no longer carry 'hc'.
  // Same format as HOL_CIVILCOURT above. Weekly Sundays are intentionally not listed;
  // 28 Nov 2026 (4th Sat) is a WORKING day for the High Court.
  const HOL_HIGHCOURT = [
    [2026, 11, 24, 'गुरु नानक जयंती'],
    [2026, 12, 25, 'क्रिसमस'],
    [2027, 1, 1, 'नववर्ष'],
    [2027, 1, 26, 'गणतंत्र दिवस'],
    [2027, 3, 6, 'महाशिवरात्रि'],
    [2027, 3, 10, 'ईद-उल-फितर'],
    [2027, 3, 22, 'होली'],
    [2027, 3, 23, 'होली'],
    [2027, 3, 26, 'गुड फ्राइडे'],
    [2027, 4, 8, 'चेटीचंड'],
    [2027, 4, 14, 'डॉ. भीमराव अम्बेडकर जयंती'],
    [2027, 4, 15, 'राम नवमी'],
    [2027, 4, 19, 'महावीर जयंती'],
    [2027, 5, 17, 'ईद-उल-जुहा (बकरीद)'],
    [2027, 6, 7, 'महाराणा प्रताप जयंती'],
    [2027, 6, 16, 'मुहर्रम'],
    [2027, 8, 9, 'विश्व आदिवासी दिवस'],
    [2027, 8, 15, 'स्वतंत्रता दिवस'],
    [2027, 8, 15, 'ईद-ए-मिलाद (पैगंबर मोहम्मद जन्मदिवस)'],
    [2027, 8, 17, 'रक्षाबंधन'],
    [2027, 8, 25, 'जन्माष्टमी'],
    [2027, 9, 10, 'रामदेव जयंती व तेजा दशमी'],
    [2027, 10, 1, 'स्थापना नवरात्र'],
    [2027, 10, 2, 'गांधी जयंती'],
    [2027, 11, 14, 'गुरु नानक जयंती'],
    [2027, 12, 25, 'क्रिसमस'],
    [2026, 11, 14, 'द्वितीय शनिवार'],
    [2026, 12, 12, 'द्वितीय शनिवार'],
    [2027, 1, 9, 'द्वितीय शनिवार'],
    [2027, 2, 13, 'द्वितीय शनिवार'],
    [2027, 3, 13, 'द्वितीय शनिवार'],
    [2027, 4, 10, 'द्वितीय शनिवार'],
    [2027, 5, 8, 'द्वितीय शनिवार'],
    [2027, 6, 12, 'द्वितीय शनिवार'],
    [2027, 7, 10, 'द्वितीय शनिवार'],
    [2027, 8, 14, 'द्वितीय शनिवार'],
    [2027, 9, 11, 'द्वितीय शनिवार'],
    [2027, 10, 9, 'द्वितीय शनिवार'],
    [2027, 11, 13, 'द्वितीय शनिवार'],
    [2027, 12, 11, 'द्वितीय शनिवार'],
    [2026, 12, 26, 'चतुर्थ शनिवार'],
    [2027, 1, 23, 'चतुर्थ शनिवार'],
    [2027, 2, 27, 'चतुर्थ शनिवार'],
    [2027, 3, 27, 'चतुर्थ शनिवार'],
    [2027, 4, 24, 'चतुर्थ शनिवार'],
    [2027, 5, 22, 'चतुर्थ शनिवार'],
    [2027, 6, 26, 'चतुर्थ शनिवार'],
    [2027, 7, 24, 'चतुर्थ शनिवार'],
    [2027, 8, 28, 'चतुर्थ शनिवार'],
    [2027, 9, 25, 'चतुर्थ शनिवार'],
    [2027, 10, 23, 'चतुर्थ शनिवार'],
    [2027, 11, 27, 'चतुर्थ शनिवार']
  ];
  const HOL_HIGHCOURT_RANGES = [
    [2026, 11, 7, 13, 'दीपावली अवकाश'],
    [2026, 12, 24, 31, 'शीतकालीन अवकाश'],
    [2027, 5, 31, 31, 'ग्रीष्मावकाश'],
    [2027, 6, 1, 27, 'ग्रीष्मावकाश'],
    [2027, 10, 7, 9, 'दशहरा अवकाश'],
    [2027, 10, 27, 31, 'दीपावली अवकाश'],
    [2027, 12, 25, 31, 'शीतकालीन अवकाश']
  ];

  // CBSE / Kendriya Vidyalaya (Jaipur region) holiday list, Nov 2026 – Dec 2027.
  // This is the ONLY source of the 'cbse' category — generic/computed entries no longer carry 'cbse'.
  // Same format as HOL_CIVILCOURT above. Long vacations follow the usual KVS/CBSE pattern and are
  // approximate (private CBSE schools often differ, e.g. winter break 31 Dec – 10 Jan).
  const HOL_CBSE = [
    [2026, 11, 8, 'दीपावली'],
    [2026, 11, 9, 'गोवर्धन पूजा'],
    [2026, 11, 11, 'भाई दूज'],
    [2026, 11, 24, 'गुरु नानक जयंती'],
    [2026, 12, 25, 'क्रिसमस'],
    [2027, 1, 1, 'नववर्ष'],
    [2027, 1, 14, 'मकर संक्रांति'],
    [2027, 1, 26, 'गणतंत्र दिवस'],
    [2027, 3, 6, 'महाशिवरात्रि'],
    [2027, 3, 10, 'ईद-उल-फितर'],
    [2027, 3, 22, 'होलिका दहन'],
    [2027, 3, 23, 'होली'],
    [2027, 3, 26, 'गुड फ्राइडे'],
    [2027, 4, 8, 'चेटीचंड'],
    [2027, 4, 14, 'डॉ. भीमराव अम्बेडकर जयंती'],
    [2027, 4, 15, 'राम नवमी'],
    [2027, 4, 19, 'महावीर जयंती'],
    [2027, 5, 17, 'ईद-उल-जुहा (बकरीद)'],
    [2027, 5, 20, 'बुद्ध पूर्णिमा'],
    [2027, 6, 7, 'महाराणा प्रताप जयंती'],
    [2027, 6, 16, 'मुहर्रम'],
    [2027, 8, 4, 'हरियाली तीज'],
    [2027, 8, 15, 'स्वतंत्रता दिवस'],
    [2027, 8, 15, 'ईद-ए-मिलाद (पैगंबर मोहम्मद जन्मदिवस)'],
    [2027, 8, 17, 'रक्षाबंधन'],
    [2027, 8, 25, 'जन्माष्टमी'],
    [2027, 10, 2, 'गांधी जयंती'],
    [2027, 10, 9, 'दशहरा (विजयादशमी)'],
    [2027, 10, 29, 'दीपावली'],
    [2027, 11, 14, 'गुरु नानक जयंती'],
    [2027, 12, 25, 'क्रिसमस']
  ];
  const HOL_CBSE_RANGES = [
    [2026, 12, 31, 31, 'शीतकालीन अवकाश'],
    [2027, 1, 1, 10, 'शीतकालीन अवकाश'],
    [2027, 5, 3, 31, 'ग्रीष्मावकाश (अनुमानित)'],
    [2027, 6, 1, 20, 'ग्रीष्मावकाश (अनुमानित)'],
    [2027, 10, 7, 16, 'शरदकालीन / दशहरा अवकाश (अनुमानित)'],
    [2027, 10, 27, 31, 'दीपावली अवकाश (निजी CBSE स्कूल, अनुमानित)'],
    [2027, 11, 1, 2, 'दीपावली अवकाश (निजी CBSE स्कूल, अनुमानित)'],
    [2027, 12, 23, 31, 'शीतकालीन अवकाश'],
    [2028, 1, 1, 2, 'शीतकालीन अवकाश']
  ];

  // Rajasthan Education Department (Shivira Panchang) school holiday list, Nov 2026 – Dec 2027.
  // This is the ONLY source of the 'edu' category — generic/computed entries no longer carry 'edu'.
  // Same format as HOL_CIVILCOURT above. 26 Jan, 15 Aug and 2 Oct are celebration days in schools
  // (no holiday) and are labelled so. Long vacations (summer, Diwali 2027, winter 2027-28) are approximate.
  const HOL_EDU = [
    [2026, 11, 8, 'दीपावली'],
    [2026, 11, 9, 'गोवर्धन पूजा'],
    [2026, 11, 11, 'भाई दूज'],
    [2026, 11, 24, 'गुरु नानक जयंती'],
    [2026, 12, 25, 'क्रिसमस'],
    [2027, 1, 26, 'गणतंत्र दिवस (उत्सव दिवस — अवकाश नहीं)'],
    [2027, 2, 13, 'देवनारायण जयंती'],
    [2027, 3, 6, 'महाशिवरात्रि'],
    [2027, 3, 10, 'ईद-उल-फितर'],
    [2027, 3, 22, 'होलिका दहन'],
    [2027, 3, 23, 'होली'],
    [2027, 3, 26, 'गुड फ्राइडे'],
    [2027, 4, 8, 'चेटीचंड'],
    [2027, 4, 11, 'महात्मा ज्योतिबा फुले जयंती'],
    [2027, 4, 14, 'डॉ. भीमराव अम्बेडकर जयंती'],
    [2027, 4, 15, 'राम नवमी'],
    [2027, 4, 19, 'महावीर जयंती'],
    [2027, 5, 8, 'महर्षि परशुराम जयंती'],
    [2027, 5, 17, 'ईद-उल-जुहा (बकरीद)'],
    [2027, 5, 20, 'बुद्ध पूर्णिमा'],
    [2027, 6, 7, 'महाराणा प्रताप जयंती'],
    [2027, 6, 16, 'मुहर्रम'],
    [2027, 8, 9, 'विश्व आदिवासी दिवस'],
    [2027, 8, 15, 'स्वतंत्रता दिवस (उत्सव दिवस — अवकाश नहीं)'],
    [2027, 8, 15, 'ईद-ए-मिलाद (पैगंबर मोहम्मद जन्मदिवस)'],
    [2027, 8, 17, 'रक्षाबंधन'],
    [2027, 8, 25, 'जन्माष्टमी'],
    [2027, 9, 10, 'रामदेव जयंती व तेजा दशमी'],
    [2027, 9, 30, 'नवरात्र स्थापना'],
    [2027, 10, 2, 'गांधी जयंती (उत्सव दिवस — अवकाश नहीं)'],
    [2027, 10, 7, 'दुर्गाष्टमी'],
    [2027, 10, 8, 'महानवमी'],
    [2027, 10, 9, 'दशहरा (विजयादशमी)'],
    [2027, 10, 29, 'दीपावली'],
    [2027, 10, 30, 'गोवर्धन पूजा'],
    [2027, 10, 31, 'भाई दूज'],
    [2027, 11, 14, 'गुरु नानक जयंती'],
    [2027, 12, 25, 'क्रिसमस']
  ];
  const HOL_EDU_RANGES = [
    [2026, 11, 4, 15, 'दीपावली अवकाश'],
    [2026, 12, 31, 31, 'शीतकालीन अवकाश'],
    [2027, 1, 1, 10, 'शीतकालीन अवकाश'],
    [2027, 5, 17, 31, 'ग्रीष्मावकाश (अनुमानित)'],
    [2027, 6, 1, 20, 'ग्रीष्मावकाश (अनुमानित)'],
    [2027, 10, 25, 31, 'दीपावली अवकाश (अनुमानित)'],
    [2027, 11, 1, 5, 'दीपावली अवकाश (अनुमानित)'],
    [2027, 12, 25, 31, 'शीतकालीन अवकाश (अनुमानित)'],
    [2028, 1, 1, 5, 'शीतकालीन अवकाश (अनुमानित)']
  ];

  // Bank holiday list, Nov 2026 – Dec 2027 (national / Rajasthan; festival dates are indicative and
  // subject to the state RBI notification). Source of the nationwide 'bank' entries — the generic
  // entries no longer carry 'bank'. State-specific bank rules (gated by `states`) are unchanged.
  // Same format as HOL_CIVILCOURT above.  Weekly Sundays are intentionally not listed.
  const HOL_BANK = [
    [2026, 11, 24, 'गुरु नानक जयंती'],
    [2026, 12, 25, 'क्रिसमस'],
    [2027, 1, 26, 'गणतंत्र दिवस'],
    [2027, 3, 10, 'ईद-उल-फितर'],
    [2027, 3, 23, 'होली'],
    [2027, 3, 26, 'गुड फ्राइडे'],
    [2027, 4, 1, 'बैंक खातों का वार्षिक समापन (जनता के लिए लेन-देन बंद)'],
    [2027, 4, 15, 'राम नवमी'],
    [2027, 4, 19, 'महावीर जयंती'],
    [2027, 5, 17, 'ईद-उल-जुहा (बकरीद)'],
    [2027, 5, 20, 'बुद्ध पूर्णिमा'],
    [2027, 6, 16, 'मुहर्रम'],
    [2027, 8, 15, 'स्वतंत्रता दिवस'],
    [2027, 8, 25, 'जन्माष्टमी'],
    [2027, 10, 2, 'गांधी जयंती'],
    [2027, 10, 9, 'दशहरा (विजयादशमी)'],
    [2027, 10, 29, 'दीपावली'],
    [2027, 11, 14, 'गुरु नानक जयंती'],
    [2027, 12, 25, 'क्रिसमस'],
    [2026, 12, 12, 'द्वितीय शनिवार'],
    [2027, 1, 9, 'द्वितीय शनिवार'],
    [2027, 2, 13, 'द्वितीय शनिवार'],
    [2027, 3, 13, 'द्वितीय शनिवार'],
    [2027, 4, 10, 'द्वितीय शनिवार'],
    [2027, 5, 8, 'द्वितीय शनिवार'],
    [2027, 6, 12, 'द्वितीय शनिवार'],
    [2027, 7, 10, 'द्वितीय शनिवार'],
    [2027, 8, 14, 'द्वितीय शनिवार'],
    [2027, 9, 11, 'द्वितीय शनिवार'],
    [2027, 10, 9, 'द्वितीय शनिवार'],
    [2027, 11, 13, 'द्वितीय शनिवार'],
    [2027, 12, 11, 'द्वितीय शनिवार'],
    [2026, 11, 28, 'चतुर्थ शनिवार'],
    [2026, 12, 26, 'चतुर्थ शनिवार'],
    [2027, 1, 23, 'चतुर्थ शनिवार'],
    [2027, 2, 27, 'चतुर्थ शनिवार'],
    [2027, 3, 27, 'चतुर्थ शनिवार'],
    [2027, 4, 24, 'चतुर्थ शनिवार'],
    [2027, 5, 22, 'चतुर्थ शनिवार'],
    [2027, 6, 26, 'चतुर्थ शनिवार'],
    [2027, 7, 24, 'चतुर्थ शनिवार'],
    [2027, 8, 28, 'चतुर्थ शनिवार'],
    [2027, 9, 25, 'चतुर्थ शनिवार'],
    [2027, 10, 23, 'चतुर्थ शनिवार'],
    [2027, 11, 27, 'चतुर्थ शनिवार'],
    [2027, 12, 25, 'चतुर्थ शनिवार']
  ];

  // Central Government offices in Rajasthan (CGEWCC Jaipur, DoPT 2027 order), Nov 2026 – Dec 2027.
  // Source of the 'central' category — generic/computed entries no longer carry 'central'.
  // Gazetted holidays only (they mark the date red in the calendar). Restricted/optional holidays are intentionally not listed.
  // Moon-sighting dates (Eid, Bakrid, Muharram) may shift by a day.
  const HOL_CENTRAL = [
    [2026, 11, 8, 'दीपावली'],
    [2026, 11, 24, 'गुरु नानक जयंती'],
    [2026, 12, 25, 'क्रिसमस'],
    [2027, 1, 26, 'गणतंत्र दिवस'],
    [2027, 3, 10, 'ईद-उल-फितर'],
    [2027, 3, 23, 'होली'],
    [2027, 3, 26, 'गुड फ्राइडे'],
    [2027, 4, 15, 'राम नवमी'],
    [2027, 4, 19, 'महावीर जयंती'],
    [2027, 5, 17, 'ईद-उल-जुहा (बकरीद)'],
    [2027, 5, 20, 'बुद्ध पूर्णिमा'],
    [2027, 6, 16, 'मुहर्रम'],
    [2027, 8, 15, 'स्वतंत्रता दिवस'],
    [2027, 8, 15, 'ईद-ए-मिलाद (पैगंबर मोहम्मद जन्मदिवस)'],
    [2027, 8, 25, 'जन्माष्टमी'],
    [2027, 10, 2, 'गांधी जयंती'],
    [2027, 10, 9, 'दशहरा (विजयादशमी)'],
    [2027, 10, 29, 'दीपावली'],
    [2027, 11, 14, 'गुरु नानक जयंती'],
    [2027, 12, 25, 'क्रिसमस']
  ];

  // Lunar/Hindu-calendar holidays, matched off the already-computed
  // Vrat/Tyohar events by label text (and masa/paksha where the label
  // is a generic one reused across months, e.g. "पूर्णिमा व्रत").
  // `states`, where present, restricts the rule the same way as in
  // HOL_FIXED above.
  // Dates (UTC-midnight ms) that carry Vaishnava Janmashtami in the current build: the day before such a
  // date is not listed as the Janmashtami holiday (the government list follows the Vaishnava day).
  let pchHolVaishnavJanm = {};
  const HOL_LUNAR_RULES = [
    { test: ev => ev.label.indexOf('होली (धुलंडी') !== -1, name: 'होली', cats: ['state'] },
    { test: ev => ev.label.indexOf('राम नवमी') !== -1, name: 'राम नवमी', cats: ['state'] },
    { test: ev => ev.label.indexOf('महावीर जयंती') !== -1, name: 'महावीर जयंती', cats: ['state'] },
    { test: ev => ev.label.indexOf('बुद्ध पूर्णिमा') !== -1, name: 'बुद्ध पूर्णिमा', cats: ['state'] },
    { test: ev => ev.label.indexOf('श्री कृष्ण जन्माष्टमी') !== -1 && !pchHolVaishnavJanm[+ev.dateObj + 86400000], name: 'जन्माष्टमी', cats: ['state'] },
    { test: ev => ev.label.indexOf('गणेश चतुर्थी') !== -1, name: 'गणेश चतुर्थी', cats: ['state'], states: HOL_REGION_MAHA_GOA },
    { test: ev => ev.label.indexOf('विजयादशमी') !== -1, name: 'दशहरा (विजयादशमी)', cats: ['state'] },
    { test: ev => ev.label.indexOf('दीपावली (अमावस्या)') !== -1, name: 'दीपावली', cats: ['state'] },
    { test: ev => ev.label.indexOf('नरक चतुर्दशी') !== -1, name: 'नरक चतुर्दशी (छोटी दीपावली)', cats: ['bank'], states: HOL_REGION_HINDI_BELT },
    { test: ev => ev.label.indexOf('गोवर्धन पूजा') !== -1, name: 'गोवर्धन पूजा', cats: ['bank', 'state'], states: HOL_REGION_HINDI_BELT },
    { test: ev => ev.label.indexOf('भाई दूज') !== -1, name: 'भाई दूज', cats: ['bank', 'state'], states: HOL_REGION_HINDI_BELT },
    { test: ev => ev.label.indexOf('महाशिवरात्रि') !== -1, name: 'महाशिवरात्रि', cats: ['state'] },
    { test: ev => ev.label.indexOf('कार्तिक पूर्णिमा') !== -1, name: 'गुरु नानक जयंती', cats: ['state'] },
    { test: ev => ev.label.indexOf('रक्षाबंधन') !== -1, name: 'रक्षाबंधन', cats: ['bank'], states: HOL_REGION_HINDI_BELT }
  ];

  // Gauss/Meeus algorithm — exact Gregorian-calendar Easter Sunday date; Good Friday = Easter − 2 days
  function pchGoodFriday(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    const easter = new Date(Date.UTC(year, month - 1, day));
    easter.setUTCDate(easter.getUTCDate() - 2);
    return easter;
  }

  // Single gate used everywhere a rule may carry a `states` whitelist.
  // No `states` field => nationwide => always allowed.
  function pchStateAllowed(rule) {
    if (!rule.states) return true;
    const code = pchStateCode(PCH.state);
    return !!code && rule.states.indexOf(code) !== -1;
  }

  function pchBuildPublicHolidays(daysAhead, startYMD, vratEvents, opts) { // optional: local {y,m,d} start + the vrat events to derive lunar holidays from; opts.calc = true -> CALENDAR mode: tithi-based dates follow the Panchang calculation (the Vrat/Tyohar list); default = HOLIDAY LIST mode: dates follow the published lists
    const tz = (PCH && PCH.tzOffsetMin) || 330;
    const nowBase = (PCH && PCH.customDateTime) ? PCH.customDateTime.getTime() : Date.now();
    const localNow = new Date(nowBase + tz * 60000);
    const y = startYMD ? startYMD.y : localNow.getUTCFullYear(), m = startYMD ? startYMD.m : localNow.getUTCMonth(), d = startYMD ? startYMD.d : localNow.getUTCDate();
    const todayUTC = Date.UTC(y, m, d);
    const cutoffUTC = todayUTC + daysAhead * 86400000;
    const merged = {}; // key: 'YYYY-M-D' -> { dateObj, name (display title), cats:Set (every body that declared a holiday), entries:[{name,cats}], ruleLabels:[] }

    const isRJ = pchStateCode(PCH.state) === 'RJ';
    const calcMode = !!(opts && opts.calc);
    const computedLunar = []; // [{ ms, name }] — tithi-computed holidays (used in calc mode to out-rank published-list dates one day off)
    if (calcMode) {
      pchHolVaishnavJanm = {};
      (vratEvents || PCH_VRAT_EVENTS || []).forEach(ev => { if (ev.label.indexOf('वैष्णव श्री कृष्ण जन्माष्टमी') !== -1) pchHolVaishnavJanm[+ev.dateObj] = true; });
      (vratEvents || PCH_VRAT_EVENTS || []).forEach(ev => {
        for (let i = 0; i < HOL_LUNAR_RULES.length; i++) {
          const rule = HOL_LUNAR_RULES[i];
          if (rule.test(ev) && pchStateAllowed(rule)) computedLunar.push({ ms: Date.UTC(ev.dateObj.getUTCFullYear(), ev.dateObj.getUTCMonth(), ev.dateObj.getUTCDate()), name: rule.name });
        }
      });
    }
    function addEvent(dateUTCms, name, cats, fromRJList, vratLabel) {
      if (dateUTCms < todayUTC || dateUTCms > cutoffUTC) return;
      if (calcMode && name === 'दीपावली अवकाश') return; // Diwali vacation spans are shown in the Holiday list only, not in the calendar
      if (calcMode && !vratLabel && computedLunar.some(c => c.name === name && Math.abs(c.ms - dateUTCms) === 86400000)) return;
      if (isRJ && !fromRJList) { cats = cats.filter(c => c !== 'state'); if (!cats.length) return; }
      const dObj = new Date(dateUTCms);
      const key = dObj.getUTCFullYear() + '-' + dObj.getUTCMonth() + '-' + dObj.getUTCDate(); // ONE row per date
      if (!merged[key]) merged[key] = { dateObj: dObj, name: name, cats: new Set(), entries: [], ruleLabels: [] };
      cats.forEach(c => merged[key].cats.add(c));
      merged[key].entries.push({ name: name, ncats: cats.length, cats: cats.slice() });
      if (vratLabel) merged[key].ruleLabels.push(vratLabel);
    }

    // Fixed-date holidays across every year touched by the window
    const yearsSpan = [y, y + 1];
    yearsSpan.forEach(yr => {
      HOL_FIXED.forEach(h => {
        if (!pchStateAllowed(h)) return;
        if (h.solar) {
          // Sankranti-linked (मकर संक्रांति / पोंगल): follow the computed
          // observance day instead of a fixed 14 Jan (2027 -> 15 Jan).
          const jdS = pchFindSankrantiJD(yr, h.solar);
          if (jdS !== null) { const o = pchSankrantiObservedDay(jdS, h.solar, tz); addEvent(Date.UTC(o.y, o.m, o.d), h.name, h.cats); return; }
        }
        addEvent(Date.UTC(yr, h.m - 1, h.d), h.name, h.cats);
      });
      addEvent(pchGoodFriday(yr).getTime(), 'गुड फ्राइडे', ['state']);
    });

    // India Post — official published dates take precedence for the 'post' category
    HOL_INDIAPOST_2026.concat(HOL_INDIAPOST_2027).forEach(h => addEvent(Date.UTC(h.y, h.m - 1, h.d), h.name, ['post']));

    // Islamic-calendar gazetted holidays (Eid-ul-Fitr, Bakrid, Muharram,
    // Eid-e-Milad) — central/state/bank/education/court categories.
    // Also add 'post' so these merge with the India Post entries above
    // instead of appearing as a duplicate second entry on the same date.
    HOL_ISLAMIC_2026.concat(HOL_ISLAMIC_2027).forEach(h => addEvent(Date.UTC(h.y, h.m - 1, h.d), h.name, h.cats.concat('post')));

    // State-specific solar/lunar festivals not covered by the Vrat scan
    HOL_STATE_LUNAR_2026.forEach(h => { if (pchStateAllowed(h)) addEvent(Date.UTC(h.y, h.m - 1, h.d), h.name, h.cats); });

    // Rajasthan: official state-government list is the only source of the 'state' category
    if (isRJ) HOL_RAJASTHAN.forEach(h => addEvent(Date.UTC(h.y, h.m - 1, h.d), h.name, ['state'], true));

    // District / Civil courts — official list only ('cc' category)
    HOL_CIVILCOURT.forEach(h => addEvent(Date.UTC(h[0], h[1] - 1, h[2]), h[3], ['cc']));
    HOL_CIVILCOURT_RANGES.forEach(r => { for (let dd = r[2]; dd <= r[3]; dd++) addEvent(Date.UTC(r[0], r[1] - 1, dd), r[4], ['cc']); });

    // Rajasthan High Court — official list only ('hc' category)
    HOL_HIGHCOURT.forEach(h => addEvent(Date.UTC(h[0], h[1] - 1, h[2]), h[3], ['hc']));
    HOL_HIGHCOURT_RANGES.forEach(r => { for (let dd = r[2]; dd <= r[3]; dd++) addEvent(Date.UTC(r[0], r[1] - 1, dd), r[4], ['hc']); });

    // CBSE / Kendriya Vidyalaya — official list only ('cbse' category)
    HOL_CBSE.forEach(h => addEvent(Date.UTC(h[0], h[1] - 1, h[2]), h[3], ['cbse']));
    HOL_CBSE_RANGES.forEach(r => { for (let dd = r[2]; dd <= r[3]; dd++) addEvent(Date.UTC(r[0], r[1] - 1, dd), r[4], ['cbse']); });

    // Rajasthan Education Department (Shivira Panchang) — official list only ('edu' category)
    HOL_EDU.forEach(h => addEvent(Date.UTC(h[0], h[1] - 1, h[2]), h[3], ['edu']));
    HOL_EDU_RANGES.forEach(r => { for (let dd = r[2]; dd <= r[3]; dd++) addEvent(Date.UTC(r[0], r[1] - 1, dd), r[4], ['edu']); });

    // Banks — published list for the nationwide 'bank' category
    HOL_BANK.forEach(h => addEvent(Date.UTC(h[0], h[1] - 1, h[2]), h[3], ['bank']));

    // Central Government offices (Rajasthan) — published list for the 'central' category
    HOL_CENTRAL.forEach(h => addEvent(Date.UTC(h[0], h[1] - 1, h[2]), h[3], ['central']));

    // Lunar holidays derived from the already-computed Vrat/Tyohar scan
    pchHolVaishnavJanm = {};
    (vratEvents || PCH_VRAT_EVENTS || []).forEach(ev => { if (ev.label.indexOf('वैष्णव श्री कृष्ण जन्माष्टमी') !== -1) pchHolVaishnavJanm[+ev.dateObj] = true; });
    (vratEvents || PCH_VRAT_EVENTS || []).forEach(ev => {
      for (let i = 0; i < HOL_LUNAR_RULES.length; i++) {
        const rule = HOL_LUNAR_RULES[i];
        if (rule.test(ev) && pchStateAllowed(rule)) {
          const ms = Date.UTC(ev.dateObj.getUTCFullYear(), ev.dateObj.getUTCMonth(), ev.dateObj.getUTCDate());
          // The published lists above are authoritative: if one already declares this same holiday on the day
          // before/after the computed (udaya-tithi) day, don't add a second date for it (e.g. Govardhan Puja 9 vs 10 Nov).
          const nearListed = !calcMode && [-1, 1].some(off => {
            const dd = new Date(ms + off * 86400000), m0 = merged[dd.getUTCFullYear() + '-' + dd.getUTCMonth() + '-' + dd.getUTCDate()];
            return !!m0 && m0.entries.some(e => e.name === rule.name);
          });
          if (!nearListed) addEvent(ms, rule.name, rule.cats, false, ev.label);
        }
      }
    });

    // One row per date. Title = the Panchang's own Vrat/Tyohar title for that day; the chips list every body
    // (court, bank, school board…) that declared a holiday, whatever name it used for it.
    const vr = vratEvents || PCH_VRAT_EVENTS || [];
    const vrByDate = {};
    vr.forEach(ev => {
      const dd = ev.dateObj, k = dd.getUTCFullYear() + '-' + dd.getUTCMonth() + '-' + dd.getUTCDate();
      (vrByDate[k] = vrByDate[k] || []).push(ev.label);
    });
    const HOL_STOP = { 'अवकाश': 1, 'जयंती': 1, 'दिवस': 1, 'पूजा': 1, 'व्रत': 1, 'अनुमानित': 1, 'शनिवार': 1, 'रविवार': 1, 'साप्ताहिक': 1,
      'द्वितीय': 1, 'चतुर्थ': 1, 'प्रथम': 1, 'शीतकालीन': 1, 'प्रतिबंधित': 1, 'मध्यावधि': 1, 'उत्सव': 1, 'नहीं': 1, 'शरदकालीन': 1 };
    const tokensOf = n => n.replace(/[()\/\-—,.।]/g, ' ').split(/\s+/).filter(t => t.length > 2 && !HOL_STOP[t]);
    const isWeekend = n => n.indexOf('शनिवार') !== -1 || n.indexOf('रविवार') !== -1;
    const list = Object.keys(merged).map(k => {
      const ev = merged[k];
      let title = ev.ruleLabels[0] || '';
      if (!title) {
        const toks = [];
        ev.entries.forEach(e => tokensOf(e.name).forEach(t => toks.push(t)));
        title = (vrByDate[k] || []).filter(l => toks.some(t => l.indexOf(t) !== -1))[0] || '';
      }
      if (!title) {
        const best = ev.entries.slice().sort((a, b) => {
          const sa = (isWeekend(a.name) ? 0 : 4) + (a.name.indexOf('प्रतिबंधित') === -1 ? 2 : 0) + (a.name.indexOf('अवकाश') === -1 || a.name.indexOf('प्रतिबंधित') !== -1 ? 1 : 0);
          const sb = (isWeekend(b.name) ? 0 : 4) + (b.name.indexOf('प्रतिबंधित') === -1 ? 2 : 0) + (b.name.indexOf('अवकाश') === -1 || b.name.indexOf('प्रतिबंधित') !== -1 ? 1 : 0);
          return sb - sa || b.ncats - a.ncats;
        })[0];
        title = best.name;
      }
      ev.name = title;
      // Second / fourth Saturday: if it is not already the row's title, keep it as a note (with the bodies that observe it)
      const sat = {};
      ev.entries.forEach(e => {
        if (e.name.indexOf('शनिवार') === -1 || title.indexOf(e.name) !== -1) return;
        const s = sat[e.name] = sat[e.name] || new Set();
        (e.cats || []).forEach(c => s.add(c));
      });
      ev.satNotes = Object.keys(sat).map(n => ({ name: n, cats: sat[n] }));
      return ev;
    });
    list.sort((a, b) => a.dateObj - b.dateObj);
    return list;
  }

  function pchHolidayChipsHTML(catsSet) {
    return HOL_CAT_ORDER.filter(c => catsSet.has(c)).map(c => '<span class="hol-chip">' + HOL_CAT_LABEL[c] + '</span>').join('');
  }

  // Title shown in the holiday list: the row's title, then ", द्वितीय शनिवार" when a 2nd/4th Saturday holiday falls on the same date
  function pchHolidayTitle(ev) {
    return ev.name + (ev.satNotes || []).map(n => ', ' + n.name).join('');
  }

  function pchHolidayItemHTML(ev) {
    const dObj = ev.dateObj;
    const dayNum = dObj.getUTCDate();
    const monthShort = MONTH_NAMES_HI[dObj.getUTCMonth()].slice(0, 3);
    return '<div class="hol-item">'
      + '<div class="hol-date-badge"><span class="vrat-date-num">' + dayNum + '</span><span class="vrat-date-mon">' + monthShort + '</span></div>'
      + '<div class="hol-info"><div class="hol-name">' + pchHolidayTitle(ev) + pchEvTag(ev) + '</div><div class="hol-chips">' + pchHolidayChipsHTML(ev.cats) + '</div></div>'
      + '</div>';
  }

  let PCH_HOLIDAY_EVENTS = [];

  window.pchRenderHolidays = function pchRenderHolidays() {
    const tz = (PCH && PCH.tzOffsetMin) || 330;
    const nowBase = (PCH && PCH.customDateTime) ? PCH.customDateTime.getTime() : Date.now();
    const localNow = new Date(nowBase + tz * 60000);
    const daysAhead = Math.max(60, pchVratDaysAhead(localNow));
    if (!PCH_VRAT_EVENTS.length) PCH_VRAT_EVENTS = pchBuildVratTyoharList(pchVratDaysAhead(localNow));
    PCH_HOLIDAY_EVENTS = pchBuildPublicHolidays(daysAhead);
    const listEl = document.getElementById('pch-holiday-list');
    if (!listEl) return;
    const upcoming = PCH_HOLIDAY_EVENTS.slice(0, 3);
    listEl.innerHTML = upcoming.length
      ? upcoming.map(pchHolidayItemHTML).join('')
      : '<div style="padding:10px 2px; color:var(--ink-soft); font-size:13px;">कोई आगामी अवकाश नहीं मिला।</div>';
  };

  let pchHolFilter = 'all';

  // Full holiday list: one calendar month at a time (current month first), same bounds as the calendar.
  const pchHolMon = { y: 0, m: 0, swipeBound: false };

  function pchRenderHolidaysFull(dir) {
    const y = pchHolMon.y, m = pchHolMon.m;
    const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const events = pchBuildPublicHolidays(dim - 1, { y: y, m: m, d: 1 }, pchVratMonthEvents(y, m));

    const titleEl = document.getElementById('hol-month-title');
    if (titleEl) titleEl.textContent = MONTH_NAMES_HI[m] + ' ' + y;
    const prevB = document.getElementById('hol-month-prev'), nextB = document.getElementById('hol-month-next');
    if (prevB) prevB.disabled = Date.UTC(y, m, 1) <= pchCalMinUTC();
    if (nextB) nextB.disabled = Date.UTC(y, m + 1, 1) > pchCalMaxUTC();

    // Filter chips row
    const filterRow = document.getElementById('hol-filter-row');
    if (filterRow) {
      const chips = [{ id: 'all', label: 'सभी' }].concat(HOL_CAT_ORDER.map(c => ({ id: c, label: HOL_CAT_LABEL[c] })));
      filterRow.innerHTML = chips.map(c => '<button class="hol-filter-btn' + (pchHolFilter === c.id ? ' active' : '') + '" onclick="pchSetHolFilter(\'' + c.id + '\')">' + c.label + '</button>').join('');
    }

    const filtered = pchHolFilter === 'all' ? events : events.filter(ev => ev.cats.has(pchHolFilter));
    const listEl = document.getElementById('hol-full-list');
    if (!listEl) return;
    listEl.innerHTML = filtered.length
      ? filtered.map(pchHolidayItemHTML).join('')
      : '<div style="padding:10px 2px; color:var(--ink-soft); font-size:13px;">इस माह इस श्रेणी में कोई अवकाश नहीं मिला।</div>';
    if (dir) {
      listEl.classList.remove('pch-cal-in-next', 'pch-cal-in-prev');
      void listEl.offsetWidth;
      listEl.classList.add(dir > 0 ? 'pch-cal-in-next' : 'pch-cal-in-prev');
    }
  }

  window.pchHolNav = function (dir) {
    let y = pchHolMon.y, m = pchHolMon.m + dir;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    if (Date.UTC(y, m + 1, 0) < pchCalMinUTC() || Date.UTC(y, m, 1) > pchCalMaxUTC()) return;
    pchHolMon.y = y; pchHolMon.m = m;
    pchRenderHolidaysFull(dir);
  };

  function pchHolBindSwipe() {
    if (pchHolMon.swipeBound) return;
    const el = document.getElementById('page-holidays');
    if (!el) return;
    pchHolMon.swipeBound = true;
    let sx = 0, sy = 0, st = 0;
    el.addEventListener('touchstart', function (e) { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); }, { passive: true });
    el.addEventListener('touchend', function (e) {
      const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - st < 700) window.pchHolNav(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  window.pchSetHolFilter = function pchSetHolFilter(id) {
    pchHolFilter = id;
    pchRenderHolidaysFull();
  };

  window.showHolidaysFull = function showHolidaysFull() {
    pchHolFilter = 'all';
    const t = pchCalToday();
    pchHolMon.y = t.y; pchHolMon.m = t.m;       // always open on the current month
    pchHolBindSwipe();
    pchRenderHolidaysFull();
    showSecondaryPage('page-holidays');
  };

  /* ══════════════════════════════════════════════════════════════════
     PANCHANG CALENDAR MODULE (Phase 1)
     Month grid shown at the very top of the Panchang page. Selectable
     range: first day of the current month … last day of the month after
     next (rolling window shared with the Vrat/Holiday lists).
     Per-day tithi in the grid is computed OFFLINE at an approximate local
     sunrise (pchApproxSunriseSetMin) — no network call per cell. ── */
  const PCH_CAL_DOW = ['रवि','सोम','मंगल','बुध','गुरु','शुक्र','शनि'];
  const pchCal = { open: false, y: 0, m: 0, sel: null, cache: {}, monthCache: {}, sig: '', token: 0, loading: false, sunInfo: null, swipeBound: false, locKey: '', followNow: false, nowStamp: 0, nowTimer: null };

  function pchCalTz() { return (PCH && PCH.tzOffsetMin) || 330; }
  function pchCalToday() {
    const t = new Date(Date.now() + pchCalTz() * 60000);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate() };
  }
  function pchCalMinUTC() { const t = pchCalToday(); return Date.UTC(t.y, t.m, 1); }
  function pchCalMaxUTC() {
    const t = pchCalToday();
    return pchWindowEndUTC(t.y, t.m);
  }
  function pchCalSunriseJD(y, m, d) {
    const tz = pchCalTz();
    const sr = pchApproxSunriseSetMin(y, m, d, tz);
    return julianDay(new Date(Date.UTC(y, m, d) + (sr.rise - tz) * 60000));
  }
  function pchCalDayInfo(y, m, d) {
    const key = y + '-' + m + '-' + d + '|' + PCH.lat + ',' + PCH.lon + '|' + pchCalTz();
    if (pchCal.cache[key]) return pchCal.cache[key];
    const jd = pchCalSunriseJD(y, m, d);
    const lon = sunMoonLongitudes(jd);
    const t = getTithi(lon.sun, lon.moon);
    return (pchCal.cache[key] = { name: t.name, idx: t.index, krishna: t.index >= 15, nak: getNakshatra(lon.moon, jd) });
  }
  // Purnimant masa for every day of a month, looked up per day with the app's
  // own getPurnimantMasa (so it matches the Vrat list / header in every year,
  // including adhik-masa years). Cached per month; costs well under 1 ms/month.
  function pchCalMonthMasa(y, m) {
    const key = 'masa|' + y + '-' + m + '|' + PCH.lat + ',' + PCH.lon + '|' + pchCalTz();
    if (pchCal.cache[key]) return pchCal.cache[key];
    const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(), out = [];
    for (let d = 1; d <= dim; d++) out.push(getPurnimantMasa(pchCalSunriseJD(y, m, d), pchCalDayInfo(y, m, d).idx));
    return (pchCal.cache[key] = out);
  }
  // ── Phase 3: vrat / tyohar / holiday data for the visible month ──
  // Uses the SAME builders as the home-page lists (so both always agree),
  // pointed at an explicit month via their optional start argument.
  function pchCalMonthData(y, m) {
    const key = y + '-' + m + '|' + PCH.lat + ',' + PCH.lon + '|' + (PCH.state || '') + '|' + pchCalTz();
    if (pchCal.monthCache[key]) return pchCal.monthCache[key];
    const tz = pchCalTz(), dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const days = {}; // day-of-month -> { vrat: label|'', govt: bool, hol: [{name, cats}] }
    const slot = function (d) { return days[d] || (days[d] = { vrat: '', govt: false, hol: [] }); };
    // start one day early so the builder sees the previous day's tithi when judging a festival at the month edge
    // (2 days early / 2 days late, so a festival just outside the month can still be matched against a holiday on the edge)
    const prev = new Date(Date.UTC(y, m, -1));
    const vrat = pchBuildVratTyoharList(dim + 3, { y: prev.getUTCFullYear(), m: prev.getUTCMonth(), d: prev.getUTCDate() });
    vrat.forEach(function (ev) {
      const l = ev.dateObj;                                  // vrat dateObj = UTC midnight of the local date
      if (l.getUTCFullYear() !== y || l.getUTCMonth() !== m) return;
      const s = slot(l.getUTCDate());
      s.vrat = ev.label;
    });
    // holiday dateObj = UTC midnight of the local date (same convention)
    pchBuildPublicHolidays(dim - 1, { y: y, m: m, d: 1 }, vrat).forEach(function (ev) { // published-list dates (red marks); tithi festival names still come from the Panchang (s.vrat)
      const s = slot(ev.dateObj.getUTCDate());
      // Calendar shows ONLY Central / State government holidays (other bodies' holidays stay in the Holiday list)
      if (!(ev.cats.has('central') || ev.cats.has('state'))) return;
      // Panchang is the authority for festival dates: if the same festival is dated on a different day by the
      // Panchang (within ±2 days), this day stays red (govt holiday) but does NOT carry the festival's label.
      const hd = ev.dateObj.getTime();
      const hidden = ev.entries.length > 0 && ev.entries.every(function (en) {
        const toks = pchCalHolTokens(en.name);
        if (!toks.length) return false;
        return vrat.some(function (v) {
          const diff = Math.round((v.dateObj.getTime() - hd) / 86400000);
          return diff !== 0 && Math.abs(diff) <= 2 && toks.some(function (t) { return v.label.indexOf(t) !== -1; });
        });
      });
      s.hol.push({ name: ev.name, hidden: hidden, cats: new Set(['central', 'state'].filter(c => ev.cats.has(c))) });
      s.govt = true; // central / state govt holiday → red date, like Sunday
    });
    return (pchCal.monthCache[key] = { days: days });
  }
  // Significant words of a holiday name, used to find the same festival in the Panchang's own list.
  const PCH_CAL_HOL_STOP = { 'अवकाश':1, 'जयंती':1, 'दिवस':1, 'पूजा':1, 'व्रत':1, 'गुरु':1, 'शनिवार':1, 'रविवार':1, 'द्वितीय':1, 'चतुर्थ':1, 'अनुमानित':1, 'उत्सव':1, 'नहीं':1 };
  function pchCalHolTokens(name) {
    return String(name).replace(/[()\/\-—,.।]/g, ' ').split(/\s+/).filter(function (t) { return t.length > 2 && !PCH_CAL_HOL_STOP[t]; });
  }
  // Short festival text for a cell: the vrat/tyohar if any, else the first holiday whose date agrees with the Panchang.
  function pchCalFestText(s) {
    if (!s) return '';
    const shown = s.hol.filter(function (h) { return !h.hidden; });
    const t = s.vrat || (shown.length ? shown[0].name : '');
    return t.replace(/\s*\([^)]*\)/g, '').split(', ')[0] || '';
  }
  // Short masa names for the calendar cells
  const MASA_SHORT = {
    'चैत्र':'चै.', 'वैशाख':'वै.', 'ज्येष्ठ':'ज्ये.', 'आषाढ़':'आषा.',
    'श्रावण':'श्रा.', 'भाद्रपद':'भा.', 'आश्विन':'आश्वि.', 'कार्तिक':'का.',
    'मार्गशीर्ष':'मार्ग.', 'पौष':'पौ.', 'माघ':'मा.', 'फाल्गुन':'फा.'
  };
  // "कार्तिक कृष्ण पक्ष"  →  "का. कृ. प."
  function pchCalPakshaForms(masa, krishna) {
    const abbr = krishna ? 'कृ.' : 'शु.';
    return [(MASA_SHORT[masa] || masa) + ' ' + abbr + ' प.'];
  }
  // Pick, per cell, the longest form that fits that cell's real width (so it
  // adapts to phone/tablet/desktop). If even the shortest overflows (a long
  // masa name such as मार्गशीर्ष on a narrow phone) it wraps onto two lines
  // instead of being cut off with "…". A hidden/not-yet-laid-out calendar
  // (width 0) keeps the full form and is re-fitted when it gets a size.
  function pchCalFitPaksha() {
    document.querySelectorAll('#pch-cal-grid .pch-cal-paksha').forEach(function (el) {
      const forms = el.getAttribute('data-p').split('|');
      el.classList.remove('wrap');
      el.textContent = forms[0];
      if (!el.clientWidth) return;
      let i = 0;
      while (el.scrollWidth > el.clientWidth + 1 && i < forms.length - 1) el.textContent = forms[++i];
      if (el.scrollWidth > el.clientWidth + 1) el.classList.add('wrap');
    });
  }
  function pchCalBindFit() {
    let t = 0;
    window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(pchCalFitPaksha, 120); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(pchCalFitPaksha); // web-font widths differ from the fallback
  }
  function pchCalAnimate(dir) {
    const g = document.getElementById('pch-cal-grid');
    g.classList.remove('pch-cal-in-next', 'pch-cal-in-prev');
    void g.offsetWidth;
    g.classList.add(dir > 0 ? 'pch-cal-in-next' : 'pch-cal-in-prev');
  }
  // Swipe left → next month, right → previous (mostly-horizontal, quick gestures only).
  function pchCalBindSwipe() {
    if (pchCal.swipeBound) return;
    const card = document.getElementById('pch-cal-grid').closest('.pch-cal-card');
    if (!card) return;
    pchCal.swipeBound = true;
    let sx = 0, sy = 0, st = 0;
    card.addEventListener('touchstart', function (e) { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st = Date.now(); }, { passive: true });
    card.addEventListener('touchend', function (e) {
      const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - st < 700) window.pchCalNav(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  function pchCalFmtHM(date) {
    const l = new Date(date.getTime() + pchCalTz() * 60000);
    const h = l.getUTCHours();
    return ((h % 12) || 12) + ':' + pad2(l.getUTCMinutes()) + (h >= 12 ? ' PM' : ' AM');
  }
  function pchCalIsToday(s) { const t = pchCalToday(); return s.y === t.y && s.m === t.m && s.d === t.d; }

  function pchCalRender() {
    const grid = document.getElementById('pch-cal-grid');
    if (!grid) return;
    const y = pchCal.y, m = pchCal.m;
    const today = pchCalToday(), minU = pchCalMinUTC(), maxU = pchCalMaxUTC();
    document.getElementById('pch-cal-dow').innerHTML = PCH_CAL_DOW.map(function (n) { return '<span>' + n + '</span>'; }).join('');
    document.getElementById('pch-cal-month').textContent = MONTH_NAMES_HI[m] + ' ' + y;
    let md = null;
    try { md = pchCalMonthData(y, m); } catch (e) { console.error('Calendar vrat/holiday data failed:', e); }

    // Masa shown under the month name (first → last day; "A – B" if it changes mid-month)
    const dimM = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const masaOf = pchCalMonthMasa(y, m), ma = masaOf[0], mb = masaOf[dimM - 1];
    document.getElementById('pch-cal-sub').textContent = (ma === mb ? ma : ma + ' – ' + mb) + ' (पूर्णिमांत)';

    const lead = new Date(Date.UTC(y, m, 1)).getUTCDay();
    const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    let html = '';
    for (let i = 0; i < lead; i++) html += '<div class="pch-cal-cell pch-cal-empty"></div>';
    for (let d = 1; d <= dim; d++) {
      const u = Date.UTC(y, m, d), info = pchCalDayInfo(y, m, d);
      const dow = (lead + d - 1) % 7;
      const isSel = pchCal.sel && pchCal.sel.y === y && pchCal.sel.m === m && pchCal.sel.d === d;
      const isToday = today.y === y && today.m === m && today.d === d;
      const cls = 'pch-cal-cell' + (dow === 0 ? ' is-sun' : '') + (isToday ? ' is-today' : '') + (isSel ? ' is-sel' : '') + (md && md.days[d] && md.days[d].govt ? ' is-hol' : '') + ((u < minU || u > maxU) ? ' is-dis' : '');
      const pk = pchCalPakshaForms(masaOf[d - 1], info.krishna), paksha = pk[0];
      const pakshaFull = masaOf[d - 1] + ' ' + (info.krishna ? 'कृष्ण' : 'शुक्ल') + ' पक्ष';
      html += '<button type="button" class="' + cls + '" onclick="pchCalSelect(' + y + ',' + m + ',' + d + ')" aria-label="' + d + ' ' + MONTH_NAMES_HI[m] + ' ' + pakshaFull + ' ' + info.name + '"'
            + (isSel ? ' aria-pressed="true"' : '') + '>'
            + '<span class="pch-cal-num">' + d + '</span><span class="pch-cal-tithi">' + info.name + '</span><span class="pch-cal-paksha" data-p="' + pk.join('|') + '">' + paksha + '</span>'
            + '<span class="pch-cal-nak">' + info.nak + '</span><span class="pch-cal-fest">' + pchCalFestText(md && md.days[d]) + '</span></button>';
    }
    grid.innerHTML = html;
    pchCalFitPaksha();
    document.getElementById('pch-cal-prev').disabled = Date.UTC(y, m, 1) <= minU;
    document.getElementById('pch-cal-next').disabled = Date.UTC(y, m + 1, 1) > maxU;
    pchCal.sig = y + '-' + m + '|' + PCH.lat + ',' + PCH.lon + '|' + pchCalTz() + '|' + today.d;
  }

  function pchCalUpdateInfo() {
    if (!pchCal.open || !pchCal.sel) return;
    const s = pchCal.sel, tz = pchCalTz(), wd = WEEKDAY_NAMES[new Date(Date.UTC(s.y, s.m, s.d)).getUTCDay()];
    document.getElementById('pch-cal-date').textContent = s.d + ' ' + MONTH_NAMES_HI[s.m] + ' ' + s.y + ', ' + wd;
    const inp = document.getElementById('pch-cal-time-input');
    let base = null, note = '', isSunrise = false, isLive = false;
    if (pchCal.loading) {
      note = 'सूर्योदय की पुष्टि हो रही है…';
    } else if (PCH.customDateTime) {
      base = PCH.customDateTime;
      const si = pchCal.sunInfo;
      if (pchCal.followNow) {
        isLive = true;
      } else if (si && Math.abs(si.sunrise.getTime() - base.getTime()) < 60000) {
        isSunrise = true;
        note = si.approx ? 'अनुमानित सूर्योदय' : '';
      }
    } else { base = new Date(); isLive = true; }
    if (base) inp.textContent = fmtTime(base, tz);   // read-only text, e.g. 8:15 AM
    document.getElementById('pch-cal-time-note').textContent = note;
    [['pch-cal-btn-sunrise', isSunrise], ['pch-cal-btn-live', isLive]].forEach(function (p) {
      const b = document.getElementById(p[0]);
      if (b) { b.classList.toggle('is-active', p[1]); b.setAttribute('aria-pressed', p[1] ? 'true' : 'false'); }
    });
    const isGps = PCH.name === 'वर्तमान GPS स्थान';
    const place = (PCH.name || '—') + (PCH.state ? ', ' + PCH.state : '');
    document.getElementById('pch-cal-loc').innerHTML = '<span class="pch-gt-placename">' + place + '</span><em class="pch-gt-mode">' + (isGps ? 'GPS' : 'Manual') + '</em>';
  }

  // Tap on a date: today → back to Live; any other date → confirm that
  // day's sunrise from Open-Meteo (offline fallback if it can't answer),
  // set time = sunrise and recalculate the whole panchang.
  window.pchCalSelect = async function (y, m, d, forceSunrise) {
    if (Date.UTC(y, m, d) < pchCalMinUTC() || Date.UTC(y, m, d) > pchCalMaxUTC()) return;
    pchCalBlurTime();
    pchCal.followNow = false;
    pchCal.sel = { y: y, m: m, d: d };
    const token = ++pchCal.token;
    if (pchCalIsToday(pchCal.sel) && !forceSunrise) {
      pchCal.loading = false; pchCal.sunInfo = null;
      pchCalRender();
      window.pchResetToLiveDateTime();
      pchCalUpdateInfo();
      return;
    }
    pchCal.loading = true;
    pchCalRender(); pchCalUpdateInfo();
    const ds = y + '-' + pad2(m + 1) + '-' + pad2(d);
    const r = await pchSunTimesWithFallback(ds);
    if (token !== pchCal.token) return; // user tapped another date meanwhile
    pchCal.loading = false;
    pchCal.sunInfo = { sunrise: r.sunrise, approx: !!r.approx };
    PCH.customDateTime = r.sunrise;
    pchBusy.show('calc');
    pchCalUpdateInfo();
    pchRunCalculation();
  };
  // Time picker: any time on the selected date (location's own clock).
  window.pchCalTimeChanged = function (v) {
    if (!v || !pchCal.sel || PCH.lat === null) return;
    pchCal.followNow = false;
    const hm = v.split(':').map(Number), s = pchCal.sel;
    PCH.customDateTime = new Date(Date.UTC(s.y, s.m, s.d, hm[0], hm[1]) - pchCalTz() * 60000);
    pchBusy.show('calc');
    pchCalUpdateInfo();
    pchRunCalculation();
  };
  window.pchCalSetSunrise = function () {
    if (pchCal.sel) window.pchCalSelect(pchCal.sel.y, pchCal.sel.m, pchCal.sel.d, true);
  };
  // Release focus from the time box so the field can show the new auto-selected time
  function pchCalBlurTime() {
    const inp = document.getElementById('pch-cal-time-input');
    if (inp && document.activeElement === inp) inp.blur();
  }
  window.pchCalScrollToCalendar = function () {
    const el = document.querySelector('#pch-cal-block .pch-cal-card');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  window.pchCalOpenTimePicker = function (inp) {
    try { if (inp && typeof inp.showPicker === 'function') inp.showPicker(); } catch (e) {}
  };
  window.pchCalLive = function () {
    pchCalBlurTime();
    pchCal.token++; pchCal.loading = false; pchCal.sunInfo = null;
    if (!pchCal.sel || pchCalIsToday(pchCal.sel)) {
      pchCal.followNow = false;
      if (!pchCal.sel) window.pchCalGoToday();
      window.pchResetToLiveDateTime();
      pchCalUpdateInfo();
      return;
    }
    // Another date is selected: keep that date, run the clock at the current time of day.
    pchCal.followNow = true;
    pchCalApplyNow(true);
    pchCalScheduleNow();
  };
  // Selected date + current time-of-day (location clock) as the calculation instant.
  function pchCalApplyNow(showBusy) {
    if (!pchCal.sel || PCH.lat === null) return;
    const s = pchCal.sel, tz = pchCalTz(), l = new Date(Date.now() + tz * 60000);
    const dt = new Date(Date.UTC(s.y, s.m, s.d, l.getUTCHours(), l.getUTCMinutes()) - tz * 60000);
    PCH.customDateTime = dt;
    pchCal.nowStamp = dt.getTime();
    if (showBusy) pchBusy.show('calc');
    pchCalUpdateInfo();
    pchRunCalculation();
  }
  function pchCalScheduleNow() {
    if (pchCal.nowTimer) { clearTimeout(pchCal.nowTimer); pchCal.nowTimer = null; }
    if (!pchCal.followNow) return;
    pchCal.nowTimer = setTimeout(function () {
      pchCal.nowTimer = null;
      if (!pchCal.followNow) return;
      // something else (e.g. the location selector) changed the instant → stop following the clock
      if (!PCH.customDateTime || PCH.customDateTime.getTime() !== pchCal.nowStamp) { pchCal.followNow = false; pchCalUpdateInfo(); return; }
      if (pchIsPageVisible()) pchCalApplyNow(false);
      pchCalScheduleNow();
    }, 60000 - (Date.now() % 60000) + 50);
  }
  window.pchCalNav = function (dir) {
    let y = pchCal.y, m = pchCal.m + dir;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    if (Date.UTC(y, m + 1, 0) < pchCalMinUTC() || Date.UTC(y, m, 1) > pchCalMaxUTC()) return;
    pchCal.y = y; pchCal.m = m;
    pchCalRender();
    pchCalAnimate(dir);
  };
  window.pchCalGoToday = function () {
    const t = pchCalToday();
    pchCal.y = t.y; pchCal.m = t.m; pchCal.sel = t;
    pchCalRender(); pchCalUpdateInfo();
  };
  // Called after every pchRunCalculation (every minute / location change):
  // keeps the time + location rows fresh; re-draws the grid only if the
  // visible month's inputs (location, timezone, today) changed.
  window.pchCalOnCalc = function () {
    if (!pchCal.open) { // first calculation (location is known now): start the calendar, selected = today
      pchCal.open = true;
      pchCalBindSwipe();
      pchCalBindFit();
      window.pchCalGoToday();
    }
    const lk = PCH.lat + ',' + PCH.lon + '|' + (PCH.state || '') + '|' + pchCalTz();
    if (pchCal.locKey && pchCal.locKey !== lk) { pchCal.cache = {}; pchCal.monthCache = {}; pchCal.sig = ''; }
    pchCal.locKey = lk;
    if (PCH.customDateTime && !pchCal.loading) { // e.g. set via the location selector
      const l = new Date(PCH.customDateTime.getTime() + pchCalTz() * 60000);
      const y = l.getUTCFullYear(), m = l.getUTCMonth(), d = l.getUTCDate(), s = pchCal.sel;
      if (!s || s.y !== y || s.m !== m || s.d !== d) { pchCal.sel = { y: y, m: m, d: d }; pchCal.y = y; pchCal.m = m; pchCal.sunInfo = null; pchCalRender(); }
    }
    const today = pchCalToday();
    if (pchCal.sig !== pchCal.y + '-' + pchCal.m + '|' + PCH.lat + ',' + PCH.lon + '|' + pchCalTz() + '|' + today.d) pchCalRender();
    pchCalUpdateInfo();
  };

  let pchCalcGeneration = 0;

  window.pchRunCalculation = async function pchRunCalculation() {
    // Overlay only follows calls that a user-initiated flow already opened it for;
    // silent background refreshes leave it untouched.
    const ours = pchBusy.isActive();
    const p = pchRunCalculationInner();
    const gen = pchCalcGeneration;
    try { await p; } finally {
      if (ours && gen === pchCalcGeneration) pchBusy.hide();
    }
    if (typeof window.pchCalOnCalc === 'function') { try { window.pchCalOnCalc(); } catch (e) {} }
  };

  async function pchRunCalculationInner() {
    const myGen = ++pchCalcGeneration; // guards against a slower, older call
                                        // overwriting a newer one's results
    document.getElementById('pch-content').style.display = 'block';
    const today = PCH.customDateTime ? new Date(PCH.customDateTime) : new Date();
    pchShowLocationBar();
    try {
      let sunToday, sunTomorrow, sunYesterday;
      try {
        const tzForDate = PCH.tzOffsetMin || 330; // best guess until the fetch below resolves the real one
        const tmrw = new Date(today.getTime() + 86400000);
        const yday = new Date(today.getTime() - 86400000);
        // Live mode keeps the original strict behaviour; a user-chosen date/time
        // (calendar) may be beyond the API's range, so it gets the fallback.
        const getSun = PCH.customDateTime ? pchSunTimesWithFallback : pchFetchSunTimes;
        [sunToday, sunTomorrow, sunYesterday] = await Promise.all([
          getSun(ymdAtOffset(today, tzForDate)),
          getSun(ymdAtOffset(tmrw, tzForDate)),
          // only feeds the midnight->sunrise Choghadiya slots; if it fails we
          // fall back to an approximation below instead of blocking the page
          getSun(ymdAtOffset(yday, tzForDate)).catch(function () { return null; })
        ]);
      } catch (e) {
        if (myGen === pchCalcGeneration) pchSetStatus('सूर्योदय/सूर्यास्त डेटा प्राप्त करने में त्रुटि। इंटरनेट जाँचें।', true);
        return;
      }
      if (myGen !== pchCalcGeneration) return; // a newer call has since started — abandon this one
      pchBusy.set('calc');
      if (!sunToday.sunrise || !sunToday.sunset) {
        pchSetStatus('इस स्थान के लिए सूर्योदय/सूर्यास्त डेटा उपलब्ध नहीं है।', true);
        return;
      }
      const tz = PCH.tzOffsetMin || 330;
      const sunrise = sunToday.sunrise, sunset = sunToday.sunset;
      const nextSunrise = sunTomorrow.sunrise || addMinutes(sunrise, 1440);
      // yesterday's sunset starts the Choghadiya night that is still running
      // between midnight and today's sunrise (sunset moves < ~2 min/day, so the
      // 24h-earlier approximation is a safe fallback)
      const prevSunset = (sunYesterday && sunYesterday.sunset) || addMinutes(sunset, -1440);

      // Tithi/Nakshatra/Yoga/Karana genuinely change through the day, so they
      // are computed for RIGHT NOW (not frozen at sunrise) — every time this
      // page is opened, `today` above is a fresh Date and this recomputes
      // fresh Sun/Moon longitudes for that exact instant.
      const jdNow = julianDay(today);
      const { sun, moon } = sunMoonLongitudes(jdNow);
      const tithi = getTithi(sun, moon);
      const nakshatra = getNakshatra(moon, jdNow);
      const yoga = getYoga(sun, moon, jdNow);
      const karana = getKarana(sun, moon);
      const weekdayIdx = new Date(sunrise.getTime() + tz*60000).getUTCDay();

      // Moonrise/moonset — search the local calendar day (UTC-based Julian day window shifted to local midnight)
      const moonRS = findMoonRiseSet(Math.floor(julianDay(addMinutes(today, -tz))), PCH.lat, PCH.lon);

      if (myGen !== pchCalcGeneration) return; // abandon stale result just before painting

      const localNow = new Date(today.getTime() + tz*60000);
      // Formats a JD as "<time> तक" when it falls on today, "<time> कल तक"
      // when it falls on tomorrow (so it's clear the transition rolls into
      // the next day), and "<date> तक" for anything further out.
      function fmtTak(jdEnd, withParens) {
        if (!jdEnd) return '';
        const endDate = toDate(jdEnd);
        const endLocal = new Date(endDate.getTime() + tz * 60000);
        const sameDay = endLocal.getUTCFullYear() === localNow.getUTCFullYear() &&
                         endLocal.getUTCMonth() === localNow.getUTCMonth() &&
                         endLocal.getUTCDate() === localNow.getUTCDate();
        let inner;
        if (sameDay) {
          inner = fmtTime(endDate, tz) + ' तक';
        } else {
          const nextDay = new Date(localNow.getTime());
          nextDay.setUTCDate(nextDay.getUTCDate() + 1);
          const isNextDay = endLocal.getUTCFullYear() === nextDay.getUTCFullYear() &&
                             endLocal.getUTCMonth() === nextDay.getUTCMonth() &&
                             endLocal.getUTCDate() === nextDay.getUTCDate();
          if (isNextDay) {
            inner = fmtTime(endDate, tz) + ' कल तक';
          } else {
            const dateStr = endLocal.getUTCDate() + ' ' + MONTH_NAMES_HI[endLocal.getUTCMonth()] +
                             (endLocal.getUTCFullYear() !== localNow.getUTCFullYear() ? ' ' + endLocal.getUTCFullYear() : '');
            inner = dateStr + ' तक';
          }
        }
        return withParens ? ' <span style="font-weight:400 !important;">(' + inner + ')</span>' : ' ' + inner;
      }

      // Each section below is independently guarded: an edge-case failure
      // in any single calculation (a particular date/location tripping up
      // one astronomy routine) must not blank out the other, unrelated
      // sections on the page. Previously this whole pipeline shared one
      // try/catch, so a single throw partway through silently left every
      // section *after* it empty (they'd never been written yet on a first
      // load) or stale (on a refresh) — which is what caused sections like
      // "शुभ-अशुभ मुहूर्त" to intermittently appear blank. pchSafeSection
      // isolates each one: on failure it logs the real error to the
      // console (for debugging) and leaves a small visible notice instead
      // of a silent gap, without touching any other section.
      function pchSafeSection(label, elId, fn) {
        try {
          fn();
        } catch (err) {
          console.error('Panchang section failed [' + label + ']:', err);
          const el = typeof elId === 'string' ? document.getElementById(elId) : null;
          if (el) el.innerHTML = '<div style="padding:8px 2px; color:var(--ink-soft); font-size:12.5px;">डेटा लोड नहीं हो सका</div>';
        }
      }

      pchSafeSection('tatva-samvat-ritu-masa', null, function () {
        let samvatYear;
        try { samvatYear = vikramSamvatAt(jdNow); } catch (e) { samvatYear = vikramSamvat(today); }   // never let this block the rest of the section
        document.getElementById('pch-tatva-samvat').textContent = 'वर्ष ' + samvatYear;
        const rituEndJD = findRituTransitionJD(jdNow);
        const rituEndLocal = rituEndJD ? new Date(toDate(rituEndJD).getTime() + tz * 60000) : null;
        document.getElementById('pch-ritu').innerHTML = getDrikRitu(jdNow) +
          (rituEndLocal ? ' <span style="font-weight:400 !important;">(' + rituEndLocal.getUTCDate() + ' ' + MONTH_NAMES_HI[rituEndLocal.getUTCMonth()] + ' तक)</span>' : '');
        const ayanEndJD = findNextTransitionSlow(jdNow, ayanIndexAt, 200);
        const ayanEndLocal = ayanEndJD ? new Date(toDate(ayanEndJD).getTime() + tz * 60000) : null;
        document.getElementById('pch-ayan').innerHTML = getAyan(jdNow) +
          (ayanEndLocal ? ' <span style="font-weight:400 !important;">(' + ayanEndLocal.getUTCDate() + ' ' + MONTH_NAMES_HI[ayanEndLocal.getUTCMonth()] + ' तक)</span>' : '');
        const masaEndJD = findNextTransitionSlow(jdNow, purnimantMasaIndexAt, 20);
        document.getElementById('pch-purnimant-masa').innerHTML = getPurnimantMasa(jdNow, tithi.index) + fmtTak(masaEndJD, true);
        document.getElementById('pch-paksha').textContent = tithi.paksha;
        document.getElementById('pch-disha-shool').textContent = getDishaShool(weekdayIdx);
      });

      pchSafeSection('tithi-nakshatra-yoga-karana', null, function () {
        const tithiEndJD = findNextTransition(jdNow, tithiIndexAt);
        const nakshatraEndJD = findNextTransition(jdNow, nakshatraIndexAt);
        const yogaEndJD = findNextTransition(jdNow, yogaIndexAt);
        const karanaEndJD = findNextTransition(jdNow, karanaIndexAt);
        document.getElementById('pch-tithi').innerHTML = tithi.name + fmtTak(tithiEndJD, true);
        document.getElementById('pch-nakshatra').innerHTML = nakshatra + fmtTak(nakshatraEndJD, true);
        document.getElementById('pch-yoga').innerHTML = yoga + fmtTak(yogaEndJD, true);
        document.getElementById('pch-karana').innerHTML = karana + fmtTak(karanaEndJD, true);
      });

      pchSafeSection('rashi-balam', null, function () {
        const chandraRashiEndJD = findNextTransitionSlow(jdNow, chandraRashiIndexAt, 5);
        const suryaRashiEndJD = findNextTransitionSlow(jdNow, suryaRashiIndexAt, 35);
        document.getElementById('pch-chandra-rashi').innerHTML = getChandraRashi(moon, jdNow) + fmtTak(chandraRashiEndJD, true);
        document.getElementById('pch-surya-rashi').innerHTML = getSuryaRashi(sun, jdNow) + fmtTak(suryaRashiEndJD, true);
        pchRenderBalam(chandraRashiIndexAt(jdNow), nakshatraIndexAt(jdNow));
      });

      pchSafeSection('date-sun-moon-summary', null, function () {
        document.getElementById('pch-date-summary').textContent = localNow.getUTCDate() + ' ' + MONTH_NAMES_HI[localNow.getUTCMonth()] + ' ' + localNow.getUTCFullYear() + ' ' + WEEKDAY_NAMES[weekdayIdx];
        document.getElementById('pch-time-summary').textContent = fmtTime(today, tz);
        document.getElementById('pch-sunrise-summary').textContent = fmtTime(sunrise, tz);
        document.getElementById('pch-moonrise-summary').textContent = moonRS.riseJD ? fmtTime(toDate(moonRS.riseJD), tz) : 'N/A';
        document.getElementById('pch-sunset-summary').textContent = fmtTime(sunset, tz);
        document.getElementById('pch-moonset-summary').textContent = moonRS.setJD ? fmtTime(toDate(moonRS.setJD), tz) : 'N/A';
      });

      pchSafeSection('muhurat', 'pch-muhurt-grid', function () {
        const rahu = kaalWindow(sunrise, sunset, weekdayIdx, RAHU_SLOT);
        const yama = kaalWindow(sunrise, sunset, weekdayIdx, YAMA_SLOT);
        const gulika = kaalWindow(sunrise, sunset, weekdayIdx, GULIKA_SLOT);
        const abhijit = abhijitWindow(sunrise, sunset);
        const brahma = brahmaMuhurtWindow(sunrise);
        const localMidnightUTC = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()) - tz * 60000);
        const jdMidnightUTC = julianDay(localMidnightUTC);
        const bhadra = findBhadraKaalToday(jdMidnightUTC);

        const muhurtList = [
          { label: 'ब्रह्म मुहूर्त', cls: 'pch-good', start: brahma.start, end: brahma.end },
          { label: 'राहु काल',       cls: 'pch-bad',  start: rahu.start,   end: rahu.end },
          { label: 'यमगण्ड',        cls: 'pch-bad',  start: yama.start,   end: yama.end },
          { label: 'गुलिक काल',      cls: 'pch-bad',  start: gulika.start, end: gulika.end },
          { label: 'अभिजित मुहूर्त', cls: 'pch-good', start: abhijit.start, end: abhijit.end },
          { label: 'भद्रा काल', cls: 'pch-bad',
            start: bhadra ? bhadra.start : null, end: bhadra ? bhadra.end : null }
        ];
        muhurtList.sort((a, b) => {
          if (!a.start && !b.start) return 0;
          if (!a.start) return 1;
          if (!b.start) return -1;
          return a.start - b.start;
        });
        document.getElementById('pch-muhurt-grid').innerHTML = muhurtList.map(m =>
          '<div class="pch-item ' + m.cls + '"><div class="pch-label">' + m.label + '</div><div class="pch-value">' +
          (m.start ? (fmtTime(m.start, tz) + ' – ' + fmtTime(m.end, tz) + ((today >= m.start && today < m.end) ? '<span class="pch-muhurt-nowtag">अभी</span>' : '')) : 'आज नहीं') +
          '</div></div>'
        ).join('');
      });

      pchSafeSection('choghadiya', 'pch-choghadiya-list', function () {
        pchLastChogh = buildChoghadiya(sunrise, sunset, nextSunrise, weekdayIdx, prevSunset);
        pchRenderChoghadiya();
        pchRenderChoghadiyaFull();
      });

      pchSafeSection('muhurt-dates', 'pch-muhurt-dates-list', function () {
        pchRenderMuhurtDates(ymdAtOffset(today, tz));
      });

      // Both lists depend only on the local calendar date, the time zone, the
      // location (Sankranti observance day) and the state (holiday gating) —
      // never on the time of day — so they are rebuilt only when one of those
      // changes, not on every minute tick.
      if (myGen === pchCalcGeneration) {
        const vratKey = [tz, PCH.lat, PCH.lon, PCH.state, ymdAtOffset(today, tz)].join('|');
        if (vratKey !== pchVratRenderedKey) {
          pchSafeSection('vrat-holidays', 'pch-vrat-list', function () {
            pchRenderVratTyohar();
            pchRenderHolidays();
            pchVratRenderedKey = vratKey;   // only after a successful render, so a failure retries next tick
          });
        }
      }

      if (myGen === pchCalcGeneration) {
        // first successful render: let the product tour decide whether to greet this user
        try {
          if (typeof window.spTourMaybeStart === 'function') window.spTourMaybeStart();
        } catch (tourErr) {
          console.warn('Product tour could not start:', tourErr);   // never surface as a calculation error
        }
      }
    } catch (err) {
      // Anything that throws here happens before the individually-guarded
      // sections above (e.g. the sunrise/sunset fetch or moonrise/moonset
      // search) — genuinely fatal, since every section below depends on it.
      console.error('Panchang calculation error:', err);
      if (myGen === pchCalcGeneration) {
        pchSetStatus('गणना में त्रुटि हुई। कृपया पुनः प्रयास करें। (' + (err && err.message ? err.message : 'unknown error') + ')', true);
      }
    }
  }


  /* ══════════════════════════════════════════════════════════════════
     ELEMENT DETAIL PAGE
     Tapping a transitioning container on the Panchang page (तिथि, नक्षत्र,
     योग, करण, चंद्र/सूर्य राशि, मास, पक्ष, ऋतु, चंद्रबल, ताराबल) opens a
     dedicated page with a single vertical timeline:

         previous  ──●──  current (live progress)  ──●──  next

     Every dot is a transition timestamp. The boundaries are found with the
     SAME Sun/Moon engine as the rest of the page, so they always agree with
     the "(… तक)" times shown on the main screen: scan outward from "now" in
     coarse steps until the element's index changes, then bisect to refine.
     Going backwards gives the start of the current element and the start of
     the previous one; going forwards gives the end of the current element
     and the end of the next one.
     ══════════════════════════════════════════════════════════════════ */
  const ELD_PAGE_ID = 'page-element-detail';
  const ELD_EPS = 1e-4;                 // ~8.6 s, in days: safely steps over a bisected boundary
  const ELD_PAKSHA = ['शुक्ल पक्ष', 'कृष्ण पक्ष'];
  const ELD_HOUSE_SUFFIX = 'वां भाव';

  let eldKey = null;                    // which element is open
  let eldTL = null;                     // last built timeline { prev, cur, next } (JD values)
  let eldTimer = null;
  let eldScrollY = 0;                   // main-page scroll position to restore on back
  let eldBirth = null;                  // { rashiIdx, nakshatraIdx } for चंद्रबल / ताराबल

  function eldBalamHouse(rashiIdx) { return balamHouse(rashiIdx, eldBirth.rashiIdx); }
  function eldTaraIdx(nakIdx) { return taraIndex(nakIdx, eldBirth.nakshatraIdx); }

  // step / maxDays = scan resolution and search window (days) for that element.
  // A step must stay well below the element's SHORTEST possible duration, or a whole
  // element could be skipped between two samples. Shortest cases: tithi ≈ 19.6 h,
  // nakshatra ≈ 20.8 h, yoga ≈ 19.5 h, karana ≈ 9.8 h, Moon-in-rashi ≈ 1.9 d, Sun-in-rashi ≈ 29 d,
  // paksha ≈ 14 d, month ≈ 29 d, ritu ≈ 55 d, ayan ≈ 178 d, Vikram Samvat ≈ 354 d.
  const ELD_SPECS = {
    tithi: {
      label: 'तिथि', fem: true, idxFn: tithiIndexAt, step: 0.5, maxDays: 3,
      desc: 'चंद्र और सूर्य के बीच हर 12° के अंतर पर तिथि बदलती है — कुल 30 तिथियाँ',
      name: i => TITHI_NAMES[i],
      sub: i => ELD_PAKSHA[i < 15 ? 0 : 1] + ' · ' + ((i % 15) + 1) + ' / 15'
    },
    nakshatra: {
      label: 'नक्षत्र', idxFn: nakshatraIndexAt, step: 0.5, maxDays: 3,
      desc: 'चंद्रमा के हर 13°20′ के खंड से एक नक्षत्र — कुल 27 नक्षत्र',
      name: i => NAKSHATRA_NAMES[i],
      sub: i => 'नक्षत्र ' + (i + 1) + ' / 27'
    },
    yoga: {
      label: 'योग', idxFn: yogaIndexAt, step: 0.5, maxDays: 3,
      desc: 'सूर्य और चंद्र के देशांतर के योग के हर 13°20′ से एक योग — कुल 27 योग',
      name: i => YOGA_NAMES[i],
      sub: i => 'योग ' + (i + 1) + ' / 27'
    },
    karana: {
      label: 'करण', idxFn: karanaIndexAt, step: 0.25, maxDays: 2,
      desc: 'तिथि का आधा भाग (6° का अंतर) एक करण होता है — एक चक्र में 60 करण-खंड',
      name: karanaName,
      sub: i => isVishtiKaranaIdx(i) ? 'भद्रा काल — अशुभ' : 'करण-खंड ' + (i + 1) + ' / 60',
      tone: i => isVishtiKaranaIdx(i) ? 'bad' : ''
    },
    chandra: {
      label: 'चंद्र राशि', fem: true, idxFn: chandraRashiIndexAt, step: 0.5, maxDays: 5,
      desc: 'चंद्रमा लगभग सवा दो दिन में एक राशि से दूसरी राशि में जाता है',
      name: i => RASHI_NAMES[i],
      sub: i => 'राशि ' + (i + 1) + ' / 12'
    },
    surya: {
      label: 'सूर्य राशि', fem: true, idxFn: suryaRashiIndexAt, step: 1, maxDays: 35,
      desc: 'सूर्य लगभग एक माह में एक राशि बदलता है — इस बदलाव को संक्रांति कहते हैं',
      name: i => RASHI_NAMES[i],
      sub: i => 'राशि ' + (i + 1) + ' / 12'
    },
    masa: {
      label: 'पूर्णिमांत मास', idxFn: purnimantMasaIndexAt, step: 1, maxDays: 35,
      desc: 'पूर्णिमांत पद्धति में मास पूर्णिमा के अंत पर बदलता है',
      name: i => MASA_NAMES[i],
      sub: () => 'पूर्णिमांत मास'
    },
    paksha: {
      label: 'पक्ष', idxFn: jd => (tithiIndexAt(jd) >= 15 ? 1 : 0), step: 1, maxDays: 20,
      desc: 'अमावस्या के बाद शुक्ल पक्ष और पूर्णिमा के बाद कृष्ण पक्ष आरंभ होता है',
      name: i => ELD_PAKSHA[i],
      sub: () => '15 तिथियाँ'
    },
    ritu: {
      label: 'ऋतु', fem: true, idxFn: drikRituIndexAt, step: 1, maxDays: 66,
      desc: 'सूर्य के हर 60° के सायन देशांतर पर ऋतु बदलती है — कुल 6 ऋतुएँ',
      name: i => RITU_NAMES[i],
      sub: i => 'ऋतु ' + (i + 1) + ' / 6'
    },
    ayan: {
      label: 'अयन', idxFn: ayanIndexAt, step: 5, maxDays: 200,
      desc: 'सूर्य के निरयन देशांतर के 90° (कर्क संक्रांति) और 270° (मकर संक्रांति) पर अयन बदलता है — दोनों वर्ष में एक-एक बार',
      name: i => (i === 1 ? 'दक्षिणायन' : 'उत्तरायण'),
      sub: i => (i === 1 ? 'कर्क संक्रांति से मकर संक्रांति तक' : 'मकर संक्रांति से कर्क संक्रांति तक')
    },
    samvat: {
      label: 'विक्रम संवत', idxFn: vikramSamvatAt, step: 15, maxDays: 400,
      desc: 'विक्रम संवत का नया वर्ष चैत्र शुक्ल प्रतिपदा (हिन्दू नववर्ष) से आरंभ होता है',
      name: i => 'विक्रम संवत ' + i,
      cap: i => 'संवत ' + i,
      sub: () => 'चैत्र शुक्ल प्रतिपदा से फाल्गुन अमावस्या तक'
    },
    chandrabal: {
      label: 'चंद्रबल', needsBirth: true, idxFn: chandraRashiIndexAt, step: 0.5, maxDays: 5,
      desc: 'आपकी जन्म राशि से गिना गया चंद्रमा का भाव — चंद्र राशि बदलते ही चंद्रबल भी बदलता है',
      name: i => isGoodHouse(eldBalamHouse(i)) ? 'शुभ' : 'अशुभ',
      cap: i => RASHI_NAMES[i] + ' राशि',
      sub: i => 'चंद्र राशि ' + RASHI_NAMES[i] + ' · ' + eldBalamHouse(i) + ELD_HOUSE_SUFFIX,
      tone: i => isGoodHouse(eldBalamHouse(i)) ? 'good' : 'bad'
    },
    tarabal: {
      label: 'ताराबल', needsBirth: true, idxFn: nakshatraIndexAt, step: 0.5, maxDays: 3,
      desc: 'आपके जन्म नक्षत्र से गिनी गई तारा — नक्षत्र बदलते ही ताराबल भी बदलता है',
      name: i => TARA_NAMES[eldTaraIdx(i)] + ' (' + (TARA_GOOD[eldTaraIdx(i)] ? 'शुभ' : 'अशुभ') + ')',
      cap: i => NAKSHATRA_NAMES[i] + ' नक्षत्र',
      sub: i => 'नक्षत्र ' + NAKSHATRA_NAMES[i],
      tone: i => TARA_GOOD[eldTaraIdx(i)] ? 'good' : 'bad'
    }
  };

  /* ── boundary search ── */
  // First instant (JD) at which the index differs from the one at `jd`,
  // searching forward (dir=+1) — or the first instant of the *current* index
  // when searching backward (dir=-1). null if nothing changes inside maxDays.
  function eldFindBoundary(jd, fn, dir, step, maxDays) {
    const startIdx = fn(jd);
    const n = Math.ceil(maxDays / step);
    const rounds = Math.max(1, Math.ceil(Math.log2(step / 1e-6)));   // ≈ 1e-6 day (0.09 s) resolution
    let prev = jd;
    for (let i = 1; i <= n; i++) {
      const cur = jd + dir * step * i;
      if (fn(cur) !== startIdx) {
        let a = dir > 0 ? prev : cur;   // earlier instant of the bracket
        let b = dir > 0 ? cur : prev;   // later instant of the bracket
        for (let k = 0; k < rounds; k++) {
          const mid = (a + b) / 2;
          const same = fn(mid) === startIdx;
          if (dir > 0) { if (same) a = mid; else b = mid; }
          else         { if (same) b = mid; else a = mid; }
        }
        return b;
      }
      prev = cur;
    }
    return null;
  }

  // Re-opening an element (or stepping back and forth in the tour) reuses the last timeline
  // while "now" is still inside its current element — the astronomy doesn't change.
  const eldCache = {};
  function eldTimeline(spec, jdNow) {
    const ck = eldKey + (spec.needsBirth ? ':' + eldBirth.rashiIdx + '.' + eldBirth.nakshatraIdx : '');
    const hit = eldCache[ck];
    if (hit && hit.cur.start != null && hit.cur.end != null && jdNow >= hit.cur.start && jdNow < hit.cur.end) return hit;
    const tl = eldBuild(spec, jdNow);
    if (tl.cur.start != null && tl.cur.end != null) eldCache[ck] = tl;
    return tl;
  }

  function eldBuild(spec, jdNow) {
    const fn = spec.idxFn, st = spec.step, mx = spec.maxDays;
    const curStart = eldFindBoundary(jdNow, fn, -1, st, mx);
    const curEnd   = eldFindBoundary(jdNow, fn, +1, st, mx);
    let prev = null, next = null;
    if (curStart != null) {
      const j = curStart - ELD_EPS;
      prev = { idx: fn(j), start: eldFindBoundary(j, fn, -1, st, mx), end: curStart };
    }
    if (curEnd != null) {
      const j = curEnd + ELD_EPS;
      next = { idx: fn(j), start: curEnd, end: eldFindBoundary(j, fn, +1, st, mx) };
    }
    return { prev: prev, cur: { idx: fn(jdNow), start: curStart, end: curEnd }, next: next };
  }

  /* ── formatting ── */
  function eldNow() { return PCH.customDateTime ? new Date(PCH.customDateTime) : new Date(); }
  function eldLocal(date) { return new Date(date.getTime() + (PCH.tzOffsetMin || 330) * 60000); }
  function eldDateLine(date, nowDate) {
    const l = eldLocal(date), n = eldLocal(nowDate);
    let s = l.getUTCDate() + ' ' + MONTH_NAMES_HI[l.getUTCMonth()];
    if (l.getUTCFullYear() !== n.getUTCFullYear()) s += ' ' + l.getUTCFullYear();
    s += ', ' + WEEKDAY_NAMES[l.getUTCDay()];
    const sameDay = l.getUTCFullYear() === n.getUTCFullYear() && l.getUTCMonth() === n.getUTCMonth() && l.getUTCDate() === n.getUTCDate();
    return (sameDay ? 'आज · ' : '') + s;
  }
  // "3 दिन 4 घंटे" / "5 घंटे 12 मिनट" / "42 मिनट"
  function eldDur(days) {
    const m = Math.max(0, Math.round(days * 1440));
    const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mi = m % 60;
    const parts = [];
    if (d) parts.push(d + ' दिन');
    if (h) parts.push(h + ' घंटे');
    if (mi && !d) parts.push(mi + ' मिनट');
    return parts.length ? parts.join(' ') : '0 मिनट';
  }

  /* ── rendering ── */
  let eldRefs = null;   // live-updated nodes, looked up once per render instead of on every tick

  function eldRender() {
    try {
      eldRenderUnsafe();
    } catch (err) {
      console.error('Element timeline failed [' + eldKey + ']:', err);
      eldTL = null; eldRefs = null;
      const host = document.getElementById('eld-timeline');
      if (host) {
        host.innerHTML = '<div class="eld-error" role="alert"><div>समय-रेखा तैयार नहीं हो सकी।</div>'
          + '<button type="button" onclick="pchRetryElementDetail()">पुनः प्रयास करें</button></div>';
      }
    }
  }
  window.pchRetryElementDetail = function () { if (eldIsOpen()) eldRender(); };

  function eldRenderUnsafe() {
    const spec = ELD_SPECS[eldKey];
    const host = document.getElementById('eld-timeline');
    if (!spec || !host) return;
    const nowDate = eldNow(), jdNow = julianDay(nowDate);
    if (!Number.isFinite(jdNow)) throw new Error('invalid current time');
    const tz = PCH.tzOffsetMin || 330;
    const tl = eldTimeline(spec, jdNow);
    eldTL = tl;

    const cap = i => (spec.cap ? spec.cap(i) : spec.name(i));
    const adj = { past: spec.fem ? 'पिछली ' : 'पिछला ', current: 'वर्तमान ', future: 'आगामी ' };
    const rows = [];

    function boundary(jdB, caption, fallbackPast) {
      const isPast = jdB != null ? jdB <= jdNow : fallbackPast;
      let when = '<span class="eld-ts">—</span>';
      if (jdB != null) {
        const d = toDate(jdB);
        when = '<span class="eld-ts">' + fmtTime(d, tz) + '</span><span class="eld-date">' + eldDateLine(d, nowDate) + '</span>';
      }
      return function (extra) {
        return '<div class="eld-row eld-boundary ' + extra + '">'
          + '<div class="eld-rail"><span class="eld-line' + (isPast ? '' : ' is-future') + '"></span><span class="eld-dot' + (isPast ? ' is-past' : '') + '"></span></div>'
          + '<div class="eld-bcontent"><div class="eld-when">' + when + '</div><div class="eld-cap">' + caption + '</div></div></div>';
      };
    }

    function segment(kind, item) {
      const tone = spec.tone ? spec.tone(item.idx) : '';
      const hasRange = item.start != null && item.end != null;
      let rail;
      if (kind === 'current' && hasRange) {
        rail = '<div class="eld-rail" id="eld-rail-cur"><span class="eld-line is-track"><span class="eld-line-fill"></span></span><span class="eld-now" title="अभी"></span></div>';
      } else {
        rail = '<div class="eld-rail"><span class="eld-line' + (kind === 'future' ? ' is-future' : '') + '"></span></div>';
      }
      let inner = '<div class="eld-tag">' + (kind === 'current' ? '<span class="eld-live-dot"></span>' : '') + adj[kind] + spec.label + '</div>'
        + '<div class="eld-name' + (tone ? ' ' + tone : '') + '">' + spec.name(item.idx) + '</div>'
        + '<div class="eld-sub">' + spec.sub(item.idx) + '</div>';
      if (kind === 'current' && hasRange) {
        inner += '<div class="eld-bar"><span class="eld-bar-fill" id="eld-bar-fill"></span></div>'
          + '<div class="eld-prog-meta">'
          + '<span>बीता <b id="eld-elapsed">—</b></span>'
          + '<span class="eld-pct" id="eld-pct">0%</span>'
          + '<span>शेष <b id="eld-remain">—</b></span></div>';
      }
      if (hasRange) inner += '<div class="eld-dur">कुल अवधि: ' + eldDur(item.end - item.start) + '</div>';
      return function () {
        return '<div class="eld-row eld-seg eld-seg--' + kind + '">' + rail
          + '<div class="eld-seg-card' + (tone ? ' ' + tone : '') + '">' + inner + '</div></div>';
      };
    }

    const p = tl.prev, c = tl.cur, n = tl.next;
    if (p) {
      rows.push(boundary(p.start, cap(p.idx) + ' प्रारंभ', true));
      rows.push(segment('past', p));
    }
    rows.push(boundary(c.start,
      (p ? cap(p.idx) + ' समाप्त · ' : '') + cap(c.idx) + ' प्रारंभ', true));
    rows.push(segment('current', c));
    rows.push(boundary(c.end,
      cap(c.idx) + ' समाप्त' + (n ? ' · ' + cap(n.idx) + ' प्रारंभ' : ''), false));
    if (n) {
      rows.push(segment('future', n));
      rows.push(boundary(n.end, cap(n.idx) + ' समाप्त', false));
    }

    // first/last rail stubs stop at the dot instead of running off the card
    host.innerHTML = rows.map(function (r, i) {
      const extra = (i === 0 ? 'eld-first' : '') + (i === rows.length - 1 ? ' eld-last' : '');
      return r(extra.trim());
    }).join('');

    const noteEl = document.getElementById('eld-note');
    if (noteEl) {
      noteEl.textContent = 'सभी समय ' + (PCH.name ? PCH.name : 'चयनित स्थान') + ' के स्थानीय समय अनुसार · गणना अनुमानित है';
    }
    eldRefs = {
      clock: document.getElementById('eld-now-clock'),
      bar: document.getElementById('eld-bar-fill'),
      pct: document.getElementById('eld-pct'),
      elapsed: document.getElementById('eld-elapsed'),
      remain: document.getElementById('eld-remain'),
      rail: document.getElementById('eld-rail-cur')
    };
    eldUpdateLive(jdNow);
  }

  // Cheap per-tick update: progress bar, rail marker, elapsed/remaining, clock.
  function eldUpdateLive(jdNow) {
    const R = eldRefs;
    if (!R) return;
    const tz = PCH.tzOffsetMin || 330;
    if (R.clock) R.clock.textContent = (PCH.customDateTime ? 'चयनित समय: ' : 'अभी: ') + fmtTime(eldNow(), tz);
    const c = eldTL && eldTL.cur;
    if (!c || c.start == null || c.end == null) return;
    const total = c.end - c.start;
    const p = total > 0 ? Math.min(1, Math.max(0, (jdNow - c.start) / total)) : 0;
    if (R.bar) R.bar.style.width = (p * 100).toFixed(2) + '%';
    if (R.pct) R.pct.textContent = (p * 100).toFixed(1) + '%';
    if (R.elapsed) R.elapsed.textContent = eldDur(Math.max(0, jdNow - c.start));
    if (R.remain) R.remain.textContent = eldDur(Math.max(0, c.end - jdNow));
    if (R.rail) R.rail.style.setProperty('--p', p.toFixed(4));
  }

  function eldTick() {
    const page = document.getElementById(ELD_PAGE_ID);
    if (!page || page.style.display === 'none') { eldStopTimer(); return; }
    const jdNow = julianDay(eldNow());
    if (!Number.isFinite(jdNow)) return;
    // crossed into the next element: rebuild the whole timeline
    if (eldTL && eldTL.cur.end != null && jdNow >= eldTL.cur.end) { eldRender(); return; }
    eldUpdateLive(jdNow);
  }
  function eldStopTimer() { if (eldTimer) { clearInterval(eldTimer); eldTimer = null; } }
  // No point ticking a page nobody can see: paused while the tab is hidden, resumed (with an
  // immediate catch-up tick) when it comes back — see the visibilitychange listener below.
  function eldStartTimer() { eldStopTimer(); if (!document.hidden) eldTimer = setInterval(eldTick, 10000); }

  /* ── open / close ── */
  window.pchOpenElementDetail = function (key) {
    const spec = ELD_SPECS[key];
    if (!spec || PCH.lat === null) return;
    if (spec.needsBirth) {
      const birth = pchGetBirthDetails();
      let idx = null;
      try { idx = birth ? pchBirthIndices(birth.birthDate, birth.birthTime) : null; } catch (e) { idx = null; }
      if (!idx) { window.openProfileModal(); return; }   // missing OR unusable → ask in the profile popup
      eldBirth = idx;
    }
    eldKey = key;
    eldScrollY = window.pageYOffset || 0;
    document.getElementById('eld-title').textContent = spec.label;
    document.getElementById('eld-sub').textContent = spec.desc;
    document.getElementById('eld-section-title').textContent = 'समय-रेखा';
    showSecondaryPage(ELD_PAGE_ID);
    eldRender();
    eldStartTimer();
    // give the phone's Back button/gesture something to pop
    try { history.pushState({ pchEld: 1 }, ''); } catch (e) { /* ignore */ }
  };

  function eldClose() {
    eldStopTimer();
    eldTL = null;
    showSecondaryPage('page-panchang');
    window.requestAnimationFrame(function () { window.scrollTo(0, eldScrollY); });
  }
  window.pchCloseElementDetail = function () {
    if (history.state && history.state.pchEld) history.back();   // popstate → eldClose()
    else eldClose();
  };

  function eldIsOpen() {
    const el = document.getElementById(ELD_PAGE_ID);
    return !!el && el.style.display !== 'none';
  }

  (function eldInit() {
    function open(item) { window.pchOpenElementDetail(item.getAttribute('data-eld')); }
    document.addEventListener('click', function (e) {
      const item = e.target.closest && e.target.closest('.pch-item[data-eld]');
      if (!item || e.target.closest('a')) return;   // the "जन्म विवरण दर्ज करें" link keeps its own action
      open(item);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && eldIsOpen()) { window.pchCloseElementDetail(); return; }
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const item = e.target.closest && e.target.closest('.pch-item[data-eld]');
      if (item && e.target === item) { e.preventDefault(); open(item); }
    });
    window.addEventListener('popstate', function () { if (eldIsOpen()) eldClose(); });
    document.addEventListener('visibilitychange', function () {
      if (!eldIsOpen()) return;
      if (document.hidden) eldStopTimer();
      else { eldTick(); eldStartTimer(); }
    });
  })();

})();

function showSecondaryPage(pageId) {
    ['page-panchang', 'page-vrattyohar', 'page-holidays', 'page-choghadiya', 'page-element-detail', 'page-about', 'page-accountsettings',
     'page-appsettings', 'page-help', 'page-contactus'].forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (id === pageId) {
        el.style.display = 'block';
        el.classList.add('active');
      } else {
        el.style.display = 'none';
        el.classList.remove('active');
      }
    });
    window.scrollTo(0, 0);
  }

  /* ── Profile modal + circular photo crop (localStorage only) ── */
  var _profilePendingPhoto = null; // dataURL while modal is open
  var _cropState = {
    img: null,
    naturalW: 0,
    naturalH: 0,
    scale: 1,
    minScale: 1,
    offsetX: 0,
    offsetY: 0,
    dragging: false,
    lastX: 0,
    lastY: 0
  };

  function applyAvatarToHeader(photoDataUrl) {
    var img = document.getElementById('header-avatar-img');
    var svg = document.getElementById('header-avatar-svg');
    var wrap = document.getElementById('header-avatar');
    if (!img || !wrap) return;
    if (photoDataUrl) {
      img.src = photoDataUrl;
      img.style.display = 'block';
      if (svg) svg.style.display = 'none';
      wrap.classList.add('has-photo');
    } else {
      img.removeAttribute('src');
      img.style.display = 'none';
      if (svg) svg.style.display = '';
      wrap.classList.remove('has-photo');
    }
  }

  function refreshProfilePhotoUI(photoDataUrl) {
    var preview = document.getElementById('profile-photo-preview');
    var img = document.getElementById('profile-photo-img');
    var placeholder = document.getElementById('profile-photo-placeholder');
    var removeBtn = document.getElementById('profile-photo-remove');
    var uploadBtn = document.getElementById('profile-photo-upload-btn');
    if (uploadBtn) uploadBtn.textContent = photoDataUrl ? 'फ़ोटो बदलें' : 'फ़ोटो अपलोड करें';
    if (!preview || !img) return;
    if (photoDataUrl) {
      img.src = photoDataUrl;
      img.style.display = 'block';
      if (placeholder) placeholder.style.display = 'none';
      preview.classList.add('has-photo');
      if (removeBtn) removeBtn.style.display = '';
    } else {
      img.removeAttribute('src');
      img.style.display = 'none';
      if (placeholder) placeholder.style.display = '';
      preview.classList.remove('has-photo');
      if (removeBtn) removeBtn.style.display = 'none';
    }
  }

  // Birth date is shown/typed as dd/mm/yyyy but stored as ISO yyyy-mm-dd
  // (the rest of the app reads the ISO form).
  function profileIsoToDmy(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? (m[3] + '/' + m[2] + '/' + m[1]) : '';
  }
  function profileDmyToIso(dmy) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dmy || '');
    if (!m) return '';
    var d = +m[1], mo = +m[2], y = +m[3];
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (y < 1800 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return '';
    if (dt.getTime() > Date.now()) return '';
    return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  window.profileFormatDateInput = function profileFormatDateInput(el) {
    var digits = el.value.replace(/\D/g, '').slice(0, 8);
    var out = digits;
    if (digits.length > 4) out = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
    else if (digits.length > 2) out = digits.slice(0, 2) + '/' + digits.slice(2);
    el.value = out;
  };

  window.openProfileModal = function openProfileModal() {
    var profile = window.pchGetProfile();
    _profilePendingPhoto = profile.photo || null;

    var firstEl = document.getElementById('profile-firstname');
    var lastEl = document.getElementById('profile-lastname');
    var dateEl = document.getElementById('profile-birth-date');
    var timeEl = document.getElementById('profile-birth-time');
    var unknownEl = document.getElementById('profile-birth-time-unknown');
    var errEl = document.getElementById('profile-modal-error');

    if (firstEl) firstEl.value = profile.firstName || '';
    if (lastEl) lastEl.value = profile.lastName || '';
    if (dateEl) dateEl.value = profileIsoToDmy(profile.birthDate || '');
    if (timeEl) {
      timeEl.value = profile.birthTime || '';
      timeEl.disabled = false;
    }
    if (unknownEl) unknownEl.checked = false;
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

    refreshProfilePhotoUI(_profilePendingPhoto);

    var modal = document.getElementById('profile-modal');
    if (modal) modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';   // page must not scroll behind the popup
  };

  window.closeProfileModal = function closeProfileModal() {
    var modal = document.getElementById('profile-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
    _profilePendingPhoto = null;
    var fileInput = document.getElementById('profile-photo-input');
    if (fileInput) fileInput.value = '';
  };

  window.profileRemovePhoto = function profileRemovePhoto() {
    _profilePendingPhoto = '';
    refreshProfilePhotoUI(null);
  };

  window.saveProfileModal = function saveProfileModal() {
    var firstEl = document.getElementById('profile-firstname');
    var lastEl = document.getElementById('profile-lastname');
    var dateEl = document.getElementById('profile-birth-date');
    var timeEl = document.getElementById('profile-birth-time');
    var unknownEl = document.getElementById('profile-birth-time-unknown');
    var errEl = document.getElementById('profile-modal-error');

    var firstName = firstEl ? firstEl.value.trim() : '';
    var lastName = lastEl ? lastEl.value.trim() : '';
    var rawDate = dateEl ? dateEl.value.trim() : '';
    var birthDate = '';
    if (rawDate) {
      birthDate = profileDmyToIso(rawDate);
      if (!birthDate) {
        if (errEl) { errEl.textContent = 'कृपया जन्म तिथि dd/mm/yyyy रूप में सही लिखें (जैसे 25/12/1990)।'; errEl.style.display = 'block'; }
        return;
      }
    }
    var birthTime = (unknownEl && unknownEl.checked) ? '07:00' : ((timeEl && timeEl.value) ? timeEl.value : '12:00');

    window.pchSaveProfile({
      firstName: firstName,
      lastName: lastName,
      photo: _profilePendingPhoto == null ? undefined : _profilePendingPhoto,
      birthDate: birthDate,
      birthTime: birthTime
    });

    applyAvatarToHeader(_profilePendingPhoto || null);

    // Refresh चंद्रबल / ताराबल now that the birth details may have changed
    window.pchRecalcIfReady();

    if (errEl) errEl.style.display = 'none';
    window.closeProfileModal();
  };

  window.profileOnPhotoSelected = function profileOnPhotoSelected(ev) {
    var file = ev.target && ev.target.files && ev.target.files[0];
    if (!file) return;
    if (!file.type || file.type.indexOf('image/') !== 0) {
      var errEl = document.getElementById('profile-modal-error');
      if (errEl) {
        errEl.textContent = 'कृपया एक मान्य छवि फ़ाइल चुनें।';
        errEl.style.display = 'block';
      }
      return;
    }
    var reader = new FileReader();
    reader.onload = function(e) {
      openCropModal(e.target.result);
    };
    reader.readAsDataURL(file);
    // reset so same file can be re-selected later
    ev.target.value = '';
  };

  function openCropModal(dataUrl) {
    var modal = document.getElementById('profile-crop-modal');
    var img = document.getElementById('crop-image');
    var zoom = document.getElementById('crop-zoom');
    if (!modal || !img) return;

    img.onload = function() {
      _cropState.img = img;
      _cropState.naturalW = img.naturalWidth;
      _cropState.naturalH = img.naturalHeight;
      var vp = 260;
      // Cover the circular viewport at min scale
      _cropState.minScale = Math.max(vp / _cropState.naturalW, vp / _cropState.naturalH);
      _cropState.scale = _cropState.minScale;
      _cropState.offsetX = 0;
      _cropState.offsetY = 0;
      if (zoom) {
        zoom.min = '1';
        zoom.max = '3';
        zoom.value = '1';
      }
      updateCropTransform();
    };
    img.src = dataUrl;
    modal.style.display = 'flex';
  }

  window.closeCropModal = function closeCropModal() {
    var modal = document.getElementById('profile-crop-modal');
    if (modal) modal.style.display = 'none';
    var img = document.getElementById('crop-image');
    if (img) img.removeAttribute('src');
  };

  function updateCropTransform() {
    var img = document.getElementById('crop-image');
    if (!img || !_cropState.naturalW) return;
    var dispW = _cropState.naturalW * _cropState.scale;
    var dispH = _cropState.naturalH * _cropState.scale;
    // Clamp offsets so image always covers the circle
    var maxOx = Math.max(0, (dispW - 260) / 2);
    var maxOy = Math.max(0, (dispH - 260) / 2);
    _cropState.offsetX = Math.max(-maxOx, Math.min(maxOx, _cropState.offsetX));
    _cropState.offsetY = Math.max(-maxOy, Math.min(maxOy, _cropState.offsetY));
    img.style.width = dispW + 'px';
    img.style.height = dispH + 'px';
    img.style.transform = 'translate(calc(-50% + ' + _cropState.offsetX + 'px), calc(-50% + ' + _cropState.offsetY + 'px))';
  }

  window.applyCrop = function applyCrop() {
    if (!_cropState.naturalW) return;
    var size = 256; // output pixels
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    // Circular clip
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    // Map viewport (260×260) → canvas (size×size)
    var scaleRatio = size / 260;
    var dispW = _cropState.naturalW * _cropState.scale;
    var dispH = _cropState.naturalH * _cropState.scale;
    // Image top-left in viewport coords (viewport origin at top-left of circle)
    var imgLeft = 130 + _cropState.offsetX - dispW / 2;
    var imgTop = 130 + _cropState.offsetY - dispH / 2;

    ctx.drawImage(
      _cropState.img,
      imgLeft * scaleRatio,
      imgTop * scaleRatio,
      dispW * scaleRatio,
      dispH * scaleRatio
    );

    var dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    _profilePendingPhoto = dataUrl;
    refreshProfilePhotoUI(dataUrl);
    window.closeCropModal();
  };

  function initCropInteractions() {
    var viewport = document.getElementById('crop-viewport');
    var zoom = document.getElementById('crop-zoom');
    if (!viewport) return;

    function onPointerDown(e) {
      _cropState.dragging = true;
      _cropState.lastX = e.clientX;
      _cropState.lastY = e.clientY;
      if (viewport.setPointerCapture) {
        try { viewport.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
    }
    function onPointerMove(e) {
      if (!_cropState.dragging) return;
      var dx = e.clientX - _cropState.lastX;
      var dy = e.clientY - _cropState.lastY;
      _cropState.lastX = e.clientX;
      _cropState.lastY = e.clientY;
      _cropState.offsetX += dx;
      _cropState.offsetY += dy;
      updateCropTransform();
    }
    function onPointerUp() {
      _cropState.dragging = false;
    }

    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointermove', onPointerMove);
    viewport.addEventListener('pointerup', onPointerUp);
    viewport.addEventListener('pointercancel', onPointerUp);

    if (zoom) {
      zoom.addEventListener('input', function() {
        var factor = parseFloat(zoom.value) || 1;
        _cropState.scale = _cropState.minScale * factor;
        updateCropTransform();
      });
    }
  }

  function loadProfileOnBoot() {
    var profile = window.pchGetProfile();
    if (profile && profile.photo) applyAvatarToHeader(profile.photo);
  }

  // Boot panchang on load
  document.addEventListener('DOMContentLoaded', function() {
    renderFooters();
    showPanchang();
    initCropInteractions();
    loadProfileOnBoot();
  });


/* ── Settings menu, settings pages and dark mode ── */
var SP_CONTACT_EMAIL = 'trovatoindia@protonmail.com';
var SP_SETTINGS_KEY = 'sp_app_settings';

/* ── Page footers: one definition for the ten .about-footer blocks in index.html ──
   data-footer="plain"           developer line only
   data-footer="about"           developer line + office addresses (About Us page)
   data-footer="disclaimer"      developer line + disclaimer
   data-footer="disclaimer-pch"  same, tagged .pch-disclaimer (hidden by CSS while the location picker is open) */
var SP_FOOTER_DEV = '<p class="dev-info" style="line-height:1.6; text-align:center; margin-bottom:10px;"><span class="dev-by">Developed by</span><br><strong class="dev-company">Trovato Communications Private Limited</strong><br><span class="dev-email-line">Email: <a href="mailto:' + SP_CONTACT_EMAIL + '" style="color:var(--saffron); text-decoration:none;">' + SP_CONTACT_EMAIL + '</a></span></p>';
var SP_FOOTER_DISCLAIMER = "Disclaimer: इस एप्लिकेशन में दिया गया पंचांग मात्र अनुमान है, जिसकी सटीकता आपकी वर्तमान GPS location और वर्तमान समय पर निर्भर करती है। किसी भी महत्वपूर्ण उपयोग से पहले कृपया किसी प्रामाणिक पंडित/ज्योतिषी से परामर्श अवश्य करें। व्रत त्योहार एवं सार्वजनिक अवकाश सूची सामान्यतः सटीक हैं, एवं विभिन्न पोर्टल से संकलित की गई है, इसलिए कृपया किसी प्रकार की निर्भरता या उपयोग से पूर्व आधिकारिक व अद्यतन सूचना से पुष्टि अवश्य करें।";
function renderFooters() {
  var nodes = document.querySelectorAll('.about-footer[data-footer]');
  for (var i = 0; i < nodes.length; i++) {
    var kind = nodes[i].getAttribute('data-footer');
    var html = SP_FOOTER_DEV;
    if (kind === 'about') {
      // About Us only: registered / additional office lines, same size & font as the email line
      html = html.replace('</p>', '<br><span class="dev-email-line">Reg. Office: Beawar 305901 (Raj.)</span><br><span class="dev-email-line">Additional Operations: Jaipur 302004 (Raj.)</span></p>');
    }
    if (kind !== 'plain' && kind !== 'about') {
      html += '<p' + (kind === 'disclaimer-pch' ? ' class="pch-disclaimer"' : '') + ' style="font-size:11px; opacity:0.75; line-height:1.5; text-align:justify;">' + SP_FOOTER_DISCLAIMER + '</p>';
    }
    nodes[i].innerHTML = html;
  }
}

function toggleSettings() { document.getElementById('settings-menu').classList.toggle('open'); }
function closeSettings() { document.getElementById('settings-menu').classList.remove('open'); }
document.addEventListener('click', function(e) {
  var menu = document.getElementById('settings-menu');
  if (!menu) return;
  if (!menu.contains(e.target) && !e.target.closest('.header-settings-btn')) menu.classList.remove('open');
});
document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeSettings(); });

function showAbout() { showSecondaryPage('page-about'); }
function showAccountSettings() { showSecondaryPage('page-accountsettings'); }
function showAppSettings() { showSecondaryPage('page-appsettings'); syncAppSettingsUI(); }
function showHelp() { showSecondaryPage('page-help'); }
function showContactUs() { showSecondaryPage('page-contactus'); }

function getAppSettings() {
  try { return JSON.parse(localStorage.getItem(SP_SETTINGS_KEY) || '{}'); } catch (e) { return {}; }
}
function saveAppSettings(s) {
  try { localStorage.setItem(SP_SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
}
function toggleDarkMode(on) {
  document.body.classList.toggle('dark-mode', on);
  var s = getAppSettings(); s.darkMode = on; saveAppSettings(s);
}
function syncAppSettingsUI() {
  var dm = document.getElementById('setting-dark-mode');
  if (dm) dm.checked = !!getAppSettings().darkMode;
}
function applyStoredAppSettings() {
  document.body.classList.toggle('dark-mode', !!getAppSettings().darkMode);
}
applyStoredAppSettings();

function copyContactEmail() {
  var note = document.getElementById('copy-email-note');
  function ok() { if (note) { note.textContent = 'Email address copied to clipboard!'; note.classList.add('success'); } }
  function fallback() { if (note) { note.textContent = SP_CONTACT_EMAIL; note.classList.remove('success'); } }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(SP_CONTACT_EMAIL).then(ok).catch(fallback);
  } else { fallback(); }
}

function submitHelpQuery() {
  var box = document.getElementById('help-query-text');
  var note = document.getElementById('help-query-note');
  var text = (box.value || '').trim();
  if (!text) {
    note.textContent = 'Please type your question or issue before submitting.';
    note.classList.remove('success');
    return;
  }
  var subject = encodeURIComponent('Help Query — Simple Panchang');
  window.location.href = 'mailto:' + SP_CONTACT_EMAIL + '?subject=' + subject + '&body=' + encodeURIComponent(text);
  note.textContent = 'Opening your email app to send this query…';
  note.classList.add('success');
  box.value = '';
}

function deleteMyLocalData() {
  if (!window.confirm('Delete your profile, photo, birth details and settings from this device? This cannot be undone.')) return;
  try {
    var drop = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && (k.indexOf('pch_') === 0 || k === SP_SETTINGS_KEY)) drop.push(k);
    }
    drop.forEach(function(k) { localStorage.removeItem(k); });
  } catch (e) {}
  window.location.reload();
}


/* Popups (profile, photo crop, change location & time): a swipe / wheel on the dimmed area outside the card
   must not scroll the page behind it. A tap there still cancels via each popup's own onclick. */
(function () {
  function isBackdrop(t) {
    if (!t || !t.id) return false;
    if (t.id === 'profile-modal' || t.id === 'profile-crop-modal') return true;
    return t.id === 'pch-location-section' && t.classList.contains('is-popup');
  }
  function block(e) { if (isBackdrop(e.target)) e.preventDefault(); }
  document.addEventListener('touchmove', block, { passive: false });
  document.addEventListener('wheel', block, { passive: false });
})();
