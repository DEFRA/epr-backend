import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import { resolveMaterial } from '#domain/organisations/registration-utils.js'

/** @import { AccreditationStatus, GlassRecyclingProcess, Organisation, RegistrationStatus } from '#domain/organisations/model.js' */

/**
 * @typedef {Object} UnsplitGlassRow
 * @property {string} organisationId
 * @property {number} orgId
 * @property {boolean} testOrganisation
 * @property {'registration' | 'accreditation'} recordKind
 * @property {string} recordId
 * @property {RegistrationStatus | AccreditationStatus} status
 * @property {string | null} number - the registration or accreditation number
 * @property {GlassRecyclingProcess[] | null} glassRecyclingProcess - as stored
 */

/**
 * @typedef {Object} UnsplitGlassSummary
 * @property {number} scannedOrganisations
 * @property {number} scannedRegistrations
 * @property {number} scannedAccreditations
 * @property {number} unsplitRegistrations
 * @property {number} unsplitAccreditations
 * @property {number} unsplitInTestOrganisations - of the unsplit records, how
 *   many belong to test organisations
 */

/**
 * @typedef {Object} UnsplitGlassReport
 * @property {UnsplitGlassRow[]} rows
 * @property {UnsplitGlassSummary} summary
 */

/**
 * Asks resolveMaterial itself, so this diagnostic and the error a page
 * raises cannot disagree about which records are unsplit.
 *
 * @param {Parameters<typeof resolveMaterial>[0]} record
 */
const isRejectedByResolveMaterial = (record) => {
  try {
    resolveMaterial(record)
    return false
  } catch {
    return true
  }
}

/**
 * Lists every stored registration and accreditation that resolveMaterial
 * rejects: one that applied for glass without carrying exactly one recycling
 * process. Every organisation, number and status is examined, so an
 * unnumbered or unapproved record is found as readily as a live one.
 *
 * @param {Organisation[]} organisations
 * @returns {UnsplitGlassReport}
 */
export const diagnoseUnsplitGlass = (organisations) => {
  const registrations = organisations.flatMap((organisation) =>
    organisation.registrations.map((record) => ({
      organisation,
      record,
      recordKind: /** @type {const} */ ('registration'),
      number: record.registrationNumber
    }))
  )
  const accreditations = organisations.flatMap((organisation) =>
    organisation.accreditations.map((record) => ({
      organisation,
      record,
      recordKind: /** @type {const} */ ('accreditation'),
      number: record.accreditationNumber
    }))
  )

  const rows = [...registrations, ...accreditations]
    .filter(({ record }) => isRejectedByResolveMaterial(record))
    .map(({ organisation, record, recordKind, number }) => ({
      organisationId: organisation.id,
      orgId: organisation.orgId,
      testOrganisation: TEST_ORGANISATION_IDS.has(organisation.orgId),
      recordKind,
      recordId: record.id,
      status: record.status,
      number: number ?? null,
      glassRecyclingProcess: record.glassRecyclingProcess ?? null
    }))

  /** @param {UnsplitGlassRow['recordKind']} kind */
  const countOf = (kind) => rows.filter((row) => row.recordKind === kind).length

  return {
    rows,
    summary: {
      scannedOrganisations: organisations.length,
      scannedRegistrations: registrations.length,
      scannedAccreditations: accreditations.length,
      unsplitRegistrations: countOf('registration'),
      unsplitAccreditations: countOf('accreditation'),
      unsplitInTestOrganisations: rows.filter((row) => row.testOrganisation)
        .length
    }
  }
}
