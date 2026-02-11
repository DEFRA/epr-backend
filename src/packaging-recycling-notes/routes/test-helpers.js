import Jwt from '@hapi/jwt'

import { MATERIAL } from '#domain/organisations/model.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'

const prnId = '507f1f77bcf86cd799439011'
const prnNumber = 'ER2600001'
const draftDate = '2026-01-10T10:00:00Z'
const authorisedDate = '2026-01-12T10:00:00Z'
const issuedDate = '2026-01-15T10:00:00Z'

const creator = { id: 'user-123', name: 'Test User' }
const issuer = { id: 'user-issuer', name: 'Issuer User' }

export const generateExternalApiToken = (clientId = 'stub-client-id') =>
  Jwt.token.generate(
    {
      iss: 'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_test',
      sub: clientId,
      jti: '00000000-0000-0000-0000-000000000000',
      auth_time: 1734387454,
      client_id: clientId,
      scope: 'epr-backend-resource-srv/access',
      token_use: 'access',
      version: 2
    },
    { key: 'unused', algorithm: 'HS256' }
  )

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
      at: new Date(authorisedDate),
      by: creator
    },
    issued: {
      at: new Date(issuedDate),
      by: { ...issuer, position: 'Manager' }
    },
    history: [
      {
        status: PRN_STATUS.DRAFT,
        at: new Date(draftDate),
        by: creator
      },
      {
        status: PRN_STATUS.AWAITING_AUTHORISATION,
        at: new Date(authorisedDate),
        by: creator
      },
      {
        status: PRN_STATUS.AWAITING_ACCEPTANCE,
        at: new Date(issuedDate),
        by: issuer
      }
    ]
  },
  createdAt: new Date(draftDate),
  createdBy: creator,
  updatedAt: new Date(issuedDate),
  updatedBy: issuer,
  ...overrides
})
