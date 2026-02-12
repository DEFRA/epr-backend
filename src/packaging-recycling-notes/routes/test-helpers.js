/** @import { CognitoAccessTokenPayload } from '#common/helpers/auth/types.js' */

import Jwt from '@hapi/jwt'
import { generateKeyPairSync } from 'node:crypto'

import { MATERIAL } from '#domain/organisations/model.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'

// @ts-ignore - @types/node is missing generateKeyPairSync overloads for jwk format
const keyPair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'jwk'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
})

const privateKey = keyPair.privateKey

const kid = 'test-cognito-key-id'

export const testPublicKey = {
  ...keyPair.publicKey,
  kid,
  use: 'sig',
  alg: 'RS256'
}

/** @type {{key: string, algorithm: 'RS256'}} */
const jwtSecret = { key: privateKey, algorithm: 'RS256' }
const generateTokenOptions = { header: { kid } }

const prnId = '507f1f77bcf86cd799439011'
const prnNumber = 'ER2600001'
const draftDate = '2026-01-10T10:00:00Z'
const authorisedDate = '2026-01-12T10:00:00Z'
const issuedDate = '2026-01-15T10:00:00Z'

const creator = { id: 'user-123', name: 'Test User' }
const issuer = { id: 'user-issuer', name: 'Issuer User' }

/** @returns {number} */
const nowInSeconds = () => Math.floor(Date.now() / 1000)

const ONE_HOUR = 3600

/** @param {string} clientId @returns {Required<CognitoAccessTokenPayload>} */
const baseCognitoClaims = (clientId) => ({
  iss: 'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_test',
  sub: clientId,
  exp: nowInSeconds() + ONE_HOUR,
  iat: nowInSeconds(),
  jti: '00000000-0000-0000-0000-000000000000',
  scope: 'epr-backend-resource-srv/access',
  auth_time: 1734387454,
  client_id: clientId,
  token_use: /** @type {const} */ ('access'),
  version: 2
})

/** @param {string} [clientId] @param {Partial<CognitoAccessTokenPayload>} [claimOverrides] @returns {string} */
export const generateExternalApiToken = (
  clientId = 'stub-client-id',
  claimOverrides = {}
) =>
  Jwt.token.generate(
    { ...baseCognitoClaims(clientId), ...claimOverrides },
    jwtSecret,
    generateTokenOptions
  )

/** @returns {string} */
export const generateExternalApiTokenWithoutClientId = () => {
  const { client_id: _, ...claims } = baseCognitoClaims('to-ignore')
  return Jwt.token.generate(claims, jwtSecret, generateTokenOptions)
}

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
