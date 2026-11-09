import { beforeEach, describe, expect, it } from 'vitest'

import { calendarDate } from '#common/helpers/date-formatter.js'
import { toYear } from '#common/helpers/dates/year.js'
import { MATERIAL, WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { createInMemoryReportsRepository } from './inmemory.js'

/** @import { CreateReportParams, ReportsRepository } from './port.js' */

const ACCREDITATION_NUMBER = toAccreditationNumber('A26ER5000000001PA')

/** @type {Omit<CreateReportParams, 'cadence' | 'accreditationNumber'>} */
const REPORT = {
  organisationNumber: toOrganisationNumber('500123'),
  registrationNumber: toRegistrationNumber('R26ER5000000001PA'),
  year: toYear(2026),
  period: 1,
  startDate: calendarDate('2026-01-01'),
  endDate: calendarDate('2026-01-31'),
  dueDate: calendarDate('2026-02-20'),
  changedBy: { id: 'user-1', position: 'Officer' },
  submissionNumber: 1,
  source: { summaryLogId: null, lastUploadedAt: null },
  material: MATERIAL.PLASTIC,
  wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
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
  prn: null
}

describe('the reports port ties the accreditation number to the cadence', () => {
  /** @type {ReportsRepository} */
  let repository

  beforeEach(() => {
    repository = createInMemoryReportsRepository()()
  })

  it('takes an accredited monthly report and a registered-only quarterly one', async () => {
    const created = [
      await repository.createReport({
        ...REPORT,
        cadence: 'monthly',
        accreditationNumber: ACCREDITATION_NUMBER
      }),
      await repository.createReport({
        ...REPORT,
        cadence: 'quarterly',
        accreditationNumber: null
      })
    ]

    expect(created.map((report) => report.accreditationNumber)).toEqual([
      ACCREDITATION_NUMBER,
      null
    ])
  })

  it('takes no monthly report without an accreditation number', async () => {
    await expect(
      // @ts-expect-error a monthly report is for an accreditation
      repository.createReport({ ...REPORT, cadence: 'monthly' })
    ).rejects.toMatchObject({ output: { statusCode: 400 } })
    await expect(
      // @ts-expect-error a monthly report is for an accreditation
      repository.createReport({
        ...REPORT,
        cadence: 'monthly',
        accreditationNumber: null
      })
    ).rejects.toMatchObject({ output: { statusCode: 400 } })
  })

  it('takes no quarterly report with an accreditation number', async () => {
    await expect(
      // @ts-expect-error a quarterly report is registered-only
      repository.createReport({
        ...REPORT,
        cadence: 'quarterly',
        accreditationNumber: ACCREDITATION_NUMBER
      })
    ).rejects.toMatchObject({ output: { statusCode: 400 } })
  })

  it('takes no cadence other than monthly or quarterly', async () => {
    await expect(
      repository.createReport({
        ...REPORT,
        // @ts-expect-error reports are monthly or quarterly
        cadence: 'weekly',
        accreditationNumber: null
      })
    ).rejects.toMatchObject({ output: { statusCode: 400 } })
  })
})
