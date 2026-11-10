# dsh-plugin-taskflow · DSH 任务流

> 给 DeepSeek Harness 的**任务清单 + 分段小结**插件：输入框上方一条液态玻璃清单，进行中的行带流动彩虹描边；每项任务完成时由模型写一句自己的小结；每个回合结束自动压成「一行标题 + 要点」。
>
> A task list and per-turn digest plugin for DeepSeek Harness: a liquid-glass task panel above the composer, a one-line model-written summary per task, and a condensed digest for every finished turn.

[![npm version](https://img.shields.io/npm/v/dsh-plugin-taskflow.svg)](https://www.npmjs.com/package/dsh-plugin-taskflow)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)

## 安装

```bash
# 从 npm 安装
dsh plugin --profile web add dsh-plugin-taskflow

# 或直接从 GitHub 源码安装
dsh plugin --profile web add github:wk-xjd/dsh-plugin-taskflow
```

`dsh plugin add` 会把本包装成一个 **profile bundle**（自动写入 `dsh.profile.bundles` 并加载
`cordis.patch.yml`），无需手工编辑 patch 文件。

安装后**刷新页面**（桌面客户端：开发者工具里执行 `location.reload()`，或重启 App）；
宿主半部更新需重启一次 App。

<details>
<summary>本地开发安装 / 源码目录方式</summary>

```bash
git clone https://github.com/wk-xjd/dsh-plugin-taskflow.git
cd dsh-plugin-taskflow
node install.mjs                 # 同步到 ~/.dsh/plugins 并写入 profile 行
node install.mjs --rotate        # 宿主代码热更（换路径，免重启）
node install.mjs --profile web   # 装到别的 profile
```

</details>

## 它做了什么

给 DeepSeek Harness（Web GUI）补两块能力：

0. **对话内的任务清单**：替换内置的一行式 todo 行，把 agent 的 `todo_write` 渲染成 Claude 风格的清单卡片（`7 个任务 · 完成 6 · 待办 1` + `✔/◐/□` 逐项），位置就在那次工具调用处。
1. **常驻任务列表**：替换 composer 上方自带的 todo 面板（遮蔽同一个 `todo` 槽位）。有任务时，清单**一直显示**在输入框上方，宽度与输入框对齐（在 composer 包裹层里找到"最深的宽元素"= 输入卡片，复制它的 `width` 与左边缘，并用 `ResizeObserver` 跟随侧栏/窗口变化），液态玻璃背景（`backdrop-filter: blur(34px) saturate(1.7)` + 顶部渐变高光 + 内外描边）；执行中的任务行带 Apple Intelligence 风格的彩虹描边与呼吸圆点；进度环是 SVG，按完成比例填充，最多 190px 高，超出滚动。
   - 每个任务完成时，宿主用当前模型给它写**一句自己的小结**（≤60 字，基于该任务期间的工具调用与文件）；
   - 点**有小结的某一项**：弹出详情浮窗 —— 先是小结正文，再是开始/完成/用时、期间动作、涉及文件；
   - **没有小结的项不可点击**，行尾显示「小结生成中…」或「无小结」；
   - 点**进度环**：打开右侧栏，看**全部**分段小结；
   - 折叠按钮：收成一行，默认展开；
   - 回合结束仍处 `in_progress` 的任务不再假装在跑：宿主打 `pausedAt`，界面变琥珀色 `⏸`、停掉彩虹灯带、计时冻结，标题显示「等待确认：<该任务>」；
   - 但如果这轮派出了**仍在运行的子 agent**（宿主从子会话 header 的 `origin=subagent`/`parentSession` 认出来），则该任务显示靛蓝色「子 agent 执行中：<该任务>」，计时继续走——不被误判成等待人工；
   - 没有任务时回退成单行胶囊，显示最新一段小结标题。
2. **分段小结**：每个 assistant 回合结束时，宿主用**当前会话的路由**发一次很短的独立请求，把这一回合压缩成「一行标题 + 1–3 条要点」，然后
   - 作为胶囊的一行标题展示，点开浮层看全部段落与要点；
   - 通过插件自己的 HTTP 路由提供给浏览器。

宿主同时记录每个 todo 的 `startedAt / completedAt`，所以任务条能显示「这一项已经跑了 42s」。

## 目录

- [安装](#安装)
- [使用](#使用)
- [配置](#配置)
- [实现](#实现)
- [自查与排错](#自查与排错)
- [已知限制](#已知限制)
- [测试](#测试)

## 安装细节

本包同时是一个 **DSH bundle**：`package.json` 里声明 `dsh.bundle.patch = ./cordis.patch.yml`，
`dsh plugin --profile <p> add dsh-plugin-taskflow` 会把它写进该 profile 的 `dsh.profile.bundles`：

```json
{"profile": {"bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-plugin-taskflow"]}}
```

bundle 里的 patch 只有一行 insert：

```yaml
- insert:
    - id: dsh-plugin-taskflow
      name: 'dsh-plugin-taskflow'
```

从源码手动安装（不想走 npm 时）也可以用 `install.mjs` 直接改 profile 的 `cordis.patch.yml`。

### 生效方式

| 改了什么 | 怎么生效 |
|---|---|
| 浏览器半部（`client/client.js`） | 刷新页面（桌面客户端可用开发者工具执行 `location.reload()`） |
| 宿主半部（`lib/index.js`） | 重启 App；本地开发可用 `node install.mjs --rotate` 换新路径立即生效 |
| patch 行本身 | `patchReload: live` 会监听；改同一行的 `name` 要先删后加，避免新旧实例抢同一张 HTTP 路由表 |

## 使用

| 位置 | 看到什么 |
|---|---|
| 对话里每次 `todo_write` | 清单卡片：`5 个任务 · 完成 2 · 待办 3`，逐项 `✔` / `◐` / `□` |
| composer 上方 | **常驻清单**：`◔ 4/6 当前任务` + 逐项 `✔/◐/□`（最多 190px，超出滚动） |
| 点有小结的项 | 详情浮窗：任务小结正文 + 开始/完成/用时 + 期间动作 + 涉及文件 |
| 无小结的项 | 不可点击，行尾提示「小结生成中…」或「无小结」 |
| 点进度环 | 右侧栏「任务流」：全部 N 段小结 + 「整理最近一段」 |
| 无任务时 | 单行胶囊：`▤ 最新小结标题`（≤20 字），点击同样开侧栏 |

斜杠命令 `/taskflow`：立即整理最近一个还没有小结的回合。

## 配置

写在 patch 行的 `config:` 上（全部可选）：

```yaml
- insert:
    - id: dsh-plugin-taskflow
      name: '.../lib/index.js'
      config:
        enabled: true
        minToolCalls: 1
        minAssistantChars: 240
        maxOutputTokens: 320
        provider: ''      # 留空 = 跟随会话最近一次请求的路由
        model: ''
        includeSubagents: false
```

| 字段 | 默认 | 含义 |
|---|---|---|
| `enabled` | `true` | `false` 时不调用模型，只出规则摘要 |
| `minToolCalls` | `1` | 工具调用数达到它才值得总结 |
| `minAssistantChars` | `240` | 或助手文本达到它 |
| `maxDigestChars` | `14000` | 递给模型的原文字符上限 |
| `maxOutputTokens` | `600` | 摘要输出上限；撞上限但有正文时照用并标 `truncated` |
| `timeoutMs` | `45000` | 单次调用看门狗 |
| `maxConcurrent` | `2` | 全局并发摘要数 |
| `provider` / `model` | 空 | 显式指定摘要路由；空则跟随会话 |
| `maxSegments` | `60` | 每会话保留的段数 |
| `includeSubagents` | `false` | 默认不给子 agent 会话生成小结（它们自带 turn 流，容易刷屏与烧钱） |
| `taskListPolicy` | `true` | 往系统提示注册「任务清单规范」段：无论任务大小先拆解、每条中文≤35 词、只留一个进行中、完成即勾 |
| `parallelPolicy` | `true` | 往系统提示注册「复杂任务：并行拆解」段（吸收 SDK `workflows/parallel-agents` SOP 的可执行部分） |

## 实现

```
lib/index.js       宿主半部：事件折叠、摘要、HTTP、斜杠命令（零 npm 依赖）
client/client.js   浏览器半部：预构建 classic script，注册三处 UI
install.mjs        同步到 ~/.dsh/plugins + 维护 patch 行 + 轮换热更
test/              两半各自的离线测试（假 cordis 上下文 + React shim）
```

**任务清单规范（模型侧约束）**

插件向 `ctx.systemPrompt` 注册一段 `taskflow:task-list-policy`（order 9000），所有对话、所有 agent 都读得到：

```
## 任务清单规范
- 无论任务大小（哪怕只改一行、只跑一条命令），都先用 todo_write 拆成可执行条目再动手；单步任务也给一条。
- 每条用中文书写，动词开头，最多 35 个词（中文约 60 字）；一条只做一件事，但要把对象和判据写全。
- 写清对象（文件、命令、结论），不要用「处理一下」「继续优化」这类空话。
- 同一时间只保留一个 in_progress；做完一项立刻勾掉，不要攒到最后批量改。
```

关掉它：配置 `taskListPolicy: false`。

**复杂任务：并行拆解**（`parallelPolicy`，order 9010）

```
- 触发：出现 2 个以上可独立回答的未知，或 2 个以上可隔离的产物/模块。单文件单步不硬拆。
- 粒度：按「可独立消费的产物」切，每条写清产物、消费者与停止条件；不按文件数量机械切分。
- 执行：独立项用 subagent / workflow 并发派出（数量按宿主槽位减一），主代理同时推进
  不依赖它们的关键路径；有依赖的串行交同一 agent 续作。
- 清单：并行项同时标 in_progress 并在文本前加「∥」；被依赖项保持 pending，解除后再置。
- 诚实：以真实工具调用作为派发证据；派发失败要保留该条并记录原因。
```

列表行按两行截断显示（`-webkit-line-clamp: 2`），35 词的条目也能读全；再长就以省略号收尾，完整文本在 tooltip 和详情浮窗里。

UI 配合：同时有 ≥2 项 `in_progress` 时，这些行的文本前会显示 `∥`，提示这是并行轨道。

**宿主**

- `ctx.on('session/event')` 跟踪 `turn/start`、`turn/end`、`todo/write`；子 agent 会话（`meta.origin === 'subagent'`）与**被中断/失败的回合**（`reason.kind` 为 `aborted`/`error`）默认跳过；
- 插件中途挂载也能找准回合起点：内存标记缺失时回扫日志里的 `turn/start`，不靠固定事件窗口；
- 回合结束时 `session.snapshotEvents(start, end + 1)` 取原文，折成「用户请求 / 工具调用 / 任务清单 / 助手收尾」；
- `ctx.llm.stream({ provider, model, system, messages, maxTokens, sessionId, signal })`，只累积 `text-delta`；`stop` 与 `max-tokens`（有正文时）都算成功，其余 finish 视为失败；
- 解析成 `{title, bullets}`，写入 `$DSH_HOME/taskflow/<session>.json`（400ms 防抖 + 原子 rename）；
- `ctx.inject(['webServer'])` 注册 `/taskflow/state`、`/taskflow/summarize`、`/taskflow/health`、`/taskflow/diagnostics`；
- 没有 `llm` 服务、没有可用路由或调用失败时，退回规则摘要（工具数、文件、命令），UI 标记「规则摘要」。

**浏览器**

- `conversation.input.dock`（list，`id: 'todo'`，`priority: -1`）→ 任务条；lower priority 遮蔽自带面板（同 id 同 priority 会抛错）；
- 胶囊只显示一行（≤20 字，超长省略）；浮层用 `react-dom` 的 `createPortal` 挂到 `document.body`，定位锚在胶囊右上方，随滚动/缩放重算，点外部或 Esc 关闭；
- 说明：`conversation.chat.turnTail` 在 0.1.5-rc.2 的运行时实际是 **list** 槽（`ctx.slots.spec()` 返回 `{"kind":"list"}`），链式 `select` 注册会被拒（`list slot "..." requires options.id`），所以没有"回合末尾行内卡片"这种形态；
- `tool.call.toolview` 以 `key: 'todo_write'`、`priority: -1` 遮蔽内置的一行式 todo 行，换成清单卡片（同 key 同 priority 会抛错，低 priority 才生效）；
- `conversation.input.dock` 承载常驻清单；宿主在每次 `tool/call` 时把它归到当前 `in_progress` 任务上（保留最近 12 条动作、10 个文件），详情浮窗才有"干了什么"可显示；
- 详情浮窗用 portal 挂在 `body`，锚在被点的行下方（空间不够翻到上方）；右侧栏只注册一个 `taskflow` 标签页，由进度环触发，不占导航入口；
- 2.5s 轮询 `/taskflow/state`（页面隐藏时暂停），`fetch` 失败即静默降级。

**数据结构**（`~/.dsh/taskflow/<session>.json`）：`segments[]`（turn、标题、要点、步数、文件、耗时、路由、usage）、
`tasks.items`（按任务文本记首次出现/开始/完成）、`tasks.history`、`lastTurn`、`skipped[]`。

## 自查与排错

```bash
curl -s http://127.0.0.1:<port>/taskflow/health          # 在线状态 + 客户端握手 + 各面渲染尺寸
curl -s http://127.0.0.1:<port>/taskflow/diagnostics     # 浏览器半部是否进图（clientPath / bundle URL）
curl -s "http://127.0.0.1:<port>/taskflow/diagnostics?llm=1"   # 真发一次极小请求，验证摘要链路
curl -s -X POST http://127.0.0.1:<port>/taskflow/open-panel    # 展开常驻清单（若被折叠）
curl -s -X POST http://127.0.0.1:<port>/taskflow/open-detail    # 打开第一项的任务详情浮窗
curl -s -X POST http://127.0.0.1:<port>/taskflow/open-sidebar   # 打开侧栏（全部小结）
curl -s -X POST -H 'content-type: application/json' \
     -d '{"session":"<id>","turn":3,"force":true}' \
     http://127.0.0.1:<port>/taskflow/summarize                # 强制重做某段并返回成败原因
```

`/taskflow/health` 里的关键字段：

| 字段 | 含义 |
|---|---|
| `client` | 浏览器半部的握手（`build`、`href`、`UA`）；为空说明页面还没加载插件 |
| `stateHits` / `lastStateAgoMs` | 客户端轮询次数与最近一次时间；不再增长说明界面没在跑 |
| `renders.<part>` | 各面实测几何（`visible`、`width`/`height`）：`taskcard`（对话内卡片）/`dock`（常驻清单）/`detail`（任务详情浮窗）/`sidebar`（全部小结）/`apply` |
| `lastSummary` | 最近一次摘要的路由、失败原因与是否规则摘要 |

`/taskflow/summarize` 的返回里 `failure` 会直接给出原因（例如 `... finished with max-tokens`、`no provider/model route`），排查不用翻日志。

- `?llm=1` 返回 `{"ok":true,"route":{...},"text":"…"}` 说明路由、消息形状与流式解析都通。
- 小结是「规则摘要」而不是模型输出，说明 `llm` 服务缺失、没有路由或调用失败——用 `?llm=1` 看具体错误。
- 浏览器里没有 UI：先确认 `diagnostics` 里 `entry` 非空，再刷新页面；仍无则看 console 的 `slot entry crashed in '<slot>'`。

## 兼容与权限

- **DSH 版本**：面向 `dsh 0.1.5-rc.1`（客户端包 `0.1.5-rc.2`）实测，桌面客户端 0.2.2-rc.1；更低版本未验证。
- **平台**：Web profile 与桌面客户端（Electron）都验证过；纯 CLI/headless profile 没有 UI，只会有宿主半部。
- **依赖**：宿主半部零 npm 依赖（只用 `node:fs` / `node:path` / `node:os` / `node:crypto`）；客户端半部只 `require('react')` 与 `require('react-dom')`（DSH 内置种子模块）。
- **数据落地**：`$DSH_HOME/taskflow/<session>.json`，只存任务、耗时与小结文本；删除它不损失会话正确性。
- **外部调用**：除"当前会话模型"外不访问任何网络服务；摘要调用走宿主已配置的 provider 路由（默认每次回合 1 次、每个完成的任务 1 次）。
- **HTTP 路由**：仅注册在宿主本机 web server（`/taskflow/state`、`/taskflow/summarize`、`/taskflow/health` 等），只读本机会话数据。
- **系统提示**：注册两段约束（`taskflow:task-list-policy`、`taskflow:parallel-policy`）与一条运行时提醒，可用配置关闭。

## 已知限制

- **没有行内（回合末尾）卡片**：`conversation.chat.turnTail` 在本版本运行时是 list 槽，链式注册被拒；小结出现在胶囊标题与浮层列表里。
- **手动整理需要会话仍活着**：`ctx.get('sessions').get(id)` 拿不到时只能看已有结果。
- **摘要是一次额外模型调用**：默认每回合最多一次，受 `minToolCalls` / `minAssistantChars` 节流；不想要就 `enabled: false`。
- **HTTP 取数依赖 web server**：非 web 表面下任务条仍可用，但耗时与小结不可用。
- **宿主半部改动必须重启**（或用 `--rotate`）：这是 Loader 的 ESM 缓存行为，不是插件缺陷。

## 测试

```bash
node test/host.test.mjs     # 事件 → 摘要 → HTTP 全链路（假 LLM、假 ctx）
node test/client.test.mjs   # 注册、selector、三个组件渲染（React shim）
```

两个测试都不需要 DSH 进程，也不联网。
