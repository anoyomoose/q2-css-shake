/**
 * CSS tree-shaking transform for Quasar component styles.
 *
 * Character-by-character walker with depth tracking for strings, comments,
 * parentheses, brackets, and braces. Extracts top-level CSS blocks
 * (selector + body), evaluates selectors against known/used Quasar BEM
 * prefixes, and strips rules for unused components.
 */

// ── helpers ──────────────────────────────────────────────────────────

/** Strip CSS comments from a string (non-nested, no escaping). */
function stripComments(s: string): string {
  let out = ''
  let i = 0
  while (i < s.length) {
    if (s[i] === '/' && s[i + 1] === '*') {
      const end = s.indexOf('*/', i + 2)
      if (end === -1) break          // unterminated comment — drop rest
      i = end + 2
    } else {
      out += s[i]
      i++
    }
  }
  return out
}

/** Pretty-print a CSS body block for debug output. */
function prettyBody(body: string): string {
  // Strip the outer braces
  let inner = body
  if (inner.startsWith('{')) inner = inner.slice(1)
  if (inner.endsWith('}')) inner = inner.slice(0, -1)
  // Strip linebreaks, split on ;
  inner = inner.replace(/[\r\n]+/g, ' ')
  const parts = inner.split(';').map(p => p.trim()).filter(Boolean)
  return parts.map(p => `    ${p};`).join('\n')
}

// ── main transform ──────────────────────────────────────────────────

