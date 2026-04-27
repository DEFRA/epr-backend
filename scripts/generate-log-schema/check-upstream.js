import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const reposRoot = resolve(here, '..', '..', '..', '..')
const lockPath = join(here, 'sources.lock.json')

const sha256 = (buf) =>
  `sha256:${createHash('sha256').update(buf).digest('hex')}`

const main = () => {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  const drifts = []

  for (const [repo, { files }] of Object.entries(lock)) {
    for (const [file, expectedHash] of Object.entries(files)) {
      const path = join(reposRoot, repo, file)
      let actualHash
      try {
        actualHash = sha256(readFileSync(path))
      } catch (err) {
        drifts.push({ repo, file, reason: `read failed: ${err.message}` })
        continue
      }
      if (actualHash !== expectedHash) {
        drifts.push({ repo, file, expected: expectedHash, actual: actualHash })
      }
    }
  }

  if (drifts.length === 0) {
    console.log('upstream sources match sources.lock.json — no drift')
    return
  }

  console.error('upstream drift detected:')
  for (const d of drifts) {
    console.error(`  ${d.repo}/${d.file}`)
    if (d.reason) console.error(`    ${d.reason}`)
    if (d.expected) {
      console.error(`    expected ${d.expected}`)
      console.error(`    actual   ${d.actual}`)
    }
  }
  console.error('\nrun `npm run log-schema:regen` to regenerate.')
  process.exitCode = 1
}

main()
