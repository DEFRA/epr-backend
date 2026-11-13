import { StatusCodes } from 'http-status-codes'

import { toYear } from '#common/helpers/dates/year.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import {
  buildReadAccreditation,
  buildReadOrganisation,
  buildReadReprocessorRegistration
} from '#organisation-read-model/repository/read-model-test-data.js'
import { config } from '#root/config.js'
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

/** @import { Organisation } from '#organisation-read-model/domain/model.js' */

describe('GET /organisations/{organisationNumber}', () => {
  setupAuthContext()

  const { server, serve, get } = useViewServer()

  afterEach(() => {
    vi.useRealTimers()
  })

  /** @param {Organisation} organisation */
  const urlOf = (organisation) =>
    `/organisations/${organisation.organisationNumber}`

  it('serves the organisation without the fields that are not served', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-01') })
    const organisation = buildAccreditedOrganisation({
      companiesHouseNumber: 'AC012345',
      registeredAddress: {
        line1: 'Palace of Westminster',
        town: 'London',
        postcode: 'SW1A 0AA'
      },
      linkedDefraOrganisation: {
        defraOrganisation: { id: 'defra-org-1', name: 'Defra Org' },
        linkedAt: '2026-03-01T09:00:00.000Z',
        linkedBy: { email: 'linker@example.com', id: 'linker-id' }
      },
      users: [
        { email: 'user@example.com', fullName: 'A User', roles: ['standard'] }
      ]
    })
    await serve(organisation)

    const response = await get(urlOf(organisation))

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(body(response)).toEqual({
      organisationNumber: organisation.organisationNumber,
      name: 'ACME ltd',
      displayName: 'ACME ltd',
      status: { current: 'approved' },
      submittedToRegulator: { code: 'ea' },
      linkedDefraOrganisation: {
        defraOrganisation: { id: 'defra-org-1', name: 'Defra Org' },
        linkedAt: '2026-03-01T09:00:00.000Z',
        linkedBy: { email: 'linker@example.com' }
      },
      registrations: {
        [REPROCESSOR_NUMBER]: reprocessorResponse,
        [EXPORTER_NUMBER]: exporterResponse
      }
    })
  })

  describe('display name', () => {
    /** @param {{ name: string, tradingName?: string }} names */
    const displayNameFor = async (names) => {
      const organisation = buildReadOrganisation(names)
      await serve(organisation)
      return body(await get(urlOf(organisation)))
    }

    it('is the trading name when the organisation has one', async () => {
      expect(
        await displayNameFor({
          name: 'Kirkby Plastics Ltd',
          tradingName: 'Kirkby Recycling'
        })
      ).toMatchObject({
        name: 'Kirkby Plastics Ltd',
        displayName: 'Kirkby Recycling'
      })
    })

    it('is the company name when there is no trading name', async () => {
      expect(
        await displayNameFor({ name: 'Kirkby Plastics Ltd' })
      ).toMatchObject({ displayName: 'Kirkby Plastics Ltd' })
    })

    it('is the company name when the trading name is blank', async () => {
      expect(
        await displayNameFor({ name: 'Kirkby Plastics Ltd', tradingName: '  ' })
      ).toMatchObject({ displayName: 'Kirkby Plastics Ltd' })
    })

    it('serves no trading name', async () => {
      expect(
        await displayNameFor({
          name: 'Kirkby Plastics Ltd',
          tradingName: 'Kirkby Recycling'
        })
      ).not.toHaveProperty('tradingName')
    })
  })

  it('returns 404 for an unknown organisation number', async () => {
    await serve(
      buildReadOrganisation({
        organisationNumber: toOrganisationNumber('500001')
      })
    )

    const response = await get('/organisations/500002')

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('rejects an organisation number that is not a number', async () => {
    await serve(buildReadOrganisation())

    const response = await get('/organisations/not-a-number')

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('rejects an organisation number with a leading zero', async () => {
    await serve(
      buildReadOrganisation({
        organisationNumber: toOrganisationNumber('500001')
      })
    )

    const response = await get('/organisations/0500001')

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  describe('authorisation', () => {
    const organisation = buildAccreditedOrganisation()
    const request = async () => {
      await serve(organisation)
      return { method: 'GET', url: urlOf(organisation) }
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

  describe('relevant year', () => {
    const accreditedFor2026 = () =>
      buildReadOrganisation({
        registrations: {
          [REPROCESSOR_NUMBER]: buildReadReprocessorRegistration({
            accreditations: { 2026: buildReadAccreditation() }
          })
        }
      })

    it.for([
      {
        description: 'open during the year',
        now: '2026-10-01T00:00:00.000Z',
        open: true
      },
      {
        description: 'open on the last instant of 31 January after it',
        now: '2027-01-31T23:59:59.999Z',
        open: true
      },
      {
        description: 'closed from 1 February after it',
        now: '2027-02-01T00:00:00.000Z',
        open: false
      }
    ])('serves the accreditation as $description', async ({ now, open }) => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(now) })
      const organisation = accreditedFor2026()
      await serve(organisation)

      const response = await get(urlOf(organisation))

      const registration = body(response).registrations[REPROCESSOR_NUMBER]
      expect(registration.accreditations[2026].prns).toStrictEqual({ open })
    })
  })

  describe('with a year', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-03-15') })
    })

    afterEach(() => {
      config.reset('openNextYear')
    })

    it('asks the repository for the organisation as it stood in that year', async () => {
      const organisation = buildAccreditedOrganisation()
      const repository = await serve(organisation)

      const response = await get(`${urlOf(organisation)}?year=2026`)

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(repository.findByOrganisationNumber).toHaveBeenCalledWith(
        organisation.organisationNumber,
        { year: toYear(2026) }
      )
    })

    it('asks the repository for every year when no year is given', async () => {
      const organisation = buildAccreditedOrganisation()
      const repository = await serve(organisation)

      await get(urlOf(organisation))

      expect(repository.findByOrganisationNumber).toHaveBeenCalledWith(
        organisation.organisationNumber,
        { year: undefined }
      )
    })

    it('serves the organisation the repository gives for the year, with its PRNs closed once the year has closed', async () => {
      const organisation = buildAccreditedOrganisation()
      await serve(organisation)

      const response = await get(`${urlOf(organisation)}?year=2026`)

      const closed = (registration) => ({
        ...registration,
        accreditations: {
          2026: { ...registration.accreditations[2026], prns: { open: false } }
        }
      })
      expect(body(response).registrations).toEqual({
        [REPROCESSOR_NUMBER]: closed(reprocessorResponse),
        [EXPORTER_NUMBER]: closed(exporterResponse)
      })
    })

    it('accepts next year while it is open', async () => {
      config.set('openNextYear', true)
      const organisation = buildAccreditedOrganisation()
      await serve(organisation)

      const response = await get(`${urlOf(organisation)}?year=2028`)

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('rejects next year while it is closed', async () => {
      const organisation = buildAccreditedOrganisation()
      await serve(organisation)

      const response = await get(`${urlOf(organisation)}?year=2028`)

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects a year outside the supported range', async () => {
      const organisation = buildAccreditedOrganisation()
      await serve(organisation)

      const response = await get(`${urlOf(organisation)}?year=1999`)

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })
})
