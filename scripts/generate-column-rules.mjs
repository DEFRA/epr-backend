/**
 * Generates the "Summary Log Column Rules" reference (Markdown, to stdout) by
 * introspecting the live table schemas. It is derived, never hand-maintained,
 * so it cannot drift from the code that actually validates uploads.
 *
 * For every column of every template section it reports:
 *  - the VAL010 in-sheet format rule (type, allowed values, range, pattern),
 *  - the values treated as blank (dropdown placeholders),
 *  - whether the column is required for the Waste Balance (VAL011), and
 *  - whether the column is mandatory for report creation, and under which rule.
 *
 * The "required for Waste Balance" flag is established behaviourally: each column
 * is blanked in turn and the section's own classifyForWasteBalance is asked
 * whether that produces a MISSING_REQUIRED_FIELD reason. This reads the exact
 * set the gate enforces without depending on any private constant.
 *
 * Usage (from an epr-backend worktree):
 *   node scripts/generate-column-rules.mjs > column-rules.md
 *
 * Regenerate after changing any table schema, field schema, or report-mandatory
 * policy. The canonical copy of the output lives in the epr-re-ex-service docs
 * (docs/architecture/defined/summary-log-column-rules.md).
 */
import { PROCESSING_TYPE_TABLES } from '#domain/summary-logs/table-schemas/index.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { reportMandatoryPolicyFor } from '#reports/domain/report-mandatory/index.js'

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
  if (!schema.classifyForWasteBalance) {
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

const crossFieldChecks = (validationDesc) =>
  Object.entries(validationDesc.preferences?.messages ?? {})
    .filter(([key]) => key.startsWith('custom.'))
    .map(([, message]) => message)

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

  const lines = []
  lines.push(
    `### ${schema.sheetName} sheet (\`${schema.wasteRecordType}\`)`,
    '',
    contributes
      ? 'This section feeds the Waste Balance.'
      : 'This section does not feed the Waste Balance by design; its columns are never assessed for Waste Balance contribution.',
    ''
  )

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
  '# Summary Log Column Rules',
  '',
  'A per-column reference of every rule applied to a Summary Log, for all five templates.',
  '',
  '> **Generated file.** This page is produced by `scripts/generate-column-rules.mjs` in the `epr-backend` service, which introspects the live table schemas. Do not edit it by hand: regenerate it after any change to a table schema, field schema or report-mandatory policy. Because it is derived from the code, it cannot drift from what actually validates uploads.',
  '',
  'It brings together, per column, the rules documented separately in [Summary Log Row Validation Classification](summary-log-row-validation-classification.md), [Summary Log Validation Failure Codes](summary-log-validation-failure-codes.md) and [Report Creation Mandatory Fields](report-creation-mandatory-fields.md).',
  '',
  '## How to read this',
  '',
  'Column names are the **canonical field names** used internally and in validation error payloads and logs, not the exact spreadsheet header text.',
  '',
  '- **Format rule (VAL010)** - the in-sheet validation applied to the value when the cell is filled. A failure REJECTS the row and blocks the whole submission. VAL010 only checks filled cells: an empty optional cell passes.',
  '- **Treated as blank when** - values counted as unfilled in addition to an empty cell, typically Excel dropdown placeholders.',
  '- **Required for Waste Balance (VAL011)** - whether the column must be filled for the row to contribute to the Waste Balance. A missing value here EXCLUDES the row from the balance but still allows submission. Shown as `n/a` for sections that never feed the balance.',
  '- **Report-mandatory** - whether the column must be filled to create a Monthly Report, and the rule that requires it. The rule fires only when its trigger holds (for example a positive tonnage on the row): see [Report Creation Mandatory Fields](report-creation-mandatory-fields.md) for the triggers.',
  ''
]

const output = [header.join('\n')]
for (const [processingType, displayName] of TEMPLATE_ORDER) {
  const tables = PROCESSING_TYPE_TABLES[processingType]
  output.push(`## ${displayName}`, '')
  for (const schema of Object.values(tables)) {
    output.push(renderSection(processingType, schema))
  }
}

process.stdout.write(
  output
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd() + '\n'
)
