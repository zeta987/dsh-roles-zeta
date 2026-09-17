/**
 * The dsh-roles-zeta plugin entry.
 *
 * One model-facing `delegate` tool over the host `ctx.subagents` seam. A call
 * names a role; the role file supplies the child's persona, its route, its
 * effort, and its tool surface. The tool itself owns nothing: it resolves a
 * role file against the live registry and hands a complete `SubagentStartRequest`
 * to the same provider the built-in `subagent` tool uses.
 *
 * This row is host plane, so it carries no `modelSelectionSettings`: a standing
 * composition with that flag needs a scoped preset Context and the web-only
 * `subagentModelSelection` service, and it would collide with the `subagent` row
 * that already owns the global `list_subagent_models` name. Routes travel as
 * per-child `agentOptions` instead.
 *
 * @module dsh-roles-zeta
 */

import { join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { loadRoles, normalizeRoleId } from './roles.js'
import {
  resolveRouteAlias,
  resolveInlineModel,
  matchRoute,
  allowedRoutes,
  routeIsAllowed,
  chooseEffort,
} from './routes.js'
import { buildToolFilter, dropFilterNames, unknownNamesFromError } from './filter.js'

export const name = 'roles-zeta'
export const inject = ['tools', 'subagents']

/** The tools that let a child start further children. */
const DELEGATION_TOOLS = ['subagent', 'subagent_fork', 'workflow', 'ralph']

/** How many times one start is retried after a stale tool name is reported. */
const MAX_FILTER_RETRIES = 3

/** Role directory name under the harness home. */
const ROLES_DIR_NAME = 'agents'

/** Default configuration, overridden by the bundle row's `config`. */
const DEFAULTS = {
  dshHome: '',
  rolesDir: '',
  provider: 'spawn',
  toolName: 'delegate',
  backgroundMode: 'continuable',
  enableRunInBackground: true,
  maxDepth: 2,
  defaultRoute: '',
  routes: {},
}

/**
 * Resolve the effective configuration.
 *
 * `rolesDir` defaults to `<dshHome>/agents`, so the bundle row names no machine
 * path and the same patch works on every install.
 */
function normalizeConfig(config) {
  const merged = { ...DEFAULTS, ...(config ?? {}) }
  const dshHome = resolveDshHome(merged.dshHome === '' ? undefined : merged.dshHome)
  const rolesDir = merged.rolesDir === '' ? join(dshHome, ROLES_DIR_NAME) : merged.rolesDir
  return {
    ...merged,
    dshHome,
    rolesDir,
    routes: merged.routes ?? {},
    toolName: String(merged.toolName),
    provider: String(merged.provider),
  }
}

/**
 * The global tool names one agent can currently see.
 *
 * `tools.restrict()` rejects unknown names inside the child's creation window,
 * so the filter is built from the live registry rather than from what a role
 * file asserts. A registry read that fails yields undefined, and the start
 * retry path then learns the names from the restrict rejection instead.
 * @param ctx - plugin context.
 * @param agent - the calling agent, which is the viewing scope.
 * @returns the visible names, or undefined when the registry could not answer.
 */
function knownToolNames(ctx, agent) {
  try {
    const schemas = ctx.tools.schemas(agent)
    if (Array.isArray(schemas) && schemas.length > 0) {
      return new Set(schemas.map((schema) => schema.name))
    }
  } catch {
    // Fall through: the retry path handles it.
  }
  return undefined
}

/** Join the non-empty text blocks of a child result. */
function outputText(output) {
  if (!Array.isArray(output)) return ''
  return output
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
}

/** State the roster in the tool description, which is the model's only menu. */
function buildDescription(roles, routeAliases, allowed) {
  const roster = [...roles.values()].map((role) => `- ${role.id}: ${role.when}`).join('\n')
  const lines = [
    'Delegate one self-contained task to a named role and return its result.',
    'Each role carries its own instructions, model route, reasoning effort, and tool surface;',
    'the child does not see this conversation, so the prompt must stand alone.',
    '',
    'Roles:',
    roster,
  ]
  if (routeAliases.length > 0) {
    lines.push(
      '',
      `Route aliases: ${routeAliases.join(', ')}. Omit "route" to use the role's own route.`,
    )
  }
  if (allowed !== undefined) {
    lines.push(
      '',
      'This Session also allows the model to choose the child route per call. Supply',
      '`provider` and `model` together, drawn from this Session\'s allowed routes:',
      ...allowed.map((route) => `- ${route.provider}/${route.model}`),
    )
  }
  return lines.join('\n')
}

/** Assert the provider can enforce everything this row configures. */
function assertProvider(provider, settings, needsToolFilter) {
  const label = `roles-zeta: provider "${provider.name}"`
  if (!provider.capabilities.persona) {
    throw new Error(`${label} cannot apply a role persona (no persona capability)`)
  }
  if (typeof settings.maxDepth === 'number' && !provider.capabilities.depthLimit) {
    throw new Error(`${label} cannot enforce maxDepth (no depthLimit capability)`)
  }
  if (needsToolFilter && !provider.capabilities.toolFilter) {
    throw new Error(`${label} cannot scope a child's tools (no toolFilter capability)`)
  }
  if (settings.backgroundMode === 'continuable' && provider.prepareContinuable === undefined) {
    throw new Error(`${label} does not support backgroundMode "continuable"`)
  }
}

/**
 * Install the delegation tool over one provider.
 * @param ctx - plugin context.
 * @param config - the bundle row's config.
 */
export function apply(ctx, config) {
  const settings = normalizeConfig(config)
  const { roles, aliases, warnings } = loadRoles(settings.rolesDir)
  for (const warning of warnings) ctx.logger?.warn?.(`roles-zeta: ${warning}`)

  if (roles.size === 0) {
    ctx.logger?.warn?.(
      `roles-zeta: no roles loaded from "${settings.rolesDir}"; "${settings.toolName}" is not registered`,
    )
    return
  }

  const roleIds = [...roles.keys()]
  const routeAliases = Object.keys(settings.routes)
  const continuable = settings.backgroundMode === 'continuable'
  const backgroundEnabled = settings.enableRunInBackground !== false
  const needsToolFilter = [...roles.values()].some(
    (role) => role.allow !== undefined || role.delegation !== true,
  )

  // The session's own allowed-model list, read live from the host service the
  // built-in `subagent` row uses. It is absent in profiles that mount no
  // settings surface (headless), where the configured aliases are the only menu.
  const selectionService = ctx.get('subagentModelSelection')
  const allowedForDescription = allowedRoutes(selectionService)

  /** Resolve one role id, accepting the underscore spelling of any id. */
  const findRole = (requested) => {
    const normalized = normalizeRoleId(requested)
    if (roles.has(normalized)) return roles.get(normalized)
    const alias = aliases.get(normalized)
    return alias === undefined ? undefined : roles.get(alias)
  }

  // Every route this deployment can name, discovered from the live LLM runtime
  // and cached for the life of the composition. It is consulted only when a role
  // names a model that the Session's own allowed list does not already answer,
  // which is the headless case where no settings surface is mounted.
  let discoveredRoutes
  const routeCandidates = async () => {
    const live = allowedRoutes(selectionService)
    if (live !== undefined) return { candidates: live, source: "this Session's allowed subagent models", restricted: true }
    const discovered = await registeredRoutes()
    return { candidates: discovered, source: 'the registered providers', restricted: false }
  }

  /** Every provider/model pair the registered adapters advertise. */
  const registeredRoutes = async () => {
    if (discoveredRoutes !== undefined) return discoveredRoutes

    const llm = ctx.get('llm')
    if (llm === undefined || typeof llm.listProviders !== 'function' || typeof llm.listModels !== 'function') {
      discoveredRoutes = []
      return discoveredRoutes
    }
    const found = []
    for (const provider of llm.listProviders()) {
      try {
        for (const model of await llm.listModels(provider.id)) {
          found.push({ provider: provider.id, model: model.id })
        }
      } catch {
        // A provider that cannot enumerate its catalog contributes nothing.
      }
    }
    discoveredRoutes = found
    return discoveredRoutes
  }

  /**
   * Resolve one role- or call-supplied route name.
   *
   * The row's alias table wins when it names one, so a deployment that wants
   * indirection keeps it; otherwise the name is matched against the Session's
   * allowed routes and then the registered provider catalogs. That is what lets
   * a role say `deepseek-flash` and need no per-machine configuration.
   */
  const resolveNamedRoute = async (name) => {
    const configured = resolveRouteAlias(settings.routes, name)
    if (configured !== undefined) return configured

    const { candidates, source, restricted } = await routeCandidates()
    const matched = matchRoute(candidates, name)
    if (matched.route !== undefined) {
      return { provider: matched.route.provider, model: matched.route.model, alias: name }
    }
    if (matched.matches > 1) {
      throw new Error(
        `route "${name}" matches ${matched.matches} providers; write it as provider/model`,
      )
    }
    // Distinguish "this deployment does not have it" from "your own settings
    // exclude it", because the fix is in a different place for each.
    const registered = await registeredRoutes()
    if (restricted && matchRoute(registered, name).route !== undefined) {
      throw new Error(
        `route "${name}" is registered but not among this Session's allowed subagent models; ` +
          'add it in the DSH settings or remove it from the allow-list',
      )
    }
    throw new Error(
      `route "${name}" is neither a configured alias nor available from ${source}. ` +
        'Name a registered provider/model pair, or add it to the row\'s `routes` table.',
    )
  }

  /** Resolve the route, the effort, and the tool filter for one call. */
  const prepare = async (args, exec) => {
    const role = findRole(args.role)
    if (role === undefined) {
      throw new Error(`unknown role "${args.role}"; available roles: ${roleIds.join(', ')}`)
    }

    // The session's live allowed list, re-read per call: a settings edit must
    // not be able to route a child onto a model the current list forbids.
    const allowed = allowedRoutes(selectionService)
    const notes = []

    let route
    if (args.provider !== undefined || args.model !== undefined) {
      if (args.provider === undefined || args.model === undefined) {
        throw new Error('child LLM `provider` and `model` must be supplied together')
      }
      if (allowed === undefined) {
        throw new Error(
          'this Session exposes no subagent model selection, so a per-call provider/model ' +
            'cannot be validated; use the route the role names instead',
        )
      }
      if (!routeIsAllowed(allowed, args.provider, args.model)) {
        throw new Error(
          `route "${args.provider}/${args.model}" is not allowed for this Session; allowed: ` +
            allowed.map((entry) => `${entry.provider}/${entry.model}`).join(', '),
        )
      }
      route = { provider: args.provider, model: args.model, alias: `${args.provider}/${args.model}` }
    } else {
      const inline = resolveInlineModel(role.inlineModel)
      if (inline !== undefined) route = inline
      else {
        const named =
          args.route ?? role.route ?? (settings.defaultRoute === '' ? undefined : settings.defaultRoute)
        if (named !== undefined) route = await resolveNamedRoute(named)
        else {
          // Nothing named a route, so the child inherits the caller's provider
          // and model — the same default the built-in tool applies when a
          // delegation names no model. This plugin never selects from the
          // session's allowed list on its own; only the model may, by passing
          // `provider` and `model` on the call.
          notes.push("no route named; the child inherits the calling agent's provider and model")
          if (role.effort !== undefined) {
            notes.push(`effort "${role.effort}" was not applied because no route was named`)
          }
        }
      }
    }

    // The adapter, not this plugin, owns the effort vocabulary for a route.
    const llm = ctx.get('llm')
    let effort = route === undefined ? undefined : role.effort
    if (route !== undefined && llm !== undefined && typeof llm.resolveModelInfo === 'function') {
      try {
        const info = await llm.resolveModelInfo(route.provider, route.model, exec.signal)
        const chosen = chooseEffort(role.effort, info?.reasoning?.efforts)
        effort = chosen.effort
        if (chosen.substituted !== undefined) notes.push(chosen.substituted)
      } catch (error) {
        throw new Error(`route ${route.provider}/${route.model} is not usable: ${error.message}`)
      }
    }

    if (route !== undefined && llm !== undefined && typeof llm.resolveCallConfig === 'function') {
      try {
        await llm.resolveCallConfig(
          {
            provider: route.provider,
            model: route.model,
            ...(effort === undefined ? {} : { reasoningEffort: effort }),
          },
          exec.signal,
        )
      } catch (error) {
        throw new Error(`route ${route.provider}/${route.model} is not usable: ${error.message}`)
      }
    }

    const known = knownToolNames(ctx, exec.agent)
    let filter
    if (known === undefined) {
      filter = role.allow === undefined ? undefined : { allow: [...role.allow] }
      notes.push('could not read the tool registry; the role tool list was passed through unverified')
    } else {
      const built = buildToolFilter(role, known, [settings.toolName, ...DELEGATION_TOOLS])
      if (built.collapsed) {
        filter = { allow: [...role.allow] }
        notes.push(
          `none of the role's declared tools resolved against this plugin's registry view; ` +
            `passing them through: ${role.allow.join(', ')}`,
        )
      } else {
        filter = built.filter
        if (built.dropped.length > 0) {
          notes.push(`tools unavailable here: ${built.dropped.join(', ')}`)
        }
      }
    }

    return {
      role,
      notes,
      filter,
      base: {
        prompt: [{ type: 'text', text: args.prompt }],
        parent: exec.agent,
        persona: role.persona,
        // Omitting agentOptions entirely is what makes the child inherit the
        // caller's route; passing an empty object would be a different thing.
        ...(route === undefined
          ? {}
          : {
              agentOptions: {
                provider: route.provider,
                model: route.model,
                ...(effort === undefined ? {} : { reasoningEffort: effort }),
              },
            }),
        ...(settings.maxDepth === undefined ? {} : { maxDepth: settings.maxDepth }),
      },
    }
  }

  /**
   * Start one child, dropping tool names the provider reports as unregistered.
   *
   * The filter is built from this plugin's view of the registry, which is not
   * guaranteed to be the view the child's restrict call is validated against. A
   * rejection therefore narrows the filter and retries rather than failing the
   * delegation; a rejected start cleans its unpublished resources, so retrying
   * is safe.
   */
  const startWithRetry = async (prepared, start) => {
    let filter = prepared.filter
    for (let attempt = 0; ; attempt += 1) {
      const request = { ...prepared.base, ...(filter === undefined ? {} : { toolFilter: filter }) }
      try {
        return await start(request)
      } catch (error) {
        const unknown = unknownNamesFromError(error?.message)
        if (attempt >= MAX_FILTER_RETRIES || unknown.length === 0 || filter === undefined) throw error
        const narrowed = dropFilterNames(filter, unknown)
        if (narrowed.error !== undefined) throw new Error(narrowed.error)
        filter = narrowed.filter
        prepared.notes.push(`dropped unregistered tools: ${unknown.join(', ')}`)
      }
    }
  }

  const appendNotes = (text, notes) =>
    notes.length === 0 ? text : `${text}\n\n[roles-zeta] ${notes.join('; ')}`

  const tool = defineTool({
    name: settings.toolName,
    description: buildDescription(roles, routeAliases, allowedForDescription),
    parameters: {
      role: {
        type: 'string',
        required: true,
        enum: roleIds,
        description: `Role id. One of: ${roleIds.join(', ')}.`,
      },
      description: {
        type: 'string',
        required: true,
        description: 'A short (3-5 word) description of the delegated task, for display.',
      },
      prompt: {
        type: 'string',
        required: true,
        description:
          'The complete, self-contained task for that role. It does not see this conversation.',
      },
      ...(routeAliases.length === 0
        ? {}
        : {
            route: {
              type: 'string',
              enum: routeAliases,
              description: `Route alias overriding the role's own route. One of: ${routeAliases.join(', ')}.`,
            },
          }),
      ...(allowedForDescription === undefined
        ? {}
        : {
            provider: {
              type: 'string',
              description:
                'Child LLM provider, chosen per call from this Session\'s allowed routes. ' +
                'Supply together with `model`, and omit both to use the route the role names.',
            },
            model: {
              type: 'string',
              description:
                'Child LLM model id interpreted by `provider`. Supply together with `provider`.',
            },
          }),
      ...(backgroundEnabled
        ? {
            run_in_background: {
              type: 'boolean',
              description: continuable
                ? 'Whether to run in the background and return a durable subagent id immediately. Defaults to true. Set false to wait for the result when your next action depends on it.'
                : 'Whether to run as a background job and return its id. Defaults to false; collect with job_output or stop with job_kill.',
            },
          }
        : {}),
    },
    output: {
      schema: { type: 'string' },
      render: (_args, result) => [{ type: 'text', text: result }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      if (exec.agent === undefined) {
        throw new Error(`"${settings.toolName}" requires a calling agent (exec.agent was undefined)`)
      }
      const prepared = await prepare(args, exec)
      const label = args.description
      const wantsBackground = args.run_in_background ?? continuable

      if (wantsBackground && continuable) {
        const started = await startWithRetry(prepared, (request) =>
          ctx.subagents.startContinuable({
            provider: settings.provider,
            label,
            request,
            signal: exec.signal,
          }),
        )
        return appendNotes(
          `started subagent ${started.childId} (role ${prepared.role.id})`,
          prepared.notes,
        )
      }

      if (wantsBackground) {
        const jobs = ctx.get('jobs')
        if (jobs === undefined) {
          throw new Error('background delegation needs the jobs registry (@deepseek-ai/dsh-jobs)')
        }
        const jobId = jobs.start({
          kind: 'subagent',
          label,
          owner: exec.agent,
          run: () => {
            const controller = new AbortController()
            return {
              cancel: (reason) => controller.abort(reason ?? 'background role task killed'),
              done: (async () => {
                let run
                try {
                  run = await ctx.subagents.start(settings.provider, {
                    ...prepared.base,
                    ...(prepared.filter === undefined ? {} : { toolFilter: prepared.filter }),
                    label,
                    signal: controller.signal,
                  })
                  const result = await run.result
                  const text = outputText(result.output)
                  if (result.stopReason !== 'completed') {
                    return {
                      status: 'failed',
                      detail:
                        `${result.stopReason}` +
                        (result.diagnostic === undefined ? '' : `: ${result.diagnostic}`) +
                        (text === '' ? '' : `\n\n${text}`),
                    }
                  }
                  return { status: 'completed', detail: text }
                } catch (error) {
                  return controller.signal.aborted
                    ? { status: 'killed' }
                    : { status: 'failed', detail: error?.message ?? String(error) }
                } finally {
                  await run?.dispose?.()
                }
              })(),
            }
          },
        })
        return appendNotes(
          `started background subagent job ${jobId} (role ${prepared.role.id})`,
          prepared.notes,
        )
      }

      const run = await startWithRetry(prepared, (request) =>
        ctx.subagents.start(settings.provider, { ...request, label, signal: exec.signal }),
      )
      try {
        const result = await run.result
        const text = outputText(result.output)
        if (result.stopReason !== 'completed') {
          throw new Error(
            `role "${prepared.role.id}" ended as ${result.stopReason}` +
              (result.diagnostic === undefined ? '' : `: ${result.diagnostic}`) +
              (text === '' ? '' : `\n\npartial output:\n${text}`),
          )
        }
        return appendNotes(text, prepared.notes)
      } finally {
        await run.dispose()
      }
    },
  })

  let mounted
  const mount = (provider) => {
    assertProvider(provider, settings, needsToolFilter)
    mounted = { provider, dispose: ctx.tools.register(tool) }
    ctx.logger?.info?.(
      `roles-zeta: registered "${settings.toolName}" over provider "${provider.name}" ` +
        `with ${roleIds.length} roles`,
    )
  }

  ctx.on('subagent/provider-added', (provider) => {
    if (provider.name === settings.provider && mounted === undefined) mount(provider)
  })
  ctx.on('subagent/provider-removed', (providerName) => {
    if (providerName !== settings.provider || mounted === undefined) return
    mounted.dispose()
    mounted = undefined
  })

  const present = ctx.subagents.getProvider(settings.provider)
  if (present !== undefined) mount(present)
  else {
    ctx.logger?.info?.(
      `roles-zeta: subagent provider "${settings.provider}" is not registered yet; ` +
        `"${settings.toolName}" registers when it appears`,
    )
  }
}
