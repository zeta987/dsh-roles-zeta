[English](README.md) | [繁體中文](README.zh-TW.md) | 简体中文

# dsh-roles-zeta

## 摘要

`dsh-roles-zeta` 给 dsh agent 一支 `delegate` 工具和一个角色文件文件夹。调用时指定角色，角色文件提供该 child 的 persona、模型路线、reasoning effort 与工具范围。它是同一个 `ctx.subagents` 服务之上的薄层，所以 provider、深度计算、durable descriptor、续谈、子代理目录与后台结算通知全部照旧。

内置的 `subagent` 与 `subagent_fork` 没有被取代，应该继续挂着。它们回答的是另一个问题：让模型在每次调用时从 session 允许列表里挑路线；而角色是写文件时就固定的绑定。

工具旁边还有三个小界面，各自只在对应的 host 服务存在时挂载：Web 输入框里每个角色一条斜杠指令（`/reviewer <task>`）、Web 设置里的“角色代理”页，可新增、改名、编辑、删除与恢复角色，以及角色目录的监控，改动不必重新组合 profile 就会进到下一次调用。

## 使用

### 安装

```sh
# 装进你会用到的每个 profile。profile 是各自独立的安装根，装进一个对另一个不可见。
dsh plugin --profile web add dsh-roles-zeta

# 重启 host。bundle 列表是在组合 profile 时读取的。
```

这样就装完了。**重启后第一次加载时，八个角色文件会被写进 `$DSH_HOME/agents`**（`$DSH_HOME` 默认 `~/.dsh`），之后新开的 session 就有一支 `delegate` 工具，描述里列出它们。不用复制 preset、不用任何模型表、也不用自己放文件。

```sh
ls ~/.dsh/agents
# code-mapper-lite.md  explorer.md          log-distiller.md  triage.md
# deep-coordinator.md  hypothesis-debate.md reviewer.md       worker.md
# .seeded.json
```

这个 bundle 也带了浏览器端，所以就算 Web profile 开着 `patchReload: live` 也要重启一次；host 只提供组合 profile 时找到的 client bundle。

#### 更新

不会自动更新。`dsh plugin` 是在 profile 目录里转发给 pnpm，解析到的版本会记在 profile 的 lockfile；启动 host 不会安装任何东西。新版本只有在你主动要求时才会进到 profile：

```sh
dsh plugin --profile web add dsh-roles-zeta@latest
# 重启 host
```

版本要明确写出：安装时 pnpm 写下的 `^0.x` 范围不会跨过 minor 版本号，单靠 `pnpm update` 会停在旧的那条线上。你改过的角色文件更新时不会动；没碰过的内置角色会在下次加载时刷新。

### 斜杠指令

每个加载的角色同时也是 Web 输入框里的一条指令。输入 `/` 就会看到它们和内置的 `/plan`、`/goal`、`/compact` 并列，旁边是各自的 `when` 说明；`/reviewer look at lib/index.js` 会排进一轮对话，要求 agent 以 `reviewer` 角色调用 `delegate`、把这段文字当任务、在前台跑完并转述结果。指令本身不会直接启动 child：指令 handler 跑在任何模型回合之外，若子代理的结果根本没回到模型手上，就没有人能转述它；所以委派留在对话记录里，就是一次普通的工具调用，跟 `/plan <message>` 放消息的位置相同。

指令跟着角色列表走。不管是从设置页还是直接改目录，新增、改名或移除角色都会重新注册整组指令，菜单自己会更新。角色 id 若撞到其他 plugin 拥有的指令名，那个角色仍可通过工具使用，只是不注册成指令，日志会写一行说明。row 上设 `commands: false` 就完全不挂；设 `commandPrefix` 可以把所有角色放在同一个前缀后面（`commandPrefix: "r-"` 得到 `/r-reviewer`）。

### 设置页

设置 → **角色代理** 列出角色列表，每个角色有标签（内置、自定义、已修改），一次编辑一个角色：id、`when` 说明、模型路线（session 允许的路线会列成建议）、推理强度、工具范围（当前已注册工具的勾选列表，或“沿用全部”加上委派开关）以及角色指示。保存会把 `<id>.md` 写进 `$DSH_HOME/agents`，跟你手写的是同一个文件；工具、指令与页面立刻跟上。

除了编辑，这页还做角色库需要的另外两件事：

