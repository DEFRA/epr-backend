import { REG_ACC_STATUS } from '#domain/organisations/model.js'

/** @import {RegAccStatus, User} from '#domain/organisations/model.js' */

/**
 * @typedef {{
 *  status: 'created'|'approved'|'suspended';
 *  updatedAt: string;
 * }} StatusHistoryEntry
 */

/**
 * @typedef {{
 *  statusHistory: StatusHistoryEntry[];
 * }} StatusHistory
 */

/**
 * @typedef {{
 *  line1: string;
 *  postcode: string;
 * }} AccreditationAddress
 */

/**
 * @typedef {{
 *  address: AccreditationAddress;
 * }} AccreditationSite
 */

/**
 * @typedef {{
 *  detailedExplanation: string;
 *  percentIncomeSpent: number;
 *  usageDescription: string;
 * }} PrnIncomeBusinessPlan
 */

/**
 * @typedef {{
 *  incomeBusinessPlan: PrnIncomeBusinessPlan[];
 *  signatories: User[];
 *  tonnageBand: string;
 * }} PrnIssuance
 */

/**
 * @typedef {{ id: string } & StatusHistory & {
 *  formSubmission: { id: string; time: Date };
 *  material: string;
 *  prnIssuance: PrnIssuance;
 *  site?: AccreditationSite;
 *  submittedToRegulator: string;
 *  submitterContactDetails: User;
 *  wasteProcessingType: string;
 * }} AccreditationBase
 */

/**
 * @typedef {AccreditationBase & {
 *  accreditationNumber: string;
 *  status: Extract<RegAccStatus, 'approved'|'suspended'>;
 *  validFrom: string;
 *  validTo: string
 * }} AccreditationApproved
 */

/**
 * @typedef {AccreditationBase & {
 *  accreditationNumber?: string;
 *  status: Extract<RegAccStatus, 'created'|'rejected'|'cancelled'>;
 *  validFrom?: string;
 *  validTo?: string
 * }} AccreditationOther
 */

/**
 * @typedef {AccreditationApproved | AccreditationOther} Accreditation
 */

const REGISTERED_ONLY_STATUSES = /** @type {Set<RegAccStatus>} */ (
  new Set([REG_ACC_STATUS.CREATED, REG_ACC_STATUS.REJECTED])
)

/**
 * Returns true when an accreditation has never reached an accredited state —
 * it is still 'created' or was 'rejected'. Such a registered-only entity holds
 * no waste balance: it never had a valid accreditation period to accrue
 * against. A 'cancelled' accreditation was once approved (cancelled is only
 * reachable via approved -> suspended -> cancelled) and so is not
 * registered-only — its historical balance is legitimate.
 *
 * @param {{ status?: string } | null | undefined} accreditation
 * @returns {boolean}
 */
export const isRegisteredOnlyAccreditation = (accreditation) =>
  REGISTERED_ONLY_STATUSES.has(
    /** @type {RegAccStatus} */ (accreditation?.status)
  )
