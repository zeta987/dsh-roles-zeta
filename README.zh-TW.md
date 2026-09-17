---
description: "DeepSeek Harness 的角色化子代理委派：一支 delegate 工具加一個角色檔資料夾，給維護專家子代理名冊的使用者。"
kind: "package-reference"
---

# dsh-role-agents

[English](README.md) | 繁體中文

## 摘要

`dsh-role-agents` 給 dsh agent 一支 `delegate` 工具與一個角色檔資料夾。呼叫時指定角色，角色檔提供該 child 的 persona、模型路線、reasoning effort 與工具範圍。它是同一個 `ctx.subagents` 服務之上的薄層，所以 provider、深度計算、durable descriptor、續談、子代理目錄與背景結算通知全部照舊。

內建的 `subagent` 與 `subagent_fork` 沒有被取代，應該繼續掛著。它們回答的是另一個問題：讓模型在每次呼叫時從 session 允許清單裡挑路線；而角色是寫檔時就固定的綁定。

## 使用

### 角色檔

每個角色一個 Markdown 檔，放在設定的目錄（預設 `~/.dsh/agents`）。frontmatter 放機器欄位，正文是 child 的 `deployment:persona-prefix` section。

```markdown
---
id: reviewer
when: Deep read-only reviewer for correctness, regressions, edge cases, and missing tests.
route: deep
effort: xhigh
allow: [read, glob, grep, web_search, web_fetch, skill]
---

Review like an owner.
Prioritize correctness, regressions, edge cases, and concurrency hazards.
```

| 欄位 | 必填 | 語意 |
|---|---|---|
| `id` | 是 | 角色 id；任何 `_` 拼法都解析到同一個角色 |
| `when` | 是 | 一行，渲染進工具描述，作為模型看到的選單 |
| `route` | 否 | 模型 id（`deepseek-flash`）或完整的 `provider/model`；見「路線是怎麼解析的」 |
| `effort` | 否 | 角色詞彙的 effort，按 route 轉譯 |
| `allow` | 否 | child 保留的全域工具名；省略則全部繼承 |
| `delegation` | 否 | 沒有 `allow` 清單的角色要設 `true` 才保留委派工具 |

有 `allow` 清單的角色除非清單內含委派工具，否則不能再委派；沒有清單的角色除非設 `delegation: true`，否則也不行。委派是 opt-in，因為來源定義裡每個葉節點角色都明文如此。

### 設定

```yaml
- insert:
    - id: role-agents
      name: '@zeta987/dsh-role-agents'
      config:
        provider: spawn
        toolName: delegate
        backgroundMode: continuable
        maxDepth: 2
```

就這樣。**這份設定裡沒有任何模型，也沒有任何路徑**：角色檔自己指名路線，插件負責解析。

| 欄位 | 預設 | 語意 |
|---|---|---|
| `dshHome` | `$DSH_HOME`，否則 `~/.dsh` | 角色目錄所依據的 harness home |
| `rolesDir` | `<dshHome>/agents` | 掃描 `*.md` 角色檔的目錄 |
| `provider` | `spawn` | `ctx.subagents` 的 provider 名 |
| `toolName` | `delegate` | 模型面工具名 |
| `backgroundMode` | `continuable` | `continuable` 回傳 durable child id；`one-shot` 回傳 job id |
| `enableRunInBackground` | `true` | 是否暴露 `run_in_background` |
| `maxDepth` | `2` | 被啟動 child 的絕對委派深度上限 |
| `defaultRoute` | （空） | 角色沒寫 `route:` 時才需要 |
| `routes` | `{}` | 選配的別名表，只在你想要一層間接時用 |

### 路線是怎麼解析的

角色檔的 `route:` 可以寫裸模型 id（`deepseek-flash`）或完整的 `provider/model`。解析順序：

1. row 的 `routes` 別名表（若你設了，且裡面有這個名字）
2. **這個 Session 的 `subagent-model-selection` 允許清單**——你在 dsh 設定裡勾的那些
3. **已註冊 provider 的模型目錄**（透過 `llm.listProviders()` / `llm.listModels()`）
4. 角色檔行內的 `model: { provider, model }`

第 3 條是關鍵：它讓 headless 這種沒有設定介面的 profile 也能解析，所以**整份設定不需要任何模型表**。你在 dsh 設定裡勾好模型，角色就跟著走；換一台機器，這個檔案一個字都不用改。

