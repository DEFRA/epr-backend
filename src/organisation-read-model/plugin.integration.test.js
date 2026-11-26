import { randomUUID } from 'node:crypto'
import { ObjectId } from 'mongodb'
import { http, HttpResponse } from 'msw'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { setup as setupMongo, teardown as teardownMongo } from 'vitest-mongodb'

import { toYear } from '#common/helpers/dates/year.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { toStoredOrganisation } from '#repositories/organisations/helpers.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import {
  REPROCESSOR_NUMBER,
  findOrganisation,
  reprocessor
} from './repository/contract/organisation-read-test-helpers.js'
import { buildExternalAccreditation } from './repository/contract/test-data.js'

/** @import { ServerApp, StartedServer } from '#common/hapi-types.js' */
/** @import { Organisation as StoredOrganisation } from '#domain/organisations/model.js' */

vi.mock(
  '#adapters/sqs-command-executor/sqs-command-executor.plugin.js',
  async () => import('#adapters/sqs-command-executor/mock.plugin.js')
)
vi.mock(
  '#plugins/dlq-admin.js',
  async () => import('#plugins/dlq-admin.mock.plugin.js')
)

const REG_ACCRED_BASE_URL = 'https://reg-accred.test'
const REG_ACCRED_ACCREDITATION_NUMBER = 'A27ER5000560001AL'

const { buildOrganisation } = createOrganisationBuilders()

/**
 * @param {StartedServer} server
 * @param {StoredOrganisation} stored
 */
const insertOrganisation = async (server, stored) => {
  const { id, ...document } = toStoredOrganisation(stored)
  await server.db
    .collection('epr-organisations')
    .insertOne({ _id: ObjectId.createFromHexString(id), ...document })
}

describe('the production server with Reg Accred external accreditations on', () => {
  const { getServer } = setupAuthContext()

  /** @type {StartedServer} */
  let server

  beforeAll(async () => {
    await setupMongo({ serverOptions: {} })
    vi.stubEnv('MONGO_URI', globalThis.__MONGO_URI__)
    vi.stubEnv('MONGO_DATABASE', `epr-backend-test-${randomUUID()}`)
    vi.stubEnv('FEATURE_FLAG_REG_ACCRED_EXTERNAL_ACCREDITATIONS', 'true')
    vi.stubEnv('REG_ACCRED_API_BASE_URL', REG_ACCRED_BASE_URL)
    vi.stubEnv('REG_ACCRED_API_SHARED_SECRET', 'secret')

    const { createServer } = await import('#server/server.js')
    server = /** @type {StartedServer} */ (
      /** @type {unknown} */ (await createServer())
    )
    await server.initialize()
  })

  afterAll(async () => {
    await server.db.dropDatabase()
    await server.stop()
    await teardownMongo()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('reads the 2027 accreditation from Reg Accred', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-03-10') })
    /** @type {URL[]} */
    const requested = []
    getServer().use(
      http.get(`${REG_ACCRED_BASE_URL}/v1/accreditations`, ({ request }) => {
        const url = new URL(request.url)
        requested.push(url)
        return HttpResponse.json({
          pageNumber: 1,
          limit: 20,
          totalItems: 1,
          items: [
            {
              organisationNumber: Number(
                url.searchParams.get('organisationNumber')
              ),
              registrationNumber: REPROCESSOR_NUMBER,
              accreditationNumber: REG_ACCRED_ACCREDITATION_NUMBER,
              accreditationYear: 2027,
              material: 'Paper',
              wasteProcessingType: 'reprocessor',
              status: 'approved',
              tonnageBand: 'up_to_500'
            }
          ]
        })
      })
    )
    const stored = buildOrganisation({ registrations: [reprocessor()] })
    await insertOrganisation(server, /** @type {StoredOrganisation} */ (stored))

    const organisation = await findOrganisation(
      /** @type {ServerApp} */ (server.app).organisationReadRepository,
      stored.organisationNumber
    )

    expect(
      organisation.registrations[REPROCESSOR_NUMBER]?.accreditations[
        toYear(2027)
      ]?.accreditationNumber
    ).toBe(REG_ACCRED_ACCREDITATION_NUMBER)
    expect(requested).toHaveLength(1)
  })
})

describe('the production server with dev endpoints on', () => {
  setupAuthContext()

  /** @type {StartedServer} */
  let server

  beforeAll(async () => {
    await setupMongo({ serverOptions: {} })
    vi.stubEnv('MONGO_URI', globalThis.__MONGO_URI__)
    vi.stubEnv('MONGO_DATABASE', `epr-backend-test-${randomUUID()}`)
    vi.stubEnv('FEATURE_FLAG_DEV_ENDPOINTS', 'true')

    const { createServer } = await import('#server/server.js')
    server = /** @type {StartedServer} */ (
      /** @type {unknown} */ (await createServer())
    )
    await server.initialize()
  })

  afterAll(async () => {
    await server.db.dropDatabase()
    await server.stop()
    await teardownMongo()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('serves the 2027 accreditation stored through the dev route', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-03-10') })
    const stored = buildOrganisation({ registrations: [reprocessor()] })
    await insertOrganisation(server, /** @type {StoredOrganisation} */ (stored))
    const {
      registrationNumber: _registrationNumber,
      year,
      status: { current: _current, ...status },
      ...fields
    } = buildExternalAccreditation({
      organisationNumber: stored.organisationNumber
    })

    const response = await server.inject({
      method: 'PUT',
      url: `/v1/dev/external-accreditations/${REPROCESSOR_NUMBER}/${year}`,
      payload: { ...fields, status }
    })

    expect(response.statusCode).toBe(200)
    const organisation = await findOrganisation(
      /** @type {ServerApp} */ (server.app).organisationReadRepository,
      stored.organisationNumber
    )
    expect(
      organisation.registrations[REPROCESSOR_NUMBER]?.accreditations[
        toYear(2027)
      ]?.accreditationNumber
    ).toBe(fields.accreditationNumber)
  })
})
