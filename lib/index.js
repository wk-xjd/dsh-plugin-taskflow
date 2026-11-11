/**
 * TaskFlow — host half (DeepSeek Harness plugin).
 *
 * Two jobs:
 *   1. Keep a per-session timeline of the agent's todo list, so the browser can
 *      show how long every task has been running / took to finish.
 *   2. When a turn ends, condense that turn (tool calls, files, commands, the
 *      assistant's own closing prose) into a short "segment" summary with one
 *      lightweight model call, then serve it to the browser over HTTP.
 *
 * Zero package dependencies on purpose: the plugin only touches Node builtins
 * and the cordis services the host already provides (`session` events, `llm`,
 * `webServer`, `commands`, `sessions`). Nothing here imports a @deepseek-ai
 * package, so the plugin keeps working when the profile's module links move.
 *
 * Data lives in `$DSH_HOME/taskflow/<session>.json` (DSH_HOME defaults to
 * ~/.dsh). It is display-only state: losing it costs timings and summaries,
 * never session correctness.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'

export const name = 'taskflow'

const VERSION = '0.1.0'
const MAX_SEGMENTS = 60
const MAX_HISTORY = 40
const MAX_DIGEST_CHARS = 14_000
const SAVE_DEBOUNCE_MS = 400

const DEFAULT_CONFIG = {
  /** Master switch: false keeps the strip but never calls a model. */
  enabled: true,
  /** Summarize turns with at least this many tool calls ... */
  minToolCalls: 1,
  /** ... or with at least this much assistant prose (whitespace-trimmed). */
  minAssistantChars: 240,
  /** Hard cap for the digest handed to the summarizer. */
  maxDigestChars: MAX_DIGEST_CHARS,
  /** Output budget of the summarization call. */
  maxOutputTokens: 600,
  /** Per-call watchdog. */
  timeoutMs: 45_000,
  /** Concurrent summarization calls across all sessions. */
  maxConcurrent: 2,
  /** Optional explicit route; empty means "whatever the session last used". */
  provider: '',
  model: '',
  /** Retain at most this many segments per session. */
  maxSegments: MAX_SEGMENTS,
  /** Delegated child sessions are skipped by default: their turns are not the user's. */
  includeSubagents: false,
  /** Add the task-list policy to the model's system prompt. */
  taskListPolicy: true,
  /** Add the parallel-decomposition policy (absorbed from the SDK parallel-agents SOP). */
  parallelPolicy: true,
}

const TASK_PROMPT = [
  '你是一名工程进度记录员。输入是 agent 完成某个任务期间的真实动作记录（工具调用、文件、耗时）。',
  '请把「这个任务到底做了什么」压缩成一句话中文小结，规则：',
  '- 一句话，不超过 60 个字，动词开头；',
  '- 只写做了什么、改了什么、结论是什么；保留关键文件名/命令/错误码；',
  '- 不要写「已完成」「成功完成」这类状态词，不要评价，不要分点，不要换行；',
  '- 如果记录里几乎没有有效动作，只输出「无有效动作」。',
].join('\n')

const SYSTEM_PROMPT = [
  '你是一名严谨的工程进度记录员。输入是一段 agent 会话回合的原始记录，包含用户请求、工具调用、文件改动与助手回复。',
  '请把这一段压缩成中文小结，严格遵循下列格式，不要输出任何额外解释：',
  '第一行：不超过 24 个字的标题，动词开头，不要句号、不要引号。',
  '随后 1-3 行，每行以「- 」开头，写关键动作、产物或结论；保留具体的文件路径、命令、错误要点；',
  '不要复述用户原话，不要写「本次」「我们」这类空话，不要评价工作质量。',
  '如果这段没有实质产出（被中断、只有时间戳/元信息、没有动作也没有结论），只输出一行「（无实质产出）」，不要编造过程。',
  '只输出小结本身。',
].join('\n')

/**
 * Resolve the on-disk state root once, so a later DSH_HOME change cannot split
 * one session's records across two directories.
 */
function stateRoot() {
  const home = process.env.DSH_HOME && process.env.DSH_HOME.length > 0 ? process.env.DSH_HOME : join(homedir(), '.dsh')
  return join(home, 'taskflow')
}

/** Encode a session id into a portable file name. */
function stateFile(sessionId) {
  return join(stateRoot(), `${encodeURIComponent(sessionId)}.json`)
}

function log(ctx, level, message) {
  try {
    const logger = typeof ctx.logger === 'function' ? ctx.logger('taskflow') : ctx.logger
    const fn = logger?.[level]
    if (typeof fn === 'function') fn.call(logger, message)
  } catch {
    // Logging must never take the plugin down.
  }
}

/** Concatenate the text blocks of one message payload. */
function textOf(message) {
  const content = message?.content
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block && block.type === 'text' && typeof block.text === 'string' && block.text.length > 0) parts.push(block.text)
  }
  return parts.join('\n')
}

/** One-line, length-bounded rendering of arbitrary tool arguments. */
function describeArgs(name, args) {
  // Tool-call arguments arrive either as an object or as the raw JSON string.
  let value = args
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return clip(value.replace(/\s+/g, ' ').trim(), 160)
    }
  }
  args = value
  if (!args || typeof args !== 'object') return ''
  const first = (...keys) => {
    for (const key of keys) {
      const value = args[key]
      if (typeof value === 'string' && value.length > 0) return value
    }
    return ''
  }
  const direct = first('command', 'file_path', 'filePath', 'path', 'pattern', 'query', 'url', 'name', 'prompt')
  if (direct.length > 0) return clip(direct.replace(/\s+/g, ' ').trim(), 160)
  try {
    return clip(JSON.stringify(args), 160)
  } catch {
    return ''
  }
}

