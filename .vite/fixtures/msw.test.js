import { http, HttpResponse } from 'msw'
import { it } from '#vite/fixtures/msw.js'
import { cognitoJwksUrl } from '#vite/helpers/mock-cognito-jwks.js'

describe('msw fixture', () => {
  const url = 'http://epr-backend.test/canary'

  it('should answer auth requests by default', async () => {
    const response = await fetch(cognitoJwksUrl)

    expect(response.status).toBe(200)
  })

  it('should answer a request from a handler added in the test', async ({
    msw
  }) => {
    msw.use(http.get(url, () => new HttpResponse(null, { status: 204 })))

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
