import { isTestOrganisation } from '#common/helpers/parse-test-organisations.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { accreditationsForRegistration } from '#domain/organisations/registration-utils.js'
import {
  byRegistrationAndYear,
  toAccreditationEntry,
  toRegistrationEntry
} from '#organisation-read-model/repository/to-read-model.js'

/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { ExternalAccreditation } from '#organisation-read-model/repository/to-read-model.js' */
/** @import { Registration } from '#domain/organisations/registration.js' */
/** @import { Accreditation } from '#domain/organisations/accreditation.js' */

export const SITE_FINDING = Object.freeze({
  FULL_ADDRESS_ONLY: 'fullAddressOnly',
  SITE_DIFFERS: 'siteDiffers',
  NO_ACCREDITATION_SITE: 'noAccreditationSite'
})

/**
 * @typedef {'line1' | 'postcode' | 'both'} SiteDifference
 *
 * @typedef {Object} SiteAddressRow
 * @property {typeof SITE_FINDING[keyof typeof SITE_FINDING]} finding
 * @property {number} orgId
 * @property {boolean} testOrganisation
 * @property {string} registrationNumber
 * @property {string} [accreditationNumber]
 * @property {string} [year]
 * @property {string} [status]
 * @property {SiteDifference} [differs]
 *
 * @typedef {Object} SiteAddressSummary
 * @property {number} scannedOrganisations
 * @property {number} checkedRegistrations
 * @property {number} fullAddressOnly
 * @property {number} checkedAccreditations
 * @property {number} matched
 * @property {number} siteDiffers
 * @property {number} siteDiffersLine1
 * @property {number} siteDiffersPostcode
 * @property {number} siteDiffersBoth
 * @property {number} noAccreditationSite
 */

/** @param {string} line1 */
const normaliseLine1 = (line1) =>
  line1.trim().replace(/\s+/g, ' ').toLowerCase()

/** @param {string} postcode */
const normalisePostcode = (postcode) =>
  postcode.replace(/\s/g, '').toUpperCase()

/**
 * @param {{ line1: string, postcode: string }} accreditationAddress
 * @param {{ line1: string, postcode: string }} registrationAddress
 * @returns {SiteDifference | null}
 */
const siteDifference = (accreditationAddress, registrationAddress) => {
  const line1 =
    normaliseLine1(accreditationAddress.line1) !==
    normaliseLine1(registrationAddress.line1)
  const postcode =
    normalisePostcode(accreditationAddress.postcode) !==
    normalisePostcode(registrationAddress.postcode)
  if (line1 && postcode) {
    return 'both'
  }
  if (line1) {
    return 'line1'
  }
  return postcode ? 'postcode' : null
}

/**
 * The finding for one accreditation, or null when its site matches.
 *
 * @param {Accreditation} accreditation
 * @param {{ line1: string, postcode: string }} registrationAddress
 * @returns {Pick<SiteAddressRow, 'finding' | 'differs'> | null}
 */
const accreditationFinding = (accreditation, registrationAddress) => {
  const address = accreditation.site?.address
  if (!address) {
    return { finding: SITE_FINDING.NO_ACCREDITATION_SITE }
  }
  const differs = siteDifference(address, registrationAddress)
  return differs ? { finding: SITE_FINDING.SITE_DIFFERS, differs } : null
}

/**
 * The registration's stored accreditations the read model serves, each in the
 * year it serves it. One an external accreditation replaces is not served.
 *
 * @param {Organisation} organisation
 * @param {Registration} registration
 * @param {Record<string, { accreditationNumber: string }>} served - the served registration's accreditations
 * @param {ReturnType<typeof readContext>} context
 */
const servedAccreditations = (organisation, registration, served, context) =>
  accreditationsForRegistration(registration, organisation).flatMap(
    (accreditation) => {
      const entry = toAccreditationEntry(accreditation, context)
      if (!entry) {
        return []
      }
      const [year, { accreditationNumber, status }] = entry
      return served[year]?.accreditationNumber === accreditationNumber
        ? [{ accreditation, year, accreditationNumber, status: status.current }]
        : []
    }
  )

/**
 * The reprocessor registration the read model serves, or null when it serves
 * none for this stored registration.
 *
 * @param {Registration} registration
 * @param {Organisation} organisation
 * @param {ReturnType<typeof readContext>} context
 */