**當 session 的允許清單是開啟的，它同時也是角色路線的閘門**：角色指名的模型若已註冊但不在清單裡，會得到明確的錯誤，而不是繞過清單偷偷跑。

**沒有任何東西會自動選路線。** 角色檔沒寫 `route:`、沒有行內 `model:`、呼叫時也沒給 `route`、又沒設 `defaultRoute` 時，child 會**繼承呼叫者的 provider 與 model**（跟內建工具沒指定模型時的行為一致），並在結果附註。這個插件不會自己從允許清單裡挑；唯一能從清單挑的是模型本身，方式是呼叫時自己傳 `provider` 與 `model`。

裸模型 id 必須是唯一的——同一個 id 註冊在兩個 provider 下時（例如 `kimi-k3` 同時在 `moonshotai` 與 `alibabacloud`），要寫成 `provider/model`，否則會得到明確的歧義錯誤。

`routes` 別名表留著是為了想留一層間接的部署，例如讓八個角色都寫 `route: deep`，由這份設定決定 `deep` 在這台機器是什麼：

```yaml
        routes:
          deep: { provider: deepseek-official, model: deepseek-flash }
```

effort 完全不需要配置。每條路線的 adapter 會透過 `LlmResolvedModelInfo.reasoning` 宣告自己的推理層級，角色宣告的 effort 會被夾到那些層級上：`xhigh` 在有的路線落到 `max`、在沒有的落到 `high`。角色檔可用的詞彙是 `off`／`minimal`／`low`／`medium`／`high`／`xhigh`／`max`，發生替換時會在委派結果裡註明。

角色也可以改用行內的 `model: { provider, model }` 取代別名；呼叫本身還可以用自己的 `provider`／`model` 覆蓋兩者。

### 掛載

這個 row 在 host plane。它刻意不帶 `modelSelectionSettings`：standing composition 帶那個旗標需要 scoped preset Context，而且會和已佔用全域 `list_subagent_models` 名稱的 `subagent` row 衝突。工具改以 `ctx.get('subagentModelSelection')` 取用同一個設定——當 session 啟用了它，`provider` 與 `model` 就成為 per-call 參數，並對該 session 當下的允許清單驗證，所以模型可以像用內建工具那樣自己選路線。

以 bundle 形式安裝到每個需要它的 profile。**profile 是各自獨立的安裝根**：每個有自己的 `package.json`、lockfile 與 `node_modules`，`dsh.profile.bundles` 也是 per profile，所以裝進其中一個對另一個不可見。只裝你真正會用的 profile 就好。

host-plane row 對每個 preset 的每個 agent 都可見，所以不需要複製 preset；把 row 改放進自己的 preset 則會把它限定在那個 preset。

```sh
# 從 git 主機安裝。pnpm 會把實體檔案放進 profile，所以套件自己的 peer import
# 會從 profile 的 node_modules 解析。
dsh plugin --profile web add github:<owner>/<repo>

# 從 registry 安裝（公開或私有，需 scoped 名稱）。
dsh plugin --profile web add @<scope>/dsh-role-agents

# 從複製或 clone 下來的目錄安裝：`file:` 會複製進去（同樣的性質）。
dsh plugin --profile web add file:<這個目錄的路徑>
```

只有在開發這個 plugin 時才用 `link:`：`link:` 是 symlink 來源目錄，Node 會從來源的 realpath 解析套件的 peer import，因此旁邊需要一個 `node_modules` junction（見 `.gitignore`）。`file:`、git 與 registry 安裝都是複製品，所以改完要重跑命令才會進到 host。

安裝後要重啟該 profile 的 host；`dsh.profile.bundles` 的新增項目是在組合 profile 時讀取的。

### 在另一台電腦安裝

```sh
# 1. 把套件弄過去（clone、複製，或從 registry 安裝）。

# 2. 裝進你會用到的每個 profile。
dsh plugin --profile web add github:<owner>/<repo>

# 3. 把角色檔放到插件讀取的位置。
#    把本 repo 的 examples/roles/*.md 複製到 <dshHome>/agents/
#    （$DSH_HOME，否則 ~/.dsh）。目錄不存在就建立。

# 4. 重啟 host。
```

**沒有需要改的設定。** 角色檔已經各自指名 `provider/model`，插件會用那台機器自己註冊的 provider 目錄解析；只要那台有這兩個 provider 與憑證就好。如果它沒有一樣的 provider，改角色檔的 `route:` 一行，或在 patch 裡加一張 `routes` 別名表把八個角色指過去。

