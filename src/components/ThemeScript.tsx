// Runs synchronously in <head>, before any paint, so a saved light/dark
// choice is on the <html> element before the first frame — no flash of the
// wrong theme. Kept tiny and dependency-free on purpose. Mirrors the logic in
// ThemeToggle.tsx (THEME_KEY = "crs_theme").
const SCRIPT = `(function(){try{var k="crs_theme",v=localStorage.getItem(k),r=document.documentElement;if(v==="light"||v==="dark"){r.setAttribute("data-theme",v)}else{r.removeAttribute("data-theme")}var d=v==="dark"||(v!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);var m=document.querySelector('meta[name="theme-color"]');if(m){m.content=d?"#12201b":"#e6f2dd"}}catch(e){}})();`;

export default function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
