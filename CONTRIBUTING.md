# Contributing

Thanks for helping. A few ground rules keep the widget small and safe to drop
into any site:

- **No dependencies and no build step.** `accessibility.js` must keep working
  when copied onto a server as a single file.
- **Never break the host page.** Every change the widget makes to a page must be
  reversible, and turning a feature off must restore the page exactly.
- **Don't overclaim.** The widget is an aid, not a compliance tool. Wording in
  the UI and docs must not suggest it makes a site WCAG/ADA conformant.
- **RTL and Arabic are first-class.** Use logical CSS properties in the panel and
  check new UI with the demo page switched to Arabic.

## Before opening a pull request

1. Serve the repository root (`npx serve .`) and open `/demo/`.
2. Test your change with the hostile stylesheet on and off, in English and
   Arabic, and with keyboard only.
3. Check at least one Chromium browser and Firefox; Safari if the change touches
   layout, filters or speech.
4. Describe what you tested in the pull request.

## Reporting bugs

Include the browser and version, OS, the page or a minimal reproduction, and
which settings were on (`A11y.get()` in the console prints them).

## Translations

New languages are welcome. Add a string table next to `en` and `ar` in
section 5 of `accessibility.js`; missing keys fall back to English.
