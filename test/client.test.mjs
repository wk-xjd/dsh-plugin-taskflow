/**
 * Client-half smoke test for the TaskFlow plugin.
 *
 * The bundle is a browser classic script, so the test fakes just enough of the
 * browser (module loader, React, document, fetch) to execute the real
 * registration code and render each component once as a plain function.
 *
 * It answers: does `apply` wire the three surfaces without throwing, does the
 * turn-tail selector accept/reject the right turns, and do the components
 * produce the expected text from a real host payload?
 *
 * Run: node test/client.test.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const bundlePath = join(here, '..', 'client', 'client.js')

/* ---------------------------------------------------------------------- */
/* Browser fakes                                                          */
/* ---------------------------------------------------------------------- */

let captured = null

function element(type, props, ...children) {
  const flat = []
  const push = (value) => {
    if (Array.isArray(value)) value.forEach(push)
    else if (value !== null && value !== undefined && value !== false && value !== true) flat.push(value)
  }
  push(children)
  return { type, props: { ...(props || {}), children: flat.length === 1 ? flat[0] : flat } }
}

class ShimComponent {
  constructor(props) {
    this.props = props
    this.state = this.state || {}
  }

  setState(next) {
    const patch = typeof next === 'function' ? next(this.state, this.props) : next
    this.state = { ...this.state, ...patch }
  }
}
ShimComponent.prototype.isReactComponent = {}

const reactShim = {
  Component: ShimComponent,
  createElement: element,
  Fragment: Symbol('Fragment'),
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}]
  },
  useEffect(effect) {
    effect()
    return undefined
  },
  useMemo(factory) {
    return factory()
  },
  useCallback(fn) {
    return fn
  },
  useSyncExternalStore(_subscribe, getSnapshot) {
    return getSnapshot()
  },
  useRef(initial) {
    return { current: initial ?? null }
  },
}

let intervals = 0
const windowFake = {
  __ModuleLoader__: {
    load(definition) {
      captured = definition
    },
  },
  setInterval() {
    intervals += 1
    return intervals
  },
  clearInterval() {},
  setTimeout(fn, ms) {
    // The poll loop reschedules itself with long delays; running it here would
    // keep the test process alive forever.
    if (typeof ms === 'number' && ms >= 500) return 0
    return setTimeout(fn, 0)
  },
}

const documentFake = {
  visibilityState: 'visible',
  addEventListener() {},
  removeEventListener() {},
  querySelector() {
    return null
  },
  createElement() {
    return { dataset: {}, textContent: '' }
  },
  head: { appendChild() {} },
}

const payload = {
  ok: true,
  version: '0.1.0',
  sessionId: 'sess-1',
  enabled: true,
  segmentCount: 1,
  latestSegment: {
    turn: 1,
    at: 1,
    startedAt: 0,
    durationMs: 65000,
    title: '打通插件壳',
    bullets: ['新建 dsh-plugins/dsh-plugin-taskflow', '在 dock 槽登记 TaskStrip'],
    toolCalls: 2,
    files: ['lib/index.js'],
    commands: [],
    provider: 'test-provider',
    model: 'test-model',
    mechanical: false,
  },
  tasks: {
    items: {
      '读插件 API': { content: '读插件 API', status: 'completed', firstSeen: 1, startedAt: 1, completedAt: 2000 },
      '写宿主插件': { content: '写宿主插件', status: 'in_progress', firstSeen: 1, startedAt: Date.now() - 30000 },
    },
    history: [],
    updatedAt: 1700,
  },
  lastTurn: 2,
  openTurn: 1,
  skipped: [2],
  pending: false,
  updatedAt: 5000,
}

