/**
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} PackagingRecyclingNote
 * @typedef {import('#packaging-recycling-notes/domain/model.js').Actor} Actor
 */

/**
 * @param {Actor} actor
 * @returns {{ fullName?: string; jobTitle?: string }}
 */
const mapUserSummary = (actor) => ({
  ...(actor.name && { fullName: actor.name }),
  ...(actor.position && { jobTitle: actor.position })
})

/**
 * @param {PackagingRecyclingNote['status']} status
 */
const mapStatus = (status) => {
  const mapped = { currentStatus: status.currentStatus }

  if (status.issued) {
    mapped.authorisedBy = mapUserSummary(status.issued.by)
    mapped.authorisedAt = status.issued.at
  }

  if (status.accepted) {
    mapped.acceptedAt = status.accepted.at
  }

  if (status.rejected) {
    mapped.rejectedAt = status.rejected.at
  }

  if (status.cancelled) {
    mapped.cancelledAt = status.cancelled.at
  }

  return mapped
}

/**
 * @param {{ id: string; name: string; tradingName?: string; registrationType?: string }} org
 */
const mapOrganisation = (org) => {
  const mapped = { id: org.id, name: org.name }
  if (org.tradingName) {
    mapped.tradingName = org.tradingName
  }
  if (org.registrationType) {
    mapped.registrationType = org.registrationType
  }
  return mapped
}

/**
 * @param {PackagingRecyclingNote['accreditation']} accreditation
 * @param {string} accreditationId
 */
const mapAccreditation = (accreditation, accreditationId) => {
  const mapped = {
    id: accreditationId,
    accreditationNumber: accreditation.accreditationNumber,
    accreditationYear: accreditation.accreditationYear,
    material: accreditation.material,
    submittedToRegulator: accreditation.submittedToRegulator
  }

  if (accreditation.glassRecyclingProcess) {
    mapped.glassRecyclingProcess = accreditation.glassRecyclingProcess
  }

  if (accreditation.siteAddress) {
    mapped.siteAddress = accreditation.siteAddress
  }

  return mapped
}

/**
 * The database ids the external API states for a PRN's issuing organisation
 * and accreditation. A PRN does not store them.
 *
 * @typedef {{ organisationId: string, accreditationId: string }} ExternalPrnIds
 */

/**
 * Maps an internal PackagingRecyclingNote to the external API schema
 * defined in external-manage-prns.yaml.
 *
 * @param {PackagingRecyclingNote} prn
 * @param {ExternalPrnIds} ids
 */
export function mapToExternalPrn(prn, { organisationId, accreditationId }) {
  const mapped = {
    id: prn.id,
    status: mapStatus(prn.status),
    issuedByOrganisation: mapOrganisation({
      ...prn.organisation,
      id: organisationId
    }),
    issuedToOrganisation: mapOrganisation(prn.issuedToOrganisation),
    accreditation: mapAccreditation(prn.accreditation, accreditationId),
    isDecemberWaste: prn.isDecemberWaste,
    isExport: prn.isExport,
    obligationYear: prn.obligationYear,
    tonnageValue: prn.tonnage
  }

  if (prn.prnNumber) {
    mapped.prnNumber = prn.prnNumber
  }

  if (prn.notes) {
    mapped.issuerNotes = prn.notes
  }

  return mapped
}
