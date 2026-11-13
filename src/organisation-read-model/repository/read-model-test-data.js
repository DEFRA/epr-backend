import { createInMemoryOrganisationReadRepository } from './inmemory.js'
import {
  toAccreditationNumber,
  toOrganisationNumber
} from '#domain/organisations/numbers.js'
import { lastDayOfYear, utcYearOf } from '#common/helpers/dates/year.js'
import { standingByYear } from '#organisation-read-model/domain/registration-standing.js'

/** @import { Organisation, ReprocessorAccreditation, ExporterAccreditation, ReprocessorRegistration, ExporterRegistration, RegistrationCommon, Status, StatusTimeline } from '#organisation-read-model/domain/model.js' */
/** @import { OrganisationReadRepository } from './port.js' */

/**
 * Organisations, registrations and accreditations built directly in the read
 * model's shape, for tests that seed the in-memory organisation read
 * repository.
 */

let organisationSequence = 600000
let accreditationSequence = 9000000000

/** @returns {Organisation['organisationNumber']} */
export const nextReadOrganisationNumber = () => {
  const number = organisationSequence
  organisationSequence += 1
  return toOrganisationNumber(String(number))
}

/**
 * A number no other default accreditation holds.
 *
 * @returns {ReprocessorAccreditation['accreditationNumber']}
 */
export const nextReadAccreditationNumber = () => {
  const number = accreditationSequence
  accreditationSequence += 1
  return toAccreditationNumber(`A26ER${number}PL`)
}

/**
 * A timeline approved from the start of `approvedAt`.
 *
 * @param {string} approvedAt - a calendar date, such as '2026-02-01'
 * @returns {StatusTimeline<'approved'>}
 */
export const approvedTimelineFrom = (approvedAt) => [
  { status: 'approved', at: new Date(approvedAt).toISOString() }
]

/**
 * An approved status, approved and recorded from the start of `approvedAt`.
 *
 * @param {string} approvedAt - a calendar date, such as '2026-02-01'
 * @returns {Status<'approved'>}
 */
export const approvedStatusFrom = (approvedAt) => ({
  current: 'approved',
  lastUpdatedAt: new Date(approvedAt).toISOString(),
  timeline: approvedTimelineFrom(approvedAt)
})

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
  accreditationNumber: nextReadAccreditationNumber(),
  prnIssuance: { tonnageBand: 'over_10000' },
  status: approvedStatusFrom('2026-07-01'),
  ...overrides
})

/**
 * @param {Partial<ExporterAccreditation>} [overrides]
 * @returns {ExporterAccreditation}
 */
export const buildReadExporterAccreditation = (overrides = {}) => ({
  ...buildReadAccreditation(),
  overseasSites: {},
  ...overrides
})

/**
 * The registration with `standingByDate` as the read model works it out from
 * the registration's and its accreditations' timelines, for every year up to
 * the last one they name, unless the registration already gives one. So an
 * accredited registration is accredited from its accreditation's approval, as
 * the mapper would make it.
 *
 * @template {Omit<RegistrationCommon, 'standingByDate'> & Partial<Pick<RegistrationCommon, 'standingByDate'>> & { accreditations: Record<string, { status: { timeline: StatusTimeline } }> }} R
 * @param {R} registration
 * @returns {R & Pick<RegistrationCommon, 'standingByDate'>}
 */
const withStanding = (registration) => {
  if (registration.standingByDate) {
    return /** @type {any} */ (registration)
  }
  const lastYear = Math.max(
    ...[
      ...Object.keys(registration.accreditations),
      ...registration.status.timeline.map(({ at }) => at)
    ].map(utcYearOf)
  )
  return {
    ...registration,
    standingByDate: standingByYear(
      /** @type {any} */ (registration),
      lastDayOfYear(utcYearOf(`${lastYear}-12-31`))
    )
  }
}

const commonRegistrationDefaults = () => ({
  applicationContactDetails: contact,
  approvedPersons: [contact],
  status: approvedStatusFrom('2026-02-01'),
  submittedToRegulator: { code: /** @type {const} */ ('ea') },
  submitterContactDetails: contact,
  accreditations: {}
})

/**
 * An approved registration from 2026-02-01. Without a `standingByDate`
 * override, its standing follows from its timeline and accreditations.
 *
 * @param {Partial<ReprocessorRegistration>} [overrides]
 * @returns {ReprocessorRegistration}
 */
export const buildReadReprocessorRegistration = (overrides = {}) =>
  withStanding({
    ...commonRegistrationDefaults(),
    material: /** @type {const} */ ('glass_re_melt'),
    reprocessingType: /** @type {const} */ ('input'),
    site: {
      address: {
        line1: '7 Glass processing site',
        town: 'London',
        postcode: 'SW2A 0AA'
      }
    },
    wasteProcessingType: /** @type {const} */ ('reprocessor'),
    ...overrides
  })

/**
 * An approved registration from 2026-02-01. Without a `standingByDate`
 * override, its standing follows from its timeline and accreditations.
 *
 * @param {Partial<ExporterRegistration>} [overrides]
 * @returns {ExporterRegistration}
 */
export const buildReadExporterRegistration = (overrides = {}) =>
  withStanding({
    ...commonRegistrationDefaults(),
    material: /** @type {const} */ ('plastic'),
    overseasSites: {},
    wasteProcessingType: /** @type {const} */ ('exporter'),
    ...overrides
  })

/**
 * @param {Partial<Organisation>} [overrides]
 * @returns {Organisation}
 */
export const buildReadOrganisation = (overrides = {}) => ({
  organisationNumber: nextReadOrganisationNumber(),
  name: 'ACME ltd',
  status: approvedStatusFrom('2026-01-15'),
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
  standingByDate,
  overrides = {}
} = {}) => {
  const approved = approvedStatusFrom(validFrom)
  return buildReadOrganisation({
    organisationNumber,
    registrations: {
      [`REG${organisationNumber}`]: buildReadReprocessorRegistration({
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
 * Organisations a test builds one at a time, and an in-memory read repository
 * serving them. The repository reads the organisations live, so one added
 * after `repository()` is called is still served by it.
 */
export const servedOrganisations = () => {
  /** @type {Organisation[]} */
  const held = []
  const current = () => createInMemoryOrganisationReadRepository(held)()
  /** @type {OrganisationReadRepository} */
  const repository = {
    findByOrganisationNumber: (...args) =>
      current().findByOrganisationNumber(...args),
    find: (params) => current().find(params),
    findAll: () => current().findAll()
  }
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
    repository: () => repository
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
