/*!
 * accessibility.js — a drop-in accessibility widget for any website.
 * Vanilla JS, no dependencies, no build step. Embed with one <script> tag.
 *
 * IMPORTANT: this widget is an AID layered on top of a site. It is not a
 * substitute for accessible markup and it does not make a site WCAG conformant.
 * Do not market it as delivering ADA or WCAG compliance.
 *
 * Copyright (c) 2026 Ibrahim Alnimrawi. Released under the MIT Licence —
 * see LICENSE.
 *
 * Bundled typefaces are third-party works under the SIL Open Font Licence 1.1
 * and are NOT covered by the MIT Licence — see fonts/OFL-*.txt. The OFL permits
 * bundling with other software; it forbids selling the fonts on their own
 * and requires the notice to travel with them.
 *
 * ---------------------------------------------------------------------------
 * SECTION MAP
 *   1. Defaults & constants
 *   2. Utilities
 *   3. Storage          — localStorage -> sessionStorage -> memory
 *   4. Environment       — OS / browser / OS accessibility preferences
 *   5. i18n              — en + ar shipped, RTL aware
 *   6. Host stylesheet   — every CSS-only feature, built from state
 *   7. SVG filters       — colour-blind daltonisation matrices
 *   8. Engines           — text scaler, overlay, media, SR repair, read aloud,
 *                          keyboard navigation, headings navigator
 *   9. Feature registry  — one table; the panel renders itself from it
 *  10. Panel             — Shadow DOM UI, APG dialog pattern
 *  11. Public API
 * ---------------------------------------------------------------------------
 */
