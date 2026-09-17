English | [繁體中文](README.zh-TW.md) | [简体中文](README.zh-CN.md)

# dsh-roles-zeta

`dsh-roles-zeta` gives a dsh agent one `delegate` tool and a folder of role
files. A call names a role; the role file supplies the child's persona, model
route, reasoning effort, and tool surface. It sits on the same `ctx.subagents`
service the built-in `subagent` tool uses, so providers, delegation depth,
continuation, and background settlement keep working unchanged. The built-in
`subagent` and `subagent_fork` tools stay mounted: they let the model pick a
route per call, while a role is fixed when the file is written.

Around the tool sit three surfaces, each mounted only where its host service
exists: one slash command per role in the Web input box, a **Role agents**
page in the Web settings, and a watcher on the role directory so an edit
reaches the next call without recomposing the profile.

## Install

```sh
dsh plugin --profile web add dsh-roles-zeta
# restart the host
```

Profiles are separate install roots, so install into each profile that should
have it. `github:zeta987/dsh-roles-zeta` and `file:<path>` specs work too. On
the first load the eight role files are written to `$DSH_HOME/agents`
(`$DSH_HOME` defaults to `~/.dsh`), and a new session has a `delegate` tool
whose description lists them.

```
~/.dsh/agents
├── code-mapper-lite.md   explorer.md            log-distiller.md   triage.md
├── deep-coordinator.md   hypothesis-debate.md   reviewer.md        worker.md
└── .seeded.json
```

### Updating

Nothing updates on its own: `dsh plugin` forwards to pnpm inside the profile,
starting the host installs nothing, and no page checks a registry. To move to
a release:

```sh
dsh plugin --profile web add dsh-roles-zeta@0.4.0
# restart the host
```

Name the version. `update` stays inside the `^0.x` range pnpm wrote at install
time, and pnpm 11+ hides a version published less than 24 hours ago from
`outdated` and `@latest` (`minimumReleaseAge`); an explicit version installs
right away. Role files you edited are left alone; shipped ones you never
touched are refreshed on the next load.

## Slash commands

Every loaded role is a command in the Web input box. Type `/` to see them next
to `/plan` and `/goal`; `/reviewer look at lib/index.js` queues a turn asking
the agent to call `delegate` with role `reviewer` and that text as the task,
run it in the foreground, and relay the result. The delegation therefore stays
in the transcript as an ordinary tool call, where `/plan <message>` puts its
message too.

Commands follow the roster: adding, renaming, or removing a role re-registers
them and the menu refreshes. A role whose id collides with another plugin's
command is skipped as a command (logged) and still works through the tool.
`commands: false` mounts none; `commandPrefix: "r-"` gives `/r-reviewer`.

## Settings page

