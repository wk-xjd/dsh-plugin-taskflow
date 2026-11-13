/**
 * Host-half test for the TaskFlow plugin.
 *
 * Runs the real plugin module against a fake cordis context: synthetic session
 * events in, the plugin's own HTTP payload out. No DSH process, no model call —
 * the LLM service is replaced by a scripted stream.
 *
 * Run: node --test test/host.test.mjs   (or node test/host.test.mjs)
 */

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'taskflow-test-'))
process.env.DSH_HOME = home

const { apply } = await import('../lib/index.js')

/** Build a fake host context with the services TaskFlow touches. */
function makeHost() {
  const handlers = new Map()
  const routes = new Map()
  const commands = new Map()
  const services = new Map()
  const disposers = []
  const sessions = new Map()

  const ctx = {
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    effect(fn) {
      const dispose = fn()
      disposers.push(dispose)
      return dispose
    },
    on(name, handler) {
      const list = handlers.get(name) ?? []
      list.push(handler)
      handlers.set(name, list)
      return () => {}
    },
    inject(names, callback) {
      // Mirror cordis: the callback runs only when every service exists.
      if (names.some((name) => services.get(name) === undefined)) return undefined
      const host = { ...ctx }
      for (const name of names) host[name] = services.get(name)
      const dispose = callback(host)
      if (typeof dispose === 'function') disposers.push(dispose)
      return dispose
    },
    get(name) {
      return services.get(name)
    },
    register(name, value) {
      services.set(name, value)
    },
    emit(name, ...args) {
      for (const handler of handlers.get(name) ?? []) handler(...args)
    },
    routes,
    commands,
    sessions,
  }
  return ctx
}

function makeSession(id, cwd) {
  const events = []
  return {
    id,
    meta: { cwd },
    events,
    snapshotEvents(from = 0, to) {
      return events.slice(from, to === undefined ? events.length : to)
    },
    requestContext() {
      return { provider: 'test-provider', model: 'test-model' }
    },
    requestHeader() {
      return { config: { provider: 'test-provider', model: 'test-model' } }
    },
    append(type, data) {
      const event = { type, data, seq: events.length, time: Date.now() }
      events.push(event)
      return event
    },
  }
}

function makeWebServer(routes) {
  return {
    register(route) {
      routes.set(route.path, route)
      return () => routes.delete(route.path)
    },
  }
}

function makeLlm(reply) {
  return {
    stream(options) {
      return (async function* stream() {
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: reply }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } }
        yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 20 } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      })()
    },
  }
}

const REPLY = '## 打通插件壳\n- 新建 dsh-plugins/dsh-plugin-taskflow 并注册 lib/index.js\n- 在 ui-conversation 的 dock 槽登记 TaskStrip'

function fakeRequest(method, url, body) {
  const listeners = new Map()
  const request = {
    method,
    url,
    on(name, handler) {
      listeners.set(name, handler)
      return request
    },
    destroy() {},
  }
  if (body !== undefined) {
    const text = JSON.stringify(body)
    queueMicrotask(() => {
      listeners.get('data')?.(Buffer.from(text))
      listeners.get('end')?.()
    })
  }
  return request
}

function fakeResponse() {
  return {
    status: 0,
    headers: {},
    body: '',
    written: '',
    writeHead(status, headers) {
      this.status = status
      this.headers = headers
    },
    write(chunk) {
      this.written += chunk
      return true
    },
    end(text) {
      this.body = text ?? ''
    },
    on() {},
  }
}

async function callRoute(host, path, options = {}) {
  const route = host.routes.get(path)
  assert.ok(route, `route ${path} is not registered`)
  const response = fakeResponse()
  await route.handler(fakeRequest(options.method ?? 'GET', options.url ?? path, options.body), response)
  return { status: response.status, json: response.body ? JSON.parse(response.body) : null }
}

function waitFor(predicate, { timeout = 4000, step = 20 } = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = async () => {
      let value
      try {
        value = await predicate()
      } catch (error) {
        reject(error)
        return
      }
      if (value) {
        resolve(value)
        return
      }
      if (Date.now() - started > timeout) {
        reject(new Error('waitFor timed out'))
        return
      }
      setTimeout(tick, step)
    }
    tick()
  })
}

