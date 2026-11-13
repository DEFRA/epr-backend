import { describe, expect, it as baseIt } from 'vitest'

import { createInMemoryOrganisationReadRepository } from './inmemory.js'
import { testOrganisationReadRepositoryContract } from './port.contract.js'
import {
  approvedTimelineFrom,
  buildReadAccreditation,
  buildReadExporterAccreditation,
  buildReadExporterRegistration,
  buildReadOrganisation,
  buildReadReprocessorRegistration
} from './read-model-test-data.js'
import { SEED_ACCREDITATION_YEAR } from './contract/organisation-seed-test-helpers.js'

/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { OrganisationReadRepositoryContractIt, OrganisationReadRepositoryServing, OrganisationSeed } from './port.contract.js' */

/** @param {Organisation[]} organisations */
const repositoryOf = (organisations) =>
  createInMemoryOrganisationReadRepository(organisations)()

/**
 * The seeded organisation in the read model's shape: each registration
 * approved and of the kind it names, with an accreditation approved from
 * 1 July of `SEED_ACCREDITATION_YEAR` when the seed gives an accreditation
 * number. An exporter's overseas sites are valid from their `approvedOn`, and
 * its accreditation lists each as approved from then, or pending without one.
 *
 * @param {OrganisationSeed} seed
 * @returns {Organisation}
 */
const toReadModel = ({ name, organisationNumber, registrations }) =>
  buildReadOrganisation({
    name,
    organisationNumber,
    registrations: Object.fromEntries(
      registrations.map(
        ({
          registrationNumber,
          accreditationNumber,
          wasteProcessingType,
          overseasSites = []
        }) => {
          const exporting = wasteProcessingType === 'exporter'
          const accreditationFields = {
            accreditationNumber,
            status: {
              current: /** @type {const} */ ('approved'),
              timeline: approvedTimelineFrom(`${SEED_ACCREDITATION_YEAR}-07-01`)
            }
          }
          return [
            registrationNumber,
            exporting
              ? buildReadExporterRegistration({
                  overseasSites: Object.fromEntries(
                    overseasSites.map(
                      ({ siteNumber, name: siteName, approvedOn }) => [
                        siteNumber,
                        {
                          name: siteName,
                          address: {
                            line1: '1 Teststrasse',
                            townOrCity: 'Berlin',
                            country: 'Germany'
                          },
                          ...(approvedOn && {
                            validFrom: new Date(approvedOn).toISOString()
                          })
                        }
                      ]
                    )
                  ),
                  accreditations: accreditationNumber
                    ? {
                        [SEED_ACCREDITATION_YEAR]:
                          buildReadExporterAccreditation({
                            ...accreditationFields,
                            overseasSites: Object.fromEntries(
                              overseasSites.map(
                                ({ siteNumber, approvedOn }) => [
                                  siteNumber,
                                  approvedOn
                                    ? {
                                        status: /** @type {const} */ (
                                          'approved'
                                        ),
                                        approvedOn
                                      }
                                    : {
                                        status: /** @type {const} */ ('pending')
                                      }
                                ]
                              )
                            )
                          })
                      }
                    : {}
                })
              : buildReadReprocessorRegistration({
                  accreditations: accreditationNumber
                    ? {
                        [SEED_ACCREDITATION_YEAR]:
                          buildReadAccreditation(accreditationFields)
                      }
                    : {}
                })
          ]
        }
      )
    )
  })

const it = baseIt.extend(
  /** @type {{ organisationReadRepositoryServing: (context: any, use: (value: OrganisationReadRepositoryServing) => Promise<void>) => Promise<void> }} */ ({
    // eslint-disable-next-line no-empty-pattern
    organisationReadRepositoryServing: async ({}, use) => {
      await use(async (seeds) => repositoryOf(seeds.map(toReadModel)))
    }
  })
)

describe('in-memory organisation read repository', () => {
  testOrganisationReadRepositoryContract(
    /** @type {OrganisationReadRepositoryContractIt} */ (
      /** @type {unknown} */ (it)
    )
  )

  describe('serves the organisations exactly as it holds them', () => {
    const held = () =>
      buildReadOrganisation({
        registrations: {
          R26ER5001180041PL: buildReadReprocessorRegistration({
            accreditations: { 2026: buildReadAccreditation() }
          })
        }
      })

    it('from findByOrganisationNumber', async () => {
      const organisation = held()
      const repository = repositoryOf([buildReadOrganisation(), organisation])

      expect(
        await repository.findByOrganisationNumber(
          organisation.organisationNumber
        )
      ).toStrictEqual(organisation)
    })

    it('from find', async () => {
      const organisation = held()
      const repository = repositoryOf([buildReadOrganisation(), organisation])

      const { items } = await repository.find({
        organisationNumber: organisation.organisationNumber,
        page: 1,
        pageSize: 10
      })

      expect(items).toStrictEqual([organisation])
    })

    it('from findAll', async () => {
      const organisations = [held(), buildReadOrganisation()]
      const repository = repositoryOf(organisations)

      expect(await repository.findAll()).toStrictEqual(organisations)
    })
  })

  describe('copies', () => {
    it('returns a copy, so changing it changes nothing held', async () => {
      const held = buildReadOrganisation()
      const repository = repositoryOf([held])

      const first = /** @type {Organisation} */ (
        await repository.findByOrganisationNumber(held.organisationNumber)
      )
      first.name = 'Changed'

      expect(
        await repository.findByOrganisationNumber(held.organisationNumber)
      ).toHaveProperty('name', 'ACME ltd')
    })

    it('is not changed by changes to the organisations it was given', async () => {
      const held = buildReadOrganisation()
      const repository = repositoryOf([held])

      held.name = 'Changed'

      expect(
        await repository.findByOrganisationNumber(held.organisationNumber)
      ).toHaveProperty('name', 'ACME ltd')
    })
  })
})
