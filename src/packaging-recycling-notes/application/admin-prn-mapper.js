import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { getProcessCode } from '#packaging-recycling-notes/domain/get-process-code.js'

/**
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} PackagingRecyclingNote
 */

/**
 * @param {PackagingRecyclingNote} prn
 */
export const mapToAdminPrn = (prn) => ({
  id: prn.id,
  prnNumber: prn.prnNumber ?? null,
  status: prn.status.currentStatus,
  issuedToOrganisation: prn.issuedToOrganisation,
  tonnage: prn.tonnage,
  material: prn.accreditation.material,
  processToBeUsed: getProcessCode(prn.accreditation.material),
  isDecemberWaste: prn.isDecemberWaste,
  notes: prn.notes ?? null,
  issuedAt: prn.status.issued?.at ?? null,
  issuedBy: prn.status.issued?.by ?? null,
  accreditationNumber: prn.accreditation.accreditationNumber ?? null,
  accreditationYear: prn.accreditation.accreditationYear,
  submittedToRegulator: prn.accreditation.submittedToRegulator ?? null,
  wasteProcessingType: prn.isExport
    ? WASTE_PROCESSING_TYPE.EXPORTER
    : WASTE_PROCESSING_TYPE.REPROCESSOR,
  organisationName: prn.organisation.name,
  createdAt: prn.createdAt
})
