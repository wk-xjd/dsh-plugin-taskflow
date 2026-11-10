#!/usr/bin/env node
/**
 * Install / refresh TaskFlow into a DSH profile.
 *
 *   node install.mjs                  # sync into ~/.dsh/plugins and ensure the row
 *   node install.mjs --rotate         # ... into a fresh versioned dir, then reload the
 *                                     #     host half live (no app restart)
 *   node install.mjs --profile web    # target another profile
 *   node install.mjs --print          # only print the patch row, change nothing
 *
 * Why the copies: a DSH plugin row is imported once per file URL, so editing the
 * host half in place needs a restart. `--rotate` gives the loader a URL it has
 * never seen, which is the only way to pick up host code on a live process.
 *
 * The browser half does not need rotation: the shell re-reads the bundled file
 * and only needs a page refresh.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)

function flag(name) {
  const index = argv.indexOf(`--${name}`)
  return index >= 0
}

function value(name, fallback) {
  const index = argv.indexOf(`--${name}`)
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback
}

const home = process.env.DSH_HOME && process.env.DSH_HOME.length > 0 ? process.env.DSH_HOME : join(homedir(), '.dsh')
const profile = value('profile', 'desktop')
const profileDir = join(home, 'profiles', profile)
const patchFile = join(profileDir, 'cordis.patch.yml')
const pluginsDir = join(home, 'plugins')
const baseName = 'dsh-plugin-taskflow'

if (!existsSync(profileDir)) {
  console.error(`profile not found: ${profileDir}`)
  process.exit(1)
}

const targetDir = flag('rotate')
  ? join(pluginsDir, `${baseName}-${Date.now().toString(36)}`)
  : join(pluginsDir, baseName)
const entry = join(targetDir, 'lib', 'index.js')

const row = `- insert:
    - id: ${baseName}
      name: '${entry}'
`

if (flag('print')) {
  console.log(row)
  process.exit(0)
}

/* ------------------------------------------------------------------ */
/* 1. Copy the package                                                 */
/* ------------------------------------------------------------------ */

mkdirSync(pluginsDir, { recursive: true })
if (flag('rotate')) {
  // Keep the newest three rotations; older ones are dead code for the loader.
  const stale = readdirSync(pluginsDir)
    .filter((name) => name.startsWith(`${baseName}-`))
    .map((name) => ({ name, at: statSync(join(pluginsDir, name)).mtimeMs }))
    .sort((a, b) => b.at - a.at)
    .slice(2)
  for (const victim of stale) rmSync(join(pluginsDir, victim.name), { recursive: true, force: true })
}
rmSync(targetDir, { recursive: true, force: true })
mkdirSync(targetDir, { recursive: true })
for (const part of ['lib', 'client']) cpSync(join(here, part), join(targetDir, part), { recursive: true })
for (const file of ['package.json', 'README.md', 'cordis.patch.yml']) {
  if (existsSync(join(here, file))) cpSync(join(here, file), join(targetDir, file))
}
console.log(`copied → ${targetDir}`)

/* ------------------------------------------------------------------ */
/* 2. Ensure the profile row                                           */
/* ------------------------------------------------------------------ */

const current = existsSync(patchFile) ? readFileSync(patchFile, 'utf8') : ''
const ourBlock = /\n- insert:\n    - id: dsh-plugin-taskflow\n      name: '[^']*'\n?/g
const hasOurs = new RegExp(ourBlock.source).test(current)

/** Replace (or append) exactly our insert block, leaving every other row alone. */
function writeRow(block) {
  const stripped = current.replace(ourBlock, '\n').replace(/\s+$/, '')
  writeFileSync(patchFile, `${stripped}\n${block}`)
}

if (flag('rotate')) {
  // Removing the row first disposes the old fiber; adding it back mounts the new
  // module. The web-server route table is exclusive, so both halves must not
  // overlap — hence the gap.
  if (hasOurs) {
    writeFileSync(patchFile, `${current.replace(ourBlock, '\n').replace(/\s+$/, '')}\n`)
    console.log('row removed, waiting for the loader to settle…')
    // The web-server route table is exclusive: the new fiber must not mount
    // before the old one is disposed, so give the loader time to release it.
    await new Promise((done) => setTimeout(done, 4000))
  }
  writeRow(row)
  console.log(`row added → ${patchFile}`)
} else if (!hasOurs) {
  writeRow(row)
  console.log(`row added → ${patchFile}`)
} else if (!current.includes(entry)) {
  writeRow(row)
  console.log('row updated (new path) — restart DSH so the old module instance is released')
} else {
  console.log('row already present')
}

/* ------------------------------------------------------------------ */
/* 3. Report                                                           */
/* ------------------------------------------------------------------ */

console.log(`
Next steps
  • browser half: refresh the page (the shell reloads /plugins/<id>/client.js).
  • host half:    restart DSH, or use --rotate to mount a fresh module path now.
  • health check: curl -s http://127.0.0.1:<port>/taskflow/health
`)
