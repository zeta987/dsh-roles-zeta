/**
 * Route resolution.
 *
 * A role names where its child should run, in one of four ways, resolved in this
 * order:
 *
 * 1. the call's own `provider`/`model`, validated against the session's live
 *    `subagent-model-selection` list;
 * 2. the role's `route` alias, looked up in the bundle row's `routes` table;
 * 3. a `model:` mapping declared inline on the role;
 * 4. the row's `defaultRoute`.
 *
 * The alias table exists because a permission list is not a binding: the
 * session's allowed models say which routes the MODEL may pick from at call
 * time, while a role still needs one fixed answer for "where does the reviewer
 * run". Two aliases keep that decision in one place instead of eight role files.
 *
 * Effort is never table-driven. A route's adapter advertises its own reasoning
 * levels through `LlmResolvedModelInfo.reasoning`, so a requested effort is
 * clamped onto what that exact route actually offers.
 *
 * @module dsh-role-agents/routes
 */

/**
 * Ordered effort vocabulary with the weight each word carries.
 *
 * Role files carry the vocabulary their source definitions used (`medium`,
 * `xhigh`) rather than any one adapter's ids, so a requested effort is placed on
 * this scale and then moved to the nearest level the adapter advertises.
 *
 * `xhigh` and `max` sit above `high` with a deliberate step between them and the
 * ordinary tiers. Without that step a request for `xhigh` is equidistant from
 * `high` and `max` on a route offering only off/low/high/max, and the tie-break
 * would answer the deepest request with a middle tier.
 */
const EFFORT_WEIGHTS = new Map([
  ['off', 0],
  ['minimal', 1],
  ['low', 2],
  ['medium', 3],
  ['high', 4],
  ['xhigh', 6],
  ['max', 7],
])

/** Weight one effort id, or undefined when it is not a known word. */
function effortWeight(effort) {
  return EFFORT_WEIGHTS.get(String(effort).toLowerCase())
}

/**
 * Resolve one configured route alias.
 * @param routes - the row's optional alias table.
 * @param alias - the requested alias.
 * @returns `{ provider, model, alias }`, or undefined when not configured.
 */
export function resolveRouteAlias(routes, alias) {
  if (alias === undefined || alias === '') return undefined
  const route = routes?.[alias]
  if (route === undefined || typeof route !== 'object') return undefined
  if (typeof route.provider !== 'string' || typeof route.model !== 'string') return undefined
  return { provider: route.provider, model: route.model, alias }
}

/**
 * Find one named route among candidate routes.
 *
 * A name carrying a slash is an exact `provider/model`; a bare name matches a
 * model id and must be unambiguous, because a deployment can register the same
 * model id under more than one provider.
 * @param candidates - the routes to search.
 * @param name - the alias as a role file or a call wrote it.
 * @returns the matching route, and how many candidates a bare name matched.
 */
export function matchRoute(candidates, name) {
  const list = Array.isArray(candidates) ? candidates : []
  if (name === undefined || name === '' || list.length === 0) return { matches: 0 }

  if (String(name).includes('/')) {
    const cut = String(name).indexOf('/')
    const provider = String(name).slice(0, cut)
    const model = String(name).slice(cut + 1)
    const hit = list.find((route) => route.provider === provider && route.model === model)
    return hit === undefined ? { matches: 0 } : { route: hit, matches: 1 }
  }

  const hits = list.filter((route) => route.model === name)
  return hits.length === 1 ? { route: hits[0], matches: 1 } : { matches: hits.length }
}

/**
 * Accept an inline `model:` mapping on a role file.
 * @param value - the frontmatter value.
 * @returns `{ provider, model, alias }`, or undefined when it is not a complete pair.
 */
export function resolveInlineModel(value) {
  if (value === undefined || typeof value !== 'object' || Array.isArray(value)) return undefined
  if (typeof value.provider !== 'string' || typeof value.model !== 'string') return undefined
  return { provider: value.provider, model: value.model, alias: 'inline' }
}

/**
 * The routes one session's `subagent-model-selection` setting currently allows.
 * @param service - the host `subagentModelSelection` service, when mounted.
 * @returns the allowed routes, or undefined when selection is unavailable.
 */
export function allowedRoutes(service) {
  if (service === undefined || typeof service.current !== 'function') return undefined
  let current
  try {
    current = service.current()
  } catch {
    return undefined
  }
  if (current?.enabled !== true) return undefined
  const models = Array.isArray(current.allowedModels) ? current.allowedModels : []
  if (models.length === 0) return undefined
  return models.map((route) => ({ provider: route.provider, model: route.model }))
}

/** Whether one provider/model pair appears in an allowed-route list. */
export function routeIsAllowed(allowed, provider, model) {
  return allowed.some((route) => route.provider === provider && route.model === model)
}

/**
 * Move a requested effort onto the levels one route advertises.
 *
 * An unknown requested word, or an adapter that advertises nothing, passes the
 * request through untouched and lets the route preflight decide. A known word
 * the route does not offer moves to the nearest level, preferring the lower one
 * on a tie.
 * @param wanted - the effort as the role file declared it.
 * @param efforts - the adapter's advertised levels; empty when unknown.
 * @returns the effort to send and an optional substitution note.
 */
export function chooseEffort(wanted, efforts) {
  if (wanted === undefined || wanted === '') return { effort: undefined }

  const ids = (efforts ?? []).map((entry) => String(entry.id))
  if (ids.length === 0) return { effort: wanted }
  if (ids.includes(wanted)) return { effort: wanted }

  const want = effortWeight(wanted)
  if (want === undefined) return { effort: wanted }

  let best
  for (const id of ids) {
    const weight = effortWeight(id)
    if (weight === undefined) continue
    if (best === undefined) {
      best = { id, weight }
      continue
    }
    const distance = Math.abs(weight - want)
    const bestDistance = Math.abs(best.weight - want)
    if (distance < bestDistance || (distance === bestDistance && weight < best.weight)) {
      best = { id, weight }
    }
  }
  if (best === undefined) return { effort: wanted }
  return {
    effort: best.id,
    substituted: `effort "${wanted}" is not offered on this route; using "${best.id}" (offered: ${ids.join(', ')})`,
  }
}
