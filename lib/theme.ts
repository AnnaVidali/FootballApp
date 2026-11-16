/**
 * The CSS custom properties the dashboard derives from a team's primary
 * colour: `--primary` (the colour itself), `--primary-text` (black or
 * white, whichever reads on top of it) and `--primary-display` (a darker
 * variant that stays legible on a white background).
 *
 * Kept pure so the server can render these into the first byte of HTML.
 * Doing the maths in a client effect left every custom-coloured team on
 * the default green until after hydration, so the page flashed the wrong
 * colour on every load.
 */

const DEFAULT_PRIMARY = "#16a34a";
const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

export type ThemeVars = {
  primary: string;
  primaryText: string;
  primaryDisplay: string;
};

export function themeVars(primaryColor: string): ThemeVars {
  const primary = HEX_COLOUR.test(primaryColor) ? primaryColor : DEFAULT_PRIMARY;
  const r = parseInt(primary.slice(1, 3), 16);
  const g = parseInt(primary.slice(3, 5), 16);
  const b = parseInt(primary.slice(5, 7), 16);

  // Relative luminance (WCAG formula) for better contrast.
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // For saturated bright colours (high max channel, low min channel),
  // force black text even if luminance is low.
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const primaryText =
    saturation > 0.5 && max > 150 ? "#000000" : luminance > 128 ? "#000000" : "#ffffff";

  // Display colour: primary readable on white backgrounds. Light colours
  // are mixed 60% primary + 40% black.
  const primaryDisplay =
    luminance > 180
      ? `#${Math.round(r * 0.6).toString(16).padStart(2, "0")}${Math.round(g * 0.6)
          .toString(16)
          .padStart(2, "0")}${Math.round(b * 0.6)
          .toString(16)
          .padStart(2, "0")}`
      : primary;

  return { primary, primaryText, primaryDisplay };
}
