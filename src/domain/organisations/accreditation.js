/** @import {StoredAccreditationStatus, AppliedForMaterial, GlassRecyclingProcess, ReprocessingType, TonnageBand, User} from '#domain/organisations/model.js' */
/** @import {AccreditationNumber} from '#domain/organisations/numbers.js' */
/** @import {AccreditationStatus, StatusTimeline} from '#organisation-read-model/index.js' */

/**
 * `updatedAt` is a Date at rest (Joi `date()`, BSON Date).
 *
 * @template {string} S
 * @typedef {{
 *  status: S;
 *  updatedAt: Date | string;
 * }} StatusHistoryEntryOf
 */

/**
 * @typedef {StatusHistoryEntryOf<StoredAccreditationStatus>} StatusHistoryEntry
 */

/**
 * @template {string} S
 * @typedef {{
 *  statusHistory: StatusHistoryEntryOf<S>[];
 * }} StatusHistoryOf
 */

/**
 * @typedef {StatusHistoryOf<StoredAccreditationStatus>} StatusHistory
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
 *  tonnageBand: TonnageBand;
 * }} PrnIssuance
 */

/**
 * @typedef {{
 *  defraFormUploadedFileId: string;
 *  defraFormUserDownloadLink: string;
 *  s3Uri?: string;
 * }} FormFileUpload
 */

/**
 * @typedef {{ id: string } & StatusHistory & {
 *  formSubmission: { id: string; time: Date };
 *  glassRecyclingProcess?: GlassRecyclingProcess[] | null;
 *  material: AppliedForMaterial;
 *  orgName: string;
 *  orsFileUploads?: FormFileUpload[];
 *  prnIssuance: PrnIssuance;
 *  reprocessingType?: ReprocessingType;
 *  samplingInspectionPlanPart2FileUploads: FormFileUpload[];
 *  site?: AccreditationSite;
 *  submittedToRegulator: string;
 *  submitterContactDetails: User;
 *  wasteProcessingType: string;
 * }} AccreditationBase
 */

/**
 * A date in the only year REEX stores accreditations for, as YYYY-MM-DD.
 *
 * @typedef {`2026-${string}`} StoredAccreditationDate
 */

/**
 * @typedef {AccreditationBase & {
 *  accreditationNumber: AccreditationNumber;
 *  status: Extract<StoredAccreditationStatus, 'approved'|'suspended'>;
 *  validFrom: StoredAccreditationDate;
 *  validTo: StoredAccreditationDate
 * }} AccreditationApproved
 */

/**
 * @typedef {AccreditationBase & {
 *  accreditationNumber: AccreditationNumber | null;
 *  status: Extract<StoredAccreditationStatus, 'created'|'rejected'|'cancelled'>;
 *  validFrom?: StoredAccreditationDate;
 *  validTo?: StoredAccreditationDate
 * }} AccreditationOther
 */

/**
 * @typedef {AccreditationApproved | AccreditationOther} Accreditation
 */

/**
 * What deciding whether a date is accredited reads of an accreditation, stored
 * or held by the registration and accreditation service.
 *
 * @typedef {{
 *  timeline: StatusTimeline<AccreditationStatus>;
 *  validFrom?: string;
 *  validTo?: string
 * }} AccreditationValidity
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
