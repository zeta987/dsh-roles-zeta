/**
 * The settings-page API: a few JSON routes over the role directory.
 *
 * The browser half (`lib/client.js`) is a plain page that lists the roster and
 * edits one role at a time. Everything it needs comes from `GET /state`, and
 * every change goes through one of the `POST` routes below, each of which writes
 * the role directory, reloads the library, and answers with the fresh state.
 *
 * Routes are registered on the host `webServer` and gated the way the rest of
 * the browser surface is: `ctx.connection.requestRejection()` enforces the
 * browser-session cookie and the Host/Origin trust fence, and a write must also
 * be same-origin. Nothing here is reachable from another site.
 *
 * File semantics mirror the documented override rules rather than inventing new
 * ones. Saving writes `<id>.md` into the user's directory, which is the file
 * that replaces a shipped role by id. Deleting a role the package ships leaves a
 * `disabled: true` stub, because the packaged root would otherwise supply the
 * role again. Restoring copies the shipped file back and hands it to the seed
 * manifest as the package's own.
 *
 * @module dsh-roles-zeta/api
 */

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseRoleFile, validateRoleDraft, formatRoleFile, formatDisabledStub, normalizeRoleId, EFFORT_VOCABULARY } from './roles.js'
import { SEED_MANIFEST } from './seed.js'
import { allowedRoutes } from './routes.js'
import { commandNameFor } from './commands.js'

/** URL prefix every route lives under. */
export const API_PREFIX = '/__dsh/roles-zeta'

/** Largest request body accepted, generous for a long persona. */
const MAX_BODY_BYTES = 256 * 1024

/** An error that carries the HTTP status the client should see. */
class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

const hashOf = (text) => createHash('sha256').update(text, 'utf8').digest('hex')

function sendJson(res, status, value) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(JSON.stringify(value))
}

async function readJsonBody(req) {
  const type = String(req.headers['content-type'] ?? '').toLowerCase()
  if (!type.startsWith('application/json')) throw new ApiError(415, 'expected a JSON request body')
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new ApiError(413, 'request body too large')
    chunks.push(chunk)
  }
  let value
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new ApiError(400, 'request body is not valid JSON')
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'request body must be a JSON object')
  }
  return value
}

/** Whether a request's Origin names the host it was sent to. */
function sameOrigin(req) {
  try {
    const origin = new URL(req.headers.origin)
    return ['http:', 'https:'].includes(origin.protocol) && origin.host === req.headers.host
  } catch {
    return false
  }
}

/** The shipped role files, by file name. */
function shippedFiles(packagedDir) {
  return readdirSync(packagedDir)
    .filter((name) => /\.md$/i.test(name))
    .sort()
}

/** Read the seed manifest, tolerating absence. */
function readManifest(rolesDir) {
  try {
    const parsed = JSON.parse(readFileSync(join(rolesDir, SEED_MANIFEST), 'utf8'))
    if (parsed?.version === 1 && typeof parsed.roles === 'object' && parsed.roles !== null) return parsed
  } catch {
    // Nothing known yet.
  }
  return { version: 1, roles: {} }
}

