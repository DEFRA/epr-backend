import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { text } from 'node:stream/consumers'

import ts from 'typescript'

/**
 * @typedef {object} BuildSummaryInput
 * @property {string} tscOutput
 * @property {string[]} changedFiles
 * @property {(code: number) => string} tsCodeLookup
 */

/**
 * @typedef {object} BuildSummaryResult
 * @property {string} markdown
 * @property {number} exitCode
 */

const TEST_FILE_PATTERNS = [
  /\.test\.js$/,
  /\/test-helpers\//,
  /\/test-fixtures\.js$/,
  /\.d\.ts$/
]

/**
 * @param {string[]} paths
 * @returns {string[]}
 */
export const filterTestFiles = (paths) =>
  paths.filter((p) => TEST_FILE_PATTERNS.some((re) => re.test(p)))

const errorLineRegex = /^(src\/[^(]+)\(\d+,\d+\): error (TS\d+): (.*)$/

/**
 * @typedef {{file: string, code: string, message: string, line: string}} ParsedError
 */

/**
 * @param {string} tscOutput
 * @returns {{errors: ParsedError[], byFile: Map<string, ParsedError[]>}}
 */
const parseErrors = (tscOutput) => {
  /** @type {ParsedError[]} */
  const errors = []
  /** @type {Map<string, ParsedError[]>} */
  const byFile = new Map()
  for (const line of tscOutput.split('\n')) {
    const match = line.match(errorLineRegex)
    if (!match) {
      continue
    }
    const error = { file: match[1], code: match[2], message: match[3], line }
    errors.push(error)
    const list = byFile.get(error.file)
    if (list) {
      list.push(error)
    } else {
      byFile.set(error.file, [error])
    }
  }
  return { errors, byFile }
}

/**
 * @param {ParsedError[]} errors
 * @returns {Array<{code: string, count: number, message: string}>}
 */
const topCodes = (errors) => {
  /** @type {Map<string, {count: number, message: string}>} */
  const acc = new Map()
  for (const { code, message } of errors) {
    const entry = acc.get(code)
    if (entry) {
      entry.count += 1
    } else {
      acc.set(code, { count: 1, message })
    }
  }
  return [...acc.entries()]
    .map(([code, { count, message }]) => ({ code, count, message }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
}

/**
 * @param {string[]} changedFiles
 * @param {Map<string, ParsedError[]>} byFile
 * @returns {{section: string, prErrorTotal: number}}
 */
const buildPrSection = (changedFiles, byFile) => {
  if (changedFiles.length === 0) {
    return { section: '_no test files changed in this PR_', prErrorTotal: 0 }
  }

  const blocks = []
  let prErrorTotal = 0
  for (const file of [...changedFiles].sort()) {
    const fileErrors = byFile.get(file) ?? []
    if (fileErrors.length === 0) {
      continue
    }
    prErrorTotal += fileErrors.length
    blocks.push(
      `<details><summary><code>${file}</code> (${fileErrors.length} errors)</summary>\n\n` +
        '```\n' +
        fileErrors.map((e) => e.line).join('\n') +
        '\n```\n\n</details>'
    )
  }

  if (blocks.length === 0) {
    return {
      section: '_no type errors in test files changed in this PR_',
      prErrorTotal: 0
    }
  }
  return { section: blocks.join('\n\n'), prErrorTotal }
}

/**
 * @param {number} prErrorTotal
 * @returns {string}
 */
const prHeader = (prErrorTotal) => {
  if (prErrorTotal === 0) {
    return ':white_check_mark: no type errors in test files changed in this PR'
  }
  return `:warning: **${prErrorTotal} type error(s) in test files changed in this PR**`
}

/**
 * @param {ParsedError[]} errors
 * @param {(code: number) => string} tsCodeLookup
 * @returns {string}
 */
const topCodesTable = (errors, tsCodeLookup) => {
  const rows = ['| Count | Code | Description |', '| ---: | --- | --- |']
  for (const { code, count, message } of topCodes(errors)) {
    const numericCode = Number(code.slice(2))
    const description = (tsCodeLookup(numericCode) || message).replace(
      /\|/g,
      '\\|'
    )
    const slug = code.toLowerCase()
    rows.push(
      `| ${count} | [${code}](https://typescript.tv/errors/${slug}/) | ${description} |`
    )
  }
  return rows.join('\n')
}

/**
 * @param {Map<string, ParsedError[]>} byFile
 * @returns {string}
 */
const errorsByFileBlock = (byFile) => {
  const counts = [...byFile.entries()]
    .map(
      ([file, errs]) => /** @type {[string, number]} */ ([file, errs.length])
    )
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return counts.map(([file, count]) => `${count} ${file}`).join('\n')
}

/**
 * @typedef {object} BuildPrCommentInput
 * @property {string} tscOutput
 * @property {string[]} changedFiles
 * @property {string} [runUrl]
 */

/**
 * @param {BuildPrCommentInput} input
 * @returns {BuildSummaryResult}
 */
export const buildPrComment = ({ tscOutput, changedFiles, runUrl }) => {
  const { byFile } = parseErrors(tscOutput)
  const { section, prErrorTotal } = buildPrSection(changedFiles, byFile)

  const lines = [
    '## Lint Types - Tests',
    '',
    '### Errors in this PR',
    '',
    prHeader(prErrorTotal),
    '',
    section
  ]
  if (runUrl) {
    lines.push('', `[View full summary](${runUrl})`)
  }
  lines.push('')

  return { markdown: lines.join('\n'), exitCode: prErrorTotal > 0 ? 1 : 0 }
}

/**
 * @param {BuildSummaryInput} input
 * @returns {BuildSummaryResult}
 */
export const buildSummary = ({ tscOutput, changedFiles, tsCodeLookup }) => {
  const { errors, byFile } = parseErrors(tscOutput)
  const { section: section1, prErrorTotal } = buildPrSection(
    changedFiles,
    byFile
  )

  let section2
  if (errors.length === 0) {
    section2 = '### All errors\n\n:white_check_mark: Test type check passed'
  } else {
    const fullList = errors.map((e) => e.line).join('\n')
    section2 = [
      '### All errors',
      '',
      `:warning: **${errors.length} type errors found in tests**`,
      '',
      '#### Top error codes',
      '',
      topCodesTable(errors, tsCodeLookup),
      '',
      '<details><summary>Errors by file (count)</summary>',
      '',
      '```',
      errorsByFileBlock(byFile),
      '```',
      '',
      '</details>',
      '',
      '<details><summary>Full error list</summary>',
      '',
      '```',
      fullList,
      '```',
      '',
      '</details>'
    ].join('\n')
  }

  const markdown = [
    '## Lint Types - Tests',
    '',
    '### Errors in this PR',
    '',
    prHeader(prErrorTotal),
    '',
    section1,
    '',
    section2,
    ''
  ].join('\n')

  return { markdown, exitCode: prErrorTotal > 0 ? 1 : 0 }
}

/* v8 ignore start */
/**
 * @param {number} code
 * @returns {string}
 */
const tsCodeLookupFromPackage = (() => {
  /** @type {Map<number, string>} */
  const map = new Map()
  const diagnostics =
    /** @type {Record<string, {code?: number, message?: string}>} */ (
      /** @type {unknown} */ (ts).Diagnostics ?? {}
    )
  for (const key of Object.keys(diagnostics)) {
    const d = diagnostics[key]
    if (d?.code && d?.message) {
      map.set(d.code, d.message)
    }
  }
  return (/** @type {number} */ code) => map.get(code) ?? ''
})()

/**
 * @returns {string[]}
 */
const changedFilesFromGit = () => {
  const baseRef = process.env.BASE_REF
  if (!baseRef) {
    return []
  }
  const out = execSync(
    `git diff --name-only origin/${baseRef}...HEAD -- src/`
  ).toString()
  return filterTestFiles(out.split('\n').filter(Boolean))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tscOutput = await text(process.stdin)
  const changedFiles = changedFilesFromGit()

  const summary = buildSummary({
    tscOutput,
    changedFiles,
    tsCodeLookup: tsCodeLookupFromPackage
  })
  process.stdout.write(summary.markdown)

  if (process.env.COMMENT_FILE) {
    const comment = buildPrComment({
      tscOutput,
      changedFiles,
      runUrl: process.env.RUN_URL
    })
    writeFileSync(process.env.COMMENT_FILE, comment.markdown)
  }

  process.exitCode = summary.exitCode
}
/* v8 ignore stop */
