/** @import {Accreditation} from '#domain/organisations/accreditation.js' */

/**
 * @param {Partial<Accreditation>} [overrides]
 * @returns {Accreditation}
 */
export const buildAccreditation = (overrides = {}) => ({
  id: 'acc-1',
  accreditationNumber: 'ACC-001',
  status: 'approved',
  validFrom: '2024-01-01',
  validTo: '2024-12-31',
  statusHistory: [],
  material: 'plastic',
  wasteProcessingType: 'reprocessor',
  submittedToRegulator: '2024-01-01T00:00:00.000Z',
  submitterContactDetails: {
    fullName: 'Test User',
    email: 'test@example.com',
    phone: '01234567890'
  },
  formSubmission: { id: 'fs-1', time: new Date('2024-01-01T00:00:00.000Z') },
  prnIssuance: {
    incomeBusinessPlan: [],
    signatories: [],
    tonnageBand: 'BAND_1'
  },
  ...overrides
})
