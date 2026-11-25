import ExcelJS from 'exceljs'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { WHOLE_TONNES } from '#market-insights/domain/published-workbook-style.js'
import { fitColumnsToTables, frameOf, write } from './cells.js'
import {
  JANUARY_TO_JUNE_2026,
  PUBLISHED_EXTRACTION
} from './published-workbook-test-helpers.js'

describe('the frame every tab is laid out for', () => {
  it('names a period of several months from the first to the last', () => {
    expect(
      frameOf({ months: JANUARY_TO_JUNE_2026, now: PUBLISHED_EXTRACTION })
        .period
    ).toBe('January to June 2026')
  })

  it('names a period of one month by that month alone', () => {
    expect(
      frameOf({ months: [toYearMonth('2026-01')], now: PUBLISHED_EXTRACTION })
        .period
    ).toBe('January 2026')
  })

  it('dates the extraction in UK time', () => {
    expect(
      frameOf({
        months: JANUARY_TO_JUNE_2026,
        now: new Date('2026-08-09T23:30:00.000Z')
      }).asOf
    ).toBe('Data as of 10 August 2026  ')
  })
})

describe('fitting columns to their tables', () => {
  it('keeps a width that ExcelJS would otherwise take for its default and drop', async () => {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('fitted')
    write(worksheet.getCell('A1'), 'Plastic', {
      border: { top: { style: 'thin' } }
    })
    fitColumnsToTables(worksheet)

    const file = new ExcelJS.Workbook()
    await file.xlsx.load(await workbook.xlsx.writeBuffer())

    expect(file.worksheets[0]?.getColumn('A').width).toBeGreaterThan(
      'Plastic'.length
    )
  })

  /** @type {Partial<ExcelJS.Borders>} */
  const boxed = { top: { style: 'thin' } }

  /**
   * @param {(worksheet: ExcelJS.Worksheet) => void} lay
   */
  const fitted = (lay) => {
    const worksheet = new ExcelJS.Workbook().addWorksheet('fitted')
    lay(worksheet)
    fitColumnsToTables(worksheet)
    return worksheet
  }

  it("widens a column to show a table cell's full text", () => {
    const worksheet = fitted((sheet) => {
      sheet.getColumn('A').width = 10
      write(sheet.getCell('A1'), 'Fibre-based composite', { border: boxed })
    })

    expect(worksheet.getColumn('A').width).toBeGreaterThan(
      'Fibre-based composite'.length
    )
  })

  it('widens a column to show a figure as formatted', () => {
    const worksheet = fitted((sheet) => {
      write(sheet.getCell('A1'), 1234567.4, {
        border: boxed,
        numFmt: WHOLE_TONNES
      })
    })

    // Longer than '1234567.4', so only the formatted figure needs this much.
    expect(worksheet.getColumn('A').width).toBeGreaterThan(
      '1,234,567'.length + 1
    )
  })

  it('widens a column further for a larger typeface', () => {
    /** @param {number} size */
    const widthAt = (size) =>
      fitted((sheet) => {
        write(sheet.getCell('A1'), 'Unsubmitted count', {
          border: boxed,
          font: { size }
        })
      }).getColumn('A').width

    expect(widthAt(22)).toBeGreaterThan(widthAt(11) ?? Infinity)
  })

  it('never narrows a column', () => {
    const worksheet = fitted((sheet) => {
      sheet.getColumn('A').width = 30
      write(sheet.getCell('A1'), 'Steel', { border: boxed })
    })

    expect(worksheet.getColumn('A').width).toBe(30)
  })

  it('leaves text outside a table, wrapped, or merged to its own layout', () => {
    const worksheet = fitted((sheet) => {
      sheet.getColumn('A').width = 10
      sheet.getColumn('B').width = 10
      sheet.getColumn('C').width = 10
      write(sheet.getCell('A1'), 'Reprocessor Data, a title over a table', {})
      write(sheet.getCell('B1'), 'Tonnage received for recycling', {
        border: boxed,
        alignment: { wrapText: true }
      })
      write(
        sheet.getCell('C1'),
        { richText: [{ text: 'January 2026 and more' }] },
        {
          border: boxed
        }
      )
      sheet.mergeCells('C1:D1')
    })

    expect(
      ['A', 'B', 'C'].map((column) => worksheet.getColumn(column).width)
    ).toEqual([10, 10, 10])
  })

  it('reads the text of rich text', () => {
    const worksheet = fitted((sheet) => {
      write(
        sheet.getCell('A1'),
        { richText: [{ text: 'Paper ' }, { text: 'and board, long' }] },
        { border: boxed }
      )
    })

    expect(worksheet.getColumn('A').width).toBeGreaterThan(
      'Paper and board, long'.length
    )
  })

  it('leaves a column alone for a table cell holding a date, which only month headings do, and they wrap', () => {
    const worksheet = fitted((sheet) => {
      sheet.getColumn('A').width = 4
      write(sheet.getCell('A1'), new Date('2026-01-01'), {
        border: boxed,
        numFmt: 'mmm-yy'
      })
    })

    expect(worksheet.getColumn('A').width).toBe(4)
  })
})
