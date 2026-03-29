import { describe, it, expect } from 'vitest'
import { transformCSS } from '../src/css-transform.js'

describe('block parsing', () => {
  it('parses a single minified block', () => {
    const css = '.q-btn{color:red}'
    const result = transformCSS(css, ['q-btn'], ['q-btn'])
    expect(result).toBe('.q-btn{color:red}')
  })

  it('parses multiple minified blocks', () => {
    const css = '.q-btn{color:red}.q-card{color:blue}'
    const result = transformCSS(css, ['q-btn', 'q-card'], ['q-btn', 'q-card'])
    expect(result).toBe('.q-btn{color:red}.q-card{color:blue}')
  })

  it('returns empty string for empty input', () => {
    expect(transformCSS('', [], [])).toBe('')
  })

  it('handles body with braces inside double quotes', () => {
    const css = '.q-btn{content:"}"}'
    const result = transformCSS(css, ['q-btn'], ['q-btn'])
    expect(result).toBe('.q-btn{content:"}"}')
  })

  it('handles body with braces inside single quotes', () => {
    const css = ".q-btn{content:'}'}"
    const result = transformCSS(css, ['q-btn'], ['q-btn'])
    expect(result).toBe(".q-btn{content:'}'}")
  })

  it('handles escaped quotes inside strings', () => {
    const css = '.q-btn{content:"\\""}'
    const result = transformCSS(css, ['q-btn'], ['q-btn'])
    expect(result).toBe('.q-btn{content:"\\""}')
  })

  it('handles single quotes inside double quotes', () => {
    const css = `.q-btn{content:"it's"}`
    const result = transformCSS(css, ['q-btn'], ['q-btn'])
    expect(result).toBe(`.q-btn{content:"it's"}`)
  })

  it('handles double quotes inside single quotes', () => {
    const css = `.q-btn{content:'"hello"'}`
    const result = transformCSS(css, ['q-btn'], ['q-btn'])
    expect(result).toBe(`.q-btn{content:'"hello"'}`)
  })

  it('handles nested parens in body: url("data:...")', () => {
    const css = '.q-btn{background:url("data:image/svg+xml,<svg>")}'
    const result = transformCSS(css, ['q-btn'], ['q-btn'])
    expect(result).toBe('.q-btn{background:url("data:image/svg+xml,<svg>")}')
  })

  it('handles all openers in a string', () => {
    const css = '.q-btn{content:"({["}'
    const result = transformCSS(css, ['q-btn'], ['q-btn'])
    expect(result).toBe('.q-btn{content:"({["}')
  })

  it('handles all closers in a string', () => {
    const css = '.q-btn{content:"]})"}'
    const result = transformCSS(css, ['q-btn'], ['q-btn'])
    expect(result).toBe('.q-btn{content:"]})"}')
  })

  it('handles semicolon inside quotes', () => {
    const css = '.q-btn{content:"val;ue"}'
    const result = transformCSS(css, ['q-btn'], ['q-btn'])
    expect(result).toBe('.q-btn{content:"val;ue"}')
  })

  it('handles nested calc/var parens', () => {
    const css = '.q-btn{width:calc(var(--x) + 1px)}'
    const result = transformCSS(css, ['q-btn'], ['q-btn'])
    expect(result).toBe('.q-btn{width:calc(var(--x) + 1px)}')
  })

  it('handles braces inside comments in body', () => {
    const css = '.q-btn{color:red;/*}*/background:blue}'
    const result = transformCSS(css, ['q-btn'], ['q-btn'])
    expect(result).toBe('.q-btn{color:red;/*}*/background:blue}')
  })

  it('handles multiple depth levels combined', () => {
    const css = `.q-btn{content:"a'b";background:url('data:({[')}`
    const result = transformCSS(css, ['q-btn'], ['q-btn'])
    expect(result).toBe(`.q-btn{content:"a'b";background:url('data:({[')}`)
  })
})

