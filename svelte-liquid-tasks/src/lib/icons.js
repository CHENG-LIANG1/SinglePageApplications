const LUCIDE_SRC = 'https://unpkg.com/lucide@latest'

let lucideLoadPromise = null

export function ensureLucide() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') return Promise.resolve(window.lucide)
  if (lucideLoadPromise) return lucideLoadPromise
  lucideLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = LUCIDE_SRC
    s.async = true
    s.onload = () => resolve(window.lucide)
    s.onerror = () => reject(new Error('Failed to load lucide'))
    document.head.appendChild(s)
  })
  return lucideLoadPromise
}

export function createIconsSafe() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons()
    return
  }
  ensureLucide()
    .then(() => {
      if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons()
    })
    .catch(() => {})
}

