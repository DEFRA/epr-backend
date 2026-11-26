import Joi from 'joi'

import {
  columnComparisonsOf,
  isFilledInColumn,
  PREVIOUS_YEAR_COMPARISON
} from './linked-row.js'
import { createDateFieldSchema } from './table-schemas/shared/field-schemas.js'

const { SAME, INHERITED, ADDED, CHANGED } = PREVIOUS_YEAR_COMPARISON

const table = {
  rowIdField: 'ROW_ID',
  linking: { previousYearRowIdField: 'PREVIOUS_YEAR_ROW_ID' }
}

describe('linked-row', () => {
  describe('isFilledInColumn', () => {
    it.each([
      { column: 'unnamed', header: null },
      { column: 'EPR marker', header: '__EPR_SKIP_COLUMN' },
      { column: 'Row ID', header: 'ROW_ID' },
      { column: 'Previous year Row ID', header: 'PREVIOUS_YEAR_ROW_ID' }
    ])('keeps the $column column as entered on a linked row', ({ header }) => {
      expect(isFilledInColumn(header, table)).toBe(false)
    })

    it('fills in any other column from the previous year row', () => {
      expect(isFilledInColumn('DATE_OF_EXPORT', table)).toBe(true)
    })
  })

  describe('columnComparisonsOf', () => {
    const columnSchemas = new Map([
      ['DATE_OF_EXPORT', createDateFieldSchema()],
      ['OSR_ID', Joi.number()]
    ])

    /**
     * @param {string} header
     * @param {unknown} enteredValue
     * @param {unknown} previousYearValue
     */
    const columnComparisonOf = (header, enteredValue, previousYearValue) =>
      columnComparisonsOf({
        headers: [header],
        enteredRow: [enteredValue],
        previousYearRow: { [header]: previousYearValue },
        columnSchemas,
        table
      }).get(header)

    it.for([
      {
        description: 'a column the linked row left blank as inherited',
        header: 'OSR_NAME',
        entered: null,
        previousYear: 'Overseas Ltd',
        comparison: INHERITED
      },
      {
        description: 'a column only the linked row fills as added',
        header: 'OSR_NAME',
        entered: 'Overseas Ltd',
        previousYear: null,
        comparison: ADDED
      },
      {
        description: 'a column the previous year row does not hold as added',
        header: 'OSR_NAME',
        entered: 'Overseas Ltd',
        previousYear: undefined,
        comparison: ADDED
      },
      {
        description: 'a column with the same value in both years as the same',
        header: 'OSR_NAME',
        entered: 'Overseas Ltd',
        previousYear: 'Overseas Ltd',
        comparison: SAME
      },
      {
        description: 'a dropdown left on Choose option as blank',
        header: 'WAS_THE_WASTE_REFUSED',
        entered: 'Choose option',
        previousYear: 'Yes',
        comparison: INHERITED
      },
      {
        description: 'a cell of only spaces as blank',
        header: 'OSR_NAME',
        entered: '   ',
        previousYear: 'Overseas Ltd',
        comparison: INHERITED
      },
      {
        description: 'a value with spaces around it as the same',
        header: 'OSR_NAME',
        entered: ' Overseas Ltd ',
        previousYear: 'Overseas Ltd',
        comparison: SAME
      },
      {
        description: 'a value in a different case as changed',
        header: 'OSR_NAME',
        entered: 'overseas ltd',
        previousYear: 'Overseas Ltd',
        comparison: CHANGED
      },
      {
        description: 'a number typed as text as its column schema reads it',
        header: 'OSR_ID',
        entered: '100',
        previousYear: 100,
        comparison: SAME
      }
    ])(
      'compares $description',
      ({ header, entered, previousYear, comparison }) => {
        expect(
          columnComparisonOf(header, entered, previousYear)?.comparison
        ).toBe(comparison)
      }
    )

    it('compares a column with a different value as changed', () => {
      expect(
        columnComparisonOf('OSR_NAME', 'Overseas Ltd', 'Overseas 2026 Ltd')
      ).toStrictEqual({
        comparison: CHANGED,
        entered: 'Overseas Ltd',
        previousYear: 'Overseas 2026 Ltd'
      })
    })

    it('compares a date as its column schema reads it', () => {
      expect(
        columnComparisonOf(
          'DATE_OF_EXPORT',
          new Date('2026-11-01'),
          '2026-11-01'
        )
      ).toStrictEqual({
        comparison: SAME,
        entered: '2026-11-01',
        previousYear: '2026-11-01'
      })
    })

    it('leaves out the columns a linked row keeps as entered', () => {
      const columnComparisons = columnComparisonsOf({
        headers: [
          null,
          '__EPR_SKIP_COLUMN',
          'ROW_ID',
          'PREVIOUS_YEAR_ROW_ID',
          'OSR_NAME'
        ],
        enteredRow: ['x', 'x', 1001, 1500, 'Overseas Ltd'],
        previousYearRow: { ROW_ID: 1500, OSR_NAME: 'Overseas Ltd' },
        columnSchemas,
        table
      })

      expect([...columnComparisons.keys()]).toStrictEqual(['OSR_NAME'])
    })
  })
})