const requests = []
const fetchFake = async (url, options = {}) => {
  requests.push({ url, options })
  if (String(url).includes('planning-session')) {
    // A turn that has started but produced no list yet.
    return { ok: true, status: 200, json: async () => ({ ...payload, sessionId: 'planning-session', segmentCount: 0, latestSegment: null, openTurn: 9, lastTurn: 8 }) }
  }
  if (String(url).includes('idle-plan-session')) {
    // Between turns the last plan stays visible; say how much is left instead of
    // leaving the header at a bare "0/2".
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ...payload,
        sessionId: 'idle-plan-session',
        openTurn: null,
        inTurn: false,
        delegates: 0,
        currentList: [
          { content: '写单元测试', status: 'pending' },
          { content: '跑回归', status: 'pending' },
        ],
        tasks: { items: {}, updatedAt: 1700 },
      }),
    }
  }
  if (String(url).includes('delegated-open-session')) {
    // The main turn is running and three subagents work under it: the header
    // must keep naming the main task, with the subagent count beside it.
    const startedAt = Date.now() - 6 * 60 * 1000
    const currentList = [
      { content: '从 domain_cn.cfg 提取映射到 lingxi.wps.cn 的域名 key', status: 'in_progress' },
      { content: '全仓检索这些 key 与硬编码 lingxi.wps.cn 的引用点清单', status: 'pending' },
      { content: '∥ 子 agent：按插件簇统计 lingxi.wps.cn 的接口路径与代码位置', status: 'pending' },
    ]
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ...payload,
        sessionId: 'delegated-open-session',
        openTurn: 7,
        inTurn: true,
        currentListTurn: 7,
        delegates: 3,
        tasks: {
          items: {
            [currentList[0].content]: { content: currentList[0].content, status: 'in_progress', firstSeen: startedAt, startedAt },
            [currentList[2].content]: { content: currentList[2].content, status: 'pending', firstSeen: startedAt },
          },
          updatedAt: 1700,
        },
        currentList,
      }),
    }
  }
  if (String(url).includes('delegated-closed-session')) {
    // The parent turn is over but a subagent still runs: now the delegated
    // label is the truthful header.
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ...payload,
        sessionId: 'delegated-closed-session',
        openTurn: null,
        inTurn: false,
        delegates: 1,
        currentList: [
          { content: '∥ 子 agent：统计内置 Web 前端的 lingxi 接口', status: 'pending' },
        ],
        tasks: { items: {}, updatedAt: 1700 },
      }),
    }
  }
  if (String(url).includes('autoclosed-session')) {
    // A finished turn auto-closed a leftover, but DSH's own `todos` projection
    // still says in_progress (this is the 48h spinning row users saw).
    const startedAt = Date.now() - 6 * 3600 * 1000
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ...payload,
        sessionId: 'autoclosed-session',
        openTurn: null,
        inTurn: false,
        currentListTurn: 3,
        tasks: {
          items: {
            '读文件': { content: '读文件', status: 'completed', firstSeen: startedAt, startedAt, completedAt: startedAt + 3600 * 1000, autoClosed: true },
            '写结论': { content: '写结论', status: 'completed', firstSeen: startedAt, startedAt, completedAt: startedAt + 2 * 3600 * 1000, autoClosed: true },
          },
          updatedAt: 1700,
        },
        currentList: [
          { content: '读文件', status: 'completed' },
          { content: '写结论', status: 'completed' },
        ],
        segmentCount: 1,
      }),
    }
  }
  if (String(url).includes('stopped-session')) {
    // A turn the user stopped: the host marked the open row terminal at 12s.
    const startedAt = Date.now() - 12000
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ...payload,
        sessionId: 'stopped-session',
        openTurn: null,
        inTurn: false,
        delegates: 0,
        tasks: {
          items: {
            '读取远端仓库当前分支': { content: '读取远端仓库当前分支', status: 'stopped', firstSeen: startedAt, startedAt, stoppedAt: startedAt + 12000, stopReason: 'aborted' },
            '确认临时诊断代码': { content: '确认临时诊断代码', status: 'pending', firstSeen: startedAt },
          },
          updatedAt: 1700,
        },
        currentList: [
          { content: '读取远端仓库当前分支', status: 'stopped' },
          { content: '确认临时诊断代码', status: 'pending' },
        ],
        lastTurn: 9,
      }),
    }
  }
  if (String(url).startsWith('/taskflow/summarize')) {
    return { ok: true, status: 200, json: async () => ({ ok: true, queued: true }) }
  }
  return { ok: true, status: 200, json: async () => payload }
}

