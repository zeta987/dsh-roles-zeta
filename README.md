English | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md)

# dsh-roles-zeta

## Summary

`dsh-roles-zeta` gives a dsh agent one `delegate` tool and a folder of role
files. A call names a role; the role file supplies that child's persona, its
model route, its reasoning effort, and its tool surface. It is a thin layer over
the same `ctx.subagents` service the built-in `subagent` tool uses, so providers,
delegation depth, durable descriptors, continuation, the subagent catalog, and
background settlement notices all keep working unchanged.

The built-in `subagent` and `subagent_fork` tools are not replaced and should
stay mounted. They answer a different question: they let the model pick a route
per call from the session's allowed list, while a role is a binding fixed when
the file is written.

Around the tool sit three small surfaces, each mounted only where its host
service exists: one slash command per role in the Web input box (`/reviewer
<task>`), a **Role agents** page in the Web settings for adding, renaming,
editing, deleting, and restoring roles, and a watcher on the role directory so a
change reaches the next call without recomposing the profile.

## Use this package

### Install

```sh
# Install the bundle into each profile that will use it. Profiles are separate
# install roots, so one profile does not see another's.
dsh plugin --profile web add dsh-roles-zeta

# Restart the host. Bundle lists are read when a profile is composed.
```

That is the whole install. On the first load after the restart, the eight role
files are written to `$DSH_HOME/agents` (`$DSH_HOME` defaults to `~/.dsh`), and a
new session has a `delegate` tool whose description lists them. No preset copy, no
model table, and nothing to place by hand.

```sh
ls ~/.dsh/agents
# code-mapper-lite.md  explorer.md          log-distiller.md  triage.md
# deep-coordinator.md  hypothesis-debate.md reviewer.md       worker.md
# .seeded.json
```

The bundle also ships a browser half, so the Web profile needs the restart even
under `patchReload: live`; the host serves client bundles it found when the
profile was composed.

### Slash commands

Every loaded role is also a command in the Web input box. Type `/` to see them
listed with their `when` line next to the built-in `/plan`, `/goal`, and
`/compact`; `/reviewer look at lib/index.js` queues a turn that asks the agent
to call `delegate` with role `reviewer` and the text as the task, run it in the
foreground, and relay the result. The command does not start the child itself:
a handler runs outside any model turn, and a delegation whose result never
reaches the model is one nobody reports on, so the delegation stays in the
transcript as an ordinary tool call, where `/plan <message>` puts its message
too.

Commands follow the roster. A role added, renamed, or removed — from the
settings page or by editing the directory — re-registers the set, and the menu
refreshes on its own. A role whose id collides with a command another plugin
owns keeps working through the tool and is skipped as a command, with a log line
saying so. Set `commands: false` on the row to mount none, or `commandPrefix`
to put every role behind a prefix (`commandPrefix: "r-"` gives `/r-reviewer`).

### Settings page

Settings → **Role agents** lists the roster with a badge per role (shipped,
yours, edited) and edits one role at a time: id, the `when` line, the model
route with the session's allowed routes offered as suggestions, the reasoning
effort, the tool surface as a checklist of the tools registered right now (or
"inherit everything" plus the delegation toggle), and the persona. Saving writes
`<id>.md` into `$DSH_HOME/agents` — the same file you would write by hand — and
the tool, the commands, and the page pick it up at once.

The page also does the two things a role library needs beyond editing:

| Button | What it does on disk |
|---|---|
| Delete, on a role you added | Removes the file |
| Delete, on a shipped role | Replaces the file with a `disabled: true` stub, so the packaged copy stops loading; the role appears under *Disabled shipped roles* until restored |
| Restore this role | Copies the shipped file back over yours and hands it to the manifest as the package's own |
| Restore the shipped roles | The same for all eight; roles you added are never touched |

The page is a plain browser module over a few JSON routes under
`/__dsh/roles-zeta/`, gated by the same browser-session cookie and Host/Origin
fence as the rest of the Web API; a write must also be same-origin. Set
`settingsPage: false` to mount neither.

### Role files

A role is one Markdown file. Frontmatter carries the machine fields; the body is
the child's `deployment:persona-prefix` section.

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

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Role id; any `_` spelling resolves to the same role |
| `when` | yes | One line, rendered into the tool description as the model's menu |
| `route` | no | A model id (`deepseek-flash`) or an exact `provider/model`; see *How a route resolves* |
| `effort` | no | Effort in the role vocabulary, translated per route |
| `allow` | no | Global tool names the child keeps; omitted inherits everything |
| `delegation` | no | `true` keeps the delegation tools in a child that has no `allow` list |
| `disabled` | no | `true` removes a shipped role without needing a replacement body |

A role with an `allow` list cannot delegate unless the list names the delegation
tools. A role without one cannot delegate unless it sets `delegation: true`.
Delegation is opt-in because every source definition that is a leaf says so.

#### Where roles load from

