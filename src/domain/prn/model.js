/**
 * Status values for Packaging Recycling Notes (PRNs)
 * @typedef {typeof PRN_STATUS[keyof typeof PRN_STATUS]} PrnStatus
 */
export const PRN_STATUS = Object.freeze({
  DRAFT: 'draft',
  AWAITING_AUTHORISATION: 'awaiting_authorisation',
  AWAITING_ACCEPTANCE: 'awaiting_acceptance',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled'
})

/**
 * @typedef {{
 *   status: PrnStatus;
 *   updatedAt: Date;
 *   updatedBy?: string;
 * }} PrnStatusHistoryItem
 */

/**
 * @typedef {{
 *   id: string;
 *   prnNumber?: string;
 *   issuedByOrganisation: string;
 *   issuedByRegistration: string;
 *   issuedToOrganisation: string;
 *   tonnage: number;
 *   material: string;
 *   nation: string;
 *   wasteProcessingType: string;
 *   isExport: boolean;
 *   issuerNotes?: string;
 *   status: {
 *     currentStatus: PrnStatus;
 *     history: PrnStatusHistoryItem[];
 *   };
 *   createdAt: Date;
 *   createdBy: string;
 *   updatedAt: Date;
 * }} PackagingRecyclingNote
 */
