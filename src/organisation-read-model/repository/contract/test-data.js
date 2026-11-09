import { toYear } from '#common/helpers/dates/year.js'
import {
  toAccreditationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'

/** @import { ExternalAccreditation } from '../to-read-model.js' */

const REGISTRATION_NUMBER = toRegistrationNumber('R26ER5000560000AL')
const ACCREDITATION_YEAR = 2027

/**
 * @param {Partial<ExternalAccreditation>} [overrides]
 * @returns {ExternalAccreditation}
 */
export const buildExternalAccreditation = (overrides = {}) => ({
  registrationNumber: REGISTRATION_NUMBER,
  year: toYear(ACCREDITATION_YEAR),
  accreditationNumber: toAccreditationNumber('A27ER5000560000AL'),
  prnIssuance: { tonnageBand: 'up_to_500' },
  status: {
    current: 'approved',
    timeline: [{ status: 'approved', at: '2027-01-01T00:00:00.000Z' }]
  },
  ...overrides
})
