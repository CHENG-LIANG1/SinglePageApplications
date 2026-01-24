<script>
  import { afterUpdate, onMount, tick } from 'svelte'
  import { ensureEcharts } from './lib/echarts.js'
  import { createIconsSafe, ensureLucide } from './lib/icons.js'
  import { checkRecurringReset, getCycleKey } from './lib/recurrence.js'
  import {
    SUBTASK_LIMIT,
    clampISODateToMax,
    compareISODateStrings,
    isISODateString,
    loadConfig,
    loadTodos,
    normalizeSubtask,
    normalizeTodo,
    normalizeTodos,
    saveConfig,
    saveTodos,
  } from './lib/storage.js'
  import { THEMES, getTextsByThemeId, getThemeMetaById } from './lib/themes.js'
  import { escapeHtml, getUrgencyInfo, isoToLocalDate, normalizeDraftSubtasksForSave, parseMarkdown, sortSubtasksByUrgency } from './lib/utils.js'

  let todos = []
  let config = { title: 'Tasks', theme: 'ayu' }

  let searchTerm = ''
  let showArchived = false
  let isActivityView = false

  let chartType = 'line'
  let dowChartType = 'bar'
  let todChartType = 'line'
  let currentHeatmapYear = new Date().getFullYear()
  let fullCalendarYear = new Date().getFullYear()

  let myChart = null
  let dowChartInst = null
  let todChartInst = null
  let pieChartInst = null

  let newTaskDate = null
  let pickerCurrentDate = new Date()
  let subtaskPickerCurrentDate = new Date()
  let subtaskPickerTargetId = null
  let isTaskDatePickerOpen = false
  let isSubtaskDatePickerOpen = false

  let isExpanded = false
  let editingTaskId = null
  let newRecurrence = 'none'
  let draftSubtasks = []
  let expandedTodoIds = new Set()

  let isThemeModalOpen = false
  let isTrashModalOpen = false
  let currentDetailId = null
  let isCalendarModalOpen = false

  let dateDisplay = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  let slideOutRightIds = new Set()
  let slideOutLeftIds = new Set()

  let tooltipVisible = false
  let tooltipHtml = ''
  let tooltipTop = 0
  let tooltipLeft = 0

  let todoInput = ''

  $: texts = getTextsByThemeId(config.theme)
  $: themeMeta = getThemeMetaById(config.theme)

  $: if (typeof document !== 'undefined') document.documentElement.dataset.theme = config.theme

  $: lowerSearch = searchTerm.toLowerCase()
  $: activeTodos = todos.filter((t) => !t.deleted && (showArchived ? t.archived : !t.archived) && String(t.text || '').toLowerCase().includes(lowerSearch))
  $: sortFn = (a, b) => {
    if (!showArchived) {
      const aR = a.recurrence && a.recurrence !== 'none'
      const bR = b.recurrence && b.recurrence !== 'none'
      if (aR && !bR) return -1
      if (!aR && bR) return 1
      if (aR && bR) return b.id - a.id
    }
    if (a.completed !== b.completed) return a.completed - b.completed
    if (!a.completed) {
      if (a.deadline && b.deadline) return compareISODateStrings(a.deadline, b.deadline)
      if (a.deadline && !b.deadline) return -1
      if (!a.deadline && b.deadline) return 1
    }
    return a.id - b.id
  }
  $: pinnedTasks = activeTodos.filter((t) => t.pinned && !showArchived).sort(sortFn)
  $: normalTasks = activeTodos.filter((t) => !t.pinned || showArchived).sort(sortFn)

  $: overlayActive = isExpanded || isThemeModalOpen || isTrashModalOpen || currentDetailId !== null || isCalendarModalOpen

  $: outsideTagline = texts.outsideTagline || ''
  $: outsideTaglineOpacity = outsideTagline ? String(texts.outsideTaglineOpacity ?? 0.26) : '0'
  $: outsideBadgeTitle = themeMeta.name || themeMeta.id
  $: outsideBadgeSub = getOutsideTaglineCompact(texts) || texts.themeModalTitle || ''
  $: outsideStrip = themeMeta.name || themeMeta.id
  $: outsideStatusHtml = getOutsideStatusHtml()

  $: if (isExpanded) {
    if (newRecurrence && newRecurrence !== 'none') {
      draftSubtasks = []
      newTaskDate = null
    }
  }

  function persistTodos(nextTodos) {
    todos = normalizeTodos(nextTodos)
    saveTodos(todos)
  }

  function persistConfig(next) {
    config = next
    saveConfig(config)
  }

  function getOutsideTaglineCompact(activeTexts) {
    if (!activeTexts || !activeTexts.outsideTagline) return ''
    return activeTexts.outsideTagline.split('\n').filter(Boolean).slice(0, 2).join(' · ')
  }

  function formatOutsideTime() {
    return new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit' })
  }

  function getOutsideStatusHtml() {
    let total = 0
    let completed = 0
    todos.forEach((t) => {
      if (!t.deleted) {
        total++
        if (t.completed || t.archived) completed++
      }
    })
    return `<b>${formatOutsideTime()}</b> · ${escapeHtml(themeMeta.name || themeMeta.id)} · ${completed}/${total}`
  }

  function openThemePicker() {
    isThemeModalOpen = true
  }

  function closeThemePicker() {
    isThemeModalOpen = false
  }

  async function selectTheme(themeId) {
    persistConfig({ ...config, theme: themeId })
    if (isActivityView) {
      await ensureEcharts().catch(() => {})
      await tick()
      renderHeatmap(currentHeatmapYear)
      renderChart()
      renderAdvancedStats()
    }
  }

  function openTrash() {
    isTrashModalOpen = true
  }

  function closeTrash() {
    isTrashModalOpen = false
  }

  function restoreTodo(id) {
    persistTodos(todos.map((t) => (t.id === id ? { ...t, deleted: false } : t)))
    if (isActivityView) {
      renderHeatmap(currentHeatmapYear)
      renderChart()
      renderAdvancedStats()
    }
  }

  function hardDelete(id) {
    persistTodos(todos.filter((t) => t.id !== id))
    if (isActivityView) {
      renderHeatmap(currentHeatmapYear)
      renderChart()
      renderAdvancedStats()
    }
  }

  function emptyTrash() {
    persistTodos(todos.filter((t) => !t.deleted))
    if (isActivityView) {
      renderHeatmap(currentHeatmapYear)
      renderChart()
      renderAdvancedStats()
    }
  }

  function closeDetail() {
    currentDetailId = null
  }

  function openDetail(id) {
    currentDetailId = id
  }

  function closeCalendarModal() {
    isCalendarModalOpen = false
  }

  function openCalendarModal() {
    fullCalendarYear = currentHeatmapYear
    isCalendarModalOpen = true
  }

  function changeFullCalendarYear(delta) {
    fullCalendarYear += delta
  }

  function closeOverlays() {
    if (isExpanded) toggleExpand()
    closeDetail()
    closeThemePicker()
    closeTrash()
    closeCalendarModal()
  }

  async function toggleActivityView() {
    isActivityView = !isActivityView
    if (isActivityView) {
      showArchived = false
      await ensureEcharts().catch(() => {})
      await tick()
      renderHeatmap(currentHeatmapYear)
      renderChart()
      renderAdvancedStats()
    }
  }

  function toggleShowArchived() {
    if (isActivityView) isActivityView = false
    showArchived = !showArchived
    if (!showArchived) {
      slideOutRightIds = new Set()
      slideOutLeftIds = new Set()
    }
  }

  function setRecurrence(type) {
    if (type !== 'none') {
      const hasDraftSubtasks = normalizeDraftSubtasksForSave(draftSubtasks, newTaskDate).length > 0
      if (hasDraftSubtasks) return
      if (editingTaskId) {
        const todo = todos.find((t) => t.id === editingTaskId)
        if (Array.isArray(todo?.subtasks) && todo.subtasks.length > 0) return
      }
    }
    newRecurrence = type
    if (type !== 'none') {
      newTaskDate = null
      draftSubtasks = []
    }
  }

  function cycleRecurrence() {
    const modes = ['none', 'daily', 'workdays', 'weekly', 'monthly', 'yearly']
    const idx = modes.indexOf(newRecurrence)
    setRecurrence(modes[(idx + 1) % modes.length])
  }

  function canEditSubtasksForCurrentDraft() {
    const hasRecurrence = newRecurrence && newRecurrence !== 'none'
    if (hasRecurrence) return false
    if (editingTaskId) {
      const todo = todos.find((t) => t.id === editingTaskId)
      if (todo?.recurrence && todo.recurrence !== 'none') return false
    }
    return true
  }

  function syncDraftSubtaskDeadlines() {
    const parentHasDeadline = isISODateString(newTaskDate)
    const parentDeadline = parentHasDeadline ? newTaskDate : null
    draftSubtasks = (Array.isArray(draftSubtasks) ? draftSubtasks : []).map((s) => normalizeSubtask(s, parentDeadline))
  }

  function addDraftSubtask() {
    if (!canEditSubtasksForCurrentDraft()) return
    const parentHasDeadline = isISODateString(newTaskDate)
    const parentDeadline = parentHasDeadline ? newTaskDate : null
    const current = Array.isArray(draftSubtasks) ? draftSubtasks.slice(0, SUBTASK_LIMIT) : []
    if (current.length >= SUBTASK_LIMIT) return
    const id = Date.now() + Math.floor(Math.random() * 100000)
    draftSubtasks = [...current, { id, text: '', completed: false, deadline: parentDeadline }]
  }

  function updateDraftSubtaskText(id, value) {
    draftSubtasks = (Array.isArray(draftSubtasks) ? draftSubtasks : []).map((s) => (s.id === id ? { ...s, text: value } : s))
  }

  function removeDraftSubtask(id) {
    draftSubtasks = (Array.isArray(draftSubtasks) ? draftSubtasks : []).filter((s) => s.id !== id)
  }

  function openSubtaskDatePicker(subtaskId) {
    if (!isExpanded) return
    if (!canEditSubtasksForCurrentDraft()) return
    if (!isISODateString(newTaskDate)) return
    subtaskPickerTargetId = subtaskId
    const parentDeadline = newTaskDate
    const st = (Array.isArray(draftSubtasks) ? draftSubtasks : []).find((s) => s.id === subtaskId)
    const selected = clampISODateToMax(st?.deadline, parentDeadline) || parentDeadline
    subtaskPickerCurrentDate = new Date(selected)
    isTaskDatePickerOpen = false
    isSubtaskDatePickerOpen = true
  }

  function closeSubtaskDatePicker() {
    isSubtaskDatePickerOpen = false
    subtaskPickerTargetId = null
  }

  function changeSubtaskMonth(delta) {
    if (!isSubtaskDatePickerOpen) return
    subtaskPickerCurrentDate.setMonth(subtaskPickerCurrentDate.getMonth() + delta)
    subtaskPickerCurrentDate = new Date(subtaskPickerCurrentDate)
  }

  function setSubtaskDeadline(dateStr) {
    draftSubtasks = (Array.isArray(draftSubtasks) ? draftSubtasks : []).map((s) => (s.id === subtaskPickerTargetId ? { ...s, deadline: dateStr } : s))
    closeSubtaskDatePicker()
  }

  function toggleTaskDatePicker() {
    isTaskDatePickerOpen = !isTaskDatePickerOpen
    if (isTaskDatePickerOpen) {
      pickerCurrentDate = newTaskDate ? new Date(newTaskDate) : new Date()
      isSubtaskDatePickerOpen = false
    }
  }

  function changeTaskMonth(delta) {
    pickerCurrentDate.setMonth(pickerCurrentDate.getMonth() + delta)
    pickerCurrentDate = new Date(pickerCurrentDate)
  }

  function setTaskDeadline(dateStr) {
    newTaskDate = dateStr
    setRecurrence('none')
    syncDraftSubtaskDeadlines()
    isTaskDatePickerOpen = false
  }

  function toggleExpand() {
    isExpanded = !isExpanded
    if (!isExpanded) {
      if (editingTaskId) {
        editingTaskId = null
        todoInput = ''
        newTaskDate = null
        newRecurrence = 'none'
      }
      draftSubtasks = []
      isTaskDatePickerOpen = false
      isSubtaskDatePickerOpen = false
    }
  }

  function insertMarkdown(startTag, endTag) {
    const el = document.getElementById('todoInput')
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const text = el.value
    const next = text.substring(0, start) + startTag + text.substring(start, end) + endTag + text.substring(end)
    todoInput = next
    tick().then(() => {
      const input = document.getElementById('todoInput')
      if (!input) return
      input.focus()
      input.selectionStart = start + startTag.length
      input.selectionEnd = start + startTag.length + (end - start)
    })
  }

  function addTodo() {
    if (!String(todoInput || '').trim()) return
    const savedSubtasks = normalizeDraftSubtasksForSave(draftSubtasks, newTaskDate)
      .map((s) => normalizeSubtask(s, newTaskDate))
      .filter((s) => s.text.length > 0)
      .slice(0, SUBTASK_LIMIT)
    if (savedSubtasks.length > SUBTASK_LIMIT) return
    if (newRecurrence && newRecurrence !== 'none' && savedSubtasks.length > 0) return

    if (editingTaskId) {
      persistTodos(todos.map((t) => (t.id === editingTaskId ? { ...t, text: todoInput.trim(), deadline: newTaskDate, recurrence: newRecurrence, subtasks: savedSubtasks } : t)))
    } else {
      persistTodos([
        { id: Date.now(), text: todoInput.trim(), completed: false, archived: false, deleted: false, pinned: false, deadline: newTaskDate, recurrence: newRecurrence, completionHistory: [], subtasks: savedSubtasks },
        ...todos,
      ])
    }
    todoInput = ''
    draftSubtasks = []
    setRecurrence('none')
    if (isExpanded) toggleExpand()
    newTaskDate = null
  }

  function openEditSheet(id) {
    closeDetail()
    const todo = todos.find((t) => t.id === id)
    if (!todo) return
    editingTaskId = id
    todoInput = todo.text
    setRecurrence(todo.recurrence || 'none')
    newTaskDate = todo.deadline || null
    draftSubtasks = Array.isArray(todo.subtasks) ? todo.subtasks.map((s) => ({ ...s })) : []
    syncDraftSubtaskDeadlines()
    if (!isExpanded) toggleExpand()
  }

  function toggleTodoExpand(id) {
    const next = new Set(expandedTodoIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    expandedTodoIds = next
  }

  function toggleSubtask(todoId, subtaskId) {
    const todo = todos.find((t) => t.id === todoId)
    if (!todo) return
    if (todo.archived || showArchived) return
    persistTodos(
      todos.map((t) => {
        if (t.id !== todoId) return t
        const subs = Array.isArray(t.subtasks) ? t.subtasks : []
        const next = subs.map((s) => (s.id === subtaskId ? { ...s, completed: !s.completed } : s))
        return normalizeTodo({ ...t, subtasks: next })
      }),
    )
    const after = todos.find((t) => t.id === todoId)
    if (after && Array.isArray(after.subtasks) && after.subtasks.length > 0 && after.subtasks.every((s) => !!s.completed) && !after.completed) {
      toggleTodo(todoId)
    }
  }

  function togglePin(id) {
    persistTodos(todos.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)))
  }

  function toggleTodo(id) {
    const todo = todos.find((t) => t.id === id)
    if (!todo) return

    if (todo.recurrence && todo.recurrence !== 'none') {
      const isNowCompleted = !todo.completed
      const now = new Date()
      const cycleKey = getCycleKey(todo.recurrence, now)
      let newHistory = todo.completionHistory || []
      const lastKey = newHistory.length > 0 ? newHistory[newHistory.length - 1] : null
      let nextTodos = todos
      if (isNowCompleted && lastKey !== cycleKey) {
        newHistory = [...newHistory, cycleKey]
        nextTodos = [
          ...todos,
          { id: Date.now(), text: todo.text, completed: true, archived: true, deleted: false, completedAt: now.toISOString(), deadline: null, recurrence: todo.recurrence },
        ]
      }
      persistTodos(nextTodos.map((t) => (t.id === id ? { ...t, completed: isNowCompleted, completionHistory: newHistory } : t)))
      if (isNowCompleted && showArchived) {
        renderHeatmap(currentHeatmapYear)
        renderChart()
      }
      return
    }

    const newStatus = !todo.completed
    if (newStatus) {
      persistTodos(todos.map((t) => (t.id === id ? { ...t, completed: true, completedAt: new Date().toISOString() } : t)))
      setTimeout(() => {
        slideOutRightIds = new Set(slideOutRightIds).add(id)
      }, 400)
      setTimeout(() => {
        persistTodos(todos.map((t) => (t.id === id ? { ...t, archived: true } : t)))
        slideOutRightIds = new Set([...slideOutRightIds].filter((x) => x !== id))
        if (showArchived) {
          renderHeatmap(currentHeatmapYear)
          renderChart()
        }
      }, 800)
    } else {
      persistTodos(todos.map((t) => (t.id === id ? { ...t, completed: false, completedAt: undefined } : t)))
    }
  }

  function deleteTodo(id) {
    slideOutLeftIds = new Set(slideOutLeftIds).add(id)
    setTimeout(() => {
      persistTodos(todos.map((t) => (t.id === id ? { ...t, deleted: true } : t)))
      slideOutLeftIds = new Set([...slideOutLeftIds].filter((x) => x !== id))
      if (isActivityView) {
        renderHeatmap(currentHeatmapYear)
        renderChart()
      }
    }, 350)
  }

  function unarchiveTodo(id) {
    persistTodos(todos.map((t) => (t.id === id ? { ...t, archived: false, completed: false } : t)))
  }

  function getMonthlyData(year) {
    const counts = new Array(12).fill(0)
    todos.forEach((t) => {
      if (!t.deleted) {
        const dates = [...(t.completionHistory || [])]
        if (t.completedAt && (t.completed || t.archived)) dates.push(t.completedAt)
        dates.forEach((dStr) => {
          const date = new Date(dStr)
          if (date.getFullYear() === year) counts[date.getMonth()]++
        })
      }
    })
    return counts
  }

  function initChart() {
    if (!window.echarts) return
    if (!activityChartEl) return
    if (myChart) myChart.dispose()
    myChart = window.echarts.init(activityChartEl)
    renderChart()
  }

  function renderChart() {
    if (!isActivityView) return
    if (!window.echarts) return
    if (!myChart) {
      initChart()
      return
    }
    const data = getMonthlyData(currentHeatmapYear)
    const style = getComputedStyle(document.documentElement)
    const colorAccent = style.getPropertyValue('--accent-blue').trim()
    const colorText = style.getPropertyValue('--text-secondary').trim()
    const colorGrid = style.getPropertyValue('--glass-border').trim()
    const colorPrimary = style.getPropertyValue('--text-primary').trim()
    const colorBg = style.getPropertyValue('--input-bg').trim()

    const seriesBase = { data, type: chartType, itemStyle: { color: colorAccent }, lineStyle: { width: 3, color: colorAccent } }
    const option = {
      tooltip: { trigger: 'axis', backgroundColor: colorBg, borderColor: colorGrid, textStyle: { color: colorPrimary } },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], axisLine: { lineStyle: { color: colorText } }, axisTick: { show: false } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: colorGrid, type: 'dashed' } }, axisLine: { show: false }, axisLabel: { color: colorText } },
      series: [
        {
          ...seriesBase,
          smooth: chartType === 'line',
          symbol: chartType === 'line' ? 'circle' : 'none',
          symbolSize: chartType === 'line' ? 7 : 0,
          barMaxWidth: chartType === 'bar' ? 22 : undefined,
          itemStyle: chartType === 'bar' ? { color: colorAccent, borderRadius: [6, 6, 0, 0] } : { color: colorAccent },
          areaStyle:
            chartType === 'line'
              ? { color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: colorAccent }, { offset: 1, color: 'rgba(0,0,0,0)' }]), opacity: 0.2 }
              : null,
        },
      ],
    }
    myChart.setOption(option)
  }

  function getDatesInScope(todo) {
    const dates = [...(todo.completionHistory || [])]
    if (todo.completedAt && (todo.completed || todo.archived)) dates.push(todo.completedAt)
    return dates.map((d) => new Date(d))
  }

  let statWeek = 0
  let statMonth = 0
  let statYear = 0
  let statRate = '0%'
  let statWeekDiffHtml = '<span class="stat-sub">--</span> vs last'
  let statMonthDiffHtml = '<span class="stat-sub">--</span> vs last'
  let statYearDiffHtml = '<span class="stat-sub">--</span> vs last'

  function renderDiff(current, previous) {
    if (previous === 0) return current > 0 ? '<span class="stat-sub positive">↑ ∞</span> vs last' : '<span class="stat-sub">--</span> vs last'
    const diff = current - previous
    const pct = Math.round((diff / previous) * 100)
    const isPos = diff >= 0
    return `<span class=\"stat-sub ${isPos ? 'positive' : 'negative'}\">${isPos ? '↑' : '↓'} ${Math.abs(pct)}%</span> vs last`
  }

  function calculateStats() {
    const now = new Date()
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay())
    startOfWeek.setHours(0, 0, 0, 0)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfYear = new Date(now.getFullYear(), 0, 1)

    const startOfLastWeek = new Date(startOfWeek)
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7)
    const endOfLastWeek = new Date(startOfWeek)

    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

    const startOfLastYear = new Date(now.getFullYear() - 1, 0, 1)
    const endOfLastYear = new Date(now.getFullYear() - 1, 11, 31)

    let week = 0
    let lastWeek = 0
    let month = 0
    let lastMonth = 0
    let year = 0
    let lastYear = 0
    let total = 0
    let completed = 0

    todos.forEach((t) => {
      if (!t.deleted) {
        if (t.completed || t.archived) completed++
        total++
        const dates = getDatesInScope(t)
        dates.forEach((d) => {
          if (d >= startOfWeek) week++
          else if (d >= startOfLastWeek && d < endOfLastWeek) lastWeek++

          if (d >= startOfMonth) month++
          else if (d >= startOfLastMonth && d <= endOfLastMonth) lastMonth++

          if (d >= startOfYear) year++
          else if (d >= startOfLastYear && d <= endOfLastYear) lastYear++
        })
      }
    })

    statWeek = week
    statMonth = month
    statYear = year
    statWeekDiffHtml = renderDiff(week, lastWeek)
    statMonthDiffHtml = renderDiff(month, lastMonth)
    statYearDiffHtml = renderDiff(year, lastYear)
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0
    statRate = `${rate}%`
  }

  function renderAdvancedStats() {
    calculateStats()
    if (!window.echarts) return
    if (!dowChartEl || !todChartEl || !pieChartEl) return
    const style = getComputedStyle(document.documentElement)
    const colorAccent = style.getPropertyValue('--accent-blue').trim()
    const colorText = style.getPropertyValue('--text-secondary').trim()
    const colorGrid = style.getPropertyValue('--glass-border').trim()
    const colorPrimary = style.getPropertyValue('--text-primary').trim()
    const colorBg = style.getPropertyValue('--input-bg').trim()

    if (dowChartInst) dowChartInst.dispose()
    dowChartInst = window.echarts.init(dowChartEl)
    const dowData = [0, 0, 0, 0, 0, 0, 0]

    if (todChartInst) todChartInst.dispose()
    todChartInst = window.echarts.init(todChartEl)
    const todData = new Array(24).fill(0)

    if (pieChartInst) pieChartInst.dispose()
    pieChartInst = window.echarts.init(pieChartEl)
    let recurrent = 0
    let oneTime = 0

    todos.forEach((t) => {
      if (!t.deleted) {
        if (t.recurrence && t.recurrence !== 'none') recurrent++
        else oneTime++
        const dates = getDatesInScope(t)
        dates.forEach((d) => {
          dowData[d.getDay()]++
          todData[d.getHours()]++
        })
      }
    })

    dowChartInst.setOption({
      tooltip: { trigger: 'axis', backgroundColor: colorBg, borderColor: colorGrid, textStyle: { color: colorPrimary } },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', data: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], axisLine: { lineStyle: { color: colorText } }, axisTick: { show: false } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: colorGrid, type: 'dashed' } }, axisLabel: { color: colorText } },
      series: [
        {
          data: dowData,
          type: dowChartType,
          smooth: dowChartType === 'line',
          symbol: dowChartType === 'line' ? 'circle' : 'none',
          symbolSize: dowChartType === 'line' ? 7 : 0,
          barMaxWidth: dowChartType === 'bar' ? 22 : undefined,
          itemStyle: dowChartType === 'bar' ? { color: colorAccent, borderRadius: [6, 6, 0, 0] } : { color: colorAccent },
          lineStyle: { width: 3, color: colorAccent },
          areaStyle: dowChartType === 'line' ? { opacity: 0.2, color: colorAccent } : null,
        },
      ],
    })

    todChartInst.setOption({
      tooltip: { trigger: 'axis', backgroundColor: colorBg, borderColor: colorGrid, textStyle: { color: colorPrimary } },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', data: Array.from({ length: 24 }, (_, i) => i), axisLine: { lineStyle: { color: colorText } }, axisTick: { show: false } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: colorGrid, type: 'dashed' } }, axisLabel: { color: colorText } },
      series: [
        {
          data: todData,
          type: todChartType,
          smooth: todChartType === 'line',
          symbol: todChartType === 'line' ? 'circle' : 'none',
          symbolSize: todChartType === 'line' ? 7 : 0,
          barMaxWidth: todChartType === 'bar' ? 22 : undefined,
          itemStyle: todChartType === 'bar' ? { color: colorAccent, borderRadius: [6, 6, 0, 0] } : { color: colorAccent },
          lineStyle: { width: 3, color: colorAccent },
          areaStyle: todChartType === 'line' ? { opacity: 0.2, color: colorAccent } : null,
        },
      ],
    })

    pieChartInst.setOption({
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'pie',
          radius: ['40%', '70%'],
          itemStyle: { borderRadius: 5, borderColor: style.getPropertyValue('--card-bg').trim(), borderWidth: 2 },
          label: { show: false },
          data: [
            { value: oneTime, name: 'One-time', itemStyle: { color: colorAccent } },
            { value: recurrent, name: 'Recurring', itemStyle: { color: style.getPropertyValue('--accent-purple').trim() } },
          ],
        },
      ],
    })
  }

  async function toggleChartType() {
    chartType = chartType === 'line' ? 'bar' : 'line'
    if (isActivityView && !window.echarts) await ensureEcharts().catch(() => {})
    renderChart()
  }

  async function toggleDowChartType() {
    dowChartType = dowChartType === 'line' ? 'bar' : 'line'
    if (isActivityView && !window.echarts) await ensureEcharts().catch(() => {})
    if (isActivityView) renderAdvancedStats()
  }

  async function toggleTodChartType() {
    todChartType = todChartType === 'line' ? 'bar' : 'line'
    if (isActivityView && !window.echarts) await ensureEcharts().catch(() => {})
    if (isActivityView) renderAdvancedStats()
  }

  function showTooltip(e, date, count) {
    tooltipHtml = `<strong>${escapeHtml(date)}</strong><br>${count} completed`
    tooltipVisible = true
    moveTooltip(e)
  }

  function moveTooltip(e) {
    const offset = 15
    tooltipTop = e.clientY + offset
    tooltipLeft = e.clientX + offset
  }

  function hideTooltip() {
    tooltipVisible = false
  }

  let heatmapCells = []
  let heatmapTotalAll = 0

  function renderHeatmap(year) {
    const counts = {}
    let totalAll = 0
    todos.forEach((t) => {
      if (!t.deleted) {
        const dates = [...(t.completionHistory || [])]
        if (t.completedAt && (t.completed || t.archived)) dates.push(t.completedAt)
        dates.forEach((dStr) => {
          const date = new Date(dStr)
          if (date.getFullYear() === year) {
            const dateKey = date.toISOString().split('T')[0]
            if (!counts[dateKey]) counts[dateKey] = 0
            counts[dateKey]++
            totalAll++
          }
        })
      }
    })
    heatmapTotalAll = totalAll

    const startDate = new Date(year, 0, 1)
    const endDate = new Date(year, 11, 31)
    const startDay = startDate.getDay()
    const cells = []
    for (let i = 0; i < startDay; i++) cells.push({ empty: true })
    const loopDate = new Date(startDate)
    while (loopDate <= endDate) {
      const dateKey = loopDate.toISOString().split('T')[0]
      const count = counts[dateKey] || 0
      const level = count >= 5 ? 'hm-l4' : count >= 3 ? 'hm-l3' : count >= 1 ? 'hm-l2' : 'hm-l1'
      cells.push({ empty: false, dateKey, count, level })
      loopDate.setDate(loopDate.getDate() + 1)
    }
    heatmapCells = cells
  }

  function changeHeatmapYear(delta) {
    currentHeatmapYear += delta
    renderHeatmap(currentHeatmapYear)
    renderChart()
  }

  function getYearData(year) {
    const yearData = {}
    todos.forEach((t) => {
      if (!t.deleted) {
        const dates = [...(t.completionHistory || [])]
        if (t.completedAt && (t.completed || t.archived)) dates.push(t.completedAt)
        dates.forEach((dStr) => {
          const d = new Date(dStr)
          if (d.getFullYear() === year) {
            const key = `${d.getMonth()}-${d.getDate()}`
            yearData[key] = (yearData[key] || 0) + 1
          }
        })
      }
    })
    return yearData
  }

  $: yearData = getYearData(fullCalendarYear)
  $: monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  $: fullCalendarTitle = `${fullCalendarYear} Details`

  function monthTotal(m) {
    let total = 0
    Object.keys(yearData).forEach((key) => {
      const [month] = key.split('-').map(Number)
      if (month === m) total += yearData[key]
    })
    return total
  }

  function getMonthCells(year, month) {
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < firstDay; i++) cells.push({ empty: true })
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${month}-${d}`
      const count = yearData[key] || 0
      const level = count >= 5 ? 'sm-l3' : count >= 3 ? 'sm-l2' : count > 0 ? 'sm-l1' : ''
      const dateStr = new Date(year, month, d).toLocaleDateString()
      cells.push({ empty: false, dateStr, count, level })
    }
    return cells
  }

  let activityChartEl
  let dowChartEl
  let todChartEl
  let pieChartEl

  function onWindowResize() {
    if (myChart) myChart.resize()
    if (dowChartInst) dowChartInst.resize()
    if (todChartInst) todChartInst.resize()
    if (pieChartInst) pieChartInst.resize()
  }

  onMount(async () => {
    todos = loadTodos()
    config = loadConfig()
    ensureLucide()
    createIconsSafe()

    const resetResult = checkRecurringReset(todos)
    if (resetResult.changed) {
      persistTodos(resetResult.todos)
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return
      const r = checkRecurringReset(todos)
      if (r.changed) persistTodos(r.todos)
    })

    window.addEventListener('resize', onWindowResize)

    const interval = setInterval(() => {
      dateDisplay = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    }, 60 * 1000)

    return () => {
      clearInterval(interval)
      window.removeEventListener('resize', onWindowResize)
    }
  })

  afterUpdate(() => {
    createIconsSafe()
  })

  $: if (showArchived) {
    isTaskDatePickerOpen = false
    isSubtaskDatePickerOpen = false
  }

  $: if (isActivityView) {
    renderHeatmap(currentHeatmapYear)
  }

  $: if (!isActivityView) {
    if (myChart) {
      myChart.dispose()
      myChart = null
    }
    if (dowChartInst) {
      dowChartInst.dispose()
      dowChartInst = null
    }
    if (todChartInst) {
      todChartInst.dispose()
      todChartInst = null
    }
    if (pieChartInst) {
      pieChartInst.dispose()
      pieChartInst = null
    }
  }

  $: detailTodo = currentDetailId ? todos.find((t) => t.id === currentDetailId) : null
  $: detailMetaText = (() => {
    if (!detailTodo) return ''
    let metaText = `Created ${new Date(detailTodo.id).toLocaleDateString()}`
    if (detailTodo.deadline) metaText += ` · Due ${detailTodo.deadline}`
    if (detailTodo.recurrence && detailTodo.recurrence !== 'none') metaText += ` · Repeats ${detailTodo.recurrence}`
    return metaText
  })()

  $: isReadOnlyDetail = !!detailTodo && (showArchived || detailTodo.archived)

  function taskDeadlineDisplay() {
    if (!newTaskDate) return 'Due'
    const d = isoToLocalDate(newTaskDate)
    if (!d) return 'Due'
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  function subtaskDateDisplay(deadline) {
    const parentDeadline = isISODateString(newTaskDate) ? newTaskDate : null
    const normalized = parentDeadline ? clampISODateToMax(deadline, parentDeadline) || parentDeadline : null
    if (!normalized) return ''
    const d = isoToLocalDate(normalized)
    if (!d) return ''
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  function getDeadlineBadge(todo) {
    if (!showArchived && todo.recurrence && todo.recurrence !== 'none') {
      if (todo.completed) {
        const resetLabel = { daily: 'Tomorrow', weekly: 'Next Week', workdays: 'Next Workday', monthly: 'Next Month', yearly: 'Next Year' }[todo.recurrence] || 'Next Cycle'
        return { type: 'reset', html: `✓ Resets ${resetLabel}` }
      }
      return { type: 'repeat', html: `↻ ${todo.recurrence}` }
    }
    if (todo.deadline) {
      const info = getUrgencyInfo(todo.deadline)
      const d = isoToLocalDate(todo.deadline)
      const label = d ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : info?.dateLabel || ''
      const rel = info ? info.rel : ''
      return { type: 'deadline', className: info?.pClass || '', label, rel }
    }
    if (showArchived && todo.completedAt) {
      const d = new Date(todo.completedAt)
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      return { type: 'done', recurrence: todo.recurrence, dateStr }
    }
    return null
  }

  function getSubtaskPreview(todo, expanded) {
    const subtasks = Array.isArray(todo.subtasks) ? todo.subtasks : []
    if (expanded) return null
    if (subtasks.length === 0) return null
    const subtasksSorted = sortSubtasksByUrgency(subtasks)
    const urgent = subtasksSorted.find((s) => !s.completed) || subtasksSorted[0]
    if (!urgent || !urgent.text) return null
    const info = getUrgencyInfo(urgent.deadline)
    return { text: urgent.text, pClass: info?.pClass || '', rel: info?.rel || '', dateLabel: info?.dateLabel || '' }
  }

  function getSubtaskProgress(todo) {
    const subtasks = Array.isArray(todo.subtasks) ? todo.subtasks : []
    const total = subtasks.length
    if (total === 0) return null
    const done = subtasks.filter((s) => !!s.completed).length
    const percent = Math.round((done / total) * 100)
    return { total, done, percent }
  }

  function handleTodoInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !isExpanded) {
      e.preventDefault()
      addTodo()
    }
  }

  function handleTodoInput(e) {
    if (!isExpanded) {
      const el = e.currentTarget
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }

  function titleBlur(e) {
    const nextTitle = String(e.currentTarget.innerText || '').trim() || 'Tasks'
    persistConfig({ ...config, title: nextTitle })
  }

  $: pinnedTitleHtml = `<i data-lucide=\"pin\" style=\"width:12px;\"></i> ${escapeHtml(texts.pinnedTitle)}`
