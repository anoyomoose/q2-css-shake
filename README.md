# @anoyomoose/q2-css-shake

CSS tree-shaking for Quasar Framework. Strips unused component styles and icon font glyphs from production builds.

Quasar ships CSS for all 100+ components, and icon packs like MDI v7 include 7,000+ glyph definitions. Most applications use a fraction of these. This plugin analyzes your production bundle to determine which components and icons are actually used, then removes the rest from the CSS output.

## Results

Typical reductions on real applications (uncompressed):

| Target                    | Before | After  | Reduction |
|---------------------------|--------|--------|-----------|
| Component CSS             | 197 kB | 106 kB | 46%       |
| MDI v7 icon CSS           | 418 kB | 7 kB   | 98%       |
| Quasar's UI Playground    | 836 kB | 355 kB | 58%       |
| One of our own dashboards | 522 kB | 161 kB | 69%       |

Utility classes are *not* stripped as their usage is hard to detect, and Quasar adds them dynamically. This is about half of Quasar's built-in CSS. Perhaps something for a future version.

Note that the actual utility of this is debatable as CSS files are mostly served gzipped, and while the savings are similar expressed in percentages, in absolute terms it saves perhaps 100 kB on a large project or 30 kB on a small one.

This was built mostly to see if it could be done and what the result would be on our own projects, your mileage may vary. This is not
an officially supported Quasar plugin, and may break with future Quasar versions.

## Installation

```bash
pnpm add -D @anoyomoose/q2-css-shake
```

## Vite Plugin

### Quasar CLI (`quasar.config.js` / `quasar.config.ts`)

```js
import { cssShakePlugin } from '@anoyomoose/q2-css-shake'

export default defineConfig(() => ({
  build: {
    vitePlugins: [
      cssShakePlugin({
        scan: [
          'quasar/src/components',
        ],
        icons: true,
        debug: true,
      })
    ],
  },
}))
```

### Plain Vite (`vite.config.ts`)

```ts
import { cssShakePlugin } from '@anoyomoose/q2-css-shake'

export default defineConfig({
  plugins: [
    cssShakePlugin({
      scan: ['quasar/src/components'],
      icons: true,
    })
  ],
})
```

## Options

### `scan` (required)

Array of package subpaths to scan for component files. Each entry is resolved from your project root using Node module resolution.

```js
scan: [
  'quasar/src/components',  // always include this
  '@anoyomoose/q2-fresh-paint-md3e/dist/components',  // if you're using it
]
```

The plugin recursively scans these directories for files matching the PascalCase component naming convention (e.g. `QBtn.js`, `Md3eBtn.js`), converts them to BEM format (`q-btn`, `md3e-btn`), and builds the "known components" list.

During the production build, the plugin checks which of these component modules actually appear in the bundled chunks. CSS rules targeting components that were tree-shaken from the JS are stripped from the CSS output.

**IMPORTANT** Barrel imports for third-party components are not tracked. If you import components from an `index.js` which in turn imports all individual components from their source files, all of them will be seen as used. Tracking only works if you directly import from the file that defines the target component **only**. This is not an issue for Quasar's own included components in the default setup if you import from `'quasar'` or don't explicitly import at all. Quasar's Vite plugin rewrites the import statements in the supported format automatically.   

### `icons` (default: `false`)

Enable icon glyph CSS shaking. When `true`, the plugin:

1. Resolves `@quasar/extras` from your project and discovers all installed icon packs (any directory containing an `icons.json` file).
2. Parses the icon CSS files to identify glyph rules -- rules whose body contains only a `content` or `--fa` property with a string value.
3. During bundling, scans the JS output for icon name strings (e.g. `"mdi-account"`, `"fa-check"`).
4. Strips glyph rules for icons that don't appear anywhere in the JS.

Utility classes (sizing, animation, transforms) are never stripped -- only glyph definitions.

Supported icon packs: MDI (v3--v7), FontAwesome (v5, v6), Bootstrap Icons, Eva Icons, Ionicons v4, Line Awesome, Themify. Material Icons and Material Symbols use font ligatures and have no per-icon CSS, so they are unaffected.

**IMPORTANT** This cannot detect dynamic icon names (`mdi-${name}`) and is therefore disabled by default. Any icons used dynamically need to be added to `keep`. Probably not an issue for many projects, but you should definitely do a build and check if you're missing any icons before using this in production. 

### `keep` (default: `[]`)

Array of component or icon names to exclude from shaking. Accepts PascalCase (`QBtn`) or BEM format (`q-btn`). Use this for components or icons referenced dynamically in ways the plugin cannot detect.

