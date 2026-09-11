import { describe, expect, it } from 'vitest'

import { buildDownloadDisposition } from './download-disposition.js'

describe('buildDownloadDisposition', () => {
  it('names an xlsx download by registration number and the second of submission', () => {
    expect(
      buildDownloadDisposition(
        'R26ER5000000002PA',
        '2026-09-11T09:15:42.318Z',
        'xlsx'
      )
    ).toBe('attachment; filename="R26ER5000000002PA-2026-09-11-091542.xlsx"')
  })

  it('names a csv download identically but for the extension', () => {
    expect(
      buildDownloadDisposition(
        'R26ER5000000002PA',
        '2026-09-11T09:15:42.318Z',
        'csv'
      )
    ).toBe('attachment; filename="R26ER5000000002PA-2026-09-11-091542.csv"')
  })

  it('keeps the second, not the millisecond, so a same-day resubmission is told apart', () => {
    expect(
      buildDownloadDisposition('REG-1', '2026-09-11T09:15:42.999Z', 'csv')
    ).toBe(buildDownloadDisposition('REG-1', '2026-09-11T09:15:42.001Z', 'csv'))
  })
})
