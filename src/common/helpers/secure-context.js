import tls from 'node:tls'
import { getTrustStoreCerts } from '@defra/hapi-secure-context/src/get-trust-store-certs.js'

let isPatched = false

export const patchTlsSecureContext = () => {
  if (isPatched) {
    return
  }

  const customCaCertsObj = getTrustStoreCerts(process.env)
  const customCaCerts = Object.values(customCaCertsObj)

  if (customCaCerts.length > 0) {
    const originalTlsCreateSecureContext = tls.createSecureContext
    const defaultCAs = tls.rootCertificates

    tls.createSecureContext = function (options = {}) {
      let existingCa = []
      if (Array.isArray(options.ca)) {
        existingCa = options.ca
      } else if (options.ca) {
        existingCa = [options.ca]
      }

      const mergedCa = [...existingCa, ...defaultCAs, ...customCaCerts]

      const newOptions = { ...options, ca: mergedCa }
      return originalTlsCreateSecureContext(newOptions)
    }

    isPatched = true
  }
}
