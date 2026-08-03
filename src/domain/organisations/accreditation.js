/** @import {AccreditationStatus, GlassRecyclingProcess, ReprocessingType, User} from '#domain/organisations/model.js' */

/**
 * `updatedAt` is a Date at rest (Joi `date()`, BSON Date), but
 * getStatusHistoryDateTimes normalises string inputs via `new Date(...)`, so the
 * consumer contract genuinely accepts either.
 *
 * @template {string} S
 * @typedef {{
 *  status: S;
 *  updatedAt: Date | string;
 * }} StatusHistoryEntryOf
 */

/**
 * @typedef {StatusHistoryEntryOf<AccreditationStatus>} StatusHistoryEntry
 */

/**
 * @template {string} S
 * @typedef {{
 *  statusHistory: StatusHistoryEntryOf<S>[];
 * }} StatusHistoryOf
 */

/**
 * @typedef {StatusHistoryOf<AccreditationStatus>} StatusHistory
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
 *  glassRecyclingProcess?: GlassRecyclingProcess[] | null;
 *  material: string;
 *  orsFileUploads?: object[];
 *  prnIssuance: PrnIssuance;
 *  reprocessingType?: ReprocessingType;
 *  site?: AccreditationSite;
 *  submittedToRegulator: string;
 *  submitterContactDetails: User;
 *  wasteProcessingType: string;
 * }} AccreditationBase
 */

/**
 * @typedef {AccreditationBase & {
 *  accreditationNumber: string;
 *  status: Extract<AccreditationStatus, 'approved'|'suspended'>;
 *  validFrom: string;
 *  validTo: string
 * }} AccreditationApproved
 */

/**
 * @typedef {AccreditationBase & {
 *  accreditationNumber?: string;
 *  status: Extract<AccreditationStatus, 'created'|'rejected'|'cancelled'>;
 *  validFrom?: string;
 *  validTo?: string
 * }} AccreditationOther
 */

/**
 * @typedef {AccreditationApproved | AccreditationOther} Accreditation
 */

/**
 * An accreditation as a validated update carries it. Status is optional, since
 * it is derived from statusHistory on read, and statusHistory does not come
 * from the caller.
 *
 * @typedef {Omit<AccreditationBase, 'statusHistory'> & {
 *  accreditationNumber?: string;
 *  status?: AccreditationStatus;
 *  validFrom?: string;
 *  validTo?: string;
 * }} AccreditationUpdate
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
