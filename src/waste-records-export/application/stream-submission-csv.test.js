import {
  streamSubmissionCsv,
  streamSubmissionCsvToReadable
} from './stream-submission-csv.js'
import {
  SCHEMA_FIELD_NAMES,
  SUBMISSION_METADATA_COLUMNS,
  buildDataFieldColumns,
  buildSubmissionHeaderRow
} from '../domain/csv-columns.js'
import { encodeRow } from './stream-csv-export.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'

/** @import { SummaryLogRowState } from '#waste-records/repository/schema.js' */
/** @import { SubmissionCsvInput } from './stream-submission-csv.js' */

const collect = async (iterable) => {
  const out = []
  for await (const line of iterable) {
    out.push(line.toString('utf8'))
  }
  return out
}

/**
 * @param {Partial<SummaryLogRowState>} [overrides]
 * @returns {SummaryLogRowState}
 */
const rowState = (overrides = {}) => ({
  id: 'row-state-1',
  organisationId: 'org-1',
  registrationId: 'reg-1',
  accreditationId: null,
  rowId: '1001',
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
  data: { DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01' },
  classification: {
    outcome: WASTE_BALANCE_OUTCOME.NOT_APPLICABLE,
    reasons: [],
    transactionAmount: 0
  },
  summaryLogIds: ['file-1'],
  ...overrides
})

/**
 * @param {Partial<SubmissionCsvInput>} [overrides]
 * @returns {SubmissionCsvInput}
 */
const input = (overrides = {}) =>
  /** @type {SubmissionCsvInput} */ ({
    org: { id: 'org-1', companyDetails: { name: 'Acme Ltd' } },
    registration: { id: 'reg-1', submittedToRegulator: 'ea' },
    meta: {
      REGISTRATION_NUMBER: 'REG-001',
      ACCREDITATION_NUMBER: 'ACC-001',
      MATERIAL: 'Plastic'
    },
    submittedAt: '2026-04-15T09:00:00Z',
    rowStates: [],
    ...overrides
  })

const cellsOf = (line) => line.trim().split(',')

const column = (header, name) => cellsOf(header).indexOf(name)

describe('streamSubmissionCsv', () => {
  it('emits the header, then one line per row state', async () => {
    const out = await collect(
      streamSubmissionCsv(
        input({
          rowStates: [rowState({ rowId: '1' }), rowState({ rowId: '2' })]
        })
      )
    )

    expect(out).toHaveLength(3)
    expect(out[0]).toBe(
      await encodeRow(buildSubmissionHeaderRow(buildDataFieldColumns([])))
    )
  })

  it('emits only the header when the submission has no row states', async () => {
    const out = await collect(streamSubmissionCsv(input()))

    expect(out).toEqual([
      await encodeRow(buildSubmissionHeaderRow(buildDataFieldColumns([])))
    ])
  })

  it("builds the header data columns from the schema and this submission's keys only", async () => {
    const out = await collect(
      streamSubmissionCsv(
        input({
          rowStates: [
            rowState({
              data: { A_KEY_THIS_SUBMISSION_HAS: 'x' }
            })
          ]
        })
      )
    )

    const header = cellsOf(out[0])
    expect(header).toEqual(
      buildSubmissionHeaderRow(
        buildDataFieldColumns(['A_KEY_THIS_SUBMISSION_HAS'])
      )
    )
    expect(header).toEqual(expect.arrayContaining([...SCHEMA_FIELD_NAMES]))
    expect(header).not.toContain('A_KEY_ONLY_ANOTHER_SUBMISSION_HAS')
  })

  it('has no Accredited or revised OSR columns in the header', async () => {
    const out = await collect(streamSubmissionCsv(input()))

    const header = cellsOf(out[0])
    expect(header.slice(0, SUBMISSION_METADATA_COLUMNS.length)).toEqual([
      ...SUBMISSION_METADATA_COLUMNS
    ])
    expect(header).not.toContain('Accredited')
    expect(header).not.toContain('OSR Country Revised')
    expect(header).not.toContain('OSR Name Revised')
  })

  it('orders rows registered-only first, then by accreditation id, type and natural row id', async () => {
    const out = await collect(
      streamSubmissionCsv(
        input({
          rowStates: [
            rowState({ accreditationId: 'acc-b', rowId: '1' }),
            rowState({ accreditationId: 'acc-a', rowId: '10' }),
            rowState({
              accreditationId: 'acc-a',
              rowId: '1',
              wasteRecordType: WASTE_RECORD_TYPE.PROCESSED
            }),
            rowState({ accreditationId: 'acc-a', rowId: '9' }),
            rowState({ accreditationId: null, rowId: '5' })
          ]
        })
      )
    )

    const rowIdIndex = column(out[0], 'Row ID')
    const typeIndex = column(out[0], 'Waste Record Type')
    expect(
      out
        .slice(1)
        .map(
          (line) => `${cellsOf(line)[typeIndex]}:${cellsOf(line)[rowIdIndex]}`
        )
    ).toEqual([
      'received:5',
      'processed:1',
      'received:9',
      'received:10',
      'received:1'
    ])
  })

  it('renders the stamped classification rather than recomputing it', async () => {
    const out = await collect(
      streamSubmissionCsv(
        input({
          rowStates: [
            rowState({
              accreditationId: 'acc-1',
              classification: {
                outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
                reasons: [],
                transactionAmount: 50.5
              }
            })
          ]
        })
      )
    )

    const cells = cellsOf(out[1])
    expect(cells[column(out[0], 'Included in Waste Balance')]).toBe('true')
    expect(cells[column(out[0], 'Waste Balance Tonnage')]).toBe('50.5')
  })

  it('coerces a mixed-typed column to a single type', async () => {
    const out = await collect(
      streamSubmissionCsv(
        input({
          rowStates: [
            rowState({
              rowId: '1',
              data: {
                DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01',
                TONNAGE_RECEIVED_FOR_RECYCLING: 9.5
              }
            }),
            rowState({
              rowId: '2',
              data: {
                DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01',
                TONNAGE_RECEIVED_FOR_RECYCLING: '9.50'
              }
            })
          ]
        })
      )
    )

    const index = column(out[0], 'TONNAGE_RECEIVED_FOR_RECYCLING')
    expect(cellsOf(out[1])[index]).toBe('9.5')
    expect(cellsOf(out[2])[index]).toBe('9.5')
  })
})

describe('streamSubmissionCsvToReadable', () => {
  it('emits the same lines as the generator', async () => {
    const submission = input({
      rowStates: [rowState({ rowId: '1' }), rowState({ rowId: '2' })]
    })

    const fromReadable = await collect(
      streamSubmissionCsvToReadable(submission)
    )
    const fromGenerator = await collect(streamSubmissionCsv(submission))

    expect(fromReadable.join('')).toBe(fromGenerator.join(''))
  })
})
