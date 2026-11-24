import { toYear } from '#common/helpers/dates/year.js'
import { toSummaryLogFileId } from '#domain/summary-logs/ids.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { partialMock } from '#test/type-helpers.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import {
  buildSummaryLogRowStateEntry,
  DEFAULT_LEDGER_ID
} from '#waste-records/repository/test-data.js'

import { fillInLinkedRows } from './fill-in-linked-rows.js'

/** @import { FilledInRow } from './fill-in-linked-rows.js' */
/** @import { PreviousYearSubmission } from './classification-context.js' */

const PREVIOUS_YEAR_LEDGER_ID = { ...DEFAULT_LEDGER_ID, year: toYear(2026) }
const PREVIOUS_YEAR_LOG = toSummaryLogFileId('log-2026')

const tableSchemas = partialMock({
  LINKING: {
    rowIdField: 'ROW_ID',
    linking: {
      previousYearRowIdField: 'PREVIOUS_YEAR_ROW_ID',
      suppliableOnLinkedRow: ['DATE_OF_EXPORT', 'WAS_THE_WASTE_REFUSED']
    },
    wasteRecordType: WASTE_RECORD_TYPE.EXPORTED
  },
  NOT_LINKING: {
    rowIdField: 'ROW_ID',
    wasteRecordType: WASTE_RECORD_TYPE.SENT_ON
  }
})

const HEADERS = [
  'ROW_ID',
  'PREVIOUS_YEAR_ROW_ID',
  'NET_WEIGHT',
  'DATE_OF_EXPORT',
  'WAS_THE_WASTE_REFUSED',
  'EXIT_PORT'
]

const PREVIOUS_YEAR_DATA = {
  NET_WEIGHT: 40,
  DATE_OF_EXPORT: '2026-12-28',
  WAS_THE_WASTE_REFUSED: 'Choose option'
}

/**
 * @param {Record<string, unknown>} row
 * @param {string[]} [headers]
 */
const valuesOf = (row, headers = HEADERS) =>
  headers.map((header) => row[header] ?? null)

/**
 * @param {Record<string, unknown>[]} rows
 * @param {{ tableName?: string, headers?: string[] }} [table]
 */
const parsedWith = (
  rows,
  { tableName = 'LINKING', headers = HEADERS } = {}
) => ({
  meta: {},
  data: {
    [tableName]: {
      location: { sheet: 'Exported', row: 7, column: 'A' },
      headers,
      rows: rows.map((row, index) => ({
        rowNumber: 8 + index,
        values: valuesOf(row, headers)
      }))
    }
  }
})

const setup = async () => {
  const repository = createInMemorySummaryLogRowStatesRepository()()
  await repository.upsertSummaryLogRowStates(
    PREVIOUS_YEAR_LEDGER_ID,
    [
      buildSummaryLogRowStateEntry({
        rowId: '1500',
        wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
        data: PREVIOUS_YEAR_DATA
      })
    ],
    PREVIOUS_YEAR_LOG
  )
  /**
   * @param {ReturnType<typeof parsedWith>} parsed
   * @param {PreviousYearSubmission | null} [previousYearSubmission]
   */
  const fillIn = (
    parsed,
    previousYearSubmission = {
      number: 1,
      summaryLogId: PREVIOUS_YEAR_LOG,
      ledgerId: PREVIOUS_YEAR_LEDGER_ID
    }
  ) =>
    fillInLinkedRows({
      parsed,
      tableSchemas,
      previousYearSubmission,
      summaryLogRowStatesRepository: repository
    })
  return { repository, fillIn }
}

/** @param {Record<string, unknown>} row */
const filledRow = async (row) => {
  const { fillIn } = await setup()
  const filled = await fillIn(parsedWith([row]))
  const [{ values, linked }] = /** @type {FilledInRow[]} */ (
    filled.data.LINKING.rows
  )
  return {
    data: Object.fromEntries(
      HEADERS.map((header, index) => [header, values[index]])
    ),
    linked
  }
}

describe('fillInLinkedRows', () => {
  const linked = { ROW_ID: 1001, PREVIOUS_YEAR_ROW_ID: 1500 }

  it.each([
    ['an empty string', ''],
    ['on its dropdown placeholder', 'Choose option']
  ])(
    'takes the previous-year value for an allowed column left %s',
    async (_, value) => {
      const { data, linked: link } = await filledRow({
        ...linked,
        DATE_OF_EXPORT: value
      })

      expect(data.DATE_OF_EXPORT).toBe('2026-12-28')
      expect(link?.link.suppliedFields).toEqual([])
    }
  )

  it.each([
    ['a formula result over blank cells', 0],
    ['nothing', null]
  ])(
    'takes the previous-year value for a column not allowed, whatever it holds: %s',
    async (_, value) => {
      const { data } = await filledRow({ ...linked, NET_WEIGHT: value })

      expect(data.NET_WEIGHT).toBe(40)
    }
  )

  it('leaves a column the previous-year row does not have blank, unless supplied and allowed', async () => {
    const { data } = await filledRow({ ...linked, EXIT_PORT: 'Dover' })

    expect(data.EXIT_PORT).toBeNull()
  })

  it('records the same supplied columns whichever order the template puts them in', async () => {
    const { fillIn } = await setup()
    const row = {
      ...linked,
      DATE_OF_EXPORT: '2027-01-04',
      WAS_THE_WASTE_REFUSED: 'No'
    }
    const suppliedFieldsWith = async (headers) => {
      const filled = await fillIn(parsedWith([row], { headers }))
      const [{ linked: link }] = /** @type {FilledInRow[]} */ (
        filled.data.LINKING.rows
      )
      return link?.link.suppliedFields
    }

    expect(await suppliedFieldsWith([...HEADERS].reverse())).toEqual(
      await suppliedFieldsWith(HEADERS)
    )
  })

  it('keeps the row as entered and the previous-year row as stored for the rules that compare years', async () => {
    const row = { ...linked, NET_WEIGHT: 0, DATE_OF_EXPORT: '2027-01-04' }

    const { linked: link } = await filledRow(row)

    expect(link?.entered).toEqual(valuesOf(row))
    expect(link?.previousYear).toEqual(PREVIOUS_YEAR_DATA)
  })

  it('leaves every row as written when there is no previous-year submission', async () => {
    const { fillIn } = await setup()
    const parsed = parsedWith([linked])

    expect(await fillIn(parsed, null)).toEqual(parsed)
  })

  it('leaves a table that does not link years as written', async () => {
    const { fillIn } = await setup()
    const parsed = parsedWith([linked], { tableName: 'NOT_LINKING' })

    expect(await fillIn(parsed)).toEqual(parsed)
  })

  it('reads nothing when no row names a previous-year row', async () => {
    const { repository, fillIn } = await setup()
    const read = vi.spyOn(repository, 'findRowStatesInSummaryLog')

    await fillIn(parsedWith([{ ROW_ID: 1001 }]))

    expect(read).not.toHaveBeenCalled()
  })

  it('reads every linked row of the log in one query', async () => {
    const { repository, fillIn } = await setup()
    const read = vi.spyOn(repository, 'findRowStatesInSummaryLog')

    await fillIn(
      parsedWith([linked, { ROW_ID: 1002, PREVIOUS_YEAR_ROW_ID: 1501 }])
    )

    expect(read).toHaveBeenCalledExactlyOnceWith(
      PREVIOUS_YEAR_LEDGER_ID,
      'log-2026',
      { wasteRecordType: WASTE_RECORD_TYPE.EXPORTED, rowIds: ['1500', '1501'] }
    )
  })
})
