export const MASTER_KEY = 'ios26_liquid_tasks_master'
export const CONFIG_KEY = 'ios26_liquid_config'
export const SUBTASK_LIMIT = 10

export function migrateOldData() {
  if (!localStorage.getItem(MASTER_KEY)) {
    const v10 = localStorage.getItem('ios26_todos_v10')
    if (v10) localStorage.setItem(MASTER_KEY, v10)
  }
}

export function isISODateString(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

export function compareISODateStrings(a, b) {
  if (!isISODateString(a) && !isISODateString(b)) return 0
  if (!isISODateString(a)) return 1
  if (!isISODateString(b)) return -1
  return a.localeCompare(b)
}

export function clampISODateToMax(dateStr, maxDateStr) {
  if (!isISODateString(maxDateStr)) return isISODateString(dateStr) ? dateStr : null
  if (!isISODateString(dateStr)) return maxDateStr
  return compareISODateStrings(dateStr, maxDateStr) > 0 ? maxDateStr : dateStr
}

export function normalizeSubtask(subtask, parentDeadline) {
  const safeId = Number.isFinite(subtask?.id) ? subtask.id : Date.now() + Math.floor(Math.random() * 100000)
  const safeText = String(subtask?.text ?? '').trim()
  const safeCompleted = !!subtask?.completed
  const normalizedDeadline = isISODateString(parentDeadline) ? clampISODateToMax(subtask?.deadline, parentDeadline) : null
  return { id: safeId, text: safeText, completed: safeCompleted, deadline: normalizedDeadline }
}

export function normalizeTodo(todo) {
  const recurrence = todo?.recurrence || 'none'
  const deadline = isISODateString(todo?.deadline) ? todo.deadline : null
  const subtasksRaw = Array.isArray(todo?.subtasks) ? todo.subtasks : []
  const hasRecurrence = recurrence && recurrence !== 'none'
  const subtasks = hasRecurrence ? [] : subtasksRaw.slice(0, SUBTASK_LIMIT).map((s) => normalizeSubtask(s, deadline)).filter((s) => s.text.length > 0)
  return { ...todo, deadline, recurrence, subtasks }
}

export function normalizeTodos(inputTodos) {
  const arr = Array.isArray(inputTodos) ? inputTodos : []
  return arr.map((t) => normalizeTodo(t))
}

export function attemptDataRecovery() {
  const keysToCheck = [MASTER_KEY, 'ios26_todos_v10', 'tasks', 'todos']
  let foundData = null
  for (const key of keysToCheck) {
    const raw = localStorage.getItem(key)
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        foundData = parsed
        break
      }
    } catch {
      continue
    }
  }
  if (foundData) {
    if (!localStorage.getItem(MASTER_KEY)) localStorage.setItem(MASTER_KEY, JSON.stringify(foundData))
    return foundData
  }
  return []
}

export function loadTodos() {
  migrateOldData()
  const raw = localStorage.getItem(MASTER_KEY)
  try {
    const parsed = JSON.parse(raw) || []
    if (Array.isArray(parsed) && parsed.length > 0) return normalizeTodos(parsed)
    const recovered = attemptDataRecovery()
    const normalized = normalizeTodos(recovered)
    saveTodos(normalized)
    return normalized
  } catch {
    const recovered = attemptDataRecovery()
    const normalized = normalizeTodos(recovered)
    saveTodos(normalized)
    return normalized
  }
}

export function saveTodos(todos) {
  localStorage.setItem(MASTER_KEY, JSON.stringify(todos))
}

export function loadConfig() {
  const raw = localStorage.getItem(CONFIG_KEY)
  try {
    return JSON.parse(raw) || { title: 'Tasks', theme: 'ayu' }
  } catch {
    return { title: 'Tasks', theme: 'ayu' }
  }
}

export function saveConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
}
