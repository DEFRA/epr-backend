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
      const mergedCa = [
        ...(Array.isArray(options.ca)
          ? options.ca
          : options.ca
            ? [options.ca]
            : []),
        ...defaultCAs,
        ...customCaCerts
      ]

      const newOptions = { ...options, ca: mergedCa }
      return originalTlsCreateSecureContext(newOptions)
    }

    isPatched = true
  }
}
