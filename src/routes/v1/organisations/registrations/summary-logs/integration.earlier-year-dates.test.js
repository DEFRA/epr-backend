import { http, HttpResponse } from 'msw'

import { toYear } from '#common/helpers/dates/year.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import {
  createWasteBalanceMeta,
  exporter2027Loads,
  setupWasteBalanceIntegrationEnvironment,
  uploadAndValidate,
  uploadOn,
  withTemplateYear
} from './integration-test-helpers.js'

const YEAR_2027 = toYear(2027)

const earlierYearFailure = (header) =>
  expect.objectContaining({
    code: 'INVALID_DATE',
    errorCode: 'DATE_BEFORE_SUMMARY_LOG_YEAR',
    expected: 2027,
    deadline: '2027-02-28',
    actual: '2026-12-30',
    location: expect.objectContaining({ header, rowId: '1001' })
  })

describe('summary logs with a date in an earlier year', () => {
  const { getServer } = setupAuthContext()

  beforeEach(() => {
    getServer().use(
      http.post(
        'http://localhost:3001/v1/organisations/:orgId/registrations/:regId/summary-logs/:summaryLogId/upload-completed',
        () => HttpResponse.json({ success: true }, { status: 200 })
      )
    )
  })

  describe('a 2027 accredited exporter log', () => {
    const uploadWith2026DateOfExport = async (id) => {
      const env = await setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter',
        year: YEAR_2027
      })
      return uploadAndValidate(
        env,
        { summaryLogId: `summary-${id}`, fileId: `file-${id}` },
        {
          meta: withTemplateYear(createWasteBalanceMeta('EXPORTER'), YEAR_2027),
          data: exporter2027Loads([
            {
              rowId: 1001,
              dateReceived: '2027-01-04',
              exportDate: '2026-12-30'
            }
          ])
        }
      )
    }

    it.each([
      ['in January 2027', '2027-01-10T09:00:00.000Z'],
      [
        'on 28 February 2027, the last day 2026 is open',
        '2027-02-28T23:59:00.000Z'
      ]
    ])(
      'is rejected for a 2026 date of export when uploaded %s',
      async (_label, uploadedAt) => {
        uploadOn(uploadedAt)

        const validated = await uploadWith2026DateOfExport('open-2026')

        expect(validated.status).toBe(SUMMARY_LOG_STATUS.INVALID)
        expect(validated.validation.failures).toStrictEqual([
          earlierYearFailure('DATE_OF_EXPORT')
        ])
      }
    )

    it('accepts a 2026 date of export once 2026 has closed', async () => {
      uploadOn('2027-03-01T00:00:00.000Z')

      const validated = await uploadWith2026DateOfExport('closed-2026')

      expect(validated.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
    })
  })
})