(function (global, factory) {
  'use strict';
  var api = factory(global);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (typeof define === 'function' && define.amd) define(function () { return api; });
  global.A11y = api;
}(typeof window !== 'undefined' ? window : this, function (window) {
  'use strict';

  var document = window.document;
  var VERSION = '1.0.0';

  /* =========================================================================
   * 1. DEFAULTS & CONSTANTS
   * ====================================================================== */

  var DEFAULTS = {
    /* Where the floating button sits. Interpreted logically: "right" means the
     * inline-end side, so it flips automatically in RTL. */
    position: 'bottom-right',
    /* 'auto' resolves: config -> <html lang> -> navigator.language -> 'en' */
    lang: 'auto',
    /* Extra or overriding string tables: { fr: { panelTitle: '...' } } */
    translations: null,
    /* Base path for the self-hosted woff2 files. Trailing slash optional. */
    fontsPath: 'fonts/',
    /* Keyboard shortcut that opens the panel. */
    shortcut: 'alt+shift+a',
    /* Whitelist of feature ids to show. null = all. */
    features: null,
    /* Blacklist of feature ids to hide. */
    exclude: null,
    /* Extra or overriding profiles. */
    profiles: null,
    storageKey: 'a11y:prefs:v1',
    /* Below the max int32 z-index so a host can still deliberately go above. */
    zIndex: 2147483000,
    /* Element the colour filters are applied to. LEAVE THIS ALONE unless you
     * have a specific reason.
     *
     * A filtered element becomes the containing block for its position:fixed
     * descendants, which makes fixed headers scroll away — EXCEPT on the root
     * element, which browsers special-case: a filter on <html> applies to the
     * canvas and creates no containing block. Measured on this project's demo
     * page at scrollY 400: filter on <html> leaves a fixed header at top 0;
     * the same filter on <body> drops it to -400.
     *
     * So 'html' is the safe value and any other target is the risky one. This
     * option exists for pages that must scope the filter to a subtree, and
     * those pages should expect to deal with fixed positioning themselves. */
    colorFilterTarget: 'html',
    /* When true, OS preferences (reduced motion, more contrast) are applied
     * silently on first visit instead of being offered as a suggestion. */
    autoApplyOsPreferences: false,
    /* Id of the widget's host element. Change it only on a genuine collision. */
    rootId: 'a11y-root',
    /* Optional link shown in the panel footer. */
    statementUrl: null,
    /* Called after every state change with a copy of the state. */
    onChange: null
  };

  /* Elements we never touch when restyling or walking the host page. */
  var SKIP_TAGS = {
    SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, IFRAME: 1, OBJECT: 1, EMBED: 1,
    CANVAS: 1, SVG: 1, VIDEO: 1, AUDIO: 1, TEXTAREA: 1, CODE: 1, PRE: 1,
    KBD: 1, SAMP: 1, TEMPLATE: 1, HEAD: 1, TITLE: 1, META: 1, LINK: 1
  };

  var HEADING_SEL = 'h1, h2, h3, h4, h5, h6, [role="heading"]';
  var LANDMARK_SEL = 'main, nav, header, footer, aside, form, section[aria-label],' +
    ' section[aria-labelledby], [role="main"], [role="navigation"], [role="banner"],' +
    ' [role="contentinfo"], [role="complementary"], [role="search"], [role="region"]';
  var FOCUSABLE_SEL = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]),' +
    ' select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]),' +
    ' summary, audio[controls], video[controls], [contenteditable]:not([contenteditable="false"])';

  /* Conservative. Aggressive [class*=ad] matching hits .header, .badge, .loading,
   * .shadow, .download — all common and all wrong. Only match whole words. */
  var DISTRACTION_SEL = [
    '[class~="ad"]', '[class~="ads"]', '[class~="advert"]', '[class~="advertisement"]',
    '[class~="banner-ad"]', '[class~="carousel"]', '[class~="slider"]', '[class~="marquee"]',
    '[id~="ad"]', '[id="ads"]', '[id="advertisement"]',
    'marquee', 'blink', '[aria-label="advertisement" i]', 'ins.adsbygoogle'
  ].join(',');

  /* =========================================================================
   * 2. UTILITIES
   * ====================================================================== */

  function extend(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
    }
    return target;
  }

  function toArray(list) { return Array.prototype.slice.call(list || []); }

  function qsa(selector, root) {
    try { return toArray((root || document).querySelectorAll(selector)); }
    catch (e) { return []; }
  }

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) for (var k in props) {
      if (!Object.prototype.hasOwnProperty.call(props, k)) continue;
      if (k === 'text') node.textContent = props[k];
      else if (k === 'html') node.innerHTML = props[k];
      else if (k === 'class') node.className = props[k];
      else if (k.indexOf('on') === 0 && typeof props[k] === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), props[k]);
      } else if (props[k] != null && props[k] !== false) {
        node.setAttribute(k, props[k] === true ? '' : String(props[k]));
      }
    }
    if (children) for (var i = 0; i < children.length; i++) {
      if (children[i]) node.appendChild(children[i]);
    }
    return node;
  }

  /* Escapes a string for safe use inside a CSS selector or declaration value.
   * Used on config-supplied ids so a stray quote cannot break out of a rule. */
  function cssEscape(str) {
    return String(str).replace(/[^a-zA-Z0-9_-]/g, function (c) {
      return '\\' + c.charCodeAt(0).toString(16) + ' ';
    });
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      var self = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  /* rAF-throttled wrapper: coalesces bursts of pointermove into one paint. */
  function rafThrottle(fn) {
    var queued = false, lastArgs;
    return function () {
      lastArgs = arguments;
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(function () {
        queued = false;
        fn.apply(null, lastArgs);
      });
    };
  }

  var idSeq = 0;
  function uid(prefix) { return 'a11y-' + (prefix || 'x') + '-' + (++idSeq); }

  var idle = window.requestIdleCallback
    ? function (fn) { return window.requestIdleCallback(fn, { timeout: 500 }); }
    : function (fn) { return setTimeout(function () { fn({ timeRemaining: function () { return 8; } }); }, 16); };

  function isVisible(node) {
    if (!node || !node.getClientRects) return false;
    return !!(node.offsetWidth || node.offsetHeight || node.getClientRects().length);
  }

  function accessibleName(node) {
    if (!node) return '';
    var label = node.getAttribute('aria-label');
    if (label && label.trim()) return label.trim();
    var by = node.getAttribute('aria-labelledby');
    if (by) {
      var parts = by.split(/\s+/).map(function (id) {
        var ref = document.getElementById(id);
        return ref ? ref.textContent : '';
      }).join(' ').trim();
      if (parts) return parts;
    }
    if (node.labels && node.labels.length) return (node.labels[0].textContent || '').trim();
    var title = node.getAttribute('title');
    if (title && title.trim()) return title.trim();
    var text = (node.textContent || '').trim();
    if (text) return text;
    if (node.tagName === 'INPUT') {
      return (node.getAttribute('placeholder') || node.getAttribute('value') || '').trim();
    }
    var img = node.querySelector && node.querySelector('img[alt]');
    if (img) return (img.getAttribute('alt') || '').trim();
    return '';
  }

  /* =========================================================================
   * 3. STORAGE
   *
   * Private-mode Safari and hardened browser settings throw on write rather
   * than returning null, so every access is guarded and we degrade quietly:
   * localStorage -> sessionStorage -> in-memory (lost on reload, but working).
   * ====================================================================== */

  var Store = (function () {
    var memory = {};
    var backend = null;
    var kind = 'memory';

    function probe(store) {
      try {
        var k = '__a11y_probe__';
        store.setItem(k, '1');
        store.removeItem(k);
        return true;
      } catch (e) { return false; }
    }

    try {
      if (window.localStorage && probe(window.localStorage)) {
        backend = window.localStorage; kind = 'local';
      } else if (window.sessionStorage && probe(window.sessionStorage)) {
        backend = window.sessionStorage; kind = 'session';
      }
    } catch (e) { /* accessing the property itself can throw */ }

    return {
      kind: kind,
      available: kind !== 'memory',
      get: function (key) {
        try { return backend ? backend.getItem(key) : (memory[key] || null); }
        catch (e) { return memory[key] || null; }
      },
      set: function (key, value) {
        memory[key] = value;
        try { if (backend) backend.setItem(key, value); }
        catch (e) { /* quota exceeded or blocked — memory copy still stands */ }
      },
      remove: function (key) {
        delete memory[key];
        try { if (backend) backend.removeItem(key); } catch (e) {}
      }
    };
  }());

  /* =========================================================================
   * 4. ENVIRONMENT — "read the OS, Browser data"
   *
   * Everything here is a real, queryable signal. Note what is deliberately
   * absent: screen reader detection. No browser exposes it, and code that
   * claims to detect one is guessing. We ship screen reader *support* instead.
   * ====================================================================== */

  var Env = (function () {
    var mqCache = {};

    function mq(query) {
      if (!window.matchMedia) return null;
      if (!mqCache[query]) {
        try { mqCache[query] = window.matchMedia(query); }
        catch (e) { mqCache[query] = null; }
      }
      return mqCache[query];
    }

    function matches(query) {
      var m = mq(query);
      return !!(m && m.matches);
    }

    function parseUA() {
      var ua = navigator.userAgent || '';
      var uad = navigator.userAgentData;
      var os = 'unknown', browser = 'unknown', version = '';

      /* Chromium exposes structured hints; everyone else needs the UA string. */
      if (uad && uad.platform) {
        os = uad.platform.toLowerCase().replace(/\s+/g, '');
        if (uad.brands && uad.brands.length) {
          for (var i = 0; i < uad.brands.length; i++) {
            var b = uad.brands[i].brand;
            if (/not.a.brand/i.test(b) || /chromium/i.test(b)) continue;
            browser = b.toLowerCase(); version = uad.brands[i].version; break;
          }
          if (browser === 'unknown') { browser = 'chromium'; version = uad.brands[0].version; }
        }
      }

      if (os === 'unknown') {
        if (/windows nt/i.test(ua)) os = 'windows';
        else if (/android/i.test(ua)) os = 'android';
        else if (/iphone|ipad|ipod/i.test(ua)) os = 'ios';
        else if (/mac os x/i.test(ua)) os = 'macos';
        else if (/cros/i.test(ua)) os = 'chromeos';
        else if (/linux/i.test(ua)) os = 'linux';
      }
      /* iPadOS 13+ reports itself as a Mac; touch points give it away. */
      if (os === 'macos' && navigator.maxTouchPoints > 1) os = 'ios';

      if (browser === 'unknown') {
        var m;
        if ((m = ua.match(/Edg(?:e|A|iOS)?\/([\d.]+)/))) { browser = 'edge'; version = m[1]; }
        else if ((m = ua.match(/OPR\/([\d.]+)/))) { browser = 'opera'; version = m[1]; }
        else if ((m = ua.match(/Firefox\/([\d.]+)/))) { browser = 'firefox'; version = m[1]; }
        else if ((m = ua.match(/Chrome\/([\d.]+)/))) { browser = 'chrome'; version = m[1]; }
        else if ((m = ua.match(/Version\/([\d.]+).*Safari/))) { browser = 'safari'; version = m[1]; }
      }

      return {
        os: os,
        browser: browser,
        browserVersion: version,
        mobile: uad ? !!uad.mobile : /Mobi|Android|iPhone|iPad|iPod/i.test(ua),
        /* Used for the shortcut hint in the panel. */
        modifierLabel: os === 'macos' || os === 'ios' ? '⌥' : 'Alt'
      };
    }

    var listeners = [];

    function read() {
      var base = parseUA();
      return extend(base, {
        reducedMotion: matches('(prefers-reduced-motion: reduce)'),
        moreContrast: matches('(prefers-contrast: more)'),
        lessContrast: matches('(prefers-contrast: less)'),
        darkScheme: matches('(prefers-color-scheme: dark)'),
        /* Windows High Contrast / forced colors owns colour rendering entirely.
         * When it is on we stand down rather than fight it. */
        forcedColors: matches('(forced-colors: active)'),
        reducedTransparency: matches('(prefers-reduced-transparency: reduce)'),
        invertedColors: matches('(inverted-colors: inverted)'),
        coarsePointer: matches('(pointer: coarse)'),
        noHover: matches('(hover: none)'),
        pageLang: (document.documentElement.getAttribute('lang') || '').toLowerCase(),
        pageDir: (document.documentElement.getAttribute('dir') || '').toLowerCase(),
        uiLang: (navigator.language || 'en').toLowerCase(),
        dpr: window.devicePixelRatio || 1,
        storage: Store.kind,
        speech: !!window.speechSynthesis,
        version: VERSION
      });
    }

    var current = read();

    /* OS preferences can change mid-session (a user toggles reduced motion in
     * system settings). Re-read and let listeners re-apply live. */
    var watched = [
      '(prefers-reduced-motion: reduce)', '(prefers-contrast: more)',
      '(prefers-color-scheme: dark)', '(forced-colors: active)',
      '(prefers-reduced-transparency: reduce)', '(pointer: coarse)'
    ];

    function onChange() {
      current = read();
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](current); } catch (e) {}
      }
    }

    watched.forEach(function (q) {
      var m = mq(q);
      if (!m) return;
      if (m.addEventListener) m.addEventListener('change', onChange);
      else if (m.addListener) m.addListener(onChange);
    });

    return {
      get: function () { return current; },
      refresh: function () { current = read(); return current; },
      subscribe: function (fn) { listeners.push(fn); },
      matches: matches
    };
  }());

  /* =========================================================================
   * 5. i18n — English and Arabic ship by default.
   *
   * The panel's direction is set on its own shadow root, independently of the
   * host page, so an Arabic panel works on an LTR site and vice versa.
   * ====================================================================== */

  var RTL_LANGS = { ar: 1, he: 1, fa: 1, ur: 1, ps: 1, sd: 1, ug: 1, yi: 1, dv: 1, ku: 1 };

  var STRINGS = {
    en: {
      _dir: 'ltr',
      _name: 'English',
      panelTitle: 'Accessibility',
      openLabel: 'Open the accessibility menu',
      closeLabel: 'Close the accessibility menu',
      close: 'Close',
      resetAll: 'Reset all',
      hideWidget: 'Hide for this visit',
      hideWidgetHint: 'The menu returns on your next visit.',
      searchLabel: 'Search settings',
      searchPlaceholder: 'Search…',
      noResults: 'No settings match that search.',
      language: 'Language',
      statement: 'Accessibility statement',
      shortcutHint: 'Press {keys} to open this menu.',
      poweredBy: 'Accessibility tools',

      groupProfiles: 'Quick profiles',
      groupText: 'Text and reading',
      groupVision: 'Colour and vision',
      groupFocus: 'Focus and navigation',
      groupReader: 'Screen reader',

      profileContrast: 'Enhanced contrast and larger text',
      profileDyslexia: 'Dyslexia friendly',
      profileCalm: 'Calm and seizure safe',
      profileLowVision: 'Low vision',
      profileFocus: 'Reduce distraction',
      profileKeyboard: 'Keyboard only',
      profileColorBlind: 'Colour blind',
      profileReader: 'Screen reader friendly',

      fontSize: 'Text size',
      lineSpacing: 'Line spacing',
      letterSpacing: 'Letter spacing',
      wordSpacing: 'Word spacing',
      clearFont: 'Clear font',
      clearFontHint: 'A highly legible typeface designed for low vision.',
      dyslexiaFont: 'Dyslexia font',
      dyslexiaFontHint: 'Weighted letter bottoms make characters harder to confuse.',
      textAlign: 'Text alignment',
      alignLeft: 'Left',
      alignCenter: 'Centre',
      alignRight: 'Right',
      alignDefault: 'Default',

      contrast: 'Contrast',
      contrastNone: 'Normal',
      contrastHigh: 'High contrast',
      contrastInvert: 'Inverted',
      contrastSaturate: 'More colour',
      contrastMono: 'Greyscale',
      calmColors: 'Calm colours',
      calmColorsHint: 'Softens harsh, saturated colours.',
      colorBlind: 'Colour blindness',
      cbNone: 'Off',
      cbProtan: 'Protanopia (red)',
      cbDeutan: 'Deuteranopia (green)',
      cbTritan: 'Tritanopia (blue)',
      magnifier: 'Magnifier',
      magnifierHint: 'Shows the text under your pointer enlarged.',
      bigCursor: 'Large cursor',

      readingMask: 'Field of view',
      readingMaskHint: 'Dims the page except for a band around your pointer.',
      maskHeight: 'Field of view height',
      sectionFocus: 'Focus on a section',
      sectionFocusHint: 'Use the arrow keys to move between sections of the page.',
      highlightHeadings: 'Highlight headings',
      headingsList: 'List all headings',
      highlightLinks: 'Highlight links',
      keyboardNav: 'Keyboard navigation',
      keyboardNavHint: 'Adds skip links, a strong focus outline and quick keys.',
      hideImages: 'Hide images',
      hideMedia: 'Hide video and embeds',
      muteMedia: 'Mute all media',
      stopAnimations: 'Stop animations and flashing',
      reduceDistraction: 'Reduce distractions',

      srRepair: 'Screen reader helper',
      srRepairHint: 'Repairs missing labels and landmarks. Reversible.',
      readAloud: 'Read aloud',
      readAloudHint: 'Uses your browser voice. This is not a replacement for a screen reader.',
      readPage: 'Read the page',
      readSelection: 'Read the selection',
      stopReading: 'Stop reading',
      speechUnavailable: 'Your browser does not offer speech.',

      skipToMain: 'Skip to main content',
      skipToNav: 'Skip to navigation',
      skipToSearch: 'Skip to search',
      skipToFooter: 'Skip to footer',
      headingsDialogTitle: 'Headings on this page',
      noHeadings: 'No headings were found on this page.',
      level: 'Level {n}',

      suggestTitle: 'Match your system settings?',
      suggestMotion: 'Your device asks for reduced motion.',
      suggestContrast: 'Your device asks for more contrast.',
      suggestApply: 'Turn on',
      suggestDismiss: 'No thanks',

      on: 'on',
      off: 'off',
      announceSet: '{feature} {value}',
      announceOn: '{feature} on',
      announceOff: '{feature} off',
      announceReset: 'All accessibility settings reset.',
      percent: '{n} percent',
      defaultValue: 'Default'
    },

    ar: {
      _dir: 'rtl',
      _name: 'العربية',
      panelTitle: 'إمكانية الوصول',
      openLabel: 'فتح قائمة إمكانية الوصول',
      closeLabel: 'إغلاق قائمة إمكانية الوصول',
      close: 'إغلاق',
      resetAll: 'إعادة ضبط الكل',
      hideWidget: 'إخفاء خلال هذه الزيارة',
      hideWidgetHint: 'ستظهر القائمة مجدداً في زيارتك القادمة.',
      searchLabel: 'البحث في الإعدادات',
      searchPlaceholder: 'بحث…',
      noResults: 'لا توجد إعدادات مطابقة لبحثك.',
      language: 'اللغة',
      statement: 'بيان إمكانية الوصول',
      shortcutHint: 'اضغط {keys} لفتح هذه القائمة.',
      poweredBy: 'أدوات إمكانية الوصول',

      groupProfiles: 'أوضاع جاهزة',
      groupText: 'النص والقراءة',
      groupVision: 'الألوان والرؤية',
      groupFocus: 'التركيز والتنقل',
      groupReader: 'قارئ الشاشة',

      profileContrast: 'تباين مُحسّن ونص أكبر',
      profileDyslexia: 'مناسب لذوي عسر القراءة',
      profileCalm: 'هادئ وآمن من نوبات الصرع',
      profileLowVision: 'مناسب لضعاف البصر',
      profileFocus: 'تقليل المشتتات',
      profileKeyboard: 'لوحة المفاتيح فقط',
      profileColorBlind: 'عمى الألوان',
      profileReader: 'متوافق مع قارئ الشاشة',

      fontSize: 'حجم النص',
      lineSpacing: 'تباعد الأسطر',
      letterSpacing: 'تباعد الحروف',
      wordSpacing: 'تباعد الكلمات',
      clearFont: 'خط واضح',
      clearFontHint: 'خط شديد الوضوح مصمم لضعاف البصر.',
      dyslexiaFont: 'خط لذوي عسر القراءة',
      dyslexiaFontHint: 'حروف ذات قاعدة أثقل، فيصعب الخلط بينها.',
      textAlign: 'محاذاة النص',
      alignLeft: 'يسار',
      alignCenter: 'وسط',
      alignRight: 'يمين',
      alignDefault: 'افتراضي',

      contrast: 'التباين',
      contrastNone: 'عادي',
      contrastHigh: 'تباين عالٍ',
      contrastInvert: 'ألوان معكوسة',
      contrastSaturate: 'ألوان أكثر تشبعاً',
      contrastMono: 'تدرّج رمادي',
      calmColors: 'ألوان هادئة',
      calmColorsHint: 'تخفف حدة الألوان الصارخة والمشبعة.',
      colorBlind: 'عمى الألوان',
      cbNone: 'معطّل',
      cbProtan: 'عمى اللون الأحمر (بروتانوبيا)',
      cbDeutan: 'عمى اللون الأخضر (ديوترانوبيا)',
      cbTritan: 'عمى اللون الأزرق (تريتانوبيا)',
      magnifier: 'عدسة مكبّرة',
      magnifierHint: 'تعرض النص الواقع تحت المؤشر مكبّراً.',
      bigCursor: 'مؤشر كبير',

      readingMask: 'مجال الرؤية',
      readingMaskHint: 'يُعتّم الصفحة باستثناء شريط حول المؤشر.',
      maskHeight: 'ارتفاع مجال الرؤية',
      sectionFocus: 'التركيز على قسم',
      sectionFocusHint: 'استخدم مفاتيح الأسهم للتنقل بين أقسام الصفحة.',
      highlightHeadings: 'إبراز العناوين',
      headingsList: 'عرض جميع العناوين',
      highlightLinks: 'إبراز الروابط',
      keyboardNav: 'التنقل بلوحة المفاتيح',
      keyboardNavHint: 'يضيف روابط تخطٍّ وإطارَ تركيزٍ واضحاً ومفاتيحَ اختصار.',
      hideImages: 'إخفاء الصور',
      hideMedia: 'إخفاء الفيديو والمحتوى المضمّن',
      muteMedia: 'كتم صوت جميع الوسائط',
      stopAnimations: 'إيقاف الحركة والوميض',
      reduceDistraction: 'تقليل المشتتات',

      srRepair: 'مساعد قارئ الشاشة',
      srRepairHint: 'يُصلح التسميات والمعالم المفقودة، ويمكن التراجع عنه.',
      readAloud: 'قراءة بصوت عالٍ',
      readAloudHint: 'تستخدم صوت المتصفح، وهي ليست بديلاً عن قارئ الشاشة.',
      readPage: 'قراءة الصفحة',
      readSelection: 'قراءة النص المحدد',
      stopReading: 'إيقاف القراءة',
      speechUnavailable: 'لا يدعم متصفحك ميزة النطق.',

      skipToMain: 'الانتقال إلى المحتوى الرئيسي',
      skipToNav: 'الانتقال إلى قائمة التنقل',
      skipToSearch: 'الانتقال إلى البحث',
      skipToFooter: 'الانتقال إلى تذييل الصفحة',
      headingsDialogTitle: 'عناوين هذه الصفحة',
      noHeadings: 'لم يُعثر على أي عناوين في هذه الصفحة.',
      level: 'المستوى {n}',

      suggestTitle: 'هل تريد مطابقة إعدادات جهازك؟',
      suggestMotion: 'إعدادات جهازك تفضّل تقليل الحركة.',
      suggestContrast: 'إعدادات جهازك تفضّل تبايناً أعلى.',
      suggestApply: 'تفعيل',
      suggestDismiss: 'لا، شكراً',

      on: 'مفعّل',
      off: 'معطّل',
      announceSet: '{feature}: {value}',
      announceOn: '{feature}: مفعّل',
      announceOff: '{feature}: معطّل',
      announceReset: 'أُعيد ضبط جميع إعدادات إمكانية الوصول.',
      percent: '{n} في المئة',
      defaultValue: 'افتراضي'
    }
  };

  var I18n = {
    lang: 'en',
    dir: 'ltr',
    tables: STRINGS,

    /* config -> <html lang> -> navigator.language -> en */
    resolve: function (configLang) {
      var env = Env.get();
      var candidates = [];
      if (configLang && configLang !== 'auto') candidates.push(configLang);
      if (env.pageLang) candidates.push(env.pageLang);
      if (env.uiLang) candidates.push(env.uiLang);
      candidates.push('en');

      for (var i = 0; i < candidates.length; i++) {
        var c = String(candidates[i]).toLowerCase();
        if (this.tables[c]) return c;
        var base = c.split('-')[0];
        if (this.tables[base]) return base;
      }
      return 'en';
    },

    use: function (lang) {
      this.lang = this.tables[lang] ? lang : 'en';
      var table = this.tables[this.lang];
      this.dir = table._dir || (RTL_LANGS[this.lang] ? 'rtl' : 'ltr');
      return this.lang;
    },

    /* Missing keys fall back to English, then to the key itself, so a partial
     * custom translation degrades to readable English rather than blanks. */
    t: function (key, vars) {
      var table = this.tables[this.lang] || this.tables.en;
      var str = table[key];
      if (str == null) str = this.tables.en[key];
      if (str == null) return key;
      if (vars) {
        str = str.replace(/\{(\w+)\}/g, function (m, name) {
          return vars[name] != null ? vars[name] : m;
        });
      }
      return str;
    },

    available: function () {
      var out = [];
      for (var k in this.tables) {
        if (Object.prototype.hasOwnProperty.call(this.tables, k)) {
          out.push({ code: k, name: this.tables[k]._name || k });
        }
      }
      return out;
    }
  };

  /* =========================================================================
   * 6. HOST STYLESHEET
   *
   * The sheet is written ONCE and never rebuilt. Every feature is expressed as
   * a rule keyed off a data-attribute or custom property on <html>, so a state
   * change is one attribute write, not a stylesheet reparse.
   *
   * Two rules apply throughout:
   *   - Every selector excludes the widget root by id. Our root lives in the
   *     document, so a bare `*` selector WOULD match it. Shadow descendants are
   *     unreachable from a document stylesheet, so the root alone needs excluding.
   *   - No bare `*`. Always `body *:not(#root)`.
   * ====================================================================== */

  /* Icon fonts are the classic casualty of a global font-family override: the
   * glyphs are private-use codepoints that only exist in that font, so swapping
   * the family renders tofu. Exclude the common icon conventions. */
  var ICON_GUARD = ':not(i):not([class*="icon"]):not([class*="Icon"]):not([class*="fa-"])' +
    ':not([class*="material"]):not([class*="glyph"]):not([class*="symbol"])' +
    ':not(.fa):not(.fas):not(.far):not(.fab):not(.fal)';

  var FONT_STACKS = {
    /* Neither bundled face covers Arabic. Per-glyph fallback means Arabic text
     * silently drops to the next family, so name a real Arabic face explicitly
     * rather than letting the browser pick something arbitrary. Tahoma is the
     * dependable last resort — it ships on Windows with genuine Arabic coverage. */
    clear: "'Atkinson Hyperlegible', 'Noto Naskh Arabic', Verdana, Tahoma, 'Segoe UI', Arial, sans-serif",
    dyslexic: "'OpenDyslexic', 'Noto Naskh Arabic', Verdana, Tahoma, Arial, sans-serif"
  };

  /* The Atkinson faces are Google's subsets: `latin` covers ASCII plus Western
   * European accents, `latin-ext` the rest. Declaring both with unicode-range
   * means a browser downloads only the subset the page actually needs — an
   * English page pulls 17KB, a French one 27KB. OpenDyslexic ships as one file. */
  var LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,' +
    'U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
  var LATIN_EXT = 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,' +
    'U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,' +
    'U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';

  var FONT_FILES = [
    { family: 'OpenDyslexic', file: 'OpenDyslexic-Regular.woff2', weight: 400 },
    { family: 'OpenDyslexic', file: 'OpenDyslexic-Bold.woff2', weight: 700 },
    { family: 'Atkinson Hyperlegible', file: 'AtkinsonHyperlegible-Regular-latin.woff2', weight: 400, range: LATIN },
    { family: 'Atkinson Hyperlegible', file: 'AtkinsonHyperlegible-Regular-latin-ext.woff2', weight: 400, range: LATIN_EXT },
    { family: 'Atkinson Hyperlegible', file: 'AtkinsonHyperlegible-Bold-latin.woff2', weight: 700, range: LATIN },
    { family: 'Atkinson Hyperlegible', file: 'AtkinsonHyperlegible-Bold-latin-ext.woff2', weight: 700, range: LATIN_EXT }
  ];

  function buildFontFaces(fontsPath) {
    var base = String(fontsPath || '');
    if (base && base.charAt(base.length - 1) !== '/') base += '/';
    return FONT_FILES.map(function (f) {
      /* font-display:swap — text must never be invisible while a font loads,
       * least of all for a reader who turned this on because they were already
       * struggling with the page. */
      return '@font-face{font-family:"' + f.family + '";' +
        'src:url("' + base + f.file + '") format("woff2");' +
        'font-weight:' + f.weight + ';font-style:normal;font-display:swap;' +
        (f.range ? 'unicode-range:' + f.range + ';' : '') + '}';
    }).join('');
  }

  function buildHostCss(cfg) {
    var R = '#' + cssEscape(cfg.rootId);          /* our root, always excluded */
    var NOT = ':not(' + R + ')';
    /* Every host element, not us. One compound selector, not a comma list: every
     * rule below is written as 'html[data-a11y-…] ' + ALL, and a prefix binds only
     * to the first selector of a list — the second half would match
     * unconditionally and force every mode on, whatever the visitor chose. */
    var ALL = ':is(body, body *)' + NOT;
    var TEXT = 'body *' + NOT;
    var css = [];

    css.push(buildFontFaces(cfg.fontsPath));

    /* --- Text: spacing -----------------------------------------------------
     * These four properties all inherit, but inheritance loses to any direct
     * declaration on a descendant — and real sites set line-height on p, li, td
     * constantly. So they are forced on every element, not just body. */
    css.push('html[data-a11y-line] ' + ALL + '{line-height:var(--a11y-line) !important;}');
    css.push('html[data-a11y-letter] ' + ALL + '{letter-spacing:var(--a11y-letter) !important;}');
    css.push('html[data-a11y-word] ' + ALL + '{word-spacing:var(--a11y-word) !important;}');

    /* Physical, not logical. "Align left" on Arabic content is a real request
     * from some readers, and a logical property would quietly do the opposite. */
    ['left', 'center', 'right'].forEach(function (dir) {
      css.push('html[data-a11y-align="' + dir + '"] ' + ALL +
        '{text-align:' + dir + ' !important;}');
    });

    /* --- Text: fonts ------------------------------------------------------- */
    Object.keys(FONT_STACKS).forEach(function (key) {
      css.push('html[data-a11y-font="' + key + '"] body' + ICON_GUARD + ',' +
        'html[data-a11y-font="' + key + '"] body *' + NOT + ICON_GUARD +
        '{font-family:' + FONT_STACKS[key] + ' !important;}');
    });
    /* OpenDyslexic runs small at a given px size; nudge it back to parity. */
    css.push('html[data-a11y-font="dyslexic"] body{--a11y-font-nudge:1.06;}');

    /* --- Colour: the combined filter ---------------------------------------
     * Contrast mode, calm colours and colour-blind correction all end up in one
     * `filter` declaration, composed into --a11y-filter by the engine. A single
     * property means they compose instead of overwriting each other.
     *
     * The target is <html> by default, which is deliberate: the root element is
     * exempt from the rule that a filtered element becomes the containing block
     * for fixed descendants, so a host's fixed header keeps working. Moving the
     * filter to <body> or an app root is what breaks it. */
    css.push('[data-a11y-filtered]{filter:var(--a11y-filter) !important;}');
    /* Inversion has to be undone on media, or every photo becomes a negative. */
    css.push('html[data-a11y-contrast="invert"] img' + NOT + ',' +
      'html[data-a11y-contrast="invert"] video' + NOT + ',' +
      'html[data-a11y-contrast="invert"] picture' + NOT + ',' +
      'html[data-a11y-contrast="invert"] [style*="background-image"]' + NOT +
      '{filter:invert(1) hue-rotate(180deg) !important;}');

    /* --- Colour: forced high contrast --------------------------------------
     * A filter cannot create contrast that is not there (grey on grey stays
     * grey when saturated), so high contrast is a genuine repaint. */
    css.push([
      'html[data-a11y-contrast="high"] ' + ALL + '{',
      'background-color:#000 !important;background-image:none !important;',
      'color:#fff !important;border-color:#fff !important;text-shadow:none !important;}',
      'html[data-a11y-contrast="high"] a' + NOT + ',',
      'html[data-a11y-contrast="high"] a' + NOT + ' *{color:#ff0 !important;}',
      'html[data-a11y-contrast="high"] button' + NOT + ',',
      'html[data-a11y-contrast="high"] [role="button"]' + NOT + ',',
      'html[data-a11y-contrast="high"] input' + NOT + ',',
      'html[data-a11y-contrast="high"] select' + NOT + ',',
      'html[data-a11y-contrast="high"] textarea' + NOT + '{',
      'background-color:#000 !important;color:#fff !important;',
      'border:2px solid #fff !important;}',
      'html[data-a11y-contrast="high"] :focus-visible' + NOT +
      '{outline:3px solid #ff0 !important;outline-offset:2px !important;}'
    ].join(''));

    /* --- Links and headings ------------------------------------------------ */
    css.push('html[data-a11y-links] a[href]' + NOT + '{' +
      'text-decoration:underline !important;text-decoration-thickness:2px !important;' +
      'text-underline-offset:2px !important;background-color:#ff0 !important;' +
      'color:#00c !important;outline:1px solid #00c !important;}');
    css.push('html[data-a11y-links] a[href]' + NOT + ' *{' +
      'background-color:transparent !important;color:inherit !important;}');
    /* A link wrapping only an image gets a visible frame instead of a highlight
     * behind a picture nobody can see through. */
    css.push('html[data-a11y-links] a[href]' + NOT + ' img{outline:3px solid #00c !important;}');

    /* Written out rather than using :is() — one unsupported selector in a list
     * invalidates the whole rule, and this feature is not worth losing on an
     * older browser to save four lines. */
    css.push(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', '[role="heading"]'].map(function (s) {
      return 'html[data-a11y-headings] ' + s + NOT;
    }).join(',') + '{outline:2px dashed #b30000 !important;outline-offset:3px !important;' +
      'background-color:rgba(255,235,140,.45) !important;}');
    /* The level marker is the point of the feature: structure made visible. */
    ['1', '2', '3', '4', '5', '6'].forEach(function (n) {
      css.push('html[data-a11y-headings] h' + n + NOT + '::before{' +
        'content:"H' + n + '";display:inline-block;font:700 11px/1.4 monospace;' +
        'background:#b30000;color:#fff;padding:1px 5px;margin-inline-end:6px;' +
        'border-radius:3px;vertical-align:middle;}');
    });

    /* --- Cursor ------------------------------------------------------------ */
    var cursorSvg = "url(\"data:image/svg+xml;utf8," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24">' +
      '<path d="M5 2l14 10-6 1 3.5 7-3 1.4L10 14l-5 4z" fill="#fff" stroke="#000" stroke-width="1.5"/></svg>'
    ) + "\") 4 2, auto";
    css.push('html[data-a11y-cursor] ' + ALL + '{cursor:' + cursorSvg + ' !important;}');
    css.push('html[data-a11y-cursor] a' + NOT + ',html[data-a11y-cursor] button' + NOT +
      ',html[data-a11y-cursor] [role="button"]' + NOT + '{cursor:' + cursorSvg + ' !important;}');

    /* --- Distraction removal ----------------------------------------------- */
    /* visibility:hidden, not display:none — it preserves layout, so hiding
     * images does not collapse the page into an unrecognisable strip. */
    css.push('html[data-a11y-noimages] img' + NOT + ',' +
      'html[data-a11y-noimages] picture' + NOT + ',' +
      'html[data-a11y-noimages] svg' + NOT + ':not([role="img"]) ' +
      '{visibility:hidden !important;}');
    css.push('html[data-a11y-noimages] ' + TEXT + '{background-image:none !important;}');
    css.push('html[data-a11y-nomedia] video' + NOT + ',' +
      'html[data-a11y-nomedia] iframe' + NOT + ',' +
      'html[data-a11y-nomedia] object' + NOT + ',' +
      'html[data-a11y-nomedia] embed' + NOT + '{display:none !important;}');
    css.push('html[data-a11y-nodistract] ' + DISTRACTION_SEL.split(',').map(function (s) {
      return s.trim() + NOT;
    }).join(',html[data-a11y-nodistract] ') + '{display:none !important;}');

    /* --- Animation and flashing -------------------------------------------
     * Flashing content is a seizure risk, so this is the one feature that is
     * deliberately blunt: nothing moves, nothing transitions, nothing scrolls
     * smoothly. Duration 0.01ms rather than `none` so animationend still fires
     * and host scripts waiting on it do not deadlock. */
    css.push([
      'html[data-a11y-nomotion] ' + ALL + ',',
      'html[data-a11y-nomotion] ' + TEXT + '::before,',
      'html[data-a11y-nomotion] ' + TEXT + '::after{',
      'animation-duration:.01ms !important;animation-iteration-count:1 !important;',
      'animation-delay:0s !important;transition-duration:.01ms !important;',
      'transition-delay:0s !important;scroll-behavior:auto !important;}',
      'html[data-a11y-nomotion]{scroll-behavior:auto !important;}'
    ].join(''));

    /* --- Keyboard navigation ----------------------------------------------
     * Sites routinely ship `outline:none` with nothing in its place, which is
     * the single most common keyboard accessibility defect on the web. This
     * puts a strong indicator back and makes it impossible to suppress. */
    css.push([
      'html[data-a11y-keyboard] ' + TEXT + ':focus,',
      'html[data-a11y-keyboard] ' + TEXT + ':focus-visible{',
      'outline:4px solid #0a58ff !important;outline-offset:2px !important;',
      'box-shadow:0 0 0 8px rgba(10,88,255,.35) !important;',
      'border-radius:2px;scroll-margin:6rem;}'
    ].join(''));

    /* --- Reading mask, magnifier, section spotlight ------------------------
     * The overlay chrome itself lives in the shadow root. What the host page
     * needs is only the spotlight target marker. */
    css.push('html[data-a11y-section] [data-a11y-spot]{' +
      'position:relative !important;z-index:2147482000 !important;' +
      'outline:4px solid #0a58ff !important;outline-offset:4px !important;' +
      'background-color:Canvas;scroll-margin:8rem;}');

    /* --- Screen reader helper --------------------------------------------- */
    css.push('html[data-a11y-srflag] [data-a11y-noalt]{' +
      'outline:3px dotted #d97706 !important;outline-offset:2px !important;}');

    /* --- Read aloud --------------------------------------------------------
     * Highlighting by block rather than wrapping words in spans: wrapping
     * rewrites the host's DOM and breaks any script holding node references. */
    css.push('[data-a11y-speaking]{background-color:#fff3a3 !important;' +
      'color:#000 !important;outline:3px solid #b45309 !important;' +
      'outline-offset:2px !important;scroll-margin:8rem;}');

    /* --- Our own root: hold the line ---------------------------------------
     * A host stylesheet can target our root element directly — it is an
     * ordinary document node. These declarations, plus the attribute observer
     * in the panel, make that hard to do by accident. */
    css.push(R + '{position:fixed !important;inset:0 !important;' +
      'display:block !important;visibility:visible !important;opacity:1 !important;' +
      'pointer-events:none !important;z-index:' + (parseInt(cfg.zIndex, 10) || 2147483000) + ' !important;' +
      'filter:none !important;transform:none !important;transition:none !important;' +
      'animation:none !important;clip:auto !important;clip-path:none !important;' +
      'max-width:none !important;max-height:none !important;margin:0 !important;' +
      'padding:0 !important;border:0 !important;background:transparent !important;' +
      'contain:none !important;mix-blend-mode:normal !important;}');

    /* Never let a host print stylesheet, or ours, put the widget on paper. */
    css.push('@media print{' + R + '{display:none !important;}}');

    return css.join('\n');
  }

  /* =========================================================================
   * 7. SVG COLOUR FILTERS
   *
   * Daltonisation, not simulation: the goal is to make confusable colours
   * distinguishable to someone with that deficiency, by shifting the error
   * from the lost channel into the channels they still perceive.
   * ====================================================================== */

  var CB_MATRICES = {
    /* Red-blind. Red information is redistributed into green and blue. */
    protan: '0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0',
    /* Green-blind. The most common deficiency by a wide margin. */
    deutan: '0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0',
    /* Blue-blind. Rare, but the shift is the most visually dramatic. */
    tritan: '0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0'
  };

  function buildFilterDefs() {
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';

    var defs = document.createElementNS(svgNS, 'defs');
    Object.keys(CB_MATRICES).forEach(function (key) {
      var filter = document.createElementNS(svgNS, 'filter');
      filter.setAttribute('id', 'a11y-cb-' + key);
      /* sRGB, not the linearRGB default: these matrices are derived in gamma
       * space, and linear interpolation washes the correction out. */
      filter.setAttribute('color-interpolation-filters', 'sRGB');
      var matrix = document.createElementNS(svgNS, 'feColorMatrix');
      matrix.setAttribute('type', 'matrix');
      matrix.setAttribute('values', CB_MATRICES[key]);
      filter.appendChild(matrix);
      defs.appendChild(filter);
    });
    svg.appendChild(defs);
    return svg;
  }

  /* Contrast modes that are expressible as a pointwise colour operation. The
   * `high` mode is absent on purpose — it is a repaint, handled in CSS above. */
  var CONTRAST_FILTERS = {
    invert: 'invert(1) hue-rotate(180deg)',
    saturate: 'saturate(1.8) contrast(1.15)',
    mono: 'grayscale(1) contrast(1.1)'
  };

  /* =========================================================================
   * 8. ENGINES
   *
   * Everything that cannot be expressed as a CSS rule. Each engine owns its own
   * teardown, because a widget that cannot cleanly undo itself is worse than no
   * widget at all — a visitor who turns a feature off must get their page back.
   * ====================================================================== */

  /* Shared runtime handles, populated during init. */
  var RT = {
    cfg: null,
    state: null,
    root: null,       /* the document-level host element */
    shadow: null,     /* its shadow root */
    layer: null,      /* overlay container inside the shadow root */
    announce: function () {},
    setState: function () {}
  };

  /* -------------------------------------------------------------------------
   * 8a. TEXT SCALER
   *
   * `html { font-size }` is the obvious approach and it is wrong: it only moves
   * text sized in rem/em, and the majority of real sites size in px, where it
   * silently does nothing. So each element's computed size is measured once,
   * cached, and rewritten as an absolute px value.
   *
   * Absolute values also mean nesting does not compound — a scaled <span> inside
   * a scaled <p> is set from its own original size, not from its parent's new one.
   * ---------------------------------------------------------------------- */

  var TextScaler = (function () {
    var baseSizes = new WeakMap();
    var touched = [];
    var observer = null;
    var factor = 1;
    var pending = null;

    function eligible(node) {
      if (!node || node.nodeType !== 1) return false;
      if (SKIP_TAGS[node.tagName]) return false;
      if (node === RT.root || (RT.root && RT.root.contains(node))) return false;
      if (node.hasAttribute('data-a11y-ignore')) return false;
      /* Only elements that actually render text of their own. Scaling a wrapper
       * div achieves nothing and doubles the work. */
      for (var i = 0; i < node.childNodes.length; i++) {
        var child = node.childNodes[i];
        if (child.nodeType === 3 && child.nodeValue && child.nodeValue.trim()) return true;
      }
      return false;
    }

    function collect(root) {
      var out = [];
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
        acceptNode: function (node) {
          if (SKIP_TAGS[node.tagName]) return NodeFilter.FILTER_REJECT;
          if (node === RT.root) return NodeFilter.FILTER_REJECT;
          return eligible(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
      });
      var n;
      while ((n = walker.nextNode())) out.push(n);
      if (eligible(root)) out.unshift(root);
      return out;
    }

    /* Reads and writes are separated per chunk. Interleaving getComputedStyle
     * with style writes forces a synchronous reflow on every single element,
     * which turns a 3000-element page into a multi-second freeze. */
    function process(nodes, done) {
      var index = 0;
      var CHUNK = 120;

      function step() {
        var slice = nodes.slice(index, index + CHUNK);
        if (!slice.length) { pending = null; if (done) done(); return; }

        var sizes = new Array(slice.length);
        for (var i = 0; i < slice.length; i++) {
          var node = slice[i];
          if (baseSizes.has(node)) { sizes[i] = baseSizes.get(node); continue; }
          var px = parseFloat(window.getComputedStyle(node).fontSize);
          if (!px || isNaN(px)) px = 16;
          baseSizes.set(node, px);
          touched.push(node);
          sizes[i] = px;
        }
        for (var j = 0; j < slice.length; j++) {
          slice[j].style.setProperty('font-size', (sizes[j] * factor).toFixed(2) + 'px', 'important');
        }

        index += CHUNK;
        pending = idle(step);
      }
      pending = idle(step);
    }

    function watch() {
      if (observer || !window.MutationObserver) return;
      var queue = [];
      var flush = debounce(function () {
        var nodes = [];
        while (queue.length) {
          var added = queue.shift();
          if (added.nodeType === 1) nodes = nodes.concat(collect(added));
        }
        if (nodes.length) process(nodes);
      }, 120);

      observer = new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          var added = records[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            if (added[j].nodeType === 1 && !(RT.root && RT.root.contains(added[j]))) {
              queue.push(added[j]);
            }
          }
        }
        if (queue.length) flush();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    function unwatch() {
      if (observer) { observer.disconnect(); observer = null; }
    }

    return {
      set: function (value) {
        factor = value || 1;
        if (pending) { pending = null; }
        if (factor === 1) { this.reset(); return; }
        if (!document.body) return;
        process(collect(document.body));
        watch();
      },
      /* Re-measure from scratch. Needed when another feature changes the font
       * family, since a different face at the same px reads at a different size. */
      remeasure: function () {
        if (factor === 1) return;
        var f = factor;
        this.reset();
        factor = f;
        process(collect(document.body));
        watch();
      },
      reset: function () {
        unwatch();
        for (var i = 0; i < touched.length; i++) {
          try { touched[i].style.removeProperty('font-size'); } catch (e) {}
        }
        touched = [];
        baseSizes = new WeakMap();
        factor = 1;
      }
    };
  }());

  /* -------------------------------------------------------------------------
   * 8b. OVERLAY — reading mask, magnifier, section spotlight
   *
   * All three are the same primitive: dim everything, cut a hole. One element,
   * one giant box-shadow spreading past the viewport, one pointer listener
   * shared between the consumers so a page never carries three of them.
   * ---------------------------------------------------------------------- */

  var Overlay = (function () {
    var band = null, lens = null, spot = null;
    var maskOn = false, magOn = false, sectionOn = false;
    var bound = false;
    var maskHeight = 140;
    var lastY = 0, lastX = 0;

    function ensure() {
      if (band || !RT.layer) return;
      band = el('div', { 'class': 'a11y-mask', 'aria-hidden': 'true' });
      lens = el('div', { 'class': 'a11y-lens', 'aria-hidden': 'true', role: 'status' });
      RT.layer.appendChild(band);
      RT.layer.appendChild(lens);
    }

    var onMove = rafThrottle(function (x, y) {
      lastX = x; lastY = y;
      if (maskOn && band) {
        band.style.top = Math.max(0, y - maskHeight / 2) + 'px';
        band.style.height = maskHeight + 'px';
      }
      if (magOn) updateLens(x, y);
    });

    function pointerHandler(e) {
      if (e.touches && e.touches.length) onMove(e.touches[0].clientX, e.touches[0].clientY);
      else onMove(e.clientX, e.clientY);
    }

    /* A true optical lens needs the page rasterised, which means a rendering
     * dependency this widget will not take. Reading the text under the pointer
     * and re-rendering it large is the honest vanilla equivalent, and it has a
     * real advantage: the output is selectable, themeable, and speaks to a
     * screen reader, which a bitmap zoom never does. */
    function updateLens(x, y) {
      if (!lens) return;
      var target = document.elementFromPoint(x, y);
      if (!target || (RT.root && RT.root.contains(target))) return;

      var node = target, text = '';
      var hops = 0;
      while (node && hops++ < 4) {
        if (SKIP_TAGS[node.tagName]) break;
        text = (node.textContent || '').trim().replace(/\s+/g, ' ');
        if (text.length > 1) break;
        node = node.parentElement;
      }
      if (!text) { lens.textContent = ''; lens.classList.remove('is-on'); return; }
      if (text.length > 220) text = text.slice(0, 220) + '…';
      if (lens.textContent !== text) lens.textContent = text;
      lens.classList.add('is-on');
      /* Keep the bar away from the pointer so it never covers what is being read. */
      lens.classList.toggle('is-bottom', y < window.innerHeight / 2);
    }

    function bind() {
      if (bound) return;
      document.addEventListener('pointermove', pointerHandler, { passive: true });
      document.addEventListener('touchmove', pointerHandler, { passive: true });
      bound = true;
    }

    function unbind() {
      if (!bound || maskOn || magOn) return;
      document.removeEventListener('pointermove', pointerHandler);
      document.removeEventListener('touchmove', pointerHandler);
      bound = false;
    }

    /* --- Section spotlight ------------------------------------------------- */
    var sections = [], sectionIndex = -1;

    function findSections() {
      var found = qsa(LANDMARK_SEL).filter(function (n) {
        return isVisible(n) && !(RT.root && RT.root.contains(n));
      });
      /* Landmarks nest (a nav inside a header). Keep the outermost so arrowing
       * through them steps across the page rather than down into it. */
      found = found.filter(function (n) {
        return !found.some(function (other) { return other !== n && other.contains(n); });
      });
      if (found.length < 2) {
        found = qsa('body > *').filter(function (n) {
          return isVisible(n) && n !== RT.root && !SKIP_TAGS[n.tagName];
        });
      }
      return found;
    }

    function paintSpot(node) {
      if (!spot || !node) return;
      var r = node.getBoundingClientRect();
      spot.style.top = (r.top - 6) + 'px';
      spot.style.left = (r.left - 6) + 'px';
      spot.style.width = (r.width + 12) + 'px';
      spot.style.height = (r.height + 12) + 'px';
    }

    function gotoSection(delta) {
      if (!sections.length) return;
      sectionIndex = (sectionIndex + delta + sections.length) % sections.length;
      var node = sections[sectionIndex];
      qsa('[data-a11y-spot]').forEach(function (n) { n.removeAttribute('data-a11y-spot'); });
      node.setAttribute('data-a11y-spot', '');
      node.scrollIntoView({ block: 'center', behavior: 'auto' });
      /* Move real focus too: a spotlight a screen reader cannot follow is
       * decoration, not navigation. */
      if (!node.hasAttribute('tabindex')) {
        node.setAttribute('tabindex', '-1');
        node.setAttribute('data-a11y-tmptab', '');
      }
      try { node.focus({ preventScroll: true }); } catch (e) {}
      window.requestAnimationFrame(function () { paintSpot(node); });
      RT.announce(accessibleName(node).slice(0, 60) || node.tagName.toLowerCase());
    }

    function sectionKeys(e) {
      if (!sectionOn) return;
      var t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); gotoSection(1); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); gotoSection(-1); }
      else if (e.key === 'Escape') { RT.setState('sectionFocus', false); }
    }

    var repaint = rafThrottle(function () {
      if (sectionOn && sections[sectionIndex]) paintSpot(sections[sectionIndex]);
    });

    return {
      mask: function (on) {
        ensure();
        maskOn = !!on;
        if (band) band.classList.toggle('is-on', maskOn);
        if (maskOn) { bind(); onMove(lastX, lastY || window.innerHeight / 2); }
        else unbind();
      },
      maskHeight: function (px) {
        maskHeight = px;
        if (band && maskOn) onMove(lastX, lastY || window.innerHeight / 2);
      },
      magnifier: function (on) {
        ensure();
        magOn = !!on;
        if (lens) lens.classList.toggle('is-on', magOn);
        if (magOn) bind(); else { if (lens) lens.textContent = ''; unbind(); }
      },
      section: function (on) {
        sectionOn = !!on;
        if (sectionOn) {
          if (!spot && RT.layer) {
            spot = el('div', { 'class': 'a11y-spot', 'aria-hidden': 'true' });
            RT.layer.appendChild(spot);
          }
          sections = findSections();
          sectionIndex = -1;
          if (spot) spot.classList.add('is-on');
          document.addEventListener('keydown', sectionKeys, true);
          window.addEventListener('scroll', repaint, { passive: true });
          window.addEventListener('resize', repaint, { passive: true });
          gotoSection(1);
        } else {
          document.removeEventListener('keydown', sectionKeys, true);
          window.removeEventListener('scroll', repaint);
          window.removeEventListener('resize', repaint);
          if (spot) spot.classList.remove('is-on');
          qsa('[data-a11y-spot]').forEach(function (n) { n.removeAttribute('data-a11y-spot'); });
          qsa('[data-a11y-tmptab]').forEach(function (n) {
            n.removeAttribute('tabindex'); n.removeAttribute('data-a11y-tmptab');
          });
          sections = []; sectionIndex = -1;
        }
      },
      reset: function () { this.mask(false); this.magnifier(false); this.section(false); }
    };
  }());

  /* -------------------------------------------------------------------------
   * 8c. MEDIA — animated GIFs, autoplay, muting
   *
   * The CSS in section 6 stops CSS animation. It cannot stop an animated GIF,
   * which is a decoded image loop, or a playing video. Those need JavaScript,
   * and flashing content is a seizure risk, so they get it.
   * ---------------------------------------------------------------------- */

  var Media = (function () {
    var frozen = [];
    var paused = [];
    var muted = [];

    function looksAnimated(img) {
      var src = img.currentSrc || img.src || '';
      /* Extension OR data-URI mime — an inlined GIF has no ".gif" in its URL,
       * and inlined banners are exactly the kind of thing that flashes. */
      return /\.(gif|webp|apng)(\?|#|$)/i.test(src) ||
        /^data:image\/(gif|webp|apng)/i.test(src);
    }

    return {
      freeze: function () {
        qsa('img').forEach(function (img) {
          if (!looksAnimated(img) || img.getAttribute('data-a11y-frozen')) return;
          if (RT.root && RT.root.contains(img)) return;
          if (!img.complete || !img.naturalWidth) return;
          try {
            var canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            /* drawImage works on a cross-origin image; only reading the pixels
             * back out would taint the canvas, and we never do that. */
            canvas.getContext('2d').drawImage(img, 0, 0);
            canvas.className = img.className;
            canvas.setAttribute('role', 'img');
            canvas.setAttribute('aria-label', img.getAttribute('alt') || '');
            canvas.setAttribute('data-a11y-still', '');
            /* getComputedStyle().cssText returns '' in several engines, so copy
             * the rendered box explicitly rather than trusting it. */
            var box = img.getBoundingClientRect();
            canvas.style.width = (box.width || img.width || 0) + 'px';
            canvas.style.height = (box.height || img.height || 0) + 'px';
            canvas.style.maxWidth = '100%';
            canvas.style.verticalAlign = 'middle';
            img.parentNode.insertBefore(canvas, img);
            img.style.setProperty('display', 'none', 'important');
            img.setAttribute('data-a11y-frozen', '');
            frozen.push({ img: img, canvas: canvas });
          } catch (e) { /* a broken or tainted image simply stays animated */ }
        });

        qsa('video, audio').forEach(function (m) {
          if (RT.root && RT.root.contains(m)) return;
          if (!m.paused) { try { m.pause(); paused.push(m); } catch (e) {} }
          m.removeAttribute('autoplay');
        });
      },
      unfreeze: function () {
        frozen.forEach(function (pair) {
          try {
            pair.img.style.removeProperty('display');
            pair.img.removeAttribute('data-a11y-frozen');
            if (pair.canvas.parentNode) pair.canvas.parentNode.removeChild(pair.canvas);
          } catch (e) {}
        });
        frozen = [];
        paused = [];
      },
      mute: function (on) {
        if (on) {
          qsa('video, audio').forEach(function (m) {
            if (RT.root && RT.root.contains(m)) return;
            if (!m.muted) { m.muted = true; muted.push(m); }
          });
        } else {
          muted.forEach(function (m) { try { m.muted = false; } catch (e) {} });
          muted = [];
        }
      },
      reset: function () { this.unfreeze(); this.mute(false); }
    };
  }());

  /* -------------------------------------------------------------------------
   * 8d. SCREEN READER HELPER
   *
   * A reversible repair pass. Every write is journalled with the previous value
   * so undo restores the page exactly, including attributes that were absent
   * rather than empty — those two states are not the same to a screen reader.
   *
   * This repairs what is missing. It cannot repair what is wrong: an image with
   * alt="image1" is invisible to us, and no widget can infer what it depicts.
   * ---------------------------------------------------------------------- */

  var SrHelper = (function () {
    var journal = [];
    var active = false;

    function setAttr(node, name, value) {
      journal.push({ node: node, name: name, had: node.hasAttribute(name), prev: node.getAttribute(name) });
      node.setAttribute(name, value);
    }

    /* Turns "hero-banner_2x.jpg" into "hero banner". Weak, but a screen reader
     * announcing "hero banner" beats announcing the raw filename, which is what
     * most browsers fall back to when alt is missing entirely. */
    function nameFromSrc(src) {
      if (!src) return '';
      /* A data: or blob: URI has no filename — only payload. Treating its tail
       * as a name yields things like "svg%3E", which is worse than silence:
       * a screen reader would read the garbage aloud, and the bogus alt would
       * then make the element look labelled to the control repair below. */
      if (/^(data|blob|about|javascript):/i.test(src)) return '';
      var file = src.split(/[?#]/)[0].split('/').pop() || '';
      file = file.replace(/\.[a-z0-9]+$/i, '')
        .replace(/[-_+]+/g, ' ')
        .replace(/\b\d+x\b/gi, '')
        .replace(/\b(img|image|photo|pic|icon|logo)\b/gi, '')
        .replace(/\s+/g, ' ').trim();
      return /^[\d\s]*$/.test(file) ? '' : file;
    }

    function repairImages() {
      qsa('img').forEach(function (img) {
        if (RT.root && RT.root.contains(img)) return;
        if (img.hasAttribute('alt')) return;

        /* Inside a link or button that already has a name, the image is
         * redundant — the correct repair is to silence it, not to describe it. */
        var host = img.closest && img.closest('a[href], button, [role="button"]');
        if (host) {
          var hostName = accessibleName(host).replace((img.getAttribute('alt') || ''), '').trim();
          if (hostName) { setAttr(img, 'alt', ''); return; }
        }
        var guess = nameFromSrc(img.currentSrc || img.src);
        if (guess) setAttr(img, 'alt', guess);
        else setAttr(img, 'alt', '');
        setAttr(img, 'data-a11y-noalt', '');
      });
    }

    function repairControls() {
      qsa('button, [role="button"], a[href]').forEach(function (node) {
        if (RT.root && RT.root.contains(node)) return;
        if (accessibleName(node)) return;
        var guess = '';
        var icon = node.querySelector('img[src]');
        if (icon) guess = nameFromSrc(icon.getAttribute('src'));
        if (!guess && node.tagName === 'A') {
          var href = node.getAttribute('href') || '';
          if (href && href.charAt(0) !== '#' && !/^javascript:/i.test(href)) {
            guess = nameFromSrc(href) || href.replace(/^https?:\/\//, '').slice(0, 40);
          }
        }
        if (!guess) {
          /* Class, id and name attributes are a last resort but often carry
           * real intent: "btn-close", "nav-toggle", "search-submit". */
          var words = [node.getAttribute('class'), node.getAttribute('id'),
            node.getAttribute('name'), node.getAttribute('data-action')].join(' ');
          var hit = words.split(/[\s\-_]+/).filter(function (c) {
            return /^(close|menu|search|toggle|next|prev|previous|play|pause|submit|cart|share|open|back|expand|collapse|delete|remove|edit|save)$/i.test(c);
          })[0];
          if (hit) guess = hit.toLowerCase();
        }
        if (guess) setAttr(node, 'aria-label', guess);
        /* Nothing could be derived. Do NOT invent a name — labelling a "close"
         * button "menu" is worse than leaving it unlabelled, because it sounds
         * authoritative. Flag it visibly instead so the defect is at least seen. */
        else setAttr(node, 'data-a11y-noalt', '');
      });

      qsa('input:not([type="hidden"]), select, textarea').forEach(function (field) {
        if (RT.root && RT.root.contains(field)) return;
        if (accessibleName(field)) return;
        var guess = field.getAttribute('placeholder') || field.getAttribute('name') ||
          field.getAttribute('type') || '';
        guess = guess.replace(/[-_]+/g, ' ').trim();
        if (guess) setAttr(field, 'aria-label', guess);
      });

      qsa('iframe').forEach(function (frame) {
        if (frame.getAttribute('title')) return;
        var src = frame.getAttribute('src') || '';
        var host = '';
        try { host = new URL(src, location.href).hostname.replace(/^www\./, ''); } catch (e) {}
        setAttr(frame, 'title', host ? 'Embedded content from ' + host : 'Embedded content');
      });
    }

    function repairLandmarks() {
      var html = document.documentElement;
      if (!html.getAttribute('lang')) {
        setAttr(html, 'lang', (navigator.language || 'en').split('-')[0]);
      }
      if (!document.querySelector('main, [role="main"]')) {
        var candidate = document.querySelector('#main, #content, #main-content, .main, .content') ||
          (function () {
            /* Otherwise: the top-level block carrying the most text. Crude, but
             * a main landmark in roughly the right place beats none at all. */
            var best = null, bestLen = 0;
            qsa('body > *').forEach(function (n) {
              if (n === RT.root || SKIP_TAGS[n.tagName] || !isVisible(n)) return;
              var len = (n.textContent || '').trim().length;
              if (len > bestLen) { bestLen = len; best = n; }
            });
            return bestLen > 200 ? best : null;
          }());
        if (candidate) setAttr(candidate, 'role', 'main');
      }
      /* Mark the current page in navigation so a screen reader user is told
       * where they are, not just where they can go. */
      var here = location.pathname.replace(/\/$/, '');
      qsa('nav a[href], [role="navigation"] a[href]').forEach(function (link) {
        if (link.getAttribute('aria-current')) return;
        var path = '';
        try { path = new URL(link.href, location.href).pathname.replace(/\/$/, ''); } catch (e) { return; }
        if (path === here) setAttr(link, 'aria-current', 'page');
      });
    }

    return {
      enable: function () {
        if (active || !document.body) return;
        active = true;
        repairImages();
        repairControls();
        repairLandmarks();
        document.documentElement.setAttribute('data-a11y-srflag', '');
      },
      disable: function () {
        if (!active) return;
        active = false;
        /* Reverse order: a later write may have overwritten an earlier one. */
        for (var i = journal.length - 1; i >= 0; i--) {
          var entry = journal[i];
          try {
            if (entry.had) entry.node.setAttribute(entry.name, entry.prev);
            else entry.node.removeAttribute(entry.name);
          } catch (e) {}
        }
        journal = [];
        document.documentElement.removeAttribute('data-a11y-srflag');
      },
      report: function () {
        return { repairs: journal.length };
      }
    };
  }());

  /* -------------------------------------------------------------------------
   * 8e. READ ALOUD
   *
   * speechSynthesis, chunked by block so highlighting can follow along. This is
   * what most visitors mean when they ask a widget for a "screen reader", and
   * it is genuinely useful — but it reads content only. It cannot describe
   * controls, announce state, or navigate. It is not NVDA, JAWS or VoiceOver,
   * and the README says so in as many words.
   * ---------------------------------------------------------------------- */

  var Speech = (function () {
    var synth = window.speechSynthesis;
    var queue = [];
    var index = 0;
    var speaking = false;
    var current = null;
    var onStateChange = null;

    function blocks() {
      var sel = 'h1,h2,h3,h4,h5,h6,p,li,dd,dt,blockquote,figcaption,td,th,summary';
      return qsa(sel).filter(function (n) {
        if (RT.root && RT.root.contains(n)) return false;
        if (!isVisible(n)) return false;
        if (n.closest('[aria-hidden="true"]')) return false;
        var text = (n.textContent || '').trim();
        if (!text) return false;
        /* A <p> inside a <li> would otherwise be read twice. */
        return !n.querySelector(sel);
      });
    }

    function clearHighlight() {
      if (current) { try { current.removeAttribute('data-a11y-speaking'); } catch (e) {} }
      current = null;
    }

    function speakNext() {
      if (!speaking || index >= queue.length) { stop(); return; }
      var node = queue[index++];
      clearHighlight();
      current = node;
      if (node.setAttribute) {
        node.setAttribute('data-a11y-speaking', '');
        try { node.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
      }
      var utter = new window.SpeechSynthesisUtterance((node.textContent || '').trim().slice(0, 1000));
      utter.lang = document.documentElement.getAttribute('lang') || navigator.language || 'en';
      utter.rate = 1;
      utter.onend = speakNext;
      utter.onerror = speakNext;
      synth.speak(utter);
    }

    function start(nodes) {
      if (!synth) return false;
      stop();
      queue = nodes;
      index = 0;
      if (!queue.length) return false;
      speaking = true;
      if (onStateChange) onStateChange(true);
      speakNext();
      return true;
    }

    function stop() {
      var wasSpeaking = speaking;
      speaking = false;
      clearHighlight();
      queue = []; index = 0;
      try { if (synth) synth.cancel(); } catch (e) {}
      if (wasSpeaking && onStateChange) onStateChange(false);
    }

    return {
      available: !!synth,
      isSpeaking: function () { return speaking; },
      onChange: function (fn) { onStateChange = fn; },
      readPage: function () { return start(blocks()); },
      readSelection: function () {
        var sel = window.getSelection && window.getSelection();
        var text = sel ? String(sel).trim() : '';
        if (!text) return false;
        /* A detached node so the highlight logic has something to hold, without
         * touching the host's DOM around the user's actual selection. */
        var holder = document.createElement('div');
        holder.textContent = text;
        return start([holder]);
      },
      stop: stop,
      toggle: function () {
        if (speaking) { stop(); return false; }
        return this.readPage();
      }
    };
  }());

  /* -------------------------------------------------------------------------
   * 8f. KEYBOARD NAVIGATION
   *
   * Skip links plus screen-reader-style quick keys (H headings, L links,
   * D landmarks) for sighted keyboard users — people who navigate by keyboard
   * but get none of the structural shortcuts a screen reader user has.
   * ---------------------------------------------------------------------- */

  var Keyboard = (function () {
    var active = false;
    var skipBar = null;
    var cursors = { h: -1, l: -1, d: -1 };

    function targets(kind) {
      var sel = kind === 'h' ? HEADING_SEL : (kind === 'l' ? 'a[href]' : LANDMARK_SEL);
      return qsa(sel).filter(function (n) {
        return isVisible(n) && !(RT.root && RT.root.contains(n));
      });
    }

    function jump(kind, delta) {
      var list = targets(kind);
      if (!list.length) { RT.announce(I18n.t('noResults')); return; }
      cursors[kind] = (cursors[kind] + delta + list.length) % list.length;
      var node = list[cursors[kind]];
      if (!node.hasAttribute('tabindex') && !node.matches(FOCUSABLE_SEL)) {
        node.setAttribute('tabindex', '-1');
        node.setAttribute('data-a11y-tmptab', '');
      }
      try { node.focus({ preventScroll: false }); } catch (e) {}
      node.scrollIntoView({ block: 'center', behavior: 'auto' });
      RT.announce((accessibleName(node) || node.tagName.toLowerCase()).slice(0, 80));
    }

    function onKey(e) {
      if (!active) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target;
      /* Never steal a keystroke from someone typing. This is why quick keys are
       * single letters in screen readers too: they are suppressed in forms. */
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (RT.root && RT.root.contains(t)) return;

      var key = e.key.toLowerCase();
      if (key !== 'h' && key !== 'l' && key !== 'd') return;
      e.preventDefault();
      jump(key, e.shiftKey ? -1 : 1);
    }

    function buildSkipLinks() {
      var wanted = [
        { sel: 'main, [role="main"]', key: 'skipToMain' },
        { sel: 'nav, [role="navigation"]', key: 'skipToNav' },
        { sel: '[role="search"], form[role="search"], input[type="search"]', key: 'skipToSearch' },
        { sel: 'footer, [role="contentinfo"]', key: 'skipToFooter' }
      ];
      var links = [];
      wanted.forEach(function (item) {
        var target = document.querySelector(item.sel);
        if (!target || (RT.root && RT.root.contains(target))) return;
        if (!target.id) target.id = uid('target');
        links.push(el('a', {
          'class': 'a11y-skip',
          href: '#' + target.id,
          text: I18n.t(item.key),
          onclick: function (e) {
            e.preventDefault();
            if (!target.hasAttribute('tabindex')) {
              target.setAttribute('tabindex', '-1');
              target.setAttribute('data-a11y-tmptab', '');
            }
            target.focus();
            target.scrollIntoView({ block: 'start' });
          }
        }));
      });
      if (!links.length) return null;
      return el('nav', { 'class': 'a11y-skipbar', 'aria-label': I18n.t('skipToMain') }, links);
    }

    return {
      enable: function () {
        if (active) return;
        active = true;
        document.addEventListener('keydown', onKey, true);
        /* The skip bar lives in the shadow root, which is the first child of
         * body — so it is genuinely first in the tab order, which is the entire
         * point of a skip link. */
        if (RT.shadow && !skipBar) {
          skipBar = buildSkipLinks();
          if (skipBar) RT.layer.parentNode.insertBefore(skipBar, RT.layer);
        }
      },
      disable: function () {
        if (!active) return;
        active = false;
        document.removeEventListener('keydown', onKey, true);
        if (skipBar && skipBar.parentNode) skipBar.parentNode.removeChild(skipBar);
        skipBar = null;
        qsa('[data-a11y-tmptab]').forEach(function (n) {
          n.removeAttribute('tabindex'); n.removeAttribute('data-a11y-tmptab');
        });
        cursors = { h: -1, l: -1, d: -1 };
      },
      /* Language changed: the skip link text has to change with it. */
      relabel: function () {
        if (!active) return;
        this.disable();
        this.enable();
      }
    };
  }());

  /* =========================================================================
   * 9. FEATURE REGISTRY
   *
   * One table. The panel renders itself from it, the state engine applies from
   * it, profiles compose from it. Adding a feature is one object plus its
   * string keys — there is no UI to edit.
   *
   *   type 'toggle' — on/off, rendered as role="switch"
   *   type 'step'   — ordered values, rendered as <input type="range">
   *   type 'select' — named options, rendered as an APG radio group
   *   type 'action' — a button that does something and holds no state
   * ====================================================================== */

  var FEATURES = [
    /* --- Text and reading -------------------------------------------------- */
    {
      id: 'fontSize', group: 'text', type: 'step', labelKey: 'fontSize',
      values: [1, 1.12, 1.25, 1.5, 1.75, 2], def: 1,
      format: function (v) { return I18n.t('percent', { n: Math.round(v * 100) }); },
      apply: function (v) { TextScaler.set(v); }
    },
    {
      id: 'lineSpacing', group: 'text', type: 'step', labelKey: 'lineSpacing',
      values: [null, 1.5, 1.8, 2.2], def: null,
      format: function (v) { return v == null ? I18n.t('defaultValue') : String(v); },
      attr: 'data-a11y-line', cssVar: '--a11y-line'
    },
    {
      id: 'letterSpacing', group: 'text', type: 'step', labelKey: 'letterSpacing',
      values: [null, '0.05em', '0.1em', '0.2em'], def: null,
      format: function (v) { return v == null ? I18n.t('defaultValue') : v; },
      attr: 'data-a11y-letter', cssVar: '--a11y-letter'
    },
    {
      id: 'wordSpacing', group: 'text', type: 'step', labelKey: 'wordSpacing',
      values: [null, '0.1em', '0.25em', '0.5em'], def: null,
      format: function (v) { return v == null ? I18n.t('defaultValue') : v; },
      attr: 'data-a11y-word', cssVar: '--a11y-word'
    },
    {
      id: 'textAlign', group: 'text', type: 'select', labelKey: 'textAlign', def: '',
      options: [
        { value: '', labelKey: 'alignDefault' },
        { value: 'left', labelKey: 'alignLeft' },
        { value: 'center', labelKey: 'alignCenter' },
        { value: 'right', labelKey: 'alignRight' }
      ],
      attr: 'data-a11y-align'
    },
    {
      id: 'clearFont', group: 'text', type: 'toggle', labelKey: 'clearFont',
      hintKey: 'clearFontHint', def: false,
      /* The two font features are mutually exclusive — you cannot render text
       * in two typefaces at once, and silently ignoring the second is worse
       * than visibly turning the first off. */
      exclusive: ['dyslexiaFont'],
      apply: function (v, engine) {
        setFontAttr(v ? 'clear' : (engine.get('dyslexiaFont') ? 'dyslexic' : null));
      }
    },
    {
      id: 'dyslexiaFont', group: 'text', type: 'toggle', labelKey: 'dyslexiaFont',
      hintKey: 'dyslexiaFontHint', def: false,
      exclusive: ['clearFont'],
      apply: function (v, engine) {
        setFontAttr(v ? 'dyslexic' : (engine.get('clearFont') ? 'clear' : null));
      }
    },

    /* --- Colour and vision ------------------------------------------------- */
    {
      id: 'contrast', group: 'vision', type: 'select', labelKey: 'contrast', def: '',
      options: [
        { value: '', labelKey: 'contrastNone' },
        { value: 'high', labelKey: 'contrastHigh' },
        { value: 'invert', labelKey: 'contrastInvert' },
        { value: 'saturate', labelKey: 'contrastSaturate' },
        { value: 'mono', labelKey: 'contrastMono' }
      ],
      attr: 'data-a11y-contrast',
      apply: function () { recomputeFilter(); }
    },
    {
      id: 'calmColors', group: 'vision', type: 'toggle', labelKey: 'calmColors',
      hintKey: 'calmColorsHint', def: false,
      apply: function () { recomputeFilter(); }
    },
    {
      id: 'colorBlind', group: 'vision', type: 'select', labelKey: 'colorBlind', def: '',
      options: [
        { value: '', labelKey: 'cbNone' },
        { value: 'protan', labelKey: 'cbProtan' },
        { value: 'deutan', labelKey: 'cbDeutan' },
        { value: 'tritan', labelKey: 'cbTritan' }
      ],
      apply: function () { recomputeFilter(); }
    },
    {
      id: 'magnifier', group: 'vision', type: 'toggle', labelKey: 'magnifier',
      hintKey: 'magnifierHint', def: false,
      /* Nothing to follow without a pointer. */
      unavailable: function () { return Env.get().coarsePointer || Env.get().noHover; },
      apply: function (v) { Overlay.magnifier(v); }
    },
    {
      id: 'bigCursor', group: 'vision', type: 'toggle', labelKey: 'bigCursor', def: false,
      unavailable: function () { return Env.get().coarsePointer; },
      attr: 'data-a11y-cursor'
    },

    /* --- Focus and navigation ---------------------------------------------- */
    {
      id: 'readingMask', group: 'focus', type: 'toggle', labelKey: 'readingMask',
      hintKey: 'readingMaskHint', def: false,
      unavailable: function () { return Env.get().coarsePointer; },
      apply: function (v) { Overlay.mask(v); }
    },
    {
      id: 'maskHeight', group: 'focus', type: 'step', labelKey: 'maskHeight',
      values: [80, 140, 220, 320], def: 140,
      format: function (v) { return v + 'px'; },
      /* Only meaningful while the mask is on; the panel greys it out otherwise. */
      dependsOn: 'readingMask',
      apply: function (v) { Overlay.maskHeight(v); }
    },
    {
      id: 'sectionFocus', group: 'focus', type: 'toggle', labelKey: 'sectionFocus',
      hintKey: 'sectionFocusHint', def: false,
      attr: 'data-a11y-section',
      apply: function (v) { Overlay.section(v); }
    },
    {
      id: 'highlightHeadings', group: 'focus', type: 'toggle', labelKey: 'highlightHeadings',
      def: false, attr: 'data-a11y-headings'
    },
    {
      id: 'highlightLinks', group: 'focus', type: 'toggle', labelKey: 'highlightLinks',
      def: false, attr: 'data-a11y-links'
    },
    {
      id: 'keyboardNav', group: 'focus', type: 'toggle', labelKey: 'keyboardNav',
      hintKey: 'keyboardNavHint', def: false, attr: 'data-a11y-keyboard',
      apply: function (v) { if (v) Keyboard.enable(); else Keyboard.disable(); }
    },
    {
      id: 'stopAnimations', group: 'focus', type: 'toggle', labelKey: 'stopAnimations',
      def: false, attr: 'data-a11y-nomotion',
      apply: function (v) { if (v) Media.freeze(); else Media.unfreeze(); }
    },
    {
      id: 'reduceDistraction', group: 'focus', type: 'toggle', labelKey: 'reduceDistraction',
      def: false, attr: 'data-a11y-nodistract'
    },
    {
      id: 'hideImages', group: 'focus', type: 'toggle', labelKey: 'hideImages',
      def: false, attr: 'data-a11y-noimages'
    },
    {
      id: 'hideMedia', group: 'focus', type: 'toggle', labelKey: 'hideMedia',
      def: false, attr: 'data-a11y-nomedia'
    },
    {
      id: 'muteMedia', group: 'focus', type: 'toggle', labelKey: 'muteMedia',
      def: false,
      apply: function (v) { Media.mute(v); }
    },

    /* --- Screen reader ----------------------------------------------------- */
    {
      id: 'srRepair', group: 'reader', type: 'toggle', labelKey: 'srRepair',
      hintKey: 'srRepairHint', def: false,
      apply: function (v) { if (v) SrHelper.enable(); else SrHelper.disable(); }
    },
    {
      id: 'readAloud', group: 'reader', type: 'toggle', labelKey: 'readAloud',
      hintKey: 'readAloudHint', def: false, transient: true,
      unavailable: function () { return !Speech.available; },
      apply: function (v) { if (v) Speech.readPage(); else Speech.stop(); }
    },
    {
      id: 'readSelection', group: 'reader', type: 'action', labelKey: 'readSelection',
      unavailable: function () { return !Speech.available; },
      run: function () { return Speech.readSelection(); }
    },
    {
      id: 'headingsList', group: 'focus', type: 'action', labelKey: 'headingsList'
      /* Handled by the panel — it opens the headings navigator. */
    }
  ];

  var FEATURE_BY_ID = {};
  FEATURES.forEach(function (f) { FEATURE_BY_ID[f.id] = f; });

  var GROUPS = [
    { id: 'text', labelKey: 'groupText' },
    { id: 'vision', labelKey: 'groupVision' },
    { id: 'focus', labelKey: 'groupFocus' },
    { id: 'reader', labelKey: 'groupReader' }
  ];

  /* Profiles are state patches, nothing more. Applying one is the same code
   * path as flipping each switch by hand, so nothing can drift out of sync. */
  var PROFILES = [
    {
      id: 'contrast', labelKey: 'profileContrast', icon: '◐',
      patch: { contrast: 'high', fontSize: 1.5, highlightLinks: true }
    },
    {
      id: 'dyslexia', labelKey: 'profileDyslexia', icon: 'Dx',
      patch: {
        dyslexiaFont: true, lineSpacing: 1.8, letterSpacing: '0.1em',
        wordSpacing: '0.25em', textAlign: 'left', readingMask: true
      }
    },
    {
      id: 'calm', labelKey: 'profileCalm', icon: '☾',
      patch: {
        calmColors: true, stopAnimations: true, reduceDistraction: true, muteMedia: true
      }
    },
    {
      id: 'lowVision', labelKey: 'profileLowVision', icon: '👁',
      patch: {
        fontSize: 1.75, bigCursor: true, highlightLinks: true,
        contrast: 'high', lineSpacing: 1.5
      }
    },
    {
      id: 'focus', labelKey: 'profileFocus', icon: '◎',
      patch: {
        readingMask: true, reduceDistraction: true, stopAnimations: true,
        hideImages: true, lineSpacing: 1.8
      }
    },
    {
      id: 'keyboard', labelKey: 'profileKeyboard', icon: '⌨',
      patch: { keyboardNav: true, highlightLinks: true, highlightHeadings: true }
    },
    {
      id: 'colorBlind', labelKey: 'profileColorBlind', icon: '🎨',
      patch: { colorBlind: 'deutan', highlightLinks: true }
    },
    {
      id: 'reader', labelKey: 'profileReader', icon: '🔊',
      patch: { srRepair: true, keyboardNav: true, highlightHeadings: true }
    }
  ];

  /* =========================================================================
   * STATE ENGINE
   * ====================================================================== */

  function setFontAttr(value) {
    var html = document.documentElement;
    if (value) html.setAttribute('data-a11y-font', value);
    else html.removeAttribute('data-a11y-font');
    /* A different typeface at the same px size reads at a different size, so a
     * scaled page has to be measured again against the new face. */
    TextScaler.remeasure();
  }

  /* Contrast, calm colours and colour-blind correction all resolve into one
   * `filter` declaration so they compose instead of overwriting each other. */
  function recomputeFilter() {
    if (!RT.state) return;
    var target;
    try {
      target = RT.cfg.colorFilterTarget === 'html'
        ? document.documentElement
        : document.querySelector(RT.cfg.colorFilterTarget) || document.documentElement;
    } catch (e) { target = document.documentElement; }

    /* Windows High Contrast already owns colour rendering. Layering our filters
     * on top of it produces something neither we nor the OS intended. */
    if (Env.get().forcedColors) {
      target.removeAttribute('data-a11y-filtered');
      target.style.removeProperty('--a11y-filter');
      return;
    }

    var parts = [];
    var contrast = RT.state.contrast;
    if (contrast && CONTRAST_FILTERS[contrast]) parts.push(CONTRAST_FILTERS[contrast]);
    if (RT.state.calmColors) parts.push('saturate(.55) contrast(.92) brightness(1.02)');
    if (RT.state.colorBlind && CB_MATRICES[RT.state.colorBlind]) {
      parts.push('url(#a11y-cb-' + RT.state.colorBlind + ')');
    }

    if (parts.length) {
      target.style.setProperty('--a11y-filter', parts.join(' '));
      target.setAttribute('data-a11y-filtered', '');
    } else {
      target.removeAttribute('data-a11y-filtered');
      target.style.removeProperty('--a11y-filter');
    }
  }

  var Engine = (function () {
    var state = {};
    var cfg = null;
    var listeners = [];

    function defaults() {
      var out = {};
      FEATURES.forEach(function (f) {
        if (f.type !== 'action') out[f.id] = f.def;
      });
      return out;
    }

    function persist() {
      if (!cfg) return;
      var slim = {};
      FEATURES.forEach(function (f) {
        /* Transient features (read aloud) must not resume on page load —
         * a page that starts talking by itself is alarming, not helpful. */
        if (f.type === 'action' || f.transient) return;
        if (state[f.id] !== f.def) slim[f.id] = state[f.id];
      });
      slim._lang = I18n.lang;
      try { Store.set(cfg.storageKey, JSON.stringify(slim)); } catch (e) {}
    }

    function restore() {
      if (!cfg) return null;
      var raw = Store.get(cfg.storageKey);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    }

    /* Writes the declarative half of a feature: the attribute that switches its
     * CSS rules on, and the custom property those rules read. */
    function reflect(feature, value) {
      var html = document.documentElement;
      var on = value !== null && value !== undefined && value !== false && value !== '';
      if (feature.attr) {
        if (on) html.setAttribute(feature.attr, feature.type === 'select' ? String(value) : '');
        else html.removeAttribute(feature.attr);
      }
      if (feature.cssVar) {
        if (on) html.style.setProperty(feature.cssVar, String(value));
        else html.style.removeProperty(feature.cssVar);
      }
    }

    var engine = {
      init: function (config) {
        cfg = config;
        state = defaults();
        var saved = restore();
        if (saved) {
          for (var k in saved) {
            if (k === '_lang') continue;
            if (Object.prototype.hasOwnProperty.call(state, k)) state[k] = saved[k];
          }
        }
        RT.state = state;
        return saved;
      },

      get: function (id) { return id ? state[id] : extend({}, state); },

      /* The single write path. Profiles, the panel, the public API and restore
       * all funnel through here, so a feature can never be half-applied. */
      set: function (id, value, opts) {
        opts = opts || {};
        var feature = FEATURE_BY_ID[id];
        if (!feature || feature.type === 'action') return false;

        if (feature.type === 'step' && feature.values.indexOf(value) === -1) {
          /* Accept an index as well as a value — the range input speaks indices. */
          if (typeof value === 'number' && feature.values[value] !== undefined) {
            value = feature.values[value];
          } else return false;
        }
        if (feature.type === 'toggle') value = !!value;

        var prev = state[id];
        if (prev === value && !opts.force) return false;
        state[id] = value;

        if (feature.exclusive && value) {
          feature.exclusive.forEach(function (other) {
            if (state[other]) { state[other] = false; reflect(FEATURE_BY_ID[other], false); }
          });
        }

        reflect(feature, value);
        if (feature.apply) {
          try { feature.apply(value, engine); } catch (e) { logError(id, e); }
        }

        if (!opts.silent) {
          persist();
          engine.emit(id, value);
        }
        return true;
      },

      /* Applies the whole state at once. Used on init and by profiles, where
       * announcing and persisting twenty times over would be absurd. */
      applyAll: function () {
        FEATURES.forEach(function (f) {
          if (f.type === 'action') return;
          if (f.transient) { state[f.id] = f.def; return; }
          var value = state[f.id];
          reflect(f, value);
          if (f.apply && value !== f.def) {
            try { f.apply(value, engine); } catch (e) { logError(f.id, e); }
          }
        });
        recomputeFilter();
      },

      patch: function (values, opts) {
        opts = opts || {};
        var changed = [];
        for (var id in values) {
          if (!Object.prototype.hasOwnProperty.call(values, id)) continue;
          if (engine.set(id, values[id], { silent: true })) changed.push(id);
        }
        persist();
        if (!opts.silent) engine.emit('*', changed);
        return changed;
      },

      reset: function () {
        /* Turn engines off explicitly rather than trusting each feature's own
         * apply() to handle the falsy case — a page must always come back. */
        TextScaler.reset();
        Overlay.reset();
        Media.reset();
        SrHelper.disable();
        Speech.stop();
        Keyboard.disable();

        var html = document.documentElement;
        FEATURES.forEach(function (f) {
          if (f.attr) html.removeAttribute(f.attr);
          if (f.cssVar) html.style.removeProperty(f.cssVar);
        });
        html.removeAttribute('data-a11y-font');
        state = defaults();
        RT.state = state;
        recomputeFilter();
        persist();
        engine.emit('*', ['reset']);
      },

      applyProfile: function (profileId) {
        var profile = null;
        for (var i = 0; i < PROFILES.length; i++) {
          if (PROFILES[i].id === profileId) { profile = PROFILES[i]; break; }
        }
        if (!profile) return false;
        engine.patch(profile.patch);
        return true;
      },

      subscribe: function (fn) { listeners.push(fn); },

      emit: function (id, value) {
        var snapshot = extend({}, state);
        for (var i = 0; i < listeners.length; i++) {
          try { listeners[i](id, value, snapshot); } catch (e) {}
        }
        if (cfg && typeof cfg.onChange === 'function') {
          try { cfg.onChange(snapshot, id); } catch (e) {}
        }
        try {
          document.dispatchEvent(new CustomEvent('a11y:change', {
            detail: { id: id, value: value, state: snapshot }
          }));
        } catch (e) { /* CustomEvent constructor missing on very old engines */ }
      },

      persist: persist
    };

    return engine;
  }());

  function logError(id, error) {
    /* Never let one broken feature take the whole widget down with it. */
    if (window.console && console.warn) {
      console.warn('[a11y] feature "' + id + '" failed:', error);
    }
  }

  /* =========================================================================
   * 10. PANEL — Shadow DOM UI
   *
   * On style isolation. Shadow DOM stops the host's SELECTORS from reaching
   * inside, but three things still get through, and each is answered here:
   *   1. Inherited properties cross the boundary  -> :host { all: initial }
   *   2. The host element itself is selectable    -> :host { ... !important }
   *   3. Ancestor filter/transform affect us      -> mount in the top layer
   *
   * Point 2 is stronger than it looks. The cascade reverses tree order for
   * important declarations: normal declarations from the OUTER tree beat inner
   * ones, but important declarations from the INNER tree beat outer ones — and
   * that beats specificity, since tree order is compared first.
   *
   * Verified on this project's demo page: with `body.hostile #a11y-root
   * { display:none !important }` active in the document, removing the shadow
   * sheet hides the widget (display: none, height 0); restoring a bare
   * `:host { display:block !important }` brings it back (height 674) even
   * though the document rule is more specific and our own document-level
   * #a11y-root rule stayed disabled throughout.
   *
   * So the shadow :host block is the real defence, the document-level #a11y-root
   * rule is the fallback for browsers with no Shadow DOM, and the attribute
   * observer below covers the non-CSS vectors (a script setting hidden/inert).
   * ====================================================================== */

  function buildPanelCss(cfg) {
    var zIndex = parseInt(cfg.zIndex, 10) || 2147483000;
    return [
      /* Cut inheritance at the boundary, then re-declare everything we rely on.
       * Without this, a host `body { letter-spacing: 3px }` — or our own letter
       * spacing feature — would silently reflow the panel's own text. */
      ':host{all:initial;}',
      ':host{',
      'position:fixed !important;inset:0 !important;display:block !important;',
      'pointer-events:none !important;z-index:' + zIndex + ' !important;',
      'font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif !important;',
      'font-size:16px !important;line-height:1.5 !important;font-weight:400 !important;',
      'letter-spacing:normal !important;word-spacing:normal !important;',
      'text-align:start !important;text-transform:none !important;',
      'color:var(--p-fg) !important;visibility:visible !important;opacity:1 !important;',
      'filter:none !important;transform:none !important;}',

      /* Light palette on bare :host so it is always defined; dark only overrides
       * the tokens. Every colour has a light definition — none is defined only
       * inside a media query. */
      ':host{',
      '--p-bg:#ffffff;--p-fg:#16181d;--p-muted:#5b6472;--p-line:#d8dde5;',
      '--p-raise:#f4f6fa;--p-accent:#0a58ff;--p-accent-fg:#ffffff;',
      '--p-on:#0f7a3d;--p-shadow:0 12px 40px rgba(10,20,40,.28);',
      '--p-focus:#0a58ff;--p-radius:12px;}',
      '@media (prefers-color-scheme:dark){:host{',
      '--p-bg:#15181e;--p-fg:#f2f4f8;--p-muted:#a3adbd;--p-line:#333a47;',
      '--p-raise:#1e232c;--p-accent:#5b93ff;--p-accent-fg:#0b1020;',
      '--p-on:#4ade80;--p-shadow:0 12px 40px rgba(0,0,0,.6);--p-focus:#8ab4ff;}}',

      /* The top-layer container is a popover, and the UA stylesheet gives every
       * popover a border, padding, a solid background and fit-content sizing.
       * Left alone that paints a visible box over the whole page. */
      '.a11y-top{position:fixed;inset:0;inline-size:auto;block-size:auto;',
      'max-inline-size:none;max-block-size:none;margin:0;padding:0;border:0;',
      'background:transparent;color:inherit;overflow:visible;pointer-events:none;}',
      '.a11y-top:popover-open{display:block;}',
      '.a11y-top::backdrop{background:transparent;}',

      /* Anything interactive has to switch pointer events back on, since the
       * host element is transparent to the pointer so the page stays usable. */
      '.a11y-fab,.a11y-dialog,.a11y-skipbar,.a11y-lens,.a11y-suggest{pointer-events:auto;}',
      '*,*::before,*::after{box-sizing:border-box;}',
      'button,input,select{font:inherit;color:inherit;margin:0;}',

      /* --- Floating button ------------------------------------------------- */
      '.a11y-fab{position:fixed;inline-size:56px;block-size:56px;border-radius:50%;',
      'border:2px solid var(--p-accent-fg);background:var(--p-accent);color:var(--p-accent-fg);',
      'box-shadow:var(--p-shadow);cursor:pointer;display:flex;align-items:center;',
      'justify-content:center;padding:0;transition:transform .15s ease;}',
      '.a11y-fab:hover{transform:scale(1.06);}',
      /* The panel sits over the button; leaving it visible underneath just
       * looks like a rendering fault. */
      '.a11y-fab.is-open{opacity:0;pointer-events:none;}',
      '.a11y-fab:focus-visible{outline:4px solid var(--p-focus);outline-offset:3px;}',
      '.a11y-fab svg{inline-size:30px;block-size:30px;display:block;}',
      /* Corners are logical: "right" means the inline-end side, so the button
       * moves to the left in an RTL panel without a second rule. */
      '.a11y-fab[data-pos$="-right"]{inset-inline-end:20px;}',
      '.a11y-fab[data-pos$="-left"]{inset-inline-start:20px;}',
      '.a11y-fab[data-pos^="bottom-"]{inset-block-end:20px;}',
      '.a11y-fab[data-pos^="top-"]{inset-block-start:20px;}',
      '@media (max-width:480px){.a11y-fab{inline-size:48px;block-size:48px;}}',

      /* --- Dialog ----------------------------------------------------------- */
      /* inset-inline-START must be explicitly auto. The UA stylesheet for
       * <dialog> sets both inline insets to 0, and with both set plus a fixed
       * width the box resolves to the start edge — so setting only the end
       * inset silently parks the panel on the wrong side. */
      '.a11y-dialog{position:fixed;inset-block:0;inset-inline-end:0;inset-inline-start:auto;',
      'margin:0;padding:0;',
      'inline-size:min(380px,100vw);max-inline-size:100vw;block-size:100%;max-block-size:100%;',
      'border:0;border-inline-start:1px solid var(--p-line);background:var(--p-bg);',
      'color:var(--p-fg);box-shadow:var(--p-shadow);overflow:hidden;',
      'flex-direction:column;}',
      '.a11y-dialog[open]{display:flex;}',
      '.a11y-dialog::backdrop{background:rgba(8,12,20,.45);}',
      '@media (max-width:480px){.a11y-dialog{inline-size:100vw;}}',

      '.a11y-head{display:flex;align-items:center;gap:8px;padding:14px 16px;',
      'border-block-end:1px solid var(--p-line);background:var(--p-raise);flex:0 0 auto;}',
      '.a11y-title{font-size:17px;font-weight:700;margin:0;flex:1;}',
      '.a11y-iconbtn{inline-size:36px;block-size:36px;border-radius:8px;border:1px solid var(--p-line);',
      'background:var(--p-bg);cursor:pointer;display:flex;align-items:center;justify-content:center;',
      'font-size:18px;line-height:1;}',
      '.a11y-iconbtn:hover{background:var(--p-raise);}',
      '.a11y-iconbtn:focus-visible{outline:3px solid var(--p-focus);outline-offset:2px;}',

      '.a11y-body{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;padding:12px 16px 20px;}',
      '.a11y-foot{flex:0 0 auto;display:flex;gap:8px;padding:12px 16px;',
      'border-block-start:1px solid var(--p-line);background:var(--p-raise);flex-wrap:wrap;}',

      '.a11y-search{inline-size:100%;padding:9px 12px;border-radius:9px;',
      'border:1px solid var(--p-line);background:var(--p-bg);color:var(--p-fg);}',
      '.a11y-search:focus-visible{outline:3px solid var(--p-focus);outline-offset:1px;}',

      '.a11y-group{margin-block-start:18px;}',
      '.a11y-group > h3{font-size:12px;font-weight:700;text-transform:uppercase;',
      'letter-spacing:.08em;color:var(--p-muted);margin:0 0 8px;}',

      /* --- Profiles --------------------------------------------------------- */
      '.a11y-profiles{display:grid;grid-template-columns:1fr 1fr;gap:8px;}',
      '.a11y-profile{display:flex;align-items:center;gap:8px;padding:10px;border-radius:10px;',
      'border:1px solid var(--p-line);background:var(--p-bg);cursor:pointer;text-align:start;',
      'font-size:13px;line-height:1.25;min-block-size:56px;}',
      '.a11y-profile:hover{background:var(--p-raise);}',
      '.a11y-profile:focus-visible{outline:3px solid var(--p-focus);outline-offset:2px;}',
      '.a11y-profile[aria-pressed="true"]{border-color:var(--p-accent);',
      'background:color-mix(in srgb,var(--p-accent) 12%,var(--p-bg));box-shadow:inset 0 0 0 1px var(--p-accent);}',
      '.a11y-profile .ico{font-size:18px;flex:0 0 auto;}',

      /* --- Rows and switches ------------------------------------------------ */
      '.a11y-row{display:flex;align-items:flex-start;gap:10px;padding:10px 0;',
      'border-block-end:1px solid var(--p-line);}',
      '.a11y-row:last-child{border-block-end:0;}',
      '.a11y-row[hidden]{display:none !important;}',
      '.a11y-row.is-disabled{opacity:.45;}',
      '.a11y-rowmain{flex:1 1 auto;min-inline-size:0;}',
      '.a11y-label{font-size:14px;font-weight:600;}',
      '.a11y-hint{font-size:12px;color:var(--p-muted);margin-block-start:2px;}',

      '.a11y-switch{flex:0 0 auto;inline-size:52px;block-size:30px;border-radius:15px;',
      'border:2px solid var(--p-line);background:var(--p-raise);position:relative;',
      'cursor:pointer;padding:0;transition:background .15s ease,border-color .15s ease;}',
      '.a11y-switch::after{content:"";position:absolute;inset-block-start:3px;inset-inline-start:3px;',
      'inline-size:20px;block-size:20px;border-radius:50%;background:var(--p-muted);',
      'transition:transform .15s ease,background .15s ease;}',
      '.a11y-switch[aria-checked="true"]{background:var(--p-on);border-color:var(--p-on);}',
      '.a11y-switch[aria-checked="true"]::after{background:#fff;transform:translateX(22px);}',
      /* The transform direction has to flip with the panel, or the knob slides
       * the wrong way in Arabic. */
      ':host-context([dir="rtl"]) .a11y-switch[aria-checked="true"]::after,',
      '[dir="rtl"] .a11y-switch[aria-checked="true"]::after{transform:translateX(-22px);}',
      '.a11y-switch:focus-visible{outline:3px solid var(--p-focus);outline-offset:3px;}',
      /* Forced-colors mode strips our backgrounds, so state has to survive in
       * a property the OS keeps: the border. */
      '@media (forced-colors:active){',
      '.a11y-switch{border:2px solid ButtonText;}',
      '.a11y-switch[aria-checked="true"]{background:Highlight;}',
      '.a11y-switch::after{background:ButtonText;}}',

      /* --- Steppers --------------------------------------------------------- */
      '.a11y-steprow{display:flex;align-items:center;gap:8px;margin-block-start:6px;}',
      '.a11y-range{flex:1 1 auto;inline-size:100%;accent-color:var(--p-accent);block-size:24px;}',
      '.a11y-range:focus-visible{outline:3px solid var(--p-focus);outline-offset:4px;}',
      '.a11y-value{flex:0 0 auto;min-inline-size:64px;text-align:end;font-size:13px;',
      'font-weight:600;font-variant-numeric:tabular-nums;}',

      /* --- Radio groups (APG roving tabindex) -------------------------------- */
      '.a11y-radios{display:flex;flex-wrap:wrap;gap:6px;margin-block-start:6px;}',
      '.a11y-radio{padding:7px 11px;border-radius:8px;border:1px solid var(--p-line);',
      'background:var(--p-bg);cursor:pointer;font-size:13px;}',
      '.a11y-radio:hover{background:var(--p-raise);}',
      '.a11y-radio[aria-checked="true"]{background:var(--p-accent);color:var(--p-accent-fg);',
      'border-color:var(--p-accent);font-weight:600;}',
      '.a11y-radio:focus-visible{outline:3px solid var(--p-focus);outline-offset:2px;}',
      '@media (forced-colors:active){.a11y-radio[aria-checked="true"]{',
      'background:Highlight;color:HighlightText;forced-color-adjust:none;}}',

      /* --- Buttons ---------------------------------------------------------- */
      '.a11y-btn{padding:9px 14px;border-radius:9px;border:1px solid var(--p-line);',
      'background:var(--p-bg);cursor:pointer;font-size:13px;font-weight:600;}',
      '.a11y-btn:hover{background:var(--p-raise);}',
      '.a11y-btn:focus-visible{outline:3px solid var(--p-focus);outline-offset:2px;}',
      '.a11y-btn.is-primary{background:var(--p-accent);color:var(--p-accent-fg);border-color:var(--p-accent);}',
      '.a11y-btn.is-wide{flex:1 1 100%;}',

      /* --- Headings navigator ------------------------------------------------ */
      '.a11y-screen[hidden]{display:none !important;}',
      '.a11y-headinglist{list-style:none;margin:0;padding:0;}',
      '.a11y-headinglist button{display:block;inline-size:100%;text-align:start;padding:9px 10px;',
      'border:0;border-block-end:1px solid var(--p-line);background:none;cursor:pointer;font-size:13px;}',
      '.a11y-headinglist button:hover{background:var(--p-raise);}',
      '.a11y-headinglist button:focus-visible{outline:3px solid var(--p-focus);outline-offset:-3px;}',
      '.a11y-headinglist .lvl{display:inline-block;min-inline-size:26px;font:700 11px/1.6 monospace;',
      'color:var(--p-accent);}',

      /* --- OS preference suggestion ------------------------------------------ */
      '.a11y-suggest{position:fixed;inset-block-end:88px;inset-inline-end:20px;',
      'max-inline-size:300px;padding:14px;border-radius:var(--p-radius);background:var(--p-bg);',
      'color:var(--p-fg);border:1px solid var(--p-line);box-shadow:var(--p-shadow);',
      'font-size:13px;display:flex;flex-direction:column;gap:8px;}',
      '.a11y-suggest strong{font-size:14px;}',
      '.a11y-suggest .row{display:flex;gap:8px;}',

      /* --- Overlays: mask, magnifier, spotlight -------------------------------
       * One primitive for all three: an element with a box-shadow spreading far
       * past the viewport, so everything outside the element is dimmed. */
      '.a11y-mask{position:fixed;inset-inline:0;block-size:140px;display:none;',
      'box-shadow:0 0 0 100vmax rgba(0,0,0,.72);pointer-events:none;',
      'border-block:2px solid rgba(255,255,255,.55);}',
      '.a11y-mask.is-on{display:block;}',
      '.a11y-spot{position:fixed;display:none;border-radius:6px;pointer-events:none;',
      'box-shadow:0 0 0 100vmax rgba(0,0,0,.66);border:3px solid var(--p-accent);}',
      '.a11y-spot.is-on{display:block;}',
      '.a11y-lens{position:fixed;inset-inline:0;inset-block-start:0;display:none;',
      'background:#0b1020;color:#fff;padding:14px 20px;font-size:30px;line-height:1.35;',
      'font-weight:600;box-shadow:0 6px 24px rgba(0,0,0,.5);max-block-size:34vh;',
      'overflow:hidden;border-block-end:3px solid var(--p-accent);}',
      '.a11y-lens.is-on{display:block;}',
      '.a11y-lens.is-bottom{inset-block-start:auto;inset-block-end:0;',
      'border-block-end:0;border-block-start:3px solid var(--p-accent);}',

      /* --- Skip links --------------------------------------------------------
       * Visible on focus only. Positioned off-screen rather than display:none,
       * because a display:none link is not focusable at all. */
      '.a11y-skipbar{position:fixed;inset-block-start:0;inset-inline-start:0;z-index:2;}',
      '.a11y-skip{position:absolute;inset-block-start:-200px;inset-inline-start:0;',
      'padding:12px 18px;background:var(--p-accent);color:var(--p-accent-fg);',
      'font-weight:700;text-decoration:none;border-radius:0 0 8px 0;white-space:nowrap;}',
      '.a11y-skip:focus{inset-block-start:0;outline:3px solid var(--p-fg);outline-offset:-6px;}',

      /* Visually hidden but available to assistive technology. */
      '.a11y-sr{position:absolute !important;inline-size:1px;block-size:1px;',
      'padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);',
      'white-space:nowrap;border:0;}',

      '@media (prefers-reduced-motion:reduce){',
      '.a11y-fab,.a11y-switch,.a11y-switch::after{transition:none !important;}}'
    ].join('');
  }

  var Panel = (function () {
    var cfg, root, shadow, layer, topLayer, fab, dialog, body, liveRegion;
    var searchInput, mainScreen, headingScreen;
    var rows = {};            /* featureId -> row element */
    var controls = {};        /* featureId -> control element */
    var profileButtons = {};
    var lastFocused = null;
    var isOpen = false;
    var guardObserver = null;
    var guarding = false;

    /* ---------------------------------------------------------------------
     * Root creation and isolation hardening
     * ------------------------------------------------------------------ */

    function createRoot() {
      root = document.createElement('div');
      root.id = cfg.rootId;
      root.setAttribute('data-a11y-ignore', '');
      /* Deliberately first in the document so the skip links inside it are
       * genuinely first in the tab order — the whole point of a skip link. */
      if (document.body.firstChild) document.body.insertBefore(root, document.body.firstChild);
      else document.body.appendChild(root);

      shadow = root.attachShadow ? root.attachShadow({ mode: 'open' }) : null;
      if (!shadow) {
        /* No Shadow DOM: run in the light DOM with prefixed classes. Isolation
         * is weaker, but a visitor who needs this widget gets it either way. */
        shadow = root;
      }

      var style = document.createElement('style');
      style.textContent = buildPanelCss(cfg);
      shadow.appendChild(style);

      /* A host stylesheet can target our root element by id — it is an ordinary
       * document node. Our !important declarations handle CSS; this handles the
       * other vector, a script or inline style hiding us. */
      if (window.MutationObserver) {
        guardObserver = new MutationObserver(function (records) {
          if (guarding) return;
          guarding = true;
          for (var i = 0; i < records.length; i++) {
            var name = records[i].attributeName;
            if (name === 'style' && root.getAttribute('style')) root.removeAttribute('style');
            else if (name === 'hidden' && root.hasAttribute('hidden')) root.removeAttribute('hidden');
            else if (name === 'class' && root.className) root.className = '';
            else if (name === 'inert' && root.hasAttribute('inert')) root.removeAttribute('inert');
          }
          guarding = false;
        });
        guardObserver.observe(root, {
          attributes: true, attributeFilter: ['style', 'class', 'hidden', 'inert']
        });
      }
      return root;
    }

    /* The top layer escapes ancestor filter, transform and opacity — which
     * matters because our own colour-blind filter sits on <html>, and without
     * this the panel would be inverted or greyscaled along with the page. */
    function mountTopLayer(node) {
      if (node.showPopover && HTMLElement.prototype.hasOwnProperty('popover')) {
        try {
          node.setAttribute('popover', 'manual');
          shadow.appendChild(node);
          node.showPopover();
          return true;
        } catch (e) { node.removeAttribute('popover'); }
      }
      shadow.appendChild(node);
      return false;
    }

    /* ---------------------------------------------------------------------
     * Control builders — one per feature type
     * ------------------------------------------------------------------ */

    function buildToggle(feature) {
      var labelId = uid('lbl');
      var hint = feature.hintKey ? I18n.t(feature.hintKey) : '';
      var hintId = hint ? uid('hint') : null;

      var control = el('button', {
        type: 'button', role: 'switch', 'class': 'a11y-switch',
        'aria-checked': Engine.get(feature.id) ? 'true' : 'false',
        'aria-labelledby': labelId,
        'aria-describedby': hintId,
        onclick: function () {
          var next = control.getAttribute('aria-checked') !== 'true';
          Engine.set(feature.id, next);
        }
      });

      var main = el('div', { 'class': 'a11y-rowmain' }, [
        el('div', { 'class': 'a11y-label', id: labelId, text: I18n.t(feature.labelKey) }),
        hint ? el('div', { 'class': 'a11y-hint', id: hintId, text: hint }) : null
      ]);

      controls[feature.id] = control;
      return el('div', { 'class': 'a11y-row', 'data-feature': feature.id }, [main, control]);
    }

    function buildStep(feature) {
      var labelId = uid('lbl');
      var index = Math.max(0, feature.values.indexOf(Engine.get(feature.id)));
      var output = el('span', { 'class': 'a11y-value', 'aria-hidden': 'true' });

      var range = el('input', {
        type: 'range', 'class': 'a11y-range',
        min: 0, max: feature.values.length - 1, step: 1, value: index,
        'aria-labelledby': labelId,
        oninput: function () {
          var v = feature.values[parseInt(range.value, 10)];
          output.textContent = feature.format ? feature.format(v) : String(v);
          range.setAttribute('aria-valuetext', output.textContent);
        },
        onchange: function () {
          Engine.set(feature.id, feature.values[parseInt(range.value, 10)]);
        }
      });

      output.textContent = feature.format
        ? feature.format(feature.values[index]) : String(feature.values[index]);
      range.setAttribute('aria-valuetext', output.textContent);

      controls[feature.id] = range;
      controls[feature.id + ':out'] = output;

      var hint = feature.hintKey ? I18n.t(feature.hintKey) : '';
      return el('div', { 'class': 'a11y-row', 'data-feature': feature.id }, [
        el('div', { 'class': 'a11y-rowmain' }, [
          el('div', { 'class': 'a11y-label', id: labelId, text: I18n.t(feature.labelKey) }),
          hint ? el('div', { 'class': 'a11y-hint', text: hint }) : null,
          el('div', { 'class': 'a11y-steprow' }, [range, output])
        ])
      ]);
    }

    /* APG radio group: exactly one radio in the tab sequence, arrows move and
     * select, Home/End jump to the ends. */
    function buildSelect(feature) {
      var labelId = uid('lbl');
      var current = Engine.get(feature.id);
      var radios = [];

      function select(index, focus) {
        var option = feature.options[index];
        radios.forEach(function (radio, i) {
          var on = i === index;
          radio.setAttribute('aria-checked', on ? 'true' : 'false');
          radio.setAttribute('tabindex', on ? '0' : '-1');
        });
        if (focus) radios[index].focus();
        Engine.set(feature.id, option.value);
      }

      function onKey(e) {
        var index = radios.indexOf(e.target);
        if (index < 0) return;
        var next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (index + 1) % radios.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (index - 1 + radios.length) % radios.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = radios.length - 1;
        else if (e.key === ' ' || e.key === 'Enter') next = index;
        if (next === null) return;
        e.preventDefault();
        select(next, true);
      }

      feature.options.forEach(function (option, i) {
        var checked = String(option.value) === String(current);
        var radio = el('button', {
          type: 'button', role: 'radio', 'class': 'a11y-radio',
          'aria-checked': checked ? 'true' : 'false',
          tabindex: checked ? '0' : '-1',
          text: I18n.t(option.labelKey),
          onclick: function () { select(i, false); },
          onkeydown: onKey
        });
        radios.push(radio);
      });
      /* Nothing matched (a stale saved value): put the first radio in the tab
       * sequence anyway, or the group becomes unreachable by keyboard. */
      if (!radios.some(function (r) { return r.getAttribute('tabindex') === '0'; })) {
        radios[0].setAttribute('tabindex', '0');
      }

      controls[feature.id] = { radios: radios, options: feature.options };

      return el('div', { 'class': 'a11y-row', 'data-feature': feature.id }, [
        el('div', { 'class': 'a11y-rowmain' }, [
          el('div', { 'class': 'a11y-label', id: labelId, text: I18n.t(feature.labelKey) }),
          el('div', {
            'class': 'a11y-radios', role: 'radiogroup', 'aria-labelledby': labelId
          }, radios)
        ])
      ]);
    }

    function buildAction(feature) {
      var button = el('button', {
        type: 'button', 'class': 'a11y-btn is-wide',
        text: I18n.t(feature.labelKey),
        onclick: function () {
          if (feature.id === 'headingsList') { showHeadings(); return; }
          if (feature.run) {
            var ok = feature.run();
            if (ok === false) announce(I18n.t('noResults'));
          }
        }
      });
      controls[feature.id] = button;
      return el('div', { 'class': 'a11y-row', 'data-feature': feature.id }, [button]);
    }

    function buildFeatureRow(feature) {
      if (feature.type === 'toggle') return buildToggle(feature);
      if (feature.type === 'step') return buildStep(feature);
      if (feature.type === 'select') return buildSelect(feature);
      if (feature.type === 'action') return buildAction(feature);
      return null;
    }

    /* ---------------------------------------------------------------------
     * Panel assembly
     * ------------------------------------------------------------------ */

    function enabledFeatures() {
      return FEATURES.filter(function (f) {
        if (cfg.features && cfg.features.indexOf(f.id) === -1) return false;
        if (cfg.exclude && cfg.exclude.indexOf(f.id) !== -1) return false;
        if (f.unavailable && f.unavailable()) return false;
        return true;
      });
    }

    function buildProfiles() {
      var buttons = PROFILES.map(function (profile) {
        var button = el('button', {
          type: 'button', 'class': 'a11y-profile', 'aria-pressed': 'false',
          onclick: function () {
            var already = button.getAttribute('aria-pressed') === 'true';
            if (already) Engine.reset();
            else Engine.applyProfile(profile.id);
            announce(I18n.t(already ? 'announceOff' : 'announceOn',
              { feature: I18n.t(profile.labelKey) }));
          }
        }, [
          el('span', { 'class': 'ico', 'aria-hidden': 'true', text: profile.icon }),
          el('span', { text: I18n.t(profile.labelKey) })
        ]);
        profileButtons[profile.id] = button;
        return button;
      });
      return el('div', { 'class': 'a11y-group' }, [
        el('h3', { text: I18n.t('groupProfiles') }),
        el('div', { 'class': 'a11y-profiles' }, buttons)
      ]);
    }

    function buildBody() {
      var available = enabledFeatures();
      var children = [buildProfiles()];

      GROUPS.forEach(function (group) {
        var groupFeatures = available.filter(function (f) { return f.group === group.id; });
        if (!groupFeatures.length) return;
        var groupRows = groupFeatures.map(function (feature) {
          var row = buildFeatureRow(feature);
          if (row) rows[feature.id] = row;
          return row;
        });
        children.push(el('div', { 'class': 'a11y-group' }, [
          el('h3', { text: I18n.t(group.labelKey) })
        ].concat(groupRows)));
      });

      children.push(el('p', {
        'class': 'a11y-hint', style: 'margin-block-start:20px',
        text: I18n.t('shortcutHint', { keys: shortcutLabel() })
      }));
      return children;
    }

    function shortcutLabel() {
      return String(cfg.shortcut || '').split('+').map(function (part) {
        part = part.trim().toLowerCase();
        if (part === 'alt') return Env.get().modifierLabel;
        if (part === 'shift') return 'Shift';
        if (part === 'ctrl') return 'Ctrl';
        if (part === 'meta') return Env.get().os === 'macos' ? '⌘' : 'Win';
        return part.toUpperCase();
      }).join(' + ');
    }

    function buildLanguageSwitcher() {
      var langs = I18n.available();
      if (langs.length < 2) return null;
      var select = el('select', {
        'class': 'a11y-btn', 'aria-label': I18n.t('language'),
        onchange: function () { setLanguage(select.value); }
      }, langs.map(function (lang) {
        return el('option', {
          value: lang.code, text: lang.name,
          selected: lang.code === I18n.lang ? true : null
        });
      }));
      return select;
    }

    function buildDialog() {
      var titleId = uid('title');

      searchInput = el('input', {
        type: 'search', 'class': 'a11y-search',
        placeholder: I18n.t('searchPlaceholder'),
        'aria-label': I18n.t('searchLabel'),
        oninput: function () { filter(searchInput.value); }
      });

      mainScreen = el('div', { 'class': 'a11y-screen' },
        [el('div', { style: 'margin-block-end:4px' }, [searchInput])].concat(buildBody()));

      headingScreen = el('div', { 'class': 'a11y-screen', hidden: true });

      body = el('div', { 'class': 'a11y-body' }, [mainScreen, headingScreen]);

      var head = el('div', { 'class': 'a11y-head' }, [
        el('h2', { 'class': 'a11y-title', id: titleId, text: I18n.t('panelTitle') }),
        el('button', {
          type: 'button', 'class': 'a11y-iconbtn',
          'aria-label': I18n.t('closeLabel'), text: '✕',
          onclick: function () { close(); }
        })
      ]);

      var foot = el('div', { 'class': 'a11y-foot' }, [
        el('button', {
          type: 'button', 'class': 'a11y-btn is-primary',
          text: I18n.t('resetAll'),
          onclick: function () {
            Engine.reset();
            announce(I18n.t('announceReset'));
          }
        }),
        el('button', {
          type: 'button', 'class': 'a11y-btn',
          text: I18n.t('hideWidget'), title: I18n.t('hideWidgetHint'),
          onclick: function () { hideForSession(); }
        }),
        buildLanguageSwitcher(),
        cfg.statementUrl ? el('a', {
          'class': 'a11y-btn', href: cfg.statementUrl, target: '_blank',
          rel: 'noopener', text: I18n.t('statement')
        }) : null
      ]);

      /* Native <dialog> gives the top layer (escaping our own colour filters),
       * a real backdrop, inertness for the rest of the page, and Escape — all
       * of it browser-implemented and therefore correct. The manual focus trap
       * below is only for browsers without showModal. */
      dialog = el('dialog', {
        'class': 'a11y-dialog', role: 'dialog',
        'aria-modal': 'true', 'aria-labelledby': titleId
      }, [head, body, foot]);

      dialog.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
      dialog.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
      });

      return dialog;
    }

    function buildFab() {
      return el('button', {
        type: 'button', 'class': 'a11y-fab', 'data-pos': cfg.position,
        'aria-label': I18n.t('openLabel'), 'aria-expanded': 'false',
        'aria-haspopup': 'dialog',
        onclick: function () { toggle(); }
      }, [(function () {
        var svgNS = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        var path = document.createElementNS(svgNS, 'path');
        /* The international symbol of access. */
        path.setAttribute('d', 'M12 2.2a2.1 2.1 0 110 4.2 2.1 2.1 0 010-4.2zM21 7.3l-6 1.1v3.5l2.6 8.1-1.9.6L13.4 14h-2.8l-2.3 6.6-1.9-.6L9 11.9V8.4L3 7.3l.3-1.9 6.2 1.1h5l6.2-1.1z');
        path.setAttribute('fill', 'currentColor');
        svg.appendChild(path);
        return svg;
      }())]);
    }

    /* ---------------------------------------------------------------------
     * Headings navigator
     * ------------------------------------------------------------------ */

    function showHeadings() {
      var found = qsa(HEADING_SEL).filter(function (n) {
        return isVisible(n) && !(root && root.contains(n)) && (n.textContent || '').trim();
      });

      headingScreen.innerHTML = '';
      headingScreen.appendChild(el('div', { 'class': 'a11y-head', style: 'padding-inline:0' }, [
        el('button', {
          type: 'button', 'class': 'a11y-iconbtn',
          'aria-label': I18n.t('close'), text: I18n.dir === 'rtl' ? '→' : '←',
          onclick: function () { showScreen('main'); }
        }),
        el('h3', { 'class': 'a11y-title', text: I18n.t('headingsDialogTitle') })
      ]));

      if (!found.length) {
        headingScreen.appendChild(el('p', { 'class': 'a11y-hint', text: I18n.t('noHeadings') }));
      } else {
        headingScreen.appendChild(el('ul', { 'class': 'a11y-headinglist' }, found.map(function (h) {
          var level = h.getAttribute('aria-level') ||
            (h.tagName.match(/^H([1-6])$/) ? h.tagName.charAt(1) : '2');
          var text = (h.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 90);
          return el('li', {}, [el('button', {
            type: 'button',
            style: 'padding-inline-start:' + (6 + (parseInt(level, 10) - 1) * 12) + 'px',
            onclick: function () {
              close();
              if (!h.hasAttribute('tabindex')) {
                h.setAttribute('tabindex', '-1');
                h.setAttribute('data-a11y-tmptab', '');
              }
              h.scrollIntoView({ block: 'center' });
              try { h.focus({ preventScroll: true }); } catch (e) {}
            }
          }, [
            el('span', { 'class': 'lvl', 'aria-hidden': 'true', text: 'H' + level }),
            el('span', { text: text })
          ])]);
        })));
      }
      showScreen('headings');
    }

    function showScreen(name) {
      var toHeadings = name === 'headings';
      mainScreen.hidden = toHeadings;
      headingScreen.hidden = !toHeadings;
      var target = (toHeadings ? headingScreen : mainScreen).querySelector('button, input');
      if (target) try { target.focus(); } catch (e) {}
    }

    /* ---------------------------------------------------------------------
     * Search filter
     * ------------------------------------------------------------------ */

    function filter(query) {
      var q = String(query || '').trim().toLowerCase();
      var anyVisible = false;
      Object.keys(rows).forEach(function (id) {
        var feature = FEATURE_BY_ID[id];
        var haystack = (I18n.t(feature.labelKey) + ' ' +
          (feature.hintKey ? I18n.t(feature.hintKey) : '') + ' ' + id).toLowerCase();
        var match = !q || haystack.indexOf(q) !== -1;
        rows[id].hidden = !match;
        if (match) anyVisible = true;
      });
      /* Group headings and profiles are noise once a search is running. */
      qsa('.a11y-group', mainScreen).forEach(function (group) {
        if (!q) { group.hidden = false; return; }
        var visibleRows = qsa('.a11y-row:not([hidden])', group);
        group.hidden = !visibleRows.length;
      });
      var empty = mainScreen.querySelector('.a11y-empty');
      if (!anyVisible && q) {
        if (!empty) {
          empty = el('p', { 'class': 'a11y-hint a11y-empty', text: I18n.t('noResults') });
          mainScreen.appendChild(empty);
        }
        empty.hidden = false;
      } else if (empty) empty.hidden = true;
    }

    /* ---------------------------------------------------------------------
     * Open / close — APG dialog behaviour
     * ------------------------------------------------------------------ */

    function trapFocus(e) {
      /* Only attached when showModal is unavailable — a real modal dialog makes
       * everything outside it inert and the browser traps focus for us. */
      if (!isOpen || e.key !== 'Tab') return;
      var focusable = qsa('button, input, select, a[href], [tabindex]:not([tabindex="-1"])', dialog)
        .filter(function (n) { return !n.disabled && !n.hidden && isVisible(n); });
      if (!focusable.length) return;
      var first = focusable[0], last = focusable[focusable.length - 1];
      var active = shadow.activeElement || document.activeElement;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }

    function open() {
      if (isOpen) return;
      lastFocused = document.activeElement;
      isOpen = true;
      fab.setAttribute('aria-expanded', 'true');
      fab.classList.add('is-open');
      showScreen('main');
      if (dialog.showModal) {
        try { dialog.showModal(); }
        catch (e) { dialog.setAttribute('open', ''); }
      } else {
        dialog.setAttribute('open', '');
        document.addEventListener('keydown', trapFocus, true);
      }
      syncAll();
      window.setTimeout(function () {
        try { searchInput.focus(); } catch (e) {}
      }, 30);
      dispatch('a11y:open');
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      fab.setAttribute('aria-expanded', 'false');
      fab.classList.remove('is-open');
      document.removeEventListener('keydown', trapFocus, true);
      /* Move focus BEFORE hiding the container. Hiding an element that contains
       * the focused node drops focus to <body>, which strands a screen reader
       * user at the top of the page — the APG is explicit about this order. */
      var restore = lastFocused && lastFocused.isConnected ? lastFocused : fab;
      try { restore.focus(); } catch (e) { try { fab.focus(); } catch (e2) {} }
      if (dialog.close) { try { dialog.close(); } catch (e) { dialog.removeAttribute('open'); } }
      else dialog.removeAttribute('open');
      dispatch('a11y:close');
    }

    function toggle() { if (isOpen) close(); else open(); }

    /* "Hide for this visit" has to mean this visit. Store is localStorage-backed
     * and would hide the widget permanently — which for someone who needs it and
     * dismissed it by accident would be a genuinely bad outcome. */
    function sessionFlag(value) {
      var key = cfg.storageKey + ':hidden';
      try {
        if (!window.sessionStorage) return false;
        if (value === undefined) return !!window.sessionStorage.getItem(key);
        window.sessionStorage.setItem(key, '1');
      } catch (e) {}
      return false;
    }

    function hideForSession() {
      close();
      topLayer.style.display = 'none';
      sessionFlag(true);
    }

    function dispatch(name) {
      try { document.dispatchEvent(new CustomEvent(name, { detail: { state: Engine.get() } })); }
      catch (e) {}
    }

    /* ---------------------------------------------------------------------
     * Live region
     * ------------------------------------------------------------------ */

    function announce(message) {
      if (!liveRegion || !message) return;
      /* Clearing first forces a re-announcement when the same message repeats,
       * which otherwise goes silent in most screen readers. */
      liveRegion.textContent = '';
      window.setTimeout(function () { liveRegion.textContent = message; }, 60);
    }

    /* ---------------------------------------------------------------------
     * State synchronisation — the panel is a view, never a source of truth
     * ------------------------------------------------------------------ */

    function syncFeature(id) {
      var feature = FEATURE_BY_ID[id];
      var control = controls[id];
      if (!feature || !control) return;
      var value = Engine.get(id);

      if (feature.type === 'toggle') {
        control.setAttribute('aria-checked', value ? 'true' : 'false');
      } else if (feature.type === 'step') {
        var index = Math.max(0, feature.values.indexOf(value));
        control.value = String(index);
        var text = feature.format ? feature.format(value) : String(value);
        control.setAttribute('aria-valuetext', text);
        if (controls[id + ':out']) controls[id + ':out'].textContent = text;
      } else if (feature.type === 'select') {
        control.radios.forEach(function (radio, i) {
          var on = String(control.options[i].value) === String(value);
          radio.setAttribute('aria-checked', on ? 'true' : 'false');
          radio.setAttribute('tabindex', on ? '0' : '-1');
        });
      }

      /* A dependent control that does nothing right now should look like it. */
      if (feature.dependsOn && rows[id]) {
        var enabled = !!Engine.get(feature.dependsOn);
        rows[id].classList.toggle('is-disabled', !enabled);
        if (control.disabled !== undefined) control.disabled = !enabled;
      }
    }

    function syncProfiles() {
      var state = Engine.get();
      PROFILES.forEach(function (profile) {
        var button = profileButtons[profile.id];
        if (!button) return;
        var satisfied = Object.keys(profile.patch).every(function (key) {
          return String(state[key]) === String(profile.patch[key]);
        });
        button.setAttribute('aria-pressed', satisfied ? 'true' : 'false');
      });
    }

    function syncAll() {
      Object.keys(controls).forEach(function (key) {
        if (key.indexOf(':') === -1) syncFeature(key);
      });
      syncProfiles();
    }

    /* ---------------------------------------------------------------------
     * OS preference suggestion
     * ------------------------------------------------------------------ */

    function maybeSuggest() {
      var env = Env.get();
      var dismissedKey = cfg.storageKey + ':suggested';
      if (Store.get(dismissedKey)) return;

      var wanted = null;
      if (env.reducedMotion && !Engine.get('stopAnimations')) {
        wanted = { key: 'suggestMotion', patch: { stopAnimations: true } };
      } else if (env.moreContrast && !Engine.get('contrast')) {
        wanted = { key: 'suggestContrast', patch: { contrast: 'high' } };
      }
      if (!wanted) return;

      /* Applying an OS preference silently would surprise someone who set it
       * for their operating system and not for this page. Offer, do not impose. */
      if (cfg.autoApplyOsPreferences) {
        Engine.patch(wanted.patch);
        Store.set(dismissedKey, '1');
        return;
      }

      var box = el('div', {
        'class': 'a11y-suggest', role: 'dialog', 'aria-label': I18n.t('suggestTitle')
      }, [
        el('strong', { text: I18n.t('suggestTitle') }),
        el('span', { text: I18n.t(wanted.key) }),
        el('div', { 'class': 'row' }, [
          el('button', {
            type: 'button', 'class': 'a11y-btn is-primary', text: I18n.t('suggestApply'),
            onclick: function () {
              Engine.patch(wanted.patch);
              Store.set(dismissedKey, '1');
              box.remove();
              announce(I18n.t('announceOn', { feature: I18n.t(wanted.key) }));
            }
          }),
          el('button', {
            type: 'button', 'class': 'a11y-btn', text: I18n.t('suggestDismiss'),
            onclick: function () { Store.set(dismissedKey, '1'); box.remove(); }
          })
        ])
      ]);
      topLayer.appendChild(box);
    }

    /* ---------------------------------------------------------------------
     * Language
     * ------------------------------------------------------------------ */

    function setLanguage(code) {
      I18n.use(code);
      Engine.persist();
      rebuild();
      Keyboard.relabel();
      announce(I18n.t('panelTitle'));
      /* Lets the host page follow a language picked inside the panel. */
      try {
        document.dispatchEvent(new CustomEvent('a11y:language', {
          detail: { lang: I18n.lang, dir: I18n.dir }
        }));
      } catch (e) {}
    }

    function applyDirection() {
      /* The panel's direction is its own, not the host's: an Arabic panel has to
       * work on an English page and vice versa. */
      topLayer.setAttribute('dir', I18n.dir);
      topLayer.setAttribute('lang', I18n.lang);
      if (dialog) { dialog.setAttribute('dir', I18n.dir); dialog.setAttribute('lang', I18n.lang); }
    }

    function rebuild() {
      var wasOpen = isOpen;
      if (isOpen) close();
      rows = {}; controls = {}; profileButtons = {};
      var oldDialog = dialog;
      dialog = buildDialog();
      if (oldDialog && oldDialog.parentNode) oldDialog.parentNode.replaceChild(dialog, oldDialog);
      else shadow.appendChild(dialog);
      fab.setAttribute('aria-label', I18n.t('openLabel'));
      applyDirection();
      syncAll();
      if (wasOpen) open();
    }

    /* ---------------------------------------------------------------------
     * Keyboard shortcut
     * ------------------------------------------------------------------ */

    function matchesShortcut(e) {
      var parts = String(cfg.shortcut || '').toLowerCase().split('+').map(function (p) { return p.trim(); });
      var key = parts.pop();
      /* Alt+letter produces a different e.key on many layouts — Alt+Shift+A is
       * "Å" on macOS — so fall back to the physical key position. */
      var byKey = (e.key || '').toLowerCase() === key;
      var byCode = key.length === 1 && e.code === 'Key' + key.toUpperCase();
      if (!byKey && !byCode) return false;
      if (parts.indexOf('alt') !== -1 !== e.altKey) return false;
      if (parts.indexOf('shift') !== -1 !== e.shiftKey) return false;
      if (parts.indexOf('ctrl') !== -1 !== e.ctrlKey) return false;
      if (parts.indexOf('meta') !== -1 !== e.metaKey) return false;
      return true;
    }

    /* ---------------------------------------------------------------------
     * Mount
     * ------------------------------------------------------------------ */

    function mount(config) {
      cfg = config;
      createRoot();

      /* Everything visual goes in one top-layer container so it escapes the
       * colour filters this widget itself puts on <html>. */
      topLayer = el('div', { 'class': 'a11y-top' });
      layer = el('div', { 'class': 'a11y-layer', 'aria-hidden': 'true' });
      liveRegion = el('div', {
        'class': 'a11y-sr', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true'
      });
      fab = buildFab();

      topLayer.appendChild(layer);
      topLayer.appendChild(liveRegion);
      topLayer.appendChild(fab);
      mountTopLayer(topLayer);

      dialog = buildDialog();
      shadow.appendChild(dialog);

      RT.root = root;
      RT.shadow = shadow;
      RT.layer = layer;
      RT.announce = announce;
      RT.setState = function (id, value) { Engine.set(id, value); };

      applyDirection();

      if (sessionFlag()) topLayer.style.display = 'none';

      document.addEventListener('keydown', function (e) {
        if (matchesShortcut(e)) { e.preventDefault(); toggle(); }
      }, true);

      /* Any change — from the panel, a profile, the public API — flows back
       * into the controls. The panel never holds state of its own. */
      Engine.subscribe(function (id, value) {
        if (id === '*') { syncAll(); return; }
        syncFeature(id);
        syncProfiles();
        var feature = FEATURE_BY_ID[id];
        if (!feature) return;
        /* Dependent rows react to their controller changing. */
        FEATURES.forEach(function (f) { if (f.dependsOn === id) syncFeature(f.id); });

        var label = I18n.t(feature.labelKey);
        if (feature.type === 'toggle') {
          announce(I18n.t(value ? 'announceOn' : 'announceOff', { feature: label }));
        } else {
          var text = feature.format ? feature.format(value) :
            (feature.options ? (function () {
              for (var i = 0; i < feature.options.length; i++) {
                if (String(feature.options[i].value) === String(value)) {
                  return I18n.t(feature.options[i].labelKey);
                }
              }
              return String(value);
            }()) : String(value));
          announce(I18n.t('announceSet', { feature: label, value: text }));
        }
      });

      /* Read aloud can end on its own when it runs out of page. */
      Speech.onChange(function (speaking) {
        if (!speaking && Engine.get('readAloud')) Engine.set('readAloud', false);
      });

      /* An OS preference change mid-session re-hides features that stopped
       * being applicable — plugging in a mouse should bring the magnifier back. */
      Env.subscribe(function () {
        recomputeFilter();
        rebuild();
      });

      maybeSuggest();
      return { open: open, close: close, toggle: toggle, announce: announce, sync: syncAll };
    }

    return {
      mount: mount,
      open: function () { open(); },
      close: function () { close(); },
      toggle: function () { toggle(); },
      announce: function (m) { announce(m); },
      sync: function () { syncAll(); },
      setLanguage: setLanguage,
      destroy: function () {
        if (guardObserver) guardObserver.disconnect();
        if (root && root.parentNode) root.parentNode.removeChild(root);
        root = shadow = layer = topLayer = fab = dialog = null;
        rows = {}; controls = {}; profileButtons = {};
        isOpen = false;
      }
    };
  }());

  /* =========================================================================
   * 11. PUBLIC API
   * ====================================================================== */

  var initialised = false;
  var config = null;
  var hostStyle = null;
  var filterDefs = null;

  function injectHostAssets(cfg) {
    hostStyle = document.getElementById('a11y-host-css');
    if (!hostStyle) {
      hostStyle = document.createElement('style');
      hostStyle.id = 'a11y-host-css';
      hostStyle.setAttribute('data-a11y-ignore', '');
    }
    hostStyle.textContent = buildHostCss(cfg);
    /* Last in <head> so it beats host rules of equal specificity. Ours are
     * !important anyway, but a later !important still wins over an earlier one. */
    (document.head || document.documentElement).appendChild(hostStyle);

    if (!filterDefs) {
      filterDefs = buildFilterDefs();
      filterDefs.setAttribute('data-a11y-ignore', '');
      document.body.appendChild(filterDefs);
    }
  }

  function readScriptConfig() {
    /* Auto-init from the tag itself, for the pure-embed case where there is no
     * place to put a call: <script src="accessibility.js" data-a11y-auto>. */
    var script = document.currentScript;
    if (!script) {
      var all = qsa('script[data-a11y-auto], script[src*="accessibility"]');
      script = all[all.length - 1];
    }
    if (!script) return null;

    var out = {};
    var map = {
      'data-a11y-position': 'position',
      'data-a11y-lang': 'lang',
      'data-a11y-fonts': 'fontsPath',
      'data-a11y-shortcut': 'shortcut',
      'data-a11y-statement': 'statementUrl',
      'data-a11y-filter-target': 'colorFilterTarget',
      'data-a11y-root-id': 'rootId'
    };
    for (var attr in map) {
      if (script.hasAttribute(attr)) out[map[attr]] = script.getAttribute(attr);
    }
    if (script.hasAttribute('data-a11y-exclude')) {
      out.exclude = script.getAttribute('data-a11y-exclude').split(/[,\s]+/).filter(Boolean);
    }
    if (script.hasAttribute('data-a11y-auto-os')) out.autoApplyOsPreferences = true;
    out._auto = script.hasAttribute('data-a11y-auto');
    /* An unset fontsPath should resolve next to the script, not to the page —
     * a site serving this from /assets/ would otherwise 404 on every font. */
    if (!out.fontsPath && script.src) {
      out.fontsPath = script.src.replace(/[^/]*$/, '') + 'fonts/';
    }
    return out;
  }

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else fn();
  }

  var API = {
    version: VERSION,

    init: function (options) {
      if (initialised) return API;
      config = extend({}, DEFAULTS, options || {});

      if (config.translations) {
        /* Merge rather than replace, so a caller adding one locale does not
         * wipe the two that ship, and a partial override still falls back. */
        for (var code in config.translations) {
          if (!Object.prototype.hasOwnProperty.call(config.translations, code)) continue;
          STRINGS[code] = extend({}, STRINGS[code] || STRINGS.en, config.translations[code]);
        }
      }
      if (config.profiles) {
        for (var pid in config.profiles) {
          if (!Object.prototype.hasOwnProperty.call(config.profiles, pid)) continue;
          var existing = null;
          for (var i = 0; i < PROFILES.length; i++) if (PROFILES[i].id === pid) existing = PROFILES[i];
          if (existing) extend(existing, config.profiles[pid]);
          else PROFILES.push(extend({ id: pid, icon: '★', labelKey: pid }, config.profiles[pid]));
        }
      }

      RT.cfg = config;
      initialised = true;

      ready(function () {
        if (!document.body) return;
        var saved = Engine.init(config);
        I18n.use((saved && saved._lang) || I18n.resolve(config.lang));

        injectHostAssets(config);
        Panel.mount(config);

        /* Apply saved preferences last, once the widget root exists — several
         * engines need to know what to exclude from the page they operate on. */
        Engine.applyAll();
        Panel.sync();

        try {
          document.dispatchEvent(new CustomEvent('a11y:ready', {
            detail: { state: Engine.get(), env: Env.get() }
          }));
        } catch (e) {}
      });

      return API;
    },

    /* --- State ------------------------------------------------------------ */
    get: function (id) { return Engine.get(id); },
    set: function (id, value) { return Engine.set(id, value); },
    patch: function (values) { return Engine.patch(values); },
    reset: function () { Engine.reset(); return API; },
    applyProfile: function (id) { return Engine.applyProfile(id); },

    /* --- Panel ------------------------------------------------------------ */
    open: function () { Panel.open(); return API; },
    close: function () { Panel.close(); return API; },
    toggle: function () { Panel.toggle(); return API; },
    announce: function (message) { Panel.announce(message); return API; },
    setLanguage: function (code) { Panel.setLanguage(code); return API; },

    /* --- Introspection ---------------------------------------------------- */
    env: function () { return Env.refresh(); },
    features: function () {
      return FEATURES.map(function (f) {
        return { id: f.id, group: f.group, type: f.type, label: I18n.t(f.labelKey) };
      });
    },
    profiles: function () {
      return PROFILES.map(function (p) { return { id: p.id, label: I18n.t(p.labelKey) }; });
    },

    /* Removes every trace: engines off, page restored, widget gone. A widget
     * that cannot uninstall itself has no business being on someone's site. */
    destroy: function () {
      if (!initialised) return API;
      Engine.reset();
      Panel.destroy();
      if (hostStyle && hostStyle.parentNode) hostStyle.parentNode.removeChild(hostStyle);
      if (filterDefs && filterDefs.parentNode) filterDefs.parentNode.removeChild(filterDefs);
      hostStyle = filterDefs = null;
      initialised = false;
      return API;
    }
  };

  /* Auto-init when the tag asks for it. */
  var scriptConfig = readScriptConfig();
  if (scriptConfig && scriptConfig._auto) {
    delete scriptConfig._auto;
    API.init(scriptConfig);
  } else if (scriptConfig) {
    /* Not auto-initing, but remember where the fonts live so a bare
     * A11y.init() still finds them. */
    if (scriptConfig.fontsPath) DEFAULTS.fontsPath = scriptConfig.fontsPath;
  }

  return API;
}));
