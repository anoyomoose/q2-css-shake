/**
 * Icon CSS scanning utilities.
 *
 * Identifies glyph rules in icon CSS files, derives icon prefixes,
 * scans JS/TS source for icon usage, and discovers icon CSS files
 * from @quasar/extras-style directory structures.
 */

import { readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseBlocks } from './css-transform.js'

// ── internal helpers ────────────────────────────────────────────────

/**
 * Strip CSS comments from a selector string.
 */
function stripComments(s: string): string {
  let out = ''
  let i = 0
  while (i < s.length) {
    if (s[i] === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2)
      if (end === -1) break
      i = end + 2
    } else {
      out += s[i]
      i++
    }
  }
  return out
}

/**
 * Check if a CSS block body represents a glyph rule.
 * A glyph rule has exactly one property declaration that is either
 * `content: "..."` or `--fa: "..."`.
 */
function isGlyphBody(body: string): boolean {
  // Strip outer braces and whitespace
  let inner = body
  if (inner.startsWith('{')) inner = inner.slice(1)
  if (inner.endsWith('}')) inner = inner.slice(0, -1)
  inner = inner.trim()

  // Remove trailing semicolon
  if (inner.endsWith(';')) inner = inner.slice(0, -1)

  // Split on semicolons, filter empty parts — must have exactly 1
  const parts = inner.split(';').map(p => p.trim()).filter(Boolean)
  if (parts.length !== 1) return false

  const decl = parts[0]

  // Match content: "..." or --fa: "..."
  return /^(?:content|--fa)\s*:\s*(['"])[^'"]*\1$/.test(decl)
}

/**
 * Extract a simple class name from a CSS selector.
 * Returns the class name (without leading dot) or null if the selector
 * is not a simple single-class selector (optionally with pseudo-element).
 */
function extractClassName(selector: string): string | null {
  // Strip comments
  let s = stripComments(selector).trim()

  // Must start with .
  if (!s.startsWith('.')) return null

  // Strip leading dot
  s = s.slice(1)

  // Strip pseudo-element suffixes
  s = s.replace(/::?(?:before|after)$/, '')

  // Must be a simple name: only alphanumeric, hyphens, underscores
  if (!/^[a-zA-Z0-9_-]+$/.test(s)) return null

  return s
}

// ── exported functions ──────────────────────────────────────────────

/**
 * Extract glyph class names from a CSS string.
 *
 * Parses the CSS into blocks, identifies glyph rules (single-property
 * rules with `content` or `--fa` declarations), and returns the class
 * names of those rules.
 */
export function extractGlyphNames(css: string): string[] {
  const blocks = parseBlocks(css)
  const names: string[] = []

  for (const block of blocks) {
    const sel = stripComments(block.selector).trim()

    // Skip at-rules
    if (sel.startsWith('@')) continue

    // Check if body is a glyph rule
    if (!isGlyphBody(block.body)) continue

    // Extract class name from selector
    const name = extractClassName(block.selector)
    if (name !== null) {
      names.push(name)
    }
  }

  return names
}

/**
 * Derive icon prefixes from a set of known icon names.
 *
 * Groups icon names by their prefix (everything up to and including the
 * first hyphen), and returns prefixes that appear at least `minCount` times.
 */
export function deriveIconPrefixes(knownIcons: Set<string>, minCount: number = 10): string[] {
  const counts = new Map<string, number>()

  for (const name of knownIcons) {
    const idx = name.indexOf('-')
    if (idx === -1) continue
    const prefix = name.slice(0, idx + 1)
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1)
  }

  const result: string[] = []
  for (const [prefix, count] of counts) {
    if (count >= minCount) {
      result.push(prefix)
    }
  }

  return result.sort()
}

/**
 * Scan a JS/TS source string for icon names from a known set.
 *
 * For each prefix, finds all occurrences via indexOf and extracts the
 * full word (continuing while characters match [a-zA-Z0-9-]).
 * Only includes words that exist in the knownIcons set.
 */
export function scanJsForIcons(
  code: string,
  knownIcons: Set<string>,
  prefixes: string[]
): Set<string> {
  const found = new Set<string>()
  const wordChar = /[a-zA-Z0-9-]/

  for (const prefix of prefixes) {
    let pos = 0
    while (true) {
      const idx = code.indexOf(prefix, pos)
      if (idx === -1) break

      // Extract full word starting from the prefix position
      let end = idx + prefix.length
      while (end < code.length && wordChar.test(code[end])) {
        end++
      }

      const word = code.slice(idx, end)
      if (knownIcons.has(word)) {
        found.add(word)
      }

      pos = idx + 1
    }
  }

  return found
}

/**
 * Discover icon CSS files from a base directory.
 *
 * Scans subdirectories for those containing an `icons.json` file,
 * then collects all `.css` files from those directories.
 * Returns a sorted array of absolute CSS file paths.
 */
export function discoverIconCssFiles(baseDir: string): string[] {
  const cssFiles: string[] = []

  let entries: string[]
  try {
    entries = readdirSync(baseDir)
  } catch {
    return []
  }

  for (const entry of entries) {
    const entryPath = join(baseDir, entry)

    // Check if it's a directory
    let stat
    try {
      stat = statSync(entryPath)
    } catch {
      continue
    }
    if (!stat.isDirectory()) continue

    // Check for icons.json
    const iconsJsonPath = join(entryPath, 'icons.json')
    if (!existsSync(iconsJsonPath)) continue

    // Collect all .css files in this directory
    let dirEntries: string[]
    try {
      dirEntries = readdirSync(entryPath)
    } catch {
      continue
    }

    for (const file of dirEntries) {
      if (file.endsWith('.css')) {
        cssFiles.push(join(entryPath, file))
      }
    }
  }

  return cssFiles.sort()
}
