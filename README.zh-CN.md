[English](README.md) | [繁體中文](README.zh-TW.md) | 简体中文

# dsh-roles-zeta

`dsh-roles-zeta` 为 dsh agent 提供一个 `delegate` 工具和一个角色文件文件夹。调用时指定角色，角色文件提供该 child 的 persona、模型路线、reasoning effort 与工具范围。它架在内置 `subagent` 工具所用的同一个 `ctx.subagents` 服务上，所以 provider、委派深度、续谈与后台结算全部照旧。内置的 `subagent` 与 `subagent_fork` 继续挂着：它们让模型每次调用自己挑路线，而角色是写文件时就固定的。

工具旁边有三个界面，各自只在对应的 host 服务存在时挂载：Web 输入框里每个角色一条斜杠指令、Web 设置里的“角色代理”页，以及角色目录的监控，改动不必重新组合 profile 就会进到下一次调用。

## 安装

```sh
dsh plugin --profile web add dsh-roles-zeta
# 重启 host
```

profile 是各自独立的安装根，要用的每个 profile 都装一次。`github:zeta987/dsh-roles-zeta` 与 `file:<path>` 也可以。第一次加载时八个角色文件会写进 `$DSH_HOME/agents`（`$DSH_HOME` 默认 `~/.dsh`），新 session 就有一个 `delegate` 工具，描述里列出它们。

```
~/.dsh/agents
├── code-mapper-lite.md   explorer.md            log-distiller.md   triage.md
├── deep-coordinator.md   hypothesis-debate.md   reviewer.md        worker.md
└── .seeded.json
```

### 更新

不会自动更新：`dsh plugin` 是在 profile 目录里转发给 pnpm，启动 host 不会安装任何东西，也没有任何页面会查 registry。要换到某个版本：

```sh
dsh plugin --profile web add dsh-roles-zeta@0.4.0
# 重启 host
```

版本要明确写出。`update` 只在安装时 pnpm 写下的 `^0.x` 范围内移动；pnpm 11 起会把发布未满 24 小时的版本从 `outdated` 与 `@latest` 里藏起来（`minimumReleaseAge`），明确指定版本则立刻能装。你改过的角色文件不会被动；没碰过的内置角色会在下次加载时刷新。

## 斜杠指令

每个加载的角色都是 Web 输入框里的一条指令。输入 `/` 就会看到它们和 `/plan`、`/goal` 并列；`/reviewer look at lib/index.js` 会排进一轮对话，要求 agent 以 `reviewer` 角色调用 `delegate`、把这段文字当任务、在前台跑完并转述结果。所以委派会留在对话记录里，就是一次普通的工具调用，跟 `/plan <message>` 放消息的位置相同。

指令跟着角色列表走：新增、改名或移除角色都会重新注册，菜单自己更新。角色 id 撞到其他 plugin 的指令名时，该角色不注册成指令（log 会说明），但仍可通过工具使用。`commands: false` 就完全不挂；`commandPrefix: "r-"` 得到 `/r-reviewer`。