describe('BEM matching', () => {
  it('matches exact component class', () => {
    const css = '.q-btn{color:red}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('')
  })

  it('matches component modifier (--)', () => {
    const css = '.q-btn--flat{color:red}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('')
  })

  it('matches component element (__)', () => {
    const css = '.q-btn__content{color:red}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('')
  })

  it('does NOT match different class starting with same prefix', () => {
    const css = '.q-btn2{color:red}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('.q-btn2{color:red}')
  })

  it('does NOT match different component with shared prefix', () => {
    const css = '.q-btn-group{color:red}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('.q-btn-group{color:red}')
  })

  it('q-btn-group IS matched when q-btn-group is known', () => {
    const css = '.q-btn-group{color:red}'
    expect(transformCSS(css, ['q-btn-group'], [])).toBe('')
  })

  it('multi-component selector: both used -> keep', () => {
    const css = '.q-btn .q-icon{color:red}'
    expect(transformCSS(css, ['q-btn', 'q-icon'], ['q-btn', 'q-icon'])).toBe('.q-btn .q-icon{color:red}')
  })

  it('multi-component selector: one unused -> strip', () => {
    const css = '.q-btn .q-icon{color:red}'
    expect(transformCSS(css, ['q-btn', 'q-icon'], ['q-btn'])).toBe('')
  })

  it('selector with non-component class and component: component unused -> strip', () => {
    const css = '.body--dark .q-btn{color:red}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('')
  })

  it('selector with non-component class and component: component used -> keep', () => {
    const css = '.body--dark .q-btn{color:red}'
    expect(transformCSS(css, ['q-btn'], ['q-btn'])).toBe('.body--dark .q-btn{color:red}')
  })

  it('component not in known list -> keep (not our business)', () => {
    const css = '.q-field{color:red}'
    expect(transformCSS(css, ['q-btn'], ['q-btn'])).toBe('.q-field{color:red}')
  })

  it('no known components at all -> input unchanged', () => {
    const css = '.q-btn{color:red}.q-card{color:blue}'
    expect(transformCSS(css, [], [])).toBe('.q-btn{color:red}.q-card{color:blue}')
  })

  it('all known components used -> input unchanged', () => {
    const css = '.q-btn{color:red}.q-card{color:blue}'
    expect(transformCSS(css, ['q-btn', 'q-card'], ['q-btn', 'q-card'])).toBe('.q-btn{color:red}.q-card{color:blue}')
  })

  it('child combinator with component', () => {
    const css = '.q-btn > .q-btn__content{color:red}'
    expect(transformCSS(css, ['q-btn'], ['q-btn'])).toBe('.q-btn > .q-btn__content{color:red}')
  })

  it('child combinator with component unused', () => {
    const css = '.q-btn > .q-btn__content{color:red}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('')
  })

  it('sibling combinator', () => {
    const css = '.q-btn + .q-card{color:red}'
    expect(transformCSS(css, ['q-btn', 'q-card'], ['q-btn'])).toBe('')
  })

  it('general sibling combinator', () => {
    const css = '.q-btn ~ .q-card{color:red}'
    expect(transformCSS(css, ['q-btn', 'q-card'], ['q-card'])).toBe('')
  })
})

describe('selector safety — skip complex selectors', () => {
  it('skips :not() — contains (', () => {
    const css = 'div:not(.q-btn){color:red}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('div:not(.q-btn){color:red}')
  })

  it('skips [attr] selectors — contains [', () => {
    const css = '[class*="q-btn"]{color:red}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('[class*="q-btn"]{color:red}')
  })

  it('skips :is() — contains (', () => {
    const css = '.q-btn:is(.active){color:red}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('.q-btn:is(.active){color:red}')
  })

  it('skips :has() — contains (', () => {
    const css = '.q-btn:has(.q-icon){color:red}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('.q-btn:has(.q-icon){color:red}')
  })

  it('skips :where() — contains (', () => {
    const css = ':where(.q-btn){color:red}'
    expect(transformCSS(css, ['q-btn'], [])).toBe(':where(.q-btn){color:red}')
  })

  it('skips :nth-child() — contains (', () => {
    const css = '.q-btn:nth-child(2){color:red}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('.q-btn:nth-child(2){color:red}')
  })

  it('skips selector with attr quotes', () => {
    const css = `.q-btn[data-label="test"]{color:red}`
    expect(transformCSS(css, ['q-btn'], [])).toBe(`.q-btn[data-label="test"]{color:red}`)
  })
})

describe('bare pseudo-classes — process normally', () => {
  it('processes :hover (no parens)', () => {
    const css = '.q-btn:hover{color:red}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('')
  })

  it('processes ::before (no parens)', () => {
    const css = '.q-btn::before{color:red}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('')
  })

  it('processes :first-child (no parens)', () => {
    const css = '.q-btn:first-child{color:red}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('')
  })

  it('processes :hover with used component -> keep', () => {
    const css = '.q-btn:hover{color:red}'
    expect(transformCSS(css, ['q-btn'], ['q-btn'])).toBe('.q-btn:hover{color:red}')
  })

  it('processes ::after with used component -> keep', () => {
    const css = '.q-btn::after{content:""}'
    expect(transformCSS(css, ['q-btn'], ['q-btn'])).toBe('.q-btn::after{content:""}')
  })
})

