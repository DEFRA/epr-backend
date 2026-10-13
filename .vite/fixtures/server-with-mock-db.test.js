import { http, HttpResponse } from 'msw'
import { it } from '#vite/fixtures/server-with-mock-db.js'

describe('server with mock db fixture', () => {
  const url = 'http://epr-backend.test/canary'

  it('should pass a test whose request has an msw handler', async ({
    mockOidcServer
  }) => {
    mockOidcServer.use(
      http.get(url, () => new HttpResponse(null, { status: 204 }))
    )

    const response = await fetch(url)

    expect(response.status).toBe(204)
  })

  it.fails(
    'should fail a test whose request has no msw handler, even when the rejection is handled',
    async () => {
      await expect(fetch(url)).rejects.toThrow('fetch failed')
    }
  )
})
