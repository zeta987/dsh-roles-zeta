/**
 * Child tool-scope sanitization.
 *
 * `ctx.tools.restrict()` rejects any name that is not a currently registered
 * global tool, and the driver applies the filter inside the child's creation
 * window — so one stale name turns the whole delegation into a failure. Role
 * files are authored against a deployment whose tool set varies by platform and
 * by which MCP servers happen to be connected (`bash` does not exist on win32;
 * MCP tool names come and go with the connection), so every declared name is
 * resolved against the live registry before it is handed to the provider.
 *
 * Names that do not resolve are dropped and reported, never silently ignored.
 *
 * @module dsh-roles-zeta/filter
 */

/** The PTC presentation transport; `restrict()` refuses to name it. */
const RESERVED_TOOL = 'run_code'

/**
 * Extract the tool names a `tools.restrict()` rejection named.
 * @param message - the thrown error's message.
 * @returns the offending names, empty when the message is a different failure.
 */
export function unknownNamesFromError(message) {
  const match = /names unknown global tools? ((?:"[^"]*"(?:, )?)+)/.exec(String(message))
  if (match === null) return []
  return [...match[1].matchAll(/"([^"]*)"/g)].map((entry) => entry[1])
}

/**
 * Build the `toolFilter` one child receives.
 *
 * An `allow` list is the role's declared surface and is intersected with the
 * live registry. A role with no `allow` list inherits everything except the
 * delegation tools, because delegation is opt-in: `delegation: true` is what
 * keeps the `delegate`, `subagent`, `subagent_fork`, `workflow`, and `ralph`
 * tools in a child's hands.
 * @param role - the resolved role.
 * @param known - the global tool names the calling agent can see.
 * @param delegationTools - the names that let a child start further children.
 * @returns a filter, its dropped names, and whether the allow-list collapsed.
 */
export function buildToolFilter(role, known, delegationTools) {
  const dropped = []

  if (role.allow !== undefined) {
    const kept = []
    for (const name of role.allow) {
      if (name === RESERVED_TOOL) {
        dropped.push(`${name} (reserved PTC transport)`)
        continue
      }
      if (!known.has(name)) {
        dropped.push(`${name} (not registered here)`)
        continue
      }
      kept.push(name)
    }
    // A collapsed allow-list is not proof that the role is unusable: a
    // host-plane plugin does not always see every layer its child will inherit,
    // so an empty intersection means "unconfirmed", not "absent". The caller
    // passes the declared list through and lets the restrict rejection decide.
    if (kept.length === 0) return { filter: undefined, dropped, collapsed: true }
    return { filter: { allow: kept }, dropped, collapsed: false }
  }

  if (role.delegation === true) return { filter: undefined, dropped, collapsed: false }

  const deny = [...new Set(delegationTools)]
    .filter((name) => name !== RESERVED_TOOL && known.has(name))
    .sort()
  if (deny.length === 0) return { filter: undefined, dropped, collapsed: false }
  return { filter: { deny }, dropped, collapsed: false }
}

/**
 * Remove names a rejected start reported as unregistered from one filter.
 * @param filter - the filter that was rejected.
 * @param names - the offending names.
 * @returns the narrowed filter, or an error when nothing usable would remain.
 */
export function dropFilterNames(filter, names) {
  const drop = new Set(names)
  if (filter.allow !== undefined) {
    const allow = filter.allow.filter((name) => !drop.has(name))
    if (allow.length === 0) {
      return { error: `every tool this role allows is unregistered here: ${names.join(', ')}` }
    }
    return { filter: { allow } }
  }
  if (filter.deny !== undefined) {
    const deny = filter.deny.filter((name) => !drop.has(name))
    return { filter: deny.length === 0 ? undefined : { deny } }
  }
  return { filter }
}
