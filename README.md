---
description: "Role-based subagent delegation for DeepSeek Harness: one `delegate` tool over a folder of role files, for users who keep a roster of specialist subagents."
kind: "package-reference"
---

# dsh-role-agents

English | [繁體中文](README.zh-TW.md)

## Summary

`dsh-role-agents` gives a dsh agent one `delegate` tool and a folder of role
files. A call names a role; the role file supplies that child's persona, its
model route, its reasoning effort, and its tool surface. It is a thin layer over
the same `ctx.subagents` service the built-in `subagent` tool uses, so providers,
delegation depth, durable descriptors, continuation, the subagent catalog, and
background settlement notices all keep working unchanged.

The built-in `subagent` and `subagent_fork` tools are not replaced and should
stay mounted. They answer a different question: they let the model pick a route
per call from the session's allowed list, while a role is a binding fixed when
the file is written.

## Use this package

### Role files

One Markdown file per role under the configured directory (`~/.dsh/agents` by
default). Frontmatter carries the machine fields; the body is the child's
`deployment:persona-prefix` section.

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

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Role id; any `_` spelling resolves to the same role |
| `when` | yes | One line, rendered into the tool description as the model's menu |
| `route` | no | A model id (`deepseek-flash`) or an exact `provider/model`; see *How a route resolves* |
| `effort` | no | Effort in the role vocabulary, translated per route |
| `allow` | no | Global tool names the child keeps; omitted inherits everything |
| `delegation` | no | `true` keeps the delegation tools in a child that has no `allow` list |

A role with an `allow` list cannot delegate unless the list names the delegation
tools. A role without one cannot delegate unless it sets `delegation: true`.
Delegation is opt-in because every source definition that is a leaf says so.

### Configuration

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

That is the whole thing. **No model and no path appears in this file**: role
files name their own route and the plugin resolves it.

| Field | Default | Meaning |
|---|---|---|
| `dshHome` | `$DSH_HOME`, else `~/.dsh` | Harness home the role directory is derived from |
| `rolesDir` | `<dshHome>/agents` | Directory scanned for `*.md` role files |
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
# From a git host. pnpm materializes real files inside the profile, so the
# package's own peer imports resolve from the profile's node_modules.
dsh plugin --profile web add github:<owner>/<repo>

# From a registry, public or private (scoped name).
dsh plugin --profile web add @<scope>/dsh-role-agents

# From a cloned or copied directory: `file:` copies it in (same property).
dsh plugin --profile web add file:<path to this directory>
```

Use `link:` instead of `file:` only while developing the plugin: `link:`
symlinks the source directory, so Node resolves the package's peer imports from
the source's real path and needs a `node_modules` junction beside it (see
`.gitignore`). `file:`, git and registry installs are copies, so edits reach the
host only after re-running the command.

Restart the profile's host after installing; additions to `dsh.profile.bundles`
are read when the profile is composed.

### Installing on another machine

```sh
# 1. Get the package there (clone, copy, or a registry install).

# 2. Install it into each profile you use.
dsh plugin --profile web add github:<owner>/<repo>

# 3. Put the role files where the plugin looks for them.
#    Copy examples/roles/*.md from this repository into <dshHome>/agents/
#    ($DSH_HOME, else ~/.dsh). Create the directory if it does not exist.

# 4. Restart the host.
```

**No configuration needs editing.** Each role file already names its own
`provider/model`, and the plugin resolves those against whatever providers the
target machine registers, so the only requirement is that the machine has those
providers configured and credentialed. If it does not, change the `route:` line
in the affected role files, or add a `routes` alias table to point all eight at
once.

### Publishing

The package is publishable as-is; `files` already limits the tarball to `lib`,
`examples`, the patch, both READMEs and the license, and
`publishConfig.access` is `public`. Verify before publishing:

```sh
npm pack --dry-run
npm publish
```

The scope is coupled to the bundle patch: the row's `name` is the package's own
name, so republishing under a different scope means editing both `package.json`
and `cordis.patch.yml`. Reinstalling after a rename is required — pnpm keys the
dependency by the package name, and `dsh.profile.bundles` follows that key:

```sh
dsh plugin --profile web add <new specifier>
dsh plugin --profile web remove <old package name>
```

The repository lives at `github.com/zeta987/dsh-role-agents` and carries the
community topics `dsh-plugin`, `dsh`, `deepseek-harness`, `cordis`, `ai-agents`,
`subagent`, and `multi-agent` — the first three are the convention every dsh
plugin repo shares. `dsh-plugin` is what makes a plugin discoverable at
<https://github.com/topics/dsh-plugin>.

To publish it privately instead, set `publishConfig` to
`{ "access": "restricted" }` on npmjs (needs a paid plan), or point it at
GitHub Packages with `"registry": "https://npm.pkg.github.com"` and an `.npmrc`
carrying `//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}`. A machine installing
from GitHub Packages needs the same scoped registry line, because `dsh plugin`
forwards straight to pnpm in the profile directory and pnpm reads `.npmrc` from
there or from the user's home.

`peerDependencies` are marked optional so neither npm nor pnpm tries to install a
second copy of the harness packages; they resolve from the profile's own
`node_modules`.

Restart the profile's host after installing; additions to `dsh.profile.bundles`
are read when the profile is composed.

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
- **Role files are read at plugin apply time.** Editing one reaches new sessions
  after the host composes the profile again; there is no watcher.
- **No per-role memory.** The plugin owns no memory store and injects none.
