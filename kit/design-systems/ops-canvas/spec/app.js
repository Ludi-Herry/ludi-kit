const themeToggle = document.querySelector("#theme-toggle");
const themeLabel = document.querySelector("#theme-label");
const storageKey = "ops-canvas-theme";

const storedTheme = localStorage.getItem(storageKey);
if (storedTheme === "dark" || storedTheme === "light") setTheme(storedTheme);

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.dataset.theme;
  setTheme(current === "dark" ? "light" : "dark");
});

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
  themeLabel.textContent = theme === "dark" ? "Light theme" : "Dark theme";
  localStorage.setItem(storageKey, theme);
}

const filterForm = document.querySelector("#filter-form");
const statusInput = document.querySelector("#filter-status");
const keywordInput = document.querySelector("#filter-keyword");
const rows = [...document.querySelectorAll("tbody tr")];
const filterResult = document.querySelector("#filter-result");

filterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  applyFilters();
});

filterForm.addEventListener("reset", () => {
  requestAnimationFrame(() => applyFilters());
});

function applyFilters() {
  const status = statusInput.value;
  const keyword = keywordInput.value.trim().toLocaleLowerCase();
  let visible = 0;
  for (const row of rows) {
    const statusMatches = status === "all" || row.dataset.status === status;
    const keywordMatches = !keyword || row.textContent.toLocaleLowerCase().includes(keyword);
    row.hidden = !(statusMatches && keywordMatches);
    if (!row.hidden) visible += 1;
  }
  filterResult.textContent = `${visible} ${visible === 1 ? "result" : "results"}`;
}

const sections = [...document.querySelectorAll("main section[id]")];
const navItems = [...document.querySelectorAll(".rail-nav a")];

for (const item of navItems) {
  item.addEventListener("click", () => {
    for (const candidate of navItems) candidate.classList.toggle("active", candidate === item);
  });
}

if (document.documentElement.scrollHeight > window.innerHeight + 1) {
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (!visible) return;
      for (const item of navItems) item.classList.toggle("active", item.hash === `#${visible.target.id}`);
    },
    { rootMargin: "-15% 0px -70%", threshold: [0, 0.2, 0.5] },
  );
  for (const section of sections) observer.observe(section);
}
