import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Convert a PascalCase component filename (e.g. "QBtn", "QBtnGroup")
 * to BEM format (e.g. "q-btn", "q-btn-group").
 *
 * Returns null if the name doesn't look like a component:
 * - Must start with an uppercase letter
 * - Must contain at least two uppercase letters
 */
export function pascalToBem(name: string): string | null {
  if (!name || !/^[A-Z]/.test(name)) return null
  if ((name.match(/[A-Z]/g) || []).length < 2) return null

  // Insert hyphen before each uppercase letter, then lowercase
  const bem = name.replace(/([A-Z])/g, '-$1').toLowerCase().slice(1)
  return bem
}

/**
 * Recursively scan a directory for component files (.js, .ts) and
 * return their BEM names.
 *
 * For each file found:
 * 1. Take only the filename (last path segment)
 * 2. Skip if not .js or .ts (case-insensitive)
 * 3. Take the part before the first dot
 * 4. Skip if doesn't start with uppercase
 * 5. Skip if doesn't contain two uppercase letters
 * 6. Convert PascalCase to BEM
 */
export function scanComponentDir(dir: string): string[] {
  const bems = new Set<string>()
  scanRecursive(dir, bems)
  return [...bems].sort()
}

function scanRecursive(dir: string, bems: Set<string>): void {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry)

    let stat
    try {
      stat = statSync(fullPath)
    } catch {
      continue
    }

    if (stat.isDirectory()) {
      scanRecursive(fullPath, bems)
      continue
    }

    // Split on path separators and take last part
    const parts = entry.split(/[/\\]/)
    const filename = parts[parts.length - 1]

    // Check extension: must end with .js or .ts (case-insensitive)
    if (!/\.(js|ts)$/i.test(filename)) continue

    // Take the part before the first dot
    const baseName = filename.split('.')[0]

    // Convert to BEM (returns null if not a valid component name)
    const bem = pascalToBem(baseName)
    if (bem !== null) {
      bems.add(bem)
    }
  }
}
