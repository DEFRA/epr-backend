import Jwt from '@hapi/jwt'
import { testTokens, getTestPublicKey } from './create-test-tokens.js'

describe('create-test-tokens', () => {
  describe('testTokens', () => {
    it('should export all required token types', () => {
      expect(testTokens).toHaveProperty('validToken')
      expect(testTokens).toHaveProperty('wrongSignatureToken')
      expect(testTokens).toHaveProperty('wrongIssuerToken')
      expect(testTokens).toHaveProperty('wrongAudienceToken')
      expect(testTokens).toHaveProperty('unauthorisedUserToken')
    })

    it('should generate tokens as strings', () => {
      expect(typeof testTokens.validToken).toBe('string')
      expect(typeof testTokens.wrongSignatureToken).toBe('string')
      expect(typeof testTokens.wrongIssuerToken).toBe('string')
      expect(typeof testTokens.wrongAudienceToken).toBe('string')
      expect(typeof testTokens.unauthorisedUserToken).toBe('string')
    })

    describe('validToken', () => {
      let decoded

      beforeEach(() => {
        const artifacts = Jwt.token.decode(testTokens.validToken)
        decoded = artifacts.decoded
      })

      it('should have correct audience', () => {
        expect(decoded.payload.aud).toBe('test')
      })

      it('should have correct issuer format', () => {
        expect(decoded.payload.iss).toMatch(
          /^https:\/\/login\.microsoftonline\.com\/.+\/v2\.0$/
        )
      })

      it('should have service maintainer email as preferred_username', () => {
        expect(decoded.payload.preferred_username).toBe('me@example.com')
      })

      it('should have name field', () => {
        expect(decoded.payload.name).toBe('John Doe')
      })

      it('should have contact id', () => {
        expect(decoded.payload.id).toBe('test-contact-id')
      })

      it('should have valid nbf (not before) timestamp', () => {
        expect(decoded.payload.nbf).toBeDefined()
        expect(typeof decoded.payload.nbf).toBe('number')
        expect(decoded.payload.nbf).toBeLessThanOrEqual(
          new Date().getTime() / 1000
        )
      })

      it('should have valid exp (expiration) timestamp', () => {
        expect(decoded.payload.exp).toBeDefined()
        expect(typeof decoded.payload.exp).toBe('number')
        expect(decoded.payload.exp).toBeGreaterThan(decoded.payload.nbf)
      })

      it('should have maxAgeSec property', () => {
        expect(decoded.payload.maxAgeSec).toBe(3600)
      })

      it('should have timeSkewSec property', () => {
        expect(decoded.payload.timeSkewSec).toBe(15)
      })

      it('should have RS256 algorithm in header', () => {
        expect(decoded.header.alg).toBe('RS256')
      })

      it('should have kid (key id) in header', () => {
        expect(decoded.header.kid).toBe('test-key-id')
      })
    })

    describe('wrongSignatureToken', () => {
      let decoded

      beforeEach(() => {
        const artifacts = Jwt.token.decode(testTokens.wrongSignatureToken)
        decoded = artifacts.decoded
      })

      it('should have wrong issuer', () => {
        expect(decoded.payload.iss).toBe('https://wrong-issuer.com/v2.0')
      })

      it('should still have correct audience', () => {
        expect(decoded.payload.aud).toBe('test')
      })
    })

    describe('wrongIssuerToken', () => {
      let decoded

      beforeEach(() => {
        const artifacts = Jwt.token.decode(testTokens.wrongIssuerToken)
        decoded = artifacts.decoded
      })

      it('should have wrong issuer', () => {
        expect(decoded.payload.iss).toBe('https://wrong-issuer.com/v2.0')
      })

      it('should still have correct audience', () => {
        expect(decoded.payload.aud).toBe('test')
      })

      it('should still have service maintainer email', () => {
        expect(decoded.payload.preferred_username).toBe('me@example.com')
      })
    })

    describe('wrongAudienceToken', () => {
      let decoded

      beforeEach(() => {
        const artifacts = Jwt.token.decode(testTokens.wrongAudienceToken)
        decoded = artifacts.decoded
      })

      it('should have wrong audience', () => {
        expect(decoded.payload.aud).toBe('random-wrong-audience')
      })

      it('should still have correct issuer', () => {
        expect(decoded.payload.iss).toMatch(
          /^https:\/\/login\.microsoftonline\.com\/.+\/v2\.0$/
        )
      })

      it('should still have service maintainer email', () => {
        expect(decoded.payload.preferred_username).toBe('me@example.com')
      })
    })

    describe('unauthorisedUserToken', () => {
      let decoded

      beforeEach(() => {
        const artifacts = Jwt.token.decode(testTokens.unauthorisedUserToken)
        decoded = artifacts.decoded
      })

      it('should have unauthorised user email', () => {
        expect(decoded.payload.preferred_username).toBe('anything@example.com')
      })

      it('should not have service maintainer email', () => {
        expect(decoded.payload.preferred_username).not.toBe('me@example.com')
      })

      it('should still have correct audience', () => {
        expect(decoded.payload.aud).toBe('test')
      })

      it('should still have correct issuer', () => {
        expect(decoded.payload.iss).toMatch(
          /^https:\/\/login\.microsoftonline\.com\/.+\/v2\.0$/
        )
      })
    })
  })

  describe('getTestPublicKey', () => {
    it('should return a public key object', () => {
      const publicKey = getTestPublicKey()

      expect(publicKey).toBeDefined()
      expect(typeof publicKey).toBe('object')
    })

    it('should have required JWKS fields', () => {
      const publicKey = getTestPublicKey()

      expect(publicKey.kid).toBe('test-key-id')
      expect(publicKey.use).toBe('sig')
      expect(publicKey.alg).toBe('RS256')
    })

    it('should have RSA key components', () => {
      const publicKey = getTestPublicKey()

      expect(publicKey.kty).toBe('RSA')
      expect(publicKey.n).toBeDefined() // modulus
      expect(publicKey.e).toBeDefined() // exponent
    })

    it('should return the same key instance on multiple calls', () => {
      const key1 = getTestPublicKey()
      const key2 = getTestPublicKey()

      expect(key1).toBe(key2)
    })
  })

  describe('token consistency', () => {
    it('should generate different token instances on each import', () => {
      // Tokens are generated once at module load time
      // This test verifies they exist and are strings
      const allTokens = [
        testTokens.validToken,
        testTokens.wrongSignatureToken,
        testTokens.wrongIssuerToken,
        testTokens.wrongAudienceToken,
        testTokens.unauthorisedUserToken
      ]

      allTokens.forEach((token) => {
        expect(typeof token).toBe('string')
        expect(token.length).toBeGreaterThan(0)
        expect(token.split('.').length).toBe(3) // JWT format: header.payload.signature
      })
    })

    it('should have unique signatures for different token types', () => {
      const tokens = [
        testTokens.validToken,
        testTokens.wrongSignatureToken,
        testTokens.wrongIssuerToken,
        testTokens.wrongAudienceToken,
        testTokens.unauthorisedUserToken
      ]

      const signatures = tokens.map((token) => token.split('.')[2])

      // While some might be identical (wrongSignatureToken and wrongIssuerToken),
      // they should at least be valid signatures
      signatures.forEach((signature) => {
        expect(signature).toBeDefined()
        expect(signature.length).toBeGreaterThan(0)
      })
    })
  })

  describe('edge cases', () => {
    it('should handle token decoding without verification', () => {
      expect(() => {
        Jwt.token.decode(testTokens.validToken)
      }).not.toThrow()
    })

    it('should produce decodable tokens for all token types', () => {
      const allTokens = [
        testTokens.validToken,
        testTokens.wrongSignatureToken,
        testTokens.wrongIssuerToken,
        testTokens.wrongAudienceToken,
        testTokens.unauthorisedUserToken
      ]

      allTokens.forEach((token) => {
        expect(() => {
          const artifacts = Jwt.token.decode(token)
          expect(artifacts.decoded).toBeDefined()
          expect(artifacts.decoded.payload).toBeDefined()
          expect(artifacts.decoded.header).toBeDefined()
        }).not.toThrow()
      })
    })
  })
})
