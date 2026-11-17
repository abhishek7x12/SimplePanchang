/* ============================================================================
   PRODUCT TOUR — spotlight walkthrough for first-time users: welcome → today's
   panchang → the tap-for-timeline feature (demonstrated live on the real detail
   page) → location/time button → header tools.
   Replay any time from ⚙️ → App Tour (spStartTour()).
   State lives in localStorage under pch_tour_state (cleared by "Delete my data").
   ============================================================================ */
(function () {
  'use strict';

  var STATE_KEY = 'pch_tour_state';
  var BLOCKING_MODALS = ['profile-modal', 'profile-crop-modal'];

  var $ = function (id) { return document.getElementById(id); };
  var q = function (s) { return document.querySelector(s); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  function waitFor(cond, timeout, every) {
    var t0 = Date.now();
    return new Promise(function (resolve) {
      (function tick() {
        var ok = false; try { ok = !!cond(); } catch (e) { /* not ready yet */ }
        if (ok) return resolve(true);
        if (Date.now() - t0 >= timeout) return resolve(false);
        setTimeout(tick, every || 50);
      })();
    });
  }
  function isFixed(el) {
    for (var n = el; n && n !== document.documentElement; n = n.parentElement) {
      if (getComputedStyle(n).position === 'fixed') return true;
    }
    return false;
  }
  function detailOpen() { var e = $('page-element-detail'); return !!e && e.style.display === 'block'; }

  /* ── persisted state ── */
  // Always returns a plain object: corrupt/hand-edited values (a number, a string, an array,
  // "null"…) are treated as "nothing saved" rather than crashing later on s.tour = true.
  function readState() {
    try {
      var v = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
      return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    } catch (e) { return {}; }
  }
  function writeState(s) { try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (e) { /* storage unavailable */ } }
  // Private modes / blocked storage / full quota: "seen" can't be remembered, so an automatic
  // tour would greet the person again on every visit. Only auto-start when we can persist.
  function storageWorks() {
    try {
      var k = STATE_KEY + '_probe';
      localStorage.setItem(k, '1');
      var ok = localStorage.getItem(k) === '1';
      localStorage.removeItem(k);
      return ok;
    } catch (e) { return false; }
  }
  // Anyone who already saved a profile/birth details/settings used the app before
  // this tour existed — they are not "first-time", so the tour never auto-starts for them.
  function hasLegacyData() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k !== STATE_KEY && (k.indexOf('pch_') === 0 || k === 'sp_app_settings')) return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }

  /* ── step catalogue ── */
  var STEPS = {
    welcome: { page: 'main', center: true, art: '🙏', title: 'सिंपल पंचांग में स्वागत है',
      body: 'आपके स्थान और समय के अनुसार आज का पंचांग — तिथि, नक्षत्र, मुहूर्त और व्रत-त्योहार एक ही जगह। आइए एक मिनट में देखें कि यह कैसे काम करता है।',
      next: 'शुरू करें', skip: 'अभी नहीं' },

    date: { page: 'main', target: function () { return q('#pch-content > .about-section .about-card'); },
      title: 'आज की तिथि',
      body: 'यहाँ आज की तारीख, विक्रम संवत, मास, पक्ष, तिथि और ऋतु दिखती है। सब कुछ आपकी GPS location और अभी के समय के अनुसार निकाला जाता है।' },

    tap: { page: 'main', badge: true, hand: true, target: function () { return q('.pch-item[data-eld="tithi"]'); },
      title: 'किसी भी बॉक्स को छुएँ',
      body: 'तिथि, नक्षत्र, योग, करण, राशि, मास, पक्ष, ऋतु, अयन और विक्रम संवत को छूने पर उसकी पूरी समय-रेखा खुलती है — पिछला क्या था, अभी क्या है और आगे क्या आएगा।',
      next: 'खोलकर देखें' },

    d1: { page: 'detail', badge: true,
      target: function () { return q('#eld-timeline .eld-seg--current') || q('#eld-timeline .eld-seg-card'); },
      title: 'बदलाव का समय और अभी कितना बीता',
      body: 'बाईं पट्टी के हर बिंदु के साथ वह सटीक समय लिखा है जब एक तिथि समाप्त होती है और अगली शुरू होती है। वर्तमान तिथि के कार्ड की प्रगति पट्टी बताती है कि कितना समय बीता, कितना शेष है और कुल कितने प्रतिशत — यह अपने-आप अपडेट होती रहती है।' },

    cal: { page: 'main', badge: true,
      target: function () { return q('#pch-cal-block .pch-cal-card'); },
      title: 'पंचांग कैलेंडर',
      body: 'पूरे महीने का पंचांग हमेशा सबसे ऊपर — हर तारीख़ पर पक्ष, तिथि, नक्षत्र और व्रत-त्योहार या अवकाश का नाम। किसी तारीख़ को छूते ही उस दिन के सूर्योदय के अनुसार नीचे का पूरा पंचांग बदल जाता है, और आप चाहें तो समय भी बदल सकते हैं। महीना बदलने के लिए ‹ › दबाएँ या उँगली से सरकाएँ।' },

    place: { page: 'main', target: function () { return q('#pch-badle-bar button'); },
      title: 'स्थान व समय बदलें',
      body: 'किसी दूसरे शहर का, या किसी और तारीख़ और समय का पंचांग देखना हो तो यह बटन दबाएँ।' },

    header: { page: 'main', target: function () { return q('.header-actions'); },
      title: 'सेटिंग्स और प्रोफ़ाइल',
      body: '⚙️ से डार्क मोड, सहायता और संपर्क। 👤 प्रोफ़ाइल में अपना जन्म विवरण भरें — तभी आपका चंद्रबल और ताराबल दिखेगा।' },

    done: { page: 'main', center: true, art: '✅', title: 'सब तैयार!',
      body: 'यह परिचय दोबारा देखना हो तो कभी भी ⚙️ → App Tour चुनें।', next: 'पंचांग देखें', last: true }
  };
  var FLOW = ['welcome', 'cal', 'date', 'place', 'header', 'tap', 'd1', 'done'];

  /* ── DOM ── */
  var root, spot, tip, hand, refs = {};
  function build() {
    if (root) return;
    root = document.createElement('div');
    root.className = 'sp-tour';
    root.hidden = true;
    root.innerHTML =
      '<div class="sp-tour-block"></div>' +
      '<div class="sp-tour-spot"></div>' +
      '<div class="sp-tour-hand" aria-hidden="true">👆</div>' +
      '<div class="sp-tour-tip" role="dialog" aria-modal="true" aria-labelledby="sp-tour-title" lang="hi">' +
        '<div class="sp-tour-art" id="sp-tour-art"></div>' +
        '<div class="sp-tour-badge" id="sp-tour-badge">✨ नया</div>' +
        '<div class="sp-tour-title" id="sp-tour-title"></div>' +
        '<div class="sp-tour-body" id="sp-tour-body"></div>' +
        '<div class="sp-tour-meter"><span id="sp-tour-count"></span><div class="sp-tour-bar"><i id="sp-tour-barfill"></i></div></div>' +
        '<div class="sp-tour-foot">' +
          '<button type="button" class="sp-btn sp-btn-ghost" id="sp-tour-skip">छोड़ें</button>' +
          '<span class="sp-tour-spacer"></span>' +
          '<button type="button" class="sp-btn sp-btn-sec" id="sp-tour-back">पीछे</button>' +
          '<button type="button" class="sp-btn sp-btn-primary" id="sp-tour-next">आगे</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
    spot = root.querySelector('.sp-tour-spot');
    tip = root.querySelector('.sp-tour-tip');
    hand = root.querySelector('.sp-tour-hand');
    ['art', 'badge', 'title', 'body', 'count', 'barfill', 'skip', 'back', 'next'].forEach(function (k) { refs[k] = $('sp-tour-' + k); });
    refs.next.addEventListener('click', function () { if (curStep().last) finish(true); else go(idx + 1); });
    refs.back.addEventListener('click', function () { go(idx - 1); });
    refs.skip.addEventListener('click', function () { finish(false); });
    ['wheel', 'touchmove'].forEach(function (ev) {      // page stays put while the tour is open
      root.addEventListener(ev, function (e) { e.preventDefault(); }, { passive: false });
    });
  }

  /* ── engine ── */
  var active = false, busy = false, steps = FLOW, idx = 0, nav = 0, raf = 0;
  function curStep() { return STEPS[steps[idx]]; }

  function onKey(e) {
    if (!active) return;
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); finish(false); }
    else if (e.key === 'ArrowRight') { e.stopPropagation(); if (!curStep().last) go(idx + 1); }
    else if (e.key === 'ArrowLeft') { e.stopPropagation(); go(idx - 1); }
  }
  // The phone's Back gesture closes the timeline page itself (panchang.js handles that). If the tour
  // was explaining that page, step back to the last main-page step so tour and screen stay in sync.
  function onPop() {
    if (!active || busy) return;                    // our own close/open also fires popstate while busy
    if (curStep().page !== 'detail' || detailOpen()) return;
    var j = idx - 1;
    while (j > 0 && STEPS[steps[j]].page !== 'main') j--;
    go(j);
  }
  function onReflow() {
    if (!active || busy || raf) return;
    raf = requestAnimationFrame(function () { raf = 0; place(); });
  }

  function scrollToTarget(el) {
    var vh = window.innerHeight, headerH = 62, reserve = 230;
    var r = el.getBoundingClientRect();
    var desiredTop;
    if (r.height + reserve + headerH + 24 <= vh) {
      desiredTop = headerH + 16 + Math.max(0, (vh - headerH - 16 - reserve - r.height) / 2);
    } else {
      desiredTop = headerH + 12;                       // tall target: pin to the top, tip docks at the bottom
    }
    var top = Math.max(0, window.pageYOffset + r.top - desiredTop);
    window.scrollTo({ top: top, behavior: 'smooth' });
    return new Promise(function (resolve) {
      var last = -1, still = 0, t0 = Date.now();
      (function poll() {
        var y = window.pageYOffset;
        still = (Math.abs(y - last) < 0.5) ? still + 1 : 0;
        last = y;
        if (still >= 3 || Date.now() - t0 > 1100) return resolve();
        setTimeout(poll, 40);
      })();
    });
  }

  async function go(n) {
    if (busy || !active) return;
    busy = true;
    var my = ++nav;
    // Watchdog: a step that never settles must not leave a dimmed, unclickable page behind.
    var watchdog = setTimeout(function () {
      if (active && my === nav) { console.warn('Tour step timed out; closing the tour.'); finish(false); }
    }, 8000);
    try {
      n = Math.max(0, Math.min(steps.length - 1, n));
      var st = STEPS[steps[n]];
      tip.classList.add('is-changing');
      if (st.page === 'detail' && !detailOpen()) {
        window.pchOpenElementDetail('tithi');
        await waitFor(function () { return q('#eld-timeline .eld-seg--current'); }, 2500);
        await sleep(150);
      } else if (st.page === 'main' && detailOpen()) {
        window.pchCloseElementDetail();
        await waitFor(function () { return !detailOpen(); }, 2000);
        await sleep(250);
      }
      if (my !== nav || !active) return;
      idx = n;
      var el = st.target ? st.target() : null;
      if (el && !isFixed(el)) await scrollToTarget(el);
      if (my !== nav || !active) return;
      paint(st);
      place();
    } catch (err) {
      console.error('Tour step failed:', err);
      if (active) finish(false);       // fail open: hide the overlay, hand the app back
    } finally {
      clearTimeout(watchdog);
      busy = false;
    }
  }

  function paint(st) {
    refs.title.textContent = st.title;
    refs.body.textContent = st.body;
    refs.badge.style.display = st.badge ? '' : 'none';
    var artHTML = st.art ? '<div class="sp-art-emoji">' + st.art + '</div>' : '';
    refs.art.innerHTML = artHTML;
    refs.art.style.display = artHTML ? '' : 'none';
    refs.count.textContent = (idx + 1) + ' / ' + steps.length;
    refs.barfill.style.width = (((idx + 1) / steps.length) * 100) + '%';
    refs.next.textContent = st.next || (st.last ? 'समझ गया' : 'आगे');
    refs.back.style.display = idx === 0 ? 'none' : '';
    refs.skip.style.display = st.last ? 'none' : '';
    refs.skip.textContent = st.skip || 'छोड़ें';
    root.classList.toggle('is-center', !!st.center);
    spot.classList.toggle('pulse', !!st.hand);
    hand.style.display = st.hand ? '' : 'none';
    tip.setAttribute('aria-label', st.title);
  }

  function place() {
    if (!active) return;
    var st = curStep();
    var vw = window.innerWidth, vh = window.innerHeight, gap = 12, margin = 12;
    var el = st.target ? st.target() : null;
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var left, top;
    if (!el || st.center) {
      spot.style.opacity = '0';
      hand.style.opacity = '0';
      left = (vw - tw) / 2;
      top = Math.max(margin, (vh - th) / 2);
    } else {
      var r = el.getBoundingClientRect(), pad = 8;
      var radius = parseFloat(getComputedStyle(el).borderRadius) || 12;
      var sTop = r.top - pad, sLeft = r.left - pad, sW = r.width + pad * 2, sH = r.height + pad * 2;
      spot.style.opacity = '1';
      spot.style.top = sTop + 'px'; spot.style.left = sLeft + 'px';
      spot.style.width = sW + 'px'; spot.style.height = sH + 'px';
      spot.style.borderRadius = (radius + pad / 2) + 'px';
      if (st.hand) {
        hand.style.opacity = '1';
        // park the hint in the empty top-right corner (beside the › chevron), clear of the value text
        hand.style.left = (r.right - 30) + 'px';
        hand.style.top = (r.top - 2) + 'px';
      }
      left = Math.min(Math.max(margin, r.left + r.width / 2 - tw / 2), vw - margin - tw);
      var sBottom = sTop + sH;
      if (sBottom + gap + th <= vh - margin) top = sBottom + gap;                 // below
      else if (sTop - gap - th >= 68) top = sTop - gap - th;                       // above (clear of the header)
      else top = vh - th - margin;                                                 // dock at the bottom
    }
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    tip.classList.remove('is-changing');
    if (!tip.contains(document.activeElement)) refs.next.focus({ preventScroll: true });
  }

  async function start() {
    if (active) return;
    build();
    idx = 0; active = true;
    window.spTourActive = true;
    var s = readState();
    s.tour = true;                                      // never nag twice, even if the tour is skipped
    writeState(s);
    root.hidden = false;
    document.body.classList.add('sp-tour-on');
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, { passive: true });
    window.addEventListener('popstate', onPop);
    tip.classList.add('is-changing');
    await go(0);
  }

  async function finish(completed) {
    if (!active) return;
    nav++;
    active = false;
    window.spTourActive = false;
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onReflow);
    window.removeEventListener('scroll', onReflow);
    window.removeEventListener('popstate', onPop);
    root.hidden = true;
    tip.classList.remove('is-changing');
    document.body.classList.remove('sp-tour-on');
    if (detailOpen()) {                                  // leave the app where the tour found it
      window.pchCloseElementDetail();
      await waitFor(function () { return !detailOpen(); }, 2000);
    }
    if (completed) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ── entry points ── */
  function appReady() {
    var c = $('pch-content'), t = $('pch-tithi');
    return !!c && c.style.display === 'block' && !!t && t.textContent.trim().length > 0 && !detailOpen();
  }
  function modalOpen() {
    return BLOCKING_MODALS.some(function (id) { var e = $(id); return e && e.style.display === 'flex'; });
  }

  function tourDue() {
    return !readState().tour && !hasLegacyData();
  }

  // Called by panchang.js after each successful calculation; decides once per page load.
  var autoChecked = false;
  window.spTourMaybeStart = function () {
    if (autoChecked || active) return;
    autoChecked = true;
    var due = false;
    try { due = storageWorks() && tourDue(); } catch (e) { due = false; }
    if (!due) return;
    sleep(1200).then(function () {
      return waitFor(function () { return appReady() && !modalOpen(); }, 20000, 300);
    }).then(function (ok) {
      if (ok) return start();
    }).catch(function (err) {
      console.warn('Product tour could not start:', err);
    });
  };

  // Manual replay (⚙️ menu).
  window.spStartTour = async function () {
    if (active) return;
    if (typeof window.showPanchang === 'function') window.showPanchang();
    var ok = await waitFor(appReady, 10000, 100);
    if (!ok) return;
    await sleep(350);
    start();
  };
})();
