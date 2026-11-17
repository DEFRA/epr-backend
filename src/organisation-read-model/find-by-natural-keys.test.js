import { partialMock } from '#test/type-helpers.js'
import { vi } from 'vitest'
import { findOrganisationAndRegistrationReadModels } from './find-by-natural-keys.js'

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
