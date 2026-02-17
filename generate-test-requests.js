import Jwt from '@hapi/jwt'
import { generateKeyPairSync } from 'node:crypto'
import { writeFileSync } from 'node:fs'

// @ts-ignore - @types/node is missing generateKeyPairSync overloads for jwk format
const keyPair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'jwk' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
})

const kid = 'znEjC2Od1h+UyNmDRFIP0xsBojw9C9r/eA/qOViAwnc='
const jwtSecret = { key: keyPair.privateKey, algorithm: 'RS256' }
const generateTokenOptions = { header: { kid } }

const nowInSeconds = () => Math.floor(Date.now() / 1000)
const ONE_HOUR = 3600

const baseClaims = (clientId) => ({
  sub: clientId,
  token_use: 'access',
  scope: 'epr-backend-resource-srv/access',
  auth_time: nowInSeconds(),
  iss: 'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_ZJcyFKABL',
  exp: nowInSeconds() + ONE_HOUR,
  iat: nowInSeconds(),
  version: 2,
  jti: 'c9b96385-fb6b-4963-abeb-8519c9872116',
  client_id: clientId
})

const generate = (clientId, overrides = {}) =>
  Jwt.token.generate(
    { ...baseClaims(clientId), ...overrides },
    jwtSecret,
    generateTokenOptions
  )

const defaultClientId = '3c8h0trqsqhlfrp91u8uv6a80'

const validToken = generate(defaultClientId)
const expiredToken = generate(defaultClientId, {
  exp: nowInSeconds() - ONE_HOUR
})
const wrongClientToken = generate('wrong-id')

const output = `@baseUrl = http://localhost:3001

@validToken = ${validToken}
@expiredToken = ${expiredToken}
@wrongClientToken = ${wrongClientToken}

### List PRNs (valid token - expect 200)
GET {{baseUrl}}/v1/packaging-recycling-notes?statuses=awaiting_acceptance HTTP/1.1
Authorization: Bearer {{validToken}}

### List PRNs (expired token - expect 401)
GET {{baseUrl}}/v1/packaging-recycling-notes?statuses=awaiting_acceptance HTTP/1.1
Authorization: Bearer {{expiredToken}}

### List PRNs (wrong client_id - expect 403)
GET {{baseUrl}}/v1/packaging-recycling-notes?statuses=awaiting_acceptance HTTP/1.1
Authorization: Bearer {{wrongClientToken}}
`

writeFileSync('test-tokens.http', output)
console.log('Written test-tokens.http')
