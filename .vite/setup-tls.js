import tls from 'node:tls'
import { afterEach } from 'vitest'

// @defra/hapi-secure-context re-wraps tls.createSecureContext on every server
// registration, so the wrappers stack and each TLS context gets slower.
const originalCreateSecureContext = tls.createSecureContext

afterEach(() => {
  tls.createSecureContext = originalCreateSecureContext
})
