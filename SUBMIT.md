### 仓库地址
https://github.com/wk-xjd/dsh-plugin-taskflow

### 一句话价值
在输入框上方常驻一条液态玻璃任务清单（进行中的行带流动彩虹描边），每个任务完成时由当前模型写一句自己的小结，每个回合结束自动压成「一行标题 + 要点」，让长会话的进度和小结一眼可见。

### 能力分类
界面与体验

### 安装命令
dsh plugin --profile web add github:wk-xjd/dsh-plugin-taskflow

（同名 NPM 包 `dsh-plugin-taskflow` 尚未发布；发布后可直接 `dsh plugin --profile web add dsh-plugin-taskflow`，并会出现在 DSH 插件中心。）

### 兼容与运行要求
- DSH：0.1.5-rc.1（客户端包 0.1.5-rc.2）实测；桌面客户端 0.2.2-rc.1 实测
- 平台：Web profile 与 Electron 桌面客户端均验证；纯 CLI/headless 只有宿主半部、无 UI
- 运行时：Node ≥ 22；宿主半部零 npm 依赖，客户端只依赖内置的 react / react-dom

### 许可证
MIT

### 截图 / 演示
（待补充：任务清单、任务详情浮窗、分段小结侧栏三张截图）

### 补充说明
- 数据落在 `$DSH_HOME/taskflow/<session>.json`，仅保存任务、耗时与小结文本，删除不影响会话正确性；
- 只注册宿主本机 HTTP 路由（`/taskflow/state`、`/taskflow/summarize`、`/taskflow/health` 等），不对外联网；
- 模型调用复用宿主已配置的 provider 路由：每回合 1 次分段摘要、每个完成的任务 1 次任务小结，均可用配置关闭；
- 会向系统提示注册两段约束（任务清单规范、复杂任务并行拆解）与一条运行时提醒，可配置关闭；
- 已知限制：不做「回合末尾行内卡片」（当前 DSH 的 `conversation.chat.turnTail` 是 list 槽）；历史会话不自动回填小结。

### 提交前自查
- [x] 仓库已公开
- [x] 已添加 GitHub topic：dsh-plugin
- [x] README 包含安装命令
- [x] 插件导出 apply(ctx) 模块
- [x] 仓库根目录包含 package.json
