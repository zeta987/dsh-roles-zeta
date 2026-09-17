[English](README.md) | 繁體中文 | [简体中文](README.zh-CN.md)

# dsh-roles-zeta

`dsh-roles-zeta` 給 dsh agent 一支 `delegate` 工具與一個角色檔資料夾。呼叫時指定角色，角色檔提供該 child 的 persona、模型路線、reasoning effort 與工具範圍。它架在內建 `subagent` 工具用的同一個 `ctx.subagents` 服務上，所以 provider、委派深度、續談與背景結算全部照舊。內建的 `subagent` 與 `subagent_fork` 繼續掛著：它們讓模型每次呼叫自己挑路線，而角色是寫檔時就固定的。

工具旁邊有三個介面，各自只在對應的 host 服務存在時掛載：Web 輸入框裡每個角色一條斜線指令、Web 設定裡的「角色代理」頁，以及角色目錄的監看，改動不必重新組合 profile 就會進到下一次呼叫。

## 安裝

```sh
dsh plugin --profile web add dsh-roles-zeta
# 重啟 host
```

profile 是各自獨立的安裝根，要用的每個 profile 都裝一次。`github:zeta987/dsh-roles-zeta` 與 `file:<path>` 也可以。第一次載入時八個角色檔會寫進 `$DSH_HOME/agents`（`$DSH_HOME` 預設 `~/.dsh`），新 session 就有一支 `delegate` 工具，描述裡列出它們。

```
~/.dsh/agents
├── code-mapper-lite.md   explorer.md            log-distiller.md   triage.md
├── deep-coordinator.md   hypothesis-debate.md   reviewer.md        worker.md
└── .seeded.json
```

### 更新

不會自動更新：`dsh plugin` 是在 profile 目錄裡轉發給 pnpm，啟動 host 不會安裝任何東西，也沒有任何頁面會查 registry。要換到某個版本：

```sh
dsh plugin --profile web add dsh-roles-zeta@0.4.0
# 重啟 host
```

版本要明講。`update` 只在安裝時 pnpm 寫下的 `^0.x` 範圍內移動；pnpm 11 起會把發布未滿 24 小時的版本從 `outdated` 與 `@latest` 裡藏起來（`minimumReleaseAge`），明確指定版本則立刻能裝。你改過的角色檔不會被動；沒碰過的內建角色會在下次載入時刷新。

## 斜線指令

每個載入的角色都是 Web 輸入框裡的一條指令。輸入 `/` 就會看到它們和 `/plan`、`/goal` 並列；`/reviewer look at lib/index.js` 會排進一輪對話，要求 agent 以 `reviewer` 角色呼叫 `delegate`、把這段文字當任務、在前景跑完並轉述結果。所以委派會留在對話紀錄裡，就是一次普通的工具呼叫，跟 `/plan <message>` 放訊息的位置相同。

指令跟著名冊走：新增、改名或移除角色都會重新註冊，選單自己更新。角色 id 撞到其他 plugin 的指令名時，該角色不註冊成指令（log 會說明），但仍可透過工具使用。`commands: false` 就完全不掛；`commandPrefix: "r-"` 得到 `/r-reviewer`。

