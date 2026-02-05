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
  CANCELLED: 'cancelled',
  DELETED: 'deleted',
  DISCARDED: 'discarded'
})

/**
 * Valid status transitions for PRNs
 * @type {Record<PrnStatus, PrnStatus[]>}
 */
export const PRN_STATUS_TRANSITIONS = Object.freeze({
  [PRN_STATUS.DRAFT]: [PRN_STATUS.AWAITING_AUTHORISATION, PRN_STATUS.DISCARDED],
  [PRN_STATUS.AWAITING_AUTHORISATION]: [
    PRN_STATUS.AWAITING_ACCEPTANCE,
    PRN_STATUS.DELETED
  ],
  [PRN_STATUS.AWAITING_ACCEPTANCE]: [PRN_STATUS.ACCEPTED, PRN_STATUS.REJECTED],
  [PRN_STATUS.ACCEPTED]: [],
  [PRN_STATUS.REJECTED]: [],
  [PRN_STATUS.CANCELLED]: [],
  [PRN_STATUS.DELETED]: [],
  [PRN_STATUS.DISCARDED]: []
})

/**
 * @typedef {{
 *   status: PrnStatus;
 *   updatedAt: Date;
 *   updatedBy: { id: string; name: string };
 * }} PrnStatusHistoryItem
 */

/**
 * @typedef {{
 *   id: string;
 *   schemaVersion: number;
 *   prnNumber?: string | null;
 *   organisationId: string;
 *   accreditationId: string;
 *   issuedToOrganisation: { id: string; name: string; tradingName?: string };
 *   tonnage: number;
 *   material: string;
 *   isExport: boolean;
 *   notes?: string;
 *   isDecemberWaste: boolean;
 *   accreditationYear: number;
 *   issuedAt: Date | null;
 *   issuedBy: { id: string; name: string; position: string } | null;
 *   status: {
 *     currentStatus: PrnStatus;
 *     history: PrnStatusHistoryItem[];
 *   };
 *   createdAt: Date;
 *   createdBy: { id: string; name: string };
 *   updatedAt: Date;
 *   updatedBy: { id: string; name: string } ;
 * }} PackagingRecyclingNote
 */
