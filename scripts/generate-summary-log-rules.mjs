/**
 * Generates the "Summary Log Rules Reference" (docs/summary-log-rules.md) by
 * introspecting the live table schemas and report-mandatory policies. It is
 * derived, never hand-maintained, so it cannot drift from the code that
 * actually validates uploads and gates report creation.
 *
 * It writes the file in place, so regenerating is a single command:
 *   node scripts/generate-summary-log-rules.mjs
 *
 * For each template it emits:
 *  - the report-creation mandatory-field rules, with each rule's trigger and
 *    required fields, and
 *  - per section: the per-column VAL010/VAL011 rules and which Waste Balance
 *    contribution reasons the section can produce.
 *
 * Three facts are established mechanically rather than hard-coded:
 *  - "required for Waste Balance" - each column is blanked in turn and the
 *    section's own classifyForWasteBalance is asked whether that yields a
 *    MISSING_REQUIRED_FIELD reason (reads the exact enforced set).
 *  - each report-mandatory rule's trigger - the rule's trigger predicate is
 *    probed with a positive number and with "Yes" against each candidate field
 *    to recover the field and condition that fires it.
 *  - the contribution reasons a section can produce - extracted from the
 *    classifier's own source, unioned with MISSING_REQUIRED_FIELD when the
 *    section has any required fields.
 *
 * Reason *meanings* are intentionally not restated here: they are conceptual and
 * live in the Summary Log Row Validation Classification doc, which this file
 * links to. This keeps the generator to mechanical facts only.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PROCESSING_TYPE_TABLES,
  findSchemaForProcessingType
} from '#domain/summary-logs/table-schemas/index.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { reportMandatoryPolicyFor } from '#reports/domain/report-mandatory/index.js'

const TOOL_PATH = 'scripts/generate-summary-log-rules.mjs'
const TOOL_REPO = 'DEFRA/epr-backend'
const TOOL_URL = `https://github.com/${TOOL_REPO}/blob/main/${TOOL_PATH}`
const BINDER_DOCS =
  'https://github.com/DEFRA/epr-re-ex-service/blob/main/docs/architecture/defined'
const CLASSIFICATION_URL = `${BINDER_DOCS}/summary-log-row-validation-classification.md`
const REPORT_CREATION_URL = `${BINDER_DOCS}/report-creation-mandatory-fields.md`

const TEMPLATE_ORDER = [
  [PROCESSING_TYPES.EXPORTER, 'Exporter (accredited)'],
  [PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY, 'Exporter (registered only)'],
  [PROCESSING_TYPES.REPROCESSOR_INPUT, 'Reprocessor input (accredited)'],
  [PROCESSING_TYPES.REPROCESSOR_OUTPUT, 'Reprocessor output (accredited)'],
  [
    PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY,
    'Reprocessor (registered only)'
  ]
]

const MAX_LISTED_VALUES = 6

// IGNORED is only ever produced by the accreditation-period check; every other
// contribution reason excludes the row. This is the one stable outcome fact the
// generator relies on rather than deriving.
const IGNORED_REASON = 'OUTSIDE_ACCREDITATION_PERIOD'
const REASON_ORDER = [
  'MISSING_REQUIRED_FIELD',
  'OUTSIDE_ACCREDITATION_PERIOD',
  'WASTE_STOPPED',
  'WASTE_REFUSED',
  'ORS_NOT_FOUND',
  'ORS_NOT_APPROVED',
  'PRN_ISSUED',
  'PRODUCT_WEIGHT_NOT_ADDED'
]

/** Escape pipe characters so cell content cannot break the Markdown table. */
const cell = (value) => String(value).replace(/\|/g, '\\|')

/** Human description of a single field's VAL010 rule from its Joi description. */
const describeRule = (fieldDesc) => {
  if (!fieldDesc) {
    return 'Not validated (any value accepted)'
  }
  const rules = fieldDesc.rules ?? []
  const messages = fieldDesc.preferences?.messages ?? {}
  const ruleArg = (name) => rules.find((rule) => rule.name === name)?.args
  const parts = []

  if (fieldDesc.flags?.only && Array.isArray(fieldDesc.allow)) {
    const values = fieldDesc.allow
    if (values.length <= MAX_LISTED_VALUES) {
      parts.push(`One of: ${values.join(', ')}`)
    } else {
      const only = messages['any.only']
      parts.push(
        `${only ? only.replace(/^must be /, 'Must be ') : 'One of an allowed list'} (${values.length} permitted values)`
      )
    }
  } else if (fieldDesc.type === 'number') {
    const min = ruleArg('min')?.limit
    const max = ruleArg('max')?.limit
    const bounds = []
    if (min !== undefined) bounds.push(`at least ${min}`)
    if (max !== undefined) bounds.push(`at most ${max}`)
    parts.push(bounds.length ? `Number, ${bounds.join(', ')}` : 'Number')
  } else if (messages['any.calendarDate']) {
    parts.push('Date (YYYY-MM-DD)')
  } else if (messages['string.threeDigitId']) {
    parts.push('3-digit ID (001-999)')
  } else {
    // A field with a bespoke pattern message (e.g. a first-of-month date) is
    // better described by that message than by the generic free-text wording.
    const patternMessage = messages['string.pattern.base']
    const bespokePattern =
      ruleArg('pattern') &&
      patternMessage &&
      !/permitted characters/i.test(patternMessage)
    if (bespokePattern) {
      parts.push(patternMessage.replace(/^must be /, 'Must be '))
    } else {
      const bits = ['Text']
      const max = ruleArg('max')?.limit
      if (max !== undefined) bits.push(`at most ${max} characters`)
      if (ruleArg('pattern')) bits.push('permitted characters only')
      parts.push(bits.join(', '))
    }
  }

  if (fieldDesc.flags?.presence === 'required') {
    parts.push('always required')
  }
  return parts.join('; ')
}

