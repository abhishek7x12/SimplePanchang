/* ============================================================================
   TABLE OF CONTENTS — PANCHANG MODULE — Sun/Moon astronomy, Tithi/Nakshatra/Yoga/Karana,
   Rahu Kaal, Choghadiya, GPS location handling
   (line numbers below are within THIS file, counting from this comment)
   ============================================================================
      20 | Small astronomy toolkit (Meeus low-precision Sun/Moon)
      83 | Local mean solar time helpers
     159 | Panchang element names (Hindi)
     434 | Rahu Kaal / Yamagandam / Gulika Kaal — divide sunrise→sunset into 8 equal parts
     495 | Choghadiya
     532 | Location handling
     555 | चंद्रबल / ताराबल
    1003 | GPS location: due-process flow
   ============================================================================
*/


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
    const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * D2R);
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

  // Lahiri (Chitrapaksha) ayanamsa, degrees — quadratic fit calibrated to
  // official published values (1900: 22°27'54", 2000: 23°51'14",
  // 2025: 24°11'23"), since the true precession/proper-motion rate is not
  // perfectly linear. This tracks the real ayanamsa much more closely than
  // a pure straight-line rate, which matters for Rashi determination near
  // sign-boundary (Sankranti) days.
  function ayanamsa(jd) {
    const x = (jd - 2451545.0) / 365.25 + 100; // years since 1900
    return 22.4650 + 0.0142546 * x - 0.0000036560 * x * x;
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
  function getKarana(sun, moon) {
    const diff = norm360(moon - sun);
    const idx = Math.floor(diff / 6); // 0-59
    if (idx === 0) return KARANA_NAMES[0];
    if (idx === 57) return KARANA_NAMES[8];
    if (idx === 58) return KARANA_NAMES[9];
    if (idx === 59) return KARANA_NAMES[10];
    return KARANA_NAMES[1 + ((idx - 1) % 7)];
  }
  function vikramSamvat(date) {
    const y = date.getFullYear(), m = date.getMonth() + 1;
    return (m >= 4 ? y + 57 : y + 56);
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
  let _amantaMasaCache = null; // { startJD, endJD, idx }
  function amantaMasaIndexFixed(jd) {
    if (_amantaMasaCache && jd >= _amantaMasaCache.startJD && jd < _amantaMasaCache.endJD) {
      return _amantaMasaCache.idx;
    }
    const startJD = findAmantaMasaStartJD(jd);
    const endJD = findNextAmavasyaJD(startJD);
    const idx = amantaMasaIndexForMonth(startJD, endJD);
    _amantaMasaCache = { startJD: startJD, endJD: endJD, idx: idx };
    return idx;
  }
  // Purnimant masa: the fixed Amanta-month index (see above), shifted
  // forward by one month during Krishna Paksha, since in the Purnimanta
  // scheme the month name carries over from the preceding Purnima until
  // the next one (e.g. Amanta Ashwin Krishna Paksha = Purnimanta Kartik
  // Krishna Paksha, as with Diwali).
  function getPurnimantMasa(sunTropicalLong, jd, tithiIndex) {
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
  function findNextTransition(jdNow, indexFn) {
    const startIdx = indexFn(jdNow);
    const stepDays = 5 / 1440;
    let jd = jdNow;
    for (let i = 0; i < 600; i++) {
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
    const startIdx = indexFn(jdNow);
    const stepDays = 0.25;
    let jd = jdNow;
    const maxIter = Math.ceil((maxDays || 20) / stepDays);
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

  function buildChoghadiya(sunrise, sunset, nextSunrise, weekdayIdx) {
    const dayPart = (sunset - sunrise) / 8;
    const dayRows = CHOGH_DAY_SEQ[weekdayIdx].map((name, i) => {
      const start = new Date(sunrise.getTime() + i * dayPart);
      const end = new Date(sunrise.getTime() + (i+1) * dayPart);
      return { name, start, end };
    });
    const nightPart = (nextSunrise - sunset) / 8;
    const nightRows = CHOGH_NIGHT_SEQ[weekdayIdx].map((name, i) => {
      const start = new Date(sunset.getTime() + i * nightPart);
      const end = new Date(sunset.getTime() + (i+1) * nightPart);
      return { name, start, end };
    });
    return { dayRows, nightRows };
  }

  /* ── Location handling ── */
  let PCH = { lat: null, lon: null, name: '', state: '', tzOffsetMin: 330, customDateTime: null }; // default IST offset fallback; customDateTime null = live "now"
  let pchLastChogh = null; // { dayRows, nightRows } from the most recent calculation
  let pchChoghAutoInitDone = false; // set once the toggle's initial दिन/रात्रि state has been auto-set from the clock; after that, only the user's own clicks change it

  // Renders the currently-toggled (दिन/रात्रि) Choghadiya list and updates
  // the section title to match. Safe to call any time after a calculation
  // has populated pchLastChogh (e.g. on toggle change, without recomputing).
  function pchRenderChoghadiya() {
    if (!pchLastChogh) return;
    const toggleEl = document.getElementById('pch-chogh-toggle');
    const isNight = !!(toggleEl && toggleEl.checked);
    const tz = PCH.tzOffsetMin || 330;
    const rows = isNight ? pchLastChogh.nightRows : pchLastChogh.dayRows;
    const html = rows.map(r =>
      '<div class="pch-chogh-row"><span class="pch-chogh-name ' + (CHOGH_TYPE[r.name]||'neutral') + '">' + r.name + '</span><span class="pch-chogh-time">' + fmtTime(r.start, tz) + ' – ' + fmtTime(r.end, tz) + '</span></div>'
    ).join('');
    document.getElementById('pch-choghadiya-list').innerHTML = html;
    document.getElementById('pch-chogh-title').textContent = 'चौघड़िया';
    const labelEl = document.getElementById('pch-chogh-daynight-label');
    if (labelEl) labelEl.textContent = isNight ? 'रात्रि' : 'दिन';
  }

  // ── चंद्रबल / ताराबल ──
  // Both need the person's own Janma Rashi (Moon sign) / Janma Nakshatra.
  // Rather than ask for those directly, we ask for birth date + time (which
  // people actually know) and derive Rashi/Nakshatra the same way "today's"
  // values are derived — via the Moon's sidereal longitude at that instant.
  // Birth details are stored only in localStorage (no user account).
  const CHANDRABALAM_GOOD_HOUSES = [1,3,6,7,10,11]; // house-from-janma-rashi considered auspicious
  const TARA_NAMES = ['जन्म','संपत','विपत','क्षेम','प्रत्यक्','साधक','वध (नैधन)','मित्र','परम मित्र'];
  const TARA_GOOD  = [false, true, false, true, false, true, false, true, true];

  function pchBirthStorageKey() {
    const regNo = 'panchang-user';
    return 'pch_birth_' + regNo;
  }
  function pchProfileStorageKey() {
    return 'pch_profile_panchang-user';
  }

  // Unified local-only profile (name, photo, birth). Migrates legacy birth key.
  function pchGetProfile() {
    try {
      const raw = localStorage.getItem(pchProfileStorageKey());
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p === 'object') {
          return {
            fullName: p.fullName || '',
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
            fullName: '',
            photo: '',
            birthDate: saved.birthDate,
            birthTime: saved.birthTime || '12:00'
          };
        }
      }
    } catch (e) { /* ignore */ }
    return { fullName: '', photo: '', birthDate: '', birthTime: '12:00' };
  }

  function pchSaveProfile(profile) {
    try {
      const prev = pchGetProfile();
      const next = {
        fullName: profile.fullName != null ? profile.fullName : prev.fullName,
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

  function pchSaveBirthDetails(birthDate, birthTime) {
    pchSaveProfile({ birthDate: birthDate, birthTime: birthTime || '12:00' });
  }

  window.pchGetProfile = pchGetProfile;
  window.pchSaveProfile = pchSaveProfile;

  // Derives { rashiIdx, nakshatraIdx } (0-based) from a birth date/time
  // string pair, assuming Indian Standard Time (the vast majority of
  // members' birth records will be IST; this matches the tzOffsetMin
  // fallback used throughout the rest of the Panchang).
  function pchBirthIndices(birthDate, birthTime) {
    const [y, mo, d] = birthDate.split('-').map(Number);
    const [hh, mm] = (birthTime || '12:00').split(':').map(Number);
    const istMinutes = hh * 60 + mm;
    const utcDate = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0) + (istMinutes - 330) * 60000);
    const jdBirth = julianDay(utcDate);
    return {
      rashiIdx: chandraRashiIndexAt(jdBirth),
      nakshatraIdx: nakshatraIndexAt(jdBirth)
    };
  }

  // Romanized names for the birth-Panchang details ("Janm Tithi",
  // "Nakshatra", "Rashi" rows), e.g. tithi: "Margshirsha Shukla Chaturdashi
  // V.S. 2041", nakshatra: "Krutika", rashi: "Mesh". Exposed on window so
  // the profile-page script (a separate <script> block/scope) can call it
  // without duplicating the astronomy toolkit.
  const _JT_MASA_EN = ['Chaitra','Vaishakh','Jyeshtha','Ashadh','Shravan','Bhadrapad','Ashwin','Kartik','Margshirsha','Paush','Magh','Phalgun'];
  const _JT_TITHI_EN = ['Pratipada','Dwitiya','Tritiya','Chaturthi','Panchami','Shashthi','Saptami','Ashtami','Navami','Dashami','Ekadashi','Dwadashi','Trayodashi','Chaturdashi'];
  const _JT_NAKSHATRA_EN = ['Ashwini','Bharani','Krutika','Rohini','Mrigashira','Ardra','Punarvasu','Pushya','Ashlesha','Magha','Purva Phalguni','Uttara Phalguni','Hasta','Chitra','Swati','Vishakha','Anuradha','Jyeshtha','Mula','Purva Ashadha','Uttara Ashadha','Shravana','Dhanishtha','Shatabhisha','Purva Bhadrapada','Uttara Bhadrapada','Revati'];
  const _JT_RASHI_EN = ['Mesh','Vrishabh','Mithun','Kark','Simha','Kanya','Tula','Vrishchik','Dhanu','Makar','Kumbh','Meen'];
  window.pchComputeJanmTithi = function(birthDate, birthTime) {
    if (!birthDate) return null;
    const [y, mo, d] = birthDate.split('-').map(Number);
    const [hh, mm] = (birthTime || '12:00').split(':').map(Number);
    const istMinutes = hh * 60 + mm;
    const utcDate = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0) + (istMinutes - 330) * 60000);
    const jdBirth = julianDay(utcDate);
    const sun = sunLongitude(jdBirth);
    const moon = moonLongitude(jdBirth);
    const tithi = getTithi(sun, moon); // { name, index (0-29), paksha }
    const pakshaEn = tithi.index < 15 ? 'Shukla' : 'Krishna';
    const tithiInPaksha = tithi.index % 15; // 0-14
    const tithiEn = tithiInPaksha === 14 ? (tithi.index < 15 ? 'Purnima' : 'Amavasya') : _JT_TITHI_EN[tithiInPaksha];
    let masaIdx = amantaMasaIndexFixed(jdBirth);
    if (tithi.index >= 15) masaIdx = (masaIdx + 1) % 12;
    const samvat = (mo >= 4 ? y + 57 : y + 56);
    const nakIdx = nakshatraIndexAt(jdBirth);
    const rashiIdx = chandraRashiIndexAt(jdBirth);
    return {
      tithi: _JT_MASA_EN[masaIdx] + ' ' + pakshaEn + ' ' + tithiEn + ' V.S. ' + samvat,
      nakshatra: _JT_NAKSHATRA_EN[nakIdx],
      rashi: _JT_RASHI_EN[rashiIdx],
      tithiHi: MASA_NAMES[masaIdx] + ' ' + tithi.paksha + ' ' + TITHI_NAMES[tithi.index] + ' वि.सं. ' + samvat,
      nakshatraHi: NAKSHATRA_NAMES[nakIdx],
      rashiHi: RASHI_NAMES[rashiIdx]
    };
  };

  function pchRenderBalam(chandraRashiIdx, currentNakshatraIdx) {
    const chandEl = document.getElementById('pch-chandrabalam');
    const taraEl = document.getElementById('pch-tarabalam');
    if (!chandEl || !taraEl) return;

    const birth = pchGetBirthDetails();
    if (!birth) {
      const prompt = '<a href="javascript:void(0)" onclick="pchOpenBirthModal()" style="color:var(--gold,#B8860B); text-decoration:underline;">जन्म विवरण दर्ज करें</a>';
      chandEl.innerHTML = prompt;
      taraEl.innerHTML = prompt;
      return;
    }
    const idx = pchBirthIndices(birth.birthDate, birth.birthTime);

    const house = ((chandraRashiIdx - idx.rashiIdx + 12) % 12) + 1;
    const chandGood = CHANDRABALAM_GOOD_HOUSES.indexOf(house) !== -1;
    chandEl.innerHTML = '<span style="color:' + (chandGood ? '#1E7A4A' : '#B23A2E') + ';">' +
      (chandGood ? 'शुभ' : 'अशुभ') + '</span> (' + house + 'वां भाव)';

    const taraCount = ((currentNakshatraIdx - idx.nakshatraIdx + 27) % 27) + 1;
    const taraIdx = (taraCount - 1) % 9;
    const taraGood = TARA_GOOD[taraIdx];
    taraEl.innerHTML = TARA_NAMES[taraIdx] + ' <span style="color:' + (taraGood ? '#1E7A4A' : '#B23A2E') + ';">(' +
      (taraGood ? 'शुभ' : 'अशुभ') + ')</span>';
  }

  window.pchOpenBirthModal = function() {
    const birth = pchGetBirthDetails();
    const dateEl = document.getElementById('pch-birth-date');
    const timeEl = document.getElementById('pch-birth-time');
    const unknownEl = document.getElementById('pch-birth-time-unknown');
    if (dateEl) dateEl.value = birth ? birth.birthDate : '';
    if (timeEl) { timeEl.value = birth ? birth.birthTime : ''; timeEl.disabled = false; }
    if (unknownEl) unknownEl.checked = false;
    const errEl = document.getElementById('pch-birth-modal-error');
    if (errEl) errEl.style.display = 'none';
    const modal = document.getElementById('pch-birth-modal');
    if (modal) modal.style.display = 'flex';
  };

  window.pchSkipBirthModal = function() {
    const modal = document.getElementById('pch-birth-modal');
    if (modal) modal.style.display = 'none';
  };

  window.pchSaveBirthModal = function() {
    const dateEl = document.getElementById('pch-birth-date');
    const timeEl = document.getElementById('pch-birth-time');
    const unknownEl = document.getElementById('pch-birth-time-unknown');
    const errEl = document.getElementById('pch-birth-modal-error');
    if (!dateEl.value) {
      if (errEl) errEl.style.display = 'block';
      return;
    }
    const birthTime = (unknownEl && unknownEl.checked) ? '12:00' : (timeEl.value || '12:00');
    pchSaveBirthDetails(dateEl.value, birthTime);
    const modal = document.getElementById('pch-birth-modal');
    if (modal) modal.style.display = 'none';
    if (typeof window.pchRunCalculation === 'function' && PCH.lat !== null) window.pchRunCalculation();
  };

  // Prompt only once the चंद्रबल/ताराबल section actually scrolls into
  // view — not immediately on page open — and only if the profile doesn't
  // already have birth details saved.
  let pchBirthModalAutoShown = false;
  let pchBalamSectionObserver = null;
  function pchInitBalamSectionObserver() {
    if (pchBalamSectionObserver || pchBirthModalAutoShown) return;
    const target = document.getElementById('pch-chandrabalam');
    const section = target && target.closest('.about-section');
    if (!section) return;
    pchBalamSectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !pchBirthModalAutoShown) {
          if (!pchGetBirthDetails()) {
            pchBirthModalAutoShown = true;
            window.pchOpenBirthModal();
          } else {
            pchBirthModalAutoShown = true; // details already exist, no need to keep observing
          }
          pchBalamSectionObserver.disconnect();
        }
      });
    }, { threshold: 0.4 });
    pchBalamSectionObserver.observe(section);
  }

  let pchRefreshTimer = null;
  let pchClockTimer = null;
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

  // .about-card (the wrapper around the Muhurat grid, Panchang tattva,
  // Chandrabalam/Tarabalam etc.) uses a translucent background *plus*
  // backdrop-filter: blur() for the "liquid glass" look. Chromium has a
  // known compositing bug where a layer like this fails to repaint right
  // when it's first created or right when a background tab/app regains
  // visibility — the correct content is genuinely sitting in the DOM (a
  // DevTools inspection would show it), it just never gets painted, so the
  // card looks like an empty gap until something unrelated (a scroll, a
  // resize) happens to force a repaint. Both "right after opening" and
  // "after the app was idle" — the two triggers reported — are exactly
  // when this bug fires.
  //
  // Toggling `transform` (rather than `display`) forces that repaint: a
  // transform never affects box layout — the card's height/position, and
  // everything around it, stays exactly where it was — so this can never
  // shift the page's scroll position or cause any visible jump/flash. It
  // only forces the browser to regenerate that one composited layer, which
  // is all this bug actually needs to be fixed silently, in the background.
  function pchForceRepaint() {
    const el = document.getElementById('pch-content');
    if (!el || el.style.display === 'none') return;
    el.querySelectorAll('.about-card').forEach(function (card) {
      card.style.transform = 'translateZ(0)';
      void card.offsetHeight; // forces the paint recalculation synchronously
      card.style.transform = '';
    });
  }

  function pchStopTimers() {
    if (pchRefreshTimer) { clearTimeout(pchRefreshTimer); pchRefreshTimer = null; }
    if (pchClockTimer) { clearInterval(pchClockTimer); pchClockTimer = null; }
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
    // Lightweight live clock tick every second, independent of the heavy
    // astronomy recompute, so it's visibly obvious the page is live.
    // Frozen (showing the selected timestamp instead) when a custom
    // date/time override is active.
    pchClockTimer = setInterval(() => {
      if (!pchIsPageVisible()) { pchStopTimers(); return; }
      const clockEl = document.getElementById('pch-live-clock');
      if (clockEl) {
        const tz = PCH.tzOffsetMin || 330;
        if (PCH.customDateTime) {
          clockEl.textContent = 'चयनित समय: ' + fmtTime(PCH.customDateTime, tz);
        } else {
          clockEl.textContent = 'वर्तमान समय: ' + fmtTime(new Date(), tz) + ':' + String(new Date().getSeconds()).padStart(2,'0');
        }
      }
    }, 1000);
  }

  // Any code path that makes #page-panchang visible (button click, back
  // navigation, deep link, etc.) is caught here and forces a fresh
  // recalculation — this does not depend on showPanchang() being the only
  // entry point.
  function pchInitVisibilityWatch() {
    const el = document.getElementById('page-panchang');
    if (!el || pchPageObserver) return;
    const choghToggle = document.getElementById('pch-chogh-toggle');
    if (choghToggle) {
      choghToggle.addEventListener('change', function() { pchRenderChoghadiya(); });
    }
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

  window.pchManualRefresh = function() {
    if (PCH.lat === null) { pchSetStatus('कृपया पहले स्थान चुनें।', true); return; }
    pchRunCalculation();
  };

  window.showPanchang = function() {
    showSecondaryPage('page-panchang');
    document.getElementById('pch-manual-entry').style.display = 'none';
    pchInitVisibilityWatch();
    if (PCH.lat === null) {
      document.getElementById('pch-content').style.display = 'none';
      document.getElementById('pch-location-section').style.display = 'none';
      pchAutoFetchGPS();
    } else {
      pchRunCalculation();
    }
    pchWasVisible = true;
    pchStartTimers();
    pchInitBalamSectionObserver();
  };

  function pchShowLocationBar(dateUsed) {
    const bar = document.getElementById('pch-badle-bar');
    const sec = document.getElementById('pch-location-section');
    if (bar) bar.style.display = 'flex';
    if (sec) sec.style.display = 'none';
    pchShowGpsLoading(false);
  }

  // Reads the (optional) date/time fields in the location selector and
  // stores them as an absolute-instant override for the panchang
  // calculation. Leaving either field blank — or leaving them exactly at
  // their prefilled "now" values via the "अभी (Live)" button — reverts to
  // live time. Called right before a location is actually chosen so
  // whatever the user typed is picked up automatically.
  function pchCaptureDateTimeInputs() {
    const block = document.getElementById('pch-datetime-block');
    if (block && block.style.display === 'none') return; // not shown to the user — keep using live time
    const dEl = document.getElementById('pch-dt-date');
    const tEl = document.getElementById('pch-dt-time');
    if (!dEl || !tEl || !dEl.value || !tEl.value) { return; }
    const dt = new Date(dEl.value + 'T' + tEl.value + ':00');
    if (isNaN(dt.getTime())) { return; }
    PCH.customDateTime = dt;
  }

  // Fills the date/time inputs with whatever is currently active — the
  // custom override if one is set, otherwise the live current time —
  // whenever the location selector is opened.
  function pchPrefillDateTimeInputs() {
    const dEl = document.getElementById('pch-dt-date');
    const tEl = document.getElementById('pch-dt-time');
    if (!dEl || !tEl) return;
    const base = PCH.customDateTime || new Date();
    const pad = (n) => String(n).padStart(2, '0');
    dEl.value = base.getFullYear() + '-' + pad(base.getMonth() + 1) + '-' + pad(base.getDate());
    tEl.value = pad(base.getHours()) + ':' + pad(base.getMinutes());
  }

  // "इसी समय हेतु लागू करें" — apply a custom timestamp without touching
  // the already-selected location.
  window.pchApplyDateTimeOnly = function() {
    pchCaptureDateTimeInputs();
    if (PCH.lat === null) {
      pchSetStatus('कृपया पहले ऊपर से कोई स्थान चुनें।', true);
      return;
    }
    pchRunCalculation();
  };

  // "अभी (Live)" — clear any custom override and go back to live time.
  window.pchResetToLiveDateTime = function() {
    PCH.customDateTime = null;
    pchPrefillDateTimeInputs();
    if (PCH.lat !== null) pchRunCalculation();
  };

  window.pchOpenLocationSelector = function() {
    const bar = document.getElementById('pch-badle-bar');
    if (bar) bar.style.display = 'none';
    // Hide the panchang content while the user is picking a new
    // location/date-time — it reappears automatically once
    // pchRunCalculation() finishes for the newly chosen values.
    const content = document.getElementById('pch-content');
    if (content) content.style.display = 'none';
    pchRevealLocationSection(true);
    pchPrefillDateTimeInputs();
    pchSetStatus('');
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

  function pchRevealLocationSection(showDateTime) {
    const sec = document.getElementById('pch-location-section');
    if (sec) sec.style.display = '';
    const dtBlock = document.getElementById('pch-datetime-block');
    if (dtBlock) dtBlock.style.display = showDateTime ? '' : 'none';
    pchPrefillDateTimeInputs();
    pchRenderProfileLocationBtns();
  }

  // Builds the profile-city buttons shown in the location selector, using
  // the user's actual saved city names (not a generic "Profile — current
  // city" placeholder). A button is only shown for a city that is really
  // saved in the profile; if only one of current/native city is saved,
  // only that one button appears. If both are saved but are the same
  // place, only one button is shown (avoids a duplicate).
  function pchRenderProfileLocationBtns() { /* profile cities removed */ }

  // ── GPS location: due-process flow ──
  // 1. Secure-context check (geolocation is blocked entirely on non-HTTPS
  //    pages, regardless of permission state).
  // 2. Where supported, check navigator.permissions first so we can show
  //    the *right* message (e.g. "enable permission" vs "enable device
  //    GPS") instead of one generic failure message.
  // 3. On any failure, the location-selector section (hidden by default)
  //    is revealed so the user can retry GPS or fall back to a saved
  //    profile city / manual entry.

  function pchGpsFallbackHint() {
    return ' कृपया नीचे प्रोफ़ाइल स्थान चुनें या शहर मैन्युअल रूप से लिखें।';
  }

  function pchFailGps(msg, wasAuto) {
    if (wasAuto) pchShowGpsLoading(false);
    pchRevealLocationSection(false);
    pchSetStatus(msg, true);
  }

  function pchHandleGpsSuccess(pos, wasAuto) {
    PCH.lat = pos.coords.latitude;
    PCH.lon = pos.coords.longitude;
    PCH.name = 'वर्तमान GPS स्थान';
    // (No separate timezone-resolution request here — pchRunCalculation()'s
    // own sun-times fetch resolves PCH.tzOffsetMin from the same Open-Meteo
    // endpoint a moment later, so a dedicated call first would just be a
    // second, redundant network round-trip before the page can show data.)
    if (wasAuto) pchShowGpsLoading(false);
    pchSetStatus('स्थान मिल गया: वर्तमान GPS स्थान (' + PCH.lat.toFixed(3) + ', ' + PCH.lon.toFixed(3) + ')');
    pchRunCalculation();
  }

  function pchHandleGpsError(err, wasAuto) {
    let msg;
    if (err && err.code === err.PERMISSION_DENIED) {
      msg = 'GPS location की अनुमति अवरुद्ध है। कृपया अनुमति देने के लिए मोबाइल की सेटिंग्स में जाएं और एप्लिकेशन की GPS location को अनुमति दें। अथवा नीचे प्रोफ़ाइल स्थान चुनें या शहर मैन्युअल रूप से लिखें।';
    } else if (err && err.code === err.POSITION_UNAVAILABLE) {
      msg = 'स्थान की जानकारी नहीं मिल पाई। कृपया अपने डिवाइस की लोकेशन सेवा (GPS) चालू करें और दोबारा प्रयास करें।' + pchGpsFallbackHint();
    } else if (err && err.code === err.TIMEOUT) {
      msg = 'स्थान पता करने में अधिक समय लग रहा है।' + pchGpsFallbackHint();
    } else {
      msg = 'GPS स्थान प्राप्त नहीं हो सका।' + pchGpsFallbackHint();
    }
    pchFailGps(msg, wasAuto);
  }

  // wasAuto = true when this was the silent attempt on page-open (loading
  // indicator + no location-selector shown yet); false when the user
  // explicitly tapped "वर्तमान GPS स्थान" from the already-visible selector.
  function pchRequestGPS(wasAuto) {
    if (!navigator.geolocation) {
      pchFailGps('इस डिवाइस/ब्राउज़र पर GPS उपलब्ध नहीं है।' + pchGpsFallbackHint(), wasAuto);
      return;
    }
    if (window.isSecureContext === false) {
      pchFailGps('GPS केवल सुरक्षित (HTTPS) पेज पर काम करता है।' + pchGpsFallbackHint(), wasAuto);
      return;
    }
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
    pchShowGpsLoading(true);
    if (!navigator.geolocation) {
      pchFailGps('इस डिवाइस/ब्राउज़र पर GPS उपलब्ध नहीं है।' + pchGpsFallbackHint(), true);
      return;
    }
    if (window.isSecureContext === false) {
      pchFailGps('GPS केवल सुरक्षित (HTTPS) पेज पर काम करता है।' + pchGpsFallbackHint(), true);
      return;
    }
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then((status) => {
        if (status.state === 'denied') {
          pchFailGps('GPS location की अनुमति अवरुद्ध है। कृपया अनुमति देने के लिए मोबाइल की सेटिंग्स में जाएं और एप्लिकेशन की GPS location को अनुमति दें। अथवा नीचे प्रोफ़ाइल स्थान चुनें या शहर मैन्युअल रूप से लिखें।', true);
          return;
        }
        // 'granted' or 'prompt' — safe to ask; browser shows native
        // prompt itself when state is 'prompt'.
        pchRequestGPS(true);
      }).catch(() => {
        // Permissions API not fully supported — fall back to asking directly.
        pchRequestGPS(true);
      });
    } else {
      pchRequestGPS(true);
    }
  }

  window.pchUseGPS = function() {
    pchCaptureDateTimeInputs();
    pchRequestGPS(false);
  };

  window.pchUseProfileLocation = async function(which) {
    pchSetStatus('प्रोफ़ाइल स्थान उपलब्ध नहीं है। कृपया मैन्युअल रूप से शहर लिखें।', true);
  };

  window.pchShowManualEntry = function() {
    document.getElementById('pch-manual-entry').style.display = 'block';
  };

  window.pchSearchManualLocation = async function() {
    pchCaptureDateTimeInputs();
    const val = document.getElementById('pch-manual-input').value.trim();
    if (!val) { pchSetStatus('कृपया शहर का नाम लिखें।', true); return; }
    pchSetStatus(val + ' खोजा जा रहा है…');
    await pchGeocode(val, {});
  };

  async function pchGeocode(query, opts) {
    opts = opts || {};
    try {
      const res = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(query) + '&count=10&language=en&format=json', { cache: 'no-store' });
      const data = await res.json();
      let results = data.results || [];
      if (!results.length && opts.fallbackQuery) {
        await pchGeocode(opts.fallbackQuery, { preferState: opts.preferState, preferCountry: opts.preferCountry });
        return;
      }
      if (!results.length) {
        pchSetStatus('स्थान नहीं मिला। कृपया दूसरा नाम आज़माएँ।', true);
        return;
      }
      let r = results[0];
      if (opts.preferCountry) {
        const byCountry = results.filter(x => (x.country || '').toLowerCase() === opts.preferCountry.toLowerCase());
        if (byCountry.length) {
          r = byCountry[0];
          if (opts.preferState) {
            const byState = byCountry.find(x => (x.admin1 || '').toLowerCase() === String(opts.preferState).toLowerCase());
            if (byState) r = byState;
          }
        }
      }
      PCH.lat = r.latitude; PCH.lon = r.longitude; PCH.name = r.name; PCH.state = r.admin1 || '';
      PCH.tzOffsetMin = null; // resolved by pchRunCalculation's own sun-times fetch, below
      pchSetStatus('स्थान मिल गया: ' + r.name + (r.admin1 ? ', ' + r.admin1 : '') + (r.country ? ', ' + r.country : ''));
      pchRunCalculation();
    } catch (e) {
      pchSetStatus('स्थान खोजने में त्रुटि हुई। कृपया इंटरनेट कनेक्शन जाँचें।', true);
    }
  }

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

  function pad2(n){ return String(n).padStart(2,'0'); }
  function ymd(date) { return date.getFullYear() + '-' + pad2(date.getMonth()+1) + '-' + pad2(date.getDate()); }
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
  const MONTH_NAMES_HI_VRAT = ['जनवरी','फरवरी','मार्च','अप्रैल','मई','जून','जुलाई','अगस्त','सितम्बर','अक्टूबर','नवम्बर','दिसम्बर'];

  const VRAT_TYOHAR_MAP = {
    'चैत्र|शुक्ल|1': 'चैत्र नवरात्रि प्रारंभ / गुड़ी पड़वा (नव संवत्सर)',
    'चैत्र|शुक्ल|2': 'चेटी चंड (सिंधी नववर्ष)',
    'चैत्र|शुक्ल|9': 'राम नवमी',
    'चैत्र|शुक्ल|11': 'कामदा एकादशी',
    'चैत्र|शुक्ल|15': 'हनुमान जयंती (चैत्र पूर्णिमा)',
    'चैत्र|कृष्ण|1': 'होली (धुलंडी / रंगों वाली होली)',
    'चैत्र|कृष्ण|11': 'पापमोचिनी एकादशी',
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
    'फाल्गुन|कृष्ण|13': 'महाशिवरात्रि'
  };

  // Returns { sun, moon, tithi, masa, pakshaShort, tithiNum } for a given JD
  function pchPanchangSnapshotAt(jd) {
    const { sun, moon } = sunMoonLongitudes(jd);
    const tithi = getTithi(sun, moon);
    const masa = getPurnimantMasa(sun, jd, tithi.index);
    const pakshaShort = tithi.paksha.replace(' पक्ष', '');
    const tithiNum = (tithi.index % 15) + 1; // 1-15 within the paksha
    return { sun, moon, tithi, masa, pakshaShort, tithiNum };
  }

  function pchVratLabelFor(masa, pakshaShort, tithiNum) {
    const key = masa + '|' + pakshaShort + '|' + tithiNum;
    let name = VRAT_TYOHAR_MAP[key];
    if (name) return name;
    if (tithiNum === 11) return 'एकादशी (गयारस) व्रत';
    if (tithiNum === 15 && pakshaShort === 'शुक्ल') return 'पूर्णिमा व्रत';
    if (tithiNum === 15 && pakshaShort === 'कृष्ण') return 'अमावस्या';
    if (tithiNum === 13) return 'प्रदोष व्रत';
    if (tithiNum === 4 && pakshaShort === 'कृष्ण') return 'संकष्टी चतुर्थी व्रत';
    if (tithiNum === 4 && pakshaShort === 'शुक्ल') return 'विनायक चतुर्थी व्रत';
    return null;
  }

  // Scans forward `daysAhead` calendar days (local, using PCH.tzOffsetMin —
  // defaults to IST 330 if location/tz hasn't resolved yet) and returns a
  // sorted array of upcoming vrat/tyohar events: { dateObj, label, masa, paksha }
  function pchBuildVratTyoharList(daysAhead) {
    const tz = (PCH && PCH.tzOffsetMin) || 330;
    const now = (PCH && PCH.customDateTime) || new Date();
    const localNow = new Date(now.getTime() + tz * 60000);
    const y = localNow.getUTCFullYear(), m = localNow.getUTCMonth(), baseDay = localNow.getUTCDate();

    // Keyed by local "y-m-d" so a Sankranti and a Tithi-based Vrat/Tyohar
    // that land on the same calendar day get merged into one entry
    // (e.g. "जगन्नाथ रथ यात्रा, कर्क संक्रांति") instead of two list items.
    const byDate = {};
    const lastSeenDay = {}; // dedupe: same tithi key shouldn't repeat within ~15 days

    for (let d = 0; d <= daysAhead; d++) {
      // Local ~06:00 (approx. sunrise) instant for this calendar day, as a UTC Date
      const localMorning = new Date(Date.UTC(y, m, baseDay + d, 6, 0, 0) - tz * 60000);
      const jd = julianDay(localMorning);
      const snap = pchPanchangSnapshotAt(jd);

      // Tithi-based vrat/tyohar (e.g. Jagannath Rath Yatra, Ekadashi, Purnima…)
      const tithiLabel = pchVratLabelFor(snap.masa, snap.pakshaShort, snap.tithiNum);
      if (tithiLabel) {
        const key = snap.masa + '|' + snap.pakshaShort + '|' + snap.tithiNum;
        if (lastSeenDay[key] === undefined || (d - lastSeenDay[key]) > 15) {
          lastSeenDay[key] = d;
          const dateKey = localMorning.getUTCFullYear() + '-' + localMorning.getUTCMonth() + '-' + localMorning.getUTCDate();
          byDate[dateKey] = byDate[dateKey] || { dateObj: localMorning, labels: [], masa: snap.masa, paksha: snap.pakshaShort };
          byDate[dateKey].labels.push(tithiLabel);
        }
      }
    }

    // Solar Sankranti — Sun entering sidereal मकर or कर्क rashi. Found via
    // precise bisection of the exact crossing instant (rather than a fixed
    // 06:00 daily sample), then attributed to whichever local calendar date
    // that instant actually falls on — a Sankranti just before local
    // midnight would otherwise be misattributed to the following day.
    const jdRangeStart = julianDay(new Date(Date.UTC(y, m, baseDay, 6, 0, 0) - tz * 60000)) - 1;
    const jdRangeEnd = jdRangeStart + daysAhead + 2;
    [{ rashi: 'मकर', label: 'मकर संक्रांति (पोंगल, उत्तरायण प्रारंभ)' }, { rashi: 'कर्क', label: 'कर्क संक्रांति' }].forEach(function (entry) {
      const seenYears = {};
      let cur = jdRangeStart;
      let prevR = getSuryaRashi(sunLongitude(cur), cur);
      while (cur < jdRangeEnd) {
        const next = cur + 1;
        const curR = getSuryaRashi(sunLongitude(next), next);
        if (curR === entry.rashi && prevR !== entry.rashi) {
          let lo = cur, hi = next;
          for (let b = 0; b < 40; b++) {
            const mid = (lo + hi) / 2;
            if (getSuryaRashi(sunLongitude(mid), mid) === entry.rashi) hi = mid; else lo = mid;
          }
          const crossLocal = new Date(toDate(hi).getTime() + tz * 60000);
          const yr = crossLocal.getUTCFullYear();
          if (seenYears[yr] === undefined) {
            seenYears[yr] = true;
            const dateOnly = new Date(Date.UTC(crossLocal.getUTCFullYear(), crossLocal.getUTCMonth(), crossLocal.getUTCDate(), 6, 0, 0) - tz * 60000);
            const dateKey = dateOnly.getUTCFullYear() + '-' + dateOnly.getUTCMonth() + '-' + dateOnly.getUTCDate();
            const snapAtDate = pchPanchangSnapshotAt(julianDay(dateOnly));
            byDate[dateKey] = byDate[dateKey] || { dateObj: dateOnly, labels: [], masa: snapAtDate.masa, paksha: snapAtDate.pakshaShort };
            byDate[dateKey].labels.push(entry.label);
          }
        }
        prevR = curR;
        cur = next;
      }
    });

    const events = Object.keys(byDate).map(function (k) {
      const e = byDate[k];
      return { dateObj: e.dateObj, label: e.labels.join(', '), masa: e.masa, paksha: e.paksha };
    });
    events.sort((a, b) => a.dateObj - b.dateObj);
    return events;
  }

  function pchVratItemHTML(ev) {
    const d = ev.dateObj;
    const dayNum = d.getUTCDate();
    const monthShort = MONTH_NAMES_HI_VRAT[d.getUTCMonth()].slice(0, 3);
    const weekday = WEEKDAY_NAMES[d.getUTCDay()];
    return '<div class="vrat-item">'
      + '<div class="vrat-date-badge"><span class="vrat-date-num">' + dayNum + '</span><span class="vrat-date-mon">' + monthShort + '</span></div>'
      + '<div class="vrat-info"><div class="vrat-name">' + ev.label + '</div>'
      + '<div class="vrat-sub">' + weekday + ' · ' + ev.masa + ' ' + ev.paksha + ' पक्ष</div></div>'
      + '</div>';
  }

  let PCH_VRAT_EVENTS = [];

  window.pchRenderVratTyohar = function pchRenderVratTyohar() {
    const tz = (PCH && PCH.tzOffsetMin) || 330;
    const nowBase = (PCH && PCH.customDateTime) ? PCH.customDateTime.getTime() : Date.now();
    const localNow = new Date(nowBase + tz * 60000);
    const daysToYearEnd = Math.round((Date.UTC(localNow.getUTCFullYear(), 11, 31) - Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate())) / 86400000);
    const daysAhead = Math.max(45, daysToYearEnd); // always enough runway for at least 5 upcoming events
    PCH_VRAT_EVENTS = pchBuildVratTyoharList(daysAhead);
    const listEl = document.getElementById('pch-vrat-list');
    if (!listEl) return;
    const upcoming = PCH_VRAT_EVENTS.slice(0, 3);
    listEl.innerHTML = upcoming.length
      ? upcoming.map(pchVratItemHTML).join('')
      : '<div style="padding:10px 2px; color:var(--ink-soft); font-size:13px;">कोई आगामी व्रत-त्योहार नहीं मिला।</div>';
  };

  function pchRenderVratTyoharFull() {
    const listEl = document.getElementById('vrat-full-list');
    if (!listEl) return;
    // Re-derive full remainder-of-year list (not just the 5 shown on Panchang)
    const tz = (PCH && PCH.tzOffsetMin) || 330;
    const nowBase = (PCH && PCH.customDateTime) ? PCH.customDateTime.getTime() : Date.now();
    const localNow = new Date(nowBase + tz * 60000);
    const daysToYearEnd = Math.round((Date.UTC(localNow.getUTCFullYear(), 11, 31) - Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate())) / 86400000);
    const events = pchBuildVratTyoharList(Math.max(1, daysToYearEnd));
    let html = '';
    let curMonthLabel = null;
    events.forEach(ev => {
      const monthLabel = MONTH_NAMES_HI_VRAT[ev.dateObj.getUTCMonth()] + ' ' + ev.dateObj.getUTCFullYear();
      if (monthLabel !== curMonthLabel) {
        curMonthLabel = monthLabel;
        html += '<div class="vrat-month-heading">' + monthLabel + '</div>';
      }
      html += pchVratItemHTML(ev);
    });
    listEl.innerHTML = html || '<div style="padding:10px 2px; color:var(--ink-soft); font-size:13px;">इस वर्ष हेतु कोई शेष व्रत-त्योहार नहीं मिला।</div>';
    const subEl = document.getElementById('vrat-full-sub');
    if (subEl) subEl.textContent = 'वर्तमान तिथि से ' + localNow.getUTCFullYear() + ' के अंत तक की एकादशी (गयारस), पूर्णिमा, अमावस्या व प्रमुख त्योहार सूची';
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
    'jammu and kashmir': 'JK', 'ladakh': 'LA', 'lakshadweep': 'LD', 'puducherry': 'PY'
  };
  function pchStateCode(stateName) {
    if (!stateName) return '';
    const code = HOL_STATE_CODE_MAP[String(stateName).trim().toLowerCase()];
    return code || '';
  }

  window.showVratTyoharFull = function showVratTyoharFull() {
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
    { y: 2026, m: 3,  d: 21, name: 'ईद-उल-फितर' },
    { y: 2026, m: 3,  d: 31, name: 'महावीर जयंती' },
    { y: 2026, m: 4,  d: 3,  name: 'गुड फ्राइडे' },
    { y: 2026, m: 5,  d: 1,  name: 'बुद्ध पूर्णिमा' },
    { y: 2026, m: 5,  d: 27, name: 'ईद-उल-जुहा (बकरीद)' },
    { y: 2026, m: 6,  d: 26, name: 'मुहर्रम' },
    { y: 2026, m: 8,  d: 15, name: 'स्वतंत्रता दिवस' },
    { y: 2026, m: 8,  d: 26, name: 'ईद-ए-मिलाद (पैगंबर मोहम्मद जन्मदिवस)' },
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
    { y: 2026, m: 3,  d: 21, name: 'ईद-उल-फितर', cats: ['central', 'state', 'bank', 'cbse', 'edu', 'hc', 'cc'] },
    { y: 2026, m: 5,  d: 27, name: 'ईद-उल-जुहा (बकरीद)', cats: ['central', 'state', 'bank', 'cbse', 'edu', 'hc', 'cc'] },
    { y: 2026, m: 6,  d: 26, name: 'मुहर्रम', cats: ['central', 'state', 'bank'] },
    { y: 2026, m: 8,  d: 26, name: 'ईद-ए-मिलाद (पैगंबर मोहम्मद जन्मदिवस)', cats: ['central', 'state', 'bank'] }
  ];

  const HOL_CAT_LABEL = { central: 'केंद्र सरकार', state: 'राज्य सरकार', bank: 'बैंक', post: 'भारतीय डाक', cbse: 'CBSE', edu: 'राज्य शिक्षा बोर्ड', hc: 'उच्च न्यायालय', cc: 'जिला/सिविल न्यायालय' };
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
    { m: 1, d: 14, name: 'मकर संक्रांति', cats: ['state', 'bank'], states: ['GJ', 'MH', 'KA', 'AP', 'TG', 'WB', 'OD', 'MP', 'CG'] },
    { m: 1, d: 14, name: 'पोंगल', cats: ['state', 'bank'], states: ['TN'] },
    { m: 1, d: 14, name: 'माघ बिहू', cats: ['state', 'bank'], states: ['AS'] },
    { m: 1, d: 26, name: 'गणतंत्र दिवस', cats: ['central', 'state', 'bank', 'cbse', 'edu', 'hc', 'cc'] },
    { m: 4, d: 13, name: 'बैसाखी', cats: ['state', 'bank'], states: ['PB', 'HR', 'CH'] },
    { m: 4, d: 14, name: 'डॉ. भीमराव अम्बेडकर जयंती', cats: ['central', 'state', 'bank'] },
    { m: 5, d: 1,  name: 'श्रमिक दिवस', cats: ['bank'] },
    { m: 5, d: 1,  name: 'महाराष्ट्र दिवस', cats: ['state', 'bank'], states: ['MH'] },
    { m: 8, d: 15, name: 'स्वतंत्रता दिवस', cats: ['central', 'state', 'bank', 'cbse', 'edu', 'hc', 'cc'] },
    { m: 10, d: 2, name: 'गांधी जयंती', cats: ['central', 'state', 'bank', 'cbse', 'edu', 'hc', 'cc'] },
    { m: 12, d: 25, name: 'क्रिसमस', cats: ['central', 'state', 'bank', 'cbse', 'edu', 'hc', 'cc'] },
    // Approximate vacation windows — indicative only (see disclaimer)
    { m: 5, d: 15, name: 'ग्रीष्मकालीन अवकाश प्रारंभ (लगभग मध्य-मई से जून) — अनुमानित', cats: ['cbse', 'edu', 'hc', 'cc'] },
    { m: 12, d: 26, name: 'शीतकालीन अवकाश प्रारंभ (लगभग 26 दिसम्बर – 1 जनवरी) — अनुमानित', cats: ['cbse', 'edu', 'hc', 'cc'] }
  ];

  // Year-specific state/regional lunar festivals whose date isn't derived
  // from the Vrat/Tyohar scan (different masa-naming convention per
  // region). Same pattern as HOL_INDIAPOST_2026 / HOL_ISLAMIC_2026 above.
  const HOL_STATE_LUNAR_2026 = [
    { y: 2026, m: 3, d: 19, name: 'गुड़ी पाड़वा', cats: ['state', 'bank'], states: ['MH'] },
    { y: 2026, m: 3, d: 19, name: 'उगादी', cats: ['state', 'bank'], states: ['KA', 'AP', 'TG'] }
  ];

  // Lunar/Hindu-calendar holidays, matched off the already-computed
  // Vrat/Tyohar events by label text (and masa/paksha where the label
  // is a generic one reused across months, e.g. "पूर्णिमा व्रत").
  // `states`, where present, restricts the rule the same way as in
  // HOL_FIXED above.
  const HOL_LUNAR_RULES = [
    { test: ev => ev.label.indexOf('होली (धुलंडी') === 0, name: 'होली', cats: ['central', 'state', 'bank', 'cbse', 'edu', 'hc', 'cc'] },
    { test: ev => ev.label === 'राम नवमी', name: 'राम नवमी', cats: ['central', 'state', 'bank'] },
    { test: ev => ev.masa === 'चैत्र' && ev.paksha === 'शुक्ल' && ev.label === 'प्रदोष व्रत', name: 'महावीर जयंती', cats: ['central', 'state', 'bank'] },
    { test: ev => ev.masa === 'वैशाख' && ev.label === 'पूर्णिमा व्रत', name: 'बुद्ध पूर्णिमा', cats: ['central', 'state', 'bank'] },
    { test: ev => ev.label.indexOf('श्री कृष्ण जन्माष्टमी') === 0, name: 'जन्माष्टमी', cats: ['central', 'state', 'bank', 'cbse', 'edu'] },
    { test: ev => ev.label.indexOf('गणेश चतुर्थी') === 0, name: 'गणेश चतुर्थी', cats: ['state'], states: HOL_REGION_MAHA_GOA },
    { test: ev => ev.label.indexOf('विजयादशमी') !== -1, name: 'दशहरा (विजयादशमी)', cats: ['central', 'state', 'bank', 'cbse', 'edu', 'hc', 'cc'] },
    { test: ev => ev.label.indexOf('दीपावली (अमावस्या)') === 0, name: 'दीपावली', cats: ['central', 'state', 'bank', 'cbse', 'edu', 'hc', 'cc'] },
    { test: ev => ev.label.indexOf('नरक चतुर्दशी') === 0, name: 'नरक चतुर्दशी (छोटी दीपावली)', cats: ['bank'], states: HOL_REGION_HINDI_BELT },
    { test: ev => ev.label.indexOf('गोवर्धन पूजा') === 0, name: 'गोवर्धन पूजा', cats: ['bank', 'state'], states: HOL_REGION_HINDI_BELT },
    { test: ev => ev.label.indexOf('भाई दूज') === 0, name: 'भाई दूज', cats: ['bank', 'state'], states: HOL_REGION_HINDI_BELT },
    { test: ev => ev.label.indexOf('महाशिवरात्रि') === 0, name: 'महाशिवरात्रि', cats: ['central', 'state', 'bank'] },
    { test: ev => ev.label.indexOf('कार्तिक पूर्णिमा') === 0, name: 'गुरु नानक जयंती', cats: ['central', 'state', 'bank'] },
    { test: ev => ev.label.indexOf('रक्षाबंधन') === 0, name: 'रक्षाबंधन', cats: ['bank'], states: HOL_REGION_HINDI_BELT }
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

  function pchBuildPublicHolidays(daysAhead) {
    const tz = (PCH && PCH.tzOffsetMin) || 330;
    const nowBase = (PCH && PCH.customDateTime) ? PCH.customDateTime.getTime() : Date.now();
    const localNow = new Date(nowBase + tz * 60000);
    const y = localNow.getUTCFullYear(), m = localNow.getUTCMonth(), d = localNow.getUTCDate();
    const todayUTC = Date.UTC(y, m, d);
    const cutoffUTC = todayUTC + daysAhead * 86400000;
    const merged = {}; // key: 'YYYY-MM-DD|name' -> { dateObj, name, cats:Set }

    function addEvent(dateUTCms, name, cats) {
      if (dateUTCms < todayUTC || dateUTCms > cutoffUTC) return;
      const dObj = new Date(dateUTCms);
      const key = dObj.getUTCFullYear() + '-' + dObj.getUTCMonth() + '-' + dObj.getUTCDate() + '|' + name;
      if (!merged[key]) merged[key] = { dateObj: dObj, name: name, cats: new Set() };
      cats.forEach(c => merged[key].cats.add(c));
    }

    // Fixed-date holidays across every year touched by the window
    const yearsSpan = [y, y + 1];
    yearsSpan.forEach(yr => {
      HOL_FIXED.forEach(h => { if (pchStateAllowed(h)) addEvent(Date.UTC(yr, h.m - 1, h.d), h.name, h.cats); });
      addEvent(pchGoodFriday(yr).getTime(), 'गुड फ्राइडे', ['central', 'state', 'bank', 'cbse', 'edu', 'hc', 'cc']);
    });

    // India Post — official published dates take precedence for the 'post' category
    HOL_INDIAPOST_2026.forEach(h => addEvent(Date.UTC(h.y, h.m - 1, h.d), h.name, ['post']));

    // Islamic-calendar gazetted holidays (Eid-ul-Fitr, Bakrid, Muharram,
    // Eid-e-Milad) — central/state/bank/education/court categories.
    // Also add 'post' so these merge with the India Post entries above
    // instead of appearing as a duplicate second entry on the same date.
    HOL_ISLAMIC_2026.forEach(h => addEvent(Date.UTC(h.y, h.m - 1, h.d), h.name, h.cats.concat('post')));

    // State-specific solar/lunar festivals not covered by the Vrat scan
    HOL_STATE_LUNAR_2026.forEach(h => { if (pchStateAllowed(h)) addEvent(Date.UTC(h.y, h.m - 1, h.d), h.name, h.cats); });

    // Lunar holidays derived from the already-computed Vrat/Tyohar scan
    (PCH_VRAT_EVENTS || []).forEach(ev => {
      for (let i = 0; i < HOL_LUNAR_RULES.length; i++) {
        const rule = HOL_LUNAR_RULES[i];
        if (rule.test(ev) && pchStateAllowed(rule)) { addEvent(Date.UTC(ev.dateObj.getUTCFullYear(), ev.dateObj.getUTCMonth(), ev.dateObj.getUTCDate()), rule.name, rule.cats); break; }
      }
    });

    const list = Object.keys(merged).map(k => merged[k]);
    list.sort((a, b) => a.dateObj - b.dateObj);
    return list;
  }

  function pchHolidayChipsHTML(catsSet) {
    return HOL_CAT_ORDER.filter(c => catsSet.has(c)).map(c => '<span class="hol-chip">' + HOL_CAT_LABEL[c] + '</span>').join('');
  }

  function pchHolidayItemHTML(ev) {
    const dObj = ev.dateObj;
    const dayNum = dObj.getUTCDate();
    const monthShort = MONTH_NAMES_HI_VRAT[dObj.getUTCMonth()].slice(0, 3);
    return '<div class="hol-item">'
      + '<div class="hol-date-badge"><span class="vrat-date-num">' + dayNum + '</span><span class="vrat-date-mon">' + monthShort + '</span></div>'
      + '<div class="hol-info"><div class="hol-name">' + ev.name + '</div><div class="hol-chips">' + pchHolidayChipsHTML(ev.cats) + '</div></div>'
      + '</div>';
  }

  let PCH_HOLIDAY_EVENTS = [];

  window.pchRenderHolidays = function pchRenderHolidays() {
    const tz = (PCH && PCH.tzOffsetMin) || 330;
    const nowBase = (PCH && PCH.customDateTime) ? PCH.customDateTime.getTime() : Date.now();
    const localNow = new Date(nowBase + tz * 60000);
    const daysToYearEnd = Math.round((Date.UTC(localNow.getUTCFullYear(), 11, 31) - Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate())) / 86400000);
    const daysAhead = Math.max(60, daysToYearEnd);
    PCH_HOLIDAY_EVENTS = pchBuildPublicHolidays(daysAhead);
    const listEl = document.getElementById('pch-holiday-list');
    if (!listEl) return;
    const placeEl = document.getElementById('hol-note-place');
    if (placeEl) {
      const code = pchStateCode(PCH.state);
      placeEl.textContent = PCH.name ? (PCH.name + (code ? ' (' + code + ')' : (PCH.state ? ', ' + PCH.state : ''))) : 'चयनित स्थान';
    }
    const upcoming = PCH_HOLIDAY_EVENTS.slice(0, 3);
    listEl.innerHTML = upcoming.length
      ? upcoming.map(pchHolidayItemHTML).join('')
      : '<div style="padding:10px 2px; color:var(--ink-soft); font-size:13px;">कोई आगामी अवकाश नहीं मिला।</div>';
  };

  let pchHolFilter = 'all';

  function pchRenderHolidaysFull() {
    const tz = (PCH && PCH.tzOffsetMin) || 330;
    const nowBase = (PCH && PCH.customDateTime) ? PCH.customDateTime.getTime() : Date.now();
    const localNow = new Date(nowBase + tz * 60000);
    const daysToYearEnd = Math.round((Date.UTC(localNow.getUTCFullYear(), 11, 31) - Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate())) / 86400000);
    const events = pchBuildPublicHolidays(Math.max(1, daysToYearEnd));

    // Filter chips row
    const filterRow = document.getElementById('hol-filter-row');
    if (filterRow) {
      const chips = [{ id: 'all', label: 'सभी' }].concat(HOL_CAT_ORDER.map(c => ({ id: c, label: HOL_CAT_LABEL[c] })));
      filterRow.innerHTML = chips.map(c => '<button class="hol-filter-btn' + (pchHolFilter === c.id ? ' active' : '') + '" onclick="pchSetHolFilter(\'' + c.id + '\')">' + c.label + '</button>').join('');
    }

    const filtered = pchHolFilter === 'all' ? events : events.filter(ev => ev.cats.has(pchHolFilter));
    const listEl = document.getElementById('hol-full-list');
    let html = '';
    let curMonthLabel = null;
    filtered.forEach(ev => {
      const monthLabel = MONTH_NAMES_HI_VRAT[ev.dateObj.getUTCMonth()] + ' ' + ev.dateObj.getUTCFullYear();
      if (monthLabel !== curMonthLabel) { curMonthLabel = monthLabel; html += '<div class="vrat-month-heading">' + monthLabel + '</div>'; }
      html += pchHolidayItemHTML(ev);
    });
    if (listEl) listEl.innerHTML = html || '<div style="padding:10px 2px; color:var(--ink-soft); font-size:13px;">इस श्रेणी में कोई शेष अवकाश नहीं मिला।</div>';

    const subEl = document.getElementById('hol-full-sub');
    if (subEl) subEl.textContent = (PCH.name ? PCH.name + (PCH.state ? ', ' + PCH.state : '') + ' हेतु — ' : '') + 'वर्तमान तिथि से ' + localNow.getUTCFullYear() + ' के अंत तक की अवकाश सूची';
  }

  window.pchSetHolFilter = function pchSetHolFilter(id) {
    pchHolFilter = id;
    pchRenderHolidaysFull();
  };

  window.showHolidaysFull = function showHolidaysFull() {
    pchHolFilter = 'all';
    pchRenderHolidaysFull();
    showSecondaryPage('page-holidays');
  };

  let pchCalcGeneration = 0;

  window.pchRunCalculation = async function pchRunCalculation() {
    const myGen = ++pchCalcGeneration; // guards against a slower, older call
                                        // overwriting a newer one's results
    document.getElementById('pch-content').style.display = 'block';
    const today = PCH.customDateTime ? new Date(PCH.customDateTime) : new Date();
    pchShowLocationBar(today);
    try {
      let sunToday, sunTomorrow;
      try {
        const tzForDate = PCH.tzOffsetMin || 330; // best guess until the fetch below resolves the real one
        const tmrw = new Date(today.getTime() + 86400000);
        [sunToday, sunTomorrow] = await Promise.all([
          pchFetchSunTimes(ymdAtOffset(today, tzForDate)),
          pchFetchSunTimes(ymdAtOffset(tmrw, tzForDate))
        ]);
      } catch (e) {
        if (myGen === pchCalcGeneration) pchSetStatus('सूर्योदय/सूर्यास्त डेटा प्राप्त करने में त्रुटि। इंटरनेट जाँचें।', true);
        return;
      }
      if (myGen !== pchCalcGeneration) return; // a newer call has since started — abandon this one
      if (!sunToday.sunrise || !sunToday.sunset) {
        pchSetStatus('इस स्थान के लिए सूर्योदय/सूर्यास्त डेटा उपलब्ध नहीं है।', true);
        return;
      }
      const tz = PCH.tzOffsetMin || 330;
      const sunrise = sunToday.sunrise, sunset = sunToday.sunset;
      const nextSunrise = sunTomorrow.sunrise || addMinutes(sunrise, 1440);

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

      document.getElementById('pch-date-sub').textContent = today.toLocaleDateString('hi-IN', { day:'numeric', month:'long', year:'numeric' }) + ' · ' + (PCH.name || '') + ' · ' + (PCH.customDateTime ? 'चयनित समय ' : 'अभी ') + fmtTime(today, tz) + ' के अनुसार';

      const elementsLiveLabelEl = document.getElementById('pch-elements-live-label');
      if (elementsLiveLabelEl) {
        elementsLiveLabelEl.textContent = PCH.customDateTime
          ? '(चयनित दिनांक व समय अनुसार — स्थिर)'
          : '(अभी के समय अनुसार — स्वतः अपडेट होता है)';
      }

      const MONTH_NAMES_HI = ['जनवरी','फरवरी','मार्च','अप्रैल','मई','जून','जुलाई','अगस्त','सितम्बर','अक्टूबर','नवम्बर','दिसम्बर'];
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
      // Backwards-compatible alias (used by masa/paksha, parenthesized form).
      function fmtUntil(jdEnd) { return fmtTak(jdEnd, true); }

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

      pchSafeSection('tatva-samvat-ritu-masa', 'pch-content', function () {
        document.getElementById('pch-tatva-samvat').textContent = 'वर्ष ' + vikramSamvat(today);
        const rituEndJD = findRituTransitionJD(jdNow);
        const rituEndLocal = rituEndJD ? new Date(toDate(rituEndJD).getTime() + tz * 60000) : null;
        document.getElementById('pch-ritu').innerHTML = getDrikRitu(jdNow) +
          (rituEndLocal ? ' <span style="font-weight:400 !important;">(' + rituEndLocal.getUTCDate() + ' ' + MONTH_NAMES_HI[rituEndLocal.getUTCMonth()] + ' तक)</span>' : '');
        const masaEndJD = findNextTransitionSlow(jdNow, purnimantMasaIndexAt, 20);
        document.getElementById('pch-purnimant-masa').innerHTML = getPurnimantMasa(sun, jdNow, tithi.index) + fmtUntil(masaEndJD);
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
          (m.start ? (fmtTime(m.start, tz) + ' – ' + fmtTime(m.end, tz)) : 'आज नहीं') +
          '</div></div>'
        ).join('');
      });

      pchSafeSection('choghadiya', 'pch-choghadiya-list', function () {
        pchLastChogh = buildChoghadiya(sunrise, sunset, nextSunrise, weekdayIdx);
        if (!pchChoghAutoInitDone) {
          pchChoghAutoInitDone = true;
          const choghToggleEl = document.getElementById('pch-chogh-toggle');
          if (choghToggleEl) choghToggleEl.checked = (today < sunrise || today >= sunset);
        }
        pchRenderChoghadiya();
      });

      if (myGen === pchCalcGeneration) {
        pchSafeSection('vrat-holidays', 'pch-vrat-list', function () {
          pchRenderVratTyohar();
          pchRenderHolidays();
        });
      }

      // Every trigger that leads here — first open, the every-minute live
      // refresh, and regaining tab/app focus after being idle — is exactly
      // where the backdrop-filter repaint bug described above can strike,
      // so nudge a repaint unconditionally once rendering is done.
      if (myGen === pchCalcGeneration) pchForceRepaint();
    } catch (err) {
      // Anything that throws here happens before the individually-guarded
      // sections above (e.g. the sunrise/sunset fetch or moonrise/moonset
      // search) — genuinely fatal, since every section below depends on it.
      console.error('Panchang calculation error:', err);
      if (myGen === pchCalcGeneration) {
        pchSetStatus('गणना में त्रुटि हुई। कृपया पुनः प्रयास करें। (' + (err && err.message ? err.message : 'unknown error') + ')', true);
      }
    }
  };

})();

