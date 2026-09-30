import { deriveAccreditationYear } from '#common/helpers/dates/accreditation.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import {
  accreditationsForRegistration,
  resolveMaterial
} from '#domain/organisations/registration-utils.js'

/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { Registration } from '#domain/organisations/registration.js' */
/** @import { Accreditation } from '#domain/organisations/accreditation.js' */
/** @import { OverseasSiteDetail } from '#overseas-sites/application/resolve-overseas-site-details.js' */

/**
 * Every accreditation held locally is for the 2026 scheme year (ADR-0034).
 * Only used for an accreditation not yet granted, which has no validFrom.
 */
const LOCAL_ACCREDITATION_YEAR = 2026

/**
 * @typedef {{
 *   id: string
 *   accreditationNumber: string | null
 *   status: string
 *   overseasSites: Record<string, string | null>
 * }} AccreditationView
 */

/**
 * @typedef {Omit<OverseasSiteDetail, 'validFrom'>} OverseasSiteView
 */

/**
 * @typedef {{
 *   id: string
 *   registrationNumber: string | null
 *   status: string
 *   validFrom: string | null
 *   material: string
 *   wasteProcessingType: string
 *   reprocessingType: string | null
 *   submittedToRegulator: string
 *   site: {
 *     address: {
 *       line1?: string
 *       line2?: string
 *       town?: string
 *       county?: string
 *       postcode?: string
 *     }
 *   } | null
 *   overseasSites: Record<string, OverseasSiteView>
 *   accreditations: Record<string, AccreditationView>
 * }} RegistrationView
 */

/**
 * @typedef {{
 *   id: string
 *   orgId: number
 *   name: string
 *   tradingName: string | null
 *   status: string
 *   submittedToRegulator: string
 *   linkedDefraOrganisation?: {
 *     orgId: string
 *     orgName: string
 *     linkedAt: string
 *     linkedBy: { email: string }
 *   }
 *   registrations: RegistrationView[]
 * }} OrganisationView
 */

/**
 * @param {Organisation} organisation
 * @param {Record<string, Record<string, OverseasSiteDetail>>} overseasSitesByRegistrationId
 * @returns {OrganisationView}
 */
export function toOrganisationView(
  organisation,
  overseasSitesByRegistrationId
) {
  const { companyDetails, linkedDefraOrganisation } = organisation

  return {
    id: organisation.id,
    orgId: organisation.orgId,
    name: companyDetails.name,
    tradingName: companyDetails.tradingName ?? null,
    status: organisation.status,
    submittedToRegulator: organisation.submittedToRegulator,
    ...(linkedDefraOrganisation && {
      linkedDefraOrganisation: {
        orgId: linkedDefraOrganisation.orgId,
        orgName: linkedDefraOrganisation.orgName,
        linkedAt: linkedDefraOrganisation.linkedAt,
        linkedBy: { email: linkedDefraOrganisation.linkedBy.email }
      }
    }),
    registrations: organisation.registrations.map((registration) =>
      toRegistrationView(
        registration,
        organisation,
        overseasSitesByRegistrationId[registration.id]
      )
    )
  }
}

/**
 * @param {Registration} registration
 * @param {Organisation} organisation
 * @param {Record<string, OverseasSiteDetail>} overseasSites
 * @returns {RegistrationView}
 */
export function toRegistrationView(registration, organisation, overseasSites) {
  return {
    id: registration.id,
    registrationNumber: registration.registrationNumber ?? null,
    status: registration.status,
    validFrom: registration.validFrom ?? null,
    material: resolveMaterial(registration),
    wasteProcessingType: registration.wasteProcessingType,
    reprocessingType: registration.reprocessingType ?? null,
    submittedToRegulator: registration.submittedToRegulator,
    site: toSiteView(registration),
    overseasSites: toOverseasSitesView(overseasSites),
    accreditations: toAccreditationsView(
      registration,
      organisation,
      overseasSites
    )
  }
}

/**
 * Keyed by scheme year: a registration holds at most one accreditation a year.
 * Until the registration service supplies per-year site approvals, an
 * accreditation lists every registration site with the site's stored approval.
 *
 * @param {Registration} registration
 * @param {Organisation} organisation
 * @param {Record<string, OverseasSiteDetail>} overseasSites
 * @returns {Record<string, AccreditationView>}
 */
export function toAccreditationsView(
  registration,
  organisation,
  overseasSites
) {
  return Object.fromEntries(
    accreditationsForRegistration(registration, organisation).map(
      (accreditation) => [
        String(accreditationYear(accreditation)),
        toAccreditationView(accreditation, overseasSites)
      ]
    )
  )
}

/**
 * @param {Accreditation} accreditation
 * @param {Record<string, OverseasSiteDetail>} overseasSites
 * @returns {AccreditationView}
 */
function toAccreditationView(accreditation, overseasSites) {
  return {
    id: accreditation.id,
    accreditationNumber: accreditation.accreditationNumber ?? null,
    status: accreditation.status,
    overseasSites: toOverseasSiteApprovals(overseasSites)
  }
}

/**
 * @param {Accreditation} accreditation
 */
function accreditationYear(accreditation) {
  return accreditation.validFrom
    ? deriveAccreditationYear(accreditation)
    : LOCAL_ACCREDITATION_YEAR
}

/**
 * @param {Registration} registration
 */
function toSiteView(registration) {
  if (registration.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER) {
    return null
  }

  const { line1, line2, town, county, postcode } = registration.site.address
  return { address: { line1, line2, town, county, postcode } }
}

/**
 * @param {Record<string, OverseasSiteDetail>} overseasSites
 * @returns {Record<string, OverseasSiteView>}
 */
function toOverseasSitesView(overseasSites) {
  return Object.fromEntries(
    Object.entries(overseasSites).map(
      ([orsId, { validFrom: _approval, ...site }]) => [orsId, site]
    )
  )
}

/**
 * @param {Record<string, OverseasSiteDetail>} overseasSites
 * @returns {Record<string, string | null>}
 */
function toOverseasSiteApprovals(overseasSites) {
  return Object.fromEntries(
    Object.entries(overseasSites).map(([orsId, { validFrom }]) => [
      orsId,
      validFrom?.toISOString() ?? null
    ])
  )
}
