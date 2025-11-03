import { StatusCodes } from 'http-status-codes'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import Boom from '@hapi/boom'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { ObjectId } from 'mongodb'

describe('PUT /v1/organisations/{id}', () => {
  let server
  let organisationsRepositoryFactory
  let organisationsRepository

  beforeEach(async () => {
    organisationsRepositoryFactory = createInMemoryOrganisationsRepository([])
    organisationsRepository = organisationsRepositoryFactory()
    const featureFlags = createInMemoryFeatureFlags({ organisations: true })

    server = await createTestServer({
      repositories: { organisationsRepository: organisationsRepositoryFactory },
      featureFlags
    })
  })

  describe('happy path', () => {
    it('returns 200 and the updated organisation when the org Id exists, the version is correct and the fragment is valid', async () => {
      const org = buildOrganisation()

      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}`,
        payload: {
          version: org.version,
          updateFragment: { ...org, wasteProcessingTypes: ['reprocessor'] }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const body = JSON.parse(response.payload)
      // returned organisation should have the same id and an incremented version
      expect(body.id).toBe(org.id)
      expect(body.version).toBe(org.version + 1)
      expect(body.wasteProcessingTypes).toEqual(['reprocessor'])
    })

    it('includes Cache-Control header in successful response', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}`,
        payload: {
          version: org.version,
          updateFragment: { wasteProcessingTypes: org.wasteProcessingTypes }
        }
      })

      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    })
  })

  describe('not found cases', () => {
    it('returns 404 when update succeeds but repository does not return the updated organisation', async () => {
      const org = buildOrganisation()

      // repository factory that simulates successful update but findById returns null
      const brokenRepoFactory = () => ({
        async insert() {},
        async update() {},
        async findAll() {
          return []
        },
        async findById() {
          // simulate repository throwing not-found error
          throw Boom.notFound('Organisation not found')
        },
        async findRegistrationById() {
          return null
        }
      })

      const featureFlags = createInMemoryFeatureFlags({ organisations: true })

      const serverWithBrokenRepo = await createTestServer({
        repositories: { organisationsRepository: brokenRepoFactory },
        featureFlags
      })

      const response = await serverWithBrokenRepo.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}`,
        payload: {
          version: org.version,
          updateFragment: { ...org, wasteProcessingTypes: ['reprocessor'] }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      const body = JSON.parse(response.payload)
      expect(body.message).toMatch(/Organisation not found/)
    })

    describe('when the orgId does not exist', async () => {
      let response
      beforeEach(async () => {
        const org = buildOrganisation()
        const nonExistentId = new ObjectId().toString()

        await organisationsRepository.insert(org)

        response = await server.inject({
          method: 'PUT',
          url: `/v1/organisations/${nonExistentId}`,
          payload: {
            version: org.version,
            updateFragment: { ...org, wasteProcessingTypes: ['reprocessor'] }
          }
        })
      })

      it('returns 404 ', async () => {
        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('includes Cache-Control header in error response', async () => {
        expect(response.headers['cache-control']).toBe(
          'no-cache, no-store, must-revalidate'
        )
      })
    })

    it('returns 404 when orgId is missing (whitespace-only path segment)', async () => {
      const org = buildOrganisation()

      const response = await server.inject({
        method: 'PUT',
        url: '/v1/organisations/%20%20%20',
        payload: {
          version: org.version,
          updateFragment: { ...org, wasteProcessingTypes: ['reprocessor'] }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('invalid payload', () => {
    it('returns 400 when version field is missing', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}`,
        payload: {
          updateFragment: { ...org, wasteProcessingTypes: ['reprocessor'] }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const body = JSON.parse(response.payload)
      expect(body.message).toMatch(
        /Payload must include a numeric version field/
      )
    })

    it('returns 400 when version field is not a number', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}`,
        payload: {
          version: 'not-a-number',
          updateFragment: { ...org, wasteProcessingTypes: ['reprocessor'] }
        }
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const body = JSON.parse(response.payload)
      expect(body.message).toMatch(
        /Payload must include a numeric version field/
      )
    })

    it('returns 400 when updateFragment field is missing', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}`,
        payload: {
          version: org.version
        }
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const body = JSON.parse(response.payload)
      expect(body.message).toMatch(
        /Payload must include an updateFragment object/
      )
    })

    it('returns 400 when updateFragment is null', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}`,
        payload: {
          version: org.version,
          updateFragment: null
        }
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const body = JSON.parse(response.payload)
      expect(body.message).toMatch(
        /Payload must include an updateFragment object/
      )
    })

    it('returns 400 when updateFragment is not an object', async () => {
      const org = buildOrganisation()
      await organisationsRepository.insert(org)

      const response = await server.inject({
        method: 'PUT',
        url: `/v1/organisations/${org.id}`,
        payload: {
          version: org.version,
          updateFragment: 'not-an-object'
        }
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const body = JSON.parse(response.payload)
      expect(body.message).toMatch(
        /Payload must include an updateFragment object/
      )
    })
  })

  it('returns 409 when version number does not match current version', async () => {
    const org = buildOrganisation()
    await organisationsRepository.insert(org)

    const response = await server.inject({
      method: 'PUT',
      url: `/v1/organisations/${org.id}`,
      payload: {
        version: org.version + 1,
        updateFragment: { ...org, wasteProcessingTypes: ['reprocessor'] }
      }
    })

    expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(/Version conflict/)
  })

  it('it includes validation error information in the response', async () => {
    const org = buildOrganisation()
    await organisationsRepository.insert(org)

    const response = await server.inject({
      method: 'PUT',
      url: `/v1/organisations/${org.id}`,
      payload: {
        version: org.version,
        updateFragment: { ...org, wasteProcessingTypes: [] }
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(
      /At least one waste processing type is required/
    )
  })
})
