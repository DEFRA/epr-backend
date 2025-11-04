export function extractJwtOptions({ jwks_uri: jwksUri, issuer }) {
  return {
    keys: {
      uri: jwksUri
    },
    verify: {
      aud: false, // aud doesn't appear to be supported by cdp-defra-id-stub and is not used on the FE via @hapi/bell
      iss: issuer,
      sub: false,
      nbf: false,
      exp: true,
      maxAgeSec: 3600, // 60 minutes
      timeSkewSec: 15
    },
    validate: async (artifacts, request) => {
      const tokenPayload = artifacts.decoded.payload

      console.log('DEBUG: tokenPayload', tokenPayload)

      const credentials = {
        id: tokenPayload.contactId,
        email: tokenPayload.email,
        issuer: tokenPayload.iss,
        scope: await getScope(tokenPayload.email, tokenPayload, request)
      }

      // @todo: should we consider returning isValid: false in some situations?
      return { isValid: true, credentials }
    }
  }
}
