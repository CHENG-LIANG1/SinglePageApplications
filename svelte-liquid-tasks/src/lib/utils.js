import { compareISODateStrings, isISODateString, clampISODateToMax } from './storage.js'

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function parseMarkdown(text) {
  if (!text) return ''
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (trimmed.startsWith('- ')) return `<ul><li>${trimmed.substring(2)}</li></ul>`
      if (trimmed.startsWith('## ')) return `<div style="font-weight:700; opacity:0.9;">${trimmed.substring(3)}</div>`
      if (trimmed.startsWith('> ')) return `<blockquote>${trimmed.substring(2)}</blockquote>`
      return line
    })
    .join('<br>')
  return html
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/<br><ul>/g, '<ul>')
    .replace(/<\/ul><br>/g, '</ul>')
}

export function getUrgencyInfo(deadlineStr) {
  if (!isISODateString(deadlineStr)) return null
  const d = new Date(deadlineStr)
  const diffDays = Math.ceil((d - new Date().setHours(0, 0, 0, 0)) / 86400000)
  const pClass = diffDays <= 0 ? 'p-critical' : diffDays === 1 ? 'p-high' : diffDays <= 3 ? 'p-high' : diffDays <= 7 ? 'p-medium' : ''
  const rel = diffDays <= 0 ? (diffDays < 0 ? 'Overdue' : 'Today') : `${diffDays}d left`
  const dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const sortKey = Number.isFinite(diffDays) ? diffDays : 999999
  return { diffDays, pClass, rel, dateLabel, sortKey }
}

export function sortSubtasksByUrgency(subtasks) {
  const arr = Array.isArray(subtasks) ? subtasks.slice() : []
  arr.sort((a, b) => {
    if (!!a.completed !== !!b.completed) return (a.completed ? 1 : 0) - (b.completed ? 1 : 0)
    const aInfo = getUrgencyInfo(a.deadline)
    const bInfo = getUrgencyInfo(b.deadline)
    const aKey = aInfo ? aInfo.sortKey : 999999
    const bKey = bInfo ? bInfo.sortKey : 999999
    if (aKey !== bKey) return aKey - bKey
    if (aInfo && bInfo && a.deadline !== b.deadline) return compareISODateStrings(a.deadline, b.deadline)
    return (a.id || 0) - (b.id || 0)
  })
  return arr
}

export function normalizeDraftSubtasksForSave(draftSubtasks, parentDeadline) {
  const parentHasDeadline = isISODateString(parentDeadline)
  const p = parentHasDeadline ? parentDeadline : null
  const cleaned = (Array.isArray(draftSubtasks) ? draftSubtasks : [])
    .map((s) => ({
      ...s,
      deadline: parentHasDeadline ? clampISODateToMax(s?.deadline, p) : null,
    }))
    .filter((s) => String(s?.text ?? '').trim().length > 0)
  return cleaned
}

