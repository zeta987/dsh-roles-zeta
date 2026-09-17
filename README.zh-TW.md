[English](README.md) | 繁體中文 | [简体中文](README.zh-CN.md)

# dsh-roles-zeta

## 摘要

`dsh-roles-zeta` 給 dsh agent 一支 `delegate` 工具與一個角色檔資料夾。呼叫時指定角色，角色檔提供該 child 的 persona、模型路線、reasoning effort 與工具範圍。它是同一個 `ctx.subagents` 服務之上的薄層，所以 provider、深度計算、durable descriptor、續談、子代理目錄與背景結算通知全部照舊。

內建的 `subagent` 與 `subagent_fork` 沒有被取代，應該繼續掛著。它們回答的是另一個問題：讓模型在每次呼叫時從 session 允許清單裡挑路線；而角色是寫檔時就固定的綁定。

工具旁邊還有三個小介面，各自只在對應的 host 服務存在時掛載：Web 輸入框裡每個角色一條斜線指令（`/reviewer <task>`）、Web 設定裡的「角色代理」頁，可新增、改名、編輯、刪除與恢復角色，以及角色目錄的監看，改動不必重新組合 profile 就會進到下一次呼叫。

## 使用

### 安裝

```sh
# 裝進你會用到的每個 profile。profile 是各自獨立的安裝根，裝進一個對另一個不可見。
dsh plugin --profile web add dsh-roles-zeta

# 重啟 host。bundle 清單是在組合 profile 時讀取的。
```

這樣就裝完了。**重啟後第一次載入時，八個角色檔會被寫進 `$DSH_HOME/agents`**（`$DSH_HOME` 預設 `~/.dsh`），之後新開的 session 就有一支 `delegate` 工具，描述裡列出它們。不用複製 preset、不用任何模型表、也不用自己放檔案。

```sh
ls ~/.dsh/agents
# code-mapper-lite.md  explorer.md          log-distiller.md  triage.md
# deep-coordinator.md  hypothesis-debate.md reviewer.md       worker.md
# .seeded.json
```

這個 bundle 也帶了瀏覽器端，所以就算 Web profile 開著 `patchReload: live` 也要重啟一次；host 只提供組合 profile 時找到的 client bundle。

### 斜線指令

每個載入的角色同時也是 Web 輸入框裡的一條指令。輸入 `/` 就會看到它們和內建的 `/plan`、`/goal`、`/compact` 並列，旁邊是各自的 `when` 說明；`/reviewer look at lib/index.js` 會排進一輪對話，要求 agent 以 `reviewer` 角色呼叫 `delegate`、把這段文字當任務、在前景跑完並轉述結果。指令本身不會直接啟動 child：指令 handler 跑在任何模型回合之外，若子代理的結果根本沒回到模型手上，就沒有人能轉述它；所以委派留在對話紀錄裡，就是一次普通的工具呼叫，跟 `/plan <message>` 放訊息的位置相同。

指令跟著名冊走。不管是從設定頁還是直接改目錄，新增、改名或移除角色都會重新註冊整組指令，選單自己會更新。角色 id 若撞到其他 plugin 擁有的指令名，那個角色仍可透過工具使用，只是不註冊成指令，log 會寫一行說明。row 上設 `commands: false` 就完全不掛；設 `commandPrefix` 可以把所有角色放在同一個前綴後面（`commandPrefix: "r-"` 得到 `/r-reviewer`）。

### 設定頁

設定 → **角色代理** 列出名冊，每個角色有標籤（內建、自訂、已修改），一次編輯一個角色：id、`when` 說明、模型路線（session 允許的路線會列成建議）、推理強度、工具範圍（目前已註冊工具的勾選清單，或「沿用全部」加上委派開關）以及角色指示。儲存會把 `<id>.md` 寫進 `$DSH_HOME/agents`，跟你手寫的是同一個檔案；工具、指令與頁面立刻跟上。

除了編輯，這頁還做角色庫需要的另外兩件事：

| 按鈕 | 對磁碟做的事 |
|---|---|
| 刪除（自訂角色） | 移除檔案 |
| 刪除（內建角色） | 把檔案換成 `disabled: true` 的停用檔，套件內的副本就不再載入；恢復前它會列在「已停用的內建角色」 |
| 恢復此角色 | 把套件內的檔案複製回來覆蓋你的版本，並在 manifest 裡交還給套件管理 |
| 恢復內建角色 | 八個一起做；你自己新增的角色一律不動 |

這頁是一個純瀏覽器模組，背後是 `/__dsh/roles-zeta/` 底下幾條 JSON 路由，跟其他 Web API 一樣受瀏覽器 session cookie 與 Host／Origin 信任檢查把關，寫入還要求同來源。設 `settingsPage: false` 就兩者都不掛。

### 角色檔

一個角色就是一個 Markdown 檔。frontmatter 放機器欄位，正文是 child 的 `deployment:persona-prefix` section。

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

| 欄位 | 必填 | 語意 |
|---|---|---|
| `id` | 是 | 角色 id；任何 `_` 拼法都解析到同一個角色 |
| `when` | 是 | 一行，渲染進工具描述，作為模型看到的選單 |
| `route` | 否 | 模型 id（`deepseek-flash`）或完整的 `provider/model`；見「路線是怎麼解析的」 |
| `effort` | 否 | 角色詞彙的 effort，按 route 轉譯 |
| `allow` | 否 | child 保留的全域工具名；省略則全部繼承 |
| `delegation` | 否 | 沒有 `allow` 清單的角色要設 `true` 才保留委派工具 |
| `disabled` | 否 | `true` 移除隨套件出貨的角色，不需要寫替代正文 |

