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
  notes: 'Test notes',
  status: {
    currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
    created: {
      at: new Date('2026-01-10T10:00:00Z'),
      by: { id: 'user-123', name: 'Test User' }
    },
    issued: {
      at: new Date(issuedDate),
      by: { id: 'user-issuer', name: 'Issuer User', position: 'Manager' }
    },
    history: [
      {
        status: PRN_STATUS.DRAFT,
        at: new Date('2026-01-10T10:00:00Z'),
        by: { id: 'user-123', name: 'Test User' }
      },
      {
        status: PRN_STATUS.AWAITING_AUTHORISATION,
        at: new Date('2026-01-12T10:00:00Z'),
        by: { id: 'user-123', name: 'Test User' }
      },
      {
        status: PRN_STATUS.AWAITING_ACCEPTANCE,
        at: new Date(issuedDate),
        by: { id: 'user-issuer', name: 'Issuer User' }
      }
    ]
  },
  createdAt: new Date('2026-01-10T10:00:00Z'),
  createdBy: { id: 'user-123', name: 'Test User' },
  updatedAt: new Date(issuedDate),
  updatedBy: { id: 'user-issuer', name: 'Issuer User' },
  ...overrides
})
