#!/usr/bin/env node

import { readFileSync, statSync } from 'node:fs'
import { transformCSS } from './css-transform.js'
import { scanComponentDir } from './component-scan.js'
import { extractGlyphNames, deriveIconPrefixes, scanJsForIcons } from './icon-scan.js'

function usage(): never {
  console.error('Usage:')
  console.error('  q2-css-shake <dir>                                          Scan for components')
  console.error('  q2-css-shake <file.css> --known comp1,comp2,... --used comp1,comp2,...  Transform CSS')
  console.error('  q2-css-shake <file.css> --js bundle.js                      Icon shaking')
  console.error('  q2-css-shake <file.css> --known ... --used ... --js bundle.js  Both')
  console.error('')
  console.error('If the first argument is a directory, scans recursively for component files')
  console.error('and outputs BEM names as a comma-separated list.')
  console.error('')
  console.error('If the first argument is a file, transforms the CSS:')
  console.error('  --known/--used   Strip unused component CSS')
  console.error('  --js <file>      Strip unused icon glyph CSS (scans JS for icon strings)')
  console.error('')
  console.error('Transformed CSS goes to stdout, debug log to stderr.')
  console.error('')
  console.error('Examples:')
  console.error('  q2-css-shake node_modules/quasar/src/components')
  console.error('  q2-css-shake dist/quasar.prod.css --known q-btn,q-card --used q-btn > out.css')
  console.error('  q2-css-shake dist/mdi-v7.css --js dist/bundle.js > out.css')
  process.exit(1)
}

const target = process.argv[2]
if (!target) usage()

// Auto-detect: directory → scan, file → transform
let isDir = false
try {
  isDir = statSync(target).isDirectory()
} catch {
  console.error(`Error: cannot access ${target}`)
  process.exit(1)
}

if (isDir) {
  const bems = scanComponentDir(target)
  process.stdout.write(bems.join(',') + '\n')
  process.exit(0)
}

// Transform mode — parse args
let known: string[] = []
let used: string[] = []
let jsFile: string | null = null

for (let i = 3; i < process.argv.length; i++) {
  const arg = process.argv[i]
  if (arg === '--known' && i + 1 < process.argv.length) {
    known = process.argv[i + 1].split(',').map(s => s.trim()).filter(Boolean)
    i++
  } else if (arg === '--used' && i + 1 < process.argv.length) {
    used = process.argv[i + 1].split(',').map(s => s.trim()).filter(Boolean)
    i++
  } else if (arg === '--js' && i + 1 < process.argv.length) {
    jsFile = process.argv[i + 1]
    i++
  } else {
    console.error(`Unknown argument: ${arg}`)
    usage()
  }
}

if (known.length === 0 && !jsFile) {
  console.error('Error: --known or --js is required for transform mode')
  usage()
}

let css: string
try {
  css = readFileSync(target, 'utf-8')
} catch (e) {
  console.error(`Error reading file: ${target}`)
  console.error((e as Error).message)
  process.exit(1)
}

const debug = (msg: string) => console.error(msg)

// Pass 1: component shaking
if (known.length > 0) {
  css = transformCSS(css, known, used, debug)
}

// Pass 2: icon shaking
if (jsFile) {
  let jsCode: string
  try {
    jsCode = readFileSync(jsFile, 'utf-8')
  } catch (e) {
    console.error(`Error reading JS file: ${jsFile}`)
    console.error((e as Error).message)
    process.exit(1)
  }

  // Extract glyph names from the (possibly already component-shaken) CSS as the "known" set
  const glyphNames = extractGlyphNames(css)
  const knownIcons = new Set(glyphNames)
  const prefixes = deriveIconPrefixes(knownIcons, 1)

  debug(`[icons] Known glyphs: ${knownIcons.size}, prefixes: ${prefixes.join(', ')}`)

  // Scan JS for used icons
  const usedIcons = scanJsForIcons(jsCode, knownIcons, prefixes)

  debug(`[icons] Used: ${usedIcons.size} of ${knownIcons.size}`)

  // Strip unused icon CSS
  css = transformCSS(css, glyphNames, [...usedIcons], debug)
}

process.stdout.write(css)
