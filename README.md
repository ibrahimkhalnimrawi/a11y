# accessibility.js

A drop-in accessibility widget for any website. One `<script>` tag adds a floating
button that opens a panel of ~25 assistive settings — text scaling, dyslexia fonts,
contrast modes, colour-blind correction, a reading mask, a magnifier, keyboard
navigation, distraction removal and read-aloud.

Vanilla JavaScript. No dependencies, no build step, no framework.

```html
<script src="accessibility.js" data-a11y-auto></script>
```

**[Live demo](https://ibrahimkhalnimrawi.github.io/a11y/demo/)** — a deliberately inaccessible test page with the widget on it.
Open it, toggle the hostile stylesheet, switch between English and Arabic (`?lang=ar`
links straight to Arabic), and try the panel
(or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd>).

---

## What this is, and what it is not

This widget is an **aid layered on top of a site**. It helps a visitor adapt a page
to how they read. It does **not** make a site accessible, and it must not be sold
or marketed as delivering WCAG, ADA, EN 301 549 or any other conformance.

That distinction is not legal throat-clearing. Overlay vendors have been
successfully challenged — and in the United States, penalised — specifically for
claiming that a JavaScript widget delivers compliance. Underlying markup defects
remain defects: this tool can add a missing label, but it cannot know what an
unlabelled icon means, cannot fix a wrong heading order, and cannot make a
keyboard trap disappear.

Describe it as **what it verifiably does**: it gives visitors real, persistent control
over how a page is presented, and it repairs a defined set of common defects. That
claim is true, demonstrable, and defensible.

---

## Quick start

**Auto-init from the tag** — no other code required:

```html
<script src="/assets/a11y/accessibility.js"
        data-a11y-auto
        data-a11y-position="bottom-right"
        data-a11y-fonts="/assets/a11y/fonts/"></script>
```

**Or initialise manually:**

```html
<script src="/assets/a11y/accessibility.js"></script>
<script>
  A11y.init({
    position: 'bottom-left',
    lang: 'ar',
    statementUrl: '/accessibility'
  });
</script>
```

Copy `accessibility.js` and the `fonts/` directory to your server. If `fontsPath`
is not set, the widget resolves fonts relative to its own script URL, so keeping
them side by side needs no configuration.

### From a CDN

No download needed — fonts resolve next to the script automatically:

```html
<script src="https://cdn.jsdelivr.net/npm/@ibrahimalnimrawi/a11y@1/accessibility.js"
        data-a11y-auto></script>
```

### From npm

```bash
npm install @ibrahimalnimrawi/a11y
```

```js
import A11y from '@ibrahimalnimrawi/a11y';

A11y.init({
  position: 'bottom-right',
  // A bundler cannot tell the widget where its fonts are. Either point at the CDN…
  fontsPath: 'https://cdn.jsdelivr.net/npm/@ibrahimalnimrawi/a11y@1/fonts/'
  // …or copy node_modules/@ibrahimalnimrawi/a11y/fonts/ into your public folder
  // and use that path, e.g. fontsPath: '/fonts/a11y/'
});
```

TypeScript definitions are included. Importing on the server (Next.js, Nuxt, any
SSR) is safe: without a DOM the package exports an inert stub, and the real widget
starts once the code runs in the browser — call `init()` from client-side code.

---

## Configuration

| Option | Default | Notes |
|---|---|---|
| `position` | `'bottom-right'` | Logical: `right` means the inline-end side, so it flips in RTL. |
| `lang` | `'auto'` | `auto` resolves config → `<html lang>` → `navigator.language` → `en`. |
| `translations` | `null` | `{ fr: { panelTitle: '…' } }`. Merged over the built-ins, so partial tables fall back to English. |
| `fontsPath` | next to the script | Where the `.woff2` files live. |
| `shortcut` | `'alt+shift+a'` | Opens the panel. Matched by physical key too, so it survives keyboard layouts. |
| `features` | `null` | Allowlist of feature ids. `null` = all. |
| `exclude` | `null` | Blocklist of feature ids. |
| `profiles` | `null` | Add or override profiles. |
| `storageKey` | `'a11y:prefs:v1'` | localStorage key. |
| `zIndex` | `2147483000` | Below max int32 so a host can still deliberately go above. |
| `colorFilterTarget` | `'html'` | **Leave this alone** — see the trade-offs section. |
| `autoApplyOsPreferences` | `false` | When `false`, OS preferences are *offered*, not imposed. |
| `rootId` | `'a11y-root'` | Change only on a genuine id collision. |
| `statementUrl` | `null` | Optional link in the panel footer. |
| `onChange` | `null` | `(state, changedId) => {}` |

Tag attributes mirror the main options: `data-a11y-position`, `data-a11y-lang`,
`data-a11y-fonts`, `data-a11y-shortcut`, `data-a11y-statement`,
`data-a11y-exclude` (comma-separated), `data-a11y-filter-target`,
`data-a11y-root-id`, `data-a11y-auto-os`.

---

## Styling and theming

The panel lives in a shadow root, so your site's CSS cannot reach its internals by
accident. There are two deliberate ways in.

### 1. Colour tokens (recommended)

The panel is drawn from a small set of CSS custom properties. Set them on the
widget's root element from **your own stylesheet**:

```css
#a11y-root {
  --p-accent: #b00020;      /* floating button, primary button, active options */
  --p-accent-fg: #ffffff;   /* text and icon on the accent colour */
  --p-focus: #b00020;       /* keyboard focus ring */
}
```

Normal declarations from the page beat the widget's built-in defaults, so no
`!important` is needed. A rule like this applies in light **and** dark mode; to
theme them separately, wrap the dark values in a media query:

```css
@media (prefers-color-scheme: dark) {
  #a11y-root { --p-accent: #ff8a80; --p-accent-fg: #1a0000; --p-focus: #ff8a80; }
}
```

| Token | Light default | Dark default | Used for |
|---|---|---|---|
| `--p-bg` | `#ffffff` | `#15181e` | Panel and card background |
| `--p-fg` | `#16181d` | `#f2f4f8` | Main text |
| `--p-muted` | `#5b6472` | `#a3adbd` | Hints and secondary text |
| `--p-line` | `#d8dde5` | `#333a47` | Borders and dividers |
| `--p-raise` | `#f4f6fa` | `#1e232c` | Hover background of buttons and options |
| `--p-accent` | `#0a58ff` | `#5b93ff` | Floating button, primary button, selected options, sliders |
| `--p-accent-fg` | `#ffffff` | `#0b1020` | Text and icons on the accent colour |
| `--p-on` | `#0f7a3d` | `#4ade80` | Switches in the "on" state |
| `--p-focus` | `#0a58ff` | `#8ab4ff` | Focus ring |
| `--p-shadow` | soft shadow | deeper shadow | Floating button and panel shadow |
| `--p-radius` | `12px` | — | Corner radius of the system-settings suggestion card |

Keep the contrast: `--p-accent-fg` on `--p-accent` and `--p-fg` on `--p-bg` should
stay at **4.5:1 or more**. An accessibility panel that fails contrast is the one
place it is least forgivable.

> Use a stylesheet, not an inline `style` attribute on `#a11y-root` — the widget
> strips inline styles from its root on purpose, as part of its isolation hardening.
> If you changed `rootId`, use that id in the selector.

### 2. Extra CSS inside the panel (advanced)

For anything the tokens do not cover — size or offset of the floating button,
fonts, spacing — add a stylesheet into the widget's (open) shadow root once it is
ready. It persists across language switches and panel rebuilds.

```js
document.addEventListener('a11y:ready', function () {
  var style = document.createElement('style');
  style.textContent =
    '.a11y-fab { inline-size: 48px; block-size: 48px; }' +              /* smaller button */
    '.a11y-fab[data-pos^="bottom-"] { inset-block-end: 96px; }' +       /* clear a chat bubble */
    '.a11y-dialog { font-family: "Inter", system-ui, sans-serif; }';
  document.getElementById('a11y-root').shadowRoot.appendChild(style);
});
```

The widget initialises on `DOMContentLoaded`, so register the listener in a script
that runs before then (for example right after the widget's `<script>` tag).

Main class names: `.a11y-fab` (floating button), `.a11y-dialog` (panel),
`.a11y-head` / `.a11y-title` / `.a11y-body` / `.a11y-foot` (panel sections),
`.a11y-group` (setting groups), `.a11y-profile` (quick-profile cards),
`.a11y-row` / `.a11y-label` / `.a11y-hint` (one setting), `.a11y-switch`,
`.a11y-radio`, `.a11y-range`, `.a11y-btn` / `.a11y-btn.is-primary`,
`.a11y-search`, `.a11y-suggest` (system-settings suggestion card).

Class names are an internal surface: they are stable within a major version but
may change in a major release. The colour tokens are the supported contract.

The **position** of the button (`bottom-right`, `bottom-left`, `top-right`,
`top-left`) and its **stacking order** (`zIndex`) are plain options — see
[Configuration](#configuration).

---

## Features

**Quick profiles** compose the settings below: enhanced contrast and larger text ·
dyslexia friendly · calm and seizure safe · low vision · reduce distraction ·
keyboard only · colour blind · screen reader friendly.

Profiles are *additive patches*, not exclusive modes — applying one keeps unrelated
settings a visitor has already chosen.

### Text and reading
`fontSize` (100–200%) · `lineSpacing` · `letterSpacing` · `wordSpacing` ·
`clearFont` (Atkinson Hyperlegible) · `dyslexiaFont` (OpenDyslexic) ·
`textAlign` (left / centre / right / default)

### Colour and vision
`contrast` (high / inverted / more colour / greyscale) · `calmColors` ·
`colorBlind` (protanopia / deuteranopia / tritanopia daltonisation) ·
`magnifier` · `bigCursor`

### Focus and navigation
`readingMask` + `maskHeight` (field of view) · `sectionFocus` (arrow through
landmarks) · `highlightHeadings` + `headingsList` · `highlightLinks` ·
`keyboardNav` · `stopAnimations` · `reduceDistraction` · `hideImages` ·
`hideMedia` · `muteMedia`

### Screen reader
`srRepair` — a reversible repair pass: fills missing `alt`, labels unlabelled
controls and inputs, titles iframes, adds `lang`, ensures a `main` landmark, marks
the current nav link with `aria-current`. Every write is journalled, so turning it
off restores the page exactly, including attributes that were *absent* rather than
empty.

`readAloud` / `readSelection` — `speechSynthesis` with block-level highlight
tracking. **This is not a screen reader.** It reads content; it cannot describe
controls, announce state, or navigate.

---

## API

```js
A11y.init(options)
A11y.get()                    // whole state
A11y.get('fontSize')          // one value
A11y.set('fontSize', 1.5)
A11y.patch({ contrast: 'high', highlightLinks: true })
A11y.applyProfile('dyslexia')
A11y.reset()
A11y.open() / .close() / .toggle()
A11y.setLanguage('ar')
A11y.announce('message')      // into the panel's live region
A11y.env()                    // detected OS / browser / OS preferences
A11y.features() / A11y.profiles()
A11y.destroy()                // removes every trace
```

Events on `document`: `a11y:ready`, `a11y:change`, `a11y:open`, `a11y:close`,
`a11y:language` (`detail: { lang, dir }`, fired when the panel language changes).

---

## Environment detection

Read at load and re-read live when the OS changes mid-session: OS, browser and
version (`navigator.userAgentData` with UA fallback), `prefers-reduced-motion`,
`prefers-contrast`, `prefers-color-scheme`, `forced-colors`,
`prefers-reduced-transparency`, `inverted-colors`, pointer coarseness and hover
capability, language and direction, device pixel ratio, and which storage backend
is usable.

Cursor-following features (mask, magnifier, big cursor) hide themselves on touch
devices. Under Windows High Contrast the colour filters stand down entirely rather
than fighting the OS.

**Screen reader presence is not detected.** No browser exposes it, and code that
claims to detect one is guessing. The widget ships screen reader *support* instead.

---

## Internationalisation

English and Arabic ship built in. The panel sets `dir` on its own shadow root,
independently of the host page, so an Arabic panel works correctly on an LTR site
and vice versa. Panel CSS uses logical properties throughout, so RTL is a data
change rather than a second stylesheet.

Neither bundled typeface covers Arabic. Because font fallback is per-glyph, Arabic
text would otherwise drop silently to an arbitrary face, so both font stacks name
a real Arabic fallback (`Noto Naskh Arabic`, then Tahoma, which ships on Windows
with genuine Arabic coverage).

Text alignment is deliberately **physical**, not logical: "align left" on Arabic
content is a real request from some readers, and a logical property would quietly
do the opposite of what they asked for.

---

## Style isolation — how strong it actually is

The panel lives in a shadow root. Shadow DOM alone is *not* a sandbox — inherited
properties cross the boundary, the host element itself is selectable, and an
ancestor `filter` affects everything beneath it. Each is answered:

| Vector | Defence |
|---|---|
| Inherited properties (`font-family`, `direction`, `letter-spacing`…) | `:host { all: initial }` cuts inheritance at the boundary |
| Rules targeting the root element by id | `:host { … !important }` in the shadow stylesheet |
| Scripts setting `hidden` / `inert` / inline styles | `MutationObserver` on the root's attributes |
| Ancestor `filter` / `transform` | Panel and button mount in the **top layer** |

The second row is stronger than it looks. **The cascade reverses tree order for
important declarations**: normal declarations from the outer tree beat inner ones,
but important declarations from the *inner* tree beat outer ones — and tree order
is compared before specificity.

Verified on the demo page: with `body.hostile #a11y-root { display:none !important }`
active, removing the shadow stylesheet hides the widget (height 0); restoring a
bare `:host { display:block !important }` brings it back (height 674) even though
the document rule is strictly more specific.

---

## Known trade-offs

**Colour filters and `position: fixed`.** A filtered element becomes the containing
block for its `position: fixed` descendants, which makes fixed headers scroll away.
The root element is exempt — a filter on `<html>` applies to the canvas and creates
no containing block. Measured at scrollY 400 on the demo page: filter on `<html>`
leaves a fixed header at top `0`; the identical filter on `<body>` drops it to
`-400`. **This is why `colorFilterTarget` defaults to `'html'` and why changing it
is the risky move**, not the safe one.

**Text scaling cannot fix every layout.** Containers with a fixed height and hidden
overflow will clip. The demo page includes one deliberately.

**Scaling is per element, not `html { font-size }`.** That common approach silently
does nothing on px-based sites — which is most of them. Instead each element's
computed size is measured once, cached in a `WeakMap`, and rewritten as an absolute
px value, batched through `requestIdleCallback`, with a debounced `MutationObserver`
picking up nodes added later. Absolute values mean nesting does not compound.

**Icon fonts** are excluded from font overrides (`i`, `[class*=icon]`, `fa-*`,
`material`, `glyph`). Their glyphs are private-use codepoints that exist only in
that font; swapping the family renders tofu.

**Distraction removal is conservative by design.** Aggressive `[class*=ad]` matching
hits `.header`, `.badge`, `.loading` and `.download`. Only whole-word matches are
used, and everything is reversible.

**Read-aloud highlights by block**, never by wrapping words in spans — rewriting the
host's DOM breaks any script holding node references.

---

## Browser support

Chrome / Edge 90+, Firefox 90+, Safari 15.4+. Degrades rather than breaks:

- No Shadow DOM → light DOM with prefixed classes (weaker isolation, full function).
- No `popover` → the button renders normally and is affected by active colour filters (cosmetic only).
- No `<dialog>.showModal` → a manual APG focus trap takes over.
- No `localStorage` (private mode throws on write) → `sessionStorage` → in-memory. Settings work; they just stop surviving a reload.

---

## Try it locally

No build step. Serve the repository root with any static server and open the demo:

```bash
npx serve .          # or: python -m http.server 8080
# then open http://localhost:3000/demo/  (or :8080/demo/)
```

Opening `demo/index.html` straight from disk also works, but some browsers restrict
`file://` pages, so a local server is the reliable route.

---

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
Bug reports are most useful with the browser, OS, the page (or a minimal
reproduction) and the settings that were on.

---

## Licence

[MIT](LICENSE) © 2026 Ibrahim Alnimrawi.

Bundled typefaces are third-party works under the SIL Open Font Licence 1.1 and are
not covered by the MIT Licence — see `fonts/OFL-OpenDyslexic.txt` and
`fonts/OFL-AtkinsonHyperlegible.txt`. You may ship them with your site or product;
you may not sell the fonts on their own, and if you modify one you must rename it.