### 發布

套件本身就可以發布；`files` 已經把 tarball 限制在 `lib`、`examples`、patch、兩份 README 與授權，`publishConfig.access` 是 `public`。發布前先確認：

```sh
npm pack --dry-run
npm publish
```

scope 與 bundle patch 是連動的：patch row 的 `name` 就是套件自己的名字，所以換 scope 重新發布時 `package.json` 與 `cordis.patch.yml` 兩邊都要改。改名後一定要重裝——pnpm 是用套件名當相依鍵，`dsh.profile.bundles` 跟著那個鍵走：

```sh
dsh plugin --profile web add <新的 specifier>
dsh plugin --profile web remove <舊的套件名>
```

repo 在 `github.com/zeta987/dsh-role-agents`，掛的 topics 是 `dsh-plugin`、`dsh`、`deepseek-harness`、`cordis`、`ai-agents`、`subagent`、`multi-agent`——前三個是每個 dsh 插件 repo 共通的慣例，其中 `dsh-plugin` 是讓插件能在 <https://github.com/topics/dsh-plugin> 被找到的那個。

想改成私有發布的話，npmjs 用 `"publishConfig": { "access": "restricted" }`（需要付費方案），或指向 GitHub Packages：`"registry": "https://npm.pkg.github.com"`，並在 `.npmrc` 加 `//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}`。從 GitHub Packages 安裝的機器也要有同一條 scoped registry 設定，因為 `dsh plugin` 是直接在 profile 目錄轉發給 pnpm，而 pnpm 讀的是那裡或使用者家目錄的 `.npmrc`。

`peerDependencies` 都標成 optional，所以 npm 與 pnpm 都不會去裝第二份 harness 套件；它們從 profile 自己的 `node_modules` 解析。

## 模型看到什麼

### 工具 schema

每個 session 一份 schema，加上描述裡每個角色一行 roster，以及目前允許的路線清單。參數為 `role`（已載入 id 的 enum）、`description`、`prompt`、選填的 `route` enum、啟用背景執行時的 `run_in_background`，以及當 session 啟用了子代理模型選擇時的 `provider` 與 `model`。

### 委派

一次呼叫會解析角色檔、preflight 路線、對 live registry 收斂工具過濾器，然後啟動一個 child。child 收到角色正文作為 persona prefix，因此只對該 child 取代部署層的 persona prefix，preset 的 suffix 仍然生效。child 也會加入父的 preset，繼承父的工具集再減去角色過濾器移除的部分。

前景呼叫回傳 child 的最終文字。continuable 背景呼叫回傳 `started subagent <id>`，之後由 runtime 的結算通知送達。

## 已知限制

- **preset 的委派工具不受角色 `allow` 清單限制。** 若某個 preset 的 `subagent` row 設了 `modelSelectionSettings: true`，那個 row 會改成 per-Agent 安裝（`agent/created` 時重新註冊進該 agent 自己的 scope），而 `tools.restrict()` 刻意從不過濾一個 scope 自己那層的註冊。實測：允許 6 個工具的角色在 web profile 拿到 8 個（`subagent` 與 `list_subagent_models` 滲進來），在 headless 則剛好 6 個——因為那裡同一條 row 在 host plane。所以在 web profile 裡，唯讀角色仍可自己啟動 child；persona 說不要，但過濾器管不到。要真的擋住，得複製 preset 並清掉它 `subagent` row 的 `modelSelectionSettings`，代價是同時失去 `list_subagent_models` 與呼叫時的路線參數。
- **角色改變不了部署層的工作區指示鏈。** 每個 child 與父載入同一條 `AGENTS.md`／`CLAUDE.md` 鏈，所以全域語氣規則可能壓過角色自己的風格指示。
- **沒有 per-call 路線政策。** 角色透過設定的 `agentOptions` 走線，因此 session 的 `subagent-model-selection` 允許清單管不到它們；真正把關的是 LLM adapter 的 preflight。
- **registry 探測僅供參考。** 工具過濾器由 `ctx.tools.schemas(agent)` 建構。若 `tools.restrict()` 拒絕，會收窄過濾器並重試最多三次，所以一個過期名稱的代價是一次失敗的啟動，而不是整次委派失敗。
- **角色檔在 plugin apply 時讀取。** 改完要等 host 重新組合 profile 才會進到新 session；沒有 watcher。
- **沒有 per-role 記憶。** 這個 plugin 不擁有也不注入任何記憶儲存。