Two roots, applied in this order, later winning:

1. **the package's own roster** — `<package>/roles/*.md`, the eight that ship;
2. **`$DSH_HOME/agents`** — your directory, `$DSH_HOME` defaulting to `~/.dsh`.

The package places its roster in your directory on first load, so the files are
where a dsh user looks for agent definitions, the same way `~/.codex/agents` and
`~/.claude/agents` work. They stay managed while you leave them alone:

| What you do | What happens on the next load |
|---|---|
| Nothing | Files this package wrote follow the package; a release that changes a role updates it |
| Edit one | It becomes yours and is never overwritten again |
| Delete one | It is not seeded again — but the packaged copy still loads, so the role stays available; remove the role itself with a `disabled` stub or the settings page |
| Add one of your own | It loads alongside the shipped roles |

The directory is watched. A file saved by hand, by the settings page, or by
anything else is re-read after a short quiet period, and the tool schema, the
slash commands, and the page follow; set `watchRolesDir: false` to read the
directory once per composition instead.

`.seeded.json` in that directory is the manifest that makes this work — it records
what the package wrote, not what you changed. Delete a line there to hand a file
back to the package, or delete it whole to let everything settle on the next load.

A file you drop in **replaces the shipped one by id** even when the package did not
write it. Remove a role you do not want at all with a stub carrying only an id:

```markdown
---
id: hypothesis-debate
disabled: true
---
```

A duplicate id inside one directory keeps the first file and warns; a `disabled`
stub always wins over a shipped role. Set `seedRolesDir: false` to keep the
package from writing into your directory at all — the two roots still load, so the
roster works and only your own files live there.

### Configuration

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

That is the whole thing. **No model and no path appears in this file**: role
files name their own route and the plugin resolves it.

| Field | Default | Meaning |
|---|---|---|
| `dshHome` | `$DSH_HOME`, else `~/.dsh` | Harness home the role directory is derived from |
| `rolesDir` | `$DSH_HOME/agents` | Your role directory: the seed target and the override root |
| `seedRolesDir` | `true` | Write the shipped roster into `rolesDir` on load, and keep it current while unedited |
| `watchRolesDir` | `true` | Reload the roster when a file in `rolesDir` changes |
| `commands` | `true` | Register one `/<id>` slash command per role where the command registry exists |
| `commandPrefix` | (empty) | Text placed before every role's command name |
| `settingsPage` | `true` | Mount the settings API and page where the web server exists |
| `provider` | `spawn` | `ctx.subagents` provider name |
| `toolName` | `delegate` | Model-facing tool name |
| `backgroundMode` | `continuable` | `continuable` returns a durable child id; `one-shot` returns a job id |
| `enableRunInBackground` | `true` | Expose `run_in_background` |
| `maxDepth` | `2` | Absolute delegation-depth cap for a started child |
| `defaultRoute` | (empty) | Only needed when a role names no `route:` |
| `routes` | `{}` | Optional alias table, for deployments that want indirection |

### How a route resolves

A role's `route:` may be a bare model id (`deepseek-flash`) or an exact
`provider/model`. Resolution order:

1. the row's `routes` alias table, when one is configured and names it;
2. **this Session's `subagent-model-selection` allowed routes** — the models you
   ticked in the DSH settings;
3. **the registered providers' model catalogs**, through `llm.listProviders()`
   and `llm.listModels()`;
4. an inline `model: { provider, model }` on the role file.

Step 3 is what removes the configuration: a profile with no settings surface
(headless) still resolves, because discovery does not depend on one. Tick the
models you want in DSH and the roles follow; move to another machine and this
file does not change.

When a session's allowed list IS enabled, it gates the role's declared route
too: a role naming a registered model that the list excludes is rejected with a
message saying so, rather than silently running outside the list.

**Nothing selects a route automatically.** With no `route:` in the role file, no
inline `model:`, no call-level `route`, and no `defaultRoute`, the child inherits
the calling agent's provider and model — the same default the built-in tool
applies — and the result carries a note. This plugin never chooses from the
allowed list on its own. The only thing that may pick from that list is the
model itself, by passing `provider` and `model` on the call.

A bare model id must be unambiguous. When one id is registered under two
providers — `kimi-k3` exists under both `moonshotai` and `alibabacloud` — write
`provider/model`, or the call is rejected with an explicit ambiguity error.

`routes` remains for deployments that want one level of indirection, so all eight
roles can say `route: deep` and this file decides what `deep` means here:

```yaml
        routes:
          deep: { provider: deepseek-official, model: deepseek-flash }
```

Effort is not configured at all. Each route's adapter advertises its own
reasoning levels through `LlmResolvedModelInfo.reasoning`, and the effort a role
declares is clamped onto them: `xhigh` lands on `max` where that exists and on
`high` where it does not. The vocabulary a role file may use is
`off`/`minimal`/`low`/`medium`/`high`/`xhigh`/`max`; a substitution is reported
in the delegation result.

