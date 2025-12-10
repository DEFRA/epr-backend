import Jwt from '@hapi/jwt'
import { generateKeyPairSync } from 'crypto'

const VALID_DEFRA_AUDIENCE = 'test-defra'
const USER_EMAIL = 'someone@test-company.com'
export const VALID_TOKEN_CURRENT_RELATIONSHIP_ID =
  '660e8400-e29b-41d4-a716-446655440000'
export const VALID_TOKEN_CURRENT_ORG_ID = '550e8400-e29b-41d4-a716-446655440000'
export const VALID_TOKEN_RELATIONSHIPS = [
  '660e8400-e29b-41d4-a716-446655440000:550e8400-e29b-41d4-a716-446655440000:Test Company Ltd',
  '660e8400-e29b-41d4-a716-446655440001:550e8400-e29b-41d4-a716-446655440001:Another Company Ltd'
]

// Generate key pair once at module load time
// @ts-ignore
const keyPair = generateKeyPairSync('rsa', {
  modulusLength: 4096,
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

/** @type {import('crypto').JsonWebKey & {kid: string, use: string, alg: string}} */
export const publicKey = {
  // @ts-ignore - keyPair.publicKey is JsonWebKey but spread causes type issues
  ...keyPair.publicKey,

  // Add JWKS-required fields to the public key
  kid: 'test-key-id',
  use: 'sig',
  alg: 'RS256'
}

/** @type {import('../../src/common/helpers/auth/types.js').DefraIdTokenPayload} */
export const baseDefraIdTokenPayload = {
  contactId: 'test-contact-id',
  email: USER_EMAIL,
  firstName: 'John',
  lastName: 'Doe',
  iss: `https://dcidmtest.b2clogin.com/DCIDMTest.onmicrosoft.com/v2.0`,
  aud: VALID_DEFRA_AUDIENCE,
  currentRelationshipId: VALID_TOKEN_CURRENT_RELATIONSHIP_ID,
  relationships: VALID_TOKEN_RELATIONSHIPS,
  exp: new Date().getTime() / 1000 + 3600,
  iat: new Date().getTime() / 1000,
  nbf: new Date().getTime() / 1000
}

/** @type {{key: string, algorithm: 'RS256'}} */
const validJwtSecretObject = { key: privateKey, algorithm: 'RS256' }
const validGenerateTokenOptions = { header: { kid: publicKey.kid } }

const generateValidDefraIdToken = () => {
  const mockDefraIdToken = Jwt.token.generate(
    baseDefraIdTokenPayload,
    validJwtSecretObject,
    validGenerateTokenOptions
  )

  return mockDefraIdToken
}

const generateDefraIdTokenWithWrongSignature = () => {
  // Generate a different key pair to create an invalid signature
  // @ts-ignore - @types/node is missing generateKeyPairSync overloads for jwk format
  const wrongKeyPair = generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: {
      type: 'spki',
      format: 'jwk'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  })

  const mockDefraIdToken = Jwt.token.generate(
    baseDefraIdTokenPayload,
    { key: wrongKeyPair.privateKey, algorithm: 'RS256' },
    validGenerateTokenOptions
  )

  return mockDefraIdToken
}

const generateDefraIdTokenWithWrongAudience = () => {
  const mockDefraIdToken = Jwt.token.generate(
    {
      ...baseDefraIdTokenPayload,
      aud: 'random-wrong-audience'
    },
    validJwtSecretObject,
    validGenerateTokenOptions
  )

  return mockDefraIdToken
}

const generateDefraIdTokenWithWrongIssuer = () => {
  const mockDefraIdToken = Jwt.token.generate(
    {
      ...baseDefraIdTokenPayload,
      iss: `https://wrong-issuer.com/v2.0`
    },
    validJwtSecretObject,
    validGenerateTokenOptions
  )

  return mockDefraIdToken
}

const generateDefraIdTokenForUnauthorisedUser = () => {
  const mockDefraIdToken = Jwt.token.generate(
    {
      ...baseDefraIdTokenPayload,
      id: 'unknownId',
      email: 'unknown.email@example.com'
    },
    validJwtSecretObject,
    validGenerateTokenOptions
  )

  return mockDefraIdToken
}

export const defraIdMockAuthTokens = {
  validToken: generateValidDefraIdToken(),
  wrongSignatureToken: generateDefraIdTokenWithWrongSignature(),
  wrongIssuerToken: generateDefraIdTokenWithWrongIssuer(),
  wrongAudienceToken: generateDefraIdTokenWithWrongAudience(),
  unknownUserToken: generateDefraIdTokenForUnauthorisedUser()
}
