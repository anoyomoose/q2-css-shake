import { describe, it, expect } from 'vitest'
import { extractGlyphNames, deriveIconPrefixes, scanJsForIcons, discoverIconCssFiles } from '../src/icon-scan.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

describe('extractGlyphNames', () => {
  it('extracts MDI glyph: .mdi-account::before { content: "\\F0004" }', () => {
    const css = '.mdi-account::before{content:"\\F0004"}'
    expect(extractGlyphNames(css)).toEqual(['mdi-account'])
  })

  it('extracts FA v6 glyph: .fa-check { --fa: "\\f00c" }', () => {
    const css = '.fa-check{--fa:"\\f00c"}'
    expect(extractGlyphNames(css)).toEqual(['fa-check'])
  })

  it('extracts FA v5 glyph: .fa-check::before { content: "\\f00c" }', () => {
    const css = '.fa-check::before{content:"\\f00c"}'
    expect(extractGlyphNames(css)).toEqual(['fa-check'])
  })

  it('extracts Bootstrap glyph: .bi-check::before { content: "\\f00c" }', () => {
    const css = '.bi-check::before{content:"\\f00c"}'
    expect(extractGlyphNames(css)).toEqual(['bi-check'])
  })

  it('extracts Themify glyph', () => {
    const css = '.ti-arrow::before{content:"\\e600"}'
    expect(extractGlyphNames(css)).toEqual(['ti-arrow'])
  })

  it('extracts Ionicons glyph with direct unicode', () => {
    const css = '.ion-md-home:before{content:"\uF100"}'
    expect(extractGlyphNames(css)).toEqual(['ion-md-home'])
  })

  it('extracts glyph with single quotes', () => {
    const css = ".mdi-account::before{content:'\\F0004'}"
    expect(extractGlyphNames(css)).toEqual(['mdi-account'])
  })

  it('does NOT extract utility: .fa-2x { font-size: 2em }', () => {
    expect(extractGlyphNames('.fa-2x{font-size:2em}')).toEqual([])
  })

  it('does NOT extract multi-property rule', () => {
    expect(extractGlyphNames('.mdi-spin::before{animation:mdi-spin 2s infinite linear}')).toEqual([])
  })

  it('does NOT extract @font-face', () => {
    expect(extractGlyphNames('@font-face{font-family:"MDI";src:url("font.woff2")}')).toEqual([])
  })

  it('does NOT extract base class with multiple properties', () => {
    expect(extractGlyphNames('.mdi:before{display:inline-block;font:normal normal normal 24px/1 "MDI"}')).toEqual([])
  })

  it('extracts multiple glyphs from mixed file', () => {
    const css = '.fa-solid{font-weight:900}.fa-check{--fa:"\\f00c"}.fa-2x{font-size:2em}.fa-home{--fa:"\\f015"}@font-face{font-family:"FA";src:url("fa.woff2")}'
    expect(extractGlyphNames(css)).toEqual(['fa-check', 'fa-home'])
  })

  it('handles unminified CSS', () => {
    const css = `.mdi-account::before {\n  content: "\\F0004";\n}\n`
    expect(extractGlyphNames(css)).toEqual(['mdi-account'])
  })

  it('handles content with semicolon and trailing whitespace', () => {
    expect(extractGlyphNames('.mdi-account::before { content: "\\F0004"; }')).toEqual(['mdi-account'])
  })

  it('extracts from real MDI minified pattern', () => {
    const css = '.mdi-ab-testing::before{content:"\\F01C9"}.mdi-abacus::before{content:"\\F16E0"}'
    expect(extractGlyphNames(css)).toEqual(['mdi-ab-testing', 'mdi-abacus'])
  })

  it('extracts from real Bootstrap single-line pattern', () => {
    const css = '.bi-123::before { content: "\\f67f"; }\n.bi-alarm-fill::before { content: "\\f101"; }'
    expect(extractGlyphNames(css)).toEqual(['bi-123', 'bi-alarm-fill'])
  })

  it('handles Eva icons format', () => {
    const css = '.eva-activity::before {\n    content: "\\ea01";\n}'
    expect(extractGlyphNames(css)).toEqual(['eva-activity'])
  })

  it('does NOT extract rule with content plus other properties', () => {
    expect(extractGlyphNames('.fa-sr-only{content:"";border:0;clip:rect(0,0,0,0)}')).toEqual([])
  })
})

describe('deriveIconPrefixes', () => {
  it('derives prefixes from icon names', () => {
    const known = new Set(['mdi-account', 'mdi-home', 'mdi-check', 'fa-arrow', 'fa-check'])
    expect(deriveIconPrefixes(known, 2).sort()).toEqual(['fa-', 'mdi-'])
  })

  it('skips prefixes below minCount', () => {
    const known = new Set(['mdi-account', 'mdi-home', 'mdi-check', 'fa-arrow'])
    expect(deriveIconPrefixes(known, 2)).toEqual(['mdi-'])
  })

  it('returns empty for empty set', () => {
    expect(deriveIconPrefixes(new Set(), 1)).toEqual([])
  })

  it('handles names without hyphens', () => {
    expect(deriveIconPrefixes(new Set(['icon1', 'icon2']), 1)).toEqual([])
  })

  it('groups ion- prefix correctly', () => {
    const known = new Set(['ion-md-home', 'ion-md-star', 'ion-ios-home', 'ion-ios-star'])
    expect(deriveIconPrefixes(known, 2)).toEqual(['ion-'])
  })
})

