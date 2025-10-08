import { createServer } from '#server/server.js'

export async function createTestServer(options = {}) {
  const server = await createServer(options)
  await server.initialize()

  server.loggerMocks = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }

  server.ext('onRequest', (request, h) => {
    vi.spyOn(request.logger, 'info').mockImplementation(server.loggerMocks.info)
    vi.spyOn(request.logger, 'error').mockImplementation(
      server.loggerMocks.error
    )
    vi.spyOn(request.logger, 'warn').mockImplementation(server.loggerMocks.warn)
    return h.continue
  })

  return server
}
