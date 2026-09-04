import {
  buildRegistration,
  buildAccreditation,
  buildReadOrganisation
} from '#repositories/organisations/contract/test-data.js'
import { partialMock } from '#test/type-helpers.js'

export const TEST_REGISTRATION_NUMBER = 'R26ER5000000001PL'
export const TEST_ACCREDITATION_NUMBER = 'A26ER5000000001PL'

/**
 * Builds an org (read-shape, with computed `.status` fields) whose
 * registration links an accreditation with the given statusHistory. Both
 * carry fixed, non-undefined numbers so callers can build usage fixtures
 * from the module constants without reading a possibly-unset field back off
 * the built org.
 */
export const orgWithAccreditationHistory = (statusHistory, overrides = {}) => {
  const accreditation = buildAccreditation({
    statusHistory,
    accreditationNumber: TEST_ACCREDITATION_NUMBER,
    ...overrides
  })
  const registration = buildRegistration({
    accreditationId: accreditation.id,
    wasteProcessingType: accreditation.wasteProcessingType,
    registrationNumber: TEST_REGISTRATION_NUMBER
  })
  return buildReadOrganisation({
    registrations: [partialMock(registration)],
    accreditations: [partialMock(accreditation)]
  })
}
