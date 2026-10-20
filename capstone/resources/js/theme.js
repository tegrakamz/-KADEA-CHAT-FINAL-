if (!document.querySelector('[data-theme-toggle]') && !document.documentElement.classList.contains('embedded-profile')) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'icon-button global-theme-toggle'
  button.dataset.themeToggle = ''
  button.title = 'Changer de thème'
  // Static icon markup, with no user-supplied content.
  button.innerHTML = '<span data-theme-moon aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/></svg></span><span data-theme-sun aria-hidden="true" hidden><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg></span>'
  document.body.append(button)
}

function applyTheme(theme) {
  const dark = theme === 'dark'
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  for (const button of document.querySelectorAll('[data-theme-toggle]')) {
    button.setAttribute('aria-label', dark ? 'Activer le mode clair' : 'Activer le mode sombre')
    button.setAttribute('aria-pressed', String(dark))
    button.querySelector('[data-theme-moon]').hidden = dark
    button.querySelector('[data-theme-sun]').hidden = !dark
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#191b20' : '#FAFAF8')
}
let savedTheme = 'light'
try { savedTheme = localStorage.getItem('kadea-theme') || 'light' } catch { /* Storage may be unavailable. */ }
applyTheme(savedTheme)
document.querySelectorAll('[data-theme-toggle]').forEach((button) => button.addEventListener('click', () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
  applyTheme(theme)
  try { localStorage.setItem('kadea-theme', theme) } catch { /* Keep the current page usable. */ }
}))
window.addEventListener('storage', (event) => {
  if (event.key === 'kadea-theme') applyTheme(event.newValue)
})
