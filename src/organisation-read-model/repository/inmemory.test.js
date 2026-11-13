import { describe, expect, it as baseIt } from 'vitest'

import { createInMemoryOrganisationReadRepository } from './inmemory.js'
import { testOrganisationReadRepositoryContract } from './port.contract.js'
import {
  approvedStatusFrom,
  buildReadAccreditation,
  buildReadExporterAccreditation,
  buildReadExporterRegistration,
  buildReadOrganisation,
  buildReadReprocessorRegistration
} from './read-model-test-data.js'
import {
  SEED_ACCREDITATION_YEAR,
  SEED_REGISTRATION_APPROVED_ON
} from './contract/organisation-seed-test-helpers.js'

/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { OrganisationReadRepositoryServingFixture, OrganisationSeed, OverseasSiteSeed } from './port.contract.js' */
/** @typedef {OrganisationSeed['registrations'][number]} SeededRegistration */

/** @param {Organisation[]} organisations */
const repositoryOf = (organisations) =>
  createInMemoryOrganisationReadRepository(organisations)()

/** Where every seeded overseas site is, as the read model serves it. */
const SEEDED_SITE_ADDRESS = {
  line1: '1 Teststrasse',
  townOrCity: 'Berlin',
  country: 'Germany'
}

/**
 * An exporter's seeded overseas sites as the read model serves them on the
 * registration, each valid from its `approvedOn` when it has one.
 *
 * @param {OverseasSiteSeed[]} sites
 */
const toReadOverseasSites = (sites) =>
  Object.fromEntries(
    sites.map(({ siteNumber, name, approvedOn }) => [
      siteNumber,
      {
        name,
        address: SEEDED_SITE_ADDRESS,
        ...(approvedOn && { validFrom: new Date(approvedOn).toISOString() })
      }
    ])
  )

/**
 * An exporter's seeded overseas sites as its accreditation lists them:
 * approved from their `approvedOn`, or pending without one.
 *
 * @param {OverseasSiteSeed[]} sites
 */
const toReadAccreditedSites = (sites) =>
  Object.fromEntries(
    sites.map(({ siteNumber, approvedOn }) => [
      siteNumber,
      approvedOn
        ? { status: /** @type {const} */ ('approved'), approvedOn }
        : { status: /** @type {const} */ ('pending') }
    ])
  )

/**
 * The accreditation a seed's accreditation number gives, approved from 1 July
 * of `SEED_ACCREDITATION_YEAR`.
 *
 * @param {NonNullable<SeededRegistration['accreditationNumber']>} accreditationNumber
 */
const accreditationFieldsFor = (accreditationNumber) => ({
  accreditationNumber,
  status: approvedStatusFrom(`${SEED_ACCREDITATION_YEAR}-07-01`)
})

/**
 * A seeded registration in the read model's shape: approved from its
 * `approvedOn`, of the kind it names, and accredited for
 * `SEED_ACCREDITATION_YEAR` when the seed gives an accreditation number.
 *
 * @param {SeededRegistration} registration
 */
const toReadRegistration = ({
  accreditationNumber,
  wasteProcessingType,
  overseasSites = [],
  approvedOn = SEED_REGISTRATION_APPROVED_ON
}) => {
  const approved = {
    validFrom: approvedOn,
    status: approvedStatusFrom(approvedOn)
  }
  if (wasteProcessingType === 'exporter') {
    return buildReadExporterRegistration({
      ...approved,
      overseasSites: toReadOverseasSites(overseasSites),
      accreditations: accreditationNumber
        ? {
            [SEED_ACCREDITATION_YEAR]: buildReadExporterAccreditation({
              ...accreditationFieldsFor(accreditationNumber),
              overseasSites: toReadAccreditedSites(overseasSites)
            })
          }
        : {}
    })
  }
  return buildReadReprocessorRegistration({
    ...approved,
    accreditations: accreditationNumber
      ? {
          [SEED_ACCREDITATION_YEAR]: buildReadAccreditation(
            accreditationFieldsFor(accreditationNumber)
          )
        }
      : {}
  })
}

/**
 * The seeded organisation in the read model's shape, each registration built
 * by `toReadRegistration`.
 *
 * @param {OrganisationSeed} seed
 * @returns {Organisation}
 */
const toReadModel = ({ name, organisationNumber, registrations }) =>
  buildReadOrganisation({
    name,
    organisationNumber,
    registrations: Object.fromEntries(
      registrations.map((registration) => [
        registration.registrationNumber,
        toReadRegistration(registration)
      ])
    )
  })

const it = baseIt.extend(
  /** @type {OrganisationReadRepositoryServingFixture} */ ({
    // eslint-disable-next-line no-empty-pattern
    organisationReadRepositoryServing: async ({}, use) => {
      await use(async (seeds) => repositoryOf(seeds.map(toReadModel)))
    }
  })
)

describe('in-memory organisation read repository', () => {
  testOrganisationReadRepositoryContract(it)

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
