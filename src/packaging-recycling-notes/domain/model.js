/** @import { Material } from '#domain/organisations/model.js' */

/**
 * Status values for Packaging Recycling Notes (PRNs)
 * @typedef {typeof PRN_STATUS[keyof typeof PRN_STATUS]} PrnStatus
 */
export const PRN_STATUS = Object.freeze({
  DRAFT: 'draft',
  AWAITING_AUTHORISATION: 'awaiting_authorisation',
  AWAITING_ACCEPTANCE: 'awaiting_acceptance',
  ACCEPTED: 'accepted',
  AWAITING_CANCELLATION: 'awaiting_cancellation',
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
  [PRN_STATUS.AWAITING_ACCEPTANCE]: [
    PRN_STATUS.ACCEPTED,
    PRN_STATUS.AWAITING_CANCELLATION
  ],
  [PRN_STATUS.ACCEPTED]: [],
  [PRN_STATUS.AWAITING_CANCELLATION]: [PRN_STATUS.CANCELLED],
  [PRN_STATUS.CANCELLED]: [],
  [PRN_STATUS.DELETED]: [],
  [PRN_STATUS.DISCARDED]: []
})

/**
 * @typedef {{
 *   id: string;
 *   name: string;
 *   tradingName?: string;
 * }} IssuedToOrganisation
 */

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
 *   issuedToOrganisation: IssuedToOrganisation;
 *   tonnage: number;
 *   material: Material;
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
 *   updatedBy: { id: string; name: string } | null;
 * }} PackagingRecyclingNote
 */

/**
 * @typedef {{
 *   id: string;
 *   accreditationYear: number | null;
 *   createdAt: Date;
 *   isDecemberWaste: boolean;
 *   issuedToOrganisation: IssuedToOrganisation;
 *   material: string;
 *   notes: string | null;
 *   processToBeUsed: string;
 *   status: PrnStatus;
 *   tonnage: number;
 *   wasteProcessingType: string;
 * }} CreatePrnResponse
 */

/**
 * @typedef {CreatePrnResponse & {
 *   issuedAt: Date | null;
 *   issuedBy: { id: string; name: string; position: string } | null;
 *   prnNumber: string | null;
 * }} GetPrnResponse
 */
