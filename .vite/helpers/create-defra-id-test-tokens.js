import Jwt from '@hapi/jwt'
import { generateKeyPairSync, randomUUID } from 'crypto'
import org1 from '#data/fixtures/common/epr-organisations/sample-organisation-1.json' with { type: 'json' }

const VALID_DEFRA_AUDIENCE = 'test-defra'
export const VALID_TOKEN_CONTACT_ID = randomUUID()
export const USER_PRESENT_IN_ORG1_EMAIL = org1.submitterContactDetails.email
export const USER_ABSENT_IN_ORG1_EMAIL = 'random@email.com'
export const VALID_TOKEN_CURRENT_RELATIONSHIP = randomUUID()
export const COMPANY_1_ID = randomUUID()
export const COMPANY_1_NAME = 'Lost Ark Adventures Ltd'
const COMPANY_2_ID = randomUUID()
export const DEFRA_TOKEN_SECOND_RELATIONSHIP_ID = randomUUID()
export const VALID_TOKEN_RELATIONSHIPS = [
  `${VALID_TOKEN_CURRENT_RELATIONSHIP}:${COMPANY_1_ID}:${COMPANY_1_NAME}`,
  `${DEFRA_TOKEN_SECOND_RELATIONSHIP_ID}:${COMPANY_2_ID}:Company 2 Name`
]

export const FIXTURE_ORG_1_ID = org1.id

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
export const userPresentInOrg1DefraIdTokenPayload = {
  contactId: VALID_TOKEN_CONTACT_ID,
  email: USER_PRESENT_IN_ORG1_EMAIL,
  firstName: 'John',
  lastName: 'Doe',
  iss: `https://dcidmtest.b2clogin.com/DCIDMTest.onmicrosoft.com/v2.0`,
  aud: VALID_DEFRA_AUDIENCE,
  currentRelationshipId: VALID_TOKEN_CURRENT_RELATIONSHIP,
  relationships: VALID_TOKEN_RELATIONSHIPS,
  exp: new Date().getTime() / 1000 + 3600,
  iat: new Date().getTime() / 1000,
  nbf: new Date().getTime() / 1000
}

/** @type {import('../../src/common/helpers/auth/types.js').DefraIdTokenPayload} */
export const userAbsentInOrg1DefraIdTokenPayload = {
  ...userPresentInOrg1DefraIdTokenPayload,
  email: USER_ABSENT_IN_ORG1_EMAIL,
  contactId: randomUUID(),
  firstName: 'Absent',
  lastName: 'User'
}

/** @type {{key: string, algorithm: 'RS256'}} */
const validJwtSecretObject = { key: privateKey, algorithm: 'RS256' }
const validGenerateTokenOptions = { header: { kid: publicKey.kid } }

const generateValidDefraIdToken = (tokenPayload) => {
  const mockDefraIdToken = Jwt.token.generate(
    tokenPayload,
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
    userPresentInOrg1DefraIdTokenPayload,
    { key: wrongKeyPair.privateKey, algorithm: 'RS256' },
    validGenerateTokenOptions
  )

  return mockDefraIdToken
}

const generateDefraIdTokenWithWrongAudience = () => {
  const mockDefraIdToken = Jwt.token.generate(
    {
      ...userPresentInOrg1DefraIdTokenPayload,
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
      ...userPresentInOrg1DefraIdTokenPayload,
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
      ...userPresentInOrg1DefraIdTokenPayload,
      id: 'unknownId',
      email: 'unknown.email@example.com'
    },
    validJwtSecretObject,
    validGenerateTokenOptions
  )

  return mockDefraIdToken
}

const generateDefraIdTokenWithoutRelationship = () => {
  const {
    currentRelationshipId: _c,
    relationships: _r,
    ...restPayload
  } = userPresentInOrg1DefraIdTokenPayload
  const mockDefraIdToken = Jwt.token.generate(
    {
      ...restPayload,
      iss: `https://wrong-issuer.com/v2.0`
    },
    validJwtSecretObject,
    validGenerateTokenOptions
  )

  return mockDefraIdToken
}

export const defraIdMockAuthTokens = {
  validToken: generateValidDefraIdToken(userPresentInOrg1DefraIdTokenPayload),
  absentUserToken: generateValidDefraIdToken(
    userAbsentInOrg1DefraIdTokenPayload
  ),
  wrongSignatureToken: generateDefraIdTokenWithWrongSignature(),
  wrongIssuerToken: generateDefraIdTokenWithWrongIssuer(),
  wrongAudienceToken: generateDefraIdTokenWithWrongAudience(),
  missingRelationshipToken: generateDefraIdTokenWithoutRelationship(),
  unknownUserToken: generateDefraIdTokenForUnauthorisedUser()
}