![Web 輸入框輸入 `/`：角色與內建指令並列](https://raw.githubusercontent.com/zeta987/dsh-roles-zeta/main/docs/images/commands-zh.png)

## 設定頁

設定 → **角色代理** 列出名冊，每個角色有標籤（內建、自訂、已修改），一次編輯一個角色：id、`when` 說明、路線（session 允許的路線會列成建議）、推理強度、工具（目前已註冊工具的勾選清單，或「沿用全部」加上委派開關）以及角色指示。儲存會把 `<id>.md` 寫進 `$DSH_HOME/agents`，跟你手寫的是同一個檔案。

| 按鈕 | 對磁碟做的事 |
|---|---|
| 刪除（自訂角色） | 移除檔案 |
| 刪除（內建角色） | 留下 `disabled: true` 停用檔，套件內的副本不再載入；恢復前列在「已停用的內建角色」 |
| 恢復此角色 | 把套件內的檔案複製回來覆蓋你的版本 |
| 恢復內建角色 | 八個一起做；你自己新增的角色一律不動 |

這頁是 `/__dsh/roles-zeta/` 底下幾條 JSON 路由之上的瀏覽器模組，跟其他 Web API 一樣受瀏覽器 session cookie 與 Host／Origin 信任檢查把關。`settingsPage: false` 就兩者都不掛。

![設定 → 角色代理：上方是名冊，下方開著 reviewer 的編輯器](https://raw.githubusercontent.com/zeta987/dsh-roles-zeta/main/docs/images/settings-zh.png)

## 角色檔

一個角色一個 Markdown 檔：frontmatter 放機器欄位，正文是 child 的 persona prefix。

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
| `id` | 是 | 角色 id；底線寫法解析到同一個角色 |
| `when` | 是 | 一行；模型的選單項目，也是指令說明 |
| `route` | 否 | 模型 id（`deepseek-flash`）或完整的 `provider/model` |
| `effort` | 否 | `off`／`minimal`／`low`／`medium`／`high`／`xhigh`／`max`，依路線夾到可用層級 |
| `allow` | 否 | child 保留的工具名；省略則繼承全部 |
| `delegation` | 否 | `true` 讓沒有 `allow` 的 child 保留委派工具 |
| `disabled` | 否 | `true` 移除一個內建角色 |

有 `allow` 的角色只有清單裡列了委派工具才能委派；沒有 `allow` 的只有 `delegation: true` 才能。

### 角色從哪裡載入

兩層來源，後者覆蓋前者：套件自己的 `roles/*.md`，然後是 `$DSH_HOME/agents`。套件第一次載入時把名冊植入你的目錄，你不動它就一直由套件管理：

| 你做了什麼 | 下次載入 |
|---|---|
| 什麼都不做 | 內建檔跟著套件；新版本改了角色就更新 |
| 改了一個 | 它變成你的，不再被覆寫 |
| 刪了一個 | 不會再植入，但套件內的副本照樣載入；要真的拿掉角色，用 `disabled` stub 或設定頁 |
| 自己加一個 | 與內建角色一起載入 |

`.seeded.json` 記著套件寫了什麼。你放進去的檔案會依 id 取代內建角色；只有 `id` 與 `disabled: true` 的 stub 會移除它。目錄是被監看的，任何變動在安靜一小段時間後重新讀取。`seedRolesDir: false` 讓套件不寫入你的目錄；`watchRolesDir: false` 改成每次組合只讀一次。

## 設定

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

這裡沒有任何模型也沒有任何路徑：角色檔自己指名路線，插件負責解析。這條 row 在 host plane，所以每個 preset 的每個 agent 都看得到工具。

| 欄位 | 預設 | 語意 |
|---|---|---|
| `dshHome` | `$DSH_HOME`，否則 `~/.dsh` | 角色目錄所依據的 harness home |
| `rolesDir` | `$DSH_HOME/agents` | 你的角色目錄：植入目標，也是覆蓋根 |
| `seedRolesDir` | `true` | 把內建名冊寫進 `rolesDir`，未改動的跟著套件更新 |
| `watchRolesDir` | `true` | `rolesDir` 有檔案變動時重新載入名冊 |
| `commands` | `true` | 每個角色一條 `/<id>` 斜線指令 |
| `commandPrefix` | （空） | 放在每個指令名前面的文字 |
| `settingsPage` | `true` | 掛載設定 API 與設定頁 |
| `provider` | `spawn` | `ctx.subagents` 的 provider 名 |
| `toolName` | `delegate` | 模型面工具名 |
| `backgroundMode` | `continuable` | `continuable` 回傳 durable child id；`one-shot` 回傳 job id |
| `enableRunInBackground` | `true` | 是否暴露 `run_in_background` |
| `maxDepth` | `2` | 被啟動 child 的委派深度上限 |
| `defaultRoute` | （空） | 角色沒寫 `route:` 時使用 |
| `routes` | `{}` | 別名表：`deep: { provider: deepseek-official, model: deepseek-flash }` 後角色可寫 `route: deep` |

## 路線怎麼解析

`route:` 依序查：row 的 `routes` 別名表；這個 session 的 `subagent-model-selection` 允許清單（你在 dsh 設定裡勾的模型）；已註冊 provider 的模型目錄；角色檔行內的 `model: { provider, model }`。目錄那一步讓沒有設定介面的 headless profile 也能解析。允許清單開著時它也把關角色的路線：已註冊但不在清單裡的模型會得到明確錯誤，不會偷偷跑。

哪裡都沒指名路線時，child 沿用呼叫者的 provider 與 model，結果會註明；插件從不自己從允許清單挑。同一個模型 id 註冊在兩個 provider 底下時必須寫成 `provider/model`。

effort 會夾到該路線宣告的層級上，同距離取較高：`deepseek-flash` 提供 `off`／`low`／`high`／`max`，所以 `medium` 變成 `high`、`xhigh` 變成 `max`。內建角色一律寫 `high`。發生替換時會在委派結果裡註明。

## 模型看到什麼

每個 session 一份工具 schema：描述裡每個角色一行，加上允許的路線；參數是 `role`、`description`、`prompt`、選配的 `route` 別名、session 開啟模型選擇時的 `provider`／`model`，以及 `run_in_background`。一次呼叫會解析角色、預檢路線、依即時 registry 收窄工具過濾器，然後啟動一個以角色正文為 persona prefix 的 child。前景呼叫回傳 child 的最終文字；continuable 背景呼叫回傳 `started subagent <id>`，再由 runtime 的通知結算。

## 已知限制

- **preset 的委派工具不受角色 `allow` 清單限制。** 若某個 preset 的 `subagent` row 設了 `modelSelectionSettings: true`，那個 row 會改成 per-agent 安裝，而 `tools.restrict()` 從不過濾一個 scope 自己那層：允許 6 個工具的角色在 web profile 拿到 8 個（`subagent` 與 `list_subagent_models` 滲進來），在 headless 剛好 6 個。web profile 裡唯讀角色仍可自己啟動 child；persona 說不要，過濾器管不到。
- **角色改變不了工作區指示鏈。** 每個 child 與父載入同一條 `AGENTS.md`／`CLAUDE.md` 鏈。
- **registry 探測僅供參考。** `tools.restrict()` 拒絕時會收窄過濾器並重試最多三次，一個過期名稱的代價是一次失敗的啟動。
- **斜線指令是請求，不是保證。** 委派由模型執行，對話紀錄會顯示它有沒有做。
- **設定頁改的是檔案，不是 session。** 已啟動的 child 不受之後的修改影響；下一次啟動才讀新檔。
- **沒有 per-role 記憶。**
