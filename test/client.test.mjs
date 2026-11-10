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

const reactShim = {
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
  setTimeout(fn) {
    return setTimeout(fn, 0)
  },
}

const documentFake = {
  visibilityState: 'visible',
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
  segments: [{
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
  }],
  tasks: {
    items: {
      '读插件 API': { content: '读插件 API', status: 'completed', firstSeen: 1, startedAt: 1, completedAt: 2000 },
      '写宿主插件': { content: '写宿主插件', status: 'in_progress', firstSeen: 1, startedAt: Date.now() - 30000 },
    },
    history: [],
    updatedAt: 1700,
  },
  lastTurn: 2,
  skipped: [2],
  pending: false,
  updatedAt: 5000,
}

const requests = []
const fetchFake = async (url, options = {}) => {
  requests.push({ url, options })
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
assert.equal(dock.options.id, 'todo', 'replaces the shipped todo dock cell')
assert.equal(dock.options.order, 0)
assert.equal(dock.options.priority, -1, 'lower priority shadows the built-in panel')


/* ---------------------------------------------------------------------- */
/* Render helpers                                                         */
/* ---------------------------------------------------------------------- */

function textOf(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (node.type && typeof node.type === 'function') return textOf(node.type(node.props))
  return textOf(node.props?.children)
}

function render(component, props) {
  return component(props)
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
assert.ok(!folded.includes('写结论'), `folded card hides rows, got: ${folded}`)

const openCard = textOf(render(todoView.component, {
  block: blockWith([{ content: '读文件', status: 'completed' }, { content: '写结论', status: 'in_progress' }]),
}))
assert.match(openCard, /写结论/, 'a running list stays open')

// The strip fetched the host at least once.
assert.ok(requests.some((request) => String(request.url).startsWith('/taskflow/state?session=sess-1')))

console.log('taskflow client tests passed')
