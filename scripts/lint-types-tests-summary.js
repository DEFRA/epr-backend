import { execSync } from 'node:child_process'

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
 * @param {string} tscOutput
 * @returns {Array<{file: string, code: string, message: string, line: string}>}
 */
const parseErrors = (tscOutput) => {
  const errors = []
  for (const line of tscOutput.split('\n')) {
    const match = line.match(errorLineRegex)
    if (match) {
      errors.push({ file: match[1], code: match[2], message: match[3], line })
    }
  }
  return errors
}

/**
 * @param {Array<{file: string}>} errors
 * @returns {Map<string, number>}
 */
const countByFile = (errors) => {
  const counts = new Map()
  for (const { file } of errors) {
    counts.set(file, (counts.get(file) ?? 0) + 1)
  }
  return counts
}

/**
 * @param {Array<{code: string, message: string}>} errors
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
 * @param {Array<{file: string, line: string}>} errors
 * @param {string} file
 * @returns {string[]}
 */
const errorLinesFor = (errors, file) =>
  errors.filter((e) => e.file === file).map((e) => e.line)

/**
 * @param {string[]} changedFiles
 * @param {ReturnType<typeof parseErrors>} errors
 * @returns {{section: string, prErrorTotal: number}}
 */
const buildPrSection = (changedFiles, errors) => {
  if (changedFiles.length === 0) {
    return { section: '_no test files changed in this PR_', prErrorTotal: 0 }
  }

  const blocks = []
  let prErrorTotal = 0
  for (const file of [...changedFiles].sort()) {
    const lines = errorLinesFor(errors, file)
    if (lines.length === 0) {
      blocks.push(`- :white_check_mark: \`${file}\` (0 errors)`)
    } else {
      prErrorTotal += lines.length
      blocks.push(
        `<details><summary><code>${file}</code> (${lines.length} errors)</summary>\n\n` +
          '```\n' +
          lines.join('\n') +
          '\n```\n\n</details>'
      )
    }
  }
  return { section: blocks.join('\n'), prErrorTotal }
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
 * @param {ReturnType<typeof parseErrors>} errors
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
 * @param {ReturnType<typeof parseErrors>} errors
 * @returns {string}
 */
const errorsByFileBlock = (errors) => {
  const counts = [...countByFile(errors).entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  )
  return counts.map(([file, count]) => `${count} ${file}`).join('\n')
}

/**
 * @param {BuildSummaryInput} input
 * @returns {BuildSummaryResult}
 */
export const buildSummary = ({ tscOutput, changedFiles, tsCodeLookup }) => {
  const errors = parseErrors(tscOutput)
  const { section: section1, prErrorTotal } = buildPrSection(
    changedFiles,
    errors
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
      errorsByFileBlock(errors),
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
 * @returns {Promise<string>}
 */
const readStdin = async () => {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * @returns {string[]}
 */
const changedFilesFromGit = () => {
  const baseSha = process.env.BASE_SHA
  if (!baseSha) {
    return []
  }
  const out = execSync(
    `git diff --name-only ${baseSha}...HEAD -- src/`
  ).toString()
  return filterTestFiles(out.split('\n').filter(Boolean))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tscOutput = await readStdin()
  const changedFiles = changedFilesFromGit()
  const { markdown, exitCode } = buildSummary({
    tscOutput,
    changedFiles,
    tsCodeLookup: tsCodeLookupFromPackage
  })
  process.stdout.write(markdown)
  process.exitCode = exitCode
}
/* v8 ignore stop */
