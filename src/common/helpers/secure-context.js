import tls from 'node:tls'
import { getTrustStoreCerts } from '@defra/hapi-secure-context/src/get-trust-store-certs.js'

let isPatched = false

/**
 * Patches Node.js TLS to trust custom CA certificates from TRUSTSTORE_* environment variables.
 *
 * This must be called before any TLS connections are established in worker threads, as they
 * run in separate JavaScript contexts and don't inherit global patches from the main process.
 *
 * Testing: This cannot be meaningfully tested in unit/integration tests as it requires real
 * TLS certificate validation against custom certificate authorities. It is validated via
 * deployment smoke tests in environments with custom CAs.
 */
export const patchTlsSecureContext = () => {
  if (isPatched) {
    return
  }

  const customCaCertsObj = getTrustStoreCerts(process.env)
  const customCaCerts = Object.values(customCaCertsObj)

  if (customCaCerts.length === 0) {
    return
  }

  const originalTlsCreateSecureContext = tls.createSecureContext
  const defaultCAs = tls.rootCertificates

  tls.createSecureContext = function (options = {}) {
    let existingCa = []
    if (Array.isArray(options.ca)) {
      existingCa = options.ca
    } else {
      if (options.ca) {
        existingCa = [options.ca]
      } else {
        existingCa = []
      }
    }

    const mergedCa = [...existingCa, ...defaultCAs, ...customCaCerts]

    const newOptions = { ...options, ca: mergedCa }
    return originalTlsCreateSecureContext(newOptions)
  }

  isPatched = true
}
