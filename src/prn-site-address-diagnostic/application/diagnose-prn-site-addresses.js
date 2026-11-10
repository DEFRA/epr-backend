import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { accreditationsForRegistration } from '#domain/organisations/registration-utils.js'
import {
  toAccreditationEntry,
  toRegistrationEntry
} from '#organisation-read-model/repository/to-read-model.js'

/** @import { Organisation } from '#domain/organisations/model.js' */
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
 * @param {Organisation} organisation
 * @param {Registration} registration
 * @param {ReturnType<typeof readContext>} context
 */
const servedAccreditations = (organisation, registration, context) =>
  accreditationsForRegistration(registration, organisation).flatMap(
    (accreditation) => {
      const entry = toAccreditationEntry(accreditation, context)
      if (!entry) {
        return []
      }
      const [year, { accreditationNumber, status }] = entry
      return [
        { accreditation, year, accreditationNumber, status: status.current }
      ]
    }
  )

/**
 * The site the read model serves for a reprocessor registration, or null when
 * it serves no reprocessor registration for it.
 *
 * @param {Registration} registration
 * @param {Organisation} organisation
 * @param {ReturnType<typeof readContext>} context
 */
const servedReprocessorSite = (registration, organisation, context) => {
  const entry = toRegistrationEntry(registration, organisation, context)
  if (!entry) {
    return null
  }
  const [registrationNumber, served] = entry
  return served.wasteProcessingType === WASTE_PROCESSING_TYPE.REPROCESSOR
    ? { registrationNumber, address: served.site.address }
    : null
}

/** @param {string} today */
const readContext = (today) => ({
  onDrop: () => {},
  overseasSitesById: new Map(),
  today
})

/**
 * Compares the site a reprocessor PRN snapshots today (the accreditation's)
 * with the one the organisation read model serves (the registration's), over
 * every registration and accreditation the read model serves (PAE-2226).
 *
 * @param {Organisation[]} organisations
 * @param {string} today - ISO 8601 date
 * @returns {{ rows: SiteAddressRow[], summary: SiteAddressSummary }}
 */
export const diagnosePrnSiteAddresses = (organisations, today) => {
  const context = readContext(today)
  /** @type {SiteAddressRow[]} */
  const rows = []
  let checkedRegistrations = 0
  let checkedAccreditations = 0

  for (const organisation of organisations) {
    const identity = {
      orgId: organisation.orgId,
      testOrganisation: TEST_ORGANISATION_IDS.has(organisation.orgId)
    }

    for (const registration of organisation.registrations) {
      const served = servedReprocessorSite(registration, organisation, context)
      if (!served) {
        continue
      }
      checkedRegistrations++
      const { registrationNumber, address } = served

      if ('fullAddress' in address) {
        rows.push({
          finding: SITE_FINDING.FULL_ADDRESS_ONLY,
          ...identity,
          registrationNumber
        })
        continue
      }

      for (const {
        accreditation,
        ...accreditationKeys
      } of servedAccreditations(organisation, registration, context)) {
        checkedAccreditations++
        const finding = accreditationFinding(accreditation, address)
        if (finding) {
          rows.push({
            ...finding,
            ...identity,
            registrationNumber,
            ...accreditationKeys
          })
        }
      }
    }
  }

  return {
    rows,
    summary: summarise(
      rows,
      organisations.length,
      checkedRegistrations,
      checkedAccreditations
    )
  }
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
