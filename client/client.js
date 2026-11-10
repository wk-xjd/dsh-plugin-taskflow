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
    const CLIENT_BUILD = 'c69'
    const POLL_MS = 2500

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
.tf-inline { position: relative; display: flex; flex-direction: column; gap: 2px; width: calc(100% - 2px); box-sizing: border-box; padding: 6px 10px 7px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, .09); background: linear-gradient(180deg, rgba(255, 255, 255, .06), rgba(255, 255, 255, 0) 46%), color-mix(in oklab, currentColor 1.6%, rgba(128, 128, 128, .035)); backdrop-filter: blur(34px) saturate(1.7) brightness(1.05); -webkit-backdrop-filter: blur(34px) saturate(1.7) brightness(1.05); box-shadow: 0 10px 30px rgba(0, 0, 0, .14), inset 0 1px 0 rgba(255, 255, 255, .10), inset 0 -1px 0 rgba(0, 0, 0, .14); }
@property --tf-angle { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
@keyframes tf-spin { to { --tf-angle: 360deg; } }
@keyframes tf-pulse { 0%, 100% { transform: scale(.85); opacity: .7; } 50% { transform: scale(1.12); opacity: 1; } }
.tf-inline-empty { padding: 5px 10px; }
.tf-inline-empty .tf-inline-head { opacity: .42; font-size: 10.5px; }
.tf-empty-dot { flex: 0 0 auto; font-size: 10px; opacity: .7; }
.tf-inline-head { display: flex; align-items: center; gap: 7px; font-size: 11px; letter-spacing: .01em; transition: color .3s ease; }
.tf-inline-head[data-state="done"] { color: #4ec97a; }
.tf-inline-head[data-state="done"] .tf-inline-count { opacity: .8; }
.tf-inline-head[data-state="done"] .tf-inline-current { opacity: .95; }
.tf-inline-head[data-state="running"] .tf-inline-current { color: #e3b341; opacity: .85; }
.tf-inline-count { flex: 0 0 auto; font-variant-numeric: tabular-nums; opacity: .52; }
.tf-inline-current { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: .62; }
.tf-inline-toggle { flex: 0 0 auto; width: 16px; height: 16px; font-size: 9px; opacity: .35; }
.tf-inline-toggle:hover { opacity: .8; }
.tf-inline-list { margin: 3px 0 0; padding: 3px 0 0 1px; border-top: 1px solid color-mix(in oklab, currentColor 6%, transparent); list-style: none; display: flex; flex-direction: column; gap: 0; max-height: 150px; overflow-y: auto; overflow-x: hidden; scrollbar-width: thin; scrollbar-color: color-mix(in oklab, currentColor 16%, transparent) transparent; }
.tf-inline-list::-webkit-scrollbar { width: 6px; height: 0; }
.tf-inline-list::-webkit-scrollbar-track { background: transparent; }
.tf-inline-list::-webkit-scrollbar-thumb { background: color-mix(in oklab, currentColor 14%, transparent); border-radius: 3px; }
.tf-inline-list::-webkit-scrollbar-thumb:hover { background: color-mix(in oklab, currentColor 26%, transparent); }
.tf-item { list-style: none; }
.tf-item-btn { position: relative; display: flex; align-items: flex-start; gap: 7px; width: 100%; box-sizing: border-box; padding: 1px 4px; border: 0; border-radius: 5px; background: transparent; color: inherit; font: inherit; font-size: 11.5px; line-height: 1.55; text-align: left; cursor: pointer; }
.tf-item-btn:hover, .tf-item-btn[data-active="true"] { background: color-mix(in oklab, currentColor 7%, transparent); }
.tf-item-btn[data-delegated="true"] { background: color-mix(in oklab, #8b7cff 10%, transparent); box-shadow: inset 0 0 0 1px color-mix(in oklab, #8b7cff 24%, transparent); }
.tf-inline-head[data-state="delegated"] .tf-inline-current { color: #a99bff; opacity: .95; }
.tf-item-btn[data-waiting="true"] { background: color-mix(in oklab, #d2a24c 8%, transparent); box-shadow: inset 0 0 0 1px color-mix(in oklab, #d2a24c 22%, transparent); }
.tf-item-btn[data-waiting="true"] .tf-item-mark { color: #d2a24c; opacity: .9; }
.tf-inline-head[data-state="waiting"] .tf-inline-current { color: #d2a24c; opacity: .9; }
.tf-item-btn[data-status="in_progress"]:not([data-waiting="true"]) { background: color-mix(in oklab, #6aa6ff 9%, transparent); box-shadow: 0 0 16px rgba(110, 160, 255, .16), inset 0 0 14px rgba(110, 160, 255, .10); }
.tf-item-btn[data-status="in_progress"]:not([data-waiting="true"])::before { content: ''; position: absolute; inset: 0; border-radius: 6px; padding: 1px; background: conic-gradient(from var(--tf-angle, 0deg), #ff6b6b, #ffd166, #6bcb77, #4d96ff, #b983ff, #ff6b6b); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; opacity: .8; animation: tf-spin 6s linear infinite; pointer-events: none; }
.tf-item-btn[data-status="in_progress"]:not([data-waiting="true"])::after { content: ''; position: absolute; inset: 0; border-radius: 6px; pointer-events: none; background: radial-gradient(130% 160% at 12% 0%, rgba(255, 110, 110, .20), transparent 46%), radial-gradient(130% 160% at 50% 0%, rgba(255, 210, 100, .16), transparent 46%), radial-gradient(130% 160% at 88% 0%, rgba(90, 160, 255, .22), transparent 52%); filter: blur(7px); opacity: .8; }
.tf-item-mark { flex: 0 0 auto; width: 12px; text-align: center; font-size: 10.5px; line-height: 1.55; }
.tf-item-btn[data-status="completed"] .tf-item-mark { color: #3fb950; }
.tf-item-btn[data-status="completed"] .tf-item-text { opacity: .52; }
.tf-item-btn[data-status="in_progress"] .tf-item-mark { color: #d29922; }
.tf-item-btn[data-status="in_progress"] .tf-item-text { font-weight: 500; }
.tf-item-btn[data-status="pending"] .tf-item-mark { opacity: .45; }
.tf-item-btn[data-status="pending"] .tf-item-text { opacity: .72; }
.tf-item-text { flex: 1 1 auto; min-width: 0; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; white-space: normal; word-break: break-word; }
.tf-item-parallel { opacity: .5; font-variant-numeric: tabular-nums; }
.tf-item-time { flex: 0 0 auto; opacity: .34; font-size: 10.5px; font-variant-numeric: tabular-nums; line-height: 1.55; }
.tf-item-hint { flex: 0 0 auto; font-size: 10.5px; opacity: .38; }
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
.tf-tasks { margin: 8px 0 4px; padding: 10px 12px; border-radius: 10px; border: 1px solid color-mix(in oklab, currentColor 13%, transparent); background: color-mix(in oklab, currentColor 3.5%, transparent); }
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
.tf-pop { position: fixed; z-index: 70; width: min(430px, calc(100vw - 24px)); max-height: min(62vh, 560px); overflow: auto; padding: 10px 12px 12px; border-radius: 12px; border: 1px solid color-mix(in oklab, currentColor 16%, transparent); background: color-mix(in oklab, currentColor 8%, rgba(128, 128, 128, .18)); backdrop-filter: blur(18px) saturate(1.15); -webkit-backdrop-filter: blur(18px) saturate(1.15); box-shadow: 0 14px 38px rgba(0, 0, 0, .32); font-size: 12px; color: inherit; }
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
      if (document.querySelector('style[data-plugin-css="dsh-plugin-taskflow"]')) return
      const style = document.createElement('style')
      style.dataset.plugin = ID
      style.dataset.pluginCss = ID
      style.textContent = CSS
      document.head.appendChild(style)
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
          && (previous.segments || []).length === (value.segments || []).length
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
    function startPoller() {
      if (poller !== null || typeof window === 'undefined') return
      poller = window.setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
        const sessionId = store.activeSession
        if (sessionId) void refresh(sessionId)
      }, POLL_MS)
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
      const list = currentTodos(todos)
      const [collapsed, setCollapsed] = React.useState(false)
      const [detail, setDetailState] = React.useState(uiState.detail)
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
      }, [sessionId])

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
      const segments = snapshot.segments || []
      const latest = segments.length > 0 ? segments[segments.length - 1] : null
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

      useReportGeometry('dock', rootRef, `${collapsed ? 'collapsed' : 'open'} / ${total} tasks / ${segments.length} segments${layoutNote ? ` / ${layoutNote}` : ''}`)
      useReportGeometry('detail', detailRef, detail ? detail.content : 'closed')

      // Open one task's detail; the anchor is the row that was clicked.
      const openDetail = (content, element) => {
        detailAnchor.current = element || null
        setDetail({ content })
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

      // Nothing at all yet: still show that the plugin is here, so every
      // conversation has the same anchor instead of silently disappearing.
      if (total === 0 && !latest) {
        return h('div', { className: 'tf-float', ref: rootRef },
          h('div', { className: 'tf-inline tf-inline-empty' },
            h('div', { className: 'tf-inline-head' },
              h('span', { className: 'tf-empty-dot', 'aria-hidden': true }, '◌'),
              h('span', { className: 'tf-inline-current' }, t('panel.emptySession')))))
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

      const rows = mergeTasks(list, snapshot, Date.now()).map((todo) => {
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

      const detailTiming = detail ? (snapshot.tasks?.items?.[detail.content] || {}) : {}
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
              className: 'tf-icon-btn tf-inline-toggle',
              'aria-label': collapsed ? t('strip.expand') : t('strip.collapse'),
              title: collapsed ? t('strip.expand') : t('strip.collapse'),
              onClick: () => setCollapsed((value) => !value),
            }, collapsed ? '▸' : '▾')),
          collapsed ? null : h('ul', { className: 'tf-inline-list' }, rows)),
        detailPopover)
    }

    const TaskStripEntry = (props) => h(TaskStrip, props)

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

    const TodoCardEntry = (props) => h(TodoCard, props)

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
      useReportGeometry('sidebar', rootRef, `${(snapshot.segments || []).length} segments`)

      React.useEffect(() => {
        store.setActive(sessionId)
        void refresh(sessionId)
      }, [sessionId])

      const segments = (snapshot.segments || []).slice().sort((a, b) => b.turn - a.turn)

      const summarize = async () => {
        setBusy(true)
        setNote('')
        const result = await requestSummary(sessionId)
        setBusy(false)
        if (!result.ok) setNote(result.reason || 'FAILED')
        window.setTimeout(() => void refresh(sessionId), 600)
      }

      const segmentRows = segments.map((segment) => h('div', { key: segment.turn, className: 'tf-seg' },
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

    const SummaryPanelEntry = (props) => h(SummaryPanel, props)

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
      mark('dock', () => ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'todo',
        order: 0,
        priority: -1,
        locale: NS,
      }, TaskStripEntry)), 'taskflow: pill'))

      // Sidebar tab: every segment summary in one place, opened from the pill's
      // progress ring (not a separate navigation entry).
      mark('sidebar', () => ctx.inject(['sidebarRightTabs', 'sidebarRight'], (host) => {
        applied.sidebarReady = true
        const KIND = 'taskflow'
        host.effect(() => host.sidebarRightTabs.register({
          id: ID,
          kind: KIND,
          priority: 'extension',
          title: () => t('panel.title'),
          guide: [{
            order: 40,
            title: () => t('panel.guide.title'),
            description: () => t('panel.guide.description'),
            icon: TaskflowIcon,
          }],
        }), 'taskflow: sidebar type')

        host.effect(() => host.slots.inject('sidebar.right.pane.tab', () => host.slots.register({
          name: 'sidebar.right.pane.tab',
          key: ID,
          locale: NS,
        }, SummaryPanelEntry)), 'taskflow: sidebar body')

        openSidebar = () => {
          try {
            host.sidebarRight.openTab(KIND)
            reportGeometry('openSidebar', null, 'ok')
          } catch (error) {
            reportGeometry('openSidebar', null, `error: ${String(error?.message ?? error)}`)
          }
        }
      }))

      // Replace the built-in one-line todo row with the full checklist in the
      // transcript (same key, lower priority shadows the shipped view).
      mark('todoView', () => ctx.effect(() => ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
        name: 'tool.call.toolview',
        key: 'todo_write',
        priority: -1,
        locale: NS,
      }, TodoCardEntry)), 'taskflow: todo card'))

      startPoller()
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
