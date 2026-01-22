export function getWeekKey(d) {
  let date = d instanceof Date ? d : new Date(d)
  date = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${weekNo}`
}

export function getCycleKey(recurrence, date = new Date()) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  if (recurrence === 'daily' || recurrence === 'workdays') return `${yyyy}-${mm}-${dd}`
  if (recurrence === 'weekly') return getWeekKey(date)
  if (recurrence === 'monthly') return `${yyyy}-${mm}`
  if (recurrence === 'yearly') return `${yyyy}`
  return null
}

export function checkRecurringReset(todos) {
  const now = new Date()
  let changed = false
  const next = (Array.isArray(todos) ? todos : []).map((t) => {
    if (!t.archived && !t.deleted && t.recurrence && t.recurrence !== 'none' && t.completed) {
      const currentKey = getCycleKey(t.recurrence, now)
      const lastKey = Array.isArray(t.completionHistory) && t.completionHistory.length > 0 ? t.completionHistory[t.completionHistory.length - 1] : null
      if (lastKey !== currentKey) {
        changed = true
        return { ...t, completed: false }
      }
    }
    if (t.recurrence && t.recurrence !== 'none' && t.deadline) {
      changed = true
      return { ...t, deadline: null }
    }
    return t
  })
  return { todos: next, changed }
}

