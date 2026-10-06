import { StatusCodes } from 'http-status-codes'

import {
  buildLinkedDefraOrg,
  buildOrganisation
} from '#repositories/organisations/contract/test-data.js'
import { asOperator, asUnscopedAdminUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { testRegulatorCanRead } from '#vite/helpers/test-invalid-roles-scenarios.js'
import {
  EXPORTER_NUMBER,
  REPROCESSOR_NUMBER,
  body,
  buildAccreditedOrganisation,
  exporterResponse,
  reprocessorResponse,
  useViewServer
} from './organisation-view-test-helpers.js'

describe('GET /organisations/{organisationNumber}', () => {
  setupAuthContext()

  const { server, serve, serveStored, get } = useViewServer()

  it('serves the organisation without the fields that are not served', async () => {
    const linked = buildLinkedDefraOrg('defra-org-1', 'Defra Org')
    const organisation = buildAccreditedOrganisation({
      linkedDefraOrganisation: linked
    })
    await serve(organisation)

    const response = await get(`/organisations/${organisation.orgId}`)

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(body(response)).toEqual({
      organisationNumber: organisation.orgId,
      name: 'ACME ltd',
      tradingName: 'ACME ltd',
      status: 'created',
      submittedToRegulator: { code: 'ea' },
      linkedDefraOrganisation: {
        defraOrganisation: { id: 'defra-org-1', name: 'Defra Org' },
        linkedAt: linked.linkedAt,
        linkedBy: { email: 'linker@example.com' }
      },
      registrations: {
        [REPROCESSOR_NUMBER]: reprocessorResponse,
        [EXPORTER_NUMBER]: exporterResponse
      }
    })
  })

  it('serves an organisation as the repository stores it', async () => {
    const linked = buildLinkedDefraOrg(crypto.randomUUID(), 'Defra Org')
    const organisation = buildOrganisation({
      linkedDefraOrganisation: linked
    })
    await serveStored(organisation)

    const response = await get(`/organisations/${organisation.orgId}`)

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(body(response).linkedDefraOrganisation.linkedAt).toBe(
      linked.linkedAt
    )
  })

  it('returns 404 for an unknown organisation number', async () => {
    await serve(buildOrganisation({ orgId: 500001 }))

    const response = await get('/organisations/500002')

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('rejects an organisation number that is not a number', async () => {
    await serve(buildOrganisation())

    const response = await get('/organisations/not-a-number')

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  describe('authorisation', () => {
    const organisation = buildAccreditedOrganisation()
    const request = async () => {
      await serve(organisation)
      return { method: 'GET', url: `/organisations/${organisation.orgId}` }
    }

    it('shows an operator their own organisation', async () => {
      const { url } = await request()

      const response = await get(url, asOperator())

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('refuses a caller who holds no organisation read', async () => {
      const { url } = await request()

      const response = await get(url, asUnscopedAdminUser())

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    testRegulatorCanRead({ server, makeRequest: request })
  })
})
