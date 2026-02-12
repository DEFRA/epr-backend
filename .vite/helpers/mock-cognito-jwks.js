import { http, HttpResponse } from 'msw'

import { testPublicKey } from '#packaging-recycling-notes/routes/test-helpers.js'

const cognitoJwksUrl =
  'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_test/.well-known/jwks.json'

export const cognitoJwksHandlers = [
  http.get(cognitoJwksUrl, () => {
    return HttpResponse.json({ keys: [testPublicKey] })
  })
]
