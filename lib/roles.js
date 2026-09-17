/**
 * Role file discovery.
 *
 * A role is one Markdown file: YAML frontmatter carries the machine fields, the
 * body is the persona handed to the child agent as its
 * `deployment:persona-prefix` section.
 *
 * Roles load from several roots in precedence order, lowest first, so the
 * package's own roster works out of the box and a file the user drops into their
 * own directory replaces it by id. That matches how the rest of the harness
 * treats shipped-but-editable content: read from roots, never copy into place.
 *
 * A user file may also carry `disabled: true`, which removes a shipped role
 * without needing a replacement — a role library nobody can subtract from is not
 * really theirs.
 *
 * Discovery never throws for one bad file. A malformed entry is reported and
 * skipped while the rest stay usable; the alternative is a profile that will not
 * boot because one file has a typo.
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
 * @returns the role, a suppression marker, or an error string.
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

  // A suppression stub needs only an id: it exists to remove a role another root
  // supplies, so it deliberately has no persona of its own.
  if (meta.disabled === true || meta.disabled === 'true') return { disabled: id, file }

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
      // `model:` accepts either a route name or an inline
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
 * Load the role library from several roots.
 *
 * Roots are applied in the order given, so a later root replaces an earlier one
 * by id and a later `disabled: true` stub removes it. A duplicate inside one
 * root keeps the first file and warns, because within a single directory the
 * author has no way to say which spelling wins.
 * @param roots - `{ dir, source, required }` entries, lowest precedence first.
 * @returns the roles by id, their aliases, one warning per skipped file, and where each role came from.
 */
export function loadRoles(roots) {
  const roles = new Map()
  const aliases = new Map()
  const warnings = []
  const origin = new Map()

  for (const root of roots) {
    let entries
    try {
      entries = readdirSync(root.dir, { withFileTypes: true })
    } catch (error) {
      if (error.code !== 'ENOENT' || root.required === true) {
        warnings.push(
          error.code === 'ENOENT'
            ? `roles directory "${root.dir}" does not exist`
            : `cannot read roles directory "${root.dir}": ${error.message}`,
        )
      }
      continue
    }

    const files = entries
      .filter((entry) => entry.isFile() && /\.md$/i.test(entry.name))
      .map((entry) => join(root.dir, entry.name))
      .sort()

    const seenHere = new Set()
    for (const file of files) {
      const parsed = parseRoleFile(file)
      if (parsed.error !== undefined) {
        warnings.push(parsed.error)
        continue
      }
      if (parsed.disabled !== undefined) {
        roles.delete(parsed.disabled)
        origin.delete(parsed.disabled)
        continue
      }
      const { role } = parsed
      if (seenHere.has(role.id)) {
        warnings.push(`${basename(file)}: duplicate role id "${role.id}" in this directory; keeping the first`)
        continue
      }
      seenHere.add(role.id)
      roles.set(role.id, role)
      origin.set(role.id, root.source)
    }
  }

  // Aliases are derived, not authored: every role answers to its underscore
  // spelling too, so a name carried over from the Codex files still resolves.
  for (const id of roles.keys()) {
    const underscore = id.replace(/-/g, '_')
    if (underscore !== id) aliases.set(underscore, id)
  }

  return { roles, aliases, warnings, origin }
}
