import { type Rgb, THEMES, type Theme, type TranslucentColor } from '@shura/client-core';
import { useSettings } from '@shura/client-core/react';
import { useLayoutEffect } from 'react';

const css = ([red, green, blue]: Rgb) => `rgb(${red} ${green} ${blue})`;
const translucent = ({ rgb: [red, green, blue], alpha }: TranslucentColor) =>
  `rgb(${red} ${green} ${blue} / ${alpha})`;

/** A theme's colours as the CSS variables `styles/tokens.css` names. */
function themeVariables({ chrome, web, pieces }: Theme): Record<string, string> {
  return {
    ...Object.fromEntries(
      Object.entries(pieces).map(([kind, { rgb }]) => [
        `--color-piece-${kind.toLowerCase()}`,
        css(rgb),
      ]),
    ),
    '--color-background': css(chrome.background.rgb),
    '--color-text': css(chrome.text.rgb),
    '--color-border': css(chrome.border.rgb),
    '--color-accent': css(chrome.accent.rgb),
    '--color-board': css(chrome.board.rgb),
    '--color-grid': css(chrome.grid.rgb),
    '--color-panel': css(web.panel),
    '--color-deep': css(web.deep),
    '--color-shadow': css(web.shadow),
    '--color-muted': css(web.muted),
    '--color-swirl-1': translucent(web.swirls[0]),
    '--color-swirl-2': translucent(web.swirls[1]),
    '--color-swirl-3': translucent(web.swirls[2]),
    '--color-well-a': css(web.well[0]),
    '--color-well-b': css(web.well[1]),
  };
}

/**
 * Sets the selected theme's colours as CSS variables on `:root` (design §13.2, Styling), and again
 * whenever the theme setting changes, so a new theme shows at once, with no reload.
 */
export function useTheme(): void {
  const id = useSettings((settings) => settings.theme);
  useLayoutEffect(() => {
    const { style } = document.documentElement;
    for (const [name, value] of Object.entries(themeVariables(THEMES[id]))) {
      style.setProperty(name, value);
    }
  }, [id]);
}
