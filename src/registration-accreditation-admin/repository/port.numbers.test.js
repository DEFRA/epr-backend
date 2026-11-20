import { ObjectId } from 'mongodb'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  toAccreditationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import {
  buildAccreditation,
  buildRegistration,
  createOrganisationBuilders
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryRegistrationAccreditationAdminRepository } from './inmemory.js'

const { buildOrganisation } = createOrganisationBuilders()

/**
 * @import { Accreditation } from '#domain/organisations/accreditation.js'
 * @import { RegistrationAccreditationAdminRepository } from './port.js'
 */

const REGISTRATION_NUMBER = toRegistrationNumber('R26ER5000000001PA')
const ACCREDITATION_NUMBER = toAccreditationNumber('A26ER5000000001PA')

describe('the admin repository names records by their numbers', () => {
  /** @type {RegistrationAccreditationAdminRepository} */
  let repository
  /** @type {string} */
  let registrationId
  /** @type {Accreditation} */
  let accreditation

  beforeEach(async () => {
    registrationId = new ObjectId().toString()
    accreditation = buildAccreditation({
      accreditationNumber: ACCREDITATION_NUMBER
    })
    const organisations = createInMemoryOrganisationsRepository()()
    await organisations.insert(
      buildOrganisation({
        registrations: [
          buildRegistration({
            id: registrationId,
            registrationNumber: REGISTRATION_NUMBER,
            accreditationId: accreditation.id
          })
        ],
        accreditations: [accreditation]
      })
    )
    repository =
      createInMemoryRegistrationAccreditationAdminRepository(organisations)()
  })

  it('finds the numbers in use', async () => {
    expect([
      await repository.isRegistrationNumberInUse(REGISTRATION_NUMBER),
      await repository.isAccreditationNumberInUse(ACCREDITATION_NUMBER)
    ]).toEqual([true, true])
  })

  it('takes no database id where a number is expected', async () => {
    expect([
      // @ts-expect-error a registration's id is not its number
      await repository.isRegistrationNumberInUse(registrationId),
      // @ts-expect-error an accreditation's id is not its number
      await repository.isAccreditationNumberInUse(accreditation.id)
    ]).toEqual([false, false])
  })

  it('takes no number of another kind', async () => {
    expect([
      // @ts-expect-error an accreditation number is not a registration number
      await repository.isRegistrationNumberInUse(ACCREDITATION_NUMBER),
      // @ts-expect-error a registration number is not an accreditation number
      await repository.isAccreditationNumberInUse(REGISTRATION_NUMBER)
    ]).toEqual([false, false])
  })
})
