import Jwt from '@hapi/jwt'
import { generateKeyPairSync } from 'crypto'

const VALID_DEFRA_AUDIENCE = 'test-defra'

const USER_EMAIL = 'someone@test-company.com'

// Generate key pair once at module load time
// @ts-ignore - @types/node is missing generateKeyPairSync overloads for jwk format (incomplete fix in PR #63492)
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
  ...keyPair.publicKey,

  // Add JWKS-required fields to the public key
  kid: 'test-key-id',
  use: 'sig',
  alg: 'RS256'
}

export const baseDefraIdTokenPayload = {
  name: 'John Doe',
  id: 'test-contact-id',
  email: USER_EMAIL,
  aud: VALID_DEFRA_AUDIENCE,
  iss: `https://dcidmtest.b2clogin.com/DCIDMTest.onmicrosoft.com/v2.0`,
  currentRelationshipId: 'rel-1',
  relationships: ['rel-1'],
  nbf: new Date().getTime() / 1000,
  exp: new Date().getTime() / 1000 + 3600,
  maxAgeSec: 3600, // 60 minutes
  timeSkewSec: 15
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
