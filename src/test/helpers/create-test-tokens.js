import Jwt from '@hapi/jwt'
import { generateKeyPairSync } from 'crypto'

// Must match the audience in config.js (SECRET_ADMIN_UI_AS_AUDIENCE)
const validEntraTokenAudience = 'test'

// Generate key pair once at module load time
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
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

// Add JWKS-required fields to the public key
publicKey.kid = 'test-key-id'
publicKey.use = 'sig'
publicKey.alg = 'RS256'

const generateValidEntraIdToken = () => {
  const mockEntraIdToken = Jwt.token.generate(
    {
      name: 'John Doe',
      email: 'me@example.com', // Must be in the service-maintainer list in config.js
      id: 'test-contact-id', // Contact ID for the user
      aud: validEntraTokenAudience,
      iss: `https://login.microsoftonline.com/6f504113-6b64-43f2-ade9-242e05780007/v2.0`,
      nbf: new Date().getTime() / 1000,
      exp: new Date().getTime() / 1000 + 3600,
      maxAgeSec: 3600, // 60 minutes
      timeSkewSec: 15
    },
    { key: privateKey, algorithm: 'RS256' },
    { header: { kid: publicKey.kid } }
  )

  return mockEntraIdToken
}

const generateEntraIdTokenWithWrongSignature = () => {
  const mockEntraIdToken = Jwt.token.generate(
    {
      name: 'John Doe',
      email: 'me@example.com', // Must be in the service-maintainer list in config.js
      id: 'test-contact-id', // Contact ID for the user
      aud: validEntraTokenAudience,
      iss: `https://wrong-issuer.com/v2.0`,
      nbf: new Date().getTime() / 1000,
      exp: new Date().getTime() / 1000 + 3600,
      maxAgeSec: 3600, // 60 minutes
      timeSkewSec: 15
    },
    { key: privateKey, algorithm: 'RS256' },
    { header: { kid: publicKey.kid } }
  )

  return mockEntraIdToken
}

const generateEntraIdTokenWithWrongAudience = () => {
  const mockEntraIdToken = Jwt.token.generate(
    {
      name: 'John Doe',
      email: 'me@example.com', // Must be in the service-maintainer list in config.js
      id: 'test-contact-id', // Contact ID for the user
      aud: 'random-wrong-audience',
      iss: `https://wrong-issuer.com/v2.0`,
      nbf: new Date().getTime() / 1000,
      exp: new Date().getTime() / 1000 + 3600,
      maxAgeSec: 3600, // 60 minutes
      timeSkewSec: 15
    },
    { key: privateKey, algorithm: 'RS256' },
    { header: { kid: publicKey.kid } }
  )

  return mockEntraIdToken
}

const generateEntraIdTokenWithWrongIssuer = () => {
  const mockEntraIdToken = Jwt.token.generate(
    {
      name: 'John Doe',
      email: 'me@example.com', // Must be in the service-maintainer list in config.js
      id: 'test-contact-id', // Contact ID for the user
      aud: validEntraTokenAudience,
      iss: `https://wrong-issuer.com/v2.0`,
      nbf: new Date().getTime() / 1000,
      exp: new Date().getTime() / 1000 + 3600,
      maxAgeSec: 3600, // 60 minutes
      timeSkewSec: 15
    },
    { key: privateKey, algorithm: 'RS256' },
    { header: { kid: publicKey.kid } }
  )

  return mockEntraIdToken
}

export const generateMockEntraIdTokens = () => {
  const validToken = generateValidEntraIdToken()
  const wrongSignatureToken = generateEntraIdTokenWithWrongSignature()
  const wrongIssuerToken = generateEntraIdTokenWithWrongIssuer()
  const wrongAudienceToken = generateEntraIdTokenWithWrongAudience()

  return {
    validToken,
    wrongSignatureToken,
    wrongIssuerToken,
    wrongAudienceToken
  }
}

// Export the public key so it can be used in JWKS responses
export const getTestPublicKey = () => publicKey
