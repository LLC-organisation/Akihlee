const THEME_KEY = 'akihlee_theme';
export type Theme = 'light' | 'dark';

export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return (window.localStorage.getItem(THEME_KEY) as Theme) || 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function setTheme(theme: Theme): void {
  window.localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
}

// Inlined into a blocking <script> in the root layout so the theme applies
// before first paint — otherwise a dark-mode user briefly sees a light
// flash on every load.
export const THEME_INIT_SCRIPT = `
(function() {
  try {
    var theme = localStorage.getItem('${THEME_KEY}') || 'light';
    if (theme === 'dark') document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;