| 按钮 | 对磁盘做的事 |
|---|---|
| 删除（自定义角色） | 移除文件 |
| 删除（内置角色） | 把文件换成 `disabled: true` 的停用文件，包内的副本就不再加载；恢复前它会列在“已停用的内置角色” |
| 恢复此角色 | 把包内的文件复制回来覆盖你的版本，并在 manifest 里交还给包管理 |
| 恢复内置角色 | 八个一起做；你自己新增的角色一律不动 |

这页是一个纯浏览器模块，背后是 `/__dsh/roles-zeta/` 底下几条 JSON 路由，跟其他 Web API 一样受浏览器 session cookie 与 Host／Origin 信任检查把关，写入还要求同源。设 `settingsPage: false` 就两者都不挂。

### 角色文件

一个角色就是一个 Markdown 文件。frontmatter 放机器字段，正文是 child 的 `deployment:persona-prefix` section。

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
| `id` | 是 | 角色 id；任何 `_` 拼法都解析到同一个角色 |
| `when` | 是 | 一行，渲染进工具描述，作为模型看到的菜单 |
| `route` | 否 | 模型 id（`deepseek-flash`）或完整的 `provider/model`；见“路线是怎么解析的” |
| `effort` | 否 | 角色词汇的 effort，按 route 转译 |
| `allow` | 否 | child 保留的全局工具名；省略则全部继承 |
| `delegation` | 否 | 没有 `allow` 列表的角色要设 `true` 才保留委派工具 |
| `disabled` | 否 | `true` 移除随包发布的角色，不需要写替代正文 |

有 `allow` 列表的角色除非列表内含委派工具，否则不能再委派；没有列表的角色除非设 `delegation: true`，否则也不行。委派是 opt-in，因为来源定义里每个叶节点角色都明文如此。

#### 角色是从哪里加载的

两层，依序套用，后面的盖掉前面的：

1. **包内置角色列表**——`<包>/roles/*.md`，发布的八个；
2. **`$DSH_HOME/agents`**——你自己的目录，`$DSH_HOME` 默认 `~/.dsh`。

包会在第一次加载时把角色列表放进你的目录，所以文件就在 dsh 用户会去找的地方——跟 `~/.codex/agents`、`~/.claude/agents` 一样。**只要你没动它们，它们就由包管理**：

| 你做了什么 | 下次加载时 |
|---|---|
| 什么都没做 | 包写进去的文件跟着包走；新版改了角色就会更新 |
| 改过其中一个 | 那个文件变成你的，永远不会再被覆盖 |
| 删掉一个 | 不会再植入一次——但包内的副本照样加载，角色本身还在；要真的拿掉角色，用 `disabled` stub 或设置页 |
| 自己加一个 | 与出厂角色一起加载 |

目录是被监控的。不管是手动、设置页还是别的东西存了文件，安静一小段时间后就会重新读取，工具 schema、斜杠指令与页面都跟着更新；设 `watchRolesDir: false` 就改回每次组合 profile 只读一次。

那个目录里的 `.seeded.json` 就是让这套规则成立的 manifest——它记的是“包写了什么”，不是你改了什么。想把手上的文件交还给包就删掉对应那行，想全部重来就整个删掉，下次加载会重新结算。

你放进去的文件会**按 id 取代**出厂角色，就算不是包写的也一样。完全不要的角色用只带 id 的 stub 移除：

```markdown
---
id: hypothesis-debate
disabled: true
---
```

同一个目录里重复的 id 会保留第一个并警告；`disabled` stub 一定盖过出厂角色。设 `seedRolesDir: false` 可以完全禁止包写入你的目录——两层加载照常运作，角色列表依然可用，只是你的目录里只会有你自己的文件。

### 配置

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

就这样。**这份配置里没有任何模型，也没有任何路径**：角色文件自己指名路线，插件负责解析。

