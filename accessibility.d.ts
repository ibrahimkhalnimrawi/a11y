/** Type definitions for accessibility.js */

export type A11yPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export interface A11yProfile {
  /** Settings this profile switches on, e.g. `{ fontSize: 1.3, contrast: 'high' }`. */
  patch?: Record<string, unknown>;
  icon?: string;
  labelKey?: string;
  [key: string]: unknown;
}

export interface A11yOptions {
  /** Where the floating button sits. Logical: `right` flips in RTL. Default `'bottom-right'`. */
  position?: A11yPosition;
  /** `'auto'` resolves config → `<html lang>` → `navigator.language` → `'en'`. */
  lang?: string;
  /** Extra or overriding string tables, e.g. `{ fr: { panelTitle: '…' } }`. */
  translations?: Record<string, Record<string, string>>;
  /** Where the `.woff2` files live. Default: next to the script. */
  fontsPath?: string;
  /** Keyboard shortcut that opens the panel. Default `'alt+shift+a'`. */
  shortcut?: string;
  /** Allowlist of feature ids. `null` = all. */
  features?: string[] | null;
  /** Blocklist of feature ids. */
  exclude?: string[] | null;
  /** Add or override quick profiles. */
  profiles?: Record<string, A11yProfile> | null;
  /** localStorage key. Default `'a11y:prefs:v1'`. */
  storageKey?: string;
  zIndex?: number;
  /** Leave as `'html'` unless you have a specific reason — see the README. */
  colorFilterTarget?: string;
  /** Apply OS preferences silently instead of offering them. Default `false`. */
  autoApplyOsPreferences?: boolean;
  /** Id of the widget's host element. Default `'a11y-root'`. */
  rootId?: string;
  /** Optional link shown in the panel footer. */
  statementUrl?: string | null;
  /** Called after every state change with a copy of the state. */
  onChange?: ((state: A11yState, changedId: string) => void) | null;
}

export type A11yState = Record<string, unknown>;

export interface A11yFeatureInfo {
  id: string;
  group: string;
  type: string;
  label: string;
}

export interface A11yProfileInfo {
  id: string;
  label: string;
}

export interface A11yApi {
  readonly version: string;
  init(options?: A11yOptions): A11yApi;
  get(): A11yState;
  get(id: string): unknown;
  set(id: string, value: unknown): unknown;
  patch(values: A11yState): unknown;
  reset(): A11yApi;
  applyProfile(id: string): unknown;
  open(): A11yApi;
  close(): A11yApi;
  toggle(): A11yApi;
  announce(message: string): A11yApi;
  setLanguage(code: string): A11yApi;
  /** Detected OS / browser / OS accessibility preferences. */
  env(): Record<string, unknown>;
  features(): A11yFeatureInfo[];
  profiles(): A11yProfileInfo[];
  /** Removes every trace: engines off, page restored, widget gone. */
  destroy(): A11yApi;
}

declare const A11y: A11yApi;
export default A11y;

declare global {
  interface Window {
    A11y: A11yApi;
  }
  interface DocumentEventMap {
    'a11y:ready': CustomEvent<{ state: A11yState; env: Record<string, unknown> }>;
    'a11y:change': CustomEvent<{ id: string; value: unknown; state: A11yState }>;
    'a11y:open': CustomEvent<{ state: A11yState }>;
    'a11y:close': CustomEvent<{ state: A11yState }>;
    'a11y:language': CustomEvent<{ lang: string; dir: 'ltr' | 'rtl' }>;
  }
}