function clip(text, limit) {
  const value = String(text)
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`
}

/** Collect the file paths a tool call touched, when it names any. */
function pathsOf(args) {
  const out = []
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args)
    } catch {
      return out
    }
  }
  if (!args || typeof args !== 'object') return out
  for (const key of ['file_path', 'filePath', 'path', 'paths', 'target', 'destination']) {
    const value = args[key]
    if (typeof value === 'string' && value.length > 0) out.push(value)
    else if (Array.isArray(value)) for (const item of value) if (typeof item === 'string' && item.length > 0) out.push(item)
  }
  return out
}

/**
 * Fold one turn's events into the compact text a summarizer can read.
 * @returns {{ digest: string, toolCalls: number, assistantChars: number, files: string[], commands: string[] }}
 */
function buildDigest(events, cwd) {
  const lines = []
  const files = new Set()
  const commands = []
  let toolCalls = 0
  let assistantChars = 0
  let userText = ''
  let assistantText = ''

  for (const event of events) {
    switch (event.type) {
      case 'user/message': {
        const text = textOf(event.data)
        if (text.length > 0) userText = text
        break
      }
      case 'assistant/message': {
        const text = textOf(event.data?.message)
        if (text.length > 0) {
          assistantText = assistantText.length > 0 ? `${assistantText}\n${text}` : text
          assistantChars += text.trim().length
        }
        break
      }
      case 'tool/call': {
        toolCalls += 1
        const toolName = String(event.data?.name ?? 'tool')
        const args = event.data?.arguments
        for (const path of pathsOf(args)) files.add(path)
        if (toolName === 'bash' || toolName === 'pwsh') {
          const command = typeof args?.command === 'string' ? args.command.trim() : ''
          if (command.length > 0) commands.push(clip(command.split('\n')[0], 140))
        }
        lines.push(`- ${toolName}: ${describeArgs(toolName, args)}`)
        break
      }
      case 'tool/result': {
        const error = event.data?.error
        if (error && typeof error.message === 'string') lines.push(`  ! 失败: ${clip(error.message.replace(/\s+/g, ' '), 160)}`)
        break
      }
      case 'todo/write': {
        const todos = Array.isArray(event.data?.todos) ? event.data.todos : []
        if (todos.length > 0) {
          const done = todos.filter((item) => item.status === 'completed').length
          const active = todos.find((item) => item.status === 'in_progress')
          lines.push(`- 任务清单: ${done}/${todos.length} 完成${active ? `，进行中「${active.content}」` : ''}`)
        }
        break
      }
      default:
        break
    }
  }

  const tail = assistantText.trim()
  const head = [
    userText.trim().length > 0 ? `用户请求：${clip(userText.trim(), 600)}` : '',
    cwd ? `工作目录：${cwd}` : '',
    lines.length > 0 ? `执行过程：\n${lines.slice(0, 60).join('\n')}` : '',
    tail.length > 0 ? `助手收尾：${clip(tail, 900)}` : '',
  ].filter((part) => part.length > 0)

  return {
    digest: head.join('\n\n'),
    toolCalls,
    assistantChars,
    files: [...files].slice(0, 16),
    commands: commands.slice(0, 8),
  }
}

/** Split the model's answer into a title and bullet lines. */
function parseSummary(raw) {
  const lines = String(raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  if (lines.length === 0) return null
  let title = lines[0].replace(/^#+\s*/, '').replace(/^["'「『]|["'」』]$/g, '').trim()
  title = clip(title, 60)
  const bullets = []
  for (const line of lines.slice(1)) {
    if (/^[-*·•]/.test(line)) bullets.push(clip(line.replace(/^[-*·•]\s*/, ''), 220))
  }
  if (bullets.length === 0 && lines.length > 1) bullets.push(clip(lines.slice(1).join(' '), 220))
  return { title, bullets: bullets.slice(0, 4) }
}

/** Deterministic summary used when no model route exists or the call fails. */
function mechanicalSummary(input) {
  const { digestParts } = input
  const titleSource = digestParts.userText
    || (digestParts.files && digestParts.files[0])
    || (digestParts.commands && digestParts.commands[0])
    || `第 ${input.turn} 段`
  const bullets = []
  if (digestParts.toolCalls > 0) bullets.push(`${digestParts.toolCalls} 次工具调用：${digestParts.toolNames.slice(0, 5).join('、')}`)
  if (digestParts.files.length > 0) bullets.push(`改动文件：${digestParts.files.slice(0, 4).join('、')}`)
  if (digestParts.commands.length > 0) bullets.push(`命令：${digestParts.commands.slice(0, 3).join('；')}`)
  if (bullets.length === 0 && digestParts.assistantTail) bullets.push(clip(digestParts.assistantTail, 180))
  return { title: clip(titleSource, 40), bullets: bullets.slice(0, 3) }
}

export function apply(ctx, rawConfig) {
  const config = { ...DEFAULT_CONFIG, ...(rawConfig && typeof rawConfig === 'object' ? rawConfig : {}) }
  /** @type {Map<string, object>} */
  const states = new Map()
  /** @type {Array<() => Promise<void>>} */
  const queue = []
  /** @type {Set<string>} */
  const pending = new Set()
  /** sessionId → Set<ServerResponse> of live SSE listeners. */
  const streams = new Map()
  /** Debounced per-session broadcast, so a burst of events costs one frame. */
  const streamTimers = new Map()

  function streamSubscribers(sessionId) {
    const set = streams.get(sessionId)
    return set === undefined ? [] : [...set]
  }

  function pushFrame(response, state) {
    try {
      response.write(`event: state\ndata: ${JSON.stringify(payload(state))}\n\n`)
    } catch {
      // A dead socket is cleaned up by its own close handler.
    }
  }

  /** Send the current state to every listener of one session, at most every 80 ms. */
  function broadcast(sessionId) {
    if (!streams.has(sessionId)) return
    const existing = streamTimers.get(sessionId)
    if (existing) return
    streamTimers.set(sessionId, setTimeout(() => {
      streamTimers.delete(sessionId)
      const state = states.get(sessionId)
      if (!state) return
      for (const response of streamSubscribers(sessionId)) pushFrame(response, state)
    }, 80))
  }

  /** childSessionId → { parentId, inTurn } for delegated subagents that are running. */
  const childSessions = new Map()
  /** Every session id we have seen an event for, with its meta origin (diagnostics). */
  const seenSessions = new Map()
  const saveTimers = new Map()
  /** Contents completed by the current todo/write call, drained by recordTodos. */
  const pendingTaskSummaries = []
  /** Queue for per-task summaries, independent from the per-turn segment queue. */
  const taskQueue = []
  /** @type {Set<string>} */
  const taskPending = new Set()
  let taskRunning = 0
  let running = 0
  let llm = null
  // Liveness counters: they answer "did the browser half actually run and is it
  // talking to me?" from /taskflow/health, without a screenshot.
  let stateHits = 0
  let lastStateAt = 0
  let summaryRequests = 0
  let clientHello = null
  let policyRegistered = false
  let parallelPolicyRegistered = false
  /** Last measured geometry per rendered surface, reported by the browser half. */
  const renders = {}

  /** Lazily load (or create) one session's display state. */
  function stateOf(sessionId) {
    const cached = states.get(sessionId)
    if (cached) return cached
    let loaded = null
    try {
      loaded = JSON.parse(readFileSync(stateFile(sessionId), 'utf8'))
    } catch {
      loaded = null
    }
    const state = {
      version: VERSION,
      sessionId,
      updatedAt: 0,
      open: null,
      lastTurn: typeof loaded?.lastTurn === 'number' ? loaded.lastTurn : 0,
      skipped: Array.isArray(loaded?.skipped) ? loaded.skipped : [],
      turns: {},
      segments: Array.isArray(loaded?.segments) ? loaded.segments : [],
      tasks: {
        items: loaded?.tasks && typeof loaded.tasks.items === 'object' && loaded.tasks.items !== null ? loaded.tasks.items : {},
        history: Array.isArray(loaded?.tasks?.history) ? loaded.tasks.history : [],
        updatedAt: loaded?.tasks?.updatedAt ?? 0,
      },
    }
    states.set(sessionId, state)
    return state
  }

  /** Debounced atomic write of one session's display state. */
  function scheduleSave(state) {
    state.updatedAt = Date.now()
    const existing = saveTimers.get(state.sessionId)
    if (existing) clearTimeout(existing)
    saveTimers.set(state.sessionId, setTimeout(() => {
      saveTimers.delete(state.sessionId)
      try {
        mkdirSync(stateRoot(), { recursive: true })
        const target = stateFile(state.sessionId)
        const temp = `${target}.${process.pid}.tmp`
        writeFileSync(temp, JSON.stringify(state))
        renameSync(temp, target)
      } catch (error) {
        log(ctx, 'warn', `[taskflow] failed to persist ${state.sessionId}: ${error?.message ?? error}`)
      }
    }, SAVE_DEBOUNCE_MS))
  }

  /** Track todo transitions so the strip can show per-task timing. */
  function recordTodos(session, state, event, turn) {
    const todos = Array.isArray(event.data?.todos) ? event.data.todos : []
    pendingTaskSummaries.length = 0
    const now = typeof event.time === 'number' ? event.time : Date.now()
    const seen = new Set()
    for (const todo of todos) {
      if (!todo || typeof todo.content !== 'string') continue
      const content = todo.content
      seen.add(content)
      const item = state.tasks.items[content] ?? (state.tasks.items[content] = { content, firstSeen: now })
      item.status = todo.status
      item.lastSeen = now
      if (todo.status === 'in_progress' && !item.startedAt) item.startedAt = now
      if (todo.status === 'completed' && !item.completedAt) {
        item.completedAt = now
        item.summaryPending = true
        pendingTaskSummaries.push(content)
      }
      if (todo.status !== 'completed') item.completedAt = null
      delete item.dropped
    }
    for (const [content, item] of Object.entries(state.tasks.items)) {
      if (!seen.has(content) && item.status !== 'completed') item.dropped = true
    }
    const running = todos.find((todo) => todo && todo.status === 'in_progress')
    state.currentTask = running ? running.content : null
    state.tasks.history.push({ at: now, turn: turn ?? null, todos })
    if (state.tasks.history.length > MAX_HISTORY) state.tasks.history.splice(0, state.tasks.history.length - MAX_HISTORY)
    state.tasks.updatedAt = now
    // Authoritative current list, scoped to the turn it belongs to: the client
    // uses it only when the `todos` projection is unavailable.
    state.currentList = todos.map((todo) => ({ content: todo.content, status: todo.status }))
    state.currentListTurn = typeof turn === 'number' ? turn : (typeof state.openTurn === 'number' ? state.openTurn : null)
    for (const content of pendingTaskSummaries) queueTaskSummary(session, state, content)
    scheduleSave(state)
  }

  /** Route used for one summarization call: the session's own last request wins. */
  function resolveRoute(session) {
    if (config.provider && config.model) return { provider: config.provider, model: config.model }
    try {
      const context = session.requestContext?.()
      if (context?.provider && context?.model) return { provider: context.provider, model: context.model }
    } catch {
      // fall through
    }
    try {
      const headerConfig = session.requestHeader?.()?.config
      if (headerConfig?.provider && headerConfig?.model) return { provider: headerConfig.provider, model: headerConfig.model }
    } catch {
      // fall through
    }
    return null
  }

  /** Stream one auxiliary completion and return its text plus terminal facts. */
  async function streamCompletion(route, system, userText, sessionId) {
    if (!llm) throw new Error('llm service is not available')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('taskflow: summarization timed out')), config.timeoutMs)
    let text = ''
    let finish = null
    let usage
    try {
      const options = {
        provider: route.provider,
        model: route.model,
        system,
        messages: [{
          id: randomUUID(),
          role: 'user',
          source: { kind: 'plugin', plugin: 'dsh-plugin-taskflow' },
          content: [{ type: 'text', text: userText }],
        }],
        maxTokens: config.maxOutputTokens,
        sessionId,
        signal: controller.signal,
      }
      for await (const chunk of llm.stream(options)) {
        if (!chunk || typeof chunk !== 'object') continue
        if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
        else if (chunk.type === 'finish') finish = chunk.reason ?? chunk
        else if (chunk.type === 'usage') usage = chunk.usage
      }
    } finally {
      clearTimeout(timer)
    }
    // A truncated answer is still an answer: reasoning tokens or a long opening
    // line can eat the budget before the model writes its last bullet. Only an
    // empty body counts as a failure.
    if (finish && finish.kind !== 'stop' && finish.kind !== 'max-tokens') {
      const reason = finish.kind === 'error' || finish.kind === 'aborted' ? (finish.failure?.message ?? finish.kind) : finish.kind
      throw new Error(`taskflow: summarization finished with ${reason}`)
    }
    const trimmed = text.trim()
    if (trimmed.length === 0) throw new Error(`taskflow: summarization produced no text (${finish?.kind ?? 'unknown finish'})`)
    return { text: trimmed, usage, truncated: finish?.kind === 'max-tokens' }
  }

  function pump() {
    while (running < Math.max(1, config.maxConcurrent) && queue.length > 0) {
      const task = queue.shift()
      running += 1
      Promise.resolve()
        .then(task)
        .catch((error) => log(ctx, 'warn', `[taskflow] summarization failed: ${error?.message ?? error}`))
        .finally(() => {
          running -= 1
          pump()
        })
    }
  }

  /** Summarize one completed turn and publish the segment. */
  function summarizeTurn(session, state, input) {
    const key = `${session.id}:${input.turn}`
    if (pending.has(key)) return Promise.resolve({ queued: false, reason: 'already running' })
    pending.add(key)
    let settle
    const done = new Promise((resolve) => {
      settle = resolve
    })
    queue.push(async () => {
      const outcome = { queued: true, turn: input.turn }
      try {
        const route = resolveRoute(session)
        let parsed = null
        let usedRoute = null
        let usage
        let summaryMs = 0
        let truncated = false
        let failure = null
        if (!config.enabled) failure = 'summarization disabled by config'
        else if (!route) failure = 'no provider/model route: the session has no request context and no config override'
        else {
          try {
            const callStarted = Date.now()
            const result = await streamCompletion(route, SYSTEM_PROMPT, input.digest, session.id)
            summaryMs = Date.now() - callStarted
            truncated = result.truncated === true
            parsed = parseSummary(result.text)
            if (!parsed) failure = 'model returned no usable text'
            else {
              usedRoute = route
              usage = result.usage
            }
          } catch (error) {
            failure = String(error?.message ?? error)
            log(ctx, 'warn', `[taskflow] model summary fell back to mechanical text: ${failure}`)
          }
        }
        outcome.route = route
        outcome.failure = failure
        if (parsed && parsed.title.includes('无实质产出')) {
          markSkipped(state, input.turn)
          scheduleSave(state)
          outcome.skipped = true
          settle(outcome)
          return
        }
        if (!parsed) parsed = mechanicalSummary(input)
        const segment = {
          turn: input.turn,
          at: input.endedAt,
          startedAt: input.startedAt,
          durationMs: Math.max(0, input.endedAt - input.startedAt),
          title: parsed.title,
          bullets: parsed.bullets,
          toolCalls: input.toolCalls,
          files: input.files,
          commands: input.commands,
          provider: usedRoute?.provider ?? null,
          model: usedRoute?.model ?? null,
          usage: usage ?? null,
          summaryMs,
          truncated: truncated || undefined,
          mechanical: usedRoute === null,
          failure,
        }
        state.skipped = state.skipped.filter((turn) => turn !== input.turn)
        state.segments = state.segments.filter((item) => item.turn !== input.turn)
        state.segments.push(segment)
        state.segments.sort((a, b) => a.turn - b.turn)
        if (state.segments.length > Math.max(1, config.maxSegments)) state.segments.splice(0, state.segments.length - config.maxSegments)
        state.lastSummary = { turn: input.turn, at: Date.now(), route: route ?? null, failure, mechanical: segment.mechanical }
        scheduleSave(state)
        broadcast(state.sessionId)
        outcome.segment = segment
        settle(outcome)
      } catch (error) {
        outcome.failure = String(error?.message ?? error)
        settle(outcome)
      } finally {
        pending.delete(key)
      }
    })
    pump()
    return done
  }

  /** Generate one task's own one-line summary from what happened while it ran. */
  function queueTaskSummary(session, state, content) {
    const key = `${session.id}:${content}`
    if (taskPending.has(key)) return
    const item = state.tasks.items[content]
    if (!item || item.summary) return
    taskPending.add(key)
    item.summaryPending = true
    taskQueue.push(async () => {
      try {
        const current = state.tasks.items[content]
        if (!current || current.summary) return
        const route = resolveRoute(session)
        const steps = (current.steps || []).slice(-10)
        const digest = [
          `任务：${content}`,
          current.startedAt && current.completedAt ? `耗时：${Math.round((current.completedAt - current.startedAt) / 1000)} 秒` : '',
          steps.length > 0 ? `动作：\n${steps.map((step) => `- ${step.n}: ${step.a || ''}`).join('\n')}` : '动作：（无工具调用记录）',
          current.files && current.files.length > 0 ? `文件：${current.files.join('、')}` : '',
        ].filter((line) => line.length > 0).join('\n')
        let text = ''
        if (config.enabled && route) {
          try {
            const result = await streamCompletion(route, TASK_PROMPT, clip(digest, 4000), session.id)
            text = result.text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0)[0] || ''
          } catch (error) {
            log(ctx, 'warn', `[taskflow] task summary fell back to mechanical: ${error?.message ?? error}`)
          }
        }
        if (text.length === 0 || text.includes('无有效动作')) {
          // Nothing worth calling a summary: leave it without one, so the UI keeps
          // the row non-clickable instead of opening an empty panel.
          delete current.summaryPending
          scheduleSave(state)
          return
        }
        current.summary = clip(text, 160)
        current.summaryAt = Date.now()
        delete current.summaryPending
        scheduleSave(state)
        broadcast(state.sessionId)
      } finally {
        taskPending.delete(key)
      }
    })
    pumpTaskQueue()
  }

  function pumpTaskQueue() {
    if (taskRunning >= 1 || taskQueue.length === 0) return
    const run = taskQueue.shift()
    taskRunning += 1
    Promise.resolve()
      .then(run)
      .catch((error) => log(ctx, 'warn', `[taskflow] task summary failed: ${error?.message ?? error}`))
      .finally(() => {
        taskRunning -= 1
        pumpTaskQueue()
      })
  }

  /** Reason of the last turn/end seen by deriveOpenTurn (null when the turn is open). */
  let lastReason
  /** Time of the most recent normally finished turn, used to reclaim stale items. */
  let lastCompletedEndAt = 0
  /** Recover the open turn after a mid-turn mount or restart: the last boundary wins. */
  function deriveOpenTurn(session) {
    lastReason = undefined
    lastCompletedEndAt = 0
    try {
      const events = session.snapshotEvents ? session.snapshotEvents() : []
      for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index]
        if (event.type === 'turn/end') {
          lastReason = event.data?.reason?.kind ?? null
          lastCompletedEndAt = event.data?.reason?.kind === 'completed' ? event.time : 0
          return null
        }
        if (event.type === 'turn/start') {
          // An abandoned turn leaves turn/start as the last boundary forever.
          // Silence for this long means nothing is actually running.
          const newest = events[events.length - 1]
          const lastAt = typeof newest?.time === 'number' ? newest.time : 0
          if (lastAt > 0 && Date.now() - lastAt > 15 * 60 * 1000) return null
          return typeof event.data?.turn === 'number' ? event.data.turn : null
        }
      }
    } catch {
      // treat as unknown
    }
    return undefined
  }

  /**
   * Items still open from a turn that already finished: the model delivered its
   * answer but never flipped them. Reclaim them by start time so a later turn's
   * items are left alone.
   */
  function reclaimStaleItems(state, endAt) {
    if (!(endAt > 0)) return false
    let changed = false
    for (const item of Object.values(state.tasks.items)) {
      if (item.status !== 'in_progress') continue
      const startedAt = typeof item.startedAt === 'number' ? item.startedAt : 0
      if (startedAt >= endAt) continue
      item.status = 'completed'
      item.completedAt = endAt
      item.autoClosed = true
      if (item.pausedAt) delete item.pausedAt
      changed = true
    }
    return changed
  }

  /** Close items the model left open after a normally finished turn. */
  function closeLeftovers(state, time) {
    let changed = false
    for (const item of Object.values(state.tasks.items)) {
      if (item.status !== 'in_progress') continue
      item.status = 'completed'
      item.completedAt = time
      item.autoClosed = true
      if (item.pausedAt) delete item.pausedAt
      changed = true
    }
    return changed
  }

  /** Whether a session is a delegated child whose turns should not be summarized. */
  function isSubagentSession(session) {
    const meta = session.meta
    if (!meta || typeof meta !== 'object') return false
    return meta.origin === 'subagent' || (typeof meta.delegationDepth === 'number' && meta.delegationDepth > 0)
  }

  /** Remember which subagent sessions exist and whether each is working right now. */
  function noteChildSession(session, event) {
    const header = session?.header ?? {}
    const meta = session?.meta ?? {}
    // The spawn metadata lands on the session header, not on `meta`.
    const origin = meta.origin ?? header.origin
    const parentId = meta.parentSession ?? header.parentSession
    if (session && typeof session.id === 'string') {
      const known = seenSessions.get(session.id)
      const current = {
        origin: origin ?? null,
        parent: parentId ?? null,
        turn: known?.turn ?? false,
      }
      if (event.type === 'turn/start') current.turn = true
      else if (event.type === 'turn/end') current.turn = false
      seenSessions.set(session.id, current)
    }
    if (origin !== 'subagent' || typeof parentId !== 'string' || parentId.length === 0) return
    let entry = childSessions.get(session.id)
    if (!entry) {
      entry = { parentId, inTurn: false }
      childSessions.set(session.id, entry)
    }
    entry.parentId = parentId
    if (event.type === 'turn/start') entry.inTurn = true
    else if (event.type === 'turn/end') entry.inTurn = false
  }

  function handleEvent(session, event) {
    noteChildSession(session, event)
    const state = stateOf(session.id)
    const turn = typeof event.data?.turn === 'number' ? event.data.turn : null
    switch (event.type) {
      case 'turn/start': {
        state.open = { turn, seq: event.seq, time: event.time }
        state.openTurn = turn
        // Work resumes: clear any "waiting for the human" stamp.
        for (const item of Object.values(state.tasks.items)) {
          if (item.pausedAt && item.status === 'in_progress') delete item.pausedAt
        }
        if (turn !== null) state.turns[turn] = { startSeq: event.seq, endedAt: null }
        // A new turn starts from a clean list; until the model writes one the
        // panel shows the planning placeholder instead of last turn's batch.
        state.currentList = null
        state.currentListTurn = null
        break
      }
      case 'turn/end': {
        const open = state.open && (turn === null || state.open.turn === turn) ? state.open : null
        state.open = null
        state.openTurn = null
        // A normally finished turn means the model already delivered its answer;
        // items it forgot to close are done in substance, so close them and mark
        // them as auto-closed. A turn that was aborted or errored is the opposite:
        // nobody is working on it, so freeze it as "waiting for confirmation".
        const endReason = event.data?.reason?.kind ?? null
        for (const item of Object.values(state.tasks.items)) {
          if (item.status !== 'in_progress') continue
          if (endReason === 'completed') {
            item.status = 'completed'
            item.completedAt = event.time
            item.autoClosed = true
            if (item.pausedAt) delete item.pausedAt
          } else if (!item.pausedAt) {
            item.pausedAt = event.time
          }
        }
        const opening = locateTurnStart(session, state, turn, open)
        if (turn !== null) {
          state.turns[turn] = { startSeq: opening.seq ?? state.turns[turn]?.startSeq ?? event.seq, endedAt: event.time }
          state.lastTurn = Math.max(state.lastTurn, turn)
        }
        // An interrupted or failed turn has no story worth spending a model call
        // on: it usually contains half a tool call and no conclusion.
        const reasonKind = event.data?.reason?.kind
        if (reasonKind === 'aborted' || reasonKind === 'error') {
          markSkipped(state, turn)
          scheduleSave(state)
          break
        }
        let events = []
        try {
          events = session.snapshotEvents(opening.seq ?? Math.max(0, event.seq - 400), event.seq + 1)
        } catch {
          events = []
        }
        const digest = buildDigest(events, session.meta?.cwd)
        if (turn === null || digest.digest.length === 0) break
        const substantial = digest.toolCalls >= Math.max(0, config.minToolCalls)
          || digest.assistantChars >= Math.max(0, config.minAssistantChars)
        if (!substantial) {
          markSkipped(state, turn)
          scheduleSave(state)
          break
        }
        const existing = state.segments.find((item) => item.turn === turn)
        if (existing) break
        if (!config.includeSubagents && isSubagentSession(session)) {
          markSkipped(state, turn)
          scheduleSave(state)
          break
        }
        pruneTurns(state)
        summarizeTurn(session, state, {
          turn,
          startedAt: opening.time ?? event.time,
          endedAt: event.time,
          digest: clip(digest.digest, Math.max(1000, config.maxDigestChars)),
          toolCalls: digest.toolCalls,
          files: digest.files,
          commands: digest.commands,
          digestParts: {
            userText: firstUserText(events),
            firstTool: digest.toolCalls > 0 ? '工具调用' : '',
            toolCalls: digest.toolCalls,
            toolNames: toolNamesOf(events),
            files: digest.files,
            commands: digest.commands,
            assistantTail: lastAssistantText(events),
          },
        })
        break
      }
      case 'tool/call': {
        // Attribute the work to whatever task was in progress at that moment, so
        // the detail view can say what a task actually involved — not just its
        // status and duration.
        const active = state.currentTask
        const item = active ? state.tasks.items[active] : undefined
        const bookkeeping = event.data?.name === 'todo_write' || event.data?.name === 'present'
        if (item && !bookkeeping) {
          const toolName = String(event.data?.name ?? 'tool')
          const args = event.data?.arguments
          item.steps = [...(item.steps || []), {
            n: toolName,
            a: describeArgs(toolName, args),
            at: event.time,
          }].slice(-12)
          const touched = pathsOf(args)
          if (touched.length > 0) item.files = [...new Set([...(item.files || []), ...touched])].slice(0, 10)
          scheduleSave(state)
        }
        break
      }
      case 'todo/write': {
        recordTodos(session, state, event, turn ?? state.open?.turn ?? null)
        break
      }
      default:
        break
    }
  }

  ctx.on('session/event', (session, event) => {
    try {
      handleEvent(session, event)
      if (event.type === 'todo/write' || event.type === 'turn/start' || event.type === 'turn/end') broadcast(session.id)
      const child = childSessions.get(session.id)
      if (child && (event.type === 'turn/start' || event.type === 'turn/end')) broadcast(child.parentId)
    } catch (error) {
      log(ctx, 'warn', `[taskflow] event handler failed on ${event?.type}: ${error?.message ?? error}`)
    }
  })

  // The model route is optional: without it the plugin still records turns and
  // publishes mechanical summaries.
  ctx.inject(['llm'], (host) => {
    llm = host.llm
    return () => {
      llm = null
    }
  })

  /** Build the JSON payload the browser polls. */
  /**
   * The most recent task list the host knows for a session. Prefers the list
   * written in the current turn; falls back to the newest history snapshot so a
   * conversation that this window has not opened yet still renders its list.
   * While a turn is running but nothing has been written yet, returns null so
   * the client can show the planning placeholder instead of a stale list.
   */
  function lastList(state) {
    if (Array.isArray(state.currentList) && state.currentList.length > 0) return state.currentList
    if (typeof state.openTurn === 'number') return null
    const history = Array.isArray(state.tasks.history) ? state.tasks.history : []
    for (let index = history.length - 1; index >= 0; index -= 1) {
      const todos = history[index]?.todos
      if (Array.isArray(todos) && todos.length > 0) {
        return todos
          .filter((todo) => todo && typeof todo.content === 'string')
          .map((todo) => ({ content: todo.content, status: todo.status }))
      }
    }
    return null
  }

  /** Tasks without their heavy step/file history: fetched on demand instead. */
  function lightTasks(state) {
    const items = {}
    for (const [content, item] of Object.entries(state.tasks.items)) {
      const { steps, files, ...rest } = item
      items[content] = { ...rest, stepCount: Array.isArray(steps) ? steps.length : 0, fileCount: Array.isArray(files) ? files.length : 0 }
    }
    return { items, updatedAt: state.tasks.updatedAt }
  }

  /**
   * Compact state frame. History and full segment/step bodies are omitted: the
   * client asks for them only when a surface actually shows them, which keeps
   * the push frame small enough to send on every change.
   */
  function payload(state) {
    const latest = state.segments.length > 0 ? state.segments[state.segments.length - 1] : null
    return {
      ok: true,
      version: VERSION,
      sessionId: state.sessionId,
      enabled: config.enabled,
      latestSegment: latest,
      segmentCount: state.segments.length,
      tasks: lightTasks(state),
      currentList: lastList(state),
      currentListTurn: typeof state.currentListTurn === 'number' ? state.currentListTurn : null,
      lastTurn: state.lastTurn,
      openTurn: typeof state.openTurn === 'number' ? state.openTurn : null,
      delegates: [...childSessions.values()].filter((child) => child.parentId === state.sessionId && child.inTurn).length,
      inTurn: state.openTurn === undefined ? null : state.openTurn !== null,
      skipped: state.skipped,
      pending: [...pending].some((key) => key.startsWith(`${state.sessionId}:`)),
      lastSummary: state.lastSummary ?? null,
      updatedAt: state.updatedAt,
    }
  }

  function sendJson(response, status, body) {
    const text = JSON.stringify(body)
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(text),
    })
    response.end(text)
  }

  function readBody(request) {
    return new Promise((resolve, reject) => {
      let size = 0
      const chunks = []
      request.on('data', (chunk) => {
        size += chunk.length
        if (size > 64 * 1024) {
          reject(new Error('body too large'))
          request.destroy()
          return
        }
        chunks.push(chunk)
      })
      request.on('end', () => {
        try {
          resolve(chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch (error) {
          reject(error)
        }
      })
      request.on('error', reject)
    })
  }

  ctx.inject(['webServer'], (host) => {
    host.effect(() => {
      const disposers = [
        host.webServer.register({
          kind: 'exact',
          path: '/taskflow/state',
          handler: (request, response) => {
            stateHits += 1
            lastStateAt = Date.now()
            const url = new URL(request.url ?? '/', 'http://localhost')
            const sessionId = url.searchParams.get('session') ?? ''
            if (sessionId.length === 0) {
              sendJson(response, 400, { ok: false, error: 'missing session' })
              return
            }
            const state = stateOf(sessionId)
            // Always re-derive from the live log: a missed turn/end (plugin
            // reload mid-turn) must not leave a finished task looking active.
            const liveSession = typeof ctx.get === 'function' ? ctx.get('sessions')?.get?.(sessionId) : undefined
            if (liveSession) {
              const derived = deriveOpenTurn(liveSession)
              if (derived !== undefined) state.openTurn = derived
              // A turn that finished normally but left items open: close them now
              // (covers lists written by an older build of this plugin).
              if (derived === null && lastReason === 'completed' && closeLeftovers(state, Date.now())) scheduleSave(state)
              if (reclaimStaleItems(state, lastCompletedEndAt)) scheduleSave(state)
              if (reclaimStaleItems(state, lastCompletedEndAt)) scheduleSave(state)
            }
            sendJson(response, 200, payload(state))
          },
        }),
        host.webServer.register({
          kind: 'exact',
          path: '/taskflow/summarize',
          handler: async (request, response) => {
            if (request.method !== 'POST') {
              sendJson(response, 405, { ok: false, error: 'method not allowed' })
              return
            }
            summaryRequests += 1
            let body = {}
            try {
              body = await readBody(request)
            } catch (error) {
              sendJson(response, 400, { ok: false, error: String(error?.message ?? error) })
              return
            }
            const sessionId = typeof body?.session === 'string' ? body.session : ''
            const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
            const session = sessionId.length > 0 ? sessions?.get?.(sessionId) : undefined
            if (!session) {
              sendJson(response, 404, { ok: false, error: 'session is not live' })
              return
            }
            try {
              const state = stateOf(sessionId)
              const force = body?.force === true
              const run = summarizeLatestTurn(session, state, body?.turn, force)
              if (!run) {
                sendJson(response, 200, { ok: true, queued: false, reason: 'nothing to summarize (already summarized or no completed turn)' })
                return
              }
              const outcome = await run
              sendJson(response, 200, { ok: true, queued: true, ...outcome })
            } catch (error) {
              sendJson(response, 500, { ok: false, error: String(error?.message ?? error) })
            }
          },
        }),
        host.webServer.register({
          kind: 'exact',
          path: '/taskflow/health',
          handler: (_request, response) => {
            sendJson(response, 200, {
              ok: true,
              version: VERSION,
              sessions: states.size,
              queue: queue.length,
              client: clientHello,
              stateHits,
              lastStateAgoMs: lastStateAt === 0 ? null : Date.now() - lastStateAt,
              summaryRequests,
              renders,
              streams: streams.size,
              streamSessions: [...streams.keys()].map((id) => id.slice(-8)),
              policy: policyRegistered,
              seen: [...seenSessions.entries()].slice(-6).map(([id, info]) => ({ id: id.slice(-8), ...info })),
              parallelPolicy: parallelPolicyRegistered,
            })
          },
        }),
        // Full segment list, fetched only when the sidebar is open.
        host.webServer.register({
          kind: 'exact',
          path: '/taskflow/segments',
          handler: (request, response) => {
            const url = new URL(request.url ?? '/', 'http://localhost')
            const sessionId = url.searchParams.get('session') ?? ''
            if (!sessionId) {
              sendJson(response, 400, { ok: false, error: 'missing session' })
              return
            }
            const state = stateOf(sessionId)
            sendJson(response, 200, { ok: true, sessionId, segments: state.segments })
          },
        }),
        // One task's detail (steps, files, summary), fetched when a row is clicked.
        host.webServer.register({
          kind: 'exact',
          path: '/taskflow/task',
          handler: (request, response) => {
            const url = new URL(request.url ?? '/', 'http://localhost')
            const sessionId = url.searchParams.get('session') ?? ''
            const content = url.searchParams.get('content') ?? ''
            const item = stateOf(sessionId).tasks.items[content]
            if (!item) {
              sendJson(response, 404, { ok: false, error: 'task not found' })
              return
            }
            sendJson(response, 200, { ok: true, item })
          },
        }),
        // Live push: one long-lived connection per open session. Falls back to
        // polling on the client whenever this stream cannot be established.
        host.webServer.register({
          kind: 'exact',
          path: '/taskflow/events',
          handler: (request, response) => {
            const url = new URL(request.url ?? '/', 'http://localhost')
            const sessionId = url.searchParams.get('session') ?? ''
            if (sessionId.length === 0) {
              sendJson(response, 400, { ok: false, error: 'missing session' })
              return
            }
            response.writeHead(200, {
              'content-type': 'text/event-stream; charset=utf-8',
              'cache-control': 'no-cache, no-transform',
              connection: 'keep-alive',
              'x-accel-buffering': 'no',
            })
            response.write(': connected\n\n')
            const state = stateOf(sessionId)
            const live = typeof ctx.get === 'function' ? ctx.get('sessions')?.get?.(sessionId) : undefined
            if (live) {
              const derived = deriveOpenTurn(live)
              if (derived !== undefined) state.openTurn = derived
              if (derived === null && lastReason === 'completed' && closeLeftovers(state, Date.now())) scheduleSave(state)
              if (reclaimStaleItems(state, lastCompletedEndAt)) scheduleSave(state)
              if (reclaimStaleItems(state, lastCompletedEndAt)) scheduleSave(state)
            }
            pushFrame(response, state)
            let set = streams.get(sessionId)
            if (!set) {
              set = new Set()
              streams.set(sessionId, set)
            }
            if (set.size >= 4) {
              response.write('event: error\ndata: {"reason":"too many listeners"}\n\n')
              response.end()
              return
            }
            set.add(response)
            const heartbeat = setInterval(() => {
              try {
                response.write(': ping\n\n')
              } catch {
                // closed socket; the close handler cleans up
              }
            }, 20000)
            const cleanup = () => {
              clearInterval(heartbeat)
              set.delete(response)
              if (set.size === 0) streams.delete(sessionId)
            }
            request.on('close', cleanup)
            response.on('close', cleanup)
          },
        }),
        // Handshake from the browser half: proves the bundle executed in the
        // client and tells us which build is live.
        host.webServer.register({
          kind: 'exact',
          path: '/taskflow/client-ready',
          handler: async (request, response) => {
            if (request.method !== 'POST') {
              sendJson(response, 405, { ok: false, error: 'method not allowed' })
              return
            }
            let body = {}
            try {
              body = await readBody(request)
            } catch {
              body = {}
            }
            const build = typeof body?.build === 'string' ? body.build : 'unknown'
            // A new browser build invalidates every geometry report from the old one.
            if (!clientHello || clientHello.build !== build) {
              for (const key of Object.keys(renders)) delete renders[key]
            }
            clientHello = {
              at: Date.now(),
              build,
              href: typeof body?.href === 'string' ? clip(body.href, 200) : '',
              ua: typeof body?.ua === 'string' ? clip(body.ua, 200) : '',
            }
            log(ctx, 'info', `[taskflow] client half connected (build=${clientHello.build})`)
            sendJson(response, 200, { ok: true, version: VERSION })
          },
        }),
        // Geometry handshake: the browser half measures what it actually
        // painted, so "is the UI there?" has an answer without a screenshot.
        host.webServer.register({
          kind: 'exact',
          path: '/taskflow/client-report',
          handler: async (request, response) => {
            if (request.method !== 'POST') {
              sendJson(response, 405, { ok: false, error: 'method not allowed' })
              return
            }
            let body = {}
            try {
              body = await readBody(request)
            } catch {
              body = {}
            }
            const part = typeof body?.part === 'string' ? clip(body.part, 40) : 'unknown'
            renders[part] = {
              at: Date.now(),
              build: typeof body?.build === 'string' ? body.build : 'unknown',
              mounted: body?.mounted === true,
              visible: body?.visible === true,
              width: typeof body?.width === 'number' ? Math.round(body.width) : 0,
              height: typeof body?.height === 'number' ? Math.round(body.height) : 0,
              detail: typeof body?.detail === 'string' ? clip(body.detail, 2000) : '',
            }
            sendJson(response, 200, { ok: true })
          },
        }),
        // End-to-end prompt check: does the assembled system prompt really carry
        // our policy? Reads the session log instead of guessing.
        host.webServer.register({
          kind: 'exact',
          path: '/taskflow/prompt-check',
          handler: (request, response) => {
            const url = new URL(request.url ?? '/', 'http://localhost')
            const sessionId = url.searchParams.get('session') ?? ''
            const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
            const session = sessionId.length > 0 ? sessions?.get?.(sessionId) : undefined
            if (!session) {
              sendJson(response, 404, { ok: false, error: 'session is not live' })
              return
            }
            let last = ''
            let count = 0
            try {
              for (const event of session.snapshotEvents()) {
                if (event.type !== 'system/message') continue
                const text = textOf(event.data?.message) || textOf(event.data)
                if (text.length > 0) {
                  last = text
                  count += 1
                }
              }
            } catch (error) {
              sendJson(response, 500, { ok: false, error: String(error?.message ?? error) })
              return
            }
            const marker = '任务清单规范'
            const parallel = '复杂任务：并行拆解'
            const at = last.indexOf(marker)
            sendJson(response, 200, {
              ok: true,
              systemMessages: count,
              promptChars: last.length,
              hasTaskPolicy: at >= 0,
              hasParallelPolicy: last.includes(parallel),
              excerpt: at >= 0 ? clip(last.slice(at, at + 120), 200) : clip(last.slice(-200), 200),
            })
          },
        }),
        // Deployment self-check: did the browser half get discovered, and which
        // revisioned bundle URL is the shell expected to load?
        host.webServer.register({
          kind: 'exact',
          path: '/taskflow/diagnostics',
          handler: async (_request, response) => {
            const registry = typeof ctx.get === 'function' ? ctx.get('clientModules') : undefined
            let clientPath = null
            let entry = null
            try {
              clientPath = registry?.clientPath?.('dsh-plugin-taskflow') ?? null
            } catch {
              clientPath = null
            }
            try {
              const graph = registry?.graph?.()
              entry = graph?.entries?.find((row) => row.id === 'dsh-plugin-taskflow') ?? null
            } catch {
              entry = null
            }
            const url = new URL(_request.url ?? '/', 'http://localhost')
            if (url.searchParams.get('llm') !== '1') {
              sendJson(response, 200, { ok: true, version: VERSION, clientPath, entry })
              return
            }
            // Opt-in live check: one tiny call proves the profile can summarize.
            const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
            const live = sessions?.list?.() ?? []
            const probe = live.find((candidate) => !isSubagentSession(candidate)) ?? live[0]
            const route = probe ? resolveRoute(probe) : null
            if (!llm || !route) {
              sendJson(response, 200, { ok: false, version: VERSION, reason: !llm ? 'llm service is not available' : 'no provider/model route', clientPath, entry })
              return
            }
            const started = Date.now()
            try {
              const result = await streamCompletion(route, '你只回复四个字：链路正常', '请回复链路正常四字', probe?.id)
              sendJson(response, 200, { ok: true, version: VERSION, route, text: result.text, ms: Date.now() - started, clientPath, entry })
            } catch (error) {
              sendJson(response, 200, { ok: false, version: VERSION, route, error: String(error?.message ?? error), ms: Date.now() - started, clientPath, entry })
            }
          },
        }),
      ]
      return () => {
        for (const dispose of disposers) {
          try {
            dispose()
          } catch {
            // ignore
          }
        }
      }
    }, 'taskflow: http routes')
  })

  /** Manual trigger: summarize the newest turn that has no segment yet. */
  function summarizeLatestTurn(session, state, requestedTurn, force = false) {
    const all = session.snapshotEvents?.() ?? []
    let startIndex = -1
    let endIndex = -1
    for (let index = all.length - 1; index >= 0; index -= 1) {
      const event = all[index]
      if (event.type === 'turn/end' && (requestedTurn === undefined || requestedTurn === null || event.data?.turn === requestedTurn)) {
        endIndex = index
        for (let start = index - 1; start >= 0; start -= 1) {
          if (all[start].type === 'turn/start' && all[start].data?.turn === event.data?.turn) {
            startIndex = start
            break
          }
        }
        break
      }
    }
    if (endIndex < 0 || startIndex < 0) return null
    const turn = all[endIndex].data?.turn
    if (state.segments.some((item) => item.turn === turn)) {
      if (!force) return null
      state.segments = state.segments.filter((item) => item.turn !== turn)
    }
    const events = all.slice(startIndex, endIndex + 1)
    const digest = buildDigest(events, session.meta?.cwd)
    if (digest.digest.length === 0) return null
    return summarizeTurn(session, state, {
      turn,
      startedAt: all[startIndex].time,
      endedAt: all[endIndex].time,
      digest: clip(digest.digest, Math.max(1000, config.maxDigestChars)),
      toolCalls: digest.toolCalls,
      files: digest.files,
      commands: digest.commands,
      digestParts: {
        userText: firstUserText(events),
        toolCalls: digest.toolCalls,
        toolNames: toolNamesOf(events),
        files: digest.files,
        commands: digest.commands,
        assistantTail: lastAssistantText(events),
      },
    })
  }

  // Complex work decomposes into parallel tracks; absorbed from the SDK
  // workflows/parallel-agents SOP, compressed to what the model can act on.
  if (config.parallelPolicy) {
    ctx.inject(['systemPrompt'], (host) => {
      host.effect(() => host.systemPrompt.section({
        name: 'taskflow:parallel-policy',
        order: 9010,
        text: [
          '## 复杂任务：并行拆解',
          '- 触发：出现 2 个以上可独立回答的未知，或 2 个以上可隔离的产物/模块。单文件单步不硬拆。',
          '- 粒度：按「可独立消费的产物」切，每条写清产物、消费者与停止条件；不按文件数量机械切分。',
          '- 执行：独立项用 subagent 或 workflow 并发派出（数量按宿主槽位减一），主代理同时推进不依赖它们的关键路径；有依赖的串行交同一 agent 续作。',
          '- 清单：并行项同时标 in_progress 并在文本前加「∥」；被依赖项保持 pending，依赖解除后再置 in_progress。',
          '- 诚实：以真实工具调用作为派发证据；派发失败要保留该条并记录原因，继续推进可串行的工作。',
        ].join('\n'),
      }), 'taskflow: parallel policy')
      parallelPolicyRegistered = true
      log(ctx, 'info', '[taskflow] parallel policy registered')
    })
  }

  // Always decompose, in Chinese, short items — enforced where the model reads it.
  if (config.taskListPolicy) {
    ctx.inject(['systemPrompt'], (host) => {
      host.effect(() => host.systemPrompt.section({
        name: 'taskflow:task-list-policy',
        order: 9000,
        text: [
          '## 任务清单规范',
          '- 每次收到用户请求，第一个动作必须是 todo_write：先拆成可执行条目再动手，哪怕只有一条，也要写。',
          '- 禁止先干活再补清单：不允许把已经做完的事批量写成 completed 列表（那等于事后编造计划）。',
          '- 回合结束前必须收尾：做完的项置 completed；确实没做完的改成 pending 并在回复里说明原因，不许把 in_progress 留着结束回合。',
          '- 每条用中文书写，动词开头，最多 35 个词（中文约 60 字）；一条只做一件事，但要把对象和判据写全。',
          '- 写清对象（文件、命令、结论），不要用「处理一下」「继续优化」这类空话。',
          '- 同一时间只保留一个 in_progress；做完一项立刻勾掉，不要攒到最后批量改。',
        ].join('\n'),
      }), 'taskflow: task list policy')

      // Runtime context is appended after the sections on every request, so the
      // reminder stays adjacent to the user turn instead of scrolling away.
      host.effect(() => host.systemPrompt.context({
        name: 'taskflow:plan-first',
        order: 20000,
        text: '执行前先建任务清单：本轮若还没调用过 todo_write，先调用它列出要做的事（哪怕只有一条），再开始动手。',
      }), 'taskflow: plan-first reminder')
      policyRegistered = true
      log(ctx, 'info', '[taskflow] task-list policy registered')
    })
  }

  ctx.inject(['commands'], (host) => {
    host.effect(() => host.commands.register({
      name: 'taskflow',
      description: '把刚结束的一段工作整理成小结（TaskFlow）',
      input: { hint: '[now]', attachments: false },
      handler: (invocation) => {
        const session = invocation?.agent?.session
        if (!session) return { kind: 'error', text: 'taskflow: 没有可用的会话' }
        const queued = summarizeLatestTurn(session, stateOf(session.id))
        return queued
          ? { kind: 'success', text: 'taskflow: 已开始整理本段小结，稍后出现在对话与侧栏。' }
          : { kind: 'success', text: 'taskflow: 最近一段已有小结，或内容太少无需总结。' }
      },
    }), 'taskflow: /taskflow command')
  })

  ctx.effect(() => {
    log(ctx, 'info', `[taskflow] v${VERSION} ready (enabled=${config.enabled})`)
    return () => {
      for (const timer of saveTimers.values()) clearTimeout(timer)
      saveTimers.clear()
    }
  }, 'taskflow: lifecycle')
}

/**
 * Where the turn actually began. The in-memory marker is authoritative; when the
 * plugin mounted mid-turn (or after a reload) fall back to the log, scanning for
 * the matching `turn/start` instead of guessing a fixed event window — a long
 * turn would otherwise lose its user request and produce a useless summary.
 * @returns {{seq: number|undefined, time: number|undefined}} opening coordinates
 */
function locateTurnStart(session, state, turn, open) {
  if (open) return { seq: open.seq, time: open.time }
  const known = turn === null ? undefined : state.turns[turn]?.startSeq
  if (typeof known === 'number') return { seq: known, time: undefined }
  if (turn === null || typeof session.snapshotEvents !== 'function') return { seq: undefined, time: undefined }
  try {
    const all = session.snapshotEvents()
    for (let index = all.length - 1; index >= 0; index -= 1) {
      const event = all[index]
      if (event.type === 'turn/start' && event.data?.turn === turn) return { seq: event.seq, time: event.time }
    }
  } catch {
    // fall through to the bounded window
  }
  return { seq: undefined, time: undefined }
}

/** Keep the per-turn index bounded; it only serves manual summaries. */
function pruneTurns(state) {
  const turns = Object.keys(state.turns)
  if (turns.length <= 200) return
  turns.sort((a, b) => Number(a) - Number(b))
  for (const turn of turns.slice(0, turns.length - 200)) delete state.turns[turn]
}

/** Remember that a turn deliberately has no summary, so the UI stops waiting. */
function markSkipped(state, turn) {
  if (!state.skipped.includes(turn)) state.skipped.push(turn)
  if (state.skipped.length > 200) state.skipped.splice(0, state.skipped.length - 200)
}

/** First human request in a turn's events, for the mechanical fallback title. */
function firstUserText(events) {
  for (const event of events) {
    if (event.type !== 'user/message') continue
    const text = textOf(event.data).trim()
    if (text.length > 0) return clip(text.replace(/\s+/g, ' '), 60)
  }
  return ''
}

/** Distinct tool names used in a turn. */
function toolNamesOf(events) {
  const names = []
  for (const event of events) {
    if (event.type !== 'tool/call') continue
    const toolName = String(event.data?.name ?? 'tool')
    if (!names.includes(toolName)) names.push(toolName)
  }
  return names
}

/** Last assistant prose in a turn. */
function lastAssistantText(events) {
  let text = ''
  for (const event of events) {
    if (event.type !== 'assistant/message') continue
    const value = textOf(event.data?.message).trim()
    if (value.length > 0) text = value
  }
  return text
}
