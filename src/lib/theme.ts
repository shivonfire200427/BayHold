export type ThemePreference = "light" | "dark";
export const THEME_STORAGE = "watt-theme";

/**
 * Runs before paint so the page never flashes the wrong theme.
 * A saved "auto" is resolved from the system theme once and rewritten as
 * "light" or "dark". Anything else missing or unknown stays light and is
 * not written. Nothing keeps listening for system theme changes.
 */
export const themeBootScript = `(function(){try{var k="${THEME_STORAGE}";var p=localStorage.getItem(k);var t="light";if(p==="light"||p==="dark"){t=p;}else if(p==="auto"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";try{localStorage.setItem(k,t);}catch(e){}}var c=t==="dark"?"#0F1419":"#F5F4F1";document.documentElement.dataset.theme=t;document.documentElement.dataset.themePref=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",c);}catch(e){}})();`;