| 字段 | 默认 | 语义 |
|---|---|---|
| `dshHome` | `$DSH_HOME`，否则 `~/.dsh` | 角色目录所依据的 harness home |
| `rolesDir` | `$DSH_HOME/agents` | 你的角色目录：植入目标，也是覆盖根目录 |
| `seedRolesDir` | `true` | 加载时把出厂角色列表写进 `rolesDir`，未被改动的会跟着包保持最新 |
| `watchRolesDir` | `true` | `rolesDir` 里的文件变动时重新加载角色列表 |
| `commands` | `true` | 在有指令注册表的地方，每个角色注册一条 `/<id>` 斜杠指令 |
| `commandPrefix` | （空） | 放在每个角色指令名前面的文字 |
| `settingsPage` | `true` | 在有 web server 的地方挂载设置 API 与设置页 |
| `provider` | `spawn` | `ctx.subagents` 的 provider 名 |
| `toolName` | `delegate` | 模型侧工具名 |
| `backgroundMode` | `continuable` | `continuable` 返回 durable child id；`one-shot` 返回 job id |
| `enableRunInBackground` | `true` | 是否暴露 `run_in_background` |
| `maxDepth` | `2` | 被启动 child 的绝对委派深度上限 |
| `defaultRoute` | （空） | 角色没写 `route:` 时才需要 |
| `routes` | `{}` | 可选的别名表，只在你想要一层间接时用 |

### 路线是怎么解析的

角色文件的 `route:` 可以写裸模型 id（`deepseek-flash`）或完整的 `provider/model`。解析顺序：

1. row 的 `routes` 别名表（若你设了，且里面有这个名字）
2. **这个 Session 的 `subagent-model-selection` 允许列表**——你在 dsh 设置里勾的那些
3. **已注册 provider 的模型目录**（通过 `llm.listProviders()` / `llm.listModels()`）
4. 角色文件行内的 `model: { provider, model }`

第 3 条是关键：它让 headless 这种没有设置界面的 profile 也能解析，所以**整份配置不需要任何模型表**。你在 dsh 设置里勾好模型，角色就跟着走；换一台机器，这个文件一个字都不用改。

**当 session 的允许列表是打开的，它同时也是角色路线的闸门**：角色指名的模型若已注册但不在列表里，会得到明确的错误，而不是绕过列表偷偷跑。

**没有任何东西会自动选路线。** 角色文件没写 `route:`、没有行内 `model:`、调用时也没给 `route`、又没设 `defaultRoute` 时，child 会**继承调用者的 provider 与 model**（跟内置工具没指定模型时的行为一致），并在结果附注。这个插件不会自己从允许列表里挑；唯一能从列表挑的是模型本身，方式是调用时自己传 `provider` 与 `model`。

裸模型 id 必须是唯一的——同一个 id 注册在两个 provider 下时（例如 `kimi-k3` 同时在 `moonshotai` 与 `alibabacloud`），要写成 `provider/model`，否则会得到明确的歧义错误。

`routes` 别名表留着是为了想留一层间接的部署，例如让八个角色都写 `route: deep`，由这份配置决定 `deep` 在这台机器是什么：

```yaml
        routes:
          deep: { provider: deepseek-official, model: deepseek-flash }
```

effort 完全不需要配置。每条路线的 adapter 会通过 `LlmResolvedModelInfo.reasoning` 声明自己的推理层级，角色声明的 effort 会移到该路线最接近的层级，同距离取较高的那个。`deepseek-flash` 提供 `off`／`low`／`high`／`max`，所以在它上面 `medium` 会变成 `high`、`xhigh` 会变成 `max`；内置角色一律写 `high`，每条路线都直接提供这一级。角色文件可用的词汇是 `off`／`minimal`／`low`／`medium`／`high`／`xhigh`／`max`，发生替换时会在委派结果里注明。

角色也可以改用行内的 `model: { provider, model }` 取代别名；调用本身还可以用自己的 `provider`／`model` 覆盖两者。

### 挂载

这个 row 在 host plane。它刻意不带 `modelSelectionSettings`：standing composition 带那个旗标需要 scoped preset Context，而且会和已占用全局 `list_subagent_models` 名称的 `subagent` row 冲突。工具改以 `ctx.get('subagentModelSelection')` 取用同一个设置——当 session 启用了它，`provider` 与 `model` 就成为 per-call 参数，并对该 session 当下的允许列表验证，所以模型可以像用内置工具那样自己选路线。

以 bundle 形式安装到每个需要它的 profile。**profile 是各自独立的安装根**：每个有自己的 `package.json`、lockfile 与 `node_modules`，`dsh.profile.bundles` 也是 per profile，所以装进其中一个对另一个不可见。只装你真正会用的 profile 就好。

host-plane row 对每个 preset 的每个 agent 都可见，所以不需要复制 preset；把 row 改放进自己的 preset 则会把它限定在那个 preset。

