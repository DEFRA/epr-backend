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
} from './contract/test-data.js'
import { createInMemoryOrganisationsRepository } from './inmemory.js'

const { buildOrganisation } = createOrganisationBuilders()

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

  it('finds the organisation by its number', async () => {
    const found = await repository.findByOrganisationNumber(
      organisation.organisationNumber
    )

    expect(found?.id).toBe(organisation.id)
  })

  it('takes no database id where a number is expected', async () => {
    // @ts-expect-error an organisation's id is not its number
    expect(await repository.findByOrganisationNumber(organisation.id)).toBe(
      null
    )
  })

  it('takes no number of another kind, or a bare value', async () => {
    const bareNumber = Number(organisation.organisationNumber)
    const bareString = String(organisation.organisationNumber)
    const found = [
      // @ts-expect-error a bare number is not an organisation number
      await repository.findByOrganisationNumber(bareNumber),
      // @ts-expect-error a bare string is not an organisation number
      await repository.findByOrganisationNumber(bareString)
    ]

    expect(found.map((match) => match?.id)).toEqual([
      organisation.id,
      organisation.id
    ])
  })
})