![Web 输入框输入 `/`：角色与内置指令并列](https://raw.githubusercontent.com/zeta987/dsh-roles-zeta/main/docs/images/commands-zh.png)

## 设置页

设置 → **角色代理** 列出角色列表，每个角色有标签（内置、自定义、已修改），一次编辑一个角色：id、`when` 说明、路线（session 允许的路线会列成建议）、推理强度、工具（当前已注册工具的勾选清单，或“沿用全部”加上委派开关）以及角色指示。保存会把 `<id>.md` 写进 `$DSH_HOME/agents`，跟你手写的是同一个文件。

| 按钮 | 对磁盘做的事 |
|---|---|
| 删除（自定义角色） | 移除文件 |
| 删除（内置角色） | 留下 `disabled: true` 停用文件，包内的副本不再加载；恢复前列在“已停用的内置角色” |
| 恢复此角色 | 把包内的文件复制回来覆盖你的版本 |
| 恢复内置角色 | 八个一起做；你自己新增的角色一律不动 |

这页是 `/__dsh/roles-zeta/` 底下几条 JSON 路由之上的浏览器模块，跟其他 Web API 一样受浏览器 session cookie 与 Host／Origin 信任检查把关。`settingsPage: false` 就两者都不挂。

![设置 → 角色代理：上方是角色列表，下方打开 reviewer 的编辑器](https://raw.githubusercontent.com/zeta987/dsh-roles-zeta/main/docs/images/settings-zh.png)

## 角色文件

一个角色一个 Markdown 文件：frontmatter 放机器字段，正文是 child 的 persona prefix。

```markdown
---
id: reviewer
when: Deep read-only reviewer for correctness, regressions, edge cases, and missing tests.
route: deepseek-official/deepseek-flash
effort: high
allow: [read, glob, grep, web_search, web_fetch, skill]
---

Review like an owner.
Prioritize correctness, regressions, edge cases, and concurrency hazards.
```

| 字段 | 必填 | 语义 |
|---|---|---|
| `id` | 是 | 角色 id；下划线写法解析到同一个角色 |
| `when` | 是 | 一行；模型的菜单项，也是指令说明 |
| `route` | 否 | 模型 id（`deepseek-flash`）或完整的 `provider/model` |
| `effort` | 否 | `off`／`minimal`／`low`／`medium`／`high`／`xhigh`／`max`，按路线夹到可用层级 |
| `allow` | 否 | child 保留的工具名；省略则继承全部 |
| `delegation` | 否 | `true` 让没有 `allow` 的 child 保留委派工具 |
| `disabled` | 否 | `true` 移除一个内置角色 |

有 `allow` 的角色只有清单里列了委派工具才能委派；没有 `allow` 的只有 `delegation: true` 才能。

### 角色从哪里加载

两层来源，后者覆盖前者：包自己的 `roles/*.md`，然后是 `$DSH_HOME/agents`。包第一次加载时把角色列表植入你的目录，你不碰它就一直由包管理：

| 你做了什么 | 下次加载 |
|---|---|
| 什么都不做 | 内置文件跟着包；新版本改了角色就更新 |
| 改了一个 | 它变成你的，不再被覆盖 |
| 删了一个 | 不会再植入，但包内的副本照样加载；要真正拿掉角色，用 `disabled` stub 或设置页 |
| 自己加一个 | 与内置角色一起加载 |

`.seeded.json` 记着包写了什么。你放进去的文件会按 id 取代内置角色；只有 `id` 与 `disabled: true` 的 stub 会移除它。目录是被监控的，任何变动在安静一小段时间后重新读取。`seedRolesDir: false` 让包不写入你的目录；`watchRolesDir: false` 改成每次组合只读一次。

## 配置

```yaml
- insert:
    - id: roles-zeta
      name: dsh-roles-zeta
      config:
        provider: spawn
        toolName: delegate
        backgroundMode: continuable
        maxDepth: 2
```

这里没有任何模型也没有任何路径：角色文件自己指名路线，插件负责解析。这条 row 在 host plane，所以每个 preset 的每个 agent 都能看到这个工具。

| 字段 | 默认 | 语义 |
|---|---|---|
| `dshHome` | `$DSH_HOME`，否则 `~/.dsh` | 角色目录所依据的 harness home |
| `rolesDir` | `$DSH_HOME/agents` | 你的角色目录：植入目标，也是覆盖根 |
| `seedRolesDir` | `true` | 把内置角色列表写进 `rolesDir`，未改动的跟着包更新 |
| `watchRolesDir` | `true` | `rolesDir` 有文件变动时重新加载角色列表 |
| `commands` | `true` | 每个角色一条 `/<id>` 斜杠指令 |
| `commandPrefix` | （空） | 放在每个指令名前面的文字 |
| `settingsPage` | `true` | 挂载设置 API 与设置页 |
| `provider` | `spawn` | `ctx.subagents` 的 provider 名 |
| `toolName` | `delegate` | 面向模型的工具名 |
| `backgroundMode` | `continuable` | `continuable` 返回 durable child id；`one-shot` 返回 job id |
| `enableRunInBackground` | `true` | 是否暴露 `run_in_background` |
| `maxDepth` | `2` | 被启动 child 的委派深度上限 |
| `defaultRoute` | （空） | 角色没写 `route:` 时使用 |
| `routes` | `{}` | 别名表：`deep: { provider: deepseek-official, model: deepseek-flash }` 后角色可写 `route: deep` |

## 路线怎么解析

`route:` 依序查：row 的 `routes` 别名表；这个 session 的 `subagent-model-selection` 允许清单（你在 dsh 设置里勾的模型）；已注册 provider 的模型目录；角色文件行内的 `model: { provider, model }`。目录那一步让没有设置界面的 headless profile 也能解析。允许清单开着时它也为角色的路线把关：已注册但不在清单里的模型会得到明确错误，不会偷偷跑。

哪里都没指名路线时，child 沿用调用者的 provider 与 model，结果会注明；插件从不自己从允许清单挑。同一个模型 id 注册在两个 provider 底下时必须写成 `provider/model`。

effort 会夹到该路线声明的层级上，同距离取较高：`deepseek-flash` 提供 `off`／`low`／`high`／`max`，所以 `medium` 变成 `high`、`xhigh` 变成 `max`。内置角色一律写 `high`。发生替换时会在委派结果里注明。

## 模型看到什么

每个 session 一份工具 schema：描述里每个角色一行，加上允许的路线；参数是 `role`、`description`、`prompt`、可选的 `route` 别名、session 开启模型选择时的 `provider`／`model`，以及 `run_in_background`。一次调用会解析角色、预检路线、按实时 registry 收窄工具过滤器，然后启动一个以角色正文为 persona prefix 的 child。前台调用返回 child 的最终文本；continuable 后台调用返回 `started subagent <id>`，再由 runtime 的通知结算。

## 已知限制

- **preset 的委派工具不受角色 `allow` 清单限制。** 若某个 preset 的 `subagent` row 设了 `modelSelectionSettings: true`，那个 row 会改成 per-agent 安装，而 `tools.restrict()` 从不过滤一个 scope 自己那一层：允许 6 个工具的角色在 web profile 拿到 8 个（`subagent` 与 `list_subagent_models` 渗进来），在 headless 刚好 6 个。web profile 里只读角色仍可自己启动 child；persona 说不要，过滤器管不到。
- **角色改变不了工作区指示链。** 每个 child 与父加载同一条 `AGENTS.md`／`CLAUDE.md` 链。
- **registry 探测仅供参考。** `tools.restrict()` 拒绝时会收窄过滤器并重试最多三次，一个过期名称的代价是一次失败的启动。
- **斜杠指令是请求，不是保证。** 委派由模型执行，对话记录会显示它有没有做。
- **设置页改的是文件，不是 session。** 已启动的 child 不受之后的修改影响；下一次启动才读新文件。
- **没有 per-role 记忆。**
