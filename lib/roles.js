/**
 * Role file discovery.
 *
 * A role is one Markdown file under the configured roles directory: YAML
 * frontmatter carries the machine fields, the body is the persona handed to the
 * child agent as its `deployment:persona-prefix` section.
 *
 * Discovery never throws for one bad file. A role library is user-authored
 * data, so a malformed entry is reported and skipped while the rest stay
 * usable — the alternative is a profile that will not boot because one file
 * has a typo.
 *
 * @module dsh-roles-zeta/roles
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { parse as parseYaml } from 'yaml'

/** Lead bytes that make a file a role file. */
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

/** Normalize a role id so `code_mapper_lite` and `code-mapper-lite` address one role. */
export function normalizeRoleId(value) {
  return String(value).trim().replace(/_/g, '-').toLowerCase()
}

/** Read one string field, trimmed, or undefined when absent or not a string. */
function stringField(meta, keys) {
  for (const key of keys) {
    const value = meta[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  }
  return undefined
}

/**
 * Parse one role file.
 * @param file - absolute path.
 * @returns the role, or an error string when the file cannot be a role.
 */
function parseRoleFile(file) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    return { error: `${basename(file)}: ${error.message}` }
  }

  const match = FRONTMATTER.exec(text)
  if (match === null) return { error: `${basename(file)}: missing --- frontmatter block` }

  let meta
  try {
    meta = parseYaml(match[1]) ?? {}
  } catch (error) {
    return { error: `${basename(file)}: invalid YAML frontmatter: ${error.message}` }
  }
  if (typeof meta !== 'object' || Array.isArray(meta)) {
    return { error: `${basename(file)}: frontmatter must be a mapping` }
  }

  const id = normalizeRoleId(stringField(meta, ['id']) ?? basename(file).replace(/\.md$/i, ''))
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    return { error: `${basename(file)}: id "${id}" must match [a-z0-9][a-z0-9-]*` }
  }

  const when = stringField(meta, ['when', 'description'])
  if (when === undefined) return { error: `${basename(file)}: missing "when"` }

  const persona = match[2].trim()
  if (persona === '') return { error: `${basename(file)}: empty persona body` }

  let allow
  if (meta.allow !== undefined) {
    if (!Array.isArray(meta.allow) || meta.allow.some((name) => typeof name !== 'string')) {
      return { error: `${basename(file)}: "allow" must be a list of global tool names` }
    }
    allow = [...new Set(meta.allow.map((name) => name.trim()).filter((name) => name !== ''))]
  }

  // Delegation is opt-in. A role is a leaf of the roster unless its file says
  // otherwise, which matches the source definitions: every read-only role
  // states "Do not spawn agents", and only the coordinator and the debate
  // investigator actually recruit teammates.
  const delegation = meta.delegation === true || meta.delegation === 'true'

  return {
    role: {
      id,
      when,
      persona,
      file,
      // `model:` accepts either a route alias string or an inline
      // `{ provider, model }` mapping; `route:` is the explicit spelling.
      route: stringField(meta, ['route']) ?? (typeof meta.model === 'string' ? meta.model.trim() : undefined),
      inlineModel:
        typeof meta.model === 'object' && meta.model !== null && !Array.isArray(meta.model)
          ? meta.model
          : undefined,
      effort: stringField(meta, ['effort', 'reasoningEffort', 'model_reasoning_effort']),
      allow,
      delegation,
    },
  }
}

/**
 * Load every role file in one directory.
 * @param dir - roles directory; a missing directory is an empty library.
 * @returns the roles by id, their aliases, and one warning per skipped file.
 */
export function loadRoles(dir) {
  const roles = new Map()
  const aliases = new Map()
  const warnings = []

  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch (error) {
    warnings.push(
      error.code === 'ENOENT'
        ? `roles directory "${dir}" does not exist`
        : `cannot read roles directory "${dir}": ${error.message}`,
    )
    return { roles, aliases, warnings }
  }

  const files = entries
    .filter((entry) => entry.isFile() && /\.md$/i.test(entry.name))
    .map((entry) => join(dir, entry.name))
    .sort()

  for (const file of files) {
    const parsed = parseRoleFile(file)
    if (parsed.error !== undefined) {
      warnings.push(parsed.error)
      continue
    }
    const { role } = parsed
    if (roles.has(role.id)) {
      warnings.push(`${basename(file)}: duplicate role id "${role.id}"; keeping the first`)
      continue
    }
    roles.set(role.id, role)
  }

  // Aliases are derived, not authored: every role answers to its underscore
  // spelling too, so a name carried over from the Codex files still resolves.
  for (const id of roles.keys()) {
    const underscore = id.replace(/-/g, '_')
    if (underscore !== id) aliases.set(underscore, id)
  }

  return { roles, aliases, warnings }
}
