import Jwt from '@hapi/jwt'
import { generateKeyPairSync } from 'crypto'

// Must match oidc.defra.clientId in config.js (ADMIN_UI_ENTRA_CLIENT_ID)
const VALID_ENTRA_AUDIENCE = 'test'

const USER_EMAIL = 'someone@test-comppany.com'

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

const baseValidObject = {
  name: 'John Doe',
  id: 'test-contact-id', // Contact ID for the user
  preferred_username: USER_EMAIL,
  aud: VALID_ENTRA_AUDIENCE,
  iss: `https://login.microsoftonline.com/6f504113-6b64-43f2-ade9-242e05780007/v2.0`,
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
    baseValidObject,
    validJwtSecretObject,
    validGenerateTokenOptions
  )

  return mockDefraIdToken
}

const generateDefraIdTokenWithWrongSignature = () => {
  const mockDefraIdToken = Jwt.token.generate(
    {
      ...baseValidObject,
      iss: `https://wrong-issuer.com/v2.0`
    },
    validJwtSecretObject,
    validGenerateTokenOptions
  )

  return mockDefraIdToken
}

const generateDefraIdTokenWithWrongAudience = () => {
  const mockDefraIdToken = Jwt.token.generate(
    {
      ...baseValidObject,
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
      ...baseValidObject,
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
      ...baseValidObject,
      preferred_username: USER_EMAIL
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
  unauthorisedUserToken: generateDefraIdTokenForUnauthorisedUser()
}
