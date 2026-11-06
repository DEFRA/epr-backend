import { toYear } from '#common/helpers/dates/year.js'
import {
  toAccreditationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { FUTURE_ACCREDITATIONS_FROM_YEAR } from '#organisation-read-model/domain/model.js'

/** @import { FutureAccreditation } from '../port.js' */

export const REGISTRATION_NUMBER = toRegistrationNumber('R26ER5000560000AL')

/**
 * @param {Partial<FutureAccreditation>} [overrides]
 * @returns {FutureAccreditation}
 */
export const buildFutureAccreditation = (overrides = {}) => ({
  registrationNumber: REGISTRATION_NUMBER,
  year: toYear(FUTURE_ACCREDITATIONS_FROM_YEAR),
  accreditationNumber: toAccreditationNumber('A27ER5000560000AL'),
  prnIssuance: { tonnageBand: 'up_to_500' },
  status: {
    current: 'approved',
    timeline: [{ status: 'approved', at: '2027-01-01T00:00:00.000Z' }]
  },
  ...overrides
})
