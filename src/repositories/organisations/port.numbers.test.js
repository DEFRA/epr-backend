import { ObjectId } from 'mongodb'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from './contract/test-data.js'
import { createInMemoryOrganisationsRepository } from './inmemory.js'

/**
 * @import { Accreditation } from '#domain/organisations/accreditation.js'
 * @import { Organisation } from '#domain/organisations/model.js'
 * @import { OrganisationsRepository } from './port.js'
 */

const REGISTRATION_NUMBER = toRegistrationNumber('R26ER5000000001PA')
const ACCREDITATION_NUMBER = toAccreditationNumber('A26ER5000000001PA')

describe('the organisations port names records by their numbers', () => {
  /** @type {OrganisationsRepository} */
  let repository
  /** @type {Omit<Organisation, 'status'>} */
  let organisation
  /** @type {string} */
  let registrationId
  /** @type {Accreditation} */
  let accreditation

  beforeEach(async () => {
    registrationId = new ObjectId().toString()
    accreditation = buildAccreditation({
      accreditationNumber: ACCREDITATION_NUMBER
    })
    organisation = buildOrganisation({
      registrations: [
        buildRegistration({
          id: registrationId,
          registrationNumber: REGISTRATION_NUMBER,
          accreditationId: accreditation.id
        })
      ],
      accreditations: [accreditation]
    })
    repository = createInMemoryOrganisationsRepository()()
    await repository.insert(organisation)
  })

  it('finds the organisation by each of its numbers', async () => {
    const found = [
      await repository.findByOrganisationNumber(
        toOrganisationNumber(String(organisation.orgId))
      ),
      await repository.findByRegistrationNumber(REGISTRATION_NUMBER),
      await repository.findByAccreditationNumber(ACCREDITATION_NUMBER)
    ]

    expect(found.map((match) => match?.id)).toEqual([
      organisation.id,
      organisation.id,
      organisation.id
    ])
  })

  it('takes no database id where a number is expected', async () => {
    const found = [
      // @ts-expect-error an organisation's id is not its number
      await repository.findByOrganisationNumber(organisation.id),
      // @ts-expect-error a registration's id is not its number
      await repository.findByRegistrationNumber(registrationId),
      // @ts-expect-error an accreditation's id is not its number
      await repository.findByAccreditationNumber(accreditation.id)
    ]

    expect(found).toEqual([null, null, null])
  })

  it('takes no number of another kind, or a bare value', async () => {
    const found = [
      // @ts-expect-error the stored orgId is not an organisation number
      await repository.findByOrganisationNumber(organisation.orgId),
      // @ts-expect-error a bare string is not an organisation number
      await repository.findByOrganisationNumber(String(organisation.orgId)),
      // @ts-expect-error an accreditation number is not a registration number
      await repository.findByRegistrationNumber(ACCREDITATION_NUMBER),
      // @ts-expect-error a registration number is not an accreditation number
      await repository.findByAccreditationNumber(REGISTRATION_NUMBER)
    ]

    expect(found.map((match) => match?.id ?? null)).toEqual([
      organisation.id,
      organisation.id,
      null,
      null
    ])
  })
})
