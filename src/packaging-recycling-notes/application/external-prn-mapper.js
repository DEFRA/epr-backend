/**
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} PackagingRecyclingNote
 * @typedef {import('#packaging-recycling-notes/domain/model.js').Actor} Actor
 */

/**
 * @param {Actor} actor
 * @returns {{ fullName: string; jobTitle?: string }}
 */
const mapUserSummary = (actor) => {
  const summary = { fullName: actor.name }
  if (actor.position) {
    summary.jobTitle = actor.position
  }
  return summary
}

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
 * @param {{ id: string; name: string; tradingName?: string }} org
 */
const mapOrganisation = (org) => {
  const mapped = { id: org.id, name: org.name }
  if (org.tradingName) {
    mapped.tradingName = org.tradingName
  }
  return mapped
}

/**
 * @param {PackagingRecyclingNote['accreditation']} accreditation
 */
const mapAccreditation = (accreditation) => {
  const mapped = {
    id: accreditation.id,
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
 * Maps an internal PackagingRecyclingNote to the external API schema
 * defined in external-manage-prns.yaml.
 *
 * @param {PackagingRecyclingNote} prn
 */
export function mapToExternalPrn(prn) {
  const mapped = {
    id: prn.id,
    prnNumber: prn.prnNumber,
    status: mapStatus(prn.status),
    issuedByOrganisation: mapOrganisation(prn.organisation),
    issuedToOrganisation: mapOrganisation(prn.issuedToOrganisation),
    accreditation: mapAccreditation(prn.accreditation),
    isDecemberWaste: prn.isDecemberWaste,
    isExport: prn.isExport,
    tonnageValue: prn.tonnage
  }

  if (prn.notes) {
    mapped.issuerNotes = prn.notes
  }

  return mapped
}
