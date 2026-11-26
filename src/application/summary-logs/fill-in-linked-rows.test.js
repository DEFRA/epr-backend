import { toYear } from '#common/helpers/dates/year.js'
import { toSummaryLogFileId } from '#domain/summary-logs/ids.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { partialMock } from '#test/type-helpers.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import {
  buildSummaryLogRowStateEntry,
  DEFAULT_LEDGER_ID
} from '#waste-records/repository/test-data.js'

import { PREVIOUS_YEAR_LINK_STATUS } from '#domain/summary-logs/previous-year-link.js'

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
  const [{ values, previousYearLink }] = /** @type {FilledInRow[]} */ (
    filled.data.LINKING.rows
  )
  return {
    data: Object.fromEntries(
      HEADERS.map((header, index) => [header, values[index]])
    ),
    previousYearLink
  }
}

/** @param {FilledInRow['previousYearLink']} previousYearLink */
const foundLinkOf = (previousYearLink) => {
  if (previousYearLink?.status !== PREVIOUS_YEAR_LINK_STATUS.FOUND) {
    throw new Error('expected a found previous-year link')
  }
  return previousYearLink
}

describe('fillInLinkedRows', () => {
  const linked = { ROW_ID: 1001, PREVIOUS_YEAR_ROW_ID: 1500 }

  it.each([
    ['an empty string', ''],
    ['on its dropdown placeholder', 'Choose option']
  ])(
    'takes the previous-year value for an allowed column left %s',
    async (_, value) => {
      const { data, previousYearLink } = await filledRow({
        ...linked,
        DATE_OF_EXPORT: value
      })

      expect(data.DATE_OF_EXPORT).toBe('2026-12-28')
      expect(foundLinkOf(previousYearLink).link.suppliedFields).toEqual([])
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
      const [{ previousYearLink }] = /** @type {FilledInRow[]} */ (
        filled.data.LINKING.rows
      )
      return foundLinkOf(previousYearLink).link.suppliedFields
    }

    expect(await suppliedFieldsWith([...HEADERS].reverse())).toEqual(
      await suppliedFieldsWith(HEADERS)
    )
  })

  it('keeps the row as entered and the previous-year row as stored for the rules that compare years', async () => {
    const row = { ...linked, NET_WEIGHT: 0, DATE_OF_EXPORT: '2027-01-04' }

    const { previousYearLink } = await filledRow(row)

    expect(foundLinkOf(previousYearLink).entered).toEqual(valuesOf(row))
    expect(foundLinkOf(previousYearLink).previousYear).toEqual(
      PREVIOUS_YEAR_DATA
    )
  })

  it('marks a row whose link names no previous-year row as not found, leaving it as written', async () => {
    const { fillIn } = await setup()
    const row = { ROW_ID: 1002, PREVIOUS_YEAR_ROW_ID: 1888, NET_WEIGHT: 5 }

    const filled = await fillIn(parsedWith([linked, row]))

    expect(filled.data.LINKING.rows[1]).toStrictEqual({
      rowNumber: 9,
      values: valuesOf(row),
      previousYearLink: {
        status: PREVIOUS_YEAR_LINK_STATUS.NOT_FOUND,
        previousYearRowId: '1888'
      }
    })
  })

  it.each([
    ['with spaces around it', ' 1500 '],
    ['with a decimal point', '1500.0']
  ])(
    'finds the previous-year row a row ID typed as text %s names',
    async (_, previousYearRowId) => {
      const { previousYearLink } = await filledRow({
        ...linked,
        PREVIOUS_YEAR_ROW_ID: previousYearRowId
      })

      expect(foundLinkOf(previousYearLink).link.rowId).toBe('1500')
    }
  )

  it('marks every linked row as not found when there is no previous-year submission', async () => {
    const { repository, fillIn } = await setup()
    const read = vi.spyOn(repository, 'findRowStatesInSummaryLog')

    const filled = await fillIn(parsedWith([linked]), null)

    expect(filled.data.LINKING.rows).toStrictEqual([
      {
        rowNumber: 8,
        values: valuesOf(linked),
        previousYearLink: {
          status: PREVIOUS_YEAR_LINK_STATUS.NOT_FOUND,
          previousYearRowId: '1500'
        }
      }
    ])
    expect(read).not.toHaveBeenCalled()
  })

  it('leaves a row naming no previous-year row as written, beside a linked row', async () => {
    const { fillIn } = await setup()
    const unlinked = { ROW_ID: 1002, PREVIOUS_YEAR_ROW_ID: '' }

    const filled = await fillIn(parsedWith([linked, unlinked]))

    expect(filled.data.LINKING.rows[1]).toStrictEqual({
      rowNumber: 9,
      values: valuesOf(unlinked)
    })
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
