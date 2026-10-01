/* ---------------------------------------------------------------------------
   Controls for the hostile test page.
   ---------------------------------------------------------------------------
   External rather than inline, so the page still works when served under a
   Content-Security-Policy of script-src 'self' — an inline block would simply
   be blocked and the buttons would do nothing.

   Note that these controls are not part of what makes the page hostile. The
   hostility is in the CSS and the markup: suppressed focus outlines,
   colour-only links, a fixed header, a clipping container, endless animation.

   Page language
   -------------
   The page and the panel stay in step: the switcher in the header changes
   both, and a language picked inside the panel (the a11y:language event)
   changes the page. ?lang=ar opens the page straight in Arabic.

   To add a language, add a table to PAGE below with the same keys as `en`,
   and the matching table to STRINGS in accessibility.js.
   --------------------------------------------------------------------------- */
(function () {
  'use strict';

  var PAGE = {
    en: {
      _name: 'English',
      _dir: 'ltr',
      title: 'Accessibility widget — hostile test page',
      langLabel: 'Page language',
      navHome: 'Home',
      navProducts: 'Products',
      navDemo: 'Demo',
      navContact: 'Contact',
      h1: 'A page built the way real pages are built',
      intro: 'Low-contrast body text, px-based sizing, colour-only ' +
        '<a href="#anchor-one">links</a> with no underline, focus outlines removed, ' +
        'images with no alternative text, buttons with no accessible name, animation ' +
        'that never stops, and no <code>main</code> landmark until the screen reader ' +
        'helper adds one. Every setting in the panel has something here to act on.',
      controlsTitle: 'Controls to test',
      hostileOn: 'Toggle the hostile stylesheet',
      hostileOff: 'Remove the hostile stylesheet',
      addNodes: 'Inject new content',
      addNodesHint: '“Inject new content” adds paragraphs after load — text scaling has ' +
        'to pick them up through its mutation observer, not just on first pass.',
      injected: 'Injected paragraph #{n} — added after page load. If text scaling is on, ' +
        'this should already be scaled.',
      motionTitle: 'Motion and flashing',
      flashing: 'FLASHING',
      motionText: 'a CSS pulse, a sliding block, and a real animated GIF at 10 fps.',
      ad: 'ADVERTISEMENT — this should disappear under “reduce distractions”',
      textTitle: 'Text and reading',
      h3: 'A third-level heading',
      textPara: 'Line spacing, letter spacing and word spacing are all set on this paragraph ' +
        'by the page\'s own stylesheet, so inherited values alone will not move them — ' +
        'the widget has to force them per element. Alignment starts as the default.',
      clipbox: '<strong>Fixed-height box.</strong> This container has a hard 68px height and ' +
        'hidden overflow, so enlarging text will clip it. That is a real limit of ' +
        'scaling text on a page that was not built to accommodate it.',
      formsTitle: 'Forms with no labels',
      namePlaceholder: 'Your name',
      optSales: 'Sales',
      optSupport: 'Support',
      send: 'Send',
      imagesTitle: 'Images',
      colourTitle: 'Colour-only information',
      status: 'Status:',
      passing: 'Passing',
      failing: 'Failing',
      pending: 'Pending',
      colourText: '— three states distinguished by hue alone, which is what the colour-blind ' +
        'filters have to make separable.',
      scrollTitle: 'A long section to scroll',
      scrollHint: 'Try “Field of view” and the “Magnifier” here, and arrow through sections ' +
        'with “Focus on a section”.',
      filler1: 'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.',
      filler2: 'How vexingly quick daft zebras jump. Sphinx of black quartz, judge my vow.',
      filler3: 'Waltz, bad nymph, for quick jigs vex. The five boxing wizards jump quickly.',
      footer: 'Northwind — a fictional company on a deliberately inaccessible page.'
    },

    ar: {
      _name: 'العربية',
      _dir: 'rtl',
      title: 'أداة إمكانية الوصول — صفحة اختبار سيئة البناء عمداً',
      langLabel: 'لغة الصفحة',
      navHome: 'الرئيسية',
      navProducts: 'المنتجات',
      navDemo: 'العرض التجريبي',
      navContact: 'اتصل بنا',
      h1: 'صفحة مبنية كما تُبنى الصفحات الحقيقية',
      intro: 'نص منخفض التباين، وأحجام بوحدة البكسل، و<a href="#anchor-one">روابط</a> ' +
        'لا يميّزها إلا لونها وبلا خط سفلي، وإطارات تركيز مُزالة، وصور بلا نص بديل، ' +
        'وأزرار بلا اسم تقرؤه التقنيات المساعدة، وحركة لا تتوقف، وغياب معلم <code>main</code> ' +
        'إلى أن يضيفه مساعد قارئ الشاشة. لكل إعداد في اللوحة ما يختبره في هذه الصفحة.',
      controlsTitle: 'عناصر تحكم للاختبار',
      hostileOn: 'تفعيل ورقة الأنماط التخريبية',
      hostileOff: 'إزالة ورقة الأنماط التخريبية',
      addNodes: 'إدراج محتوى جديد',
      addNodesHint: 'يضيف زر «إدراج محتوى جديد» فقرات بعد تحميل الصفحة، وعلى تكبير النص ' +
        'أن يلتقطها عبر مراقِب التغييرات، لا عند التحميل الأول فقط.',
      injected: 'فقرة مُدرجة رقم {n} — أُضيفت بعد تحميل الصفحة. إذا كان تكبير النص مفعّلاً، ' +
        'فينبغي أن تظهر مكبّرة تلقائياً.',
      motionTitle: 'الحركة والوميض',
      flashing: 'وميض',
      motionText: 'تأثير نبض مبني بلغة CSS، وكتلة منزلقة، وصورة GIF متحركة حقيقية بمعدل 10 إطارات في الثانية.',
      ad: 'إعلان — يجب أن يختفي عند تفعيل «تقليل المشتتات»',
      textTitle: 'النص والقراءة',
      h3: 'عنوان من المستوى الثالث',
      textPara: 'تباعد الأسطر وتباعد الحروف وتباعد الكلمات مضبوطة كلها على هذه الفقرة من ' +
        'ورقة أنماط الصفحة نفسها، لذا لن تغيّرها القيم الموروثة وحدها، بل على الأداة أن ' +
        'تفرضها على كل عنصر على حدة. تبدأ المحاذاة بالقيمة الافتراضية.',
      clipbox: '<strong>مربع بارتفاع ثابت.</strong> لهذه الحاوية ارتفاع ثابت قدره 68 بكسلاً ' +
        'مع إخفاء ما يفيض عنها، لذا سيُقَصّ النص عند تكبيره. وهذا حدّ حقيقي لتكبير النص ' +
        'في صفحة لم تُبنَ لاستيعابه.',
      formsTitle: 'نماذج بلا تسميات',
      namePlaceholder: 'اسمك',
      optSales: 'المبيعات',
      optSupport: 'الدعم الفني',
      send: 'إرسال',
      imagesTitle: 'الصور',
      colourTitle: 'معلومات تعتمد على اللون وحده',
      status: 'الحالة:',
      passing: 'ناجح',
      failing: 'فاشل',
      pending: 'قيد الانتظار',
      colourText: '— ثلاث حالات لا يفرّق بينها سوى اللون، وعلى مرشحات عمى الألوان ' +
        'أن تجعلها قابلة للتمييز.',
      scrollTitle: 'قسم طويل للتمرير',
      scrollHint: 'جرّب هنا ميزتَي «مجال الرؤية» و«عدسة مكبّرة»، وتنقّل بين الأقسام بمفاتيح ' +
        'الأسهم بعد تفعيل «التركيز على قسم».',
      filler1: 'صف خلق خود كمثل الشمس إذ بزغت، يحظى الضجيع بها نجلاء معطار.',
      filler2: 'نص حكيم له سر قاطع وذو شأن عظيم مكتوب على ثوب أخضر ومغلف بجلد أزرق.',
      filler3: 'فقرة إضافية لاختبار التمرير والقراءة، فيها من الكلمات ما يكفي لملء سطر أو سطرين.',
      footer: 'Northwind — شركة خيالية في صفحة صُمّمت عمداً دون مراعاة إمكانية الوصول.'
    }
  };

  var STORAGE_KEY = 'a11y:prefs:v1'; /* the widget's own key, read only for its _lang */
  var current = 'en';

  function t(key, vars) {
    var table = PAGE[current] || PAGE.en;
    var text = table[key] != null ? table[key] : PAGE.en[key];
    if (vars) {
      text = text.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    }
    return text;
  }

  function each(selector, fn) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), fn);
  }

  function savedPanelLang() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return saved && saved._lang;
    } catch (e) { return null; }
  }

  /* ?lang= -> language last used in the panel -> browser language -> en */
  function initialLang() {
    var m = /[?&]lang=([a-z-]+)/i.exec(location.search);
    var candidates = [
      m && m[1],
      savedPanelLang(),
      (navigator.language || '').split('-')[0]
    ];
    for (var i = 0; i < candidates.length; i++) {
      var c = (candidates[i] || '').toLowerCase();
      if (PAGE[c]) return c;
    }
    return 'en';
  }

  var hostileOn = false;

  function applyPage(lang) {
    current = PAGE[lang] ? lang : 'en';
    var html = document.documentElement;
    html.lang = current;
    html.dir = PAGE[current]._dir;
    document.title = t('title');

    each('[data-i18n]', function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    /* Trusted markup from the table above, never from user input. */
    each('[data-i18n-html]', function (el) { el.innerHTML = t(el.getAttribute('data-i18n-html')); });
    each('[data-i18n-placeholder]', function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    each('[data-i18n-aria-label]', function (el) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
    });

    var hostile = document.getElementById('hostile');
    if (hostile) hostile.textContent = t(hostileOn ? 'hostileOff' : 'hostileOn');

    each('[data-injected]', function (el) {
      el.textContent = t('injected', { n: el.getAttribute('data-injected') });
    });

    each('#langs button', function (btn) {
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-lang') === current));
    });

    /* Keep ?lang= in the address bar so the current view can be shared. */
    try {
      var url = new URL(location.href);
      url.searchParams.set('lang', current);
      history.replaceState(null, '', url);
    } catch (e) {}
  }

  function setLanguage(lang) {
    applyPage(lang);
    if (window.A11y) window.A11y.setLanguage(current);
  }

  /* Language switcher: one button per table, each labelled in its own language. */
  var langs = document.getElementById('langs');
  if (langs) {
    Object.keys(PAGE).forEach(function (code) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.lang = code;
      btn.setAttribute('data-lang', code);
      btn.textContent = PAGE[code]._name;
      btn.addEventListener('click', function () {
        if (code !== current) setLanguage(code);
      });
      langs.appendChild(btn);
    });
  }

  /* Runs before the widget initialises (it waits for DOMContentLoaded), so the
     page is already in the right language when the panel first resolves its own. */
  applyPage(initialLang());

  /* With nothing saved the panel resolves from <html lang>, which is already
     right; only a saved language from an earlier visit can disagree (?lang= wins). */
  document.addEventListener('a11y:ready', function () {
    var saved = savedPanelLang();
    if (saved && saved !== current && window.A11y) window.A11y.setLanguage(current);
  });

  /* A language chosen inside the panel moves the page with it. */
  document.addEventListener('a11y:language', function (e) {
    var lang = e.detail && e.detail.lang;
    if (lang && lang !== current && PAGE[lang]) applyPage(lang);
  });

  var hostile = document.getElementById('hostile');

  if (hostile) {
    hostile.addEventListener('click', function () {
      hostileOn = document.body.classList.toggle('hostile');
      this.textContent = t(hostileOn ? 'hostileOff' : 'hostileOn');
    });
  }

  var injected = 0;
  var addNodes = document.getElementById('addnodes');

  if (addNodes) {
    addNodes.addEventListener('click', function () {
      var p = document.createElement('p');

      p.className = 'card';
      p.setAttribute('data-injected', String(++injected));
      p.textContent = t('injected', { n: injected });

      document.querySelector('main').appendChild(p);
    });
  }
})();
