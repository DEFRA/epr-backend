import jwt from '@hapi/jwt'
import {
  fetchDefraIdWellKnown,
  fetchEntraIdWellKnown
} from './fetch-well-known.js'

import { validateRequest as defraIdValidateRequest } from './defra-id.js'

export const auth = {
  plugin: {
    name: 'auth',
    version: '1.0.0',
    register: async (server) => {
      await server.register(jwt)

      const defraIdWellKnown = await fetchDefraIdWellKnown()
      const entraIdWellKnown = await fetchEntraIdWellKnown()

      server.auth.strategy(
        'access-token',
        'jwt',
        jwtOptions({ defra: defraIdWellKnown, entra: entraIdWellKnown })
      )
    }
  }
}

function jwtOptions({
  defra: {
    jwks_uri: defraJwksUri,
    issuer: defraIssuer,
    audience: defraAudience
  },
  entra: {
    jwks_uri: entraJwksUri,
    issuer: entraIssuer,
    audience: entraAudience
  }
}) {
  return {
    keys: [{ uri: defraJwksUri }, { uri: entraJwksUri }],
    verify: {
      aud: false,
      iss: false,
      sub: false,
      nbf: true,
      exp: true,
      maxAgeSec: 5400, // 90 minutes
      timeSkewSec: 15
    },
    validate: async (artifacts, request, h) => {
      console.log('Validate JWT token')

      const tokenPayload = artifacts.decoded.payload

      switch (tokenPayload.iss) {
        case defraIssuer: {
          console.log('Defra ID token')

          const isAudienceCorrect = tokenPayload.aud === defraAudience

          // Defra ID specific token parsing
          const credentials = {
            id: tokenPayload.contactId,
            email: tokenPayload.email,
            issuer: tokenPayload.iss,
            scope: lookupDefraUserRoles(tokenPayload, request, h)
          }

          console.log('isAudienceCorrect', isAudienceCorrect, tokenPayload.aud)
          return {
            isValid: isAudienceCorrect,
            credentials
          }
        }
        case entraIssuer: {
          console.log('Entra ID token', {
            tokenPayloadAud: tokenPayload.aud,
            entraAudience
          })

          // const isAudienceCorrect = tokenPayload.aud === entraAudience
          const isAudienceCorrect = true

          const email = tokenPayload.upn ?? tokenPayload.preferred_username

          // Entra ID specific token parsing
          const credentials = {
            id: tokenPayload.oid,
            email,
            issuer: tokenPayload.iss,
            scope: isEntraUserInServiceMaintainersAllowList(email)
              ? ['service_maintainer']
              : []
          }

          console.log('isAudienceCorrect', isAudienceCorrect, tokenPayload.aud)
          return {
            isValid: isAudienceCorrect,
            credentials
          }
        }
        default: {
          console.log(`Unknown token issuer: ${tokenPayload.iss}`)
          return { isValid: false }
        }
      }
    }
  }
}

function isEntraUserInServiceMaintainersAllowList(emailAddress) {
  // TODO look for emailAddress in configured list of service maintainers
  return true
}

// illustrative - real lookup would be based on ???
async function lookupDefraUserRoles(tokenPayload, request, h) {
  const { scope, response } = await defraIdValidateRequest(
    tokenPayload,
    request,
    h
  )

  const isValid = !!scope?.length

  const credentials = isValid
    ? {
        id: tokenPayload.contactId,
        email: tokenPayload.email,
        issuer: tokenPayload.iss,
        scope
      }
    : undefined

  return response
    ? {
        response
      }
    : {
        isValid,
        credentials
      }
}
