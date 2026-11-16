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
 * @template {{ id: string } | { organisationNumber: string }} K
 * @param {K} key
 * @param {{ name: string; tradingName?: string; registrationType?: string }} org
 */
const mapOrganisation = (key, { name, tradingName, registrationType }) => ({
  ...key,
  name,
  ...(tradingName && { tradingName }),
  ...(registrationType && { registrationType })
})

/**
 * @param {PackagingRecyclingNote['accreditation']} accreditation
 */
const mapAccreditation = (accreditation) => {
  const mapped = {
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
    status: mapStatus(prn.status),
    issuedByOrganisation: mapOrganisation(
      { organisationNumber: prn.organisation.organisationNumber },
      prn.organisation
    ),
    issuedToOrganisation: mapOrganisation(
      { id: prn.issuedToOrganisation.id },
      prn.issuedToOrganisation
    ),
    accreditation: mapAccreditation(prn.accreditation),
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
