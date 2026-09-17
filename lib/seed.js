/**
 * Seed the user's role directory from the roster this package ships.
 *
 * The harness convention for shipped-but-editable content is to read from roots
 * rather than write into them, but a role library is also a thing people expect
 * to find on disk next to `~/.codex/agents` and `~/.claude/agents`. Seeding gives
 * both: the files exist where you would look for them, and they still follow the
 * package.
 *
 * The manifest is what makes that safe. A file this package wrote is refreshed
 * when the package's copy changes; a file whose bytes no longer match what was
 * written is treated as the user's and never touched again. A role the manifest
 * already knows about but that is gone from disk is treated as deliberately
 * deleted, so it is not resurrected on the next boot.
 *
 * @module dsh-roles-zeta/seed
 */

import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Manifest file name inside the role directory; never matched as a role. */
export const SEED_MANIFEST = '.seeded.json'

/** Manifest format version. */
const MANIFEST_VERSION = 1

/** SHA-256 of one string, as hex. */
function hashOf(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** Read the manifest, tolerating absence and damage. */
function readManifest(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (parsed?.version === MANIFEST_VERSION && typeof parsed.roles === 'object' && parsed.roles !== null) {
      return parsed
    }
  } catch {
    // A missing or unreadable manifest just means nothing is known yet, which
    // makes every shipped role a first-time seed.
  }
  return { version: MANIFEST_VERSION, roles: {} }
}

/**
 * Bring the user's role directory in line with the shipped roster.
 * @param options - packaged roster directory, target directory, logger.
 * @returns counts of what changed, or an error string when the directory is unusable.
 */
export function seedRoles({ packagedDir, rolesDir, logger }) {
  let shipped
  try {
    shipped = readdirSync(packagedDir).filter((name) => /\.md$/i.test(name)).sort()
  } catch (error) {
    return { error: `cannot read the shipped roster at "${packagedDir}": ${error.message}` }
  }
  if (shipped.length === 0) return { error: `the shipped roster at "${packagedDir}" is empty` }

  const manifestPath = join(rolesDir, SEED_MANIFEST)
  const manifest = readManifest(manifestPath)
  const result = { seeded: [], refreshed: [], kept: [], missing: [] }
  let manifestChanged = false

  try {
    mkdirSync(rolesDir, { recursive: true })
  } catch (error) {
    return { error: `cannot create the role directory "${rolesDir}": ${error.message}` }
  }

  for (const name of shipped) {
    const source = join(packagedDir, name)
    const target = join(rolesDir, name)
    let content
    try {
      content = readFileSync(source, 'utf8')
    } catch (error) {
      logger?.warn?.(`roles-zeta: cannot read shipped role "${name}": ${error.message}`)
      continue
    }
    const shippedHash = hashOf(content)
    const record = manifest.roles[name]

    try {
      if (record === undefined) {
        // First time this package has seen the file here.
        if (existsSync(target)) {
          // The user already had a file under this name; it is theirs.
          manifest.roles[name] = { hash: shippedHash, mine: false }
          manifestChanged = true
          result.kept.push(name)
          continue
        }
        copyFileSync(source, target)
        manifest.roles[name] = { hash: shippedHash, mine: true }
        manifestChanged = true
        result.seeded.push(name)
        continue
      }

      if (!existsSync(target)) {
        // We wrote it once and it is gone now, so it was deleted on purpose.
        result.missing.push(name)
        continue
      }

      const currentHash = hashOf(readFileSync(target, 'utf8'))
      if (record.mine === false) {
        result.kept.push(name)
        continue
      }
      if (currentHash !== record.hash) {
        // Edited since we wrote it; from here on it is the user's file.
        record.mine = false
        manifestChanged = true
        result.kept.push(name)
        continue
      }
      if (currentHash === shippedHash) {
        result.kept.push(name)
        continue
      }
      copyFileSync(source, target)
      manifest.roles[name] = { hash: shippedHash, mine: true }
      manifestChanged = true
      result.refreshed.push(name)
    } catch (error) {
      logger?.warn?.(`roles-zeta: cannot place role "${name}" in "${rolesDir}": ${error.message}`)
    }
  }

  if (manifestChanged) {
    try {
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    } catch (error) {
      logger?.warn?.(`roles-zeta: cannot write "${manifestPath}": ${error.message}`)
    }
  }

  return result
}
