/** @import {AccreditationStatus, GlassRecyclingProcess, ReprocessingType, StatusHistoryEntryOf, StatusHistoryOf, User} from '#domain/organisations/model.js' */

/**
 * @typedef {StatusHistoryEntryOf<AccreditationStatus>} StatusHistoryEntry
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

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
