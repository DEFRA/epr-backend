import { calendarDate } from '#common/helpers/date-formatter.js'
import { toYear } from '#common/helpers/dates/year.js'
import { randomInt, randomUUID } from 'node:crypto'
import { MATERIAL, WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'

/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */
import { toSummaryLogFileId } from '#domain/summary-logs/ids.js'
import { ObjectId } from 'mongodb'
import { MONTHLY_PERIODS } from '#root/reports/domain/period-labels.js'
import {
  REPORT_STATUS,
  REPORT_STATUS_SLOT
} from '#reports/domain/report-status.js'

export const DEFAULT_ORG_ID = new ObjectId().toString()
export const DEFAULT_REG_ID = new ObjectId().toString()

const MAX_TEST_ORGANISATION_NUMBER = 1_000_000_000_000

/** An organisation number no other test uses. */
export const uniqueOrganisationNumber = () =>
  toOrganisationNumber(String(randomInt(1, MAX_TEST_ORGANISATION_NUMBER)))

/** A registration number no other test uses. */
export const uniqueRegistrationNumber = () =>
  toRegistrationNumber(`R${randomUUID()}`)

export const DEFAULT_ORG_NUMBER = uniqueOrganisationNumber()
export const DEFAULT_REG_NUMBER = uniqueRegistrationNumber()

/**
 * The numbers a report for a test organisation's registration is stored under.
 * @param {{ organisationNumber: OrganisationNumber }} organisation
 * @param {{ registrationNumber?: string | null }} registration
 */
export const reportKeyOf = (organisation, registration) => ({
  organisationNumber: organisation.organisationNumber,
  registrationNumber: toRegistrationNumber(
    /** @type {string} */ (registration.registrationNumber)
  )
})
export const DEFAULT_REPORT_START_DATE = calendarDate('2024-01-01')
export const DEFAULT_REPORT_END_DATE = calendarDate('2024-01-31')
export const DEFAULT_REPORT_DUE_DATE = calendarDate('2024-02-15')
const REPORT_YEAR = 2024
export const DEFAULT_REPORT_YEAR = toYear(REPORT_YEAR)
export const DEFAULT_REPORT_PERIOD = MONTHLY_PERIODS.January

/**
 * @returns {import('../port.js').UserSummary}
 */
const buildUserSummary = (overrides = {}) => ({
  id: overrides.id ?? randomUUID(),
  name: overrides.name ?? 'Test User',
  position: overrides.position ?? 'Officer'
})

/**
 * @param {Partial<import('../port.js').CreateReportParams>} [overrides]
 * @returns {import('../port.js').CreateReportParams}
 */
export const DEFAULT_CHANGED_BY = {
  id: 'user-1',
  name: 'Alice',
  position: 'Officer'
}

/**
 * Creates a report and advances it to submitted via ready_to_submit.
 * @param {import('../port.js').ReportsRepository} repository
 * @param {Partial<import('../port.js').CreateReportParams>} [overrides]
 * @returns {Promise<string>} the submitted report id
 */
export const createAndSubmitReport = async (repository, overrides = {}) => {
  const { id } = await repository.createReport(
    buildCreateReportParams(overrides)
  )
  await repository.updateReportStatus({
    reportId: id,
    version: 1,
    status: REPORT_STATUS.READY_TO_SUBMIT,
    slot: REPORT_STATUS_SLOT.READY,
    changedBy: DEFAULT_CHANGED_BY
  })
  await repository.updateReportStatus({
    reportId: id,
    version: 2,
    status: REPORT_STATUS.SUBMITTED,
    slot: REPORT_STATUS_SLOT.SUBMITTED,
    changedBy: DEFAULT_CHANGED_BY,
    submissionDeclaredBy: 'Test User'
  })
  return id
}

/**
 * Each override is checked on its own, so a contract test can still pair a
 * cadence with the wrong accreditation number for the repository to refuse.
 * @param {Partial<import('../port.js').CreateReportParams>} [overrides]
 * @returns {import('../port.js').CreateReportParams}
 */
export const buildCreateReportParams = (overrides = {}) =>
  /** @type {import('../port.js').CreateReportParams} */ ({
    organisationNumber: DEFAULT_ORG_NUMBER,
    registrationNumber: DEFAULT_REG_NUMBER,
    accreditationNumber:
      (overrides.cadence ?? 'monthly') === 'monthly'
        ? toAccreditationNumber('A24ER5000000001PL')
        : null,
    year: DEFAULT_REPORT_YEAR,
    cadence: 'monthly',
    period: DEFAULT_REPORT_PERIOD,
    submissionNumber: 1,
    startDate: DEFAULT_REPORT_START_DATE,
    endDate: DEFAULT_REPORT_END_DATE,
    dueDate: DEFAULT_REPORT_DUE_DATE,
    material: MATERIAL.PLASTIC,
    wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
    changedBy: buildUserSummary(),
    source: {
      summaryLogId: toSummaryLogFileId('sl-1'),
      lastUploadedAt: '2026-04-01T21:22:28.351Z'
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
    ...overrides
  })
