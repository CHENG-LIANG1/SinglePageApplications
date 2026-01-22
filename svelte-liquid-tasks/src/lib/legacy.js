export function mountLegacyApp() {
  if (window.__ios26_liquid_tasks_mounted) return
  window.__ios26_liquid_tasks_mounted = true
        const LUCIDE_SRC = 'https://unpkg.com/lucide@latest';
        const ECHARTS_SRC = 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js';
        let lucideLoadPromise = null;
        let echartsLoadPromise = null;
        function saveTodos() {localStorage.setItem(MASTER_KEY, JSON.stringify(todos))}

        function ensureLucide() {
            if (window.lucide && typeof window.lucide.createIcons === 'function') return Promise.resolve(window.lucide);
            if (lucideLoadPromise) return lucideLoadPromise;
            lucideLoadPromise = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = LUCIDE_SRC;
                s.async = true;
                s.onload = () => resolve(window.lucide);
                s.onerror = () => reject(new Error('Failed to load lucide'));
                document.head.appendChild(s);
            });
            return lucideLoadPromise;
        }

        function createIconsSafe() {
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons();
                return;
            }
            ensureLucide()
                .then(() => { if (window.lucide) window.lucide.createIcons(); })
                .catch(() => {});
        }

        function ensureEcharts() {
            if (window.echarts) return Promise.resolve(window.echarts);
            if (echartsLoadPromise) return echartsLoadPromise;
            echartsLoadPromise = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = ECHARTS_SRC;
                s.async = true;
                s.onload = () => resolve(window.echarts);
                s.onerror = () => reject(new Error('Failed to load ECharts'));
                document.head.appendChild(s);
            });
            return echartsLoadPromise;
        }

        ensureLucide();
        const MASTER_KEY = 'ios26_liquid_tasks_master';
        const CONFIG_KEY = 'ios26_liquid_config';
        const SUBTASK_LIMIT = 10;
        function migrateOldData() { if (!localStorage.getItem(MASTER_KEY)) { const v10 = localStorage.getItem('ios26_todos_v10'); if (v10) localStorage.setItem(MASTER_KEY, v10); } }
        migrateOldData();

        function escapeHtml(text) {
            return String(text ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        function isISODateString(v) { return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v); }

        function compareISODateStrings(a, b) {
            if (!isISODateString(a) && !isISODateString(b)) return 0;
            if (!isISODateString(a)) return 1;
            if (!isISODateString(b)) return -1;
            return a.localeCompare(b);
        }

        function clampISODateToMax(dateStr, maxDateStr) {
            if (!isISODateString(maxDateStr)) return isISODateString(dateStr) ? dateStr : null;
            if (!isISODateString(dateStr)) return maxDateStr;
            return compareISODateStrings(dateStr, maxDateStr) > 0 ? maxDateStr : dateStr;
        }

        function getUrgencyInfo(deadlineStr) {
            if (!isISODateString(deadlineStr)) return null;
            const d = new Date(deadlineStr);
            const diffDays = Math.ceil((d - new Date().setHours(0,0,0,0)) / (86400000));
            const pClass = diffDays <= 0 ? "p-critical" : (diffDays === 1 ? "p-high" : (diffDays <= 3 ? "p-high" : (diffDays <= 7 ? "p-medium" : "")));
            const rel = diffDays <= 0 ? (diffDays < 0 ? "Overdue" : "Today") : (diffDays + "d left");
            const dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            const sortKey = isFinite(diffDays) ? diffDays : 999999;
            return { diffDays, pClass, rel, dateLabel, sortKey };
        }

        function sortSubtasksByUrgency(subtasks) {
            const arr = Array.isArray(subtasks) ? subtasks.slice() : [];
            arr.sort((a, b) => {
                if (!!a.completed !== !!b.completed) return (a.completed ? 1 : 0) - (b.completed ? 1 : 0);
                const aInfo = getUrgencyInfo(a.deadline);
                const bInfo = getUrgencyInfo(b.deadline);
                const aKey = aInfo ? aInfo.sortKey : 999999;
                const bKey = bInfo ? bInfo.sortKey : 999999;
                if (aKey !== bKey) return aKey - bKey;
                if (aInfo && bInfo && a.deadline !== b.deadline) return compareISODateStrings(a.deadline, b.deadline);
                return (a.id || 0) - (b.id || 0);
            });
            return arr;
        }

        function normalizeSubtask(subtask, parentDeadline) {
            const safeId = Number.isFinite(subtask?.id) ? subtask.id : (Date.now() + Math.floor(Math.random() * 100000));
            const safeText = String(subtask?.text ?? '').trim();
            const safeCompleted = !!subtask?.completed;
            const normalizedDeadline = isISODateString(parentDeadline) ? clampISODateToMax(subtask?.deadline, parentDeadline) : null;
            return { id: safeId, text: safeText, completed: safeCompleted, deadline: normalizedDeadline };
        }

        function normalizeTodo(todo) {
            const recurrence = todo?.recurrence || 'none';
            const deadline = isISODateString(todo?.deadline) ? todo.deadline : null;
            const subtasksRaw = Array.isArray(todo?.subtasks) ? todo.subtasks : [];
            const hasRecurrence = recurrence && recurrence !== 'none';
            const subtasks = hasRecurrence ? [] : subtasksRaw.slice(0, SUBTASK_LIMIT).map(s => normalizeSubtask(s, deadline)).filter(s => s.text.length > 0);
            return { ...todo, deadline, recurrence, subtasks };
        }

        function normalizeTodos(inputTodos) {
            const arr = Array.isArray(inputTodos) ? inputTodos : [];
            return arr.map(t => normalizeTodo(t));
        }

        let todos = normalizeTodos(JSON.parse(localStorage.getItem(MASTER_KEY)) || []);
        let config = JSON.parse(localStorage.getItem(CONFIG_KEY)) || { title: 'Tasks', theme: 'ayu' };
        
        let searchTerm = ''; 
        let showArchived = false;
        let isActivityView = false;
        let chartType = 'line'; 
        let dowChartType = 'bar';
        let todChartType = 'line';
        let fullCalendarYear = new Date().getFullYear();
        let myChart = null; // ECharts instance
        let dowChartInst = null;
        let todChartInst = null;
        let pieChartInst = null;
        
        let newTaskDate = null;
        let pickerCurrentDate = new Date(); 
        let subtaskPickerCurrentDate = new Date();
        let subtaskPickerTargetId = null;
        let isExpanded = false;
        let editingTaskId = null;
        let newRecurrence = 'none';
        let currentHeatmapYear = new Date().getFullYear();
        let draftSubtasks = [];
        let expandedTodoIds = new Set();

        const THEMES = [
            { id: 'ayu', name: 'Ayu', bg:'#0b0e14', text:'#e6e1cf', acc:'#ffb454' },
            { id: 'dracula', name: 'Dracula', bg:'#20212c', text:'#f8f8f2', acc:'#bd93f9' },
            { id: 'monokai', name: 'Monokai', bg:'#272822', text:'#f8f8f2', acc:'#fd971f' },
            { id: 'onedark', name: 'One Dark', bg:'#21252b', text:'#e6e6e6', acc:'#61afef' },
            { id: 'xcode', name: 'Xcode', bg:'#18181b', text:'#ffffff', acc:'#0a84ff' },
            { id: 'curse', name: '咒', bg:'#06030b', text:'#f5f3ff', acc:'#a855f7', type: 'collab' },
            { id: 'apple', name: 'Apple', bg:'#0b0c10', text:'#f5f5f7', acc:'#0a84ff', type: 'collab' },
            { id: 'samsung', name: 'Samsung', bg:'#070a17', text:'#eef2ff', acc:'#2f6fff', type: 'collab' },
            { id: 'google', name: 'Google', bg:'#0b1016', text:'#eaf2ff', acc:'#4285f4', type: 'collab' },
            { id: 'xiaomi', name: '小米', bg:'#0b0b0b', text:'#fafafa', acc:'#ff6900', type: 'collab' },
            { id: 'angrymiao', name: 'Angry Miao', bg:'#050505', text:'#f5f5f5', acc:'#ff003c', type: 'collab' },
            { id: 'steam', name: 'Steam', bg:'#0f1b2b', text:'#e6f1ff', acc:'#66c0f4', type: 'collab' },
            { id: 'playstation', name: 'PlayStation', bg:'#001428', text:'#e9f2ff', acc:'#0070d1', type: 'collab' },
            { id: 'nintendo', name: 'Nintendo', bg:'#fff7f7', text:'#1f1f1f', acc:'#e60012', type: 'collab' },
            { id: 'xbox', name: 'Xbox', bg:'#06110b', text:'#eafff3', acc:'#107c10', type: 'collab' },
            { id: 'xiaohongshu', name: '小红书', bg:'#fff7f8', text:'#1f1f1f', acc:'#ff2442', type: 'collab' },
            { id: 'razer', name: 'Razer', bg:'#020202', text:'#eaffea', acc:'#44d62c', type: 'collab' },
            { id: 'chiikawa', name: 'Chiikawa', bg:'#fffafb', text:'#5d4037', acc:'#76c4ea', type: 'collab' },
            { id: 'hellokitty', name: 'Hello Kitty', bg:'#fff0f5', text:'#212121', acc:'#d50000', type: 'collab' },
            { id: 'christmas', name: 'Christmas', bg:'#2a1b18', text:'#fff8e1', acc:'#4caf50' },
            { id: 'madoka', name: 'Madoka', bg:'#fff1f8', text:'#880e4f', acc:'#ff4081', type: 'collab' },
            { id: 'frieren', name: 'Frieren', bg:'#f1f8e9', text:'#263238', acc:'#2e7d32' },
            { id: 'nier', name: 'Nier', bg:'#d1cfc3', text:'#3b3a36', acc:'#4f4e48', type: 'collab' },
            { id: 'nier-gray', name: 'Nier: Gray', bg:'#4f4e48', text:'#dad8c8', acc:'#dad8c8', type: 'collab' },
            { id: 'bladerunner', name: 'Blade Runner', bg:'#050505', text:'#00cecf', acc:'#ff003c', type: 'collab' },
            { id: 'sodagreen', name: 'Sodagreen', bg:'#f4f9f4', text:'#2d5a27', acc:'#4caf50', type: 'collab' },
            { id: 'bluegate', name: 'Blue Gate', bg:'#e3f2fd', text:'#1565c0', acc:'#2196f3', type: 'collab' },
            { id: 'usagi', name: 'Usagi', bg:'#fffde7', text:'#5d4037', acc:'#fdd835', type: 'collab' },
            { id: 'eason', name: 'Eason Chan', bg:'#e0e0e0', text:'#212121', acc:'#546e7a', type: 'collab' },
            { id: 'jackson', name: 'Jackson Yee', bg:'#1a0505', text:'#ffcdd2', acc:'#d32f2f', type: 'collab' },
            { id: 'eva-01', name: 'EVA Unit-01', bg:'#181024', text:'#a5eb78', acc:'#7c4dff', type: 'collab' },
            { id: 'eva-02', name: 'EVA Unit-02', bg:'#2b0505', text:'#ffccbc', acc:'#d50000', type: 'collab' },
            { id: 'darksouls', name: 'Dark Souls', bg:'#050505', text:'#e0e0e0', acc:'#ff9800', type: 'collab' },
            { id: 'bloodborne', name: 'Bloodborne', bg:'#0a0a0a', text:'#d7ccc8', acc:'#b71c1c', type: 'collab' },
            { id: 'liesofp', name: 'Lies of P', bg:'#0e0c0a', text:'#e7dfd3', acc:'#b08d57', type: 'collab' },
            { id: 'eldenring', name: 'Elden Ring', bg:'#070b08', text:'#e8e3d8', acc:'#c9b458', type: 'collab' }
        ];

        // NIER TEXT MAPPING
        const NIER_TEXT = {
            appTitle: "YoRHa Missions",
            searchInputPlaceholder: "Scan Memory...",
            emptyTodoText: "No active units detected. Glory to Mankind.",
            actTitle: "Combat Records",
            pinnedTitle: "Priority Directives",
            trashModalTitle: "Data Dump",
            themeModalTitle: "Interface Customization",
            outsideTagline: "nier / yorha\n整理你的指令。\n像机器一样精准，像人一样克制。",
            outsideTaglineOpacity: 0.26,
            totalCompletedSuffix: " Targets Neutralized",
            chartTitleTrend: "Signal Analysis",
            chartTitleDow: "Operation Cycles",
            chartTitleTod: "Engagement Hours",
            chartTitlePie: "Mission Types",
            chartLabelBar: "Bar Viz",
            chartLabelLine: "Line Viz",
            statLabelWeek: "Cycle Report",
            statLabelMonth: "Lunar Report",
            statLabelYear: "Orbit Report",
            statLabelRate: "Success Rate",
            recurrenceLabels: { 'none': 'Single', 'daily': 'Daily Cycle', 'workdays': 'Combat Days', 'weekly': 'Weekly Cycle', 'monthly': 'Lunar Cycle', 'yearly': 'Solar Cycle' }
        };

        const NIER_GRAY_TEXT = {
            appTitle: "YoRHa Missions // Gray",
            searchInputPlaceholder: "Scan Memory (Gray)…",
            emptyTodoText: "No active units detected.\nSilence is also a signal.",
            actTitle: "Gray Records",
            pinnedTitle: "Priority Directives",
            trashModalTitle: "Data Dump",
            themeModalTitle: "Interface Customization",
            outsideTagline: "nier: gray\n把噪声调低。\n把意志调高。",
            outsideTaglineOpacity: 0.26,
            totalCompletedSuffix: " Targets Neutralized",
            chartTitleTrend: "Signal Analysis",
            chartTitleDow: "Operation Cycles",
            chartTitleTod: "Engagement Hours",
            chartTitlePie: "Mission Types",
            chartLabelBar: "Bar Viz",
            chartLabelLine: "Line Viz",
            statLabelWeek: "Cycle Report",
            statLabelMonth: "Lunar Report",
            statLabelYear: "Orbit Report",
            statLabelRate: "Success Rate",
            recurrenceLabels: { 'none': 'Single', 'daily': 'Daily Cycle', 'workdays': 'Combat Days', 'weekly': 'Weekly Cycle', 'monthly': 'Lunar Cycle', 'yearly': 'Solar Cycle' }
        };

        const BLADERUNNER_TEXT = {
            appTitle: "Blade Runner",
            searchInputPlaceholder: "Voight-Kampff Test...",
            emptyTodoText: "All replicants retired.",
            actTitle: "Baseline Test",
            pinnedTitle: "Core Memories",
            trashModalTitle: "Retired Units",
            themeModalTitle: "Visual Cortex",
            outsideTagline: "blade runner / baseline\n你不是机器，但可以像机器一样执行。\n保持基线。",
            outsideTaglineOpacity: 0.26,
            totalCompletedSuffix: " Retired",
            chartTitleTrend: "System Drift",
            chartTitleDow: "Shift Cycle",
            chartTitleTod: "Active Hours",
            chartTitlePie: "Unit Class",
            chartLabelBar: "Bar Scan",
            chartLabelLine: "Line Scan",
            statLabelWeek: "Weekly Baseline",
            statLabelMonth: "Monthly Baseline",
            statLabelYear: "Yearly Baseline",
            statLabelRate: "Humanity Index",
            recurrenceLabels: { 'none': 'One-off', 'daily': 'Daily Test', 'workdays': 'Duty Cycle', 'weekly': 'Weekly Check', 'monthly': 'Monthly Check', 'yearly': 'Annual Check' }
        };

        const SODAGREEN_TEXT = {
            appTitle: "无与伦比的美丽",
            searchInputPlaceholder: "写下你的小情歌...",
            emptyTodoText: "今天也是雨过天晴。",
            actTitle: "四季回响",
            pinnedTitle: "狂热",
            trashModalTitle: "被遗忘的时光",
            themeModalTitle: "冬未了",
            outsideTagline: "苏打绿 / 无与伦比的美丽\n把今天写成一首歌。\n把每个完成当作一个和弦。",
            outsideTaglineOpacity: 0.22,
            totalCompletedSuffix: " 个音符",
            chartTitleTrend: "频率",
            chartTitleDow: "苏打周期",
            chartTitleTod: "日光倾城",
            chartTitlePie: "乐章分布",
            chartLabelBar: "查看柱状",
            chartLabelLine: "查看曲线",
            statLabelWeek: "本周旋律",
            statLabelMonth: "本月乐章",
            statLabelYear: "年度专辑",
            statLabelRate: "完成度",
            recurrenceLabels: { 'none': '单曲', 'daily': '天天唱', 'workdays': '工作日', 'weekly': '每周练', 'monthly': '每月演', 'yearly': '年度巡演' }
        };

        const BLUEGATE_TEXT = {
            appTitle: "蓝色大门",
            searchInputPlaceholder: "我叫张士豪...",
            emptyTodoText: "于是，我们都变成了大人。",
            actTitle: "青春记事",
            pinnedTitle: "秘密",
            trashModalTitle: "丢弃的信",
            themeModalTitle: "夏日色彩",
            outsideTagline: "蓝色大门 / 青春记事\n把喜欢的人放进心里。\n把该做的事放进今天。",
            outsideTaglineOpacity: 0.22,
            totalCompletedSuffix: " 件心事",
            chartTitleTrend: "成长轨迹",
            chartTitleDow: "单车日子",
            chartTitleTod: "午后时光",
            chartTitlePie: "心情分布",
            chartLabelBar: "柱状图",
            chartLabelLine: "折线图",
            statLabelWeek: "这周的我",
            statLabelMonth: "这个月",
            statLabelYear: "这一年",
            statLabelRate: "成长率",
            recurrenceLabels: { 'none': '一次', 'daily': '每天', 'workdays': '上学日', 'weekly': '每周', 'monthly': '每月', 'yearly': '每年' }
        };

        const CHIIKAWA_TEXT = {
            appTitle: "Chiikawa",
            searchInputPlaceholder: "Yaha! (Search...)",
            emptyTodoText: "Waaa... (Empty)",
            actTitle: "Collection",
            pinnedTitle: "Favorites",
            trashModalTitle: "Scary Place",
            themeModalTitle: "Dress Up",
            outsideTagline: "chiikawa\n小小的也没关系。\n做完一件，就会更勇敢一点。",
            outsideTaglineOpacity: 0.22,
            totalCompletedSuffix: " Weeded",
            chartTitleTrend: "Weeding Log",
            chartTitleDow: "Working Days",
            chartTitleTod: "Yummy Time",
            chartTitlePie: "Types",
            chartLabelBar: "Bars",
            chartLabelLine: "Lines",
            statLabelWeek: "Week",
            statLabelMonth: "Month",
            statLabelYear: "Year",
            statLabelRate: "Success",
            recurrenceLabels: { 'none': 'Once', 'daily': 'Daily', 'workdays': 'Work', 'weekly': 'Weekly', 'monthly': 'Monthly', 'yearly': 'Yearly' }
        };

        const HELLOKITTY_TEXT = {
            appTitle: "Hello Kitty",
            searchInputPlaceholder: "Find friends...",
            emptyTodoText: "Have a lovely day!",
            actTitle: "Memories",
            pinnedTitle: "Important!",
            trashModalTitle: "Recycle",
            themeModalTitle: "Style",
            outsideTagline: "hello kitty\n把今天过得可爱一点。\n把要做的事做得认真一点。",
            outsideTaglineOpacity: 0.22,
            totalCompletedSuffix: " Apples",
            chartTitleTrend: "Friendship",
            chartTitleDow: "Play Dates",
            chartTitleTod: "Tea Time",
            chartTitlePie: "Activities",
            chartLabelBar: "Bar",
            chartLabelLine: "Line",
            statLabelWeek: "Weekly Fun",
            statLabelMonth: "Monthly Fun",
            statLabelYear: "Yearly Fun",
            statLabelRate: "Happiness",
            recurrenceLabels: { 'none': 'Once', 'daily': 'Every Day', 'workdays': 'School Days', 'weekly': 'Every Week', 'monthly': 'Every Month', 'yearly': 'Every Year' }
        };

        const MADOKA_TEXT = {
            appTitle: "Magical Contract",
            searchInputPlaceholder: "Wish for...",
            emptyTodoText: "No witches found.",
            actTitle: "Entropy",
            pinnedTitle: "Soul Gems",
            trashModalTitle: "Grief Seeds",
            themeModalTitle: "Transformation",
            outsideTagline: "madoka / magical contract\n愿望写进清单。\n代价写进日程。",
            outsideTaglineOpacity: 0.24,
            totalCompletedSuffix: " Witches Defeated",
            chartTitleTrend: "Energy Levels",
            chartTitleDow: "Time Loops",
            chartTitleTod: "Witching Hour",
            chartTitlePie: "Contracts",
            chartLabelBar: "Bars",
            chartLabelLine: "Lines",
            statLabelWeek: "This Timeline",
            statLabelMonth: "Month Cycle",
            statLabelYear: "Year Cycle",
            statLabelRate: "Hope Ratio",
            recurrenceLabels: { 'none': 'One Wish', 'daily': 'Daily Hunt', 'workdays': 'School Days', 'weekly': 'Weekly Hunt', 'monthly': 'Walpurgisnacht', 'yearly': 'Yearly' }
        };

        const USAGI_TEXT = {
            appTitle: "Usagi",
            searchInputPlaceholder: "Ura! Yaha! (Search...)",
            emptyTodoText: "Pulya! (Empty)",
            actTitle: "Food Log",
            pinnedTitle: "Treasure",
            trashModalTitle: "Recycle Bin",
            themeModalTitle: "Outfits",
            outsideTagline: "usagi\n先吃饱，再开干。\n把任务当作零食，一口一口吃完。",
            outsideTaglineOpacity: 0.22,
            totalCompletedSuffix: " Yummy Things",
            chartTitleTrend: "Eating Habits",
            chartTitleDow: "Party Days",
            chartTitleTod: "Snack Time",
            chartTitlePie: "Food Types",
            chartLabelBar: "Bars",
            chartLabelLine: "Lines",
            statLabelWeek: "Weekly Snacks",
            statLabelMonth: "Monthly Snacks",
            statLabelYear: "Yearly Snacks",
            statLabelRate: "Satisfaction",
            recurrenceLabels: { 'none': 'Once', 'daily': 'Daily Feast', 'workdays': 'Work', 'weekly': 'Weekly Feast', 'monthly': 'Monthly Feast', 'yearly': 'Yearly Feast' }
        };

        const EASON_TEXT = {
            appTitle: "Eason Chan",
            searchInputPlaceholder: "想听什么歌...",
            emptyTodoText: "明年今日，未见你一年。",
            actTitle: "H3M",
            pinnedTitle: "The Key",
            trashModalTitle: "Trash",
            themeModalTitle: "DUO",
            outsideTagline: "Eason / K歌之王\n把情绪写成任务。\n把任务唱成完成。",
            outsideTaglineOpacity: 0.22,
            totalCompletedSuffix: " 首金曲",
            chartTitleTrend: "K歌之王",
            chartTitleDow: "七百年后",
            chartTitleTod: "夕阳无限好",
            chartTitlePie: "浮夸",
            chartLabelBar: "柱状",
            chartLabelLine: "曲线",
            statLabelWeek: "本周精选",
            statLabelMonth: "本月大碟",
            statLabelYear: "年度之歌",
            statLabelRate: "传唱度",
            recurrenceLabels: { 'none': '单曲循环', 'daily': '日日听', 'workdays': '通勤听', 'weekly': '每周榜单', 'monthly': '月度回顾', 'yearly': '年度总结' }
        };

        const JACKSON_TEXT = {
            appTitle: "Jackson Yee",
            searchInputPlaceholder: "寻找千纸鹤...",
            emptyTodoText: "你保护世界，我保护你。",
            actTitle: "少年的你",
            pinnedTitle: "红海",
            trashModalTitle: "粉碎",
            themeModalTitle: "封闭货车",
            outsideTagline: "Jackson / 少年的你\n把热爱放进日程。\n把努力写进今天。",
            outsideTaglineOpacity: 0.22,
            totalCompletedSuffix: " 朵小红花",
            chartTitleTrend: "成长记录",
            chartTitleDow: "千禧日程",
            chartTitleTod: "冷静时刻",
            chartTitlePie: "多面千玺",
            chartLabelBar: "柱状",
            chartLabelLine: "曲线",
            statLabelWeek: "本周行程",
            statLabelMonth: "本月通告",
            statLabelYear: "年度作品",
            statLabelRate: "完美率",
            recurrenceLabels: { 'none': '一次', 'daily': '每日打卡', 'workdays': '工作行程', 'weekly': '周记', 'monthly': '月结', 'yearly': '年鉴' }
        };

        const EVA01_TEXT = {
            appTitle: "NERV HQ",
            searchInputPlaceholder: "Pattern Blue? (Search...)",
            emptyTodoText: "All Angels Eliminated.",
            actTitle: "Synchronization Graph",
            pinnedTitle: "Central Dogma",
            trashModalTitle: "GeoFront Disposal",
            themeModalTitle: "Magi System",
            outsideTagline: "eva-01 / nerv\n同步率不是借口。\n执行，直到完成。",
            outsideTaglineOpacity: 0.26,
            totalCompletedSuffix: " Angels Defeated",
            chartTitleTrend: "Sync Ratio",
            chartTitleDow: "Attack Cycle",
            chartTitleTod: "Active Time Limit",
            chartTitlePie: "Target Analysis",
            chartLabelBar: "Bar",
            chartLabelLine: "Line",
            statLabelWeek: "Weekly Sync",
            statLabelMonth: "Monthly Sync",
            statLabelYear: "Yearly Sync",
            statLabelRate: "Sync Rate",
            recurrenceLabels: { 'none': 'Single Sortie', 'daily': 'Daily Training', 'workdays': 'Duty Shift', 'weekly': 'Weekly Maint', 'monthly': 'Monthly Eval', 'yearly': 'Annual Review' }
        };

        const EVA02_TEXT = {
            appTitle: "Unit-02",
            searchInputPlaceholder: "Anta Baka? (Search...)",
            emptyTodoText: "I'm the best!",
            actTitle: "Combat Data",
            pinnedTitle: "My Stuff",
            trashModalTitle: "Useless Junk",
            themeModalTitle: "Plugsuit Mode",
            outsideTagline: "eva-02 / unit\n别磨叽。\n把今天打穿。",
            outsideTaglineOpacity: 0.28,
            totalCompletedSuffix: " Kills",
            chartTitleTrend: "Performance",
            chartTitleDow: "Sortie Schedule",
            chartTitleTod: "Prime Time",
            chartTitlePie: "Kill Stats",
            chartLabelBar: "Bar",
            chartLabelLine: "Line",
            statLabelWeek: "Weekly Score",
            statLabelMonth: "Monthly Score",
            statLabelYear: "Yearly Score",
            statLabelRate: "Ace Ratio",
            recurrenceLabels: { 'none': 'One-off', 'daily': 'Daily', 'workdays': 'School', 'weekly': 'Weekly', 'monthly': 'Monthly', 'yearly': 'Yearly' }
        };

        const DARKSOULS_TEXT = {
            appTitle: "Dark Souls",
            searchInputPlaceholder: "Seek Souls...",
            emptyTodoText: "Victory Achieved.",
            actTitle: "Bonfire Level",
            pinnedTitle: "Covenants",
            trashModalTitle: "Abyss",
            themeModalTitle: "Attunement",
            outsideTagline: "dark souls\n不要熄火。\n一次次复活，一次次完成。",
            outsideTaglineOpacity: 0.28,
            totalCompletedSuffix: " Lords Slain",
            chartTitleTrend: "Soul Memory",
            chartTitleDow: "Cycle",
            chartTitleTod: "Time is Convoluted",
            chartTitlePie: "Build Stats",
            chartLabelBar: "Bars",
            chartLabelLine: "Lines",
            statLabelWeek: "Weekly Souls",
            statLabelMonth: "Monthly Souls",
            statLabelYear: "Yearly Souls",
            statLabelRate: "Survival Rate",
            recurrenceLabels: { 'none': 'Once', 'daily': 'Daily Death', 'workdays': 'Grind', 'weekly': 'Weekly Boss', 'monthly': 'New Game+', 'yearly': 'Age of Fire' }
        };

        const BLOODBORNE_TEXT = {
            appTitle: "Bloodborne",
            searchInputPlaceholder: "Seek Paleblood...",
            emptyTodoText: "Nightmare Slain.",
            actTitle: "Insight",
            pinnedTitle: "Caryll Runes",
            trashModalTitle: "Hunter's Nightmare",
            themeModalTitle: "Messengers",
            outsideTagline: "bloodborne\n别被梦魇拖走。\n完成一件，清醒一分。",
            outsideTaglineOpacity: 0.28,
            totalCompletedSuffix: " Prey Slaughtered",
            chartTitleTrend: "Blood Echoes",
            chartTitleDow: "Hunt Nights",
            chartTitleTod: "Moon Phase",
            chartTitlePie: "Trick Weapons",
            chartLabelBar: "Bars",
            chartLabelLine: "Lines",
            statLabelWeek: "Weekly Hunt",
            statLabelMonth: "Monthly Hunt",
            statLabelYear: "Yearly Hunt",
            statLabelRate: "Beasthood",
            recurrenceLabels: { 'none': 'One Hunt', 'daily': 'Nightly Hunt', 'workdays': 'Patrol', 'weekly': 'Weekly Ritual', 'monthly': 'Full Moon', 'yearly': 'Great One' }
        };

        const LIESOFPI_TEXT = {
            appTitle: "Lies of P",
            searchInputPlaceholder: "Search for Truth...",
            emptyTodoText: "Strings cut. Silence remains.",
            actTitle: "Stargazer Log",
            pinnedTitle: "Geppetto's Orders",
            trashModalTitle: "Discarded Parts",
            themeModalTitle: "Workshop",
            outsideTagline: "lies of p\n把谎言拆成步骤。\n把真相做成结果。",
            outsideTaglineOpacity: 0.26,
            totalCompletedSuffix: " Puppets Defeated",
            chartTitleTrend: "Ergo Intake",
            chartTitleDow: "Patrol Cycle",
            chartTitleTod: "Curfew Hours",
            chartTitlePie: "Weapons",
            chartLabelBar: "Bars",
            chartLabelLine: "Lines",
            statLabelWeek: "This Week",
            statLabelMonth: "This Month",
            statLabelYear: "This Year",
            statLabelRate: "Completion Rate",
            recurrenceLabels: { 'none': 'Once', 'daily': 'Daily', 'workdays': 'Workdays', 'weekly': 'Weekly', 'monthly': 'Monthly', 'yearly': 'Yearly' }
        };

        const ELDENRING_TEXT = {
            appTitle: "Elden Ring",
            searchInputPlaceholder: "Seek Grace...",
            emptyTodoText: "All is calm at the Site of Grace.",
            actTitle: "Grace Map",
            pinnedTitle: "Great Runes",
            trashModalTitle: "Tarnished Remains",
            themeModalTitle: "Roundtable Hold",
            outsideTagline: "Between the fog and the grace,\nwrite one more step.\nRest, then proceed.",
            outsideTaglineOpacity: 0.26,
            totalCompletedSuffix: " Demigods Felled",
            chartTitleTrend: "Runes Gained",
            chartTitleDow: "Journey",
            chartTitleTod: "Nightfall",
            chartTitlePie: "Builds",
            chartLabelBar: "Bars",
            chartLabelLine: "Lines",
            statLabelWeek: "This Week",
            statLabelMonth: "This Month",
            statLabelYear: "This Year",
            statLabelRate: "Completion Rate",
            recurrenceLabels: { 'none': 'Once', 'daily': 'Daily', 'workdays': 'Workdays', 'weekly': 'Weekly', 'monthly': 'Monthly', 'yearly': 'Yearly' }
        };

        const AYU_TEXT = {
            appTitle: "Ayu Night Shift",
            searchInputPlaceholder: "Search tasks, notes, and signals...",
            emptyTodoText: "Quiet night. No pending tickets.\nShip something small anyway.",
            actTitle: "Night Ops",
            pinnedTitle: "Priority",
            trashModalTitle: "Discarded",
            themeModalTitle: "Appearance",
            outsideTagline: "ayu / night shift\nlow noise, high focus.\nmake it happen.",
            outsideTaglineOpacity: 0.26,
            totalCompletedSuffix: " Completed",
            chartTitleTrend: "Monthly Trend",
            chartTitleDow: "Day of Week",
            chartTitleTod: "Productivity Hours",
            chartTitlePie: "Task Distribution",
            chartLabelBar: "Switch to Bar",
            chartLabelLine: "Switch to Line",
            statLabelWeek: "This Week",
            statLabelMonth: "This Month",
            statLabelYear: "This Year",
            statLabelRate: "Completion Rate",
            recurrenceLabels: { 'none': 'Repeat', 'daily': 'Daily', 'workdays': 'Workdays', 'weekly': 'Weekly', 'monthly': 'Monthly', 'yearly': 'Yearly' }
        };

        const DRACULA_TEXT = {
            appTitle: "Dracula Ledger",
            searchInputPlaceholder: "Search… (keep it quiet)",
            emptyTodoText: "No debts tonight.\nThe castle is silent.",
            actTitle: "Midnight Report",
            pinnedTitle: "Blood Oath",
            trashModalTitle: "Ashes",
            themeModalTitle: "Dark Ritual",
            outsideTagline: "dracula / midnight ledger\none bite at a time.\nfinish before sunrise.",
            outsideTaglineOpacity: 0.28,
            totalCompletedSuffix: " Completed",
            chartTitleTrend: "Monthly Trend",
            chartTitleDow: "Day of Week",
            chartTitleTod: "Productivity Hours",
            chartTitlePie: "Task Distribution",
            chartLabelBar: "Switch to Bar",
            chartLabelLine: "Switch to Line",
            statLabelWeek: "This Week",
            statLabelMonth: "This Month",
            statLabelYear: "This Year",
            statLabelRate: "Completion Rate",
            recurrenceLabels: { 'none': 'Repeat', 'daily': 'Nightly', 'workdays': 'Workdays', 'weekly': 'Weekly', 'monthly': 'Monthly', 'yearly': 'Yearly' }
        };

        const MONOKAI_TEXT = {
            appTitle: "Monokai Neon",
            searchInputPlaceholder: "Find a task. Color it. Ship it.",
            emptyTodoText: "No lines on stage.\nAdd a riff and go.",
            actTitle: "Signal Board",
            pinnedTitle: "Highlights",
            trashModalTitle: "Offcuts",
            themeModalTitle: "Palette",
            outsideTagline: "monokai / neon console\nsharp contrast, clean moves.\nkeep the flow.",
            outsideTaglineOpacity: 0.26,
            totalCompletedSuffix: " Completed",
            chartTitleTrend: "Monthly Trend",
            chartTitleDow: "Day of Week",
            chartTitleTod: "Productivity Hours",
            chartTitlePie: "Task Distribution",
            chartLabelBar: "Switch to Bar",
            chartLabelLine: "Switch to Line",
            statLabelWeek: "This Week",
            statLabelMonth: "This Month",
            statLabelYear: "This Year",
            statLabelRate: "Completion Rate",
            recurrenceLabels: { 'none': 'Repeat', 'daily': 'Daily', 'workdays': 'Workdays', 'weekly': 'Weekly', 'monthly': 'Monthly', 'yearly': 'Yearly' }
        };

        const ONEDARK_TEXT = {
            appTitle: "One Dark Ops",
            searchInputPlaceholder: "Search tasks… (fast, precise)",
            emptyTodoText: "No open incidents.\nStay sharp anyway.",
            actTitle: "Ops Dashboard",
            pinnedTitle: "Critical",
            trashModalTitle: "Archived Debris",
            themeModalTitle: "Interface",
            outsideTagline: "one dark / ops board\nreduce noise.\nincrease throughput.",
            outsideTaglineOpacity: 0.26,
            totalCompletedSuffix: " Completed",
            chartTitleTrend: "Monthly Trend",
            chartTitleDow: "Day of Week",
            chartTitleTod: "Productivity Hours",
            chartTitlePie: "Task Distribution",
            chartLabelBar: "Switch to Bar",
            chartLabelLine: "Switch to Line",
            statLabelWeek: "This Week",
            statLabelMonth: "This Month",
            statLabelYear: "This Year",
            statLabelRate: "Completion Rate",
            recurrenceLabels: { 'none': 'Repeat', 'daily': 'Daily', 'workdays': 'Workdays', 'weekly': 'Weekly', 'monthly': 'Monthly', 'yearly': 'Yearly' }
        };

        const XCODE_TEXT = {
            appTitle: "Xcode Build Board",
            searchInputPlaceholder: "Search targets, tasks, and fixes…",
            emptyTodoText: "Build is green.\nKeep it that way.",
            actTitle: "Build Metrics",
            pinnedTitle: "Release Blockers",
            trashModalTitle: "Clean Build Folder",
            themeModalTitle: "Developer Mode",
            outsideTagline: "xcode / build board\nsmall commits.\nfast feedback.",
            outsideTaglineOpacity: 0.26,
            totalCompletedSuffix: " Done",
            chartTitleTrend: "Build Trend",
            chartTitleDow: "Cycle",
            chartTitleTod: "Focus Hours",
            chartTitlePie: "Work Types",
            chartLabelBar: "Switch to Bar",
            chartLabelLine: "Switch to Line",
            statLabelWeek: "This Week",
            statLabelMonth: "This Month",
            statLabelYear: "This Year",
            statLabelRate: "Pass Rate",
            recurrenceLabels: { 'none': 'Repeat', 'daily': 'Daily', 'workdays': 'Workdays', 'weekly': 'Weekly', 'monthly': 'Monthly', 'yearly': 'Yearly' }
        };

        const CHRISTMAS_TEXT = {
            appTitle: "圣诞清单",
            searchInputPlaceholder: "搜一搜：礼物 / 计划 / 祝福…",
            emptyTodoText: "铃铛停在风里。\n今天的心愿都已点亮。",
            actTitle: "节日仪表盘",
            pinnedTitle: "最想要的",
            trashModalTitle: "落在雪里的事",
            themeModalTitle: "节日装扮",
            outsideTagline: "christmas / wish list\n点亮一件事。\n再点亮一件事。",
            outsideTaglineOpacity: 0.26,
            totalCompletedSuffix: " 颗星",
            chartTitleTrend: "心愿曲线",
            chartTitleDow: "节日节奏",
            chartTitleTod: "温暖时段",
            chartTitlePie: "心愿类型",
            chartLabelBar: "柱状图",
            chartLabelLine: "折线图",
            statLabelWeek: "本周",
            statLabelMonth: "本月",
            statLabelYear: "今年",
            statLabelRate: "完成率",
            recurrenceLabels: { 'none': '一次', 'daily': '每天', 'workdays': '工作日', 'weekly': '每周', 'monthly': '每月', 'yearly': '每年' }
        };

        const FRIEREN_TEXT = {
            appTitle: "旅途手记",
            searchInputPlaceholder: "记录：下一步要做的事…",
            emptyTodoText: "行囊很轻。\n但旅途还很长。",
            actTitle: "旅程回顾",
            pinnedTitle: "重要的约定",
            trashModalTitle: "被风带走的纸条",
            themeModalTitle: "旅装",
            outsideTagline: "frieren / journey notes\n把时间留给重要的人。\n把任务留给今天。",
            outsideTaglineOpacity: 0.24,
            totalCompletedSuffix: " 次完成",
            chartTitleTrend: "步伐",
            chartTitleDow: "旅程节律",
            chartTitleTod: "专注时刻",
            chartTitlePie: "事项分布",
            chartLabelBar: "柱状图",
            chartLabelLine: "折线图",
            statLabelWeek: "本周",
            statLabelMonth: "本月",
            statLabelYear: "今年",
            statLabelRate: "完成率",
            recurrenceLabels: { 'none': '一次', 'daily': '每天', 'workdays': '工作日', 'weekly': '每周', 'monthly': '每月', 'yearly': '每年' }
        };

        const CURSE_TEXT = {
            appTitle: "咒 · 卷轴",
            searchInputPlaceholder: "检索：咒印 / 线索 / 目标…",
            emptyTodoText: "符纹安静。\n今日无事可咒。",
            actTitle: "禁术记录",
            pinnedTitle: "禁咒",
            trashModalTitle: "封印",
            themeModalTitle: "结界",
            outsideTagline: "咒 / curse\n把恐惧写成步骤。\n把步骤完成。",
            outsideTaglineOpacity: 0.30,
            totalCompletedSuffix: " 次镇压",
            chartTitleTrend: "咒力波形",
            chartTitleDow: "轮回日",
            chartTitleTod: "夜行时刻",
            chartTitlePie: "术式分布",
            chartLabelBar: "柱状",
            chartLabelLine: "曲线",
            statLabelWeek: "本周咒印",
            statLabelMonth: "本月术式",
            statLabelYear: "年度封印",
            statLabelRate: "净化率",
            recurrenceLabels: { 'none': '一次', 'daily': '每日结界', 'workdays': '工作日', 'weekly': '每周镇压', 'monthly': '每月祭仪', 'yearly': '年祭' }
        };

        const APPLE_TEXT = {
            appTitle: "Cupertino Focus",
            searchInputPlaceholder: "Spotlight：搜索任务与想法…",
            emptyTodoText: "Everything is quiet.\nShip something delightful.",
            actTitle: "Focus Summary",
            pinnedTitle: "Today",
            trashModalTitle: "Recently Deleted",
            themeModalTitle: "Appearance",
            outsideTagline: "apple / cupertino focus\n细节要像玻璃一样干净。\n体验要像呼吸一样自然。",
            outsideTaglineOpacity: 0.24,
            totalCompletedSuffix: " Done",
            chartTitleTrend: "Momentum",
            chartTitleDow: "Weekly Rhythm",
            chartTitleTod: "Focus Hours",
            chartTitlePie: "Distribution",
            chartLabelBar: "Switch to Bar",
            chartLabelLine: "Switch to Line",
            statLabelWeek: "This Week",
            statLabelMonth: "This Month",
            statLabelYear: "This Year",
            statLabelRate: "Completion Rate",
            recurrenceLabels: { 'none': 'Repeat', 'daily': 'Daily', 'workdays': 'Workdays', 'weekly': 'Weekly', 'monthly': 'Monthly', 'yearly': 'Yearly' }
        };

        const SAMSUNG_TEXT = {
            appTitle: "Galaxy Planner",
            searchInputPlaceholder: "搜索：日程 / 目标 / 想法…",
            emptyTodoText: "No pending missions.\nTime to explore the next.",
            actTitle: "Galaxy Insights",
            pinnedTitle: "Starred",
            trashModalTitle: "Recycle Bin",
            themeModalTitle: "One UI",
            outsideTagline: "samsung / galaxy planner\n更远的屏幕，更近的效率。\n把今天排成一条光轨。",
            outsideTaglineOpacity: 0.26,
            totalCompletedSuffix: " Done",
            chartTitleTrend: "Monthly Trend",
            chartTitleDow: "Weekly Cycle",
            chartTitleTod: "Peak Hours",
            chartTitlePie: "Task Types",
            chartLabelBar: "Switch to Bar",
            chartLabelLine: "Switch to Line",
            statLabelWeek: "This Week",
            statLabelMonth: "This Month",
            statLabelYear: "This Year",
            statLabelRate: "Completion Rate",
            recurrenceLabels: { 'none': 'Repeat', 'daily': 'Daily', 'workdays': 'Workdays', 'weekly': 'Weekly', 'monthly': 'Monthly', 'yearly': 'Yearly' }
        };

        const GOOGLE_TEXT = {
            appTitle: "Workspace Tasks",
            searchInputPlaceholder: "Search: docs, tasks, notes…",
            emptyTodoText: "Inbox zero.\nNow do the real work.",
            actTitle: "Insights",
            pinnedTitle: "Starred",
            trashModalTitle: "Bin",
            themeModalTitle: "Workspace",
            outsideTagline: "google / workspace\n把复杂拆成可搜索的片段。\n把片段连成路径。",
            outsideTaglineOpacity: 0.26,
            totalCompletedSuffix: " Completed",
            chartTitleTrend: "Monthly Trend",
            chartTitleDow: "Day of Week",
            chartTitleTod: "Productivity Hours",
            chartTitlePie: "Task Distribution",
            chartLabelBar: "Switch to Bar",
            chartLabelLine: "Switch to Line",
            statLabelWeek: "This Week",
            statLabelMonth: "This Month",
            statLabelYear: "This Year",
            statLabelRate: "Completion Rate",
            recurrenceLabels: { 'none': 'Repeat', 'daily': 'Daily', 'workdays': 'Workdays', 'weekly': 'Weekly', 'monthly': 'Monthly', 'yearly': 'Yearly' }
        };

        const XIAOMI_TEXT = {
            appTitle: "小米 · 待办",
            searchInputPlaceholder: "搜索：计划 / 清单 / 灵感…",
            emptyTodoText: "今日清单已清空。\n明天继续，别太拼。",
            actTitle: "效率面板",
            pinnedTitle: "置顶",
            trashModalTitle: "回收站",
            themeModalTitle: "个性化",
            outsideTagline: "小米 / mi todo\n快一点，再快一点。\n把每一步都做成习惯。",
            outsideTaglineOpacity: 0.26,
            totalCompletedSuffix: " 件完成",
            chartTitleTrend: "趋势",
            chartTitleDow: "周节奏",
            chartTitleTod: "高效时段",
            chartTitlePie: "类型分布",
            chartLabelBar: "柱状图",
            chartLabelLine: "折线图",
            statLabelWeek: "本周",
            statLabelMonth: "本月",
            statLabelYear: "今年",
            statLabelRate: "完成率",
            recurrenceLabels: { 'none': '重复', 'daily': '每天', 'workdays': '工作日', 'weekly': '每周', 'monthly': '每月', 'yearly': '每年' }
        };

        const ANGRYMIAO_TEXT = {
            appTitle: "Angry Miao Lab",
            searchInputPlaceholder: "Search… (sharp & fast)",
            emptyTodoText: "Nothing to cut.\nTime to design the next.",
            actTitle: "Lab Telemetry",
            pinnedTitle: "Hotkeys",
            trashModalTitle: "Scrap Bin",
            themeModalTitle: "Lab Skin",
            outsideTagline: "angry miao / lab\n机械感要锋利。\n手感要像刀一样准。",
            outsideTaglineOpacity: 0.28,
            totalCompletedSuffix: " Done",
            chartTitleTrend: "Throughput",
            chartTitleDow: "Cycle",
            chartTitleTod: "Rush Hours",
            chartTitlePie: "Loadout",
            chartLabelBar: "Switch to Bar",
            chartLabelLine: "Switch to Line",
            statLabelWeek: "This Week",
            statLabelMonth: "This Month",
            statLabelYear: "This Year",
            statLabelRate: "Win Rate",
            recurrenceLabels: { 'none': 'Repeat', 'daily': 'Daily', 'workdays': 'Workdays', 'weekly': 'Weekly', 'monthly': 'Monthly', 'yearly': 'Yearly' }
        };

        const STEAM_TEXT = {
            appTitle: "Steam Library",
            searchInputPlaceholder: "Search quests, backlog, achievements…",
            emptyTodoText: "Backlog cleared.\nAchievement unlocked: Calm.",
            actTitle: "Playtime Stats",
            pinnedTitle: "Featured",
            trashModalTitle: "Uninstalled",
            themeModalTitle: "Library Skin",
            outsideTagline: "steam / library\n把 backlog 变成进度条。\n把进度条推到满格。",
            outsideTaglineOpacity: 0.26,
            totalCompletedSuffix: " Achievements",
            chartTitleTrend: "Monthly Trend",
            chartTitleDow: "Weekly Cycle",
            chartTitleTod: "Peak Hours",
            chartTitlePie: "Genres",
            chartLabelBar: "Switch to Bar",
            chartLabelLine: "Switch to Line",
            statLabelWeek: "This Week",
            statLabelMonth: "This Month",
            statLabelYear: "This Year",
            statLabelRate: "Completion Rate",
            recurrenceLabels: { 'none': 'Repeat', 'daily': 'Daily', 'workdays': 'Workdays', 'weekly': 'Weekly', 'monthly': 'Monthly', 'yearly': 'Yearly' }
        };

        const PLAYSTATION_TEXT = {
            appTitle: "PlayStation Trophy List",
            searchInputPlaceholder: "Search: quests / trophies / backlog…",
            emptyTodoText: "No quests in the log.\nStart a new run.",
            actTitle: "Trophy Room",
            pinnedTitle: "Featured",
            trashModalTitle: "Uninstalled",
            themeModalTitle: "Console Skin",
            outsideTagline: "playstation\n把任务当作奖杯列表。\n一个一个拿下。",
            outsideTaglineOpacity: 0.26,
            totalCompletedSuffix: " Trophies",
            chartTitleTrend: "Progress Curve",
            chartTitleDow: "Weekly Sessions",
            chartTitleTod: "Peak Playtime",
            chartTitlePie: "Quest Types",
            chartLabelBar: "Switch to Bar",
            chartLabelLine: "Switch to Line",
            statLabelWeek: "This Week",
            statLabelMonth: "This Month",
            statLabelYear: "This Year",
            statLabelRate: "Completion Rate",
            recurrenceLabels: { 'none': 'Repeat', 'daily': 'Daily', 'workdays': 'Workdays', 'weekly': 'Weekly', 'monthly': 'Monthly', 'yearly': 'Yearly' }
        };

        const NINTENDO_TEXT = {
            appTitle: "Nintendo Checklist",
            searchInputPlaceholder: "搜：关卡 / 收集 / 任务…",
            emptyTodoText: "背包里空空的。\n出去捡一点快乐。",
            actTitle: "冒险记录",
            pinnedTitle: "必拿道具",
            trashModalTitle: "丢在路边的物品",
            themeModalTitle: "主机皮肤",
            outsideTagline: "nintendo\n把世界当作关卡。\n把完成当作通关音效。",
            outsideTaglineOpacity: 0.22,
            totalCompletedSuffix: " 个收集",
            chartTitleTrend: "通关曲线",
            chartTitleDow: "每周冒险",
            chartTitleTod: "黄金时段",
            chartTitlePie: "关卡类型",
            chartLabelBar: "柱状图",
            chartLabelLine: "折线图",
            statLabelWeek: "本周",
            statLabelMonth: "本月",
            statLabelYear: "今年",
            statLabelRate: "完成率",
            recurrenceLabels: { 'none': '重复', 'daily': '每天', 'workdays': '工作日', 'weekly': '每周', 'monthly': '每月', 'yearly': '每年' }
        };

        const XBOX_TEXT = {
            appTitle: "Xbox Achievements",
            searchInputPlaceholder: "Search: missions / achievements…",
            emptyTodoText: "No missions queued.\nReady when you are.",
            actTitle: "Game Stats",
            pinnedTitle: "Quick Resume",
            trashModalTitle: "Recycle Bin",
            themeModalTitle: "Console Skin",
            outsideTagline: "xbox\n把任务排成队列。\n把队列清空。",
            outsideTaglineOpacity: 0.26,
            totalCompletedSuffix: " Achievements",
            chartTitleTrend: "Monthly Trend",
            chartTitleDow: "Weekly Cycle",
            chartTitleTod: "Peak Hours",
            chartTitlePie: "Work Types",
            chartLabelBar: "Switch to Bar",
            chartLabelLine: "Switch to Line",
            statLabelWeek: "This Week",
            statLabelMonth: "This Month",
            statLabelYear: "This Year",
            statLabelRate: "Completion Rate",
            recurrenceLabels: { 'none': 'Repeat', 'daily': 'Daily', 'workdays': 'Workdays', 'weekly': 'Weekly', 'monthly': 'Monthly', 'yearly': 'Yearly' }
        };

        const XIAOHONGSHU_TEXT = {
            appTitle: "小红书 · 计划本",
            searchInputPlaceholder: "搜：笔记 / 灵感 / 清单…",
            emptyTodoText: "今天的灵感已经写完。\n去生活里再捡一点。",
            actTitle: "笔记仪表盘",
            pinnedTitle: "置顶笔记",
            trashModalTitle: "草稿箱",
            themeModalTitle: "封面风格",
            outsideTagline: "小红书\n把生活写成笔记。\n把计划做成作品。",
            outsideTaglineOpacity: 0.22,
            totalCompletedSuffix: " 条笔记",
            chartTitleTrend: "发布趋势",
            chartTitleDow: "每周节奏",
            chartTitleTod: "灵感时段",
            chartTitlePie: "内容类型",
            chartLabelBar: "柱状图",
            chartLabelLine: "折线图",
            statLabelWeek: "本周",
            statLabelMonth: "本月",
            statLabelYear: "今年",
            statLabelRate: "完成率",
            recurrenceLabels: { 'none': '重复', 'daily': '每天', 'workdays': '工作日', 'weekly': '每周', 'monthly': '每月', 'yearly': '每年' }
        };

        const RAZER_TEXT = {
            appTitle: "Razer Control",
            searchInputPlaceholder: "Search: macros / missions / focus…",
            emptyTodoText: "No macros running.\nTime to execute.",
            actTitle: "Telemetry",
            pinnedTitle: "Hotkeys",
            trashModalTitle: "Scrap Bin",
            themeModalTitle: "Chroma",
            outsideTagline: "razer\n把专注调到最高。\n把延迟调到最低。",
            outsideTaglineOpacity: 0.28,
            totalCompletedSuffix: " Executed",
            chartTitleTrend: "Throughput",
            chartTitleDow: "Cycle",
            chartTitleTod: "Rush Hours",
            chartTitlePie: "Loadout",
            chartLabelBar: "Switch to Bar",
            chartLabelLine: "Switch to Line",
            statLabelWeek: "This Week",
            statLabelMonth: "This Month",
            statLabelYear: "This Year",
            statLabelRate: "Win Rate",
            recurrenceLabels: { 'none': 'Repeat', 'daily': 'Daily', 'workdays': 'Workdays', 'weekly': 'Weekly', 'monthly': 'Monthly', 'yearly': 'Yearly' }
        };

        const STANDARD_TEXT = {
            appTitle: "Tasks",
            searchInputPlaceholder: "Search",
            emptyTodoText: "All caught up.",
            actTitle: "Activity Dashboard",
            pinnedTitle: "Pinned",
            trashModalTitle: "Trash Bin",
            themeModalTitle: "Appearance",
            outsideTagline: "",
            outsideTaglineOpacity: 0,
            totalCompletedSuffix: " Completed",
            chartTitleTrend: "Monthly Trend",
            chartTitleDow: "Day of Week",
            chartTitleTod: "Productivity Hours",
            chartTitlePie: "Task Distribution",
            chartLabelBar: "Switch to Bar",
            chartLabelLine: "Switch to Line",
            statLabelWeek: "This Week",
            statLabelMonth: "This Month",
            statLabelYear: "This Year",
            statLabelRate: "Completion Rate",
            recurrenceLabels: { 'none': 'Repeat', 'daily': 'Daily', 'workdays': 'Workdays', 'weekly': 'Weekly', 'monthly': 'Monthly', 'yearly': 'Yearly' }
        };

        function getTextsByThemeId(themeId) {
            let texts = STANDARD_TEXT;
            if (themeId === 'nier-gray') texts = NIER_GRAY_TEXT;
            else if (themeId.includes('nier')) texts = NIER_TEXT;
            else if (themeId === 'ayu') texts = AYU_TEXT;
            else if (themeId === 'dracula') texts = DRACULA_TEXT;
            else if (themeId === 'monokai') texts = MONOKAI_TEXT;
            else if (themeId === 'onedark') texts = ONEDARK_TEXT;
            else if (themeId === 'xcode') texts = XCODE_TEXT;
            else if (themeId === 'christmas') texts = CHRISTMAS_TEXT;
            else if (themeId === 'frieren') texts = FRIEREN_TEXT;
            else if (themeId === 'curse') texts = CURSE_TEXT;
            else if (themeId === 'apple') texts = APPLE_TEXT;
            else if (themeId === 'samsung') texts = SAMSUNG_TEXT;
            else if (themeId === 'google') texts = GOOGLE_TEXT;
            else if (themeId === 'xiaomi') texts = XIAOMI_TEXT;
            else if (themeId === 'angrymiao') texts = ANGRYMIAO_TEXT;
            else if (themeId === 'steam') texts = STEAM_TEXT;
            else if (themeId === 'playstation') texts = PLAYSTATION_TEXT;
            else if (themeId === 'nintendo') texts = NINTENDO_TEXT;
            else if (themeId === 'xbox') texts = XBOX_TEXT;
            else if (themeId === 'xiaohongshu') texts = XIAOHONGSHU_TEXT;
            else if (themeId === 'razer') texts = RAZER_TEXT;
            else if (themeId === 'bladerunner') texts = BLADERUNNER_TEXT;
            else if (themeId === 'sodagreen') texts = SODAGREEN_TEXT;
            else if (themeId === 'bluegate') texts = BLUEGATE_TEXT;
            else if (themeId === 'chiikawa') texts = CHIIKAWA_TEXT;
            else if (themeId === 'hellokitty') texts = HELLOKITTY_TEXT;
            else if (themeId === 'madoka') texts = MADOKA_TEXT;
            else if (themeId === 'usagi') texts = USAGI_TEXT;
            else if (themeId === 'eason') texts = EASON_TEXT;
            else if (themeId === 'jackson') texts = JACKSON_TEXT;
            else if (themeId === 'eva-01') texts = EVA01_TEXT;
            else if (themeId === 'eva-02') texts = EVA02_TEXT;
            else if (themeId === 'darksouls') texts = DARKSOULS_TEXT;
            else if (themeId === 'bloodborne') texts = BLOODBORNE_TEXT;
            else if (themeId === 'liesofp') texts = LIESOFPI_TEXT;
            else if (themeId === 'eldenring') texts = ELDENRING_TEXT;
            return texts;
        }

        function getActiveTexts() {
            return getTextsByThemeId(config.theme);
        }

        function syncChartToggleUI() {
            const texts = getActiveTexts();

            const chartLabel = document.getElementById('chartLabel');
            const chartIcon = document.getElementById('chartIcon');
            if (chartLabel && chartIcon) {
                const isLine = chartType === 'line';
                chartLabel.innerText = isLine ? texts.chartLabelBar : texts.chartLabelLine;
                chartIcon.setAttribute('data-lucide', isLine ? 'bar-chart-2' : 'activity');
            }

            const dowChartLabel = document.getElementById('dowChartLabel');
            const dowChartIcon = document.getElementById('dowChartIcon');
            if (dowChartLabel && dowChartIcon) {
                const isLine = dowChartType === 'line';
                dowChartLabel.innerText = isLine ? texts.chartLabelBar : texts.chartLabelLine;
                dowChartIcon.setAttribute('data-lucide', isLine ? 'bar-chart-2' : 'activity');
            }

            const todChartLabel = document.getElementById('todChartLabel');
            const todChartIcon = document.getElementById('todChartIcon');
            if (todChartLabel && todChartIcon) {
                const isLine = todChartType === 'line';
                todChartLabel.innerText = isLine ? texts.chartLabelBar : texts.chartLabelLine;
                todChartIcon.setAttribute('data-lucide', isLine ? 'bar-chart-2' : 'activity');
            }
        }

        function getThemeMetaById(id) {
            return THEMES.find(t => t.id === id) || { id, name: id, type: '' };
        }

        function getOutsideTaglineCompact(texts) {
            if (!texts || !texts.outsideTagline) return '';
            return texts.outsideTagline.split('\n').filter(Boolean).slice(0, 2).join(' · ');
        }

        function formatOutsideTime() {
            return new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit' });
        }

        function updateOutsideStatus() {
            const el = document.getElementById('outsideStatusText');
            if (!el) return;
            const meta = getThemeMetaById(config.theme);
            let total = 0;
            let completed = 0;
            todos.forEach(t => {
                if (!t.deleted) {
                    total++;
                    if (t.completed || t.archived) completed++;
                }
            });
            el.innerHTML = `<b>${formatOutsideTime()}</b> · ${meta.name} · ${completed}/${total}`;
        }

        function updateOutsideChrome() {
            const texts = getActiveTexts();
            const meta = getThemeMetaById(config.theme);

            const titleEl = document.getElementById('outsideBadgeTitle');
            const subEl = document.getElementById('outsideBadgeSub');
            const stripEl = document.getElementById('outsideStrip');

            if (titleEl) titleEl.innerText = meta.name || meta.id;
            if (subEl) {
                const compact = getOutsideTaglineCompact(texts);
                subEl.innerText = compact || (texts.themeModalTitle || '');
            }
            if (stripEl) stripEl.innerText = meta.name || meta.id;

            updateOutsideStatus();
        }

        function updateThemeText() {
            const texts = getActiveTexts();
            
            // Only update Title if it matches one of the defaults
            const currentTitle = document.getElementById('appTitle').innerText;
            const allTitles = [...new Set(THEMES.map(t => getTextsByThemeId(t.id).appTitle).concat(["火佛修一", STANDARD_TEXT.appTitle]))];
            
            if (allTitles.includes(currentTitle) || currentTitle === "Tasks") {
                 document.getElementById('appTitle').innerText = texts.appTitle;
                 config.title = texts.appTitle; 
            }

            document.getElementById('searchInput').placeholder = texts.searchInputPlaceholder;
            document.getElementById('emptyTodoText').innerText = texts.emptyTodoText;
            
            const actTitle = document.getElementById('actTitle');
            if(actTitle) actTitle.innerText = texts.actTitle;
            
            const trashTitle = document.getElementById('trashModalTitle');
            if(trashTitle) trashTitle.innerText = texts.trashModalTitle;
            
            const themeTitle = document.getElementById('themeModalTitle');
            if(themeTitle) themeTitle.innerText = texts.themeModalTitle;

            const outside = document.getElementById('outsideTagline');
            if (outside) {
                const tagline = texts.outsideTagline || '';
                outside.innerText = tagline;
                outside.style.opacity = tagline ? String(texts.outsideTaglineOpacity ?? 0.26) : '0';
            }
            updateOutsideChrome();

            const pinnedTitle = document.getElementById('pinnedTitle');
            if(pinnedTitle) pinnedTitle.innerHTML = `<i data-lucide="pin" style="width:12px;"></i> ${texts.pinnedTitle}`;
            
            // Stats Labels
            const statLabels = document.querySelectorAll('.stat-label');
            if(statLabels.length >= 4) {
                statLabels[0].innerText = texts.statLabelWeek;
                statLabels[1].innerText = texts.statLabelMonth;
                statLabels[2].innerText = texts.statLabelYear;
                statLabels[3].innerText = texts.statLabelRate;
            }

            // Chart Titles
            const chartTitles = document.querySelectorAll('.chart-title');
            if(chartTitles.length >= 4) {
                chartTitles[0].innerText = texts.chartTitleTrend;
                chartTitles[1].innerText = texts.chartTitleDow;
                chartTitles[2].innerText = texts.chartTitleTod;
                chartTitles[3].innerText = texts.chartTitlePie;
            }

            // Recurrence Labels update in dropdown
            document.getElementById('recurNone').innerText = texts.recurrenceLabels.none;
            document.getElementById('recurDaily').innerHTML = `<i data-lucide="rotate-cw"></i> ${texts.recurrenceLabels.daily}`;
            document.getElementById('recurWork').innerHTML = `<i data-lucide="briefcase"></i> ${texts.recurrenceLabels.workdays}`;
            document.getElementById('recurWeekly').innerHTML = `<i data-lucide="calendar-days"></i> ${texts.recurrenceLabels.weekly}`;
            document.getElementById('recurMonthly').innerHTML = `<i data-lucide="calendar"></i> ${texts.recurrenceLabels.monthly}`;
            document.getElementById('recurYearly').innerHTML = `<i data-lucide="calendar-clock"></i> ${texts.recurrenceLabels.yearly}`;

            syncChartToggleUI();
            createIconsSafe();
            if (isActivityView) renderHeatmap(currentHeatmapYear);
        }

        document.documentElement.setAttribute('data-theme', config.theme);
        // document.getElementById('appTitle').innerText = config.title; // Moved to updateThemeText init


        const els = {
            viewContainer: document.getElementById('viewContainer'),
            listView: document.getElementById('listView'),
            activityView: document.getElementById('activityView'),
            todoList: document.getElementById('todoList'),
            pinnedList: document.getElementById('pinnedList'),
            pinnedContainer: document.getElementById('pinnedContainer'),
            todoInput: document.getElementById('todoInput'),
            inputContainer: document.getElementById('inputContainer'),
            expandBtn: document.getElementById('expandBtn'),
            expandIcon: document.getElementById('expandIcon'),
            modalOverlay: document.getElementById('modalOverlay'),
            detailModal: document.getElementById('detailModal'),
            detailContent: document.getElementById('detailContent'),
            detailMeta: document.getElementById('detailMeta'),
            detailActions: document.getElementById('detailActions'),
            taskDatePicker: document.getElementById('taskDatePicker'),
            taskDateTrigger: document.getElementById('taskDateTrigger'),
            taskDateDisplay: document.getElementById('taskDateDisplay'),
            taskRecurTrigger: document.getElementById('taskRecurTrigger'), 
            taskRecurDisplay: document.getElementById('taskRecurDisplay'), 
            dpTitle: document.getElementById('dpTitle'),
            dpGrid: document.getElementById('dpGrid'),
            subtaskDatePicker: document.getElementById('subtaskDatePicker'),
            subDpTitle: document.getElementById('subDpTitle'),
            subDpGrid: document.getElementById('subDpGrid'),
            searchInput: document.getElementById('searchInput'),
            toggleArchived: document.getElementById('toggleArchived'),
            btnActivity: document.getElementById('btnActivity'),
            emptyTodo: document.getElementById('emptyTodo'),
            emptyTodoText: document.getElementById('emptyTodoText'),
            actionBtn: document.getElementById('actionBtn'),
            actionIcon: document.getElementById('actionIcon'),
            subtasksEditor: document.getElementById('subtasksEditor'),
            subtasksHint: document.getElementById('subtasksHint'),
            subtasksList: document.getElementById('subtasksList'),
            subtaskAddBtn: document.getElementById('subtaskAddBtn'),
            heatmapGrid: document.getElementById('heatmapGrid'),
            heatmapYear: document.getElementById('heatmapYear'),
            themeModal: document.getElementById('themeModal'),
            themeGrid: document.getElementById('themeGrid'),
            trashModal: document.getElementById('trashModal'),
            trashList: document.getElementById('trashList'),
            activityChart: document.getElementById('activityChart'),
            dowChart: document.getElementById('dowChart'),
            todChart: document.getElementById('todChart'),
            pieChart: document.getElementById('pieChart'),
            statWeek: document.getElementById('statWeek'),
            statWeekDiff: document.getElementById('statWeekDiff'),
            statMonth: document.getElementById('statMonth'),
            statMonthDiff: document.getElementById('statMonthDiff'),
            statYear: document.getElementById('statYear'),
            statYearDiff: document.getElementById('statYearDiff'),
            statRate: document.getElementById('statRate'),
            calendarModal: document.getElementById('calendarModal'),
            yearScrollContainer: document.getElementById('yearScrollContainer'),
            fullCalTitle: document.getElementById('fullCalTitle'),
            globalTooltip: document.getElementById('globalTooltip')
        };

        function attemptDataRecovery() {
            const keysToCheck = [MASTER_KEY, 'ios26_todos_v10', 'tasks', 'todos'];
            let foundData = null;
            for (const key of keysToCheck) {
                const raw = localStorage.getItem(key);
                if (raw) { try { const parsed = JSON.parse(raw); if (Array.isArray(parsed) && parsed.length > 0) { foundData = parsed; break; } } catch(e) {} }
            }
            if (foundData) { if (!localStorage.getItem(MASTER_KEY)) localStorage.setItem(MASTER_KEY, JSON.stringify(foundData)); return foundData; }
            return [];
        }
        todos = normalizeTodos(attemptDataRecovery());
        saveTodos();

        function getWeekKey(d) {
            d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
            d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
            var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
            var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
            return d.getUTCFullYear() + "-W" + weekNo;
        }

        function getCycleKey(recurrence, date) {
            if (!date) date = new Date();
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            if (recurrence === 'daily' || recurrence === 'workdays') return `${yyyy}-${mm}-${dd}`;
            if (recurrence === 'weekly') return getWeekKey(date);
            if (recurrence === 'monthly') return `${yyyy}-${mm}`;
            if (recurrence === 'yearly') return `${yyyy}`;
            return null;
        }

        function checkRecurringReset() {
            const now = new Date();
            let changed = false;
            todos = todos.map(t => {
                if (!t.archived && !t.deleted && t.recurrence && t.recurrence !== 'none' && t.completed) {
                    const currentKey = getCycleKey(t.recurrence, now);
                    const lastKey = t.completionHistory && t.completionHistory.length > 0 ? t.completionHistory[t.completionHistory.length-1] : null;
                    if (lastKey !== currentKey) { changed = true; return { ...t, completed: false }; }
                }
                if (t.recurrence && t.recurrence !== 'none' && t.deadline) { changed = true; return { ...t, deadline: null }; }
                return t;
            });
            if(changed) { saveTodos(); renderTodos(); }
        }
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { checkRecurringReset(); renderTodos(); } });
        checkRecurringReset();

        function saveConfig() { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); }
        window.saveTitle = function(newTitle) { config.title = newTitle.trim() || 'Tasks'; saveConfig(); }

        // --- VIEW MANAGEMENT (v68 Fix) ---
        window.toggleActivityView = async function() {
            isActivityView = !isActivityView;
            if (isActivityView) {
                els.listView.style.display = 'none';
                els.activityView.classList.add('active');
                els.btnActivity.classList.add('active');
                els.toggleArchived.classList.remove('active'); // Ensure archive is not active
                showArchived = false; // Reset archived view
                els.viewContainer.classList.remove('view-archived');
                els.inputContainer.classList.add('input-hidden');
                
                renderHeatmap(currentHeatmapYear);
                try { await ensureEcharts(); } catch (e) {}
                renderChart();
                renderAdvancedStats();
            } else {
                els.listView.style.display = 'block';
                els.activityView.classList.remove('active');
                els.btnActivity.classList.remove('active');
                if (!showArchived) els.inputContainer.classList.remove('input-hidden');
            }
            renderTodos();
        };

        window.toggleShowArchived = function() {
            // v68 Fix: If in Activity view, switch back to list first
            if (isActivityView) {
                window.toggleActivityView();
            }

            showArchived = !showArchived;
            const btn = document.getElementById('toggleArchived');
            if (showArchived) {
                btn.classList.add('active');
                btn.title = "View Active";
                els.btnActivity.classList.remove('active'); // Ensure activity is not active
                isActivityView = false; // Reset activity view
                els.activityView.classList.remove('active');
                els.viewContainer.classList.add('view-archived');
                els.inputContainer.classList.add('input-hidden');
            } else {
                btn.classList.remove('active');
                btn.title = "View Archived";
                els.viewContainer.classList.remove('view-archived');
                els.inputContainer.classList.remove('input-hidden');
            }
            renderTodos();
        };

        // --- ECHARTS INTEGRATION (v68) ---
        function initChart() {
             if (!window.echarts) return;
             if (myChart) myChart.dispose();
             myChart = echarts.init(els.activityChart);
             renderChart();
        }

        function getMonthlyData(year) {
            const counts = new Array(12).fill(0);
            todos.forEach(t => {
                if (!t.deleted) {
                    const dates = [...(t.completionHistory || [])];
                    if (t.completedAt && (t.completed || t.archived)) dates.push(t.completedAt);
                    dates.forEach(dStr => {
                        const date = new Date(dStr);
                        if (date.getFullYear() === year) counts[date.getMonth()]++;
                    });
                }
            });
            return counts;
        }

        function renderChart() {
            if (!isActivityView) return;
            if (!window.echarts) return;
            if (!myChart) { initChart(); return; }

            const data = getMonthlyData(currentHeatmapYear);
            const style = getComputedStyle(document.documentElement);
            const colorAccent = style.getPropertyValue('--accent-blue').trim();
            const colorText = style.getPropertyValue('--text-secondary').trim();
            const colorGrid = style.getPropertyValue('--glass-border').trim();
            const colorPrimary = style.getPropertyValue('--text-primary').trim();
            const colorBg = style.getPropertyValue('--input-bg').trim();

            const seriesBase = {
                data: data,
                type: chartType,
                itemStyle: { color: colorAccent },
                lineStyle: { width: 3, color: colorAccent }
            };

            const option = {
                tooltip: { 
                    trigger: 'axis',
                    backgroundColor: colorBg,
                    borderColor: colorGrid,
                    textStyle: { color: colorPrimary }
                },
                grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
                xAxis: {
                    type: 'category',
                    data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
                    axisLine: { lineStyle: { color: colorText } },
                    axisTick: { show: false }
                },
                yAxis: {
                    type: 'value',
                    splitLine: { lineStyle: { color: colorGrid, type: 'dashed' } },
                    axisLine: { show: false },
                    axisLabel: { color: colorText }
                },
                series: [{
                    ...seriesBase,
                    smooth: chartType === 'line',
                    symbol: chartType === 'line' ? 'circle' : 'none',
                    symbolSize: chartType === 'line' ? 7 : 0,
                    barMaxWidth: chartType === 'bar' ? 22 : undefined,
                    itemStyle: chartType === 'bar' ? { color: colorAccent, borderRadius: [6, 6, 0, 0] } : { color: colorAccent },
                    areaStyle: chartType === 'line' ? {
                        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                          { offset: 0, color: colorAccent },
                          { offset: 1, color: 'rgba(0,0,0,0)' }
                        ]),
                        opacity: 0.2
                    } : null
                }]
            };
            myChart.setOption(option);
        }

        function getDatesInScope(todo) {
             const dates = [...(todo.completionHistory || [])];
             if (todo.completedAt && (todo.completed || todo.archived)) dates.push(todo.completedAt);
             return dates.map(d => new Date(d));
        }

        function calculateStats() {
            const now = new Date();
            const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0,0,0,0);
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const startOfYear = new Date(now.getFullYear(), 0, 1);
            
            // Previous periods for comparison
            const startOfLastWeek = new Date(startOfWeek); startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
            const endOfLastWeek = new Date(startOfWeek);
            
            const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

            const startOfLastYear = new Date(now.getFullYear() - 1, 0, 1);
            const endOfLastYear = new Date(now.getFullYear() - 1, 11, 31);

            let week = 0, lastWeek = 0;
            let month = 0, lastMonth = 0;
            let year = 0, lastYear = 0;
            let total = 0, completed = 0;

            todos.forEach(t => {
                if (!t.deleted) {
                    if (t.completed || t.archived) completed++;
                    total++;
                    
                    const dates = getDatesInScope(t);
                    dates.forEach(d => {
                        if (d >= startOfWeek) week++;
                        else if (d >= startOfLastWeek && d < endOfLastWeek) lastWeek++;
                        
                        if (d >= startOfMonth) month++;
                        else if (d >= startOfLastMonth && d <= endOfLastMonth) lastMonth++;
                        
                        if (d >= startOfYear) year++;
                        else if (d >= startOfLastYear && d <= endOfLastYear) lastYear++;
                    });
                }
            });

            els.statWeek.innerText = week;
            renderDiff(els.statWeekDiff, week, lastWeek);
            
            els.statMonth.innerText = month;
            renderDiff(els.statMonthDiff, month, lastMonth);
            
            els.statYear.innerText = year;
            renderDiff(els.statYearDiff, year, lastYear);
            
            const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
            els.statRate.innerText = rate + "%";
        }

        function renderDiff(el, current, previous) {
            if (previous === 0) {
                el.innerHTML = current > 0 ? '<span class="stat-sub positive">↑ ∞</span> vs last' : '<span class="stat-sub">--</span> vs last';
                return;
            }
            const diff = current - previous;
            const pct = Math.round((diff / previous) * 100);
            const isPos = diff >= 0;
            el.innerHTML = `<span class="stat-sub ${isPos ? 'positive' : 'negative'}">${isPos ? '↑' : '↓'} ${Math.abs(pct)}%</span> vs last`;
        }

        function renderAdvancedStats() {
            calculateStats();
            if (!window.echarts) return;
            
            const style = getComputedStyle(document.documentElement);
            const colorAccent = style.getPropertyValue('--accent-blue').trim();
            const colorText = style.getPropertyValue('--text-secondary').trim();
            const colorGrid = style.getPropertyValue('--glass-border').trim();
            const colorPrimary = style.getPropertyValue('--text-primary').trim();
            const colorBg = style.getPropertyValue('--input-bg').trim();
            
            // Day of Week
            if (dowChartInst) dowChartInst.dispose();
            dowChartInst = echarts.init(els.dowChart);
            const dowData = [0,0,0,0,0,0,0]; // Sun-Sat
            
            // Time of Day
            if (todChartInst) todChartInst.dispose();
            todChartInst = echarts.init(els.todChart);
            const todData = new Array(24).fill(0);
            
            // Pie (Distribution)
            if (pieChartInst) pieChartInst.dispose();
            pieChartInst = echarts.init(els.pieChart);
            let recurrent = 0, oneTime = 0;
            
            todos.forEach(t => {
                if (!t.deleted) {
                    if (t.recurrence && t.recurrence !== 'none') recurrent++; else oneTime++;
                    
                    const dates = getDatesInScope(t);
                    dates.forEach(d => {
                        dowData[d.getDay()]++;
                        todData[d.getHours()]++;
                    });
                }
            });

            // DoW Chart
            dowChartInst.setOption({
                tooltip: { trigger: 'axis', backgroundColor: colorBg, borderColor: colorGrid, textStyle: { color: colorPrimary } },
                grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
                xAxis: { type: 'category', data: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], axisLine: { lineStyle: { color: colorText } }, axisTick: { show: false } },
                yAxis: { type: 'value', splitLine: { lineStyle: { color: colorGrid, type: 'dashed' } }, axisLabel: { color: colorText } },
                series: [{
                    data: dowData,
                    type: dowChartType,
                    smooth: dowChartType === 'line',
                    symbol: dowChartType === 'line' ? 'circle' : 'none',
                    symbolSize: dowChartType === 'line' ? 7 : 0,
                    barMaxWidth: dowChartType === 'bar' ? 22 : undefined,
                    itemStyle: dowChartType === 'bar' ? { color: colorAccent, borderRadius: [6, 6, 0, 0] } : { color: colorAccent },
                    lineStyle: { width: 3, color: colorAccent },
                    areaStyle: dowChartType === 'line' ? { opacity: 0.2, color: colorAccent } : null
                }]
            });
            
            // ToD Chart
            todChartInst.setOption({
                tooltip: { trigger: 'axis', backgroundColor: colorBg, borderColor: colorGrid, textStyle: { color: colorPrimary } },
                grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
                xAxis: { type: 'category', data: Array.from({length:24},(_,i)=>i), axisLine: { lineStyle: { color: colorText } }, axisTick: { show: false } },
                yAxis: { type: 'value', splitLine: { lineStyle: { color: colorGrid, type: 'dashed' } }, axisLabel: { color: colorText } },
                series: [{
                    data: todData,
                    type: todChartType,
                    smooth: todChartType === 'line',
                    symbol: todChartType === 'line' ? 'circle' : 'none',
                    symbolSize: todChartType === 'line' ? 7 : 0,
                    barMaxWidth: todChartType === 'bar' ? 22 : undefined,
                    itemStyle: todChartType === 'bar' ? { color: colorAccent, borderRadius: [6, 6, 0, 0] } : { color: colorAccent },
                    lineStyle: { width: 3, color: colorAccent },
                    areaStyle: todChartType === 'line' ? { opacity: 0.2, color: colorAccent } : null
                }]
            });
            
            // Pie Chart
            pieChartInst.setOption({
                tooltip: { trigger: 'item' },
                series: [{
                    type: 'pie', radius: ['40%', '70%'],
                    itemStyle: { borderRadius: 5, borderColor: style.getPropertyValue('--card-bg').trim(), borderWidth: 2 },
                    label: { show: false },
                    data: [
                        { value: oneTime, name: 'One-time', itemStyle: { color: colorAccent } },
                        { value: recurrent, name: 'Recurring', itemStyle: { color: style.getPropertyValue('--accent-purple').trim() } }
                    ]
                }]
            });
        }

        window.toggleChartType = async function() {
            chartType = chartType === 'line' ? 'bar' : 'line';
            syncChartToggleUI();
            createIconsSafe();
            if (isActivityView && !window.echarts) { try { await ensureEcharts(); } catch (e) {} }
            renderChart();
        }

        window.toggleDowChartType = async function() {
            dowChartType = dowChartType === 'line' ? 'bar' : 'line';
            syncChartToggleUI();
            createIconsSafe();
            if (isActivityView && !window.echarts) { try { await ensureEcharts(); } catch (e) {} }
            if (isActivityView) renderAdvancedStats();
        }

        window.toggleTodChartType = async function() {
            todChartType = todChartType === 'line' ? 'bar' : 'line';
            syncChartToggleUI();
            createIconsSafe();
            if (isActivityView && !window.echarts) { try { await ensureEcharts(); } catch (e) {} }
            if (isActivityView) renderAdvancedStats();
        }
        
        // Resize chart on window resize
        window.addEventListener('resize', () => { 
            if(myChart) myChart.resize(); 
            if(dowChartInst) dowChartInst.resize();
            if(todChartInst) todChartInst.resize();
            if(pieChartInst) pieChartInst.resize();
        });


        // --- FULL YEAR CALENDAR ---
        window.openCalendarModal = function() {
            fullCalendarYear = currentHeatmapYear;
            renderFullYearCalendar();
            els.modalOverlay.classList.add('active');
            els.calendarModal.classList.add('open');
        }

        window.closeCalendarModal = function() {
            els.calendarModal.classList.remove('open');
            els.modalOverlay.classList.remove('active');
        }

        window.changeFullCalendarYear = function(delta) {
            fullCalendarYear += delta;
            renderFullYearCalendar();
        }

        function renderFullYearCalendar() {
            els.fullCalTitle.innerText = `${fullCalendarYear} Details`;
            const container = els.yearScrollContainer;
            container.innerHTML = '';

            const yearData = {}; 
            todos.forEach(t => {
                if (!t.deleted) {
                    const dates = [...(t.completionHistory || [])];
                    if (t.completedAt && (t.completed || t.archived)) dates.push(t.completedAt);
                    dates.forEach(dStr => {
                        const d = new Date(dStr);
                        if (d.getFullYear() === fullCalendarYear) {
                            const key = `${d.getMonth()}-${d.getDate()}`;
                            yearData[key] = (yearData[key] || 0) + 1;
                        }
                    });
                }
            });

            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            
            for (let m = 0; m < 12; m++) {
                const monthCard = document.createElement('div');
                monthCard.className = 'single-month-card';
                
                // Calculate monthly total
                let monthTotal = 0;
                Object.keys(yearData).forEach(key => {
                    const [month, day] = key.split('-').map(Number);
                    if (month === m) monthTotal += yearData[key];
                });
                
                const header = document.createElement('div');
                header.className = 'sm-header';
                header.innerText = `${monthNames[m]} · ${monthTotal}`;
                monthCard.appendChild(header);

                const grid = document.createElement('div');
                grid.className = 'sm-grid';

                const firstDay = new Date(fullCalendarYear, m, 1).getDay();
                const daysInMonth = new Date(fullCalendarYear, m + 1, 0).getDate();

                for(let i=0; i<firstDay; i++) grid.appendChild(document.createElement('div'));
                
                for(let d=1; d<=daysInMonth; d++) {
                    const cell = document.createElement('div');
                    cell.className = 'sm-cell';
                    const key = `${m}-${d}`;
                    const count = yearData[key] || 0;
                    
                    if (count > 0) {
                        // v68: Removed Box Shadow, using Opacity/Color only
                        if (count >= 5) cell.classList.add('sm-l3'); 
                        else if (count >= 3) cell.classList.add('sm-l2'); 
                        else cell.classList.add('sm-l1'); 
                    }

                    const dateStr = new Date(fullCalendarYear, m, d).toLocaleDateString();
                    cell.addEventListener('mouseenter', (e) => showTooltip(e, dateStr, count));
                    cell.addEventListener('mousemove', moveTooltip);
                    cell.addEventListener('mouseleave', hideTooltip);

                    grid.appendChild(cell);
                }
                
                monthCard.appendChild(grid);
                container.appendChild(monthCard);
            }
        }

        // --- HEATMAP ---
        window.changeHeatmapYear = function(delta) {
            currentHeatmapYear += delta;
            renderHeatmap(currentHeatmapYear);
            renderChart();
        }

        function renderHeatmap(year) {
            if(els.heatmapYear) els.heatmapYear.innerText = year;
            const grid = els.heatmapGrid;
            grid.innerHTML = '';
            
            const counts = {};
            let totalAll = 0;
            todos.forEach(t => {
                if(!t.deleted) { 
                    const dates = [...(t.completionHistory || [])];
                    if (t.completedAt && (t.completed || t.archived)) dates.push(t.completedAt);
                    dates.forEach(dStr => {
                        const date = new Date(dStr);
                        if(date.getFullYear() === year) {
                            const dateKey = date.toISOString().split('T')[0];
                            if (!counts[dateKey]) counts[dateKey] = 0;
                            counts[dateKey]++;
                            totalAll++;
                        }
                    });
                }
            });
            const texts = getActiveTexts();
            document.getElementById('totalCompletedDisplay').innerText = `${totalAll}${texts.totalCompletedSuffix}`;

            const startDate = new Date(year, 0, 1);
            const endDate = new Date(year, 11, 31);
            const startDay = startDate.getDay(); 
            
            for(let i=0; i<startDay; i++) {
                const empty = document.createElement('div');
                empty.className = 'hm-cell';
                empty.style.opacity = '0';
                empty.style.pointerEvents = 'none';
                grid.appendChild(empty);
            }

            const loopDate = new Date(startDate);
            while (loopDate <= endDate) {
                const dateKey = loopDate.toISOString().split('T')[0];
                const count = counts[dateKey] || 0;
                let level = '';
                if (count >= 5) level = 'hm-l4'; else if (count >= 3) level = 'hm-l3'; else if (count >= 1) level = 'hm-l2'; else level = 'hm-l1'; 
                
                const cell = document.createElement('div');
                cell.className = 'hm-cell ' + level;
                if(count === 0) cell.style.background = 'var(--hm-bg)';
                
                cell.addEventListener('mouseenter', (e) => showTooltip(e, dateKey, count));
                cell.addEventListener('mousemove', (e) => moveTooltip(e));
                cell.addEventListener('mouseleave', hideTooltip);
                
                grid.appendChild(cell);
                loopDate.setDate(loopDate.getDate() + 1);
            }
        }
        
        function showTooltip(e, date, count) {
            const tt = els.globalTooltip;
            tt.innerHTML = `<strong>${date}</strong><br>${count} completed`;
            tt.classList.add('visible');
            moveTooltip(e);
        }
        function moveTooltip(e) {
            const tt = els.globalTooltip;
            const offset = 15;
            tt.style.top = (e.clientY + offset) + 'px';
            tt.style.left = (e.clientX + offset) + 'px';
        }
        function hideTooltip() { els.globalTooltip.classList.remove('visible'); }

        window.openThemePicker = function() {
            els.themeGrid.innerHTML = '';
            THEMES.forEach(t => {
                const option = document.createElement('div');
                option.className = `theme-card ${config.theme === t.id ? 'selected' : ''}`;
                option.onclick = () => window.selectTheme(t.id);
                option.innerHTML = `
                    <div class="preview-box" style="background:${t.bg}; color:${t.text}">
                        <div class="mini-header" style="background:${t.text}"></div>
                        <div class="mini-row" style="background:${t.text}"></div>
                        <div class="mini-row short" style="background:${t.text}"></div>
                        <div class="mini-fab" style="background:${t.acc}"></div>
                    </div>
                    ${t.type === 'collab' ? '<div class="collab-badge">COLLAB</div>' : ''}
                    <div class="theme-info">
                        <span class="theme-name">${t.name}</span>
                        ${config.theme === t.id ? '<div class="selected-icon"><i data-lucide="check"></i></div>' : ''}
                    </div>
                `;
                els.themeGrid.appendChild(option);
            });
            createIconsSafe();
            els.modalOverlay.classList.add('active');
            els.themeModal.classList.add('open');
        }

        window.selectTheme = function(id) {
            config.theme = id;
            document.documentElement.setAttribute('data-theme', id);
            saveConfig();
            updateThemeText();
            window.openThemePicker(); 
            if(isActivityView) setTimeout(() => { renderChart(); renderAdvancedStats(); }, 100); // Re-render chart with new colors
        }

        window.closeThemePicker = function() { els.themeModal.classList.remove('open'); els.modalOverlay.classList.remove('active'); }
        window.openTrash = function() { renderTrash(); els.modalOverlay.classList.add('active'); els.trashModal.classList.add('open'); }
        window.closeTrash = function() { els.trashModal.classList.remove('open'); els.modalOverlay.classList.remove('active'); }
        
        function renderTrash() {
            const deleted = todos.filter(t => t.deleted);
            els.trashList.innerHTML = '';
            if(deleted.length === 0) { els.trashList.innerHTML = '<div style="text-align:center; opacity:0.5; padding:20px;">Trash is empty</div>'; return; }
            deleted.forEach(t => {
                const el = document.createElement('div'); el.className = 'todo-item deleted';
                el.innerHTML = `
                    <div class="todo-content"><div class="todo-text">${parseMarkdown(t.text)}</div></div>
                    <div class="item-actions" style="opacity:1;">
                         <button class="icon-btn unarchive" onclick="window.restoreTodo(${t.id})" title="Restore"><i data-lucide="undo-2"></i></button>
                         <button class="icon-btn delete" onclick="window.hardDelete(${t.id})" title="Delete Forever"><i data-lucide="x"></i></button>
                    </div>`;
                els.trashList.appendChild(el);
            });
            createIconsSafe();
        }
        
        window.restoreTodo = function(id) { todos = todos.map(t => t.id === id ? {...t, deleted: false} : t); saveTodos(); renderTrash(); renderTodos(); if(isActivityView) { renderHeatmap(currentHeatmapYear); renderChart(); } }
        window.hardDelete = function(id) { todos = todos.filter(t => t.id !== id); saveTodos(); renderTrash(); if(isActivityView) { renderHeatmap(currentHeatmapYear); renderChart(); } }
        window.emptyTrash = function() { if(confirm('Delete all items?')) { todos = todos.filter(t => !t.deleted); saveTodos(); renderTrash(); if(isActivityView) { renderHeatmap(currentHeatmapYear); renderChart(); } } }

        function parseMarkdown(text) {
            if(!text) return '';
            let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
                .split('\n').map(line => {
                    if (line.trim().startsWith('- ')) return `<ul><li>${line.trim().substring(2)}</li></ul>`;
                    if (line.trim().startsWith('## ')) return `<div style="font-weight:700; opacity:0.9;">${line.trim().substring(3)}</div>`;
                    if (line.trim().startsWith('> ')) return `<blockquote>${line.trim().substring(2)}</blockquote>`;
                    return line;
                }).join('<br>');
            return html.replace(/`(.*?)`/g, '<code>$1</code>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/<br><ul>/g, '<ul>').replace(/<\/ul><br>/g, '</ul>');
        }

        function normalizeDraftSubtasksForSave() {
            const parentHasDeadline = isISODateString(newTaskDate);
            const parentDeadline = parentHasDeadline ? newTaskDate : null;
            const cleaned = (Array.isArray(draftSubtasks) ? draftSubtasks : [])
                .map(s => normalizeSubtask(s, parentDeadline))
                .filter(s => s.text.length > 0)
                .slice(0, SUBTASK_LIMIT);
            return cleaned;
        }

        function syncDraftSubtaskDeadlines() {
            const parentHasDeadline = isISODateString(newTaskDate);
            const parentDeadline = parentHasDeadline ? newTaskDate : null;
            draftSubtasks = (Array.isArray(draftSubtasks) ? draftSubtasks : []).map(s => normalizeSubtask(s, parentDeadline));
        }

        function canEditSubtasksForCurrentDraft() {
            const hasRecurrence = newRecurrence && newRecurrence !== 'none';
            if (hasRecurrence) return false;
            if (editingTaskId) {
                const todo = todos.find(t => t.id === editingTaskId);
                if (todo?.recurrence && todo.recurrence !== 'none') return false;
            }
            return true;
        }

        function renderSubtasksEditor() {
            if (!els.subtasksEditor) return;
            if (!isExpanded) return;
            const parentHasDeadline = isISODateString(newTaskDate);
            const parentDeadline = parentHasDeadline ? newTaskDate : null;
            const canEdit = canEditSubtasksForCurrentDraft();
            const count = Array.isArray(draftSubtasks) ? draftSubtasks.length : 0;
            const atLimit = count >= SUBTASK_LIMIT;

            let hint = '';
            if (!canEdit) hint = '重复任务不支持子任务。';
            else if (!parentHasDeadline) hint = '未设置主任务截止日期时，子任务不支持独立截止日期。';
            else hint = `最多 ${SUBTASK_LIMIT} 个子任务，子任务截止日期不能晚于主任务。`;
            els.subtasksHint.textContent = hint;

            if (els.subtaskAddBtn) {
                els.subtaskAddBtn.disabled = !canEdit || atLimit;
            }

            const rows = (Array.isArray(draftSubtasks) ? draftSubtasks : []).slice(0, SUBTASK_LIMIT);
            els.subtasksList.innerHTML = rows.map(s => {
                const safeId = Number.isFinite(s?.id) ? s.id : 0;
                const safeText = String(s?.text ?? '');
                const normalizedDeadline = parentHasDeadline ? clampISODateToMax(s?.deadline, parentDeadline) : null;
                const rowClass = parentHasDeadline ? 'subtask-edit-row' : 'subtask-edit-row no-date';
                const disabledAttr = canEdit ? '' : 'disabled';
                const dateCell = parentHasDeadline
                    ? `<div class="meta-trigger subtask-date-trigger active${canEdit ? '' : ' disabled'}" onclick="window.openSubtaskDatePicker(${safeId})"><i data-lucide="calendar"></i><span>${new Date(normalizedDeadline || parentDeadline).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}</span></div>`
                    : '';
                return `
                    <div class="${rowClass}">
                        <input class="subtask-text-input" value="${escapeHtml(safeText)}" placeholder="Subtask..." oninput="window.updateDraftSubtaskText(${safeId}, this.value)" ${disabledAttr}>
                        ${dateCell}
                        <button class="icon-btn delete" onclick="window.removeDraftSubtask(${safeId})" title="Remove" ${disabledAttr}><i data-lucide="x"></i></button>
                    </div>
                `;
            }).join('');
            createIconsSafe();
        }

        window.addDraftSubtask = function() {
            if (!canEditSubtasksForCurrentDraft()) return;
            const parentHasDeadline = isISODateString(newTaskDate);
            const parentDeadline = parentHasDeadline ? newTaskDate : null;
            const current = Array.isArray(draftSubtasks) ? draftSubtasks.slice(0, SUBTASK_LIMIT) : [];
            if (current.length >= SUBTASK_LIMIT) return;
            const id = Date.now() + Math.floor(Math.random() * 100000);
            draftSubtasks = [...current, { id, text: '', completed: false, deadline: parentDeadline }];
            renderSubtasksEditor();
        };

        window.updateDraftSubtaskText = function(id, value) {
            draftSubtasks = (Array.isArray(draftSubtasks) ? draftSubtasks : []).map(s => s.id === id ? { ...s, text: value } : s);
        };

        window.updateDraftSubtaskDeadline = function(id, value) {
            const parentHasDeadline = isISODateString(newTaskDate);
            if (!parentHasDeadline) return;
            const parentDeadline = newTaskDate;
            const clamped = clampISODateToMax(value, parentDeadline);
            draftSubtasks = (Array.isArray(draftSubtasks) ? draftSubtasks : []).map(s => s.id === id ? { ...s, deadline: clamped } : s);
        };

        window.toggleDraftSubtaskCompleted = function(id) {
            draftSubtasks = (Array.isArray(draftSubtasks) ? draftSubtasks : []).map(s => s.id === id ? { ...s, completed: !s.completed } : s);
        };

        window.removeDraftSubtask = function(id) {
            draftSubtasks = (Array.isArray(draftSubtasks) ? draftSubtasks : []).filter(s => s.id !== id);
            renderSubtasksEditor();
        };

        window.insertMarkdown = function(startTag, endTag) {
            const input = els.todoInput;
            const start = input.selectionStart; const end = input.selectionEnd; const text = input.value;
            input.value = text.substring(0, start) + startTag + text.substring(start, end) + endTag + text.substring(end);
            input.focus(); input.selectionStart = start + startTag.length; input.selectionEnd = start + startTag.length + (end - start);
            if(!isExpanded) input.dispatchEvent(new Event('input'));
        }

        window.toggleTaskDatePicker = function() { els.taskDatePicker.classList.toggle('open'); if(els.taskDatePicker.classList.contains('open')) { pickerCurrentDate = newTaskDate ? new Date(newTaskDate) : new Date(); renderTaskDatePicker(); } }
        window.changeTaskMonth = function(d) { pickerCurrentDate.setMonth(pickerCurrentDate.getMonth() + d); renderTaskDatePicker(); }

        function renderTaskDatePicker() {
            const y = pickerCurrentDate.getFullYear(), m = pickerCurrentDate.getMonth(), today = new Date();
            els.dpTitle.innerText = pickerCurrentDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            els.dpGrid.innerHTML = '';
            const first = new Date(y, m, 1).getDay(), days = new Date(y, m+1, 0).getDate();
            for(let i=0; i<first; i++) els.dpGrid.appendChild(document.createElement('div'));
            for(let d=1; d<=days; d++) {
                const el = document.createElement('div'); el.className = 'dp-cell'; el.innerText = d;
                if (newTaskDate) { const sel = new Date(newTaskDate); if (sel.getFullYear() === y && sel.getMonth() === m && sel.getDate() === d) el.classList.add('selected'); }
                if (y === today.getFullYear() && m === today.getMonth() && d === today.getDate()) el.classList.add('is-today');
                el.onclick = () => { newTaskDate = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; els.taskDateDisplay.innerText = new Date(y,m,d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); els.taskDateTrigger.classList.add('active'); window.setRecurrence('none'); syncDraftSubtaskDeadlines(); renderSubtasksEditor(); els.taskDatePicker.classList.remove('open'); };
                els.dpGrid.appendChild(el);
            }
        }

        function closeSubtaskDatePicker() {
            if (els.subtaskDatePicker) els.subtaskDatePicker.classList.remove('open');
            subtaskPickerTargetId = null;
        }

        window.openSubtaskDatePicker = function(subtaskId) {
            if (!isExpanded) return;
            if (!canEditSubtasksForCurrentDraft()) return;
            if (!isISODateString(newTaskDate)) return;
            subtaskPickerTargetId = subtaskId;
            const parentDeadline = newTaskDate;
            const st = (Array.isArray(draftSubtasks) ? draftSubtasks : []).find(s => s.id === subtaskId);
            const selected = clampISODateToMax(st?.deadline, parentDeadline) || parentDeadline;
            subtaskPickerCurrentDate = new Date(selected);
            renderSubtaskDatePicker();
            els.taskDatePicker.classList.remove('open');
            els.subtaskDatePicker.classList.add('open');
            createIconsSafe();
        };

        window.changeSubtaskMonth = function(d) {
            if (!els.subtaskDatePicker.classList.contains('open')) return;
            subtaskPickerCurrentDate.setMonth(subtaskPickerCurrentDate.getMonth() + d);
            renderSubtaskDatePicker();
        };

        function renderSubtaskDatePicker() {
            if (!els.subtaskDatePicker) return;
            if (!isISODateString(newTaskDate)) return;
            const parentDeadline = newTaskDate;
            const selected = (() => {
                const st = (Array.isArray(draftSubtasks) ? draftSubtasks : []).find(s => s.id === subtaskPickerTargetId);
                return clampISODateToMax(st?.deadline, parentDeadline) || parentDeadline;
            })();

            const y = subtaskPickerCurrentDate.getFullYear(), m = subtaskPickerCurrentDate.getMonth(), today = new Date();
            els.subDpTitle.innerText = subtaskPickerCurrentDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
            els.subDpGrid.innerHTML = '';
            const first = new Date(y, m, 1).getDay(), days = new Date(y, m+1, 0).getDate();
            for(let i=0; i<first; i++) els.subDpGrid.appendChild(document.createElement('div'));
            for(let d=1; d<=days; d++) {
                const el = document.createElement('div'); el.className = 'dp-cell'; el.innerText = d;
                const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                if (compareISODateStrings(dateStr, parentDeadline) > 0) el.classList.add('disabled');
                if (selected) { const sel = new Date(selected); if (sel.getFullYear() === y && sel.getMonth() === m && sel.getDate() === d) el.classList.add('selected'); }
                if (y === today.getFullYear() && m === today.getMonth() && d === today.getDate()) el.classList.add('is-today');
                if (!el.classList.contains('disabled')) {
                    el.onclick = () => {
                        draftSubtasks = (Array.isArray(draftSubtasks) ? draftSubtasks : []).map(s => s.id === subtaskPickerTargetId ? { ...s, deadline: dateStr } : s);
                        closeSubtaskDatePicker();
                        renderSubtasksEditor();
                    };
                }
                els.subDpGrid.appendChild(el);
            }
        }

        window.cycleRecurrence = function() {
            const modes = ['none', 'daily', 'workdays', 'weekly', 'monthly', 'yearly'];
            let idx = modes.indexOf(newRecurrence);
            window.setRecurrence(modes[(idx + 1) % modes.length]);
        }

        window.setRecurrence = function(type) {
            if (type !== 'none') {
                const hasDraftSubtasks = normalizeDraftSubtasksForSave().length > 0;
                if (hasDraftSubtasks) { alert('含子任务的主任务不支持重复执行规则。'); return; }
                if (editingTaskId) {
                    const todo = todos.find(t => t.id === editingTaskId);
                    if (Array.isArray(todo?.subtasks) && todo.subtasks.length > 0) { alert('含子任务的主任务不支持重复执行规则。'); return; }
                }
            }
            newRecurrence = type;
            const texts = getActiveTexts();
            const fallbackLabels = { 'none': 'Repeat', 'daily': 'Daily', 'workdays': 'Workdays', 'weekly': 'Weekly', 'monthly': 'Monthly', 'yearly': 'Yearly' };
            els.taskRecurDisplay.innerText = (texts.recurrenceLabels && texts.recurrenceLabels[type]) ? texts.recurrenceLabels[type] : fallbackLabels[type];
            if(type !== 'none') { els.taskRecurTrigger.classList.add('active'); newTaskDate = null; els.taskDateDisplay.innerText = "Due"; els.taskDateTrigger.classList.remove('active'); draftSubtasks = []; } else { els.taskRecurTrigger.classList.remove('active'); }
            document.querySelectorAll('.recur-btn').forEach(btn => btn.classList.remove('active'));
            const recurBtnIdByType = {
                none: 'recurNone',
                daily: 'recurDaily',
                workdays: 'recurWork',
                weekly: 'recurWeekly',
                monthly: 'recurMonthly',
                yearly: 'recurYearly'
            };
            const btnId = recurBtnIdByType[type] || 'recurNone';
            const btn = document.getElementById(btnId);
            if (btn) btn.classList.add('active');
            renderSubtasksEditor();
        }

        window.toggleExpand = function() {
            isExpanded = !isExpanded;
            if(isExpanded) { els.inputContainer.classList.add('expanded'); els.modalOverlay.classList.add('active'); els.expandBtn.innerHTML = '<i data-lucide="minimize-2"></i>'; els.todoInput.focus(); renderSubtasksEditor(); }
            else { 
                els.inputContainer.classList.remove('expanded'); els.modalOverlay.classList.remove('active'); els.expandBtn.innerHTML = '<i data-lucide="maximize-2"></i>'; els.todoInput.style.cssText = ''; 
                if (editingTaskId) { editingTaskId = null; els.todoInput.value = ''; newTaskDate = null; window.setRecurrence('none'); els.taskDateDisplay.innerText = "Due"; els.taskDateTrigger.classList.remove('active'); els.actionBtn.classList.remove('save-mode'); els.actionIcon.setAttribute('data-lucide', 'arrow-up'); }
                draftSubtasks = [];
                els.taskDatePicker.classList.remove('open');
                closeSubtaskDatePicker();
            }
            createIconsSafe();
        }

        window.closeOverlays = function() { if(isExpanded) window.toggleExpand(); if(els.detailModal.classList.contains('open')) window.closeDetail(); if(els.themeModal.classList.contains('open')) window.closeThemePicker(); if(els.trashModal.classList.contains('open')) window.closeTrash(); if(els.calendarModal.classList.contains('open')) window.closeCalendarModal(); }

        window.addTodo = function() {
            if(!els.todoInput.value.trim()) return;
            const savedSubtasks = normalizeDraftSubtasksForSave();
            if (savedSubtasks.length > SUBTASK_LIMIT) { alert(`子任务最多 ${SUBTASK_LIMIT} 个。`); return; }
            if (newRecurrence && newRecurrence !== 'none' && savedSubtasks.length > 0) { alert('重复任务不支持子任务。'); return; }
            if (editingTaskId) {
                todos = todos.map(t => t.id === editingTaskId ? { ...t, text: els.todoInput.value.trim(), deadline: newTaskDate, recurrence: newRecurrence, subtasks: savedSubtasks } : t);
            } else {
                todos.unshift({ id: Date.now(), text: els.todoInput.value.trim(), completed: false, archived: false, deleted: false, pinned: false, deadline: newTaskDate, recurrence: newRecurrence, completionHistory: [], subtasks: savedSubtasks });
            }
            todos = normalizeTodos(todos);
            saveTodos(); els.todoInput.value = ''; draftSubtasks = []; window.setRecurrence('none'); if(isExpanded) window.toggleExpand(); newTaskDate = null; els.taskDateDisplay.innerText = "Due"; els.taskDateTrigger.classList.remove('active'); renderTodos();
        };

        window.openEditSheet = function(id) {
            window.closeDetail(); const todo = todos.find(t => t.id === id); if (!todo) return;
            editingTaskId = id; els.todoInput.value = todo.text; window.setRecurrence(todo.recurrence || 'none'); 
            if (todo.deadline) { newTaskDate = todo.deadline; const d = new Date(newTaskDate); els.taskDateDisplay.innerText = d.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' }); els.taskDateTrigger.classList.add('active'); }
            else { newTaskDate = null; els.taskDateDisplay.innerText = "Due"; els.taskDateTrigger.classList.remove('active'); }
            draftSubtasks = Array.isArray(todo.subtasks) ? todo.subtasks.map(s => ({ ...s })) : [];
            syncDraftSubtaskDeadlines();
            els.actionBtn.classList.add('save-mode'); els.actionIcon.setAttribute('data-lucide', 'check'); createIconsSafe();
            if (!isExpanded) window.toggleExpand(); else { els.todoInput.focus(); renderSubtasksEditor(); }
        }

        window.toggleTodoExpand = function(id) {
            if (expandedTodoIds.has(id)) expandedTodoIds.delete(id);
            else expandedTodoIds.add(id);
            renderTodos();
        };

        window.toggleSubtask = function(todoId, subtaskId) {
            const todo = todos.find(t => t.id === todoId);
            if (!todo) return;
            if (todo.archived || showArchived) return;
            todos = todos.map(t => {
                if (t.id !== todoId) return t;
                const subs = Array.isArray(t.subtasks) ? t.subtasks : [];
                const next = subs.map(s => s.id === subtaskId ? { ...s, completed: !s.completed } : s);
                return { ...t, subtasks: next };
            });
            saveTodos();
            const after = todos.find(t => t.id === todoId);
            if (after && Array.isArray(after.subtasks) && after.subtasks.length > 0 && after.subtasks.every(s => !!s.completed) && !after.completed) {
                window.toggleTodo(todoId);
                return;
            }
            renderTodos();
        };

        window.togglePin = function(id) { todos = todos.map(t => t.id === id ? {...t, pinned: !t.pinned} : t); saveTodos(); renderTodos(); }

        window.toggleTodo = function(id) { 
            const todo = todos.find(t => t.id === id); if (!todo) return;
            if (todo.recurrence && todo.recurrence !== 'none') {
                const isNowCompleted = !todo.completed; const now = new Date(); const cycleKey = getCycleKey(todo.recurrence, now);
                let newHistory = todo.completionHistory || []; const lastKey = newHistory.length > 0 ? newHistory[newHistory.length-1] : null;
                if (isNowCompleted && lastKey !== cycleKey) { newHistory.push(cycleKey); todos.push({ id: Date.now(), text: todo.text, completed: true, archived: true, deleted: false, completedAt: now.toISOString(), deadline: null, recurrence: todo.recurrence }); }
                todos = todos.map(t => t.id === id ? { ...t, completed: isNowCompleted, completionHistory: newHistory } : t);
                saveTodos(); renderTodos(); if(isNowCompleted && showArchived) { renderHeatmap(currentHeatmapYear); renderChart(); }
            } else {
                const newStatus = !todo.completed; const update = { completed: newStatus, completedAt: newStatus ? new Date().toISOString() : undefined };
                todos = todos.map(t => t.id === id ? {...t, ...update} : t); saveTodos();
                if (newStatus) { const itemEl = document.getElementById(`todo-${id}`); if (itemEl) { itemEl.classList.add('completed'); setTimeout(() => { if(itemEl) itemEl.classList.add('slide-out-right'); }, 400); setTimeout(() => { todos = todos.map(t => t.id === id ? {...t, archived: true} : t); saveTodos(); renderTodos(); if(showArchived) { renderHeatmap(currentHeatmapYear); renderChart(); } }, 800); } else renderTodos(); } else renderTodos();
            }
        };
        
        window.deleteTodo = function(id) { const el = document.getElementById(`todo-${id}`); if(el) el.classList.add('slide-out-left'); setTimeout(() => { todos = todos.map(t => t.id === id ? {...t, deleted: true} : t); saveTodos(); renderTodos(); if(isActivityView) { renderHeatmap(currentHeatmapYear); renderChart(); } }, 350); }
        window.unarchiveTodo = function(id) { todos = todos.map(t => t.id === id ? {...t, archived: false, completed: false} : t); saveTodos(); renderTodos(); }

        window.openDetail = function(id) {
            const todo = todos.find(t => t.id === id); if(!todo) return;
            currentDetailId = id; els.detailContent.innerHTML = `<div class="detail-text">${parseMarkdown(todo.text)}</div>`;
            let metaText = "Created " + new Date(todo.id).toLocaleDateString();
            if(todo.deadline) metaText += ` · Due ${todo.deadline}`;
            if(todo.recurrence && todo.recurrence !== 'none') metaText += ` · Repeats ${todo.recurrence}`;
            const isReadOnly = (showArchived || todo.archived);
            let actionButtons = '';
            if (!isReadOnly) {
                actionButtons += `<button class="detail-icon-btn edit" onclick="window.openEditSheet(${todo.id})" title="Edit"><i data-lucide="pencil"></i></button>`;
                actionButtons += `<button class="detail-icon-btn pin" onclick="window.togglePin(${todo.id}); window.closeDetail();" title="${todo.pinned ? 'Unpin' : 'Pin'}"><i data-lucide="${todo.pinned ? 'pin-off' : 'pin'}"></i></button>`;
            }
            if (isReadOnly) actionButtons += `<button class="detail-icon-btn unarchive" onclick="window.unarchiveTodo(${todo.id}); window.closeDetail();" title="Restore"><i data-lucide="undo-2"></i></button>`;
            else actionButtons += `<button class="detail-icon-btn archive" onclick="window.toggleTodo(${todo.id}); window.closeDetail();" title="Archive"><i data-lucide="archive"></i></button>`;
            actionButtons += `<button class="detail-icon-btn delete" onclick="window.deleteTodo(${todo.id}); window.closeDetail();" title="Delete"><i data-lucide="trash-2"></i></button>`;
            actionButtons += `<button class="detail-icon-btn close" onclick="window.closeDetail()" title="Close"><i data-lucide="x"></i></button>`;
            els.detailMeta.innerText = metaText; els.detailActions.innerHTML = actionButtons;
            els.modalOverlay.classList.add('active'); els.detailModal.classList.add('open'); createIconsSafe();
        }
        
        window.closeDetail = function() { els.detailModal.classList.remove('open'); if (!isExpanded) els.modalOverlay.classList.remove('active'); currentDetailId = null; }

        function createTodoElement(todo) {
            let deadlineHtml = '';
            if(!showArchived && todo.recurrence && todo.recurrence !== 'none') {
                 if (todo.completed) { const resetLabel = { 'daily': 'Tomorrow', 'weekly': 'Next Week', 'workdays': 'Next Workday', 'monthly': 'Next Month', 'yearly': 'Next Year' }[todo.recurrence] || 'Next Cycle'; deadlineHtml = `<div class="deadline-badge reset-prompt">✓ Resets ${resetLabel}</div>`; }
                 else { deadlineHtml = `<div class="deadline-badge repeat">↻ ${todo.recurrence}</div>`; }
            } else if (todo.deadline) {
                const d = new Date(todo.deadline); const diffDays = Math.ceil((d - new Date().setHours(0,0,0,0)) / (86400000));
                let pClass = diffDays <= 0 ? "p-critical" : (diffDays === 1 ? "p-high" : (diffDays <= 3 ? "p-high" : (diffDays <= 7 ? "p-medium" : "")));
                deadlineHtml = `<div class="deadline-badge ${pClass}"><i data-lucide="clock" style="width:10px;"></i> ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${diffDays <= 0 ? (diffDays<0?"Overdue":"Today") : diffDays + "d left"}</div>`;
            }
            if (showArchived && todo.completedAt) {
                 const d = new Date(todo.completedAt); const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                 if (todo.recurrence && todo.recurrence !== 'none') deadlineHtml = `<div class="deadline-badge" style="color:var(--text-secondary); border-color:var(--glass-border);"><i data-lucide="rotate-cw" style="width:10px; margin-right:4px;"></i> Done ${dateStr}</div>`;
                 else deadlineHtml = `<div class="deadline-badge" style="color:var(--text-secondary); border-color:var(--glass-border);"><i data-lucide="check" style="width:10px; margin-right:4px;"></i> Done ${dateStr}</div>`;
            }

            const el = document.createElement('div');
            const isRecurringDone = (!showArchived && todo.recurrence && todo.recurrence !== 'none' && todo.completed);
            el.id = `todo-${todo.id}`;
            const isReadOnly = (showArchived || todo.archived);
            const subtasks = Array.isArray(todo.subtasks) ? todo.subtasks : [];
            const expanded = expandedTodoIds.has(todo.id);
            el.className = `todo-item ${todo.completed ? 'completed' : ''} ${isRecurringDone ? 'recurring-done' : ''} ${todo.pinned ? 'pinned' : ''} ${expanded ? 'subtasks-expanded' : ''}`;

            const subtasksSorted = sortSubtasksByUrgency(subtasks);
            const urgent = subtasksSorted.find(s => !s.completed) || subtasksSorted[0];
            const urgentInfo = urgent ? getUrgencyInfo(urgent.deadline) : null;

            const previewHtml = (!expanded && urgent && urgent.text)
                ? `<div class="subtask-preview ${urgentInfo?.pClass || ''}"><span class="subtask-preview-dot"></span><span class="subtask-preview-text">${escapeHtml(urgent.text)}</span>${urgentInfo ? `<span class="subtask-preview-date">${urgentInfo.rel} · ${urgentInfo.dateLabel}</span>` : ''}</div>`
                : '';

            const subtasksPanelHtml = (expanded && subtasks.length > 0)
                ? `<div class="subtasks-panel">${subtasksSorted.map(s => {
                        const doneClass = s.completed ? 'subtask-item done' : 'subtask-item';
                        const info = getUrgencyInfo(s.deadline);
                        const btnDisabled = isReadOnly ? 'disabled' : '';
                        const checkOnclick = isReadOnly ? '' : `onclick="event.stopPropagation(); window.toggleSubtask(${todo.id}, ${s.id})"`;
                        return `<div class="${doneClass}" onclick="event.stopPropagation();">
                            <button class="subtask-check" ${checkOnclick} ${btnDisabled}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></button>
                            <div class="subtask-item-text">${escapeHtml(s.text)}</div>
                            ${info ? `<div class="deadline-badge ${info.pClass}"><i data-lucide="clock" style="width:10px;"></i> ${info.dateLabel} · ${info.rel}</div>` : ''}
                        </div>`;
                    }).join('')}</div>`
                : '';

            const subtaskTotal = subtasks.length;
            const subtaskDone = subtasks.filter(s => !!s.completed).length;
            const subtaskPercent = subtaskTotal > 0 ? Math.round((subtaskDone / subtaskTotal) * 100) : 0;
            const progressHtml = subtaskTotal > 0
                ? `<div class="subtask-progress"><div class="subtask-progress-track"><div class="subtask-progress-fill" style="width:${subtaskPercent}%"></div></div><div class="subtask-progress-label">${subtaskDone}/${subtaskTotal}</div></div>`
                : '';

            let actionButtons = '';
            if (subtasks.length > 0) {
                const expandIcon = expanded ? 'chevron-up' : 'chevron-down';
                const expandOnclick = `onclick="event.stopPropagation(); window.toggleTodoExpand(${todo.id})"`;
                actionButtons += `<button class="icon-btn expand" ${expandOnclick} title="${expanded ? 'Collapse' : 'Expand'}"><i data-lucide="${expandIcon}"></i></button>`;
            }
            if (!isReadOnly) {
                actionButtons += `<button class="icon-btn edit" onclick="window.openEditSheet(${todo.id})" title="Edit"><i data-lucide="pencil"></i></button>`;
                actionButtons += `<button class="icon-btn pin" onclick="window.togglePin(${todo.id})" title="${todo.pinned ? 'Unpin' : 'Pin'}"><i data-lucide="${todo.pinned ? 'pin-off' : 'pin'}"></i></button>`;
                actionButtons += `<button class="icon-btn archive" onclick="window.toggleTodo(${todo.id})" title="Archive"><i data-lucide="archive"></i></button>`;
            } else {
                actionButtons += `<button class="icon-btn unarchive" onclick="window.unarchiveTodo(${todo.id})" title="Restore"><i data-lucide="undo-2"></i></button>`;
            }
            actionButtons += `<button class="icon-btn delete" onclick="window.deleteTodo(${todo.id})" title="Delete"><i data-lucide="trash-2"></i></button>`;

            el.innerHTML = `
                <div class="custom-checkbox" onclick="event.stopPropagation(); window.toggleTodo(${todo.id})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
                <div class="todo-content" onclick="window.openDetail(${todo.id})">
                    <div class="todo-text" data-tooltip="${todo.text.replace(/"/g, '&quot;')}">${parseMarkdown(todo.text)}</div>
                    ${(previewHtml || deadlineHtml || progressHtml) ? `<div class="todo-meta">${deadlineHtml}${previewHtml ? previewHtml : ''}${progressHtml}</div>` : ''}
                    ${subtasksPanelHtml}
                </div>
                <div class="item-actions">${actionButtons}</div>`;
            return el;
        }

        function renderTodos() {
            const allTodos = todos.filter(t => !t.deleted && (showArchived ? t.archived : !t.archived) && t.text.toLowerCase().includes(searchTerm.toLowerCase()));
            const pinnedTasks = allTodos.filter(t => t.pinned && !showArchived);
            const normalTasks = allTodos.filter(t => !t.pinned || showArchived);

            const sortFn = (a, b) => {
                if (!showArchived) {
                    const aR = (a.recurrence && a.recurrence !== 'none'), bR = (b.recurrence && b.recurrence !== 'none');
                    if (aR && !bR) return -1; if (!aR && bR) return 1; if (aR && bR) return b.id - a.id;
                }
                if (a.completed !== b.completed) return a.completed - b.completed;
                if (!a.completed) {
                    if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
                    if (a.deadline && !b.deadline) return -1; if (!a.deadline && b.deadline) return 1;
                }
                return a.id - b.id;
            };

            pinnedTasks.sort(sortFn); normalTasks.sort(sortFn);
            els.pinnedList.innerHTML = '';
            if (pinnedTasks.length > 0) { els.pinnedContainer.classList.add('active'); pinnedTasks.forEach(t => els.pinnedList.appendChild(createTodoElement(t))); } else { els.pinnedContainer.classList.remove('active'); }
            els.todoList.innerHTML = '';
            els.emptyTodo.style.display = (normalTasks.length === 0 && pinnedTasks.length === 0) ? 'flex' : 'none';
            els.emptyTodoText.innerText = showArchived ? 'No archived tasks.' : (config.theme.includes('nier') ? NIER_TEXT.emptyTodoText : STANDARD_TEXT.emptyTodoText);
            normalTasks.forEach(t => els.todoList.appendChild(createTodoElement(t)));
            createIconsSafe();
            updateOutsideStatus();
        }

        function init() {
            document.getElementById('dateDisplay').innerText = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
            updateThemeText();
            renderTodos();
            updateOutsideStatus();
            setInterval(updateOutsideStatus, 60 * 1000);
            document.addEventListener('click', (e) => {
                if (!els.taskDatePicker.contains(e.target) && !els.taskDateTrigger.contains(e.target)) els.taskDatePicker.classList.remove('open');
                if (els.subtaskDatePicker.classList.contains('open') && !els.subtaskDatePicker.contains(e.target) && !e.target.closest('.subtask-date-trigger')) closeSubtaskDatePicker();
            });
            els.todoInput.addEventListener('input', function() { if(!isExpanded) { this.style.height = 'auto'; this.style.height = (this.scrollHeight) + 'px'; } });
            els.todoInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !isExpanded) { e.preventDefault(); window.addTodo(); } });
            els.searchInput.addEventListener('input', (e) => { searchTerm = e.target.value.trim(); renderTodos(); });
        }
        init();

    
}