/**
 * The set of columns required for the Waste Balance, discovered by blanking each
 * column and checking whether the section reports it as MISSING_REQUIRED_FIELD.
 */
const requiredForBalance = (schema, columns) => {
  if (typeof schema.classifyForWasteBalance !== 'function') {
    return new Set()
  }
  const filled = Object.fromEntries(columns.map((name) => [name, '1']))
  const required = new Set()
  for (const name of columns) {
    try {
      const result = schema.classifyForWasteBalance(
        { ...filled, [name]: '' },
        { accreditation: null, overseasSites: ORS_VALIDATION_DISABLED }
      )
      const missing = (result.reasons ?? []).some(
        (reason) =>
          reason.code === 'MISSING_REQUIRED_FIELD' && reason.field === name
      )
      if (missing) required.add(name)
    } catch {
      // Reaching an exception means the missing-field check passed and a later
      // step threw on the placeholder value: the column is not required.
    }
  }
  return required
}

/** Maps each column to the report-mandatory rule(s) that make it mandatory. */
const reportMandatoryByField = (processingType, wasteRecordType) => {
  const policy = reportMandatoryPolicyFor(processingType) ?? {}
  const rules = policy[wasteRecordType] ?? []
  const byField = new Map()
  for (const rule of rules) {
    for (const field of rule.requiredFields) {
      byField.set(field, [...(byField.get(field) ?? []), rule.requiredBy])
    }
  }
  return byField
}

/**
 * Recovers a report-mandatory rule's trigger by probing its predicate: a field
 * set to a positive number fires a tonnage trigger; the same field set to "Yes"
 * fires an answered-yes trigger.
 */
const describeTrigger = (rule, candidateFields) => {
  for (const field of candidateFields) {
    const firesOnNumber = rule.trigger({ [field]: '5' })
    const firesOnYes = rule.trigger({ [field]: 'Yes' })
    if (firesOnNumber && !firesOnYes) return `Positive ${field}`
    if (firesOnYes && !firesOnNumber) return `${field} = Yes`
    if (firesOnNumber && firesOnYes) return `${field} present`
  }
  return 'Always'
}

/** The Waste Balance contribution reasons a section can produce, in order. */
const contributionReasons = (schema, requiredSet) => {
  if (typeof schema.classifyForWasteBalance !== 'function') {
    return []
  }
  const source = schema.classifyForWasteBalance.toString()
  const emitted = new Set(
    [...source.matchAll(/CLASSIFICATION_REASON\.([A-Z_]+)/g)].map((m) => m[1])
  )
  if (requiredSet.size > 0) {
    emitted.add('MISSING_REQUIRED_FIELD')
  }
  return REASON_ORDER.filter((reason) => emitted.has(reason)).map((reason) => ({
    reason,
    outcome: reason === IGNORED_REASON ? 'ignored' : 'excluded'
  }))
}

const crossFieldChecks = (validationDesc) =>
  Object.entries(validationDesc.preferences?.messages ?? {})
    .filter(([key]) => key.startsWith('custom.'))
    .map(([, message]) => message)

const renderReportMandatory = (processingType) => {
  const policy = reportMandatoryPolicyFor(processingType)
  if (!policy) {
    return []
  }
  const lines = [
    '### Report-creation mandatory fields',
    '',
    `When a rule's trigger holds for a row anywhere in the Summary Log, all of its required fields must be filled or the Monthly Report cannot be created. See the [report-creation gate](${REPORT_CREATION_URL}) for the rationale.`,
    '',
    '| Rule | Sheet | Trigger | Required fields |',
    '| ---- | ----- | ------- | --------------- |'
  ]
  for (const [wasteRecordType, rules] of Object.entries(policy)) {
    const schema = findSchemaForProcessingType(processingType, wasteRecordType)
    for (const rule of rules) {
      const trigger = describeTrigger(rule, schema.requiredHeaders)
      const fields = rule.requiredFields.map((f) => `\`${f}\``).join(', ')
      lines.push(
        `| \`${cell(rule.requiredBy)}\` | ${cell(schema.sheetName)} | ${cell(trigger)} | ${cell(fields)} |`
      )
    }
  }
  lines.push('')
  return lines
}

