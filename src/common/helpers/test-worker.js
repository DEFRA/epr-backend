import tls from 'node:tls'
import { patchTlsSecureContext } from './secure-context.js'

export default function testWorker() {
  const originalCreateSecureContext = tls.createSecureContext

  patchTlsSecureContext()

  const isPatched = tls.createSecureContext !== originalCreateSecureContext

  if (isPatched) {
    const context = tls.createSecureContext()
    return {
      isPatched: true,
      canCreateContext: !!context
    }
  }

  return {
    isPatched: false,
    canCreateContext: false
  }
}