</script>

<div class="background-mesh"></div>

<div class="outside-ornaments" aria-hidden="true"></div>

<div class="outside-tagline" id="outsideTagline" style:opacity={outsideTaglineOpacity}>{outsideTagline}</div>
<div class="outside-badge" id="outsideBadge" aria-hidden="true">
  <div class="outside-badge-title" id="outsideBadgeTitle">{outsideBadgeTitle}</div>
  <div class="outside-badge-sub" id="outsideBadgeSub">{outsideBadgeSub}</div>
</div>
<div class="outside-strip" id="outsideStrip" aria-hidden="true">{outsideStrip}</div>
<div class="outside-status" id="outsideStatus" aria-hidden="true"><span class="dot"></span><span id="outsideStatusText">{@html outsideStatusHtml}</span></div>

<div id="globalTooltip" class:visible={tooltipVisible} style:top={`${tooltipTop}px`} style:left={`${tooltipLeft}px`}>{@html tooltipHtml}</div>

<div class="app-card" id="appCard">
  <div class="modal-overlay" class:active={overlayActive} id="modalOverlay" on:click={closeOverlays}></div>

  <div class="detail-modal" class:open={isThemeModalOpen} id="themeModal">
    <div style="padding: 24px 30px; border-bottom: 1px solid var(--glass-border); display:flex; justify-content:space-between; align-items:center; flex-shrink: 0;">
      <h3 id="themeModalTitle" style="margin:0; font-size:18px; color:var(--text-primary); font-weight:600;">{texts.themeModalTitle}</h3>
      <button class="detail-icon-btn" on:click={closeThemePicker}><i data-lucide="x"></i></button>
    </div>
    <div class="theme-grid" id="themeGrid">
      {#each THEMES as t (t.id)}
        <button type="button" class={`theme-card ${config.theme === t.id ? 'selected' : ''}`} on:click={() => selectTheme(t.id)}>
          <div class="preview-box" style={`background:${t.bg}; color:${t.text}`}>
            <div class="mini-header" style={`background:${t.text}`}></div>
            <div class="mini-row" style={`background:${t.text}`}></div>
            <div class="mini-row short" style={`background:${t.text}`}></div>
            <div class="mini-fab" style={`background:${t.acc}`}></div>
          </div>
          {#if t.type === 'collab'}<div class="collab-badge">COLLAB</div>{/if}
          <div class="theme-info">
            <span class="theme-name">{t.name}</span>
            {#if config.theme === t.id}
              <div class="selected-icon"><i data-lucide="check"></i></div>
            {/if}
          </div>
        </button>
      {/each}
    </div>
  </div>

  <div class="detail-modal" class:open={isCalendarModalOpen} id="calendarModal">
    <div style="padding: 24px 30px; border-bottom: 1px solid var(--glass-border); display:flex; justify-content:space-between; align-items:center;">
      <div style="display:flex; align-items:center; gap:10px;">
        <button class="detail-icon-btn" on:click={() => changeFullCalendarYear(-1)}><i data-lucide="chevron-left"></i></button>
        <h3 id="fullCalTitle" style="margin:0; font-size:18px; color:var(--text-primary); font-weight:700;">{fullCalendarTitle}</h3>
        <button class="detail-icon-btn" on:click={() => changeFullCalendarYear(1)}><i data-lucide="chevron-right"></i></button>
      </div>
      <button class="detail-icon-btn" on:click={closeCalendarModal}><i data-lucide="x"></i></button>
    </div>
    <div class="detail-content">
      <div id="yearScrollContainer" class="year-scroll-container">
        {#each monthNames as monthName, m (m)}
          <div class="single-month-card">
            <div class="sm-header">{monthName} · {monthTotal(m)}</div>
            <div class="sm-grid">
              {#each getMonthCells(fullCalendarYear, m) as cell, idx (idx)}
                {#if cell.empty}
                  <div></div>
                {:else}
                  <div
                    class={`sm-cell ${cell.level}`}
                    on:mouseenter={(e) => showTooltip(e, cell.dateStr, cell.count)}
                    on:mousemove={moveTooltip}
                    on:mouseleave={hideTooltip}
                  ></div>
                {/if}
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <div class="detail-modal" class:open={isTrashModalOpen} id="trashModal" style="max-width: 600px;">
    <div style="padding: 24px 30px; border-bottom: 1px solid var(--glass-border); display:flex; justify-content:space-between; align-items:center;">
      <h3 id="trashModalTitle" style="margin:0; font-size:18px; color:var(--text-primary); font-weight:600;">{texts.trashModalTitle}</h3>
      <button class="detail-icon-btn" on:click={closeTrash}><i data-lucide="x"></i></button>
    </div>
    <div class="detail-content" id="trashList" style="padding: 20px; max-height: 30vh; overflow-y: auto;">
      {#each todos.filter((t) => t.deleted) as t (t.id)}
        <div class="trash-item">
          <div class="trash-left">
            <div class="trash-text">{t.text}</div>
            <div class="trash-meta">{new Date(t.id).toLocaleDateString()}</div>
          </div>
          <div class="trash-actions">
            <button class="icon-btn unarchive" on:click={() => restoreTodo(t.id)} title="Restore"><i data-lucide="undo-2"></i></button>
            <button class="icon-btn delete" on:click={() => hardDelete(t.id)} title="Delete"><i data-lucide="trash-2"></i></button>
          </div>
        </div>
      {/each}
    </div>
    <div class="detail-footer" style="justify-content: flex-end;">
      <button class="detail-icon-btn" style="color:var(--accent-red); width:auto; padding:0 12px; gap:6px;" on:click={emptyTrash}>
        <i data-lucide="trash-2"></i> Empty Trash
      </button>
    </div>
  </div>

  <div class="detail-modal" class:open={!!detailTodo} id="detailModal">
    {#if detailTodo}
      <div class="detail-content" id="detailContent">
        <div class="detail-text">{@html parseMarkdown(detailTodo.text)}</div>
      </div>
      <div class="detail-footer">
        <div class="detail-meta" id="detailMeta">{detailMetaText}</div>
        <div class="detail-actions" id="detailActions">
          {#if !isReadOnlyDetail}
            <button class="detail-icon-btn edit" on:click={() => openEditSheet(detailTodo.id)} title="Edit"><i data-lucide="pencil"></i></button>
            <button class="detail-icon-btn pin" on:click={() => togglePin(detailTodo.id)} title={detailTodo.pinned ? 'Unpin' : 'Pin'}><i data-lucide={detailTodo.pinned ? 'pin-off' : 'pin'}></i></button>
          {/if}
          {#if isReadOnlyDetail}
            <button class="detail-icon-btn unarchive" on:click={() => unarchiveTodo(detailTodo.id)} title="Restore"><i data-lucide="undo-2"></i></button>
          {:else}
            <button class="detail-icon-btn archive" on:click={() => toggleTodo(detailTodo.id)} title="Archive"><i data-lucide="archive"></i></button>
          {/if}
          <button class="detail-icon-btn delete" on:click={() => deleteTodo(detailTodo.id)} title="Delete"><i data-lucide="trash-2"></i></button>
          <button class="detail-icon-btn close" on:click={closeDetail} title="Close"><i data-lucide="x"></i></button>
        </div>
      </div>
    {/if}
  </div>

  <div class={`view-container ${showArchived ? 'view-archived' : ''}`} id="viewContainer">
    <div class="header">
      <div class="header-left">
        <div class="header-subtitle" id="dateDisplay">{dateDisplay}</div>
        <h1 id="appTitle" contenteditable="true" spellcheck="false" on:blur={titleBlur}>{config.title || texts.appTitle}</h1>
      </div>
      <div class="header-controls">
        <div class="search-bar">
          <i data-lucide="search" class="search-icon"></i>
          <input type="text" class="search-input" id="searchInput" placeholder={texts.searchInputPlaceholder} autocomplete="off" bind:value={searchTerm} />
        </div>
        <button class="header-btn" id="themeBtn" on:click={openThemePicker} title="Theme"><i data-lucide="palette"></i></button>
        <button class="header-btn" on:click={openTrash} title="Trash"><i data-lucide="trash"></i></button>
        <button class={`header-btn ${showArchived ? 'active' : ''}`} id="toggleArchived" on:click={toggleShowArchived} title="Archive"><i data-lucide="archive"></i></button>
        <button class={`header-btn ${isActivityView ? 'active' : ''}`} id="btnActivity" on:click={toggleActivityView} title="Activity"><i data-lucide="flame"></i></button>
      </div>
    </div>

    <div class="scroll-content" id="todoScrollArea">
      <div id="activityView" class={`activity-view ${isActivityView ? 'active' : ''}`}>
        <div class="act-header">
          <div class="act-title" id="actTitle">{texts.actTitle}</div>
          <div style="display:flex; gap:10px; align-items:center;">
            <div class="act-control-item highlight" id="totalCompletedDisplay">{heatmapTotalAll}{texts.totalCompletedSuffix}</div>
            <div class="act-control-item" style="gap:10px; padding:0 6px;">
              <button on:click={() => changeHeatmapYear(-1)} style="background:none; border:none; color:inherit; cursor:pointer; display:flex;"><i data-lucide="chevron-left" style="width:14px;"></i></button>
              <span id="heatmapYear" style="font-variant-numeric: tabular-nums;">{currentHeatmapYear}</span>
              <button on:click={() => changeHeatmapYear(1)} style="background:none; border:none; color:inherit; cursor:pointer; display:flex;"><i data-lucide="chevron-right" style="width:14px;"></i></button>
            </div>
            <button class="act-control-item" on:click={openCalendarModal} title="Full Year Calendar" style="cursor:pointer;">
              <i data-lucide="calendar" style="width:16px;"></i>
            </button>
          </div>
        </div>

        <div class="stats-grid" id="statsGrid">
          <div class="stat-card">
            <div class="stat-label">{texts.statLabelWeek}</div>
            <div class="stat-value" id="statWeek">{statWeek}</div>
            <div class="stat-sub" id="statWeekDiff">{@html statWeekDiffHtml}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">{texts.statLabelMonth}</div>
            <div class="stat-value" id="statMonth">{statMonth}</div>
            <div class="stat-sub" id="statMonthDiff">{@html statMonthDiffHtml}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">{texts.statLabelYear}</div>
            <div class="stat-value" id="statYear">{statYear}</div>
            <div class="stat-sub" id="statYearDiff">{@html statYearDiffHtml}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">{texts.statLabelRate}</div>
            <div class="stat-value" id="statRate">{statRate}</div>
            <div class="stat-sub">Lifetime</div>
          </div>
        </div>

        <div class="heatmap-container">
          <div class="heatmap-wrapper">
            <div class="heatmap-grid" id="heatmapGrid">
              {#each heatmapCells as cell, idx (idx)}
                {#if cell.empty}
                  <div class="hm-cell" style="opacity:0; pointer-events:none;"></div>
                {:else}
                  <div
                    class={`hm-cell ${cell.level}`}
                    style={cell.count === 0 ? 'background: var(--hm-bg);' : ''}
                    on:mouseenter={(e) => showTooltip(e, cell.dateKey, cell.count)}
                    on:mousemove={moveTooltip}
                    on:mouseleave={hideTooltip}
                  ></div>
                {/if}
              {/each}
            </div>
            <div class="heatmap-months">
              <span class="hm-month-label">Jan</span><span class="hm-month-label">Feb</span><span class="hm-month-label">Mar</span><span class="hm-month-label">Apr</span><span class="hm-month-label">May</span><span class="hm-month-label">Jun</span><span class="hm-month-label">Jul</span><span class="hm-month-label">Aug</span><span class="hm-month-label">Sep</span><span class="hm-month-label">Oct</span><span class="hm-month-label">Nov</span><span class="hm-month-label">Dec</span>
            </div>
          </div>
        </div>

        <div class="adv-charts-grid">
          <div class="chart-container" style="min-height: 320px; height: 320px;">
            <div class="chart-header">
              <span class="chart-title">{texts.chartTitleTrend}</span>
              <button class="chart-toggle" on:click={toggleChartType}>
                <i data-lucide={chartType === 'line' ? 'bar-chart-2' : 'activity'} id="chartIcon"></i>
                <span id="chartLabel">{chartType === 'line' ? texts.chartLabelBar : texts.chartLabelLine}</span>
              </button>
            </div>
            <div bind:this={activityChartEl} id="activityChart" style="width:100%; height:250px;"></div>
          </div>

          <div class="chart-container" style="min-height: 320px; height: 320px;">
            <div class="chart-header">
              <span class="chart-title">{texts.chartTitleDow}</span>
              <button class="chart-toggle" on:click={toggleDowChartType}>
                <i data-lucide={dowChartType === 'line' ? 'bar-chart-2' : 'activity'} id="dowChartIcon"></i>
                <span id="dowChartLabel">{dowChartType === 'line' ? texts.chartLabelBar : texts.chartLabelLine}</span>
              </button>
            </div>
            <div bind:this={dowChartEl} id="dowChart" style="width:100%; height:250px;"></div>
          </div>

          <div class="chart-container" style="min-height: 320px; height: 320px;">
            <div class="chart-header">
              <span class="chart-title">{texts.chartTitleTod}</span>
              <button class="chart-toggle" on:click={toggleTodChartType}>
                <i data-lucide={todChartType === 'line' ? 'bar-chart-2' : 'activity'} id="todChartIcon"></i>
                <span id="todChartLabel">{todChartType === 'line' ? texts.chartLabelBar : texts.chartLabelLine}</span>
              </button>
            </div>
            <div bind:this={todChartEl} id="todChart" style="width:100%; height:250px;"></div>
          </div>

          <div class="chart-container" style="min-height: 320px; height: 320px;">
            <div class="chart-header"><span class="chart-title">{texts.chartTitlePie}</span></div>
            <div bind:this={pieChartEl} id="pieChart" style="width:100%; height:250px;"></div>
          </div>
        </div>
      </div>

      <div id="listView" style={isActivityView ? 'display:none;' : 'display:block;'}>
        <div id="pinnedContainer" class={`section-container ${pinnedTasks.length > 0 ? 'active' : ''}`}>
          <div class="section-inner">
            <div class="section-title" id="pinnedTitle">{@html pinnedTitleHtml}</div>
            <div id="pinnedList">
              {#each pinnedTasks as todo (todo.id)}
                <div
                  id={`todo-${todo.id}`}
                  class={`todo-item ${todo.completed ? 'completed' : ''} ${!showArchived && todo.recurrence && todo.recurrence !== 'none' && todo.completed ? 'recurring-done' : ''} ${todo.pinned ? 'pinned' : ''} ${expandedTodoIds.has(todo.id) ? 'subtasks-expanded' : ''} ${slideOutRightIds.has(todo.id) ? 'slide-out-right' : ''} ${slideOutLeftIds.has(todo.id) ? 'slide-out-left' : ''}`}
                >
                  <div class="custom-checkbox" on:click|stopPropagation={() => toggleTodo(todo.id)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  </div>
                  <div class="todo-content" on:click={() => openDetail(todo.id)}>
                    <div class="todo-text" data-tooltip={String(todo.text || '').replace(/\"/g, '&quot;')}>{@html parseMarkdown(todo.text)}</div>
                    {#if getDeadlineBadge(todo) || getSubtaskPreview(todo, expandedTodoIds.has(todo.id)) || getSubtaskProgress(todo)}
                      <div class="todo-meta">
                        {#if getDeadlineBadge(todo)}
                          {#if getDeadlineBadge(todo).type === 'reset'}
                            <div class="deadline-badge reset-prompt">{getDeadlineBadge(todo).html}</div>
                          {:else if getDeadlineBadge(todo).type === 'repeat'}
                            <div class="deadline-badge repeat">{getDeadlineBadge(todo).html}</div>
                          {:else if getDeadlineBadge(todo).type === 'deadline'}
                            <div class={`deadline-badge ${getDeadlineBadge(todo).className || ''}`}>
                              <i data-lucide="clock" style="width:10px;"></i> {getDeadlineBadge(todo).label} · {getDeadlineBadge(todo).rel}
                            </div>
                          {:else if getDeadlineBadge(todo).type === 'done'}
                            <div class="deadline-badge" style="color:var(--text-secondary); border-color:var(--glass-border);">
                              <i data-lucide={getDeadlineBadge(todo).recurrence && getDeadlineBadge(todo).recurrence !== 'none' ? 'rotate-cw' : 'check'} style="width:10px; margin-right:4px;"></i>
                              Done {getDeadlineBadge(todo).dateStr}
                            </div>
                          {/if}
                        {/if}

                        {#if getSubtaskPreview(todo, expandedTodoIds.has(todo.id))}
                          {@const p = getSubtaskPreview(todo, expandedTodoIds.has(todo.id))}
                          <div class={`subtask-preview ${p.pClass}`}>
                            <span class="subtask-preview-dot"></span>
                            <span class="subtask-preview-text">{p.text}</span>
                            {#if p.rel}
                              <span class="subtask-preview-date">{p.rel} · {p.dateLabel}</span>
                            {/if}
                          </div>
                        {/if}

                        {#if getSubtaskProgress(todo)}
                          {@const pr = getSubtaskProgress(todo)}
                          <div class="subtask-progress">
                            <div class="subtask-progress-track"><div class="subtask-progress-fill" style={`width:${pr.percent}%`}></div></div>
                            <div class="subtask-progress-label">{pr.done}/{pr.total}</div>
                          </div>
                        {/if}
                      </div>
                    {/if}

                    {#if expandedTodoIds.has(todo.id) && Array.isArray(todo.subtasks) && todo.subtasks.length > 0}
                      <div class="subtasks-panel">
                        {#each sortSubtasksByUrgency(todo.subtasks) as s (s.id)}
                          <div class={`subtask-item ${s.completed ? 'done' : ''}`} on:click|stopPropagation={() => {}}>
                            <button class="subtask-check" disabled={showArchived || todo.archived} on:click|stopPropagation={() => toggleSubtask(todo.id, s.id)}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            </button>
                            <div class="subtask-item-text">{s.text}</div>
                            {#if getUrgencyInfo(s.deadline)}
                              {@const info = getUrgencyInfo(s.deadline)}
                              <div class={`deadline-badge ${info.pClass}`}><i data-lucide="clock" style="width:10px;"></i> {info.dateLabel} · {info.rel}</div>
                            {/if}
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </div>
                  <div class="item-actions">
                    {#if Array.isArray(todo.subtasks) && todo.subtasks.length > 0}
                      <button class="icon-btn expand" title={expandedTodoIds.has(todo.id) ? 'Collapse' : 'Expand'} on:click|stopPropagation={() => toggleTodoExpand(todo.id)}>
                        <i data-lucide={expandedTodoIds.has(todo.id) ? 'chevron-up' : 'chevron-down'}></i>
                      </button>
                    {/if}
                    {#if !(showArchived || todo.archived)}
                      <button class="icon-btn edit" on:click={() => openEditSheet(todo.id)} title="Edit"><i data-lucide="pencil"></i></button>
                      <button class="icon-btn pin" on:click={() => togglePin(todo.id)} title={todo.pinned ? 'Unpin' : 'Pin'}><i data-lucide={todo.pinned ? 'pin-off' : 'pin'}></i></button>
                      <button class="icon-btn archive" on:click={() => toggleTodo(todo.id)} title="Archive"><i data-lucide="archive"></i></button>
                    {:else}
                      <button class="icon-btn unarchive" on:click={() => unarchiveTodo(todo.id)} title="Restore"><i data-lucide="undo-2"></i></button>
                    {/if}
                    <button class="icon-btn delete" on:click={() => deleteTodo(todo.id)} title="Delete"><i data-lucide="trash-2"></i></button>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>

        <div id="todoList">
          {#each normalTasks as todo (todo.id)}
            <div
              id={`todo-${todo.id}`}
              class={`todo-item ${todo.completed ? 'completed' : ''} ${!showArchived && todo.recurrence && todo.recurrence !== 'none' && todo.completed ? 'recurring-done' : ''} ${todo.pinned ? 'pinned' : ''} ${expandedTodoIds.has(todo.id) ? 'subtasks-expanded' : ''} ${slideOutRightIds.has(todo.id) ? 'slide-out-right' : ''} ${slideOutLeftIds.has(todo.id) ? 'slide-out-left' : ''}`}
            >
              <div class="custom-checkbox" on:click|stopPropagation={() => toggleTodo(todo.id)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              <div class="todo-content" on:click={() => openDetail(todo.id)}>
                <div class="todo-text" data-tooltip={String(todo.text || '').replace(/\"/g, '&quot;')}>{@html parseMarkdown(todo.text)}</div>
                {#if getDeadlineBadge(todo) || getSubtaskPreview(todo, expandedTodoIds.has(todo.id)) || getSubtaskProgress(todo)}
                  <div class="todo-meta">
                    {#if getDeadlineBadge(todo)}
                      {#if getDeadlineBadge(todo).type === 'reset'}
                        <div class="deadline-badge reset-prompt">{getDeadlineBadge(todo).html}</div>
                      {:else if getDeadlineBadge(todo).type === 'repeat'}
                        <div class="deadline-badge repeat">{getDeadlineBadge(todo).html}</div>
                      {:else if getDeadlineBadge(todo).type === 'deadline'}
                        <div class={`deadline-badge ${getDeadlineBadge(todo).className || ''}`}>
                          <i data-lucide="clock" style="width:10px;"></i> {getDeadlineBadge(todo).label} · {getDeadlineBadge(todo).rel}
                        </div>
                      {:else if getDeadlineBadge(todo).type === 'done'}
                        <div class="deadline-badge" style="color:var(--text-secondary); border-color:var(--glass-border);">
                          <i data-lucide={getDeadlineBadge(todo).recurrence && getDeadlineBadge(todo).recurrence !== 'none' ? 'rotate-cw' : 'check'} style="width:10px; margin-right:4px;"></i>
                          Done {getDeadlineBadge(todo).dateStr}
                        </div>
                      {/if}
                    {/if}

                    {#if getSubtaskPreview(todo, expandedTodoIds.has(todo.id))}
                      {@const p = getSubtaskPreview(todo, expandedTodoIds.has(todo.id))}
                      <div class={`subtask-preview ${p.pClass}`}>
                        <span class="subtask-preview-dot"></span>
                        <span class="subtask-preview-text">{p.text}</span>
                        {#if p.rel}
                          <span class="subtask-preview-date">{p.rel} · {p.dateLabel}</span>
                        {/if}
                      </div>
                    {/if}

                    {#if getSubtaskProgress(todo)}
                      {@const pr = getSubtaskProgress(todo)}
                      <div class="subtask-progress">
                        <div class="subtask-progress-track"><div class="subtask-progress-fill" style={`width:${pr.percent}%`}></div></div>
                        <div class="subtask-progress-label">{pr.done}/{pr.total}</div>
                      </div>
                    {/if}
                  </div>
                {/if}

                {#if expandedTodoIds.has(todo.id) && Array.isArray(todo.subtasks) && todo.subtasks.length > 0}
                  <div class="subtasks-panel">
                    {#each sortSubtasksByUrgency(todo.subtasks) as s (s.id)}
                      <div class={`subtask-item ${s.completed ? 'done' : ''}`} on:click|stopPropagation={() => {}}>
                        <button class="subtask-check" disabled={showArchived || todo.archived} on:click|stopPropagation={() => toggleSubtask(todo.id, s.id)}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </button>
                        <div class="subtask-item-text">{s.text}</div>
                        {#if getUrgencyInfo(s.deadline)}
                          {@const info = getUrgencyInfo(s.deadline)}
                          <div class={`deadline-badge ${info.pClass}`}><i data-lucide="clock" style="width:10px;"></i> {info.dateLabel} · {info.rel}</div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
              <div class="item-actions">
                {#if Array.isArray(todo.subtasks) && todo.subtasks.length > 0}
                  <button class="icon-btn expand" title={expandedTodoIds.has(todo.id) ? 'Collapse' : 'Expand'} on:click|stopPropagation={() => toggleTodoExpand(todo.id)}>
                    <i data-lucide={expandedTodoIds.has(todo.id) ? 'chevron-up' : 'chevron-down'}></i>
                  </button>
                {/if}
                {#if !(showArchived || todo.archived)}
                  <button class="icon-btn edit" on:click={() => openEditSheet(todo.id)} title="Edit"><i data-lucide="pencil"></i></button>
                  <button class="icon-btn pin" on:click={() => togglePin(todo.id)} title={todo.pinned ? 'Unpin' : 'Pin'}><i data-lucide={todo.pinned ? 'pin-off' : 'pin'}></i></button>
                  <button class="icon-btn archive" on:click={() => toggleTodo(todo.id)} title="Archive"><i data-lucide="archive"></i></button>
                {:else}
                  <button class="icon-btn unarchive" on:click={() => unarchiveTodo(todo.id)} title="Restore"><i data-lucide="undo-2"></i></button>
                {/if}
                <button class="icon-btn delete" on:click={() => deleteTodo(todo.id)} title="Delete"><i data-lucide="trash-2"></i></button>
              </div>
            </div>
          {/each}
        </div>
        <div class="empty-state" id="emptyTodo" style={normalTasks.length === 0 && pinnedTasks.length === 0 ? 'display:flex;' : 'display:none;'}>
          <div class="empty-icon-wrapper"><i data-lucide="check-circle-2"></i></div>
          <p id="emptyTodoText">{showArchived ? 'No archived tasks.' : texts.emptyTodoText}</p>
        </div>
      </div>
    </div>

    <div
      class={`floating-input-container ${isActivityView || showArchived ? 'input-hidden' : ''} ${isExpanded ? 'expanded' : ''} ${isExpanded && draftSubtasks.length > 0 ? 'has-subtasks' : ''}`}
      id="inputContainer"
    >
      <div class={`glass-popup ${isTaskDatePickerOpen ? 'open' : ''}`} id="taskDatePicker">
        <div class="dp-header">
          <button class="dp-nav" on:click={() => changeTaskMonth(-1)}><i data-lucide="chevron-left" style="width:16px;"></i></button>
          <span style="font-weight:600; font-size:15px;" id="dpTitle">{pickerCurrentDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
          <button class="dp-nav" on:click={() => changeTaskMonth(1)}><i data-lucide="chevron-right" style="width:16px;"></i></button>
        </div>
        <div class="dp-day-names">
          <span class="dp-day-name">Su</span><span class="dp-day-name">Mo</span><span class="dp-day-name">Tu</span><span class="dp-day-name">We</span><span class="dp-day-name">Th</span><span class="dp-day-name">Fr</span><span class="dp-day-name">Sa</span>
        </div>
        <div class="dp-grid" id="dpGrid">
          {#each (() => {
            const y = pickerCurrentDate.getFullYear()
            const m = pickerCurrentDate.getMonth()
            const first = new Date(y, m, 1).getDay()
            const days = new Date(y, m + 1, 0).getDate()
            const today = new Date()
            const arr = []
            for (let i = 0; i < first; i++) arr.push({ empty: true })
            for (let d = 1; d <= days; d++) {
              const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
              const selected = newTaskDate ? new Date(newTaskDate) : null
              const isSelected = !!selected && selected.getFullYear() === y && selected.getMonth() === m && selected.getDate() === d
              const isToday = y === today.getFullYear() && m === today.getMonth() && d === today.getDate()
              arr.push({ empty: false, d, dateStr, isSelected, isToday })
            }
            return arr
          })() as cell, idx (idx)}
            {#if cell.empty}
              <div></div>
            {:else}
              <div
                class={`dp-cell ${cell.isSelected ? 'selected' : ''} ${cell.isToday ? 'is-today' : ''}`}
                on:click={() => setTaskDeadline(cell.dateStr)}
              >
                {cell.d}
              </div>
            {/if}
          {/each}
        </div>
      </div>

      <div class={`glass-popup ${isSubtaskDatePickerOpen ? 'open' : ''}`} id="subtaskDatePicker">
        <div class="dp-header">
          <button class="dp-nav" on:click={() => changeSubtaskMonth(-1)}><i data-lucide="chevron-left" style="width:16px;"></i></button>
          <span style="font-weight:600; font-size:15px;" id="subDpTitle">{subtaskPickerCurrentDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
          <button class="dp-nav" on:click={() => changeSubtaskMonth(1)}><i data-lucide="chevron-right" style="width:16px;"></i></button>
        </div>
        <div class="dp-day-names">
          <span class="dp-day-name">Su</span><span class="dp-day-name">Mo</span><span class="dp-day-name">Tu</span><span class="dp-day-name">We</span><span class="dp-day-name">Th</span><span class="dp-day-name">Fr</span><span class="dp-day-name">Sa</span>
        </div>
        <div class="dp-grid" id="subDpGrid">
          {#if isISODateString(newTaskDate)}
            {#each (() => {
              const parentDeadline = newTaskDate
              const selected = (() => {
                const st = (Array.isArray(draftSubtasks) ? draftSubtasks : []).find((s) => s.id === subtaskPickerTargetId)
                return clampISODateToMax(st?.deadline, parentDeadline) || parentDeadline
              })()
              const y = subtaskPickerCurrentDate.getFullYear()
              const m = subtaskPickerCurrentDate.getMonth()
              const first = new Date(y, m, 1).getDay()
              const days = new Date(y, m + 1, 0).getDate()
              const today = new Date()
              const arr = []
              for (let i = 0; i < first; i++) arr.push({ empty: true })
              for (let d = 1; d <= days; d++) {
                const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                const isDisabled = compareISODateStrings(dateStr, parentDeadline) > 0
                const sel = selected ? new Date(selected) : null
                const isSelected = !!sel && sel.getFullYear() === y && sel.getMonth() === m && sel.getDate() === d
                const isToday = y === today.getFullYear() && m === today.getMonth() && d === today.getDate()
                arr.push({ empty: false, d, dateStr, isDisabled, isSelected, isToday })
              }
              return arr
            })() as cell, idx (idx)}
              {#if cell.empty}
                <div></div>
              {:else}
                <div
                  class={`dp-cell ${cell.isDisabled ? 'disabled' : ''} ${cell.isSelected ? 'selected' : ''} ${cell.isToday ? 'is-today' : ''}`}
                  on:click={() => (!cell.isDisabled ? setSubtaskDeadline(cell.dateStr) : null)}
                >
                  {cell.d}
                </div>
              {/if}
            {/each}
          {/if}
        </div>
      </div>

      <div class="input-capsule">
        <div class="input-left-controls">
          <div class={`meta-trigger ${newTaskDate ? 'active' : ''}`} id="taskDateTrigger" on:click={toggleTaskDatePicker}>
            <i data-lucide="calendar"></i>
            <span id="taskDateDisplay">{taskDeadlineDisplay()}</span>
          </div>
          <div class={`meta-trigger ${newRecurrence !== 'none' ? 'active' : ''}`} id="taskRecurTrigger" on:click={cycleRecurrence}>
            <i data-lucide="rotate-cw"></i>
            <span id="taskRecurDisplay">{texts.recurrenceLabels?.[newRecurrence] || newRecurrence}</span>
          </div>
          <button class="expand-btn" id="expandBtn" on:click={toggleExpand}>
            <i data-lucide={isExpanded ? 'minimize-2' : 'maximize-2'}></i>
          </button>
        </div>

        <textarea
          class="text-input"
          id="todoInput"
          placeholder="New Task..."
          rows="1"
          bind:value={todoInput}
          on:keydown={handleTodoInputKeydown}
          on:input={handleTodoInput}
        ></textarea>

        <div class="recurrence-options">
          <button class={`recur-btn ${newRecurrence === 'none' ? 'active' : ''}`} id="recurNone" on:click={() => setRecurrence('none')}>{texts.recurrenceLabels.none}</button>
          <button class={`recur-btn ${newRecurrence === 'daily' ? 'active' : ''}`} id="recurDaily" on:click={() => setRecurrence('daily')}><i data-lucide="rotate-cw"></i> {texts.recurrenceLabels.daily}</button>
          <button class={`recur-btn ${newRecurrence === 'workdays' ? 'active' : ''}`} id="recurWork" on:click={() => setRecurrence('workdays')}><i data-lucide="briefcase"></i> {texts.recurrenceLabels.workdays}</button>
          <button class={`recur-btn ${newRecurrence === 'weekly' ? 'active' : ''}`} id="recurWeekly" on:click={() => setRecurrence('weekly')}><i data-lucide="calendar-days"></i> {texts.recurrenceLabels.weekly}</button>
          <button class={`recur-btn ${newRecurrence === 'monthly' ? 'active' : ''}`} id="recurMonthly" on:click={() => setRecurrence('monthly')}><i data-lucide="calendar"></i> {texts.recurrenceLabels.monthly}</button>
          <button class={`recur-btn ${newRecurrence === 'yearly' ? 'active' : ''}`} id="recurYearly" on:click={() => setRecurrence('yearly')}><i data-lucide="calendar-clock"></i> {texts.recurrenceLabels.yearly}</button>
        </div>

        <div class="markdown-toolbar">
          <button class="md-tool-btn" on:click={() => insertMarkdown('**', '**')}><i data-lucide="bold" style="width:14px;"></i></button>
          <button class="md-tool-btn" on:click={() => insertMarkdown('*', '*')}><i data-lucide="italic" style="width:14px;"></i></button>
          <button class="md-tool-btn" on:click={() => insertMarkdown('\n- ', '')}><i data-lucide="list" style="width:14px;"></i></button>
          <button class="md-tool-btn" on:click={() => insertMarkdown('## ', '')}><i data-lucide="heading" style="width:14px;"></i></button>
          <button class="md-tool-btn" on:click={() => insertMarkdown('`', '`')}><i data-lucide="code" style="width:14px;"></i></button>
          <button class="md-tool-btn" on:click={() => insertMarkdown('\n> ', '')}><i data-lucide="quote" style="width:14px;"></i></button>
        </div>

        <div class="subtasks-editor" id="subtasksEditor">
          <div class="subtasks-head">
            <div class="subtasks-title">Subtasks</div>
            <button class="subtask-add-btn" id="subtaskAddBtn" disabled={!canEditSubtasksForCurrentDraft() || draftSubtasks.length >= SUBTASK_LIMIT} on:click={addDraftSubtask}>Add</button>
          </div>
          <div class="subtasks-hint" id="subtasksHint">
            {#if !canEditSubtasksForCurrentDraft()}
              重复任务不支持子任务。
            {:else if !isISODateString(newTaskDate)}
              未设置主任务截止日期时，子任务不支持独立截止日期。
            {:else}
              最多 {SUBTASK_LIMIT} 个子任务，子任务截止日期不能晚于主任务。
            {/if}
          </div>
          <div class="subtasks-list" id="subtasksList">
            {#each draftSubtasks.slice(0, SUBTASK_LIMIT) as s (s.id)}
              <div class={`subtask-edit-row ${!isISODateString(newTaskDate) ? 'no-date' : ''}`}>
                <input
                  class="subtask-text-input"
                  value={s.text}
                  placeholder="Subtask..."
                  on:input={(e) => updateDraftSubtaskText(s.id, e.currentTarget.value)}
                  disabled={!canEditSubtasksForCurrentDraft()}
                />
                {#if isISODateString(newTaskDate)}
                  <div class={`meta-trigger subtask-date-trigger active${canEditSubtasksForCurrentDraft() ? '' : ' disabled'}`} on:click={() => openSubtaskDatePicker(s.id)}>
                    <i data-lucide="calendar"></i><span>{subtaskDateDisplay(s.deadline)}</span>
                  </div>
                {/if}
                <button class="icon-btn delete" on:click={() => removeDraftSubtask(s.id)} title="Remove" disabled={!canEditSubtasksForCurrentDraft()}><i data-lucide="x"></i></button>
              </div>
            {/each}
          </div>
        </div>

        <button class={`action-btn ${editingTaskId ? 'save-mode' : ''}`} id="actionBtn" on:click={addTodo}>
          <i data-lucide={editingTaskId ? 'check' : 'arrow-up'} style="width:24px;" id="actionIcon"></i>
        </button>
      </div>
    </div>
  </div>
</div>