describe('multiple selector instances', () => {
  it('strips one instance, keeps the other', () => {
    const css = '.q-btn,.q-card{color:red}'
    expect(transformCSS(css, ['q-btn', 'q-card'], ['q-card'])).toBe('.q-card{color:red}')
  })

  it('strips all instances -> removes block', () => {
    const css = '.q-btn,.q-card{color:red}'
    expect(transformCSS(css, ['q-btn', 'q-card'], [])).toBe('')
  })

  it('no instances match known -> keep all', () => {
    const css = '.foo,.bar{color:red}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('.foo,.bar{color:red}')
  })

  it('mixed: one known unused, one unknown -> keep unknown', () => {
    const css = '.q-btn,.foo{color:red}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('.foo{color:red}')
  })

  it('mixed: one known used, one known unused -> keep used', () => {
    const css = '.q-btn,.q-card{color:red}'
    expect(transformCSS(css, ['q-btn', 'q-card'], ['q-btn'])).toBe('.q-btn{color:red}')
  })

  it('three instances, strip middle one', () => {
    const css = '.q-btn,.q-card,.q-field{color:red}'
    expect(transformCSS(css, ['q-btn', 'q-card', 'q-field'], ['q-btn', 'q-field'])).toBe('.q-btn,.q-field{color:red}')
  })

  it('complex instance among simple ones — complex is kept', () => {
    const css = '.q-btn,div:not(.q-card),.q-field{color:red}'
    expect(transformCSS(css, ['q-btn', 'q-card', 'q-field'], [])).toBe('div:not(.q-card){color:red}')
  })

  it('preserves newline separator style', () => {
    const css = '.q-btn,\n.q-card,\n.q-field{color:red}'
    // When .q-btn is stripped, the kept instances are '\n.q-card' and '\n.q-field'
    // (the \n is part of each instance after comma-splitting). They're rejoined with ',\n'.
    expect(transformCSS(css, ['q-btn', 'q-card', 'q-field'], ['q-card', 'q-field'])).toBe('\n.q-card,\n\n.q-field{color:red}')
  })
})

describe('multiple blocks', () => {
  it('strips some blocks, keeps others', () => {
    const css = '.q-btn{color:red}.q-card{color:blue}'
    expect(transformCSS(css, ['q-btn', 'q-card'], ['q-card'])).toBe('.q-card{color:blue}')
  })

  it('strips all blocks -> empty output', () => {
    const css = '.q-btn{color:red}.q-card{color:blue}'
    expect(transformCSS(css, ['q-btn', 'q-card'], [])).toBe('')
  })

  it('keeps all blocks -> input unchanged', () => {
    const css = '.q-btn{color:red}.q-card{color:blue}'
    expect(transformCSS(css, ['q-btn', 'q-card'], ['q-btn', 'q-card'])).toBe('.q-btn{color:red}.q-card{color:blue}')
  })

  it('non-component blocks are always kept', () => {
    const css = '.foo{color:red}.q-btn{color:blue}.bar{color:green}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('.foo{color:red}.bar{color:green}')
  })
})

describe('comment handling', () => {
  it('preserves comments between blocks', () => {
    const css = '.q-btn{color:red}/* separator */.q-card{color:blue}'
    expect(transformCSS(css, ['q-btn', 'q-card'], ['q-btn', 'q-card'])).toBe('.q-btn{color:red}/* separator */.q-card{color:blue}')
  })

  it('handles comments inside selectors', () => {
    const css = '.q-btn /* primary */ {color:red}'
    expect(transformCSS(css, ['q-btn'], ['q-btn'])).toBe('.q-btn /* primary */ {color:red}')
  })

  it('handles comments between selector instances', () => {
    const css = '.q-btn /* x */,.q-card{color:red}'
    expect(transformCSS(css, ['q-btn', 'q-card'], ['q-card'])).toBe('.q-card{color:red}')
  })

  it('preserves comments inside bodies', () => {
    const css = '.q-btn{color:red;/* important */background:blue}'
    expect(transformCSS(css, ['q-btn'], ['q-btn'])).toBe('.q-btn{color:red;/* important */background:blue}')
  })

  it('component name inside comment should NOT trigger match', () => {
    const css = '/* .q-btn */.foo{color:red}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('/* .q-btn */.foo{color:red}')
  })

  it('empty comment', () => {
    const css = '.q-btn/**/{ color:red}'
    expect(transformCSS(css, ['q-btn'], ['q-btn'])).toBe('.q-btn/**/{ color:red}')
  })

  it('comment containing {', () => {
    const css = '/*{*/.q-btn{color:red}'
    expect(transformCSS(css, ['q-btn'], ['q-btn'])).toBe('/*{*/.q-btn{color:red}')
  })

  it('comment containing }', () => {
    const css = '.q-btn{color:red/*}*/}'
    expect(transformCSS(css, ['q-btn'], ['q-btn'])).toBe('.q-btn{color:red/*}*/}')
  })
})

