/**
 * Truecolor stand-in for chalk's browser `#supports-color` module (FEAT-175).
 *
 * chalk resolves `#supports-color` to `supports-color/browser.js`, whose
 * detection only understands Chromium user agents:
 *
 *     if (navigator.userAgentData && Chromium > 93) return 3;
 *     if (/\b(Chrome|Chromium)\//.test(navigator.userAgent)) return 1;
 *     return 0;
 *
 * In Firefox and Safari that yields level 0, so every Ink `<Text color>` and
 * background (channel colours, instrument cell highlights, themed header) is
 * stripped from the web TUI. The browser always renders into a local xterm.js
 * terminal that supports 24-bit colour, so the web build pins level 3.
 *
 * Wired up by the `force-chalk-truecolor` plugin in `vite.config.web.mts`.
 */

const colorSupport = {
  level: 3,
  hasBasic: true,
  has256: true,
  has16m: true,
} as const;

const supportsColor = {
  stdout: colorSupport,
  stderr: colorSupport,
};

export default supportsColor;