```sh
# 从 npm 安装。
dsh plugin --profile web add dsh-roles-zeta

# 直接跟 repo 走，如果你想盯着源代码。
dsh plugin --profile web add github:zeta987/dsh-roles-zeta

# 从本机 clone 安装，开发这个插件时用。
dsh plugin --profile web add file:./dsh-roles-zeta
```

`github:` 与 `file:` 都是复制品，所以改完 clone 要重跑命令才会进到 host。只有在开发这个 plugin 时才用 `link:`：`link:` 是 symlink 来源目录，Node 会从来源的 realpath 解析包的 peer import，因此旁边需要一个 `node_modules` junction（见 `.gitignore`）。

安装后要重启该 profile 的 host；`dsh.profile.bundles` 的新增项是在组合 profile 时读取的。

### 在另一台电脑安装

```sh
dsh plugin --profile web add dsh-roles-zeta
# 重启 host
```

两行，八个角色就能用。什么都不用复制，也没有设置要改：角色文件已经各自指名 `provider/model`，插件会用那台机器自己注册的 provider 目录解析。唯一的前提是那台有这些 provider 与凭据——以及你自己的 `$DSH_HOME/agents`（如果存在）没有用自己的文件盖掉内置角色。

如果那台少了内置角色指名的 provider，两条路：把在意的那几个角色复制到 `$DSH_HOME/agents` 再改 `route:`（复制过才会在升级时保住你的修改），或在 patch 里加一张 `routes` 别名表一次把八个指过去。

## 模型看到什么

### 工具 schema

每个 session 一份 schema，加上描述里每个角色一行 roster，以及当前允许的路线列表。参数为 `role`（已加载 id 的 enum）、`description`、`prompt`、选填的 `route` enum、启用后台执行时的 `run_in_background`，以及当 session 启用了子代理模型选择时的 `provider` 与 `model`。

### 委派

一次调用会解析角色文件、preflight 路线、对 live registry 收敛工具过滤器，然后启动一个 child。child 收到角色正文作为 persona prefix，因此只对该 child 取代部署层的 persona prefix，preset 的 suffix 仍然生效。child 也会加入父的 preset，继承父的工具集再减去角色过滤器移除的部分。

前台调用返回 child 的最终文字。continuable 后台调用返回 `started subagent <id>`，之后由 runtime 的结算通知送达。

## 已知限制

- **preset 的委派工具不受角色 `allow` 列表限制。** 若某个 preset 的 `subagent` row 设了 `modelSelectionSettings: true`，那个 row 会改成 per-Agent 安装（`agent/created` 时重新注册进该 agent 自己的 scope），而 `tools.restrict()` 刻意从不过滤一个 scope 自己那层的注册。实测：允许 6 个工具的角色在 web profile 拿到 8 个（`subagent` 与 `list_subagent_models` 渗进来），在 headless 则刚好 6 个——因为那里同一条 row 在 host plane。所以在 web profile 里，只读角色仍可自己启动 child；persona 说不要，但过滤器管不到。要真的挡住，得复制 preset 并清掉它 `subagent` row 的 `modelSelectionSettings`，代价是同时失去 `list_subagent_models` 与调用时的路线参数。
- **角色改变不了部署层的工作区指示链。** 每个 child 与父加载同一条 `AGENTS.md`／`CLAUDE.md` 链，所以全局语气规则可能压过角色自己的风格指示。
- **没有 per-call 路线策略。** 角色通过配置的 `agentOptions` 走线，因此 session 的 `subagent-model-selection` 允许列表管不到它们；真正把关的是 LLM adapter 的 preflight。
- **registry 探测仅供参考。** 工具过滤器由 `ctx.tools.schemas(agent)` 构建。若 `tools.restrict()` 拒绝，会收窄过滤器并重试最多三次，所以一个过期名称的代价是一次失败的启动，而不是整次委派失败。
- **斜杠指令是请求，不是保证。** `/reviewer <task>` 排进一轮对话要求 agent 委派；实际调用由模型执行，模型若无视指示就等于没有委派。对话记录会显示实际发生了哪一种。
- **设置页改的是文件，不是 session。** 已经启动的 child 不受之后的修改影响；下一次启动才读新文件。
- **没有 per-role 记忆。** 这个 plugin 不拥有也不注入任何记忆存储。
