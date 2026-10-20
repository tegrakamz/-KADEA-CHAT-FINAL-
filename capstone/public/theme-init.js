// Apply the saved theme before styles and page content are painted.
try {
  document.documentElement.dataset.theme = localStorage.getItem('kadea-theme') === 'dark' ? 'dark' : 'light'
} catch {
  document.documentElement.dataset.theme = 'light'
}
