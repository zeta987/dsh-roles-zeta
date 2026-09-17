/**
 * The live role library.
 *
 * `loadRoles()` reads the roots once; this wraps that read so the roster can be
 * re-read while the host is running. Two things change it: a write through the
 * settings page, and a file edited by hand in the role directory, which a
 * debounced `fs.watch` picks up. Every consumer — the `delegate` tool, the slash
 * commands, the settings API — subscribes and rebuilds from the new roster, so a
 * role edit reaches the next call without composing the profile again.
 *
 * A reload that finds the same files unchanged is a no-op: the directory
 * signature (names, sizes, mtimes) is compared first, so the watcher event our
 * own write triggers does not rebuild everything a second time.
 *
 * @module dsh-roles-zeta/library
 */

import { mkdirSync, readdirSync, statSync, watch } from 'node:fs'
import { join } from 'node:path'
import { loadRoles, normalizeRoleId } from './roles.js'

/** Quiet period after the last directory event before the roster is re-read. */
const WATCH_DEBOUNCE_MS = 300

/** A cheap fingerprint of one directory's role files. */
function directorySignature(dir) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return 'absent'
  }
  return entries
    .filter((entry) => entry.isFile() && /\.md$/i.test(entry.name))
    .map((entry) => {
      try {
        const info = statSync(join(dir, entry.name))
        return `${entry.name}:${info.size}:${info.mtimeMs}`
      } catch {
        return `${entry.name}:?`
      }
    })
    .sort()
    .join('|')
}

/**
 * Create the library over the packaged roster and the user's directory.
 * @param options - `packagedDir`, `rolesDir`, optional `logger`.
 * @returns the library.
 */
export function createRoleLibrary({ packagedDir, rolesDir, logger }) {
  const listeners = new Set()
  let state = { roles: new Map(), aliases: new Map(), warnings: [], origin: new Map() }
  let signature = ''

  const roots = [
    { dir: packagedDir, source: 'packaged', required: true },
    { dir: rolesDir, source: 'user' },
  ]

  const currentSignature = () => roots.map((root) => directorySignature(root.dir)).join('#')

  const read = () => {
    // Fingerprint first, then read: a file that changes while the read is in
    // flight then differs from the recorded signature and triggers a reload,
    // instead of being folded into it and lost.
    const next = currentSignature()
    state = loadRoles(roots)
    signature = next
    for (const warning of state.warnings) logger?.warn?.(`roles-zeta: ${warning}`)
    return state
  }

  const notify = () => {
    for (const listener of listeners) {
      try {
        listener(state)
      } catch (error) {
        logger?.warn?.(`roles-zeta: roster listener failed: ${error?.message ?? error}`)
      }
    }
  }

  const library = {
    /** Where the user's files live. */
    rolesDir,
    /** Where the shipped roster lives. */
    packagedDir,
    get roles() {
      return state.roles
    },
    get aliases() {
      return state.aliases
    },
    get origin() {
      return state.origin
    },
    get warnings() {
      return state.warnings
    },
    /** Read the roots without notifying anyone; the first load. */
    load() {
      return read()
    },
    /**
     * Re-read the roots and tell subscribers when something changed.
     * @param force - notify even when the directory signature is unchanged.
     * @returns whether subscribers were notified.
     */
    reload(force = false) {
      if (!force && currentSignature() === signature) return false
      read()
      notify()
      return true
    },
    /** Resolve one role id, accepting the underscore spelling of any id. */
    find(requested) {
      const normalized = normalizeRoleId(requested)
      if (state.roles.has(normalized)) return state.roles.get(normalized)
      const alias = state.aliases.get(normalized)
      return alias === undefined ? undefined : state.roles.get(alias)
    },
    /** Subscribe to roster changes; returns the unsubscribe. */
    onChange(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /**
     * Watch the user's directory and reload after edits settle.
     * @returns a disposer that stops watching; a no-op when watching failed.
     */
    watch() {
      let watcher
      let timer
      try {
        // A home whose directory was never seeded still deserves a watcher;
        // creating the empty directory is what the seed would do anyway.
        mkdirSync(rolesDir, { recursive: true })
        watcher = watch(rolesDir, { persistent: false }, () => {
          clearTimeout(timer)
          timer = setTimeout(() => {
            timer = undefined
            if (library.reload()) logger?.info?.(`roles-zeta: role files changed in "${rolesDir}"; roster reloaded`)
          }, WATCH_DEBOUNCE_MS)
        })
        watcher.on('error', (error) => {
          logger?.warn?.(`roles-zeta: stopped watching "${rolesDir}": ${error?.message ?? error}`)
        })
      } catch (error) {
        logger?.warn?.(`roles-zeta: cannot watch "${rolesDir}": ${error?.message ?? error}`)
        return () => {}
      }
      return () => {
        clearTimeout(timer)
        watcher.close()
      }
    },
  }

  return library
}
