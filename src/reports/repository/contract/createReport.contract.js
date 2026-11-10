import { beforeEach, describe, expect } from 'vitest'
import {
  REPORT_STATUS,
  REPORT_STATUS_SLOT
} from '#reports/domain/report-status.js'
import {
  MONTHLY_PERIODS,
  QUARTERLY_PERIODS
} from '#reports/domain/period-labels.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import {
  buildCreateReportParams,
  DEFAULT_ORG_NUMBER,
  DEFAULT_REG_NUMBER,
  DEFAULT_REPORT_DUE_DATE,
  DEFAULT_REPORT_END_DATE,
  DEFAULT_REPORT_PERIOD,
  DEFAULT_REPORT_START_DATE,
  DEFAULT_REPORT_YEAR
} from './test-data.js'

/** @import { ReportsRepositoryFactory } from '../port.js' */

/** @typedef {{ reportsRepository: ReportsRepositoryFactory }} ReportsFixture */

export const testCreateReportBehaviour = (it) => {
  describe('createReport', () => {
    let repository

    beforeEach(
      /** @param {ReportsFixture} fixture */ async ({ reportsRepository }) => {
        repository = reportsRepository()
      }
    )

    it('creates a report with in_progress status and correct initial fields', async () => {
      const changedBy = { id: 'user-1', name: 'Alice', position: 'Manager' }
      const result = await repository.createReport(
        buildCreateReportParams({
          material: 'plastic',
          siteAddress: '1 Recycling Lane',
          changedBy
        })
      )

      expect(result).toEqual({
        id: expect.any(String),
        version: 1,
        schemaVersion: 1,
        submissionNumber: 1,
        organisationNumber: DEFAULT_ORG_NUMBER,
        registrationNumber: DEFAULT_REG_NUMBER,
        accreditationNumber: expect.any(String),
        year: DEFAULT_REPORT_YEAR,
        cadence: 'monthly',
        period: DEFAULT_REPORT_PERIOD,
        startDate: DEFAULT_REPORT_START_DATE,
        endDate: DEFAULT_REPORT_END_DATE,
        dueDate: DEFAULT_REPORT_DUE_DATE,
        source: {
          lastUploadedAt: expect.any(String),
          summaryLogId: expect.any(String)
        },
        prn: null,
        recyclingActivity: {
          suppliers: [],
          totalTonnageReceived: 0,
          tonnageRecycled: null,
          tonnageNotRecycled: null
        },
        wasteSent: {
          tonnageSentToReprocessor: 0,
          tonnageSentToExporter: 0,
          tonnageSentToAnotherSite: 0,
          finalDestinations: []
        },
        material: 'plastic',
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        siteAddress: '1 Recycling Lane',
        status: {
          currentStatus: REPORT_STATUS.IN_PROGRESS,
          currentStatusAt: expect.any(String),
          created: { at: expect.any(String), by: changedBy },
          history: [
            {
              status: REPORT_STATUS.IN_PROGRESS,
              at: expect.any(String),
              by: changedBy
            }
          ]
        }
      })
    })

    it('stores the organisation, registration and accreditation numbers', async () => {
      const { id } = await repository.createReport(
        buildCreateReportParams({
          organisationNumber: toOrganisationNumber('500123'),
          registrationNumber: toRegistrationNumber('R25SR500010912PL'),
          accreditationNumber: toAccreditationNumber('A26ER5000000001PA')
        })
      )

      expect(await repository.findReportById(id)).toMatchObject({
        organisationNumber: '500123',
        registrationNumber: 'R25SR500010912PL',
        accreditationNumber: 'A26ER5000000001PA'
      })
    })

    it('stores a null accreditation number for a registered-only report', async () => {
      const { id } = await repository.createReport(
        buildCreateReportParams({
          cadence: 'quarterly',
          period: QUARTERLY_PERIODS.Q1,
          accreditationNumber: null
        })
      )

      expect(await repository.findReportById(id)).toMatchObject({
        accreditationNumber: null
      })
    })

    for (const [description, accreditationNumber] of /** @type {const} */ ([
      ['without an', undefined],
      ['with a null', null]
    ])) {
      it(`refuses an accredited report ${description} accreditation number`, async () => {
        await expect(
          repository.createReport(
            buildCreateReportParams({ accreditationNumber })
          )
        ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
      })
    }

    it('refuses a registered-only report with an accreditation number', async () => {
      await expect(
        repository.createReport(
          buildCreateReportParams({
            cadence: 'quarterly',
            period: QUARTERLY_PERIODS.Q1,
            // @ts-expect-error a registered-only report has no accreditation number
            accreditationNumber: toAccreditationNumber('A26ER5000000001PA')
          })
        )
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })

    it('throws conflict when creating duplicate report for same period and submissionNumber', async () => {
      await repository.createReport(
        buildCreateReportParams({ period: MONTHLY_PERIODS.February })
      )

      await expect(
        repository.createReport(
          buildCreateReportParams({ period: MONTHLY_PERIODS.February })
        )
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 409 },
        code: 'report_already_exists',
        event: {
          action: 'create_report',
          reason: 'cadence=monthly period=2 submissionNumber=1'
        }
      })
    })

    it('throws conflict when creating a second active draft for the same slot with a different submissionNumber', async () => {
      await repository.createReport(
        buildCreateReportParams({
          period: MONTHLY_PERIODS.February,
          submissionNumber: 1
        })
      )

      await expect(
        repository.createReport(
          buildCreateReportParams({
            period: MONTHLY_PERIODS.February,
            submissionNumber: 2
          })
        )
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 409 } })
    })

    it('allows creating multiple reports with different submissionNumber', async () => {
      const changedBy = { id: 'user-2', name: 'Bob', position: 'Reviewer' }
      const { id: firstId } = await repository.createReport(
        buildCreateReportParams({ period: MONTHLY_PERIODS.February })
      )

      await repository.updateReportStatus({
        reportId: firstId,
        version: 1,
        status: REPORT_STATUS.SUBMITTED,
        slot: REPORT_STATUS_SLOT.SUBMITTED,
        changedBy,
        submissionDeclaredBy: 'Test User'
      })

      const { id: secondId } = await repository.createReport(
        buildCreateReportParams({
          period: MONTHLY_PERIODS.February,
          submissionNumber: 2
        })
      )

      expect(secondId).not.toBe(firstId)
    })

    it('throws on invalid cadence', async () => {
      await expect(
        // @ts-expect-error reports are monthly or quarterly
        repository.createReport(buildCreateReportParams({ cadence: 'weekly' }))
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })

    for (const number of ['organisationNumber', 'registrationNumber']) {
      it(`refuses a report without its ${number}, which no read could find`, async () => {
        await expect(
          repository.createReport(
            buildCreateReportParams({ [number]: undefined })
          )
        ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
      })
    }

    it('throws on missing required fields', async () => {
      await expect(
        repository.createReport({ organisationNumber: DEFAULT_ORG_NUMBER })
      ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 } })
    })
  })
}
