const ECHARTS_SRC = 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js'

let echartsLoadPromise = null

export function ensureEcharts() {
  if (window.echarts) return Promise.resolve(window.echarts)
  if (echartsLoadPromise) return echartsLoadPromise
  echartsLoadPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = ECHARTS_SRC
    s.async = true
    s.onload = () => resolve(window.echarts)
    s.onerror = () => reject(new Error('Failed to load ECharts'))
    document.head.appendChild(s)
  })
  return echartsLoadPromise
}