globalThis.window = windowFake
globalThis.document = documentFake
globalThis.fetch = fetchFake
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true })

const source = readFileSync(bundlePath, 'utf8')
// Execute the classic script: it only registers a factory on the fake loader.
new Function('window', 'document', 'fetch', 'navigator', source)(windowFake, documentFake, fetchFake, globalThis.navigator)

assert.ok(captured, 'bundle registered a module factory')
assert.equal(captured.id, 'dsh-plugin-taskflow')

const reactDomShim = { createPortal: (children) => children }
const moduleExports = captured.factory((specifier) => {
  if (specifier === 'react') return reactShim
  if (specifier === 'react-dom') return reactDomShim
  throw new Error(`unexpected require("${specifier}")`)
})

assert.equal(moduleExports.name, 'taskflow')
assert.deepEqual(moduleExports.inject, ['slots', 'locale'])
assert.equal(typeof moduleExports.apply, 'function', 'module exports apply')

/* ---------------------------------------------------------------------- */
/* Fake client context                                                    */
/* ---------------------------------------------------------------------- */

const registrations = []
const sidebar = { opened: [] }
const sidebarTabs = { registered: [] }

const slots = {
  inject(name, callback) {
    return callback()
  },
  register(options, component) {
    registrations.push({ options, component })
    return () => {}
  },
}

const ctx = {
  slots,
  locale: {
    register() {},
    bind() {
      return (key) => key
    },
  },
  effect(fn) {
    const dispose = fn()
    return typeof dispose === 'function' ? dispose : () => {}
  },
  inject(names, callback) {
    if (!names.includes('sidebarRightTabs')) return undefined
    return callback({
      ...ctx,
      slots,
      sidebarRightTabs: {
        register(definition) {
          sidebarTabs.registered.push(definition)
          return () => {}
        },
      },
      sidebarRight: {
        openTab(kind) {
          sidebar.opened.push(kind)
        },
      },
    })
  },
}

moduleExports.apply(ctx)

const dock = registrations.find((entry) => entry.options.name === 'conversation.input.dock')
assert.ok(dock, 'dock slot registered')
// Default mode ('custom') shadows the shipped panel; the settings page can
// switch to 'builtin', which leaves the shipped panel alone.
assert.equal(dock.options.id, 'todo', 'default mode takes the shipped cell')
assert.equal(dock.options.priority, -1)

const settingsSection = registrations.find((entry) => entry.options.name === 'settings.section')
assert.ok(settingsSection, 'settings page registered')
assert.equal(settingsSection.options.id, 'taskflow')

const settingsText = textOf(render(settingsSection.component, {}))
assert.match(settingsText, /TaskFlow 面板/, 'settings offers our panel')
assert.match(settingsText, /DSH 内置面板/, 'settings offers the built-in panel')


/* ---------------------------------------------------------------------- */
/* Render helpers                                                         */
/* ---------------------------------------------------------------------- */

function textOf(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node.type && typeof node.type === 'function') {
    if (node.type.prototype && node.type.prototype.isReactComponent) {
      const instance = new node.type(node.props)
      instance.props = node.props
      return textOf(instance.render())
    }
    return textOf(node.type(node.props))
  }
  return textOf(node.props?.children)
}

function render(component, props) {
  return component(props)
}

/** Collect every element node matching a predicate, evaluating components. */
function findAll(node, predicate, out = []) {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const item of node) findAll(item, predicate, out)
    return out
  }
  if (predicate(node)) out.push(node)
  if (typeof node.type === 'function') {
    const rendered = node.type.prototype && node.type.prototype.isReactComponent
      ? new node.type(node.props).render()
      : node.type(node.props)
    findAll(rendered, predicate, out)
    return out
  }
  findAll(node.props?.children, predicate, out)
  return out
}

const todos = [
  { content: '读插件 API', status: 'completed' },
  { content: '写宿主插件', status: 'in_progress' },
  { content: '写客户端面板', status: 'pending' },
]

