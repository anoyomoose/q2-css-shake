import { describe, it, expect } from 'vitest'
import { pascalToBem, scanComponentDir } from '../src/component-scan.js'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

describe('pascalToBem', () => {
  it('converts QBtn to q-btn', () => {
    expect(pascalToBem('QBtn')).toBe('q-btn')
  })

  it('converts QBtnGroup to q-btn-group', () => {
    expect(pascalToBem('QBtnGroup')).toBe('q-btn-group')
  })

  it('converts QBtnDropdown to q-btn-dropdown', () => {
    expect(pascalToBem('QBtnDropdown')).toBe('q-btn-dropdown')
  })

  it('converts QCard to q-card', () => {
    expect(pascalToBem('QCard')).toBe('q-card')
  })

  it('converts QCircularProgress to q-circular-progress', () => {
    expect(pascalToBem('QCircularProgress')).toBe('q-circular-progress')
  })

  it('converts QVirtualScroll to q-virtual-scroll', () => {
    expect(pascalToBem('QVirtualScroll')).toBe('q-virtual-scroll')
  })

  it('returns null for lowercase name', () => {
    expect(pascalToBem('index')).toBeNull()
  })

  it('returns null for single uppercase letter name', () => {
    expect(pascalToBem('Q')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(pascalToBem('')).toBeNull()
  })

  it('returns null for name with only one uppercase', () => {
    expect(pascalToBem('Utils')).toBeNull()
  })

  it('handles two-letter component like QA', () => {
    expect(pascalToBem('QA')).toBe('q-a')
  })

  it('converts consecutive uppercase: QHTMLElement', () => {
    expect(pascalToBem('QHTMLElement')).toBe('q-h-t-m-l-element')
  })
})

describe('scanComponentDir', () => {
  const tmpDir = join(import.meta.dirname, '..', '.test-scan-tmp')

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

  it('finds .js component files', () => {
    setup({
      'QBtn.js': '',
      'QCard.js': '',
    })
    expect(scanComponentDir(tmpDir)).toEqual(['q-btn', 'q-card'])
    cleanup()
  })

  it('finds .ts component files', () => {
    setup({
      'QBtn.ts': '',
    })
    expect(scanComponentDir(tmpDir)).toEqual(['q-btn'])
    cleanup()
  })

  it('case-insensitive extension: .JS, .TS', () => {
    setup({
      'QBtn.JS': '',
      'QCard.TS': '',
    })
    expect(scanComponentDir(tmpDir)).toEqual(['q-btn', 'q-card'])
    cleanup()
  })

  it('skips non-.js/.ts files', () => {
    setup({
      'QBtn.js': '',
      'QBtn.sass': '',
      'QBtn.json': '',
      'QBtn.css': '',
    })
    expect(scanComponentDir(tmpDir)).toEqual(['q-btn'])
    cleanup()
  })

  it('skips files not starting with uppercase', () => {
    setup({
      'QBtn.js': '',
      'index.js': '',
      'use-btn.js': '',
    })
    expect(scanComponentDir(tmpDir)).toEqual(['q-btn'])
    cleanup()
  })

  it('skips files with only one uppercase letter', () => {
    setup({
      'QBtn.js': '',
      'Utils.js': '',
    })
    expect(scanComponentDir(tmpDir)).toEqual(['q-btn'])
    cleanup()
  })

  it('scans recursively', () => {
    setup({
      'btn/QBtn.js': '',
      'card/QCard.js': '',
      'btn-group/QBtnGroup.js': '',
    })
    expect(scanComponentDir(tmpDir)).toEqual(['q-btn', 'q-btn-group', 'q-card'])
    cleanup()
  })

  it('deduplicates components found in multiple dirs', () => {
    setup({
      'a/QBtn.js': '',
      'b/QBtn.ts': '',
    })
    expect(scanComponentDir(tmpDir)).toEqual(['q-btn'])
    cleanup()
  })

  it('returns empty for empty directory', () => {
    setup({})
    mkdirSync(tmpDir, { recursive: true })
    expect(scanComponentDir(tmpDir)).toEqual([])
    cleanup()
  })

  it('returns empty for nonexistent directory', () => {
    expect(scanComponentDir('/tmp/nonexistent-q2-test-dir')).toEqual([])
  })

  it('handles files with multiple dots: QBtn.test.js', () => {
    setup({
      'QBtn.test.js': '',
    })
    // First part before dot is "QBtn" -> valid
    expect(scanComponentDir(tmpDir)).toEqual(['q-btn'])
    cleanup()
  })

  it('works on real Quasar component directory', () => {
    const quasarComponents = '/home/jorrit/quasar_theming/quasar_theme/ui/src/components'
    const result = scanComponentDir(quasarComponents)
    expect(result).toContain('q-btn')
    expect(result).toContain('q-card')
    expect(result).toContain('q-avatar')
    expect(result).toContain('q-virtual-scroll')
    expect(result.length).toBeGreaterThan(50)
  })
})
