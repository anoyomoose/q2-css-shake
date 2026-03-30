import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
// Use inline types to avoid version mismatches when the consumer has a
// different vite version than what we built against.
interface VitePlugin {
  name: string
  enforce?: 'pre' | 'post'
  configResolved?: (config: any) => void
  renderChunk?: (code: string, chunk: any) => null
  generateBundle?: (options: any, bundle: Record<string, any>) => void
}

import { transformCSS } from './css-transform.js'
import { pascalToBem, scanComponentDir } from './component-scan.js'
import { extractGlyphNames, discoverIconCssFiles, deriveIconPrefixes, scanJsForIcons } from './icon-scan.js'

export interface CssShakeOptions {
  /** Package subpaths to scan for component files, e.g. 'quasar/src/components' */
  scan: string[]
  /** Components to always keep (never strip). Accepts QBtn or q-btn format. */
  keep?: string[]
  /** Shake unused icon glyph CSS from @quasar/extras icon packs. */
  icons?: boolean
  /** Log known/used components and per-file size changes to console. */
  debug?: boolean
}

/**
 * Resolve a package subpath like 'quasar/src/components' to an absolute directory.
 * Uses the app root for module resolution so it finds the app's installed packages.
 *
 * Can't use require.resolve('pkg/package.json') because packages with an "exports"
 * field may not expose it. Instead, resolve any entry point and walk up to find
 * the package root (the directory containing package.json).
 */
function resolvePackagePath(entry: string, appRoot: string): string {
  const req = createRequire(resolve(appRoot, 'package.json'))
  const pkgName = entry.match(/^(@[^/]+\/[^/]+|[^/]+)/)![0]
  const subpath = entry.slice(pkgName.length + 1)

  // Resolve the package's main entry point, then walk up to find package.json
  const entryPoint = req.resolve(pkgName)
  let dir = dirname(entryPoint)
  while (dir !== dirname(dir)) {
    if (existsSync(resolve(dir, 'package.json'))) {
      return resolve(dir, subpath)
    }
    dir = dirname(dir)
  }

  // Fallback
  return resolve(dirname(entryPoint), subpath)
}

/**
 * Normalize a keep entry (QBtn or q-btn format) to BEM.
 */
function normalizeKeep(name: string): string {
  // If it starts with uppercase, try PascalCase conversion
  if (/^[A-Z]/.test(name)) {
    const bem = pascalToBem(name)
    if (bem !== null) return bem
  }
  // Already in BEM format or doesn't match PascalCase rules
  return name
}

export function cssShakePlugin(options: CssShakeOptions): VitePlugin {
  let knownComponents: string[] = []
  let resolvedScanDirs: string[] = []
  let knownIcons: Set<string> = new Set()
  let iconPrefixes: string[] = []
  const usedIcons = new Set<string>()

  return {
    name: 'vite:q2-css-shake',
    enforce: 'post',

    configResolved(config: any) {
      const knownSet = new Set<string>()
      resolvedScanDirs = []

      // Resolve and scan each package path
      for (const entry of options.scan) {
        const scanDir = resolvePackagePath(entry, config.root)
        resolvedScanDirs.push(scanDir)
        for (const bem of scanComponentDir(scanDir)) {
          knownSet.add(bem)
        }
      }

      // Remove "keep" entries from known set
      if (options.keep) {
        for (const name of options.keep) {
          knownSet.delete(normalizeKeep(name))
        }
      }

      knownComponents = [...knownSet].sort()

      if (options.debug) {
        console.log(`[css-shake] Known components (${knownComponents.length}): ${knownComponents.join(', ')}`)
      }

      if (options.icons) {
        const extrasPath = resolvePackagePath('@quasar/extras', config.root)
        const cssFiles = discoverIconCssFiles(extrasPath)

        for (const file of cssFiles) {
          const css = readFileSync(file, 'utf-8')
          for (const name of extractGlyphNames(css)) {
            knownIcons.add(name)
          }
        }

        // Apply keeps to icons too
        if (options.keep) {
          for (const name of options.keep) {
            knownIcons.delete(normalizeKeep(name))
          }
        }

        iconPrefixes = deriveIconPrefixes(knownIcons)

        if (options.debug) {
          console.log(`[css-shake] Icon packs: ${cssFiles.length} CSS files, ${knownIcons.size} glyph rules`)
          console.log(`[css-shake] Icon prefixes: ${iconPrefixes.join(', ')}`)
        }
      }
    },

    renderChunk(code: string, _chunk: any) {
      if (knownIcons.size === 0) return null

      const found = scanJsForIcons(code, knownIcons, iconPrefixes)
      for (const name of found) {
        usedIcons.add(name)
      }

      return null
    },

    generateBundle(_options, bundle) {
      if (knownComponents.length === 0 && knownIcons.size === 0) return

      // Step 1: component CSS shaking
      if (knownComponents.length > 0) {
        const usedSet = new Set<string>()

        for (const item of Object.values(bundle)) {
          if (item.type !== 'chunk') continue
          for (const moduleId of Object.keys(item.modules)) {
            const matchedDir = resolvedScanDirs.find(dir => moduleId.startsWith(dir))
            if (!matchedDir) continue
            const parts = moduleId.split('/')
            const filename = parts[parts.length - 1]
            const baseName = filename.split('.')[0]
            const bem = pascalToBem(baseName)
            if (bem !== null) {
              usedSet.add(bem)
            }
          }
        }

        const usedComponents = [...usedSet].sort()

        if (options.debug) {
          console.log(`[css-shake] Used components (${usedComponents.length}): ${usedComponents.join(', ')}`)
          const unused = knownComponents.filter(c => !usedSet.has(c))
          console.log(`[css-shake] Unused components (${unused.length}): ${unused.join(', ')}`)
        }

        for (const item of Object.values(bundle)) {
          if (item.type !== 'asset' || !item.fileName.endsWith('.css')) continue
          if (typeof item.source !== 'string') continue

          const inputSize = item.source.length
          item.source = transformCSS(item.source, knownComponents, usedComponents)

          if (options.debug) {
            const outputSize = item.source.length
            const saved = inputSize - outputSize
            const pct = inputSize > 0 ? ((saved / inputSize) * 100).toFixed(1) : '0'
            console.log(`[css-shake] ${item.fileName}: ${inputSize} -> ${outputSize} (${pct}% reduction)`)
          }
        }
      }

      // Step 2: icon CSS shaking (second pass)
      if (knownIcons.size > 0) {
        const knownIconArr = [...knownIcons].sort()
        const usedIconArr = [...usedIcons].sort()

        if (options.debug) {
          console.log(`[css-shake] Icons used: ${usedIconArr.length} of ${knownIconArr.length}`)
        }

        for (const item of Object.values(bundle)) {
          if (item.type !== 'asset' || !item.fileName.endsWith('.css')) continue
          if (typeof item.source !== 'string') continue

          const beforeIcons = item.source.length
          item.source = transformCSS(item.source, knownIconArr, usedIconArr)

          if (options.debug && item.source.length !== beforeIcons) {
            const saved = beforeIcons - item.source.length
            const pct = beforeIcons > 0 ? ((saved / beforeIcons) * 100).toFixed(1) : '0'
            console.log(`[css-shake] ${item.fileName} icons: ${beforeIcons} -> ${item.source.length} (${pct}% reduction)`)
          }
        }
      }
    },
  }
}
