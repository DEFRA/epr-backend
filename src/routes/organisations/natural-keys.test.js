import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { partialMock } from '#test/type-helpers.js'
import { vi } from 'vitest'
import { REPROCESSOR_NUMBER } from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import Joi from 'joi'
import {
  findOrganisationAndRegistrationReadModels,
  findOrganisationByNumber,
  registrationParams
} from './natural-keys.js'

const { buildOrganisation } = createOrganisationBuilders()

describe('registrationParams', () => {
  const schema = Joi.object(registrationParams)

  it('accepts a registration number', () => {
    expect(
      schema.validate({
        organisationNumber: '500001',
        registrationNumber: REPROCESSOR_NUMBER
      }).error
    ).toBeUndefined()
  })

  it.each(['constructor', '__proto__', 'toString', 'r26er5001180098pl'])(
    'rejects a registration number of %s',
    (registrationNumber) => {
      expect(
        schema.validate({ organisationNumber: '500001', registrationNumber })
          .error
      ).toBeDefined()
    }
  )
})

describe('findOrganisationByNumber', () => {
  it('finds an organisation by its number', async () => {
    const organisation = buildOrganisation()

    const found = await findOrganisationByNumber(
      createInMemoryOrganisationsRepository([partialMock(organisation)])(),
      organisation.organisationNumber
    )

    expect(found.id).toBe(organisation.id)
  })

  it('rejects an organisation the read model does not serve', async () => {
    const organisation = buildOrganisation({
      statusHistory: [{ status: 'approved', updatedAt: '2999-01-01' }]
    })

    await expect(
      findOrganisationByNumber(
        createInMemoryOrganisationsRepository([partialMock(organisation)])(),
        organisation.organisationNumber
      )
    ).rejects.toMatchObject({ output: { statusCode: 404 } })
  })
})

describe('findOrganisationAndRegistrationReadModels', () => {
  const registration = { material: 'plastic' }
  const organisation = { registrations: { R26ER5001180041PL: registration } }

  /**
   * @param {object | null} found
   * @param {string} registrationNumber
   */
  const requestFor = (found, registrationNumber) =>
    partialMock({
      organisationReadRepository: {
        findByOrganisationNumber: vi.fn().mockResolvedValue(found)
      },
      params: { organisationNumber: '500001', registrationNumber }
    })

  it('finds the organisation and the registration it holds', async () => {
    await expect(
      findOrganisationAndRegistrationReadModels(
        requestFor(organisation, 'R26ER5001180041PL')
      )
    ).resolves.toEqual({ organisation, registration })
  })

  it.each(['R26ER5001180098PL', 'constructor', '__proto__', 'toString'])(
    'is not found when the organisation does not hold registration %s',
    async (registrationNumber) => {
      await expect(
        findOrganisationAndRegistrationReadModels(
          requestFor(organisation, registrationNumber)
        )
      ).rejects.toMatchObject({
        output: {
          statusCode: 404,
          payload: { message: 'Registration not found' }
        }
      })
    }
  )

  it('is not found when there is no organisation', async () => {
    await expect(
      findOrganisationAndRegistrationReadModels(
        requestFor(null, 'R26ER5001180041PL')
      )
    ).rejects.toMatchObject({
      output: {
        statusCode: 404,
        payload: { message: 'Organisation not found' }
      }
    })
  })
})
