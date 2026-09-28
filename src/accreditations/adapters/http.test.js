import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createHttpAccreditationsSource } from './http.js'

const baseUrl = 'http://accreditations.test'

const source = createHttpAccreditationsSource({
  baseUrl,
  username: 'reg-accred',
  password: 'changeme'
})

/** @param {string} id */
const record = (id) => ({ id, registrationId: `reg-${id}` })

describe('createHttpAccreditationsSource', () => {
  const { getServer } = setupAuthContext()

  describe('findForRegistration', () => {
    it('returns the accreditation, sending basic auth', async () => {
      /** @type {string | null} */
      let authorization = null
      getServer().use(
        http.get(
          `${baseUrl}/v1/registrations/reg-1/accreditations/2026`,
          ({ request }) => {
            authorization = request.headers.get('authorization')
            return HttpResponse.json(record('1'))
          }
        )
      )

      const found = await source.findForRegistration({
        registrationId: 'reg-1',
        year: 2026
      })

      expect(found).toStrictEqual(record('1'))
      expect(authorization).toBe(
        `Basic ${Buffer.from('reg-accred:changeme').toString('base64')}`
      )
    })

    it('returns null when the registration holds none', async () => {
      getServer().use(
        http.get(
          `${baseUrl}/v1/registrations/reg-1/accreditations/2027`,
          () => new HttpResponse(null, { status: 404 })
        )
      )

      expect(
        await source.findForRegistration({
          registrationId: 'reg-1',
          year: 2027
        })
      ).toBeNull()
    })

    it('throws on any other failure', async () => {
      getServer().use(
        http.get(
          `${baseUrl}/v1/registrations/reg-1/accreditations/2026`,
          () => new HttpResponse(null, { status: 500 })
        )
      )

      await expect(
        source.findForRegistration({ registrationId: 'reg-1', year: 2026 })
      ).rejects.toMatchObject({ output: { statusCode: 500 } })
    })
  })

  describe('list', () => {
    it('returns every accreditation held for the year', async () => {
      /** @type {string | null} */
      let year = null
      getServer().use(
        http.get(`${baseUrl}/v1/accreditations`, ({ request }) => {
          year = new URL(request.url).searchParams.get('year')
          return HttpResponse.json([record('1'), record('2')])
        })
      )

      const records = await source.list({ year: 2026 })

      expect(records).toStrictEqual([record('1'), record('2')])
      expect(year).toBe('2026')
    })

    it('asks for many registrations in batches of 100', async () => {
      /** @type {number[]} */
      const batchSizes = []
      getServer().use(
        http.get(`${baseUrl}/v1/accreditations`, ({ request }) => {
          const ids = new URL(request.url).searchParams.getAll('registrationId')
          batchSizes.push(ids.length)
          return HttpResponse.json(ids.map((id) => record(id)))
        })
      )
      const registrationIds = Array.from({ length: 150 }, (_, i) => `${i}`)

      const records = await source.list({ year: 2026, registrationIds })

      expect(batchSizes.sort((a, b) => a - b)).toStrictEqual([50, 100])
      expect(records).toHaveLength(150)
    })
  })
})