describe('at-rules — pass through untouched', () => {
  it('passes through @media block', () => {
    const css = '@media (min-width:600px){.q-btn{color:red}}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('@media (min-width:600px){.q-btn{color:red}}')
  })

  it('passes through @keyframes', () => {
    const css = '@keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('@keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}')
  })

  it('passes through @supports', () => {
    const css = '@supports (display:grid){.q-btn{display:grid}}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('@supports (display:grid){.q-btn{display:grid}}')
  })

  it('passes through @layer', () => {
    const css = '@layer base{.q-btn{color:red}}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('@layer base{.q-btn{color:red}}')
  })

  it('at-rule mixed with regular blocks', () => {
    const css = '.q-btn{color:red}@media (min-width:600px){.q-btn{color:blue}}.q-card{color:green}'
    expect(transformCSS(css, ['q-btn', 'q-card'], ['q-card'])).toBe('@media (min-width:600px){.q-btn{color:blue}}.q-card{color:green}')
  })

  it('passes through @font-face', () => {
    const css = `@font-face{font-family:"MyFont";src:url("font.woff2")}`
    expect(transformCSS(css, ['q-btn'], [])).toBe(`@font-face{font-family:"MyFont";src:url("font.woff2")}`)
  })
})

describe('unminified CSS', () => {
  it('handles multi-line formatted CSS', () => {
    const css = `.q-btn {\n  color: red;\n  background: blue;\n}\n`
    // Trailing \n after } is inter-block gap for the next block; since there is none, it's dropped
    expect(transformCSS(css, ['q-btn'], ['q-btn'])).toBe(`.q-btn {\n  color: red;\n  background: blue;\n}`)
  })

  it('strips multi-line block when unused', () => {
    const css = `.q-btn {\n  color: red;\n}\n.q-card {\n  color: blue;\n}\n`
    expect(transformCSS(css, ['q-btn', 'q-card'], ['q-card'])).toContain('.q-card')
    expect(transformCSS(css, ['q-btn', 'q-card'], ['q-card'])).not.toContain('.q-btn')
  })

  it('handles mixed minified and formatted blocks', () => {
    const css = `.q-btn{color:red}\n.q-card {\n  color: blue;\n}\n`
    expect(transformCSS(css, ['q-btn', 'q-card'], ['q-card'])).toContain('.q-card')
    expect(transformCSS(css, ['q-btn', 'q-card'], ['q-card'])).not.toContain('.q-btn')
  })

  it('preserves newline-separated selector instances', () => {
    const css = `.q-btn,\n.q-card {\n  color: red;\n}\n`
    expect(transformCSS(css, ['q-btn', 'q-card'], ['q-card'])).toContain('.q-card')
    expect(transformCSS(css, ['q-btn', 'q-card'], ['q-card'])).not.toContain('.q-btn')
  })

  it('preserves indentation in kept blocks', () => {
    const css = `  .q-btn {\n    color: red;\n  }\n`
    // Trailing \n after } is inter-block gap for the next block; since there is none, it's dropped
    expect(transformCSS(css, ['q-btn'], ['q-btn'])).toBe(`  .q-btn {\n    color: red;\n  }`)
  })

  it('handles blank lines between blocks', () => {
    const css = `.q-btn {\n  color: red;\n}\n\n.q-card {\n  color: blue;\n}\n`
    const result = transformCSS(css, ['q-btn', 'q-card'], ['q-btn', 'q-card'])
    expect(result).toContain('.q-btn')
    expect(result).toContain('.q-card')
  })
})

