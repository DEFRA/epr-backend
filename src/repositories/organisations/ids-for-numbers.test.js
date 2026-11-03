import { ObjectId } from 'mongodb'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import {
  buildAccreditation,
  buildRegistration,
  createOrganisationBuilders
} from './contract/test-data.js'
import { idsForNumbers } from './ids-for-numbers.js'
import { createInMemoryOrganisationsRepository } from './inmemory.js'

const { buildOrganisation } = createOrganisationBuilders()

/**
 * @import { Accreditation } from '#domain/organisations/accreditation.js'
 * @import { Organisation } from '#domain/organisations/model.js'
 * @import { OrganisationsRepository } from './port.js'
 */

const REGISTRATION_NUMBER = toRegistrationNumber('R26ER5000000001PA')
const ACCREDITATION_NUMBER = toAccreditationNumber('A26ER5000000001PA')

describe('idsForNumbers', () => {
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

  const organisationNumber = () =>
    toOrganisationNumber(String(organisation.orgId))

  it('gives the ids of the organisation, registration and accreditation the numbers name', async () => {
    const ids = await idsForNumbers(repository, {
      organisationNumber: organisationNumber(),
      registrationNumber: REGISTRATION_NUMBER,
      accreditationNumber: ACCREDITATION_NUMBER
    })

    expect(ids).toStrictEqual({
      organisationId: organisation.id,
      registrationId,
      accreditationId: accreditation.id
    })
  })

  it('gives a null accreditation id for a registered-only registration', async () => {
    const ids = await idsForNumbers(repository, {
      organisationNumber: organisationNumber(),
      registrationNumber: REGISTRATION_NUMBER,
      accreditationNumber: null
    })

    expect(ids).toStrictEqual({
      organisationId: organisation.id,
      registrationId,
      accreditationId: null
    })
  })

  it('gives null for an organisation number no organisation holds', async () => {
    const ids = await idsForNumbers(repository, {
      organisationNumber: toOrganisationNumber('999999'),
      registrationNumber: REGISTRATION_NUMBER,
      accreditationNumber: ACCREDITATION_NUMBER
    })

    expect(ids).toBeNull()
  })

  it('gives null for a registration number the organisation does not hold', async () => {
    const ids = await idsForNumbers(repository, {
      organisationNumber: organisationNumber(),
      registrationNumber: toRegistrationNumber('R26ER5000000002PA'),
      accreditationNumber: ACCREDITATION_NUMBER
    })

    expect(ids).toBeNull()
  })

  it('gives null for an accreditation number the organisation does not hold', async () => {
    const ids = await idsForNumbers(repository, {
      organisationNumber: organisationNumber(),
      registrationNumber: REGISTRATION_NUMBER,
      accreditationNumber: toAccreditationNumber('A26ER5000000002PA')
    })

    expect(ids).toBeNull()
  })
})