describe('scanJsForIcons', () => {
  it('finds icon name in string literal', () => {
    const found = scanJsForIcons('const icon = "mdi-account"', new Set(['mdi-account', 'mdi-home']), ['mdi-'])
    expect(found).toEqual(new Set(['mdi-account']))
  })

  it('finds icon in template literal', () => {
    const found = scanJsForIcons('const x = `icon: mdi-account`', new Set(['mdi-account']), ['mdi-'])
    expect(found).toEqual(new Set(['mdi-account']))
  })

  it('finds icon in object property', () => {
    const found = scanJsForIcons('{ icon: "mdi-account", size: 24 }', new Set(['mdi-account']), ['mdi-'])
    expect(found).toEqual(new Set(['mdi-account']))
  })

  it('does not match partial name', () => {
    const found = scanJsForIcons('"mdi-acc"', new Set(['mdi-account']), ['mdi-'])
    expect(found).toEqual(new Set())
  })

  it('does not match extended name', () => {
    const found = scanJsForIcons('"mdi-account-plus"', new Set(['mdi-account']), ['mdi-'])
    expect(found).toEqual(new Set())
  })

  it('finds multiple icons across prefixes', () => {
    const found = scanJsForIcons('"mdi-account" + "fa-check"', new Set(['mdi-account', 'mdi-home', 'fa-check', 'fa-arrow']), ['mdi-', 'fa-'])
    expect(found).toEqual(new Set(['mdi-account', 'fa-check']))
  })

  it('returns empty when nothing found', () => {
    const found = scanJsForIcons('const x = 42', new Set(['mdi-account']), ['mdi-'])
    expect(found).toEqual(new Set())
  })

  it('deduplicates multiple occurrences', () => {
    const found = scanJsForIcons('"mdi-account" + "mdi-account"', new Set(['mdi-account']), ['mdi-'])
    expect(found).toEqual(new Set(['mdi-account']))
  })

  it('finds FA icon in multi-class string', () => {
    const found = scanJsForIcons('"fab fa-42-group"', new Set(['fa-42-group']), ['fa-'])
    expect(found).toEqual(new Set(['fa-42-group']))
  })
})

describe('discoverIconCssFiles', () => {
  const tmpDir = join(import.meta.dirname, '..', '.test-icon-discover-tmp')

  function setup(files: Record<string, string>) {
    rmSync(tmpDir, { recursive: true, force: true })
    for (const [path, content] of Object.entries(files)) {
      const fullPath = join(tmpDir, path)
      const dir = fullPath.substring(0, fullPath.lastIndexOf('/'))
      mkdirSync(dir, { recursive: true })
      writeFileSync(fullPath, content)
    }
  }

  function cleanup() {
    rmSync(tmpDir, { recursive: true, force: true })
  }

  it('finds CSS in directories with icons.json', () => {
    setup({
      'mdi-v7/icons.json': '[]',
      'mdi-v7/mdi-v7.css': '.mdi-account::before{content:"\\F0004"}',
      'roboto-font/roboto-font.css': '@font-face{font-family:"Roboto"}',
    })
    const files = discoverIconCssFiles(tmpDir)
    expect(files).toHaveLength(1)
    expect(files[0]).toContain('mdi-v7.css')
    cleanup()
  })

  it('finds multiple packs', () => {
    setup({
      'mdi-v7/icons.json': '[]',
      'mdi-v7/mdi-v7.css': '.mdi-account::before{content:"\\F0004"}',
      'fa-v6/icons.json': '[]',
      'fa-v6/fontawesome-v6.css': '.fa-check{--fa:"\\f00c"}',
    })
    const files = discoverIconCssFiles(tmpDir)
    expect(files).toHaveLength(2)
    cleanup()
  })

  it('skips directories without icons.json', () => {
    setup({
      'roboto-font/roboto-font.css': '@font-face{}',
      'mdi-v7/icons.json': '[]',
      'mdi-v7/mdi-v7.css': '.mdi-a::before{content:"x"}',
    })
    const files = discoverIconCssFiles(tmpDir)
    expect(files).toHaveLength(1)
    cleanup()
  })

  it('returns empty for no icon packs', () => {
    setup({ 'roboto-font/roboto-font.css': '@font-face{}' })
    const files = discoverIconCssFiles(tmpDir)
    expect(files).toEqual([])
    cleanup()
  })

  it('works on real @quasar/extras', () => {
    const extrasDir = '/home/jorrit/python/omnes/omnes-router-portal/frontend/node_modules/.pnpm/@quasar+extras@1.17.0/node_modules/@quasar/extras'
    const files = discoverIconCssFiles(extrasDir)
    expect(files.length).toBeGreaterThan(5)
    expect(files.some(f => f.includes('mdi-v7'))).toBe(true)
    expect(files.some(f => f.includes('fontawesome'))).toBe(true)
    expect(files.some(f => f.includes('roboto'))).toBe(false)
  })
})
