import { http, HttpResponse } from 'msw'
import { setupMsw } from '#vite/setup-msw.js'

describe('setupMsw', () => {
  const url = 'http://epr-backend.test/canary'
  const server = setupMsw(
    http.get(url, () => new HttpResponse(null, { status: 204 }))
  )

  it('should answer a request from the handlers it was given', async () => {
    const response = await fetch(url)

    expect(response.status).toBe(204)
  })

  it('should answer a request from a handler added in the test', async () => {
    server.use(http.get(url, () => new HttpResponse(null, { status: 202 })))

    const response = await fetch(url)

    expect(response.status).toBe(202)
  })

  it('should drop handlers added in a previous test', async () => {
    const response = await fetch(url)

    expect(response.status).toBe(204)
  })

  it.fails(
    'should fail a test whose request has no msw handler, even when the rejection is handled',
    async () => {
      await expect(fetch('http://epr-backend.test/no-handler')).rejects.toThrow(
        'fetch failed'
      )
    }
  )
})
