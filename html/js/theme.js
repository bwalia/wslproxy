/* Shared light/dark theme for wslproxy.org (landing + blog).
   localStorage key: wslproxy.theme
   Boot before paint via themeBoot(); bind toggle with themeBind(). */
(function (global) {
  var KEY = "wslproxy.theme";

  function resolveTheme() {
    try {
      var t = localStorage.getItem(KEY);
      if (t === "light" || t === "dark") return t;
    } catch (e) {}
    try {
      return global.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch (e2) {
      return "light";
    }
  }

  function applyTheme(t) {
    if (t !== "light" && t !== "dark") t = "light";
    var root = document.documentElement;
    root.setAttribute("data-theme", t);
    root.classList.toggle("dark", t === "dark");
    root.style.colorScheme = t;
    try {
      localStorage.setItem(KEY, t);
    } catch (e) {}
    var btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.setAttribute(
        "aria-label",
        t === "dark" ? "Switch to light mode" : "Switch to dark mode"
      );
    }
    return t;
  }

  function themeBoot() {
    applyTheme(resolveTheme());
  }

  function themeBind() {
    var btn = document.getElementById("theme-toggle");
    if (!btn || btn.dataset.themeBound === "1") return;
    btn.dataset.themeBound = "1";
    // Re-apply so aria-label matches boot theme (button was not in DOM at boot).
    applyTheme(resolveTheme());
    btn.addEventListener("click", function () {
      var next = document.documentElement.classList.contains("dark") ? "light" : "dark";
      applyTheme(next);
    });
  }

  function navBind() {
    var btn = document.getElementById("nav-toggle");
    var menu = document.getElementById("nav-menu");
    if (!btn || !menu || btn.dataset.navBound === "1") return;
    btn.dataset.navBound = "1";
    btn.addEventListener("click", function () {
      var open = menu.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  global.WSLProxyTheme = {
    key: KEY,
    resolve: resolveTheme,
    apply: applyTheme,
    boot: themeBoot,
    bind: themeBind,
    bindNav: navBind,
  };

  themeBoot();
})(typeof window !== "undefined" ? window : this);