// Evaluating the component runs the fake effects, which start the fetch; the
// second evaluation sees the host payload in the store.
textOf(render(dock.component, { sessionId: 'sess-1', useProjection: (key) => (key === 'todos' ? todos : undefined) }))
await new Promise((resolve) => setTimeout(resolve, 20))

const stripText = textOf(render(dock.component, {
  sessionId: 'sess-1',
  useProjection: (key) => (key === 'todos' ? todos : undefined),
}))
assert.match(stripText, /1\/3/, 'strip shows completion count')
assert.match(stripText, /写宿主插件/, 'strip shows the active task')
assert.match(stripText, /1\/3/, 'strip shows task progress inline')

// A stopped turn is terminal: the row is grey with a frozen duration and the
// header says so, instead of claiming an unfinished task forever.
textOf(render(dock.component, {
  sessionId: 'stopped-session',
  useProjection: (key) => (key === 'todos' ? [
    { content: '读取远端仓库当前分支', status: 'in_progress' },
    { content: '确认临时诊断代码', status: 'pending' },
  ] : undefined),
}))
await new Promise((resolve) => setTimeout(resolve, 20))
const stoppedText = textOf(render(dock.component, {
  sessionId: 'stopped-session',
  useProjection: (key) => (key === 'todos' ? [
    { content: '读取远端仓库当前分支', status: 'in_progress' },
    { content: '确认临时诊断代码', status: 'pending' },
  ] : undefined),
}))
assert.match(stoppedText, /0\/2/, 'the stopped list keeps its counts')
assert.match(stoppedText, /已停止/, 'the header names the terminal state')
assert.match(stoppedText, /12s/, 'the duration is frozen at the stop time')
assert.doesNotMatch(stoppedText, /未收尾/, 'no phantom unfinished task')

// Host-settled rows win over a stale projection: an auto-closed leftover must
// render as done even while DSH still reports it in_progress.
const staleProjection = [
  { content: '读文件', status: 'in_progress' },
  { content: '写结论', status: 'in_progress' },
]
textOf(render(dock.component, { sessionId: 'autoclosed-session', useProjection: (key) => (key === 'todos' ? staleProjection : undefined) }))
await new Promise((resolve) => setTimeout(resolve, 20))
const autoclosedText = textOf(render(dock.component, {
  sessionId: 'autoclosed-session',
  useProjection: (key) => (key === 'todos' ? staleProjection : undefined),
}))
assert.match(autoclosedText, /2\/2/, 'the auto-closed list is complete')
assert.match(autoclosedText, /全部完成/, 'no phantom running row')
assert.match(autoclosedText, /1h/, 'durations come from completedAt, not a live clock')
assert.doesNotMatch(autoclosedText, /未收尾/, 'no phantom unfinished task')

// Between turns an unfinished plan says how much is left, so the bare count no
// longer reads like a broken panel.
const idlePlan = [{ content: '写单元测试', status: 'pending' }, { content: '跑回归', status: 'pending' }]
textOf(render(dock.component, { sessionId: 'idle-plan-session', useProjection: (key) => (key === 'todos' ? idlePlan : undefined) }))
await new Promise((resolve) => setTimeout(resolve, 20))
const idlePlanText = textOf(render(dock.component, {
  sessionId: 'idle-plan-session',
  useProjection: (key) => (key === 'todos' ? idlePlan : undefined),
}))
assert.match(idlePlanText, /0\/2/, 'the plan keeps its count')
assert.match(idlePlanText, /2 项未完成/, 'and names the remaining work')

