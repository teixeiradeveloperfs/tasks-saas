(() => {
  try {
    const savedTheme = localStorage.getItem("flow-theme");
    const prefersDark = matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = savedTheme === "dark" || (savedTheme !== "light" && prefersDark);
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  } catch {
    // The React provider applies the theme when browser storage is unavailable.
  }
})();