/* ---------------------------------------------------------------------- */
/* Scenario 1: a full turn produces a segment and HTTP exposes it          */
/* ---------------------------------------------------------------------- */

{
  const host = makeHost()
  const webServer = makeWebServer(host.routes)
  const llm = makeLlm(REPLY)
  const session = makeSession('sess-1', '/tmp/demo')
  host.register('webServer', webServer)
  host.register('llm', llm)
  host.register('sessions', { get: (id) => (id === session.id ? session : undefined) })
  host.register('commands', {
    register(definition) {
      host.commands.set(definition.name, definition)
      return () => host.commands.delete(definition.name)
    },
  })

  apply(host, { minToolCalls: 1, minAssistantChars: 240, maxConcurrent: 1 })

  // A turn: plan -> tools -> closing prose -> turn/end.
  session.append('turn/start', { turn: 1 })
  session.append('user/message', {
    id: 'm1',
    role: 'user',
    content: [{ type: 'text', text: '帮我做一个任务列表插件' }],
    source: { kind: 'user' },
  })
  session.append('todo/write', {
    todos: [
      { content: '读插件 API', status: 'completed' },
      { content: '写宿主插件', status: 'in_progress' },
      { content: '写客户端面板', status: 'pending' },
    ],
  })
  session.append('tool/call', { turn: 1, step: 1, callId: 'c1', name: 'read', arguments: { file_path: '/tmp/a.ts' } })
  session.append('tool/result', { turn: 1, step: 1, message: { content: [{ type: 'text', text: 'ok' }] } })
  session.append('tool/call', { turn: 1, step: 2, callId: 'c2', name: 'bash', arguments: { command: 'node --check lib/index.js' } })
  session.append('assistant/message', {
    turn: 1,
    step: 2,
    message: { content: [{ type: 'text', text: '宿主插件的骨架已经写完，接下来补客户端的 slot 注册。'.repeat(6) }] },
  })
  const endEvent = session.append('turn/end', { turn: 1, reason: { kind: 'stop' } })

  for (const event of session.events) host.emit('session/event', session, event)
  assert.ok(endEvent)

  const state = await waitFor(async () => {
    const result = await callRoute(host, '/taskflow/state', { url: '/taskflow/state?session=sess-1' })
    return result.json.segmentCount > 0 ? result.json : null
  })

  assert.equal(state.segmentCount, 1, 'one segment after one turn')
  const segment = state.latestSegment
  assert.equal(segment.turn, 1)
  assert.equal(segment.title, '打通插件壳')
  assert.equal(segment.bullets.length, 2)
  assert.match(segment.bullets[0], /dsh-plugin-taskflow/)
  assert.equal(segment.toolCalls, 2)
  assert.equal(segment.provider, 'test-provider')
  assert.equal(segment.model, 'test-model')
  assert.equal(segment.mechanical, false)
  assert.ok(segment.durationMs >= 0)
  assert.equal(state.lastTurn, 1)
  assert.deepEqual(state.skipped, [])
  assert.equal(state.pending, false)

  // Task timings came from the todo/write snapshot.
  assert.equal(state.tasks.items['读插件 API'].status, 'completed')
  assert.equal(typeof state.tasks.items['读插件 API'].completedAt, 'number')
  // The turn ended normally, so an item the model forgot to flip is closed and
  // marked as auto-closed rather than left spinning.
  assert.equal(state.tasks.items['写宿主插件'].status, 'completed')
  assert.equal(state.tasks.items['写宿主插件'].autoClosed, true)
  assert.equal(
    state.currentList.find((todo) => todo.content === '写宿主插件').status,
    'completed',
    'the published list reports the auto-closed status',
  )

  // An interrupted turn is the opposite: the work was cut short, so the open
  // item freezes as a terminal `stopped` row instead of spinning forever. The
  // published list must carry that status too, or the client would paint it as
  // running again from the model's own `in_progress` write.
  session.append('turn/start', { turn: 2 })
  session.append('todo/write', {
    todos: [
      { content: '读插件 API', status: 'completed' },
      { content: '写宿主插件', status: 'completed' },
      { content: '补客户端面板', status: 'in_progress' },
    ],
  })
  session.append('turn/end', { turn: 2, reason: { kind: 'interrupted' } })
  for (const event of session.events.slice(-3)) host.emit('session/event', session, event)
  const interrupted = await callRoute(host, '/taskflow/state', { url: '/taskflow/state?session=sess-1' })
  assert.equal(interrupted.json.tasks.items['补客户端面板'].status, 'stopped')
  assert.equal(typeof interrupted.json.tasks.items['补客户端面板'].stoppedAt, 'number', 'frozen at the turn end')
  assert.equal(interrupted.json.tasks.items['补客户端面板'].stopReason, 'interrupted')
  assert.equal(interrupted.json.tasks.items['补客户端面板'].pausedAt, undefined, 'no stale waiting stamp')
  assert.equal(
    interrupted.json.currentList.find((todo) => todo.content === '补客户端面板').status,
    'stopped',
    'the published list reports the terminal status',
  )
  assert.equal(typeof state.tasks.items['写宿主插件'].startedAt, 'number')
  assert.equal(typeof state.tasks.updatedAt, 'number')

  // Per-session state is persisted under DSH_HOME.
  const file = join(home, 'taskflow', 'sess-1.json')
  await waitFor(() => existsSync(file))
  await waitFor(() => JSON.parse(readFileSync(file, 'utf8')).segments.length === 1)
  const persisted = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(persisted.segments[0].title, '打通插件壳')

  // The push frame must stay slim: no history, no step bodies.
  assert.equal(state.segments, undefined, 'full segment array stays off the poll frame')
  assert.equal(state.tasks.history, undefined, 'history is not shipped')
  assert.equal(typeof state.segmentCount, 'number')
  assert.equal(state.latestSegment.title, '打通插件壳')
  const firstTask = Object.values(state.tasks.items)[0]
  assert.equal(firstTask.steps, undefined, 'steps are fetched on demand')
  assert.equal(typeof firstTask.stepCount, 'number')

  // On-demand endpoints.
  const segs = await callRoute(host, '/taskflow/segments', { url: '/taskflow/segments?session=sess-1' })
  assert.equal(segs.status, 200)
  assert.equal(segs.json.segments.length, 1)
  assert.equal(segs.json.segments[0].title, '打通插件壳')

  const taskName = '读插件 API'
  const taskRes = await callRoute(host, '/taskflow/task', { url: `/taskflow/task?session=sess-1&content=${encodeURIComponent(taskName)}` })
  assert.equal(taskRes.status, 200)
  assert.ok(taskRes.json.item)
  const missingTask = await callRoute(host, '/taskflow/task', { url: '/taskflow/task?session=sess-1&content=nope' })
  assert.equal(missingTask.status, 404)

  // The SSE route pushes one initial frame, then closes cleanly.
  const sseRoute = host.routes.get('/taskflow/events')
  const sseRequest = fakeRequest('GET', '/taskflow/events?session=sess-1')
  const closeHandlers = []
  sseRequest.on = (name, handler) => {
    if (name === 'close') closeHandlers.push(handler)
    return sseRequest
  }
  const sseResponse = fakeResponse()
  await sseRoute.handler(sseRequest, sseResponse)
  assert.equal(sseResponse.status, 200)
  assert.match(sseResponse.headers['content-type'], /text\/event-stream/)
  assert.match(sseResponse.written, /^: connected/)
  assert.match(sseResponse.written, /event: state/)
  const frame = sseResponse.written.split('data: ')[1].split('\n')[0]
  const frameJson = JSON.parse(frame)
  assert.equal(frameJson.segmentCount, 1)
  for (const close of closeHandlers) close()

  // Health route answers and reports client liveness.
  const health = await callRoute(host, '/taskflow/health')
  assert.equal(health.status, 200)
  assert.equal(health.json.ok, true)
  assert.equal(health.json.client, null, 'no browser handshake yet')
  assert.ok(health.json.stateHits >= 1, 'state reads are counted')

  // The browser handshake records which build is live.
  const ready = await callRoute(host, '/taskflow/client-ready', {
    method: 'POST',
    body: { build: 'c3', href: 'dsh-app://app/', ua: 'Electron/test' },
  })
  assert.equal(ready.status, 200)
  const healthAfter = await callRoute(host, '/taskflow/health')
  assert.equal(healthAfter.json.client.build, 'c3')
  assert.equal(healthAfter.json.client.href, 'dsh-app://app/')

  // A second turn with nothing substantial is marked skipped (not pending).
  session.append('turn/start', { turn: 2 })
  session.append('user/message', { id: 'm2', role: 'user', content: [{ type: 'text', text: '谢谢' }], source: { kind: 'user' } })
  session.append('turn/end', { turn: 2, reason: { kind: 'stop' } })
  for (const event of session.events.slice(-3)) host.emit('session/event', session, event)
  const after = await waitFor(async () => {
    const result = await callRoute(host, '/taskflow/state', { url: '/taskflow/state?session=sess-1' })
    return result.json.skipped.includes(2) ? result.json : null
  })
  assert.equal(after.lastTurn, 2)
  assert.equal(after.segmentCount, 1)
}

