#!/usr/bin/env node

import { readFileSync, statSync } from 'node:fs'
import { transformCSS } from './css-transform.js'
import { scanComponentDir } from './component-scan.js'

function usage(): never {
  console.error('Usage:')
  console.error('  q2-css-shake <dir>                                          Scan for components')
  console.error('  q2-css-shake <file.css> --known comp1,comp2,... --used comp1,comp2,...  Transform CSS')
  console.error('')
  console.error('If the first argument is a directory, scans recursively for component files')
  console.error('and outputs BEM names as a comma-separated list (usable as --known/--used input).')
  console.error('')
  console.error('If the first argument is a file, transforms the CSS by stripping rules for')
  console.error('unused components. Transformed CSS goes to stdout, debug log to stderr.')
  console.error('')
  console.error('Examples:')
  console.error('  q2-css-shake node_modules/quasar/src/components')
  console.error('  q2-css-shake dist/quasar.prod.css --known q-btn,q-card --used q-btn > out.css')
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

// Transform mode
let known: string[] = []
let used: string[] = []

for (let i = 3; i < process.argv.length; i++) {
  const arg = process.argv[i]
  if (arg === '--known' && i + 1 < process.argv.length) {
    known = process.argv[i + 1].split(',').map(s => s.trim()).filter(Boolean)
    i++
  } else if (arg === '--used' && i + 1 < process.argv.length) {
    used = process.argv[i + 1].split(',').map(s => s.trim()).filter(Boolean)
    i++
  } else {
    console.error(`Unknown argument: ${arg}`)
    usage()
  }
}

if (known.length === 0) {
  console.error('Error: --known is required for transform mode')
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

const result = transformCSS(css, known, used, (msg) => {
  console.error(msg)
})

process.stdout.write(result)