const servedReprocessor = (registration, organisation, context) => {
  const entry = toRegistrationEntry(
    registration,
    organisation,
    context,
    context.externalByRegistration
  )
  if (!entry) {
    return null
  }
  const [registrationNumber, served] = entry
  return served.wasteProcessingType === WASTE_PROCESSING_TYPE.REPROCESSOR
    ? {
        registrationNumber,
        address: served.site.address,
        accreditations: served.accreditations
      }
    : null
}

/**
 * @param {ExternalAccreditation[]} externalAccreditations
 * @param {string} today
 */
const readContext = (externalAccreditations, today) => ({
  onDrop: () => {},
  overseasSitesById: new Map(),
  today,
  externalByRegistration: byRegistrationAndYear(externalAccreditations)
})

/**
 * Compares the site a reprocessor PRN snapshots today (the accreditation's)
 * with the one the organisation read model serves (the registration's), over
 * every registration and stored accreditation the read model serves, with the
 * external accreditations applied (PAE-2226).
 *
 * @param {Organisation[]} organisations
 * @param {ExternalAccreditation[]} externalAccreditations
 * @param {string} today - ISO 8601 date
 * @returns {{ rows: SiteAddressRow[], summary: SiteAddressSummary }}
 */
export const diagnosePrnSiteAddresses = (
  organisations,
  externalAccreditations,
  today
) => {
  const context = readContext(externalAccreditations, today)
  const checked = organisations.flatMap((organisation) =>
    organisation.registrations.flatMap((registration) =>
      checkRegistration(organisation, registration, context)
    )
  )
  const rows = checked.flatMap((registration) => registration.rows)

  return {
    rows,
    summary: summarise(
      rows,
      organisations.length,
      checked.length,
      checked.reduce((total, { accreditations }) => total + accreditations, 0)
    )
  }
}

/**
 * One served reprocessor registration's findings and how many of its
 * accreditations were compared; none when the read model serves no
 * reprocessor registration for it.
 *
 * @param {Organisation} organisation
 * @param {Registration} registration
 * @param {ReturnType<typeof readContext>} context
 * @returns {{ rows: SiteAddressRow[], accreditations: number }[]}
 */
const checkRegistration = (organisation, registration, context) => {
  const served = servedReprocessor(registration, organisation, context)
  if (!served) {
    return []
  }
  const { registrationNumber, address, accreditations } = served
  const identity = {
    orgId: organisation.orgId,
    testOrganisation: isTestOrganisation(organisation),
    registrationNumber
  }

  if ('fullAddress' in address) {
    return [
      {
        rows: [{ finding: SITE_FINDING.FULL_ADDRESS_ONLY, ...identity }],
        accreditations: 0
      }
    ]
  }

  const held = servedAccreditations(
    organisation,
    registration,
    accreditations,
    context
  )
  return [
    {
      rows: held.flatMap(({ accreditation, ...accreditationKeys }) => {
        const finding = accreditationFinding(accreditation, address)
        return finding
          ? [{ ...finding, ...identity, ...accreditationKeys }]
          : []
      }),
      accreditations: held.length
    }
  ]
}

/**
 * @param {SiteAddressRow[]} rows
 * @param {number} scannedOrganisations
 * @param {number} checkedRegistrations
 * @param {number} checkedAccreditations
 * @returns {SiteAddressSummary}
 */
const summarise = (
  rows,
  scannedOrganisations,
  checkedRegistrations,
  checkedAccreditations
) => {
  /** @param {SiteAddressRow['finding']} finding */
  const count = (finding) =>
    rows.filter((row) => row.finding === finding).length
  /** @param {SiteDifference} differs */
  const differing = (differs) =>
    rows.filter((row) => row.differs === differs).length
  const siteDiffers = count(SITE_FINDING.SITE_DIFFERS)
  const noAccreditationSite = count(SITE_FINDING.NO_ACCREDITATION_SITE)

  return {
    scannedOrganisations,
    checkedRegistrations,
    fullAddressOnly: count(SITE_FINDING.FULL_ADDRESS_ONLY),
    checkedAccreditations,
    matched: checkedAccreditations - siteDiffers - noAccreditationSite,
    siteDiffers,
    siteDiffersLine1: differing('line1'),
    siteDiffersPostcode: differing('postcode'),
    siteDiffersBoth: differing('both'),
    noAccreditationSite
  }
}
