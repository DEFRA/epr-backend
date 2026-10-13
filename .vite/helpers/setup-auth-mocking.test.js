import { http, HttpResponse } from 'msw'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

describe('setupAuthContext', () => {
  const { getServer } = setupAuthContext()
  const url = 'http://epr-backend.test/canary'

  it('should pass a test whose request has an msw handler', async () => {
    getServer().use(
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
