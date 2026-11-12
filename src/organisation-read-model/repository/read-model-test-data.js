import { createInMemoryOrganisationReadRepository } from './inmemory.js'
import {
  toAccreditationNumber,
  toOrganisationNumber
} from '#domain/organisations/numbers.js'

/** @import { Organisation, ReprocessorAccreditation, ReprocessorRegistration, ExporterRegistration, StatusTimeline } from '#organisation-read-model/domain/model.js' */

/**
 * Organisations, registrations and accreditations built directly in the read
 * model's shape, for tests that seed the in-memory organisation read
 * repository.
 */

let organisationSequence = 600000

/** @returns {Organisation['organisationNumber']} */
export const nextReadOrganisationNumber = () =>
  toOrganisationNumber(String(organisationSequence++))

/**
 * A created then approved timeline, approved at `approvedAt`.
 *
 * @param {string} approvedAt - a calendar date, such as '2026-02-01'
 * @returns {StatusTimeline}
 */
export const approvedTimelineFrom = (approvedAt) => [
  {
    status: 'created',
    at: '2026-01-01T09:00:00.000Z',
    updatedAt: '2026-01-01T09:00:00.000Z'
  },
  {
    status: 'approved',
    at: new Date(approvedAt).toISOString(),
    updatedAt: '2026-02-01T09:00:00.000Z'
  }
]

const contact = {
  email: 'luke.skywalker@starwars.com',
  fullName: 'Luke Skywalker',
  phone: '1234567890'
}

/**
 * @param {Partial<ReprocessorAccreditation>} [overrides]
 * @returns {ReprocessorAccreditation}
 */
export const buildReadAccreditation = (overrides = {}) => ({
  accreditationNumber: toAccreditationNumber('A26ER5001180114PL'),
  prnIssuance: { tonnageBand: 'over_10000' },
  status: { current: 'approved', timeline: approvedTimelineFrom('2026-07-01') },
  ...overrides
})

/**
 * @param {Partial<ReprocessorRegistration>} [overrides]
 * @returns {ReprocessorRegistration}
 */
export const buildReadReprocessorRegistration = (overrides = {}) => ({
  applicationContactDetails: contact,
  approvedPersons: [contact],
  material: 'glass_re_melt',
  standingByDate: { 2026: { '2026-02-01': { standing: 'registeredOnly' } } },
  status: { current: 'approved', timeline: approvedTimelineFrom('2026-02-01') },
  submittedToRegulator: { code: 'ea' },
  submitterContactDetails: contact,
  validFrom: '2026-02-01',
  accreditations: {},
  reprocessingType: 'input',
  site: {
    address: {
      line1: '7 Glass processing site',
      town: 'London',
      postcode: 'SW2A 0AA'
    }
  },
  wasteProcessingType: 'reprocessor',
  ...overrides
})

/**
 * @param {Partial<ExporterRegistration>} [overrides]
 * @returns {ExporterRegistration}
 */
export const buildReadExporterRegistration = (overrides = {}) => {
  const {
    reprocessingType: _reprocessingType,
    site: _site,
    ...common
  } = buildReadReprocessorRegistration()
  return {
    ...common,
    material: 'plastic',
    accreditations: {},
    overseasSites: {},
    wasteProcessingType: 'exporter',
    ...overrides
  }
}

/**
 * @param {Partial<Organisation>} [overrides]
 * @returns {Organisation}
 */
export const buildReadOrganisation = (overrides = {}) => ({
  organisationNumber: nextReadOrganisationNumber(),
  name: 'ACME ltd',
  status: { current: 'approved', timeline: approvedTimelineFrom('2026-01-15') },
  submittedToRegulator: { code: 'ea' },
  submitterContactDetails: contact,
  users: [],
  version: 1,
  registrations: {},
  ...overrides
})

/**
 * The read model's view of an organisation built by `createApprovedOrgBuilder`:
 * one input reprocessor registered as `REG<organisationNumber>` and
 * accredited as `ACC<organisationNumber>`, both approved from `validFrom`,
 * the first day of `year` unless given.
 *
 * @param {{
 *   organisationNumber?: Organisation['organisationNumber'],
 *   year?: number,
 *   validFrom?: string,
 *   standingByDate?: ReprocessorRegistration['standingByDate'],
 *   overrides?: Partial<ReprocessorRegistration>
 * }} [options]
 * @returns {Organisation}
 */
export const buildReadApprovedOrganisation = ({
  organisationNumber = nextReadOrganisationNumber(),
  year = 2026,
  validFrom = `${year}-01-01`,
  standingByDate = { [year]: { [validFrom]: { standing: 'accredited' } } },
  overrides = {}
} = {}) => {
  const approved = {
    current: /** @type {const} */ ('approved'),
    timeline: [
      {
        status: 'created',
        at: `${validFrom}T00:00:00.000Z`,
        updatedAt: '2026-01-01T09:00:00.000Z'
      },
      {
        status: 'approved',
        at: `${validFrom}T00:00:00.000Z`,
        updatedAt: '2026-01-01T09:00:00.000Z'
      }
    ]
  }
  return buildReadOrganisation({
    organisationNumber,
    registrations: {
      [`REG${organisationNumber}`]: buildReadReprocessorRegistration({
        validFrom,
        status: approved,
        standingByDate,
        accreditations: {
          [year]: buildReadAccreditation({
            accreditationNumber: toAccreditationNumber(
              `ACC${organisationNumber}`
            ),
            status: approved
          })
        },
        ...overrides
      })
    }
  })
}

/**
 * Organisations a test builds one at a time, and the in-memory read
 * repository holding them.
 */
export const servedOrganisations = () => {
  /** @type {Organisation[]} */
  const held = []
  return {
    /** @param {Organisation} organisation */
    add: (organisation) => {
      held.push(organisation)
      return organisation
    },
    /** @param {Parameters<typeof buildReadApprovedOrganisation>[0]} [options] */
    approved: (options) => {
      const organisation = buildReadApprovedOrganisation(options)
      held.push(organisation)
      return organisation
    },
    repository: () => createInMemoryOrganisationReadRepository(held)()
  }
}

/**
 * The number of the organisation's only registration, as report keys take it.
 *
 * @param {Organisation} organisation
 */
export const registrationOf = (organisation) => ({
  registrationNumber: Object.keys(organisation.registrations)[0]
})

/**
 * An organisation the read model serves under the same organisation and
 * registration numbers as `keys`, with a default approved registration for
 * each. Only the numbers are taken from `keys`.
 *
 * @param {{
 *   organisationNumber: Organisation['organisationNumber'],
 *   registrations: Array<{ registrationNumber?: string | null, wasteProcessingType?: string }>
 * }} keys
 * @returns {Organisation}
 */
export const buildReadOrganisationWithNumbersOf = ({
  organisationNumber,
  registrations
}) =>
  buildReadOrganisation({
    organisationNumber,
    registrations: Object.fromEntries(
      registrations.flatMap(({ registrationNumber, wasteProcessingType }) =>
        registrationNumber
          ? [
              [
                registrationNumber,
                wasteProcessingType === 'exporter'
                  ? buildReadExporterRegistration()
                  : buildReadReprocessorRegistration()
              ]
            ]
          : []
      )
    )
  })