/* ---------------------------------------------------------------------- */
/* Scenario 1c: pressing stop freezes the running task as stopped          */
/* ---------------------------------------------------------------------- */

{
  const host = makeHost()
  const webServer = makeWebServer(host.routes)
  const session = makeSession('sess-stop', '/tmp/stop')
  host.register('webServer', webServer)
  host.register('sessions', { get: (id) => (id === session.id ? session : undefined) })

  apply(host, { minToolCalls: 1, minAssistantChars: 240 })

  session.append('turn/start', { turn: 1 })
  session.append('user/message', { id: 'u1', role: 'user', content: [{ type: 'text', text: '查一下远端分支' }], source: { kind: 'user' } })
  session.append('todo/write', {
    todos: [
      { content: '读取远端仓库当前分支、提交与工作区状态', status: 'in_progress' },
      { content: '确认临时诊断代码是否还在', status: 'pending' },
      { content: '汇报当前分支与待处理项', status: 'pending' },
    ],
  })
  session.append('tool/call', { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: { command: 'git status' } })
  session.append('turn/end', { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } })
  for (const event of session.events) host.emit('session/event', session, event)

  const stopped = await callRoute(host, '/taskflow/state', { url: '/taskflow/state?session=sess-stop' })
  assert.equal(stopped.json.openTurn, null, 'the turn is closed')
  assert.equal(stopped.json.inTurn, false)
  const item = stopped.json.tasks.items['读取远端仓库当前分支、提交与工作区状态']
  assert.equal(item.status, 'stopped', 'a stopped task is terminal, not in progress')
  assert.equal(typeof item.stoppedAt, 'number')
  assert.equal(item.stopReason, 'aborted')
  assert.equal(item.pausedAt, undefined)
  assert.equal(
    stopped.json.currentList.find((todo) => todo.content === item.content).status,
    'stopped',
    'the strip receives the terminal status, not the model\'s in_progress write',
  )
  assert.equal(
    Object.values(stopped.json.tasks.items).some((todo) => todo.status === 'in_progress'),
    false,
    'nothing keeps running after a stop',
  )

  // A new turn that writes the same task again reopens it.
  session.append('turn/start', { turn: 2 })
  session.append('todo/write', { todos: [{ content: item.content, status: 'in_progress' }] })
  for (const event of session.events.slice(-2)) host.emit('session/event', session, event)
  const resumed = await callRoute(host, '/taskflow/state', { url: '/taskflow/state?session=sess-stop' })
  assert.equal(resumed.json.tasks.items[item.content].status, 'in_progress')
  assert.equal(resumed.json.tasks.items[item.content].stoppedAt, undefined, 'a fresh write clears the stop stamp')
}