function writeManifest(rolesDir, manifest) {
  writeFileSync(join(rolesDir, SEED_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

/**
 * Every file in the user's directory that names one role id — the role's own
 * file, a same-id duplicate under another name, or a disabled stub.
 */
function userFilesForId(rolesDir, id) {
  let entries
  try {
    entries = readdirSync(rolesDir, { withFileTypes: true })
  } catch {
    return []
  }
  const hits = []
  for (const entry of entries) {
    if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue
    const file = join(rolesDir, entry.name)
    const parsed = parseRoleFile(file)
    const parsedId = parsed.role?.id ?? parsed.disabled
    if (parsedId === id) hits.push(file)
  }
  return hits
}

/**
 * Mount the settings API.
 * @param ctx - a context whose `webServer` and `connection` services are present.
 * @param library - the live role library.
 * @param options - `packagedDir`, `settings` (the row config), `getKnownTools`, `getRegisteredRoutes`, `selectionService`, `logger`.
 * @returns a disposer that removes every route.
 */
export function installRolesApi(ctx, library, options) {
  const { packagedDir, settings, logger } = options
  const rolesDir = library.rolesDir
  const shippedIds = () =>
    shippedFiles(packagedDir)
      .map((name) => parseRoleFile(join(packagedDir, name)))
      .filter((parsed) => parsed.role !== undefined)
      .map((parsed) => parsed.role.id)

  /** The whole picture the page renders from. */
  const buildState = async () => {
    const shipped = new Set(shippedIds())
    const roles = []
    for (const role of library.roles.values()) {
      const source = library.origin.get(role.id) ?? 'user'
      let managed = false
      if (shipped.has(role.id)) {
        if (source === 'packaged') managed = true
        else {
          try {
            const packagedCopy = readFileSync(join(packagedDir, `${role.id}.md`), 'utf8')
            managed = hashOf(readFileSync(role.file, 'utf8')) === hashOf(packagedCopy)
          } catch {
            managed = false
          }
        }
      }
      roles.push({
        id: role.id,
        when: role.when,
        route: role.route ?? '',
        effort: role.effort ?? '',
        allow: role.allow ?? null,
        delegation: role.delegation === true,
        persona: role.persona,
        source,
        shipped: shipped.has(role.id),
        managed,
        file: role.file,
        command: settings.commands === false ? null : `/${commandNameFor(role, settings.commandPrefix ?? '')}`,
      })
    }
    roles.sort((a, b) => a.id.localeCompare(b.id))

    let tools = []
    try {
      tools = [...(options.getKnownTools?.() ?? [])].sort()
    } catch {
      tools = []
    }

    let registered = []
    try {
      registered = await (options.getRegisteredRoutes?.() ?? [])
    } catch {
      registered = []
    }
    const allowed = allowedRoutes(options.selectionService)

    return {
      rolesDir,
      shipped: [...shipped].sort(),
      disabledShipped: [...shipped].filter((id) => !library.roles.has(id)).sort(),
      roles,
      tools,
      routes: {
        allowed: allowed === undefined ? null : allowed.map((route) => `${route.provider}/${route.model}`),
        registered: registered.map((route) => `${route.provider}/${route.model}`),
      },
      efforts: EFFORT_VOCABULARY,
      warnings: library.warnings,
      commands: { enabled: settings.commands !== false, prefix: settings.commandPrefix ?? '' },
    }
  }

  const ensureDir = () => {
    try {
      mkdirSync(rolesDir, { recursive: true })
    } catch (error) {
      throw new ApiError(500, `cannot create "${rolesDir}": ${error.message}`)
    }
  }

  /**
   * Write one role file into the user's directory.
   *
   * The file is `<id>.md`; any other user file carrying the same id — a role
   * kept under a different name, or the stub that disabled a shipped role — is
   * removed, because within one directory the first file by name wins and the
   * write would otherwise be shadowed by it.
   */
  const writeRole = (role) => {
    ensureDir()
    const target = join(rolesDir, `${role.id}.md`)
    for (const file of userFilesForId(rolesDir, role.id)) {
      if (file !== target) unlinkSync(file)
    }
    writeFileSync(target, formatRoleFile(role), 'utf8')
    return target
  }

  /** Remove a role from the user's directory, suppressing it when the package ships it. */
  const removeRole = (id, shipped) => {
    for (const file of userFilesForId(rolesDir, id)) unlinkSync(file)
    if (shipped.has(id)) {
      ensureDir()
      writeFileSync(join(rolesDir, `${id}.md`), formatDisabledStub(id), 'utf8')
    }
  }

  /** Copy shipped files back over the user's directory and hand them to the manifest. */
  const restore = (ids) => {
    ensureDir()
    const manifest = readManifest(rolesDir)
    const restored = []
    for (const name of shippedFiles(packagedDir)) {
      const parsed = parseRoleFile(join(packagedDir, name))
      if (parsed.role === undefined) continue
      const id = parsed.role.id
      if (ids !== undefined && !ids.includes(id)) continue
      // Any other file carrying this id (a stub, a same-id duplicate) would
      // still shadow the restored copy, so it goes too.
      for (const file of userFilesForId(rolesDir, id)) {
        if (file !== join(rolesDir, name)) unlinkSync(file)
      }
      const content = readFileSync(join(packagedDir, name), 'utf8')
      writeFileSync(join(rolesDir, name), content, 'utf8')
      manifest.roles[name] = { hash: hashOf(content), mine: true }
      restored.push(id)
    }
    writeManifest(rolesDir, manifest)
    return restored
  }

  const handle = (method, fn) => async (req, res) => {
    const rejection = ctx.connection.requestRejection(req)
    if (rejection !== undefined) {
      sendJson(res, rejection, { ok: false, error: rejection === 401 ? 'not signed in to this dsh host' : 'untrusted request origin' })
      return
    }
    if (req.method !== method) {
      sendJson(res, 405, { ok: false, error: `use ${method}` })
      return
    }
    if (method === 'POST' && !sameOrigin(req)) {
      sendJson(res, 403, { ok: false, error: 'writes must come from the same origin' })
      return
    }
    try {
      await fn(req, res)
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500
      if (status === 500) logger?.warn?.(`roles-zeta: settings API failed: ${error?.stack ?? error}`)
      if (!res.headersSent) sendJson(res, status, { ok: false, error: error?.message ?? String(error) })
      else res.destroy()
    }
  }

  const disposers = []
  const route = (suffix, method, fn) => {
    disposers.push(ctx.webServer.register({ kind: 'exact', path: `${API_PREFIX}${suffix}`, handler: handle(method, fn) }))
  }

  const respondWithState = async (res, extra = {}) => {
    library.reload(true)
    sendJson(res, 200, { ok: true, ...extra, state: await buildState() })
  }

  route('/state', 'GET', async (_req, res) => {
    library.reload()
    sendJson(res, 200, { ok: true, state: await buildState() })
  })

  // Create or update. `originalId` names the role being edited; when it differs
  // from the draft's id this is a rename.
  route('/save', 'POST', async (req, res) => {
    const body = await readJsonBody(req)
    const checked = validateRoleDraft(body.role)
    if (checked.error !== undefined) throw new ApiError(400, checked.error)
    const role = checked.role
    const originalId = body.originalId === undefined || body.originalId === null ? undefined : normalizeRoleId(body.originalId)
    const shipped = new Set(shippedIds())

    // A shipped id that is currently disabled is free to take: the new file
    // replaces the stub, which is exactly what dropping a file in would do.
    if (originalId === undefined) {
      if (library.find(role.id) !== undefined) {
        throw new ApiError(409, `a role named "${role.id}" already exists`)
      }
    } else if (originalId !== role.id) {
      if (library.find(role.id) !== undefined) {
        throw new ApiError(409, `cannot rename to "${role.id}": that role already exists`)
      }
      if (library.find(originalId) === undefined) throw new ApiError(404, `unknown role "${originalId}"`)
    }

    writeRole(role)
    if (originalId !== undefined && originalId !== role.id) removeRole(originalId, shipped)
    await respondWithState(res, { id: role.id })
  })

  route('/delete', 'POST', async (req, res) => {
    const body = await readJsonBody(req)
    const id = normalizeRoleId(body.id ?? '')
    if (library.find(id) === undefined) throw new ApiError(404, `unknown role "${id}"`)
    removeRole(id, new Set(shippedIds()))
    await respondWithState(res, { id })
  })

  // Restore one shipped role, or every shipped role when no id is given. A
  // role the user added is never touched.
  route('/restore', 'POST', async (req, res) => {
    const body = await readJsonBody(req)
    let ids
    if (body.id !== undefined && body.id !== null) {
      const id = normalizeRoleId(body.id)
      if (!shippedIds().includes(id)) throw new ApiError(400, `"${id}" is not a shipped role`)
      ids = [id]
    }
    const restored = restore(ids)
    await respondWithState(res, { restored })
  })

  logger?.info?.(`roles-zeta: settings API mounted at ${API_PREFIX}`)
  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        // Already gone with the server.
      }
    }
  }
}

