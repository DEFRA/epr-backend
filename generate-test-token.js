import Jwt from '@hapi/jwt'
import { generateKeyPairSync } from 'node:crypto'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  options: {
    'client-id': {
      type: 'string',
      default: '3c8h0trqsqhlfrp91u8uv6a80'
    },
    expired: { type: 'boolean', default: false },
    exp: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false }
  }
})

if (values.help) {
  console.log(`Generate a self-signed Cognito-style JWT for local testing.

Usage: node generate-test-token.js [options]

Options:
  --client-id <id>      Set client_id claim (default: 3c8h0trqsqhlfrp91u8uv6a80)
  --expired             Generate an already-expired token
  --exp <timestamp>     Set exp to a specific Unix timestamp
  -h, --help            Show this help

Examples:
  node generate-test-token.js                          # valid token
  node generate-test-token.js --expired                # expired token
  node generate-test-token.js --client-id wrong-id     # mismatched client_id
  node generate-test-token.js --exp 1770834143         # specific expiry`)
  // eslint-disable-next-line n/no-process-exit
  process.exit(0)
}

// @ts-ignore - @types/node is missing generateKeyPairSync overloads for jwk format
const keyPair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'jwk' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
})

const nowInSeconds = () => Math.floor(Date.now() / 1000)
const ONE_HOUR = 3600

const clientId = values['client-id']
const exp = values.expired
  ? nowInSeconds() - ONE_HOUR
  : values.exp
    ? Number(values.exp)
    : nowInSeconds() + ONE_HOUR

const claims = {
  sub: clientId,
  token_use: 'access',
  scope: 'epr-backend-resource-srv/access',
  auth_time: nowInSeconds(),
  iss: 'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_ZJcyFKABL',
  exp,
  iat: nowInSeconds(),
  version: 2,
  jti: 'c9b96385-fb6b-4963-abeb-8519c9872116',
  client_id: clientId
}

const token = Jwt.token.generate(
  claims,
  { key: keyPair.privateKey, algorithm: 'RS256' },
  { header: { kid: 'znEjC2Od1h+UyNmDRFIP0xsBojw9C9r/eA/qOViAwnc=' } }
)

console.log(token)
