import { randomUUID } from 'node:crypto'
import { MATERIAL, WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { ObjectId } from 'mongodb'
import { MONTHLY_PERIODS } from '#root/reports/domain/period-labels.js'

export const DEFAULT_ORG_ID = new ObjectId().toString()
export const DEFAULT_REG_ID = new ObjectId().toString()
export const DEFAULT_REPORT_START_DATE = '2024-01-01T00:00:00.000Z'
export const DEFAULT_REPORT_END_DATE = '2024-01-31T00:00:00.000Z'
export const DEFAULT_REPORT_DUE_DATE = '2024-02-15T00:00:00.000Z'
export const DEFAULT_REPORT_YEAR = 2024
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
export const buildCreateReportParams = (overrides = {}) => ({
  organisationId: DEFAULT_ORG_ID,
  registrationId: DEFAULT_REG_ID,
  year: DEFAULT_REPORT_YEAR,
  cadence: 'monthly',
  period: DEFAULT_REPORT_PERIOD,
  startDate: DEFAULT_REPORT_START_DATE,
  endDate: DEFAULT_REPORT_END_DATE,
  dueDate: DEFAULT_REPORT_DUE_DATE,
  material: MATERIAL.PLASTIC,
  wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
  changedBy: buildUserSummary(),
  ...overrides
})
