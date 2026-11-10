window.__ModuleLoader__.load({
  id: 'dsh-plugin-taskflow',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement

    const NS = 'taskflow'
    const ID = 'dsh-plugin-taskflow'
    // Bumped whenever the browser half changes: the host reports the live value
    // in /taskflow/health, which is how a stale page is detected.
    const CLIENT_BUILD = 'c99'
    /**
     * true  = shadow DSH's own todo panel (id 'todo', priority -1)
     * false = render beside it (unique id), so both lists are visible
     * Override at runtime: window.__DSH_TASKFLOW_REPLACE_DOCK__ = true/false
     */
    const DEFAULT_DOCK_MODE = 'custom'
    const POLL_MS_ACTIVE = 900
    const POLL_MS_IDLE = 2600

    /* ------------------------------------------------------------------ *
     * Copy
     * ------------------------------------------------------------------ */

    const ZH = {
      'strip.open': '打开任务流面板',
      'strip.expand': '展开任务列表',
      'strip.collapse': '收起任务列表',
      'strip.summary': '段小结',
      'status.pending': '未开始',
      'status.in_progress': '进行中',
      'status.completed': '已完成',
      'status.allDone': '全部完成',
      'status.waiting': '等待确认',
      'status.waitingHint': '本轮结束，等你确认后继续',
      'status.delegated': '子 agent 执行中',
      'card.pending': '正在整理本段小结…',
      'card.turn': '第 {turn} 段',
      'card.steps': '{count} 步',
      'card.files': '{count} 个文件',
      'card.expand': '展开小结',
      'card.mechanical': '规则摘要',
      'panel.title': '任务流',
      'panel.subtitle': '本会话的任务进度与分段小结',
      'panel.tasks': '当前任务',
      'panel.done': '已完成',
      'panel.segments': '分段小结',
      'panel.empty': '还没有小结。完成一段工作后会自动生成，也可以点下方按钮手动整理。',
      'panel.emptySession': '本会话暂无任务清单',
      'panel.planning': '正在拆解任务…',
      'panel.noTasks': '本会话还没有任务列表（agent 使用 todo_write 后出现）。',
      'panel.summarize': '整理最近一段',
      'panel.summarizing': '正在整理…',
      'panel.refresh': '刷新',
      'panel.manual': '手动摘要',
      'panel.time': '用时 {value}',
      'panel.guide.title': '任务流',
      'panel.guide.description': '查看任务进度与每一段工作的自动小结。',
      'panel.updated': '更新于',
      'panel.cost': '{model} · {tokens} tokens',
      'tasks.header': '{total} 个任务 · 完成 {done} · 待办 {open}',
      'tasks.empty': '（空任务列表）',
      'tasks.title': '任务清单',
      'tasks.moreDone': '还有 {count} 项已完成',
      'settings.title': '任务流',
      'settings.subtitle': '输入框上方显示哪一种任务列表',
      'settings.custom': 'TaskFlow 面板',
      'settings.customHint': '进度环、当前任务、计时、等待确认/子 agent 状态，点条目看任务小结',
      'settings.builtin': 'DSH 内置面板',
      'settings.builtinHint': '官方样式，只有列表与状态，没有计时与小结',
      'settings.note': '切换立即生效，无需刷新页面。',
      'tasks.summary.pending': '小结生成中…',
      'tasks.summary.none': '无小结',
      'tasks.detail.steps': '期间动作',
      'tasks.detail.files': '涉及文件',
      'tasks.detail.start': '开始 {time}',
      'tasks.detail.done': '完成 {time}',
      'tasks.detail.spent': '用时 {value}',
      'strip.sidebar': '查看全部小结',
      'panel.allSummaries': '全部小结',
    }

    const EN = {
      'strip.open': 'Open TaskFlow panel',
      'strip.expand': 'Expand task list',
      'strip.collapse': 'Collapse task list',
      'strip.summary': 'summaries',
      'status.pending': 'pending',
      'status.in_progress': 'in progress',
      'status.completed': 'done',
      'status.allDone': 'all done',
      'status.waiting': 'waiting',
      'status.waitingHint': 'turn ended; waiting for you',
      'status.delegated': 'subagent working',
      'card.pending': 'Summarizing this segment…',
      'card.turn': 'Segment {turn}',
      'card.steps': '{count} steps',
      'card.files': '{count} files',
      'card.expand': 'Expand summary',
      'card.mechanical': 'rule-based',
      'panel.title': 'TaskFlow',
      'panel.subtitle': 'Task progress and per-segment summaries for this session',
      'panel.tasks': 'Current tasks',
      'panel.done': 'Completed',
      'panel.segments': 'Segment summaries',
      'panel.empty': 'No summaries yet. One is generated when a segment of work ends, or press the button below.',
      'panel.emptySession': 'No task list in this session yet',
      'panel.planning': 'Planning tasks…',
      'panel.noTasks': 'This session has no task list yet (it appears once the agent calls todo_write).',
      'panel.summarize': 'Summarize the last segment',
      'panel.summarizing': 'Summarizing…',
      'panel.refresh': 'Refresh',
      'panel.manual': 'Manual summary',
      'panel.time': '{value} elapsed',
      'panel.guide.title': 'TaskFlow',
      'panel.guide.description': 'Task progress plus an automatic summary of every work segment.',
      'panel.updated': 'updated',
      'panel.cost': '{model} · {tokens} tokens',
      'tasks.header': '{total} tasks ({done} done, {open} open)',
      'tasks.empty': '(empty task list)',
      'tasks.title': 'Task list',
      'tasks.moreDone': '{count} more finished',
      'settings.title': 'TaskFlow',
      'settings.subtitle': 'Which task list to show above the composer',
      'settings.custom': 'TaskFlow panel',
      'settings.customHint': 'progress ring, current task, timing, waiting/subagent state, per-task summaries',
      'settings.builtin': 'Built-in DSH panel',
      'settings.builtinHint': 'the shipped list and statuses only',
      'settings.note': 'Applies immediately; no reload needed.',
      'tasks.summary.pending': 'summarizing…',
      'tasks.summary.none': 'no summary',
      'tasks.detail.steps': 'Work done',
      'tasks.detail.files': 'Files',
      'tasks.detail.start': 'started {time}',
      'tasks.detail.done': 'done {time}',
      'tasks.detail.spent': 'took {value}',
      'strip.sidebar': 'All summaries',
      'panel.allSummaries': 'All summaries',
    }

    let bound = null
    let fallbackLang = 'zh'

    /** Translate one key, falling back to the bundled dictionary. */
    function t(key, vars) {
      let text = ''
      if (bound) {
        try {
          text = bound(key)
        } catch {
          text = ''
        }
      }
      if (!text || text === key) {
        const dict = fallbackLang === 'en' ? EN : ZH
        text = dict[key] || ZH[key] || key
      }
      if (!vars) return text
      return text.replace(/\{(\w+)\}/g, (match, name) => (vars[name] === undefined ? match : String(vars[name])))
    }

    /* ------------------------------------------------------------------ *
     * Styles
     * ------------------------------------------------------------------ */

    const CSS = `
.tf-float { display: flex; justify-content: flex-end; padding: 0 2px; }
.tf-pill { display: inline-flex; align-items: center; gap: 1px; max-width: min(100%, 340px); padding: 2px 8px 2px 3px; border-radius: 999px; background: color-mix(in oklab, currentColor 7%, transparent); color: inherit; font-size: 11.5px; line-height: 18px; opacity: .72; overflow: hidden; }
.tf-pill:hover { opacity: 1; background: color-mix(in oklab, currentColor 11%, transparent); }
.tf-ring { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 16px; height: 16px; margin: 0; padding: 0; border: 0; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; opacity: .72; transition: opacity .15s ease; }
.tf-ring:hover { opacity: 1; }
.tf-ring-svg { display: block; }
.tf-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: conic-gradient(from 0deg, #ff6b6b, #ffd166, #6bcb77, #4d96ff, #b983ff, #ff6b6b); box-shadow: 0 0 7px rgba(120, 170, 255, .55); animation: tf-pulse 1.8s ease-in-out infinite; }
.tf-pill-main { display: inline-flex; align-items: center; gap: 6px; min-width: 0; padding: 0 2px; border: 0; background: transparent; color: inherit; font: inherit; font-size: 11.5px; line-height: 18px; cursor: pointer; }
.tf-pill-count { flex: 0 0 auto; font-variant-numeric: tabular-nums; opacity: .75; }
.tf-pill-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tf-panel { display: flex; flex-direction: column; gap: 12px; padding: 12px; font-size: 12px; box-sizing: border-box; height: 100%; min-height: 0; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; scrollbar-color: color-mix(in oklab, currentColor 16%, transparent) transparent; }
.tf-panel > * { flex: 0 0 auto; }
.tf-panel::-webkit-scrollbar { width: 6px; }
.tf-panel::-webkit-scrollbar-track { background: transparent; }
.tf-panel::-webkit-scrollbar-thumb { background: color-mix(in oklab, currentColor 14%, transparent); border-radius: 3px; }
.tf-panel-head { display: flex; align-items: baseline; gap: 8px; }
.tf-panel-title { font-size: 13px; font-weight: 600; }
.tf-panel-sub { opacity: .5; }
.tf-inline { position: relative; display: flex; flex-direction: column; gap: 3px; width: calc(100% - 2px); box-sizing: border-box; padding: 10px 15px 11px; border-radius: 18px; border: 1px solid rgba(255, 255, 255, .09); background: linear-gradient(180deg, rgba(255, 255, 255, .06), rgba(255, 255, 255, 0) 46%), color-mix(in oklab, currentColor 1.6%, rgba(128, 128, 128, .035)); backdrop-filter: blur(34px) saturate(1.7) brightness(1.05); -webkit-backdrop-filter: blur(34px) saturate(1.7) brightness(1.05); box-shadow: 0 10px 30px rgba(0, 0, 0, .14), inset 0 1px 0 rgba(255, 255, 255, .10), inset 0 -1px 0 rgba(0, 0, 0, .14); }
@property --tf-angle { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
@keyframes tf-spin { to { --tf-angle: 360deg; } }
@keyframes tf-pulse { 0%, 100% { transform: scale(.85); opacity: .7; } 50% { transform: scale(1.12); opacity: 1; } }
@keyframes tf-glow { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
.tf-inline-empty { padding: 5px 10px; }
.tf-inline-empty .tf-inline-head { opacity: .42; font-size: 10.5px; }
.tf-empty-dot { flex: 0 0 auto; font-size: 10px; opacity: .7; }
.tf-inline-head { display: flex; align-items: center; gap: 10px; padding: 1px 0 3px; font-size: 12px; letter-spacing: .01em; transition: color .3s ease; }
.tf-inline-head[data-state="done"] { color: #4ec97a; }
.tf-inline-head[data-state="done"] .tf-inline-count { opacity: .8; }
.tf-inline-head[data-state="done"] .tf-inline-current { opacity: .95; }
.tf-inline-head[data-state="running"] .tf-inline-current { color: #e3b341; opacity: .85; }
.tf-inline-count { flex: 0 0 auto; font-variant-numeric: tabular-nums; opacity: .45; }
.tf-inline-current { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: .55; }
.tf-inline-toggle { flex: 0 0 auto; width: 18px; height: 18px; padding: 0; border: 0; background: transparent; color: inherit; opacity: .45; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.tf-chevron { transition: transform .18s ease; }
.tf-inline-toggle[data-collapsed="true"] .tf-chevron { transform: rotate(-90deg); }
.tf-inline-toggle:hover { opacity: .8; }
.tf-inline-list { margin: 4px 0 0; padding: 0 0 0 1px; list-style: none; display: flex; flex-direction: column; gap: 4px; max-height: 172px; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; scrollbar-color: color-mix(in oklab, currentColor 16%, transparent) transparent; }
.tf-inline-list::-webkit-scrollbar { width: 6px; height: 0; }
.tf-inline-list::-webkit-scrollbar-track { background: transparent; }
.tf-inline-list::-webkit-scrollbar-thumb { background: color-mix(in oklab, currentColor 14%, transparent); border-radius: 3px; }
.tf-inline-list::-webkit-scrollbar-thumb:hover { background: color-mix(in oklab, currentColor 26%, transparent); }
.tf-item { list-style: none; }
.tf-item-btn { position: relative; display: flex; align-items: flex-start; gap: 9px; width: 100%; box-sizing: border-box; padding: 6px 7px; border: 0; border-radius: 11px; background: transparent; color: inherit; font: inherit; font-size: 12.5px; line-height: 1.6; text-align: left; cursor: pointer; }
.tf-item-btn:hover, .tf-item-btn[data-active="true"] { background: color-mix(in oklab, currentColor 7%, transparent); }
.tf-item-btn[data-delegated="true"] { background: color-mix(in oklab, #8b7cff 10%, transparent); box-shadow: inset 0 0 0 1px color-mix(in oklab, #8b7cff 24%, transparent); }
.tf-inline-head[data-state="delegated"] .tf-inline-current { color: #a99bff; opacity: .95; }
.tf-item-btn[data-waiting="true"] { background: color-mix(in oklab, #d2a24c 10%, transparent); box-shadow: inset 0 0 0 1px color-mix(in oklab, #d2a24c 48%, transparent), 0 0 10px rgba(210, 162, 76, .10); }
.tf-item-btn[data-waiting="true"]::before { content: ''; position: absolute; inset: 0; border-radius: 11px; padding: 1px; background: color-mix(in oklab, #d2a24c 60%, transparent); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; pointer-events: none; }
.tf-item-btn[data-waiting="true"] .tf-item-mark { color: #d2a24c; opacity: .9; }
.tf-inline-head[data-state="waiting"] .tf-inline-current { color: #d2a24c; opacity: .9; }
.tf-item-btn[data-status="in_progress"]:not([data-waiting="true"]) { background: color-mix(in oklab, #6aa6ff 9%, transparent); box-shadow: 0 0 16px rgba(110, 160, 255, .16), inset 0 0 14px rgba(110, 160, 255, .10); }
.tf-item-btn[data-status="in_progress"]:not([data-waiting="true"])::before { content: ''; position: absolute; inset: 0; border-radius: 11px; padding: 2px; background: conic-gradient(from var(--tf-angle, 0deg), #ff6b6b, #ffd166, #6bcb77, #4d96ff, #b983ff, #ff6b6b); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; opacity: .95; animation: tf-spin 2.4s linear infinite; pointer-events: none; }
.tf-item-btn[data-status="in_progress"]:not([data-waiting="true"])::after { content: ''; position: absolute; inset: 0; border-radius: 11px; pointer-events: none; background: radial-gradient(130% 160% at 12% 0%, rgba(255, 110, 110, .20), transparent 46%), radial-gradient(130% 160% at 50% 0%, rgba(255, 210, 100, .16), transparent 46%), radial-gradient(130% 160% at 88% 0%, rgba(90, 160, 255, .22), transparent 52%); filter: blur(8px); opacity: .8; animation: tf-glow 2.4s ease-in-out infinite; }
.tf-item-mark { flex: 0 0 auto; width: 14px; text-align: center; font-size: 12px; line-height: 1.6; }
.tf-item-btn[data-status="completed"] .tf-item-mark { color: #3fb950; }
.tf-item-btn[data-status="completed"] .tf-item-text { opacity: .52; }
.tf-item-btn[data-status="in_progress"] .tf-item-mark { color: #d29922; }
.tf-item-btn[data-status="in_progress"] .tf-item-text { font-weight: 500; }
.tf-item-btn[data-status="pending"] .tf-item-mark { opacity: .45; }
.tf-item-btn[data-status="pending"] .tf-item-text { opacity: .72; }
.tf-item-text { flex: 1 1 auto; min-width: 0; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; white-space: normal; word-break: break-word; }
.tf-item-parallel { opacity: .5; font-variant-numeric: tabular-nums; }
.tf-item-time { flex: 0 0 auto; opacity: .3; font-size: 11px; font-variant-numeric: tabular-nums; line-height: 1.6; }
.tf-item-hint { flex: 0 0 auto; font-size: 11px; opacity: .26; }
.tf-item-more .tf-item-btn { opacity: .45; font-size: 10.5px; justify-content: center; }
.tf-item-more .tf-item-btn:hover { opacity: .8; }
.tf-item-caret { flex: 0 0 auto; font-size: 12px; opacity: .35; }
.tf-item-btn[data-static="true"] { cursor: default; }
.tf-item-btn[data-static="true"]:hover { background: transparent; }
.tf-detail-summary { line-height: 1.65; margin-bottom: 8px; }
.tf-detail-sec { margin-top: 6px; padding-top: 6px; border-top: 1px solid color-mix(in oklab, currentColor 10%, transparent); }
.tf-detail-list { margin: 2px 0 0; padding-left: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; opacity: .8; }
.tf-detail-list li { line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tf-detail { position: fixed; z-index: 80; min-width: 240px; max-width: min(420px, calc(100vw - 24px)); max-height: 260px; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; scrollbar-color: color-mix(in oklab, currentColor 16%, transparent) transparent; padding: 10px 12px; border-radius: 10px; border: 1px solid color-mix(in oklab, currentColor 10%, transparent); background: color-mix(in oklab, currentColor 3%, rgba(128, 128, 128, .07)); backdrop-filter: blur(26px) saturate(1.25); -webkit-backdrop-filter: blur(26px) saturate(1.25); box-shadow: 0 10px 30px rgba(0, 0, 0, .18); font-size: 12px; color: inherit; }
.tf-detail-title { font-weight: 500; line-height: 1.5; margin-bottom: 6px; }
.tf-detail-row { display: flex; gap: 10px; line-height: 1.7; }
.tf-detail-key { flex: 0 0 58px; opacity: .5; }
.tf-detail-val { flex: 1 1 auto; font-variant-numeric: tabular-nums; }
.tf-row-wrap { list-style: none; }
.tf-row-btn { width: 100%; padding: 2px 4px; border: 0; border-radius: 6px; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.tf-row-btn:hover { background: color-mix(in oklab, currentColor 6%, transparent); }
.tf-row-caret { flex: 0 0 auto; font-size: 9px; opacity: .35; }
.tf-row-detail { display: flex; flex-wrap: wrap; gap: 10px; padding: 1px 0 6px 22px; font-size: 11px; opacity: .55; font-variant-numeric: tabular-nums; }
.tf-tasks { margin: 8px 0 4px; padding: 10px 12px; border-radius: 14px; border: 1px solid color-mix(in oklab, currentColor 13%, transparent); background: color-mix(in oklab, currentColor 3.5%, transparent); }
.tf-tasks-head { display: flex; align-items: center; gap: 6px; width: 100%; padding: 0; margin-bottom: 6px; border: 0; background: transparent; color: inherit; font: inherit; font-size: 11.5px; opacity: .55; font-variant-numeric: tabular-nums; text-align: left; cursor: pointer; }
.tf-tasks-head:hover { opacity: .8; }
.tf-tasks-caret { font-size: 9px; }
.tf-tasks[data-open="false"] .tf-tasks-head { margin-bottom: 0; }
.tf-tasks-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
.tf-tasks-item { display: flex; align-items: flex-start; gap: 8px; line-height: 1.7; font-size: 12.5px; }
.tf-tasks-mark { flex: 0 0 auto; width: 14px; text-align: center; font-size: 12px; }
.tf-tasks-item[data-status="completed"] .tf-tasks-mark { color: #3fb950; }
.tf-tasks-item[data-status="completed"] .tf-tasks-text { opacity: .68; }
.tf-tasks-item[data-status="in_progress"] .tf-tasks-mark { color: #d29922; }
.tf-tasks-item[data-status="in_progress"] .tf-tasks-text { font-weight: 500; }
.tf-tasks-item[data-status="pending"] .tf-tasks-mark { opacity: .45; }
.tf-tasks-item[data-status="pending"] .tf-tasks-text { opacity: .72; }
.tf-tasks-text { flex: 1 1 auto; min-width: 0; }
.tf-header-btn { display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 6px; border: 1px solid color-mix(in oklab, currentColor 14%, transparent); border-radius: 6px; background: transparent; color: inherit; font: inherit; font-size: 11px; line-height: 1; cursor: pointer; opacity: .72; }
.tf-header-btn:hover { opacity: 1; background: color-mix(in oklab, currentColor 7%, transparent); }
.tf-header-count { opacity: .75; font-variant-numeric: tabular-nums; }
.tf-pop { position: fixed; z-index: 70; width: min(430px, calc(100vw - 24px)); max-height: min(62vh, 560px); overflow: auto; padding: 10px 12px 12px; border-radius: 16px; border: 1px solid color-mix(in oklab, currentColor 16%, transparent); background: color-mix(in oklab, currentColor 8%, rgba(128, 128, 128, .18)); backdrop-filter: blur(18px) saturate(1.15); -webkit-backdrop-filter: blur(18px) saturate(1.15); box-shadow: 0 14px 38px rgba(0, 0, 0, .32); font-size: 12px; color: inherit; }
.tf-pop-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-bottom: 6px; margin-bottom: 6px; border-bottom: 1px solid color-mix(in oklab, currentColor 10%, transparent); }
.tf-pop-title { font-size: 12px; font-weight: 600; opacity: .8; }
.tf-body { display: flex; flex-direction: column; gap: 12px; }
.tf-body-actions { display: flex; align-items: center; gap: 10px; }
.tf-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: inherit; opacity: .6; cursor: pointer; font-size: 14px; line-height: 1; }
.tf-icon-btn:hover { opacity: 1; background: color-mix(in oklab, currentColor 8%, transparent); }
.tf-section { display: flex; flex-direction: column; gap: 6px; }
.tf-section-title { display: flex; align-items: center; gap: 6px; opacity: .6; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
.tf-seg { border: 1px solid color-mix(in oklab, currentColor 12%, transparent); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; }
.tf-seg-head { display: flex; align-items: baseline; gap: 8px; }
.tf-seg-title { flex: 1 1 auto; font-weight: 500; }
.tf-seg-meta { flex: 0 0 auto; opacity: .45; font-size: 11px; }
.tf-seg ul { margin: 0; padding-left: 16px; opacity: .85; }
.tf-seg li { margin: 2px 0; line-height: 1.55; }
.tf-list { margin: 0; padding: 2px 0 0; list-style: none; display: flex; flex-direction: column; gap: 3px; font-size: 12px; }
.tf-row { display: flex; align-items: flex-start; gap: 7px; line-height: 1.5; box-sizing: border-box; }
.tf-row[data-status="completed"] .tf-row-text { opacity: .55; }
.tf-row[data-status="in_progress"] .tf-row-text { font-weight: 500; }
.tf-glyph { flex: 0 0 auto; width: 14px; text-align: center; opacity: .8; }
.tf-row-text { flex: 1 1 auto; min-width: 0; }
.tf-row-time { flex: 0 0 auto; font-variant-numeric: tabular-nums; opacity: .5; }
.tf-btn { align-self: flex-start; padding: 4px 10px; border-radius: 7px; border: 1px solid color-mix(in oklab, currentColor 18%, transparent); background: transparent; color: inherit; font: inherit; font-size: 12px; cursor: pointer; }
.tf-btn:hover { background: color-mix(in oklab, currentColor 7%, transparent); }
.tf-btn[disabled] { opacity: .45; cursor: default; }
.tf-empty { opacity: .5; line-height: 1.6; }
.tf-error { color: #e5534b; opacity: .9; }
.tf-settings { display: flex; flex-direction: column; gap: 8px; padding: 4px 0; font-size: 12px; }
.tf-settings-head { font-size: 13px; font-weight: 600; }
.tf-settings-sub { opacity: .55; margin-bottom: 4px; }
.tf-option { display: flex; align-items: flex-start; gap: 9px; padding: 8px 10px; border-radius: 8px; border: 1px solid color-mix(in oklab, currentColor 12%, transparent); background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.tf-option:hover { background: color-mix(in oklab, currentColor 5%, transparent); }
.tf-option[data-selected="true"] { border-color: color-mix(in oklab, #4ec97a 45%, transparent); background: color-mix(in oklab, #4ec97a 8%, transparent); }
.tf-option-mark { flex: 0 0 auto; opacity: .7; }
.tf-option-body { display: flex; flex-direction: column; gap: 2px; }
.tf-option-title { font-weight: 500; }
.tf-option-hint { opacity: .55; font-size: 11px; line-height: 1.5; }
.tf-settings-note { opacity: .45; font-size: 11px; }
`

    const reportedGeometry = new Map()

    /** Report what one surface actually painted, so the host can tell if it is visible. */
    function reportGeometry(part, element, detail) {
      try {
        const rect = element ? element.getBoundingClientRect() : null
        const payload = {
          build: CLIENT_BUILD,
          part,
          mounted: element !== null && element !== undefined,
          visible: !!(rect && rect.width > 0 && rect.height > 0),
          width: rect ? Math.round(rect.width) : 0,
          height: rect ? Math.round(rect.height) : 0,
          detail: String(detail || ''),
        }
        const key = `${payload.mounted}|${payload.visible}|${payload.width}|${payload.height}|${payload.detail}`
        if (reportedGeometry.get(part) === key) return
        reportedGeometry.set(part, key)
        void fetch('/taskflow/client-report', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } catch {
        // Reporting must never disturb rendering.
      }
    }

    /** Measure one surface after every render; identical geometry is deduped. */
    function useReportGeometry(part, ref, detail) {
      React.useEffect(() => {
        reportGeometry(part, ref.current, detail)
      })
    }

    /** Tell the host which browser build just executed (fire and forget). */
    function announce() {
      try {
        void fetch('/taskflow/client-ready', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            build: CLIENT_BUILD,
            href: String((typeof location !== 'undefined' && location.href) || ''),
            ua: String((typeof navigator !== 'undefined' && navigator.userAgent) || ''),
          }),
        })
      } catch {
        // A host without the route is not an error.
      }
    }

    function injectStyles() {
      if (typeof document === 'undefined') return
      // Keyed by build: an HMR swap must replace the stylesheet too. Guarding on
      // "a tag exists" silently kept the FIRST build's CSS forever.
      const existing = document.querySelector('style[data-plugin-css="dsh-plugin-taskflow"]')
      if (existing && existing.dataset.build === CLIENT_BUILD && existing.textContent === CSS) return
      const style = existing || document.createElement('style')
      style.dataset.plugin = ID
      style.dataset.pluginCss = ID
      style.dataset.build = CLIENT_BUILD
      style.textContent = CSS
      if (!existing) document.head.appendChild(style)
    }

    /* ------------------------------------------------------------------ *
     * Host state (fetched over the plugin's own HTTP route)
     * ------------------------------------------------------------------ */

    const EMPTY = Object.freeze({ loaded: false })
    const bySession = new Map()
    const listeners = new Set()
    const inflight = new Map()

    const store = {
      activeSession: null,
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      snapshot(sessionId) {
        if (!sessionId) return EMPTY
        return bySession.get(sessionId) || EMPTY
      },
      peek(sessionId) {
        return sessionId ? bySession.get(sessionId) || null : null
      },
      setActive(sessionId) {
        if (this.activeSession === sessionId) return
        this.activeSession = sessionId
        if (sessionId) void refresh(sessionId)
        this.emit()
      },
      put(sessionId, value) {
        const previous = bySession.get(sessionId)
        bySession.set(sessionId, value)
        if (previous
          && previous.updatedAt === value.updatedAt
          && previous.pending === value.pending
          && previous.lastTurn === value.lastTurn
          && previous.openTurn === value.openTurn
          && previous.delegates === value.delegates
          && previous.segmentCount === value.segmentCount
          && (previous.latestSegment?.turn ?? null) === (value.latestSegment?.turn ?? null)
          && previous.tasks?.updatedAt === value.tasks?.updatedAt) return
        this.emit()
      },
      emit() {
        for (const listener of listeners) {
          try {
            listener()
          } catch {
            // A broken subscriber must not stop the others.
          }
        }
      },
    }

    let hostAvailable = true
    /** Live SSE subscription for the active session (null when unavailable). */
    /** sessionId → { refs, source, healthy, failures, retry } — one push per open conversation. */
    const streams = new Map()

    function streamHealthy(sessionId) {
      const entry = streams.get(sessionId)
      return entry ? entry.healthy === true : false
    }

    function closeStream(sessionId) {
      const entry = streams.get(sessionId)
      if (!entry) return
      if (entry.retry !== null) window.clearTimeout(entry.retry)
      if (entry.source) {
        try {
          entry.source.close()
        } catch {
          // already closed
        }
      }
      streams.delete(sessionId)
    }

    function scheduleRetry(sessionId) {
      const entry = streams.get(sessionId)
      if (!entry || entry.failures > 6 || typeof window === 'undefined') return
      if (entry.retry !== null) window.clearTimeout(entry.retry)
      const delay = Math.min(30000, 2000 * 2 ** (entry.failures - 1))
      entry.retry = window.setTimeout(() => {
        if (!streams.has(sessionId)) return
        entry.retry = null
        openStream(sessionId)
      }, delay)
    }

    /** Open the push connection for one session (idempotent). */
    function openStream(sessionId) {
      const entry = streams.get(sessionId)
      if (!entry || entry.source || typeof EventSource === 'undefined') return
      let source
      try {
        source = new EventSource(`/taskflow/events?session=${encodeURIComponent(sessionId)}`)
      } catch {
        entry.failures += 1
        scheduleRetry(sessionId)
        return
      }
      entry.source = source
      source.addEventListener('state', (event) => {
        try {
          const data = JSON.parse(event.data)
          if (!data || data.ok !== true) return
          entry.healthy = true
          entry.failures = 0
          store.put(sessionId, { ...data, loaded: true, fetchedAt: Date.now() })
        } catch {
          // ignore malformed frame
        }
      })
      source.addEventListener('error', () => {
        entry.healthy = false
        try {
          source.close()
        } catch {
          // already closed
        }
        if (entry.source === source) entry.source = null
        entry.failures += 1
        scheduleRetry(sessionId)
      })
    }

    /**
     * Watch one session while a surface is mounted. Every open conversation gets
     * its own push + refresh, so switching sessions never starves the others.
     */
    function watchSession(sessionId) {
      if (typeof window === 'undefined' || !sessionId) return () => {}
      let entry = streams.get(sessionId)
      if (!entry) {
        entry = { refs: 0, source: null, healthy: false, failures: 0, retry: null }
        streams.set(sessionId, entry)
      }
      entry.refs += 1
      void refresh(sessionId)
      openStream(sessionId)
      return () => {
        const current = streams.get(sessionId)
        if (!current) return
        current.refs -= 1
        if (current.refs <= 0) closeStream(sessionId)
      }
    }

    /** Opens the sidebar tab that lists every segment summary. */
    let openSidebar = null
    /** Which task's detail popover is open; module scope so remounts keep it. */
    const uiState = { detail: null }

    /** Fetch one session's TaskFlow state; failures degrade the UI, never throw. */
    async function refresh(sessionId) {
      if (!sessionId || !hostAvailable) return
      if (inflight.has(sessionId)) return inflight.get(sessionId)
      const task = (async () => {
        try {
          const response = await fetch(`/taskflow/state?session=${encodeURIComponent(sessionId)}`, {
            credentials: 'same-origin',
            headers: { accept: 'application/json' },
          })
          if (!response.ok) {
            if (response.status === 404 || response.status === 401) hostAvailable = false
            return
          }
          const data = await response.json()
          if (!data || data.ok !== true) return
          store.put(sessionId, { ...data, loaded: true, fetchedAt: Date.now() })
        } catch {
          // Offline host (desktop file://) or the route is not mounted: keep the
          // last snapshot and stay quiet.
        } finally {
          inflight.delete(sessionId)
        }
      })()
      inflight.set(sessionId, task)
      return task
    }

    /** Ask the host to summarize the newest turn that has no segment yet. */
    async function requestSummary(sessionId) {
      try {
        const response = await fetch('/taskflow/summarize', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ session: sessionId }),
        })
        const data = await response.json().catch(() => null)
        window.setTimeout(() => void refresh(sessionId), 400)
        return { ok: response.ok && data?.ok === true, reason: data?.reason ?? data?.error ?? '' }
      } catch (error) {
        return { ok: false, reason: String(error?.message ?? error) }
      }
    }

    let poller = null
    /**
     * Self-rescheduling poll. A running turn needs near-real-time status
     * (paused / subagent / summary flags), an idle conversation does not.
     */
    function startPoller() {
      if (poller !== null || typeof window === 'undefined') return
      poller = true
      const tick = () => {
        if (poller === null) return
        const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
        const watched = [...streams.keys()]
        if (!hidden) {
          for (const sessionId of watched) void refresh(sessionId)
        }
        const busy = watched.some((sessionId) => {
          const snapshot = store.peek(sessionId)
          return snapshot ? (typeof snapshot.openTurn === 'number' || snapshot.pending === true) : false
        })
        const allPushed = watched.length > 0 && watched.every((sessionId) => streamHealthy(sessionId))
        // A healthy push stream makes polling a pure safety net.
        const next = allPushed ? 8000 : (busy ? POLL_MS_ACTIVE : POLL_MS_IDLE)
        window.setTimeout(tick, next)
      }
      window.setTimeout(tick, POLL_MS_ACTIVE)
      // Coming back to the window should not wait for the next tick.
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible' && store.activeSession) void refresh(store.activeSession)
        })
      }
    }

    /* ------------------------------------------------------------------ *
     * React helpers
     * ------------------------------------------------------------------ */

    function useSnapshot(sessionId) {
      return React.useSyncExternalStore(
        store.subscribe,
        () => store.snapshot(sessionId),
        () => store.snapshot(sessionId),
      )
    }

    function useNow(enabled) {
      const [now, setNow] = React.useState(() => Date.now())
      React.useEffect(() => {
        if (!enabled) return undefined
        const timer = window.setInterval(() => setNow(Date.now()), 1000)
        return () => window.clearInterval(timer)
      }, [enabled])
      return now
    }

    /** Bound a one-line label, counting every character (CJK included) as one. */
    function clip(value, limit) {
      const text = String(value ?? '').replace(/\s+/g, ' ').trim()
      return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`
    }

    /** Local wall-clock time for a timestamp, e.g. 09:12:33. */
    function fmtClock(timestamp) {
      try {
        return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })
      } catch {
        return '--:--:--'
      }
    }

    function fmtDuration(ms) {
      const total = Math.max(0, Math.round((Number(ms) || 0) / 1000))
      if (total < 60) return `${total}s`
      const minutes = Math.floor(total / 60)
      const seconds = total % 60
      if (minutes < 60) return seconds === 0 ? `${minutes}m` : `${minutes}m${seconds}s`
      const hours = Math.floor(minutes / 60)
      const rest = minutes % 60
      return rest === 0 ? `${hours}h` : `${hours}h${rest}m`
    }

    function statusGlyph(status) {
      if (status === 'completed') return '✓'
      if (status === 'in_progress') return '◐'
      return '○'
    }

    /**
     * The list to show. DSH clears the `todos` projection on every turn start, so
     * fall back to the host's last recorded snapshot to keep the list visible
     * between turns instead of blanking it.
     */
    function currentTodos(projection) {
      // Only the live turn's list belongs above the composer. DSH clears the
      // `todos` projection on every turn start, which is exactly the moment the
      // previous round's list should fold back into that round's transcript.
      return Array.isArray(projection) ? projection : []
    }

    /** Per-task timing for the current list, merging projection + host timings. */
    function mergeTasks(todos, snapshot, now = Date.now()) {
      const items = snapshot?.tasks?.items ?? {}
      return (todos || []).map((todo) => {
        const timing = items[todo.content]
        let elapsed = null
        if (todo.status === 'completed' && timing?.startedAt && timing?.completedAt) elapsed = timing.completedAt - timing.startedAt
        else if (todo.status === 'in_progress' && timing?.pausedAt && timing?.startedAt && !snapshot?.delegates) elapsed = timing.pausedAt - timing.startedAt
        else if (todo.status === 'in_progress' && timing?.startedAt) elapsed = now - timing.startedAt
        return { ...todo, elapsed }
      })
    }

    /* ------------------------------------------------------------------ *
     * Dock strip
     * ------------------------------------------------------------------ */

    /**
     * Per-surface error boundary: a render error blanks that surface and is
     * reported, then retried once after a pause. Without it, one bad frame
     * unmounts the whole plugin entry and the user sees "nothing happens".
     */
    class SurfaceBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false }
        this.timer = null
      }

      static getDerivedStateFromError() {
        return { failed: true }
      }

      componentDidCatch(error) {
        reportGeometry('crash', null, `${this.props.part}: ${String(error?.message ?? error)}`)
        if (this.timer) window.clearTimeout(this.timer)
        this.timer = window.setTimeout(() => this.setState({ failed: false }), 5000)
      }

      componentWillUnmount() {
        if (this.timer) window.clearTimeout(this.timer)
      }

      render() {
        return this.state.failed ? null : this.props.children
      }
    }

    const guarded = (part, Component) => (props) => h(SurfaceBoundary, { part }, h(Component, props))

    const DOCK_MODE_KEY = 'taskflow.dockMode'
    const dockModeListeners = new Set()

    /** 'custom' (our panel) or 'builtin' (DSH's own panel). */
    function readDockMode() {
      try {
        if (typeof window !== 'undefined' && typeof window.__DSH_TASKFLOW_REPLACE_DOCK__ === 'boolean') {
          return window.__DSH_TASKFLOW_REPLACE_DOCK__ ? 'custom' : 'builtin'
        }
        const stored = window.localStorage?.getItem(DOCK_MODE_KEY)
        if (stored === 'custom' || stored === 'builtin') return stored
      } catch {
        // storage unavailable: fall through to the default
      }
      return DEFAULT_DOCK_MODE
    }

    function writeDockMode(mode) {
      try {
        window.localStorage?.setItem(DOCK_MODE_KEY, mode)
      } catch {
        // ignore
      }
      for (const listener of dockModeListeners) {
        try {
          listener(mode)
        } catch {
          // ignore
        }
      }
    }

    /** Crisp progress ring: an SVG stroke fills with the done ratio. */
    function ProgressRing(props) {
      const size = props.size || 14
      const stroke = 1.7
      const radius = (size - stroke) / 2
      const circumference = 2 * Math.PI * radius
      const ratio = Math.max(0, Math.min(1, Number(props.ratio) || 0))
      return h('svg', {
        width: size,
        height: size,
        viewBox: `0 0 ${size} ${size}`,
        className: 'tf-ring-svg',
        'aria-hidden': true,
      },
      h('circle', {
        cx: size / 2,
        cy: size / 2,
        r: radius,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-opacity': 0.16,
        'stroke-width': stroke,
      }),
      h('circle', {
        cx: size / 2,
        cy: size / 2,
        r: radius,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-opacity': 0.85,
        'stroke-width': stroke,
        'stroke-linecap': 'round',
        'stroke-dasharray': `${circumference} ${circumference}`,
        'stroke-dashoffset': `${circumference * (1 - ratio)}`,
        transform: `rotate(-90 ${size / 2} ${size / 2})`,
        style: { transition: 'stroke-dashoffset .45s cubic-bezier(.4,0,.2,1)' },
      }))
    }

    function TaskStrip(props) {
      const sessionId = props.sessionId
      const snapshot = useSnapshot(sessionId)
      const todos = props.useProjection ? props.useProjection('todos') : undefined
      const projectionList = currentTodos(todos)
      // Compatibility fallback: the shipped `todos` projection is empty for
      // sessions this window has not opened yet (and would be missing entirely
      // if DSH ever renames it). The host keeps the last list it saw, and clears
      // it when a new turn starts, so switching conversations never blanks the
      // panel.
      const hostList = Array.isArray(snapshot.currentList) ? snapshot.currentList : []
      const list = projectionList.length > 0 ? projectionList : hostList
      const [collapsed, setCollapsed] = React.useState(props.compact === true)
      const [showAllDone, setShowAllDone] = React.useState(false)
      const [detail, setDetailState] = React.useState(uiState.detail)
      const [detailItem, setDetailItem] = React.useState(null)
      const setDetail = (value) => {
        uiState.detail = value
        setDetailState(value)
      }
      const rootRef = React.useRef(null)
      const liveLayout = React.useRef(null)
      const detailRef = React.useRef(null)
      const detailAnchor = React.useRef(null)

      React.useEffect(() => {
        store.setActive(sessionId)
        return watchSession(sessionId)
      }, [sessionId])

      // The projection changes exactly when the agent writes the list, so pull
      // our own state at that moment instead of waiting for the next poll.
      React.useEffect(() => {
        if (sessionId) void refresh(sessionId)
      }, [sessionId, todos])

      // The list and its detail only change on user action. Nothing auto-opens:
      // switching conversations must not pop a panel in the user's face.

      const turnOpen = typeof snapshot.openTurn === 'number'
      const delegated = Number(snapshot.delegates) > 0
      // A subagent still working means the work is NOT paused, even though this
      // turn is over.
      const waiting = !turnOpen && !delegated
      const active = list.find((todo) => todo.status === 'in_progress')
      const running = list.filter((todo) => todo.status === 'in_progress').length
      const parallel = running > 1
      const total = list.length
      const done = list.filter((todo) => todo.status === 'completed').length
      const segmentCount = Number(snapshot.segmentCount) || 0
      const latest = snapshot.latestSegment || null
      const layoutNote = liveLayout.current ? JSON.stringify(liveLayout.current) : ''
      const ratio = total === 0 ? 0 : Math.round((done / total) * 100)

      // Follow the composer card: inside the composer wrapper, the widest element
      // narrower than the wrapper itself is the rounded input card. Copy its
      // width and left edge so the list sits exactly under the input.
      React.useEffect(() => {
        const element = rootRef.current
        const parent = element ? element.parentElement : null
        const stack = parent ? parent.parentElement : null
        if (!element || !parent || !stack || typeof window === 'undefined') return undefined
        let observer = null
        let aligned = null
        const align = () => {
          const stackRect = stack.getBoundingClientRect()
          if (stackRect.width === 0) return
          // Anchor on the input editor and walk up: the last ancestor narrower
          // than the composer stack is the rounded input card.
          const editor = stack.querySelector('[contenteditable="true"]')
            || document.querySelector('[contenteditable="true"]')
          let card = null
          let node = editor
          while (node && node !== stack && node !== document.body) {
            const rect = node.getBoundingClientRect()
            if (rect.width > 0 && rect.width < stackRect.width - 1) {
              card = { width: rect.width, left: rect.left }
            }
            node = node.parentElement
          }
          if (!card) return
          element.style.position = 'relative'
          element.style.left = '0px'
          element.style.width = `${Math.round(card.width)}px`
          const current = element.getBoundingClientRect()
          const offset = Math.max(0, Math.round(card.left - current.left))
          element.style.left = `${offset}px`
          liveLayout.current = {
            width: Math.round(card.width),
            offset,
            cardLeft: Math.round(card.left),
            staticLeft: Math.round(current.left),
            editor: editor ? Math.round(editor.getBoundingClientRect().width) : null,
          }
          reportGeometry('dock', element, `aligned ${JSON.stringify(liveLayout.current)}`)
        }
        align()
        // The composer may mount after this dock entry, so retry briefly.
        const retries = [200, 700, 1500, 3000].map((delay) => window.setTimeout(align, delay))
        window.addEventListener('resize', align)
        try {
          if (typeof ResizeObserver !== 'undefined') {
            observer = new ResizeObserver(align)
            observer.observe(stack)
          }
        } catch {
          observer = null
        }
        return () => {
          for (const timer of retries) window.clearTimeout(timer)
          window.removeEventListener('resize', align)
          if (observer) observer.disconnect()
        }
      }, [total, collapsed])

      useReportGeometry('dock', rootRef, `${collapsed ? 'collapsed' : 'open'} / ${total} tasks / ${segmentCount} segments / sse:${streamHealthy(sessionId) ? 'live' : 'poll'}${layoutNote ? ` / ${layoutNote}` : ''}`)



      useReportGeometry('detail', detailRef, detail ? detail.content : 'closed')

      // Open one task's detail; the anchor is the row that was clicked.
      const openDetail = (content, element) => {
        detailAnchor.current = element || null
        setDetail({ content, sessionId })
      }

      // While a detail is open: close on outside click / Esc, follow the anchor.
      React.useEffect(() => {
        if (!detail) return undefined
        const onPointerDown = (event) => {
          if (detailRef.current && detailRef.current.contains(event.target)) return
          if (detailAnchor.current && detailAnchor.current.contains(event.target)) return
          setDetail(null)
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setDetail(null)
        }
        document.addEventListener('mousedown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown)
        return () => {
          document.removeEventListener('mousedown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown)
        }
      }, [detail])

      // Steps and files are no longer carried in the poll frame: pull them when
      // the popover opens.
      React.useEffect(() => {
        if (!detail || !detail.content) {
          setDetailItem(null)
          return undefined
        }
        let cancelled = false
        const load = async () => {
          try {
            const response = await fetch(`/taskflow/task?session=${encodeURIComponent(detail.sessionId || store.activeSession || '')}&content=${encodeURIComponent(detail.content)}`, {
              credentials: 'same-origin',
              headers: { accept: 'application/json' },
            })
            if (!response.ok) return
            const data = await response.json()
            if (!cancelled && data && data.ok) setDetailItem(data.item)
          } catch {
            // keep the light item as a fallback
          }
        }
        void load()
        return () => {
          cancelled = true
        }
      }, [detail?.content])

      // Nothing at all yet: still show that the plugin is here, so every
      // conversation has the same anchor instead of silently disappearing.
      // While a turn is open, say "planning" instead of "nothing here" — the
      // list is about to arrive, and the user should see that immediately.
      if (total === 0 && !latest) {
        return h('div', { className: 'tf-float', ref: rootRef },
          h('div', { className: 'tf-inline tf-inline-empty' },
            h('div', { className: 'tf-inline-head' },
              turnOpen
                ? h('span', { className: 'tf-dot', 'aria-hidden': true })
                : h('span', { className: 'tf-empty-dot', 'aria-hidden': true }, '◌'),
              h('span', { className: 'tf-inline-current' },
                turnOpen ? t('panel.planning') : t('panel.emptySession')))))
      }

      // No task list: fall back to the one-line summary pill (click -> sidebar).
      if (total === 0) {
        if (!latest) return null
        return h('div', { className: 'tf-float', ref: rootRef },
          h('div', { className: 'tf-pill', 'data-kind': 'summary' },
            h('button', {
              type: 'button',
              className: 'tf-ring',
              title: t('strip.sidebar'),
              'aria-label': t('strip.sidebar'),
              onClick: () => {
                if (typeof openSidebar === 'function') openSidebar()
              },
            }, h(ProgressRing, { ratio: total === 0 ? 1 : done / total, size: 14 })),
            h('button', {
              type: 'button',
              className: 'tf-pill-main',
              title: `${latest.title} · ${t('strip.open')}`,
              'aria-label': t('strip.open'),
              onClick: () => {
                if (typeof openSidebar === 'function') openSidebar()
              },
            },
            h('span', { className: 'tf-pill-text' }, clip(latest.title || '', 20)))))
      }

      const merged = mergeTasks(list, snapshot, Date.now())
      const finished = merged.filter((todo) => todo.status === 'completed')
      const hiddenDone = showAllDone ? 0 : Math.max(0, finished.length - 3)
      const visible = hiddenDone === 0
        ? merged
        : merged.filter((todo) => todo.status !== 'completed' || finished.indexOf(todo) >= hiddenDone)
      const moreRow = hiddenDone > 0
        ? h('li', { key: '__more', className: 'tf-item tf-item-more' },
          h('button', {
            type: 'button',
            className: 'tf-item-btn',
            'data-more': 'true',
            onClick: () => setShowAllDone(true),
          }, h('span', { className: 'tf-item-text' }, t('tasks.moreDone', { count: hiddenDone }))))
        : null

      const rows = visible.map((todo) => {
        const item = snapshot.tasks?.items?.[todo.content] || {}
        const summary = typeof item.summary === 'string' ? item.summary : ''
        const hint = summary
          ? ''
          : item.summaryPending
            ? t('tasks.summary.pending')
            : todo.status === 'completed' ? t('tasks.summary.none') : ''
        const body = [
          h('span', { className: 'tf-item-mark', 'data-state': todo.status, 'aria-hidden': true },
            todo.status === 'in_progress'
              ? (waiting ? '⏸' : h('span', { className: 'tf-dot' }))
              : statusGlyph(todo.status)),
          h('span', { className: 'tf-item-text' },
            parallel && todo.status === 'in_progress' ? h('span', { className: 'tf-item-parallel' }, '∥ ') : null,
            todo.content),
          hint ? h('span', { className: 'tf-item-hint' }, hint) : null,
          todo.elapsed !== null ? h('span', { className: 'tf-item-time' }, fmtDuration(todo.elapsed)) : null,
          summary ? h('span', { className: 'tf-item-caret', 'aria-hidden': true }, '›') : null,
        ]
        return h('li', { key: todo.content, className: 'tf-item' },
          summary
            ? h('button', {
              type: 'button',
              className: 'tf-item-btn',
              'data-status': todo.status,
              'data-active': detail && detail.content === todo.content ? 'true' : 'false',
              title: summary,
              onClick: (event) => openDetail(todo.content, event.currentTarget),
            }, body)
            : h('div', { className: 'tf-item-btn', 'data-status': todo.status, 'data-static': 'true' }, body))
      })

      const detailTiming = detail
        ? { ...(snapshot.tasks?.items?.[detail.content] || {}), ...(detailItem || {}) }
        : {}
      const detailElapsed = (() => {
        if (detailTiming.startedAt && detailTiming.completedAt) return detailTiming.completedAt - detailTiming.startedAt
        if (detailTiming.startedAt) return Date.now() - detailTiming.startedAt
        return null
      })()

      const detailPopover = detail && ReactDOM && typeof ReactDOM.createPortal === 'function'
        ? ReactDOM.createPortal(h('div', {
          className: 'tf-detail',
          ref: detailRef,
          style: (() => {
            const anchor = detailAnchor.current
            const rect = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null
            if (!rect) return { right: '16px', bottom: '120px', width: '320px' }
            const width = Math.min(340, Math.max(240, window.innerWidth - 32))
            const left = Math.min(Math.max(12, rect.right - width), window.innerWidth - width - 12)
            const below = rect.bottom + 8
            const above = rect.top - 8
            return below + 150 < window.innerHeight
              ? { left: `${left}px`, top: `${below}px`, width: `${width}px` }
              : { left: `${left}px`, bottom: `${Math.max(12, window.innerHeight - above)}px`, width: `${width}px` }
          })(),
        },
        h('div', { className: 'tf-detail-title' }, detail.content),
        h('div', { className: 'tf-detail-summary' }, detailTiming.summary || ''),
        detailTiming.startedAt
          ? h('div', { className: 'tf-detail-row' },
            h('span', { className: 'tf-detail-key' }, t('tasks.detail.start', { time: '' }).replace(/\s+$/, '')),
            h('span', { className: 'tf-detail-val' }, fmtClock(detailTiming.startedAt)))
          : null,
        detailTiming.completedAt
          ? h('div', { className: 'tf-detail-row' },
            h('span', { className: 'tf-detail-key' }, t('tasks.detail.done', { time: '' }).replace(/\s+$/, '')),
            h('span', { className: 'tf-detail-val' }, fmtClock(detailTiming.completedAt)))
          : null,
        detailElapsed !== null
          ? h('div', { className: 'tf-detail-row' },
            h('span', { className: 'tf-detail-key' }, t('tasks.detail.spent', { value: '' }).replace(/\s+$/, '')),
            h('span', { className: 'tf-detail-val' }, fmtDuration(detailElapsed)))
          : null,
        Array.isArray(detailTiming.steps) && detailTiming.steps.length > 0
          ? h('div', { className: 'tf-detail-sec' },
            h('div', { className: 'tf-detail-key' }, t('tasks.detail.steps')),
            h('ul', { className: 'tf-detail-list' },
              detailTiming.steps.slice(-6).map((step, index) => h('li', { key: index },
                `${step.n}${step.a ? ` · ${step.a}` : ''}`))))
          : null,
        Array.isArray(detailTiming.files) && detailTiming.files.length > 0
          ? h('div', { className: 'tf-detail-sec' },
            h('div', { className: 'tf-detail-key' }, t('tasks.detail.files')),
            h('ul', { className: 'tf-detail-list' },
              detailTiming.files.slice(0, 6).map((file, index) => h('li', { key: index }, file))))
          : null), document.body)
        : null

      return h(React.Fragment, null,
        h('div', {
          className: 'tf-inline',
          ref: rootRef,
          'data-running': active ? 'true' : 'false',
        },
          h('div', {
            className: 'tf-inline-head',
            'data-state': active && waiting ? 'waiting' : (active && delegated ? 'delegated' : (total > 0 && done === total ? 'done' : (active ? 'running' : 'idle'))),
          },
            h('button', {
              type: 'button',
              className: 'tf-ring',
              title: t('strip.sidebar'),
              'aria-label': t('strip.sidebar'),
              onClick: () => {
                if (typeof openSidebar === 'function') openSidebar()
              },
            }, h(ProgressRing, { ratio: total === 0 ? 1 : done / total, size: 14 })),
            h('span', { className: 'tf-inline-count' }, `${done}/${total}`),
            h('span', { className: 'tf-inline-current' },
              active
                ? (waiting
                  ? `${t('status.waiting')}：${clip(active.content, 30)}`
                  : (delegated ? `${t('status.delegated')}：${clip(active.content, 30)}` : active.content))
                : (done === total ? t('status.allDone') : '')),
            h('button', {
              type: 'button',
              className: 'tf-inline-toggle',
              'data-collapsed': collapsed ? 'true' : 'false',
              'aria-label': collapsed ? t('strip.expand') : t('strip.collapse'),
              title: collapsed ? t('strip.expand') : t('strip.collapse'),
              onClick: () => setCollapsed((value) => !value),
            },
            h('svg', {
              className: 'tf-chevron',
              width: 14,
              height: 14,
              viewBox: '0 0 16 16',
              'aria-hidden': true,
            }, h('path', {
              d: 'M4 6l4 4 4-4',
              fill: 'none',
              stroke: 'currentColor',
              'stroke-width': 1.6,
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
            })))),
          collapsed ? null : h('ul', { className: 'tf-inline-list' }, rows)),
        detailPopover)
    }

    const TaskStripEntry = (props) => h(SurfaceBoundary, { part: 'dock' }, h(TaskStrip, props))

    /* ------------------------------------------------------------------ *
     * Todo list card in the transcript (replaces the built-in one-liner)
     * ------------------------------------------------------------------ */

    /** Read a tool call's arguments, tolerating both block shapes. */
    function callArgs(block) {
      const raw = block && 'kind' in block ? block.call?.argsRaw : block?.argsRaw
      if (raw && typeof raw === 'object') return raw
      if (typeof raw !== 'string' || raw.length === 0) return {}
      try {
        return JSON.parse(raw)
      } catch {
        return {}
      }
    }

    function TaskflowIcon(props) {
      const size = props?.size ?? 16
      return h('svg', { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true },
        h('rect', { x: 1.5, y: 2.5, width: 13, height: 3, rx: 1, fill: 'currentColor', opacity: 0.9 }),
        h('rect', { x: 1.5, y: 7, width: 9, height: 2, rx: 1, fill: 'currentColor', opacity: 0.6 }),
        h('rect', { x: 1.5, y: 10.5, width: 6, height: 2, rx: 1, fill: 'currentColor', opacity: 0.4 }))
    }

    function TodoCard(props) {
      const args = callArgs(props.block)
      const todos = Array.isArray(args.todos) ? args.todos : []
      const rootRef = React.useRef(null)
      const done = todos.filter((todo) => todo.status === 'completed').length
      const allDone = todos.length > 0 && done === todos.length
      // Finished rounds collapse to one line inside that round's transcript;
      // the live list stays open while work is still running.
      const [open, setOpen] = React.useState(!allDone)
      useReportGeometry('taskcard', rootRef, `${todos.length} items ${open ? 'open' : 'folded'}`)

      // A call still streaming its arguments renders nothing, so the transcript
      // never flashes an empty card.
      if (todos.length === 0) return null

      return h('div', { className: 'tf-tasks', 'data-open': open ? 'true' : 'false', ref: rootRef },
        h('button', {
          type: 'button',
          className: 'tf-tasks-head',
          'aria-expanded': open,
          onClick: () => setOpen((value) => !value),
        },
        h('span', { className: 'tf-tasks-caret', 'aria-hidden': true }, open ? '▾' : '▸'),
        h('span', null, t('tasks.header', { total: todos.length, done, open: todos.length - done }))),
        open ? h('ul', { className: 'tf-tasks-list' }, todos.map((todo, index) => h('li', {
          key: `${index}-${todo.content}`,
          className: 'tf-tasks-item',
          'data-status': todo.status,
        },
        h('span', { className: 'tf-tasks-mark', 'aria-hidden': true },
          todo.status === 'completed' ? '✔' : todo.status === 'in_progress' ? '◐' : '□'),
        h('span', { className: 'tf-tasks-text' }, todo.content)))) : null)
    }

    const TodoCardEntry = (props) => h(SurfaceBoundary, { part: 'taskcard' }, h(TodoCard, props))

    /* ------------------------------------------------------------------ *
     * Floating card content
     * ------------------------------------------------------------------ */

    function SummaryPanel(props) {
      const sessionId = props.sessionId
      const snapshot = useSnapshot(sessionId)
      const [busy, setBusy] = React.useState(false)
      const [note, setNote] = React.useState('')
      const now = useNow(true)
      const rootRef = React.useRef(null)
      const [segments, setSegments] = React.useState([])
      const segmentCount = Number(snapshot.segmentCount) || 0
      React.useEffect(() => {
        let cancelled = false
        const load = async () => {
          try {
            const response = await fetch(`/taskflow/segments?session=${encodeURIComponent(sessionId)}`, {
              credentials: 'same-origin',
              headers: { accept: 'application/json' },
            })
            if (!response.ok) return
            const data = await response.json()
            if (!cancelled && data && data.ok) setSegments(data.segments || [])
          } catch {
            // keep whatever we already have
          }
        }
        void load()
        return () => {
          cancelled = true
        }
      }, [sessionId, segmentCount])
      useReportGeometry('sidebar', rootRef, `${segments.length} segments`)

      React.useEffect(() => {
        store.setActive(sessionId)
        void refresh(sessionId)
      }, [sessionId])

      const ordered = segments.slice().sort((a, b) => b.turn - a.turn)

      const summarize = async () => {
        setBusy(true)
        setNote('')
        const result = await requestSummary(sessionId)
        setBusy(false)
        if (!result.ok) setNote(result.reason || 'FAILED')
        window.setTimeout(() => void refresh(sessionId), 600)
      }

      const segmentRows = ordered.map((segment) => h('div', { key: segment.turn, className: 'tf-seg' },
        h('div', { className: 'tf-seg-head' },
          h('span', { className: 'tf-seg-title' }, segment.title || t('card.turn', { turn: segment.turn })),
          h('span', { className: 'tf-seg-meta' },
            [t('card.turn', { turn: segment.turn }),
              segment.toolCalls ? t('card.steps', { count: segment.toolCalls }) : '',
              segment.durationMs ? fmtDuration(segment.durationMs) : ''].filter(Boolean).join(' · '))),
        Array.isArray(segment.bullets) && segment.bullets.length > 0
          ? h('ul', null, segment.bullets.map((bullet, index) => h('li', { key: index }, bullet)))
          : null,
        segment.mechanical ? h('span', { className: 'tf-seg-meta' }, t('card.mechanical')) : null))

      return h('div', { className: 'tf-panel', ref: rootRef },
        h('div', { className: 'tf-panel-head' },
          h('span', { className: 'tf-panel-title' }, t('panel.title')),
          h('span', { className: 'tf-panel-sub' }, t('panel.allSummaries'))),
        h('div', { className: 'tf-section' },
          segments.length === 0
            ? h('div', { className: 'tf-empty' }, t('panel.empty'))
            : segmentRows,
          h('div', { className: 'tf-body-actions' },
            h('button', {
              type: 'button',
              className: 'tf-btn',
              disabled: busy,
              onClick: () => void summarize(),
            }, busy ? t('panel.summarizing') : t('panel.summarize')),
            h('span', { className: 'tf-seg-meta' }, `${t('panel.updated')} ${fmtDuration(now - (snapshot.updatedAt || now))}`)),
          note ? h('div', { className: 'tf-error' }, note) : null))
    }

    const SummaryPanelEntry = (props) => h(SurfaceBoundary, { part: 'sidebar' }, h(SummaryPanel, props))

    /* ------------------------------------------------------------------ *
     * Settings page: pick our panel or the shipped one
     * ------------------------------------------------------------------ */

    function TaskflowSettings() {
      const [mode, setMode] = React.useState(() => readDockMode())
      React.useEffect(() => {
        const listener = (next) => setMode(next)
        dockModeListeners.add(listener)
        return () => dockModeListeners.delete(listener)
      }, [])

      const choose = (next) => {
        writeDockMode(next)
        if (typeof applyDockModeRef.current === 'function') applyDockModeRef.current(next)
        setMode(next)
      }

      const option = (value, label, hint) => h('button', {
        type: 'button',
        className: 'tf-option',
        'data-selected': mode === value ? 'true' : 'false',
        onClick: () => choose(value),
      },
      h('span', { className: 'tf-option-mark', 'aria-hidden': true }, mode === value ? '◉' : '○'),
      h('span', { className: 'tf-option-body' },
        h('span', { className: 'tf-option-title' }, label),
        h('span', { className: 'tf-option-hint' }, hint)))

      return h('div', { className: 'tf-settings' },
        h('div', { className: 'tf-settings-head' }, t('settings.title')),
        h('div', { className: 'tf-settings-sub' }, t('settings.subtitle')),
        option('custom', t('settings.custom'), t('settings.customHint')),
        option('builtin', t('settings.builtin'), t('settings.builtinHint')),
        h('div', { className: 'tf-settings-note' }, t('settings.note')))
    }

    const applyDockModeRef = { current: null }

    /* ------------------------------------------------------------------ *
     * Wiring
     * ------------------------------------------------------------------ */

    /** Run one registration step; a failing surface must not take the others down. */
    function safe(ctx, label, run) {
      try {
        run()
      } catch (error) {
        try {
          console.error(`[taskflow] ${label} failed:`, error)
        } catch {
          // console may be unavailable in a stripped host
        }
      }
    }

    const name = 'taskflow'
    const inject = ['slots', 'locale']

    function apply(ctx) {
      const applied = {}
      const mark = (label, run) => safe(ctx, label, () => {
        run()
        applied[label] = true
      })
      try {
        fallbackLang = String((typeof navigator !== 'undefined' && navigator.language) || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en'
      } catch {
        fallbackLang = 'zh'
      }
      mark('styles', () => injectStyles())
      mark('handshake', () => announce())

      // Dictionaries + a bound translator. `locale` is declared in `inject`, so
      // the service is present here; the guard keeps a stripped-down host alive.
      if (ctx.locale && typeof ctx.locale.register === 'function') {
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'taskflow: dictionaries')
        try {
          bound = ctx.locale.bind(NS)
        } catch {
          bound = null
        }
      }

      // One surface only: a floating pill above the composer that expands into a
      // floating card. It reuses the shipped `todo` cell, so the composer keeps a
      // single todo surface (lower priority shadows the built-in panel).
      // Mutually exclusive dock modes: ours (shadows the shipped panel) or the
      // shipped panel alone. Switchable at runtime from Settings → 任务流.
      let dockHandle = null
      const applyDockMode = (mode) => {
        if (dockHandle) {
          try {
            dockHandle()
          } catch {
            // already disposed
          }
          dockHandle = null
        }
        applied.dockMode = mode
        if (mode === 'builtin') return
        try {
          dockHandle = ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
            name: 'conversation.input.dock',
            id: 'todo',
            order: 0,
            priority: -1,
            locale: NS,
          }, (props) => h(SurfaceBoundary, { part: 'dock' }, h(TaskStrip, props))))
        } catch (error) {
          reportGeometry('registerFailed', null, `dock: ${String(error?.message ?? error)}`)
        }
      }
      applyDockModeRef.current = applyDockMode
      const modeListener = (mode) => applyDockMode(mode)
      dockModeListeners.add(modeListener)
      ctx.effect(() => () => dockModeListeners.delete(modeListener), 'taskflow: dock mode listener')
      applyDockMode(readDockMode())

      mark('settings', () => ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'taskflow',
        order: 55,
        label: () => t('settings.title'),
        locale: NS,
      }, TaskflowSettings)), 'taskflow: settings page'))
      ctx.effect(() => () => {
        if (dockHandle) {
          try {
            dockHandle()
          } catch {
            // ignore
          }
          dockHandle = null
        }
      }, 'taskflow: dock switch')

      // Replace the built-in one-line todo row with the full checklist in the
      // transcript (same key, lower priority shadows the shipped view).
      mark('todoView', () => ctx.effect(() => ctx.slots.inject('tool.call.toolview', () => {
        try {
          return ctx.slots.register({
            name: 'tool.call.toolview',
            key: 'todo_write',
            priority: -1,
            locale: NS,
          }, TodoCardEntry)
        } catch (error) {
          reportGeometry('registerFailed', null, `todoView: ${String(error?.message ?? error)}`)
          throw error
        }
      }), 'taskflow: todo card'))

      startPoller()
      try {
        const own = document.querySelector('style[data-plugin-css="dsh-plugin-taskflow"]')
        applied.builtinTodoPanel = Boolean(document.querySelector('[data-testid="todo-panel"]'))
        applied.css = own ? (own.dataset.build ?? 'no-build') : 'missing'
        let rules = []
        try {
          rules = own && own.sheet ? Array.from(own.sheet.cssRules) : []
        } catch {
          rules = []
        }
        applied.cssRules = rules.length
        applied.hasPauseRule = rules.some((rule) => String(rule.cssText).includes('data-waiting'))
        applied.hasSpinRule = rules.some((rule) => String(rule.cssText).includes('tf-spin'))
      } catch {
        applied.css = 'unknown'
      }
      reportGeometry('apply', null, JSON.stringify(applied))

      ctx.effect(() => () => {
        if (poller !== null) {
          window.clearInterval(poller)
          poller = null
        }
        openSidebar = null
      }, 'taskflow: lifecycle')
    }

    exports.apply = apply
    exports.inject = inject
    exports.name = name
    return module.exports
  },
})