/* ---------------------------------------------------------------------- */
/* Scenario 2: no LLM route -> deterministic mechanical summary            */
/* ---------------------------------------------------------------------- */

{
  const host = makeHost()
  const webServer = makeWebServer(host.routes)
  const session = makeSession('sess-2', '/tmp/demo')
  host.register('webServer', webServer)
  host.register('sessions', { get: (id) => (id === session.id ? session : undefined) })
  // Deliberately no llm service.

  apply(host, { minToolCalls: 0, minAssistantChars: 0 })

  session.append('turn/start', { turn: 7 })
  session.append('user/message', { id: 'u', role: 'user', content: [{ type: 'text', text: '修一个崩溃' }], source: { kind: 'user' } })
  session.append('tool/call', { turn: 7, step: 1, callId: 'x', name: 'grep', arguments: { pattern: 'segfault' } })
  session.append('tool/call', { turn: 7, step: 2, callId: 'y', name: 'read', arguments: { file_path: 'src/main.cc' } })
  session.append('assistant/message', { turn: 7, step: 2, message: { content: [{ type: 'text', text: '定位到空指针。' }] } })
  session.append('turn/end', { turn: 7, reason: { kind: 'stop' } })
  for (const event of session.events) host.emit('session/event', session, event)

  const state = await waitFor(async () => {
    const result = await callRoute(host, '/taskflow/state', { url: '/taskflow/state?session=sess-2' })
    return result.json.segmentCount > 0 ? result.json : null
  })
  const segment = state.latestSegment
  assert.equal(segment.mechanical, true)
  assert.equal(segment.turn, 7)
  assert.match(segment.title, /修一个崩溃/)
  assert.ok(segment.bullets.some((line) => line.includes('src/main.cc')))
}

