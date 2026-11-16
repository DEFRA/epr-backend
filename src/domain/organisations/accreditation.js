/** @import {StoredAccreditationStatus, AppliedForMaterial, GlassRecyclingProcess, ReprocessingType, TonnageBand, User} from '#domain/organisations/model.js' */
/** @import {AccreditationNumber} from '#domain/organisations/numbers.js' */

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
 * @typedef {AccreditationBase & {
 *  accreditationNumber: AccreditationNumber;
 *  status: Extract<StoredAccreditationStatus, 'approved'|'suspended'>;
 *  validFrom: string;
 *  validTo: string
 * }} AccreditationApproved
 */

/**
 * A created or rejected accreditation has no validity dates (ADR-0044 rule 2).
 *
 * @typedef {AccreditationBase & {
 *  accreditationNumber: AccreditationNumber | null;
 *  status: Extract<StoredAccreditationStatus, 'created'|'rejected'>;
 *  validFrom?: undefined;
 *  validTo?: undefined
 * }} AccreditationUngranted
 */

/**
 * A cancelled accreditation keeps the window it held while it was live.
 *
 * @typedef {AccreditationBase & {
 *  accreditationNumber: AccreditationNumber | null;
 *  status: Extract<StoredAccreditationStatus, 'cancelled'>;
 *  validFrom?: string;
 *  validTo?: string
 * }} AccreditationCancelled
 */

/**
 * @typedef {AccreditationApproved | AccreditationUngranted | AccreditationCancelled} Accreditation
 */

/**
 * What deciding whether a date is accredited reads of an accreditation.
 *
 * @typedef {StatusHistory & Pick<AccreditationCancelled, 'validFrom' | 'validTo'>} AccreditationValidity
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