Settings → **Role agents** lists the roster with a badge per role (shipped,
yours, edited) and edits one role at a time: id, the `when` line, the route
(with the session's allowed routes as suggestions), the effort, the tools as a
checklist of what is registered right now (or "inherit everything" plus the
delegation toggle), and the persona. Saving writes `<id>.md` into
`$DSH_HOME/agents`, the same file you would write by hand.

| Button | On disk |
|---|---|
| Delete, on a role you added | Removes the file |
| Delete, on a shipped role | Leaves a `disabled: true` stub so the packaged copy stops loading; listed under *Disabled shipped roles* until restored |
| Restore this role | Copies the shipped file back over yours |
| Restore the shipped roles | The same for all eight; roles you added are never touched |

The page is a browser module over JSON routes under `/__dsh/roles-zeta/`,
gated by the same browser-session cookie and Host/Origin fence as the rest of
the Web API. `settingsPage: false` mounts neither.

## Role files

One Markdown file per role: frontmatter for the machine fields, body as the
child's persona prefix.

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
| `id` | yes | Role id; the `_` spelling resolves to the same role |
| `when` | yes | One line; the model's menu entry and the command description |
| `route` | no | A model id (`deepseek-flash`) or an exact `provider/model` |
| `effort` | no | `off`/`minimal`/`low`/`medium`/`high`/`xhigh`/`max`, clamped per route |
| `allow` | no | Tool names the child keeps; omitted inherits everything |
| `delegation` | no | `true` keeps the delegation tools in a child without an `allow` list |
| `disabled` | no | `true` removes a shipped role |

A role with an `allow` list can delegate only if the list names the delegation
tools; one without an `allow` list only with `delegation: true`.

### Where roles load from

Two roots, later winning: the package's own `roles/*.md`, then
`$DSH_HOME/agents`. The package seeds its roster into your directory on first
load and keeps it managed while you leave it alone:

| What you do | Next load |
|---|---|
| Nothing | Shipped files follow the package; a release that changes a role updates it |
| Edit one | It is yours and is never overwritten again |
| Delete one | It is not seeded again, but the packaged copy still loads; remove the role itself with a `disabled` stub or the settings page |
| Add one | It loads alongside the shipped roles |

`.seeded.json` records what the package wrote. A file you drop in replaces the
shipped role by id; a stub with only `id` and `disabled: true` removes it. The
directory is watched, so any change is re-read after a short quiet period.
`seedRolesDir: false` stops the package from writing into your directory;
`watchRolesDir: false` reads it once per composition.

## Configuration

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

No model and no path appears here: role files name their route and the plugin
resolves it. The row is host plane, so every agent in every preset sees the
tool.

| Field | Default | Meaning |
|---|---|---|
| `dshHome` | `$DSH_HOME`, else `~/.dsh` | Harness home the role directory is derived from |
| `rolesDir` | `$DSH_HOME/agents` | Your role directory: seed target and override root |
| `seedRolesDir` | `true` | Write the shipped roster into `rolesDir` and keep it current while unedited |
| `watchRolesDir` | `true` | Reload the roster when a file in `rolesDir` changes |
| `commands` | `true` | One `/<id>` slash command per role |
| `commandPrefix` | (empty) | Text placed before every command name |
| `settingsPage` | `true` | Mount the settings API and page |
| `provider` | `spawn` | `ctx.subagents` provider name |
| `toolName` | `delegate` | Model-facing tool name |
| `backgroundMode` | `continuable` | `continuable` returns a durable child id; `one-shot` a job id |
| `enableRunInBackground` | `true` | Expose `run_in_background` |
| `maxDepth` | `2` | Delegation-depth cap for a started child |
| `defaultRoute` | (empty) | Used when a role names no `route:` |
| `routes` | `{}` | Alias table: `deep: { provider: deepseek-official, model: deepseek-flash }` lets roles say `route: deep` |

## How a route resolves

A `route:` is looked up in this order: the row's `routes` aliases; the
session's `subagent-model-selection` allowed list (the models ticked in the
DSH settings); the registered providers' catalogs; an inline
`model: { provider, model }` on the role. The catalog step is what lets a
headless profile resolve without any settings surface. When the allowed list
is enabled it also gates the role's route: a registered model the list
excludes is rejected with a message, not run quietly.

With no route named anywhere the child inherits the calling agent's provider
and model, and the result says so; the plugin never picks from the allowed
list by itself. A bare model id registered under two providers must be written
as `provider/model`.

Effort is clamped onto the levels the route advertises, the higher one on a
tie: `deepseek-flash` offers `off`/`low`/`high`/`max`, so `medium` becomes
`high` and `xhigh` becomes `max`. The shipped roles all say `high`. A
substitution is reported in the delegation result.

## What the model sees

One tool schema per session: a roster line per role and the allowed routes in
the description; parameters `role`, `description`, `prompt`, an optional
`route` alias, `provider`/`model` when the session enables model selection,
and `run_in_background`. A call resolves the role, preflights the route,
narrows the tool filter against the live registry, and starts one child whose
persona prefix is the role body. A foreground call returns the child's final
text; a continuable background call returns `started subagent <id>` and
settles through the runtime's notice.

## Known limitations

- **A preset's delegation tools survive a role's `allow` list.** Under a preset
  whose `subagent` row sets `modelSelectionSettings: true`, that row installs
  itself per agent, and `tools.restrict()` never filters a scope's own layer:
  a role allowing six tools received eight in the web profile (`subagent` and
  `list_subagent_models` leaked) and six in headless. A read-only role in the
  web profile can still start a child; the persona says not to, the filter
  cannot enforce it.
- **A role cannot change the workspace instruction chain.** Every child loads
  the same `AGENTS.md`/`CLAUDE.md` chain as its parent.
- **The registry probe is advisory.** A `tools.restrict()` rejection narrows
  the filter and retries up to three times, so a stale name costs one failed
  start.
- **A slash command is a request, not a guarantee.** The model performs the
  delegation; the transcript shows whether it did.
- **The settings page edits files, not sessions.** A running child is
  unaffected by a later edit; the next start reads the new file.
- **No per-role memory.**