/* ---------------------------------------------------------------------- */
/* Scenario 3: manual summarize + slash command                            */
/* ---------------------------------------------------------------------- */

{
  const host = makeHost()
  const webServer = makeWebServer(host.routes)
  const session = makeSession('sess-3', '/tmp/demo')
  host.register('webServer', webServer)
  host.register('llm', makeLlm('## 手动一段\n- 手动触发成功'))
  host.register('sessions', { get: (id) => (id === session.id ? session : undefined) })
  host.register('commands', {
    register(definition) {
      host.commands.set(definition.name, definition)
      return () => host.commands.delete(definition.name)
    },
  })

  apply(host, { minToolCalls: 5, minAssistantChars: 10_000 })

  session.append('turn/start', { turn: 3 })
  session.append('user/message', { id: 'u', role: 'user', content: [{ type: 'text', text: '手动总结这一段' }], source: { kind: 'user' } })
  session.append('todo/write', { todos: [{ content: '手动任务', status: 'completed' }] })
  session.append('assistant/message', { turn: 3, step: 1, message: { content: [{ type: 'text', text: '完成。' }] } })
  session.append('turn/end', { turn: 3, reason: { kind: 'stop' } })
  for (const event of session.events) host.emit('session/event', session, event)

  // Automatic path declined it (thresholds are high).
  const before = await callRoute(host, '/taskflow/state', { url: '/taskflow/state?session=sess-3' })
  assert.equal(before.json.segmentCount, 0)
  assert.deepEqual(before.json.skipped, [3])

  // The slash command forces one.
  const command = host.commands.get('taskflow')
  assert.ok(command, '/taskflow command registered')
  const result = command.handler({ agent: { session }, rawInput: '', signal: new AbortController().signal })
  assert.equal(result.kind, 'success')

  const after = await waitFor(async () => {
    const response = await callRoute(host, '/taskflow/state', { url: '/taskflow/state?session=sess-3' })
    return response.json.segmentCount > 0 ? response.json : null
  })
  assert.equal(after.latestSegment.title, '手动一段')
  assert.deepEqual(after.latestSegment.bullets, ['手动触发成功'])
  assert.deepEqual(after.skipped, [])

  // The HTTP manual route reports "nothing to summarize" once a segment exists.
  const manual = await callRoute(host, '/taskflow/summarize', {
    method: 'POST',
    body: { session: 'sess-3' },
  })
  assert.equal(manual.status, 200)
  assert.equal(manual.json.queued, false)

  // Unknown session is rejected.
  const missing = await callRoute(host, '/taskflow/summarize', { method: 'POST', body: { session: 'nope' } })
  assert.equal(missing.status, 404)
}


/* ---------------------------------------------------------------------- */
/* Scenario 4: mid-turn mount, aborted turns, no-content guard             */
/* ---------------------------------------------------------------------- */

