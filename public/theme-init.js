// Paint the stored theme before first render to avoid a flash (kept external for CSP).
try {
  var p = localStorage.getItem('tp.theme')
  if (p === 'dark' || (p !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark')
} catch (e) {}