// A running turn stays the main agent's turn: subagents running under it are a
// count beside the task, not a replacement for its status.
const delegatedProjection = [
  { content: '从 domain_cn.cfg 提取映射到 lingxi.wps.cn 的域名 key', status: 'in_progress' },
  { content: '全仓检索这些 key 与硬编码 lingxi.wps.cn 的引用点清单', status: 'pending' },
  { content: '∥ 子 agent：按插件簇统计 lingxi.wps.cn 的接口路径与代码位置', status: 'pending' },
]
textOf(render(dock.component, { sessionId: 'delegated-open-session', useProjection: (key) => (key === 'todos' ? delegatedProjection : undefined) }))
await new Promise((resolve) => setTimeout(resolve, 20))
const delegatedOpenText = textOf(render(dock.component, {
  sessionId: 'delegated-open-session',
  useProjection: (key) => (key === 'todos' ? delegatedProjection : undefined),
}))
assert.match(delegatedOpenText, /从 domain_cn\.cfg/, 'the header still names the main task')
assert.match(delegatedOpenText, /3 个子 agent/, 'the subagent count is shown beside it')
assert.doesNotMatch(delegatedOpenText, /子 agent 执行中：/, 'no delegated prefix while the main turn is open')
assert.match(delegatedOpenText, /∥ 子 agent：按插件簇/, 'the parallel row keeps its text')

const delegatedTree = render(dock.component, {
  sessionId: 'delegated-open-session',
  useProjection: (key) => (key === 'todos' ? delegatedProjection : undefined),
})
const allRows = findAll(delegatedTree, (node) => node.props?.className === 'tf-item-btn')
const delegatedRows = allRows.filter((row) => row.props['data-delegated'] === 'true')
assert.equal(delegatedRows.length, 1, 'only the parallel row is painted as delegated')
assert.match(textOf(delegatedRows[0]), /∥ 子 agent：按插件簇/, 'and it is the right row')

// Only when the parent turn is over does the delegated label own the header.
textOf(render(dock.component, { sessionId: 'delegated-closed-session', useProjection: () => null }))
await new Promise((resolve) => setTimeout(resolve, 20))
const delegatedClosedText = textOf(render(dock.component, { sessionId: 'delegated-closed-session', useProjection: () => null }))
assert.match(delegatedClosedText, /子 agent 执行中/, 'a finished turn with a running subagent says so')

// No tasks and no summaries still renders a minimal anchor line.
const emptyText = textOf(render(dock.component, { sessionId: 'other', useProjection: () => null }))
assert.match(emptyText, /本会话暂无任务清单/, `empty state line, got: ${emptyText}`)

// With summaries but no task list, the strip surfaces the newest headline instead.
const summaryOnly = textOf(render(dock.component, { sessionId: 'sess-1', useProjection: () => null }))
assert.match(summaryOnly, /打通插件壳/, 'newest segment headline shows without tasks')
assert.ok(summaryOnly.length <= 40, `one short line, got: ${summaryOnly}`)

// Sidebar panel lists tasks and segments.

// Transcript card: finished lists fold to one line, running lists stay open.
const todoView = registrations.find((entry) => entry.options.name === 'tool.call.toolview')
assert.ok(todoView, 'todo tool view registered')
assert.equal(todoView.options.key, 'todo_write')

const blockWith = (items) => ({
  kind: 'call',
  call: { argsRaw: JSON.stringify({ todos: items }) },
})
const folded = textOf(render(todoView.component, {
  block: blockWith([{ content: '读文件', status: 'completed' }, { content: '写结论', status: 'completed' }]),
}))
assert.match(folded, /2 个任务/, 'folded card keeps the counts')
// Finished cards no longer collapse: the rows stay visible.
assert.ok(folded.includes('写结论'), `finished card keeps its rows, got: ${folded}`)

const openCard = textOf(render(todoView.component, {
  block: blockWith([{ content: '读文件', status: 'completed' }, { content: '写结论', status: 'in_progress' }]),
}))
assert.match(openCard, /写结论/, 'a running list stays open')

// While a turn is open with no list yet, the dock announces planning instead of
// staying empty until the first todo_write lands.
textOf(render(dock.component, { sessionId: 'planning-session', useProjection: () => null }))
await new Promise((resolve) => setTimeout(resolve, 20))
const planningText = textOf(render(dock.component, {
  sessionId: 'planning-session',
  useProjection: () => null,
}))
assert.match(planningText, /正在拆解任务/, `planning placeholder, got: ${planningText}`)

// The strip fetched the host at least once.
assert.ok(requests.some((request) => String(request.url).startsWith('/taskflow/state?session=sess-1')))

console.log('taskflow client tests passed')