export function transformCSS(
  css: string,
  knownComponents: string[],
  usedComponents: string[],
  debug?: (msg: string) => void
): string {
  if (css.length === 0) return ''

  const usedSet = new Set(usedComponents)

  // ── Phase 1: extract top-level blocks via character walker ────────
  // Each block = { selector, body, gapBefore }
  // gapBefore = whitespace/comments between previous block and this selector

  interface Block {
    selector: string   // everything before the opening { at depth 0
    body: string       // everything from { to matching } inclusive
    gapBefore: string  // inter-block text (whitespace / comments)
  }

  const blocks: Block[] = []

  let i = 0
  const len = css.length

  // depth counters
  let braceDepth = 0
  let parenDepth = 0
  // bracket depth not needed for block extraction but tracked for correctness
  let bracketDepth = 0

  // state flags
  let inDoubleQuote = false
  let inSingleQuote = false
  let inComment = false

  // accumulators
  let gap = ''        // inter-block gap
  let selector = ''   // current selector being accumulated
  let body = ''       // current body being accumulated
  let inBody = false  // true once we've entered the { for this block

  while (i < len) {
    const ch = css[i]

    // ── string handling (highest priority) ──────────────────────────
    if (inDoubleQuote) {
      if (ch === '\\') {
        // escaped char — consume both
        if (inBody) body += css[i] + (css[i + 1] ?? '')
        else selector += css[i] + (css[i + 1] ?? '')
        i += 2
        continue
      }
      if (ch === '"') inDoubleQuote = false
      if (inBody) body += ch
      else selector += ch
      i++
      continue
    }
    if (inSingleQuote) {
      if (ch === '\\') {
        if (inBody) body += css[i] + (css[i + 1] ?? '')
        else selector += css[i] + (css[i + 1] ?? '')
        i += 2
        continue
      }
      if (ch === "'") inSingleQuote = false
      if (inBody) body += ch
      else selector += ch
      i++
      continue
    }

    // ── comment handling ────────────────────────────────────────────
    if (inComment) {
      if (ch === '*' && css[i + 1] === '/') {
        inComment = false
        if (inBody) { body += '*/'; }
        else if (braceDepth === 0 && selector === '') { gap += '*/'; }
        else { selector += '*/'; }
        i += 2
        continue
      }
      if (inBody) body += ch
      else if (braceDepth === 0 && selector === '') gap += ch
      else selector += ch
      i++
      continue
    }

    // ── check for comment start ─────────────────────────────────────
    if (ch === '/' && css[i + 1] === '*') {
      inComment = true
      if (inBody) { body += '/*'; }
      else if (braceDepth === 0 && selector === '') { gap += '/*'; }
      else { selector += '/*'; }
      i += 2
      continue
    }

    // ── quote start ─────────────────────────────────────────────────
    if (ch === '"') {
      inDoubleQuote = true
      if (inBody) body += ch
      else selector += ch
      i++
      continue
    }
    if (ch === "'") {
      inSingleQuote = true
      if (inBody) body += ch
      else selector += ch
      i++
      continue
    }

    // ── paren / bracket tracking ────────────────────────────────────
    if (ch === '(') parenDepth++
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1)
    else if (ch === '[') bracketDepth++
    else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1)

    // ── brace tracking ─────────────────────────────────────────────
    if (ch === '{') {
      braceDepth++
      if (braceDepth === 1 && !inBody) {
        // Start of body
        inBody = true
        body = '{'
        i++
        continue
      }
      body += ch
      i++
      continue
    }
    if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1)
      if (braceDepth === 0 && inBody) {
        // End of block
        body += '}'
        blocks.push({ selector, body, gapBefore: gap })
        gap = ''
        selector = ''
        body = ''
        inBody = false
        i++
        continue
      }
      if (inBody) body += ch
      else selector += ch // shouldn't happen in valid CSS but be safe
      i++
      continue
    }

    // ── regular character ───────────────────────────────────────────
    if (inBody) {
      body += ch
    } else if (braceDepth === 0 && selector === '' && (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t')) {
      // Whitespace between blocks goes to gap
      gap += ch
    } else {
      selector += ch
    }
    i++
  }

  // ── Phase 2: evaluate each block ─────────────────────────────────

  const output: string[] = []

  for (const block of blocks) {
    const selectorStripped = stripComments(block.selector).trim()

    // @-rule: pass through
    if (selectorStripped.startsWith('@')) {
      if (debug) debug(`SKIP @-rule: ${selectorStripped.slice(0, 60)}...`)
      output.push(block.gapBefore + block.selector + block.body)
      continue
    }

    // Split selector on , at paren-depth 0 (respecting all depth tracking)
    const instances = splitSelector(block.selector)

    const kept: string[] = []
    let debugLines: string[] | undefined
    if (debug) debugLines = []

    for (const instance of instances) {
      const stripped = stripComments(instance).trim()

      // Check for complex selectors we don't understand
      if (/[(\["'@]/.test(stripped)) {
        if (debug) {
          debugLines!.push(`  SKIP COMPLEX: ${stripped} -> contains ${stripped.match(/[(\["'@]/)![0]}`)
        }
        kept.push(instance)
        continue
      }

      // Normalize for matching: replace non-classname chars with space, pad
      const normalized = ' ' + stripped.replace(/[^a-zA-Z0-9\-_]/g, ' ') + ' '

      // Find matching known components
      const matches: string[] = []
      for (const comp of knownComponents) {
        if (
          normalized.includes(` ${comp} `) ||
          normalized.includes(` ${comp}--`) ||
          normalized.includes(` ${comp}__`)
        ) {
          matches.push(comp)
        }
      }

      if (matches.length === 0) {
        // No known component found — keep
        kept.push(instance)
        if (debug) debugLines!.push(`  INSTANCE: ${stripped} -> no match -> KEEP`)
        continue
      }

      // Check if ALL matched components are in the used set
      const allUsed = matches.every(m => usedSet.has(m))
      if (allUsed) {
        kept.push(instance)
        if (debug) debugLines!.push(`  INSTANCE: ${stripped} -> MATCH ${matches.join(', ')} -> KEEP (used)`)
      } else {
        if (debug) debugLines!.push(`  INSTANCE: ${stripped} -> MATCH ${matches.join(', ')} -> STRIP (not in used set)`)
      }
    }

    if (debug) {
      debug(`BLOCK: ${selectorStripped}`)
      for (const line of debugLines!) debug(line)
    }

    if (kept.length === 0) {
      // All instances stripped — drop entire block
      if (debug) debug('  RESULT: <dropped>')
      continue
    }

    if (kept.length === instances.length) {
      // All kept — emit as-is
      if (debug) {
        debug(`  RESULT: ${stripComments(kept.join(',')).trim()}`)
        debug(`  BODY:\n${prettyBody(block.body)}`)
      }
      output.push(block.gapBefore + block.selector + block.body)
    } else {
      // Some stripped — rejoin survivors
      const hasNewline = block.selector.includes('\n')
      const joiner = hasNewline ? ',\n' : ','
      const newSelector = kept.join(joiner)
      if (debug) {
        debug(`  RESULT: ${stripComments(newSelector).trim()}`)
        debug(`  BODY:\n${prettyBody(block.body)}`)
      }
      output.push(block.gapBefore + newSelector + block.body)
    }
  }

  return output.join('')
}

// ── selector splitter ───────────────────────────────────────────────

/** Split a selector string on `,` at paren-depth 0, respecting all depth contexts. */
function splitSelector(selector: string): string[] {
  const parts: string[] = []
  let current = ''
  let i = 0
  const len = selector.length

  let parenDepth = 0
  let bracketDepth = 0
  let inDoubleQuote = false
  let inSingleQuote = false
  let inComment = false

  while (i < len) {
    const ch = selector[i]

    if (inDoubleQuote) {
      if (ch === '\\') {
        current += ch + (selector[i + 1] ?? '')
        i += 2
        continue
      }
      if (ch === '"') inDoubleQuote = false
      current += ch
      i++
      continue
    }
    if (inSingleQuote) {
      if (ch === '\\') {
        current += ch + (selector[i + 1] ?? '')
        i += 2
        continue
      }
      if (ch === "'") inSingleQuote = false
      current += ch
      i++
      continue
    }
    if (inComment) {
      if (ch === '*' && selector[i + 1] === '/') {
        inComment = false
        current += '*/'
        i += 2
        continue
      }
      current += ch
      i++
      continue
    }

    if (ch === '/' && selector[i + 1] === '*') {
      inComment = true
      current += '/*'
      i += 2
      continue
    }
    if (ch === '"') { inDoubleQuote = true; current += ch; i++; continue }
    if (ch === "'") { inSingleQuote = true; current += ch; i++; continue }

    if (ch === '(') parenDepth++
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1)
    else if (ch === '[') bracketDepth++
    else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1)

    if (ch === ',' && parenDepth === 0 && bracketDepth === 0) {
      parts.push(current)
      current = ''
      i++
      continue
    }

    current += ch
    i++
  }

  if (current.length > 0) parts.push(current)
  return parts
}