A role may also carry an inline `model: { provider, model }` instead of an alias,
and a call may override both with its own `provider`/`model` — see below.

### Mounting

The row is host plane. It deliberately carries no `modelSelectionSettings`: a
standing composition with that flag needs a scoped preset Context and it would
collide with the `subagent` row that already owns the global
`list_subagent_models` name. The tool reaches the same setting through
`ctx.get('subagentModelSelection')` instead — when a session has one enabled,
`provider` and `model` become per-call parameters validated against that
session's live allowed list, so the model can choose a route exactly as the
built-in tool lets it.

Install it as a bundle into each profile that should have it. Profiles are
separate install roots — each has its own `package.json`, lockfile and
`node_modules`, and `dsh.profile.bundles` is per profile — so a bundle installed
into one is invisible to another. Install only the profiles you actually use.

A host-plane row is visible to every agent in every preset, so no preset copy is
needed; moving the row into your own preset instead scopes it to that preset.

```sh
# From npm.
dsh plugin --profile web add dsh-roles-zeta

# Straight from the repository, if you would rather track it directly.
dsh plugin --profile web add github:zeta987/dsh-roles-zeta

# From a local clone, while developing this plugin.
dsh plugin --profile web add file:./dsh-roles-zeta
```

`github:` and `file:` installs are copies, so edits to a clone reach the host
only after re-running the command. Use `link:` instead of `file:` only while
developing: `link:` symlinks the source directory, so Node resolves the package's
peer imports from the source's real path and needs a `node_modules` junction
beside it (see `.gitignore`).

Restart the profile's host after installing; additions to `dsh.profile.bundles`
are read when the profile is composed.

### Installing on another machine

```sh
dsh plugin --profile web add dsh-roles-zeta
# restart the host
```

Two commands, and the eight roles are live. Nothing has to be copied, and no
configuration needs editing: each role file already names its own `provider/model`,
and the plugin resolves those against whatever providers the target machine
registers. The only requirement is that the machine has those providers
configured and credentialed — and that your own `$DSH_HOME/agents`, if it exists,
does not shadow the shipped roles with files of its own.

If the target machine lacks a provider the shipped roles name, either change the
`route:` line in the roles you care about — copy them into `$DSH_HOME/agents`
first, so an upgrade does not overwrite the change — or add a `routes` alias
table to point all eight at once from one place.

## Model Experience

### Tool schema

One schema per session: a roster line per role and the session's currently
allowed routes inside the description. The parameters are `role` (an enum of the
loaded ids), `description`, `prompt`, an optional `route` enum, an optional
`provider`/`model` pair when the session enables subagent model selection, and
`run_in_background` when background runs are enabled.

### Delegation

A call resolves the role file, preflights the route, narrows the tool filter
against the live registry, and starts one child. The child receives the role
body as its persona prefix, so it replaces the deployment persona prefix for that
child alone while the preset's suffix still applies. The child also joins its
parent's preset, so it inherits the parent's tool set minus whatever the role
filter removed.

A foreground call returns the child's final text. A continuable background call
returns `started subagent <id>` and settles through the runtime's notice.

## Known Limitations

- **A preset's delegation tools survive a role's `allow` list.** Under a preset
  whose `subagent` row sets `modelSelectionSettings: true`, that row installs
  itself per Agent (`agent/created` re-registers it in the agent's own scope),
  and `tools.restrict()` deliberately never filters a scope's own layer.
  Measured: a role allowing six tools received eight in the web profile
  (`subagent` and `list_subagent_models` leaked) and exactly six in headless,
  where the same row is host plane. A read-only role in the web profile can
  therefore still start a child of its own; the persona says not to, but the
  filter cannot enforce it. Enforcing it means copying the preset and clearing
  `modelSelectionSettings` on its `subagent` row, which also removes
  `list_subagent_models` and the call-time route parameters.
- **A role cannot change the deployment's workspace instruction chain.** Every
  child loads the same `AGENTS.md`/`CLAUDE.md` chain as its parent, so a global
  tone rule can outrank a role's own style instructions.
- **No per-call route policy.** Roles route through configured `agentOptions`,
  so the session's `subagent-model-selection` allow-list does not bound them; the
  LLM adapter preflight is the check that does apply.
- **The registry probe is advisory.** The tool filter is built from
  `ctx.tools.schemas(agent)`. A rejection from `tools.restrict()` narrows the
  filter and retries up to three times, so a stale name costs one failed start
  rather than a failed delegation.
- **A slash command is a request, not a guarantee.** `/reviewer <task>` queues a
  turn that tells the agent to delegate; the model performs the call, so a
  model that ignores the instruction has not delegated. The transcript shows
  which happened.
- **The settings page edits files, not sessions.** A role a running child was
  started from is unaffected by a later edit; the next start reads the new file.
- **No per-role memory.** The plugin owns no memory store and injects none.