{
  const host = makeHost()
  const webServer = makeWebServer(host.routes)
  const session = makeSession('sess-4', '/tmp/long')
  host.register('webServer', webServer)
  host.register('sessions', { get: (id) => (id === session.id ? session : undefined) })

  apply(host, { minToolCalls: 1, minAssistantChars: 240 })

  // 300 unrelated events before the turn: a fixed "last 400 events" window would
  // still cover them, so make the turn itself long enough to prove the plugin
  // anchors on turn/start rather than a guessed offset.
  for (let index = 0; index < 300; index += 1) session.append('tool/call', { turn: 0, step: 0, callId: `f${index}`, name: 'read', arguments: { file_path: `/tmp/filler-${index}.txt` } })

  // The turn starts while the plugin is NOT watching it (mounted mid-turn).
  session.append('turn/start', { turn: 5 })
  session.append('user/message', { id: 'u5', role: 'user', content: [{ type: 'text', text: '修复空指针崩溃' }], source: { kind: 'user' } })
  session.append('tool/call', { turn: 5, step: 1, callId: 'c1', name: 'read', arguments: { file_path: 'src/main.cc' } })
  session.append('tool/call', { turn: 5, step: 2, callId: 'c2', name: 'edit', arguments: { file_path: 'src/main.cc' } })
  session.append('assistant/message', { turn: 5, step: 2, message: { content: [{ type: 'text', text: '已补上空指针判断。' }] } })
  session.append('turn/end', { turn: 5, reason: { kind: 'stop' } })
  // Only the closing event reaches the plugin, exactly like a mid-turn mount.
  host.emit('session/event', session, session.events.at(-1))

  const state = await waitFor(async () => {
    const result = await callRoute(host, '/taskflow/state', { url: '/taskflow/state?session=sess-4' })
    return result.json.segmentCount > 0 ? result.json : null
  })
  const segment = state.latestSegment
  assert.equal(segment.turn, 5)
  assert.match(segment.title, /修复空指针/, 'the user request survives a mid-turn mount')
  assert.equal(segment.toolCalls, 2)
  assert.ok(segment.files.includes('src/main.cc'), 'files come from the turn, not the filler')

  // An interrupted turn is skipped without calling anyone.
  session.append('turn/start', { turn: 6 })
  host.emit('session/event', session, session.events.at(-1))
  session.append('turn/end', { turn: 6, reason: { kind: 'aborted' } })
  host.emit('session/event', session, session.events.at(-1))

  const after = await waitFor(async () => {
    const result = await callRoute(host, '/taskflow/state', { url: '/taskflow/state?session=sess-4' })
    return result.json.skipped.includes(6) ? result.json : null
  })
  assert.equal(after.segmentCount, 1, 'an aborted turn produces no segment')
  assert.equal(after.lastTurn, 6)
}

/* ---------------------------------------------------------------------- */
/* Scenario 5: a stopped turn restored from disk must not stay active      */
/* ---------------------------------------------------------------------- */

{
  const host = makeHost()
  const webServer = makeWebServer(host.routes)
  const session = makeSession('sess-5', '/tmp/stopped')
  host.register('webServer', webServer)
  host.register('sessions', { get: (id) => (id === session.id ? session : undefined) })

  // What an older build left on disk: a task frozen as "waiting for the human"
  // after the user pressed stop. Nothing is running any more.
  const now = Date.now()
  const dir = join(home, 'taskflow')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'sess-5.json'), JSON.stringify({
    version: '0.1.0',
    sessionId: 'sess-5',
    updatedAt: now,
    lastTurn: 1,
    skipped: [],
    turns: {},
    segments: [],
    tasks: {
      items: {
        '导出日志': { content: '导出日志', status: 'in_progress', firstSeen: now - 20_000, startedAt: now - 12_000, pausedAt: now - 1_000 },
        '写结论': { content: '写结论', status: 'pending', firstSeen: now - 20_000 },
      },
      history: [{
        at: now - 20_000,
        turn: 1,
        todos: [
          { content: '导出日志', status: 'in_progress' },
          { content: '写结论', status: 'pending' },
        ],
      }],
      updatedAt: now - 20_000,
    },
  }))

  session.append('turn/start', { turn: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } })
  apply(host, { minToolCalls: 1 })

  const restored = await callRoute(host, '/taskflow/state', { url: '/taskflow/state?session=sess-5' })
  assert.equal(restored.json.tasks.items['导出日志'].status, 'stopped', 'a legacy paused row settles as stopped')
  assert.equal(typeof restored.json.tasks.items['导出日志'].stoppedAt, 'number')
  assert.equal(restored.json.currentList.find((todo) => todo.content === '导出日志').status, 'stopped')
  assert.equal(restored.json.inTurn, false)
}

console.log('taskflow host tests passed')
