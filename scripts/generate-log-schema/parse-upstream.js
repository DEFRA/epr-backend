import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseFieldTypes, parseIncludeKeys } from './parse.js'

const here = dirname(fileURLToPath(import.meta.url))
const reposRoot = resolve(here, '..', '..', '..', '..')

const SOURCES = [
  {
    repo: 'cdp-tf-modules',
    file: 'opensearch_ingestion/vars.tf'
  },
  {
    repo: 'cdp-tf-core',
    file: 'files/cdp-logs-index-template.json'
  }
]

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

const gitHeadRef = (repoPath) =>
  execFileSync('git', ['-C', repoPath, 'rev-parse', '--short', 'HEAD'], {
    encoding: 'utf8'
  }).trim()

/**
 * Reads the upstream CDP source files from sibling repos and emits:
 * - parsed-sources.json — flat `{ key: opensearch-type }` map for the allowlist
 * - sources.lock.json   — git refs and content hashes of the upstream files
 */
export const parseUpstream = () => {
  const sourcesByRepo = {}
  for (const { repo, file } of SOURCES) {
    const repoPath = join(reposRoot, repo)
    const filePath = join(repoPath, file)
    const bytes = readFileSync(filePath)
    sourcesByRepo[repo] = sourcesByRepo[repo] ?? {
      ref: gitHeadRef(repoPath),
      files: {}
    }
    sourcesByRepo[repo].files[file] = `sha256:${sha256(bytes)}`

    if (file.endsWith('vars.tf')) {
      sourcesByRepo[repo]._varsTf = bytes.toString('utf8')
    } else if (file.endsWith('.json')) {
      sourcesByRepo[repo]._json = JSON.parse(bytes.toString('utf8'))
    }
  }

  const includeKeys = parseIncludeKeys(sourcesByRepo['cdp-tf-modules']._varsTf)
  const fieldTypes = parseFieldTypes(sourcesByRepo['cdp-tf-core']._json)

  const parsed = {}
  for (const key of includeKeys) {
    const dotted = key.replace(/\//g, '.')
    parsed[key] = fieldTypes[dotted] ?? 'keyword'
  }

  const lock = {}
  for (const { repo, file } of SOURCES) {
    lock[repo] = {
      ref: sourcesByRepo[repo].ref,
      files: { [file]: sourcesByRepo[repo].files[file] }
    }
  }

  return { parsed, lock }
}

const parsedSourcesPath = resolve(
  here,
  '..',
  '..',
  'src',
  'common',
  'helpers',
  'logging',
  'parsed-sources.json'
)
const lockPath = join(here, 'sources.lock.json')

const main = () => {
  const { parsed, lock } = parseUpstream()
  writeFileSync(parsedSourcesPath, JSON.stringify(parsed, null, 2) + '\n')
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n')
  console.log(
    `wrote parsed-sources.json (${Object.keys(parsed).length} keys) and sources.lock.json`
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
