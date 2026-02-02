/**
 * Builds a PRN document for use in contract tests.
 * @param {object} overrides - Properties to override
 * @returns {object} PRN document
 */
export const buildPrn = (overrides = {}) => ({
  _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  prnNumber: 'PRN-2026-00001',
  accreditationId: '507f1f77bcf86cd799439011',
  organisationId: '6507f1f77bcf86cd79943901',
  issuedToOrganisation: {
    id: 'producer-001',
    name: 'ComplyPak Ltd'
  },
  tonnageValue: 9,
  createdAt: new Date('2026-01-21T10:30:00Z'),
  status: { currentStatus: 'awaiting_authorisation' },
  ...overrides
})
