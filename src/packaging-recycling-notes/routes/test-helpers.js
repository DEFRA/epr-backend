import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { MATERIAL } from '#domain/organisations/model.js'

const prnId = '507f1f77bcf86cd799439011'
const prnNumber = 'ER2600001'
const issuedDate = '2026-01-15T10:00:00Z'

export const createMockIssuedPrn = (overrides = {}) => ({
  id: prnId,
  schemaVersion: 2,
  prnNumber,
  organisation: {
    id: 'org-123',
    name: 'Test Organisation'
  },
  registrationId: 'reg-456',
  accreditation: {
    id: 'acc-789',
    accreditationNumber: 'ACC-2026-001',
    accreditationYear: 2026,
    material: MATERIAL.PLASTIC,
    submittedToRegulator: 'ea'
  },
  issuedToOrganisation: {
    id: 'producer-org-789',
    name: 'Producer Org'
  },
  tonnage: 100,
  isExport: false,
  isDecemberWaste: false,
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
