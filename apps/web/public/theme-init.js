(function initializeTheme() {
  try {
    // Before the rename the key was "anyshare.theme"; main.tsx moves it.
    const stored =
      localStorage.getItem("phemera.theme") ??
      localStorage.getItem("anyshare.theme");
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    const dark =
      stored === "dark" ||
      ((stored === null || stored === "system") && prefersDark);
    document.documentElement.classList.toggle("dark", dark);
  } catch {
    // Keep the default light document until React hydrates.
  }
})();