const renderSection = (processingType, schema) => {
  const validationDesc = schema.validationSchema.describe()
  const validatedKeys = validationDesc.keys ?? {}
  const columns = [
    ...new Set([
      ...schema.requiredHeaders,
      ...Object.keys(validatedKeys),
      ...Object.keys(schema.unfilledValues)
    ])
  ]
  const required = requiredForBalance(schema, columns)
  const mandatory = reportMandatoryByField(
    processingType,
    schema.wasteRecordType
  )
  const contributes = typeof schema.classifyForWasteBalance === 'function'

  const lines = [
    `#### ${schema.sheetName} sheet (\`${schema.wasteRecordType}\`)`,
    ''
  ]

  if (contributes) {
    const reasons = contributionReasons(schema, required)
    lines.push(
      `This section feeds the Waste Balance. A row here contributes its tonnage unless it is held back for one of these reasons (see [reason meanings](${CLASSIFICATION_URL})):`,
      ''
    )
    for (const { reason, outcome } of reasons) {
      lines.push(`- \`${reason}\` (${outcome})`)
    }
    lines.push('')
  } else {
    lines.push(
      'This section does not feed the Waste Balance by design; its columns are never assessed for Waste Balance contribution.',
      ''
    )
  }

  const checks = crossFieldChecks(validationDesc)
  if (checks.length) {
    lines.push('Cross-field checks (VAL010, a failure rejects the row):', '')
    for (const message of checks) lines.push(`- ${cell(message)}`)
    lines.push('')
  }

  lines.push(
    '| Column | Format rule (VAL010) | Treated as blank when | Required for Waste Balance | Report-mandatory |',
    '| ------ | -------------------- | --------------------- | -------------------------- | ---------------- |'
  )
  for (const name of columns) {
    const rule = describeRule(validatedKeys[name])
    const placeholders = schema.unfilledValues[name]
    const blankWhen = placeholders?.length
      ? placeholders.map((value) => `"${value}"`).join(', ')
      : 'Empty only'
    const balance = !contributes ? 'n/a' : required.has(name) ? 'Yes' : 'No'
    const mandatoryFor = mandatory.get(name)
    const report = mandatoryFor ? mandatoryFor.join(', ') : '-'
    lines.push(
      `| \`${cell(name)}\` | ${cell(rule)} | ${cell(blankWhen)} | ${balance} | ${cell(report)} |`
    )
  }
  lines.push('')
  return lines.join('\n')
}

const header = [
  `<!-- GENERATED FILE - DO NOT EDIT BY HAND. Generated by ${TOOL_REPO} ${TOOL_PATH}. To update, re-run the tool. -->`,
  '',
  '# Summary Log Rules Reference',
  '',
  'The complete, per-column set of rules applied to a Summary Log, for all five templates: in-sheet validation, Waste Balance contribution, and report-creation mandatory fields.',
  '',
  `> ⚠️ **Generated file - do not edit by hand.** This page is produced by [\`${TOOL_PATH}\`](${TOOL_URL}) in the \`${TOOL_REPO}\` repository, which introspects the live table schemas and report-mandatory policies. To update it, run \`node ${TOOL_PATH}\` from an \`epr-backend\` checkout. Any manual edits will be lost the next time it is generated, and because it is derived from the code it cannot drift from what actually validates uploads.`,
  '',
  '## How to read this',
  '',
  `Column names are the **canonical field names** used internally and in validation error payloads and logs, not the exact spreadsheet header text. The conceptual model behind the outcomes and reasons is documented in the [Summary Log Row Validation Classification](${CLASSIFICATION_URL}) doc.`,
  '',
  "- **Report-creation mandatory fields** - columns that must be filled to create a Monthly Report when the rule's trigger holds. Missing ones block report creation.",
  '- **Format rule (VAL010)** - the in-sheet validation applied to a filled cell. A failure REJECTS the row and blocks the whole submission. VAL010 only checks filled cells: an empty optional cell passes.',
  '- **Treated as blank when** - values counted as unfilled in addition to an empty cell, typically Excel dropdown placeholders.',
  '- **Required for Waste Balance (VAL011)** - whether the column must be filled for the row to contribute to the Waste Balance. A missing value here EXCLUDES the row from the balance but still allows submission. Shown as `n/a` for sections that never feed the balance.',
  '- **Contribution reasons** - the reasons a section can hold a row back from the Waste Balance, each marked `excluded` or `ignored`.',
  ''
]

const output = [header.join('\n')]
for (const [processingType, displayName] of TEMPLATE_ORDER) {
  const tables = PROCESSING_TYPE_TABLES[processingType]
  output.push(`## ${displayName}`, '')
  output.push(renderReportMandatory(processingType).join('\n'))
  for (const schema of Object.values(tables)) {
    output.push(renderSection(processingType, schema))
  }
}

const document =
  output
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd() + '\n'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = join(root, 'docs', 'summary-log-rules.md')
mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, document)
process.stderr.write(`Wrote ${outputPath}\n`)