有 `allow` 清單的角色除非清單內含委派工具，否則不能再委派；沒有清單的角色除非設 `delegation: true`，否則也不行。委派是 opt-in，因為來源定義裡每個葉節點角色都明文如此。

#### 角色是從哪裡載入的

兩層，依序套用，後面的蓋掉前面的：

1. **套件內建名冊**——`<套件>/roles/*.md`，出貨的八個；
2. **`$DSH_HOME/agents`**——你自己的目錄，`$DSH_HOME` 預設 `~/.dsh`。

套件會在第一次載入時把名冊放進你的目錄，所以檔案就在 dsh 使用者會去找的地方——跟 `~/.codex/agents`、`~/.claude/agents` 一樣。**只要你沒動它們，它們就由套件管理**：

| 你做了什麼 | 下次載入時 |
|---|---|
| 什麼都沒做 | 套件寫進去的檔案跟著套件走；新版改了角色就會更新 |
| 改過其中一個 | 那個檔案變成你的，永遠不會再被覆蓋 |
| 刪掉一個 | 不會再植入一次——但套件內的副本照樣載入，角色本身還在；要真的拿掉角色，用 `disabled` stub 或設定頁 |
| 自己加一個 | 與出廠角色一起載入 |

目錄是被監看的。不管是手動、設定頁還是別的東西存了檔，安靜一小段時間後就會重新讀取，工具 schema、斜線指令與頁面都跟著更新；設 `watchRolesDir: false` 就改回每次組合 profile 只讀一次。

那個目錄裡的 `.seeded.json` 就是讓這套規則成立的 manifest——它記的是「套件寫了什麼」，不是你改了什麼。想把手上的檔案交還給套件就刪掉對應那行，想全部重來就整個刪掉，下次載入會重新結算。

你放進去的檔案會**按 id 取代**出廠角色，就算不是套件寫的也一樣。完全不要的角色用只帶 id 的 stub 移除：

```markdown
---
id: hypothesis-debate
disabled: true
---
```

同一個目錄裡重複的 id 會保留第一個並警告；`disabled` stub 一定蓋過出廠角色。設 `seedRolesDir: false` 可以完全禁止套件寫入你的目錄——兩層載入照常運作，名冊依然可用，只是你的目錄裡只會有你自己的檔案。

### 設定

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

就這樣。**這份設定裡沒有任何模型，也沒有任何路徑**：角色檔自己指名路線，插件負責解析。

| 欄位 | 預設 | 語意 |
|---|---|---|
| `dshHome` | `$DSH_HOME`，否則 `~/.dsh` | 角色目錄所依據的 harness home |
| `rolesDir` | `$DSH_HOME/agents` | 你的角色目錄：植入目標，也是覆蓋根目錄 |
| `seedRolesDir` | `true` | 載入時把出廠名冊寫進 `rolesDir`，未被改動的會跟著套件保持最新 |
| `watchRolesDir` | `true` | `rolesDir` 裡的檔案變動時重新載入名冊 |
| `commands` | `true` | 在有指令登錄表的地方，每個角色註冊一條 `/<id>` 斜線指令 |
| `commandPrefix` | （空） | 放在每個角色指令名前面的文字 |
| `settingsPage` | `true` | 在有 web server 的地方掛載設定 API 與設定頁 |
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
# 從 npm 安裝。
dsh plugin --profile web add dsh-roles-zeta

# 直接跟 repo 走，如果你想盯著原始碼。
dsh plugin --profile web add github:zeta987/dsh-roles-zeta

# 從本機 clone 安裝，開發這個插件時用。
dsh plugin --profile web add file:./dsh-roles-zeta
```

`github:` 與 `file:` 都是複製品，所以改完 clone 要重跑命令才會進到 host。只有在開發這個 plugin 時才用 `link:`：`link:` 是 symlink 來源目錄，Node 會從來源的 realpath 解析套件的 peer import，因此旁邊需要一個 `node_modules` junction（見 `.gitignore`）。

安裝後要重啟該 profile 的 host；`dsh.profile.bundles` 的新增項目是在組合 profile 時讀取的。

### 在另一台電腦安裝

```sh
dsh plugin --profile web add dsh-roles-zeta
# 重啟 host
```

兩行，八個角色就能用。什麼都不用複製，也沒有設定要改：角色檔已經各自指名 `provider/model`，插件會用那台機器自己註冊的 provider 目錄解析。唯一的前提是那台有這些 provider 與憑證——以及你自己的 `$DSH_HOME/agents`（如果存在）沒有用自己的檔案蓋掉內建角色。

如果那台少了內建角色指名的 provider，兩條路：把在意的那幾個角色複製到 `$DSH_HOME/agents` 再改 `route:`（複製過才會在升級時保住你的修改），或在 patch 裡加一張 `routes` 別名表一次把八個指過去。

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
- **斜線指令是請求，不是保證。** `/reviewer <task>` 排進一輪對話要求 agent 委派；實際呼叫由模型執行，模型若無視指示就等於沒有委派。對話紀錄會顯示實際發生了哪一種。
- **設定頁改的是檔案，不是 session。** 已經啟動的 child 不受之後的修改影響；下一次啟動才讀新檔。
- **沒有 per-role 記憶。** 這個 plugin 不擁有也不注入任何記憶儲存。