function showSecondaryPage(pageId) {
    ['page-panchang', 'page-vrattyohar', 'page-holidays'].forEach(function(id) {
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

  window.openProfileModal = function openProfileModal() {
    var profile = (typeof window.pchGetProfile === 'function') ? window.pchGetProfile() : { fullName: '', photo: '', birthDate: '', birthTime: '12:00' };
    _profilePendingPhoto = profile.photo || null;

    var nameEl = document.getElementById('profile-fullname');
    var dateEl = document.getElementById('profile-birth-date');
    var timeEl = document.getElementById('profile-birth-time');
    var unknownEl = document.getElementById('profile-birth-time-unknown');
    var errEl = document.getElementById('profile-modal-error');

    if (nameEl) nameEl.value = profile.fullName || '';
    if (dateEl) dateEl.value = profile.birthDate || '';
    if (timeEl) {
      timeEl.value = profile.birthTime || '';
      timeEl.disabled = false;
    }
    if (unknownEl) unknownEl.checked = false;
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }

    refreshProfilePhotoUI(_profilePendingPhoto);

    var modal = document.getElementById('profile-modal');
    if (modal) modal.style.display = 'flex';
  };

  window.closeProfileModal = function closeProfileModal() {
    var modal = document.getElementById('profile-modal');
    if (modal) modal.style.display = 'none';
    _profilePendingPhoto = null;
    var fileInput = document.getElementById('profile-photo-input');
    if (fileInput) fileInput.value = '';
  };

  window.profileRemovePhoto = function profileRemovePhoto() {
    _profilePendingPhoto = '';
    refreshProfilePhotoUI(null);
  };

  window.saveProfileModal = function saveProfileModal() {
    var nameEl = document.getElementById('profile-fullname');
    var dateEl = document.getElementById('profile-birth-date');
    var timeEl = document.getElementById('profile-birth-time');
    var unknownEl = document.getElementById('profile-birth-time-unknown');
    var errEl = document.getElementById('profile-modal-error');

    var fullName = nameEl ? nameEl.value.trim() : '';
    var birthDate = dateEl ? dateEl.value : '';
    var birthTime = (unknownEl && unknownEl.checked) ? '12:00' : ((timeEl && timeEl.value) ? timeEl.value : '12:00');

    if (typeof window.pchSaveProfile === 'function') {
      window.pchSaveProfile({
        fullName: fullName,
        photo: _profilePendingPhoto == null ? undefined : _profilePendingPhoto,
        birthDate: birthDate,
        birthTime: birthTime
      });
    }

    applyAvatarToHeader(_profilePendingPhoto || null);

    // Refresh चंद्रबल / ताराबल if calculation is available
    if (typeof window.pchRunCalculation === 'function' && typeof PCH !== 'undefined' && PCH && PCH.lat !== null) {
      try { window.pchRunCalculation(); } catch (e) { /* ignore */ }
    }

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
    if (typeof window.pchGetProfile !== 'function') return;
    var profile = window.pchGetProfile();
    if (profile && profile.photo) applyAvatarToHeader(profile.photo);
  }

  // Boot panchang on load
  document.addEventListener('DOMContentLoaded', function() {
    if (typeof showPanchang === 'function') showPanchang();
    initCropInteractions();
    loadProfileOnBoot();
  });
