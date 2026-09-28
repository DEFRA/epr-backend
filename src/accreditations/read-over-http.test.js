import { http, passthrough } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { createHttpAccreditationsSource } from './adapters/http.js'
import { withAccreditationsFrom } from './application/with-accreditations-from.js'
import { buildAccreditedOrganisation } from './routes/test-helpers.js'

/** @import { TestServer } from '#test/create-test-server.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */

/** @param {TestServer} server */
const uriOf = (server) =>
  /** @type {import('@hapi/hapi').Server} */ (/** @type {unknown} */ (server))
    .info.uri

const credentials = { username: 'reg-accred', password: 'changeme' }

/**
 * The fields the contract carries, which must survive the round trip
 * unchanged.
 *
 * @param {Record<string, any>} accreditation
 */
const contractFields = (accreditation) => ({
  id: accreditation.id,
  status: accreditation.status,
  accreditationNumber: accreditation.accreditationNumber,
  validFrom: accreditation.validFrom,
  validTo: accreditation.validTo,
  tonnageBand: accreditation.prnIssuance.tonnageBand,
  signatories: accreditation.prnIssuance.signatories.map(
    (
      /** @type {Record<string, any>} */ { fullName, email, phone, jobTitle }
    ) => ({
      fullName,
      email,
      phone,
      jobTitle
    })
  ),
  statusHistory: accreditation.statusHistory.map(
    (/** @type {{ status: string, updatedAt: Date | string }} */ entry) => ({
      status: entry.status,
      updatedAt: new Date(entry.updatedAt).toISOString()
    })
  ),
  material: accreditation.material,
  wasteProcessingType: accreditation.wasteProcessingType
})

describe('reading accreditations over HTTP', () => {
  const { getServer } = setupAuthContext()

  /** @type {TestServer} */
  let server
  /** @type {OrganisationsRepository} */
  let local
  /** @type {OrganisationsRepository} */
  let overHttp

  const accredited = buildAccreditedOrganisation()
  const other = buildAccreditedOrganisation({ accreditationNumber: 'OTHER-1' })

  beforeEach(async () => {
    local = createInMemoryOrganisationsRepository(
      /** @type {any} */ ([accredited.organisation, other.organisation])
    )()
    server = await createTestServer({
      config: { port: 0, basicAuth: credentials },
      repositories: { organisationsRepository: local }
    })
    await server.start()
    // Let the adapter's requests through to the running server
    getServer().use(http.all(`${uriOf(server)}/*`, () => passthrough()))

    overHttp = withAccreditationsFrom(
      local,
      createHttpAccreditationsSource({
        baseUrl: uriOf(server),
        ...credentials
      })
    )
  })

  afterEach(async () => {
    await server.stop()
  })

  it('passes the incoming request’s trace id on to the accreditation endpoints', async () => {
    /** @type {Array<string | null>} */
    const traceIdsSent = []
    getServer().use(
      http.all(`${uriOf(server)}/v1/accreditations`, ({ request }) => {
        traceIdsSent.push(request.headers.get('x-cdp-request-id'))
        return passthrough()
      })
    )
    server.route({
      method: 'GET',
      path: '/test/read-organisation',
      options: { auth: false },
      handler: async () => {
        await overHttp.findById(accredited.organisation.id)
        return 'ok'
      }
    })

    await server.inject({
      method: 'GET',
      url: '/test/read-organisation',
      headers: { 'x-cdp-request-id': 'trace-abc-123' }
    })

    expect(traceIdsSent).toStrictEqual(['trace-abc-123'])
  })

  it('gives an organisation the accreditations it holds, fetched over HTTP', async () => {
    const stored = await local.findById(accredited.organisation.id)

    const read = await overHttp.findById(accredited.organisation.id)

    expect(read.accreditations.map(contractFields)).toStrictEqual(
      stored.accreditations
        .filter((a) => a.id === accredited.accreditation.id)
        .map(contractFields)
    )
  })

  it('links each registration to the accreditation fetched for it', async () => {
    const registration = await overHttp.findRegistrationById(
      accredited.organisation.id,
      accredited.registration.id
    )

    expect(registration.accreditationId).toBe(accredited.accreditation.id)
    expect(registration.accreditation?.accreditationNumber).toBe(
      'A26SR5120384065PA'
    )
  })

  it('gives every organisation its own accreditations from findAll', async () => {
    const organisations = await overHttp.findAll()

    expect(
      organisations.map((organisation) => ({
        id: organisation.id,
        numbers: organisation.accreditations.map((a) => a.accreditationNumber)
      }))
    ).toStrictEqual(
      expect.arrayContaining([
        { id: accredited.organisation.id, numbers: ['A26SR5120384065PA'] },
        { id: other.organisation.id, numbers: ['OTHER-1'] }
      ])
    )
  })

  it('fails loudly when the endpoints refuse the credentials', async () => {
    const refused = withAccreditationsFrom(
      local,
      createHttpAccreditationsSource({
        baseUrl: uriOf(server),
        username: 'reg-accred',
        password: 'wrong'
      })
    )

    await expect(refused.findById(accredited.organisation.id)).rejects.toThrow(
      /401/
    )
  })
})