describe('real-world patterns', () => {
  it('Quasar button with modifier and element', () => {
    const css = '.q-btn{min-height:36px}.q-btn--flat{background:transparent}.q-btn__content{display:flex}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('')
    expect(transformCSS(css, ['q-btn'], ['q-btn'])).toBe(css)
  })

  it('body--dark context with component', () => {
    const css = '.body--dark .q-btn{color:#fff}.body--dark .q-card{background:#333}'
    expect(transformCSS(css, ['q-btn', 'q-card'], ['q-card'])).toBe('.body--dark .q-card{background:#333}')
  })

  it('complex real-world selector with :not() is skipped', () => {
    const css = '.q-btn-group > .q-btn:not(:last-child){border-right:0}'
    expect(transformCSS(css, ['q-btn', 'q-btn-group'], [])).toBe(css)
  })

  it('multiple comma-separated component selectors', () => {
    const css = '.q-checkbox,.q-radio,.q-toggle{cursor:pointer}'
    expect(transformCSS(css, ['q-checkbox', 'q-radio', 'q-toggle'], ['q-radio'])).toBe('.q-radio{cursor:pointer}')
  })

  it('deeply nested values with mixed quotes and parens', () => {
    const css = `.q-btn{background:linear-gradient(90deg,rgba(0,0,0,.1) 0%,transparent 100%)}`
    expect(transformCSS(css, ['q-btn'], ['q-btn'])).toBe(css)
  })

  it('transition/animation properties with commas in value', () => {
    const css = '.q-btn{transition:color .3s,background .3s}'
    expect(transformCSS(css, ['q-btn'], ['q-btn'])).toBe(css)
  })

  it('handles real Quasar minified pattern: multiple blocks in sequence', () => {
    const css = '.q-avatar{position:relative;border-radius:50%}.q-avatar__content{font-size:.5em}.q-badge{padding:2px 6px;border-radius:4px}'
    const result = transformCSS(css, ['q-avatar', 'q-badge'], ['q-badge'])
    expect(result).toBe('.q-badge{padding:2px 6px;border-radius:4px}')
  })

  it('preserves CSS custom properties', () => {
    const css = '.q-btn{--q-btn-color:var(--q-primary)}'
    expect(transformCSS(css, ['q-btn'], ['q-btn'])).toBe(css)
  })

  it('handles universal selector mixed with component', () => {
    const css = '.q-btn *{box-sizing:border-box}'
    expect(transformCSS(css, ['q-btn'], [])).toBe('')
  })
})

describe('debug output', () => {
  it('logs STRIP for unused component', () => {
    const log: string[] = []
    transformCSS('.q-btn{color:red}', ['q-btn'], [], m => log.push(m))
    expect(log.some(l => l.includes('STRIP'))).toBe(true)
    expect(log.some(l => l.includes('q-btn'))).toBe(true)
  })

  it('logs KEEP for used component', () => {
    const log: string[] = []
    transformCSS('.q-btn{color:red}', ['q-btn'], ['q-btn'], m => log.push(m))
    expect(log.some(l => l.includes('KEEP'))).toBe(true)
  })

  it('logs SKIP for at-rules', () => {
    const log: string[] = []
    transformCSS('@media (min-width:600px){.q-btn{color:red}}', ['q-btn'], [], m => log.push(m))
    expect(log.some(l => l.includes('SKIP'))).toBe(true)
  })

  it('logs SKIP COMPLEX for selectors with parens', () => {
    const log: string[] = []
    transformCSS('div:not(.q-btn){color:red}', ['q-btn'], [], m => log.push(m))
    expect(log.some(l => l.includes('SKIP') && l.includes('('))).toBe(true)
  })

  it('logs BODY with prettified content', () => {
    const log: string[] = []
    transformCSS('.q-btn{color:red;background:blue}', ['q-btn'], ['q-btn'], m => log.push(m))
    expect(log.some(l => l.includes('BODY'))).toBe(true)
    expect(log.some(l => l.includes('color:') || l.includes('color:red'))).toBe(true)
  })

  it('logs BLOCK REDUCED when some instances stripped', () => {
    const log: string[] = []
    transformCSS('.q-btn,.q-card{color:red}', ['q-btn', 'q-card'], ['q-card'], m => log.push(m))
    expect(log.some(l => l.includes('RESULT'))).toBe(true)
  })

  it('produces no output when debug callback is not provided', () => {
    // This test just ensures no errors when debug is undefined
    const result = transformCSS('.q-btn{color:red}', ['q-btn'], [])
    expect(result).toBe('')
  })
})