```js
keep: ['QFormChildMixin', 'mdi-loading']
```

### `debug` (default: `false`)

Log detailed information to the console during builds:

- Known and used component lists
- Icon pack discovery results and prefix detection
- Per-file size before and after, with percentage reduction

## How It Works

The plugin operates in Vite's `generateBundle` hook, after tree-shaking and code splitting but before the final output is written to disk.

**Component shaking:** The plugin inspects `chunk.modules` in each JS chunk to determine which component source files survived tree-shaking. It then runs a CSS transform pass that parses every CSS asset, evaluates each rule's selector against the known/used component lists, and strips rules for unused components. Selectors containing functional pseudo-classes (`:not()`, `:has()`), attribute selectors, or other complex syntax are left untouched to avoid false positives.

**Icon shaking:** The plugin uses a `renderChunk` hook to scan the unminified JS for icon name strings before minification obscures them. It uses an efficient prefix-based search (one `indexOf` scan per icon prefix, not per icon name). In `generateBundle`, it runs a second CSS transform pass targeting glyph rules specifically.

Both passes use the same underlying CSS parser, which handles minified and unminified CSS, quoted strings, comments, nested braces, and all the edge cases of real-world stylesheets.

## CLI

A command-line tool is included for debugging and testing the CSS transform outside of a build.

### Scan a directory for components

```bash
q2-css-shake node_modules/quasar/src/components
# Output: q-ajax-bar,q-avatar,q-badge,...
```

### Strip unused component CSS

```bash
q2-css-shake input.css --known q-btn,q-card,q-field --used q-btn > output.css
```

- `--known` -- all component BEM prefixes the tool should reason about
- `--used` -- the subset that are actually used

### Strip unused icon CSS

```bash
q2-css-shake mdi-v7.css --js bundle.js > output.css
```

The tool extracts glyph names from the CSS, scans the JS file for matching strings, and strips unused glyphs.

### Combined

```bash
q2-css-shake quasar.css --known q-btn,q-card --used q-btn --js bundle.js > output.css
```

Debug information is written to stderr in all modes, so stdout contains only the transformed CSS.

## Icons Without CSS

An alternative to icon CSS shaking is to avoid icon font CSS entirely. Quasar supports SVG icons, which are tree-shaken by the JS bundler automatically -- no CSS involved.

### SVG icon imports

Instead of using icon name strings (which require the font CSS):

```vue
<!-- Font approach: requires full icon CSS loaded -->
<q-icon name="mdi-account" />
```

Import the SVG constant directly:

```vue
<template>
  <q-icon :name="mdiAccount" />
</template>

<script setup>
import { mdiAccount } from '@quasar/extras/mdi-v7'
</script>
```

The SVG constant is a path string that QIcon renders as an inline `<svg>` element. The JS bundler tree-shakes unused icon imports, so only the icons you actually reference are included in the build. No icon CSS is loaded at all.

Every `@quasar/extras` icon pack provides these SVG exports. The import path follows the pattern `@quasar/extras/<pack-name>`:

```ts
import { mdiAccount, mdiHome } from '@quasar/extras/mdi-v7'
import { fabGithub } from '@quasar/extras/fontawesome-v6'
import { ionHome } from '@quasar/extras/ionicons-v7'
```

### Material Icons and Material Symbols

The `material-icons` and `material-symbols-*` packs use font ligatures rather than CSS class definitions. Their CSS is small (just the `@font-face` declaration and base class) and contains no per-icon rules, so there is nothing to shake. These packs work efficiently without any special configuration.

### When to use which approach

| Approach | Pros | Cons |
|----------|------|------|
| SVG imports | Zero icon CSS, perfect tree-shaking | Requires explicit imports, no string-based icon names |
| Font + `icons: true` | String-based names, no code changes | Requires this plugin, string scanning has edge cases with dynamic names |
| Material Icons (ligatures) | String-based names, tiny CSS | Limited to Google's icon sets |

For new projects, SVG imports give the smallest builds with zero configuration. For existing projects that already use string-based icon names throughout, enabling `icons: true` in this plugin avoids a large refactor.

## Requirements

- Vite 5.4+ / 6.x / 7.x / 8.x (optional peer dependency -- only needed for the plugin, not the CLI or API)
- Node 20+
- Quasar 2.x

## Limitations

- **CSS inside `@media`, `@keyframes`, and other at-rules** is not processed -- the entire at-rule block passes through unchanged.
- **Selectors with functional pseudo-classes** (`:not()`, `:is()`, `:has()`, `:where()`), attribute selectors, or quoted strings are skipped to avoid false positives.

## License

MIT
