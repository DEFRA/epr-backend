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
 * Valid status transitions for PRNs
 * @type {Record<PrnStatus, PrnStatus[]>}
 */
export const PRN_STATUS_TRANSITIONS = Object.freeze({
  [PRN_STATUS.DRAFT]: [PRN_STATUS.AWAITING_AUTHORISATION, PRN_STATUS.CANCELLED],
  [PRN_STATUS.AWAITING_AUTHORISATION]: [
    PRN_STATUS.AWAITING_ACCEPTANCE,
    PRN_STATUS.CANCELLED
  ],
  [PRN_STATUS.AWAITING_ACCEPTANCE]: [PRN_STATUS.ACCEPTED, PRN_STATUS.REJECTED],
  [PRN_STATUS.ACCEPTED]: [],
  [PRN_STATUS.REJECTED]: [],
  [PRN_STATUS.CANCELLED]: []
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
 *   accreditationId?: string;
 *   issuedByOrganisation: string;
 *   issuedByRegistration: string;
 *   issuedToOrganisation: string;
 *   tonnage: number;
 *   material: string;
 *   nation: string;
 *   wasteProcessingType: string;
 *   isExport: boolean;
 *   isDecemberWaste?: boolean;
 *   issuerNotes?: string;
 *   authorisedAt?: Date;
 *   authorisedBy?: { name: string; position: string };
 *   status: {
 *     currentStatus: PrnStatus;
 *     history: PrnStatusHistoryItem[];
 *   };
 *   createdAt: Date;
 *   createdBy: string;
 *   updatedAt: Date;
 * }} PackagingRecyclingNote
 */
