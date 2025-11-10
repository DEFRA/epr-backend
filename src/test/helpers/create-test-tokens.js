import Jwt from '@hapi/jwt'
import { generateKeyPairSync } from 'crypto'

export const generateEntraIdToken = () => {
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

  const mockEntraIdToken = Jwt.token.generate(
    {
      name: 'John Doe',
      aud: 'bd06da51-53f6-46d0-a9f0-ac562864c887',
      iss: `https://login.microsoftonline.com/6f504113-6b64-43f2-ade9-242e05780007/v2.0`,
      nbf: new Date().getTime() / 1000,
      exp: new Date().getTime() / 1000 + 3600
      // maxAgeSec: 3600, // 60 minutes
      // timeSkewSec: 15
    },
    { key: privateKey, algorithm: 'RS256' },
    { header: { kid: 'test-key-id' } }
  )

  // Add JWKS-required fields to the public key
  publicKey.kid = 'test-key-id'
  publicKey.use = 'sig'
  publicKey.alg = 'RS256'

  return { token: mockEntraIdToken, publicKey }
}
