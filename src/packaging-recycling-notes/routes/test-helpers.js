import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { MATERIAL } from '#domain/organisations/model.js'

const prnId = '507f1f77bcf86cd799439011'
const prnNumber = 'ER2600001'
const issuedDate = '2026-01-15T10:00:00Z'

export const createMockIssuedPrn = (overrides = {}) => ({
  id: prnId,
  schemaVersion: 1,
  prnNumber,
  organisationId: 'org-123',
  accreditationId: 'acc-789',
  issuedToOrganisation: {
    id: 'producer-org-789',
    name: 'Producer Org'
  },
  tonnage: 100,
  material: MATERIAL.PLASTIC,
  isExport: false,
  isDecemberWaste: false,
  accreditationYear: 2026,
  issuedAt: new Date(issuedDate),
  issuedBy: { id: 'user-issuer', name: 'Issuer User', position: 'Manager' },
  notes: 'Test notes',
  status: {
    currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
    history: [
      { status: PRN_STATUS.DRAFT, updatedAt: new Date('2026-01-10T10:00:00Z') },
      {
        status: PRN_STATUS.AWAITING_AUTHORISATION,
        updatedAt: new Date('2026-01-12T10:00:00Z')
      },
      {
        status: PRN_STATUS.AWAITING_ACCEPTANCE,
        updatedAt: new Date(issuedDate)
      }
    ]
  },
  createdAt: new Date('2026-01-10T10:00:00Z'),
  createdBy: { id: 'user-123', name: 'Test User' },
  updatedAt: new Date(issuedDate),
  updatedBy: { id: 'user-issuer', name: 'Issuer User' },
  ...overrides
})
