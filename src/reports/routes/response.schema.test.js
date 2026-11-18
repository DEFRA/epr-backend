import { describe, expect, it } from 'vitest'

import { PERIOD_STATUS } from '#reports/domain/period-status.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import {
  reportDetailResponseSchema,
  reportsYearCalendarResponseSchema
} from './response.schema.js'

const validReport = {
  status: REPORT_STATUS.SUBMITTED,
  submissionNumber: 1,
  submittedAt: '2026-02-10T09:00:00.000Z',
  submittedBy: { name: 'Test User', position: 'Officer' }
}

const validItem = {
  year: 2026,
  period: 1,
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  dueDate: '2026-02-20',
  submissionNumber: 1,
  periodStatus: PERIOD_STATUS.DUE,
  cadence: 'monthly'
}

/** @param {object[]} reportingPeriods */
const accreditedCalendar = (reportingPeriods) => ({
  year: 2026,
  accredited: { accreditationNumber: 'ACC-1', reportingPeriods }
})

const validResponse = accreditedCalendar([
  validItem,
  { ...validItem, period: 2, report: validReport }
])

describe('reportsYearCalendarResponseSchema', () => {
  it('accepts a well-formed calendar response', () => {
    const { error } = reportsYearCalendarResponseSchema.validate(validResponse)

    expect(error).toBeUndefined()
  })

  it.each(Object.values(PERIOD_STATUS))(
    'accepts periodStatus "%s"',
    (periodStatus) => {
      const response = accreditedCalendar([{ ...validItem, periodStatus }])

      const { error } = reportsYearCalendarResponseSchema.validate(response)

      expect(error).toBeUndefined()
    }
  )

  it.each([
    ['a report id', { ...validReport, id: 'report-1' }],
    [
      'a submitter user id',
      { ...validReport, submittedBy: { ...validReport.submittedBy, id: 'u' } }
    ],
    ['a null submittedAt', { ...validReport, submittedAt: null }],
    ['a null submittedBy', { ...validReport, submittedBy: null }],
    ['a null report', null],
    [
      'a submitted report without its submission time',
      { ...validReport, submittedAt: undefined }
    ],
    [
      'a submitted report without its submitter',
      { ...validReport, submittedBy: undefined }
    ],
    [
      'a submission on a report not submitted now',
      { ...validReport, status: REPORT_STATUS.READY_TO_SUBMIT }
    ]
  ])('rejects %s', (_, report) => {
    const response = accreditedCalendar([{ ...validItem, report }])

    const { error } = reportsYearCalendarResponseSchema.validate(response)

    expect(error).toBeDefined()
  })

  it('rejects a null periodStatus', () => {
    const response = accreditedCalendar([{ ...validItem, periodStatus: null }])

    const { error } = reportsYearCalendarResponseSchema.validate(response)

    expect(error).toBeDefined()
  })

  it('rejects a missing periodStatus', () => {
    const { periodStatus: _, ...itemWithoutStatus } = validItem
    const response = accreditedCalendar([itemWithoutStatus])

    const { error } = reportsYearCalendarResponseSchema.validate(response)

    expect(error).toBeDefined()
  })

  it('rejects an unknown periodStatus value', () => {
    const response = accreditedCalendar([
      { ...validItem, periodStatus: 'archived' }
    ])

    const { error } = reportsYearCalendarResponseSchema.validate(response)

    expect(error).toBeDefined()
  })
})

describe('reportDetailResponseSchema incompleteSummaryLogRows (PAE-1420)', () => {
  const validDetail = {
    details: { material: 'plastic', site: null },
    recyclingActivity: { suppliers: [], totalTonnageReceived: 0 },
    source: { lastUploadedAt: null, summaryLogId: null },
    wasteSent: {
      finalDestinations: [],
      tonnageSentToAnotherSite: 0,
      tonnageSentToExporter: 0,
      tonnageSentToReprocessor: 0
    }
  }

  it('accepts a well-formed incompleteSummaryLogRows', () => {
    const { error } = reportDetailResponseSchema.validate({
      ...validDetail,
      incompleteSummaryLogRows: {
        total: 2,
        issues: [
          { sheet: 'Received', rowId: 'row-1', field: 'SUPPLIER_NAME' },
          { sheet: 'Received', rowId: 'row-1', field: 'SUPPLIER_ADDRESS' }
        ]
      }
    })

    expect(error).toBeUndefined()
  })

  it('rejects an incompleteSummaryLogRows whose total is not a number', () => {
    const { error } = reportDetailResponseSchema.validate({
      ...validDetail,
      incompleteSummaryLogRows: {
        total: 'two',
        issues: [{ sheet: 'Received', rowId: 'row-1', field: 'SUPPLIER_NAME' }]
      }
    })

    expect(error).toBeDefined()
  })

  it('rejects an issue missing the field locator', () => {
    const { error } = reportDetailResponseSchema.validate({
      ...validDetail,
      incompleteSummaryLogRows: {
        total: 1,
        issues: [{ sheet: 'Received', rowId: 'row-1' }]
      }
    })

    expect(error).toBeDefined()
  })
})
