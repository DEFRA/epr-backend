/** @import {Accreditation, StatusHistoryOf} from '#domain/organisations/accreditation.js' */
/** @import {GlassRecyclingProcess, Material} from '#domain/materials.js' */
/** @import {RegistrationStatus, ReprocessingType, User} from '#domain/organisations/model.js' */

/**
 * @typedef {{
 *  line1?: string;
 *  line2?: string;
 *  town?: string;
 *  county?: string;
 *  country?: string;
 *  postcode?: string;
 *  region?: string;
 *  fullAddress?: string;
 * }} RegistrationAddress
 */

/**
 * @typedef {{
 *  capacity: number;
 *  material: string;
 *  siteCapacityTimescale: string;
 * }} SiteCapacity
 */

/**
 * @typedef {{
 *  address: RegistrationAddress;
 *  gridReference: string;
 *  siteCapacity: SiteCapacity[];
 * }} RegistrationSite
 */

/**
 * @typedef {{ id: string } & StatusHistoryOf<RegistrationStatus> & {
 *  accreditation: Accreditation | null;
 *  accreditationId?: string;
 *  applicationContactDetails: User;
 *  approvedPersons: User[]
 *  formSubmission: { id: string; time: Date };
 *  material: Material;
 *  glassRecyclingProcess?: GlassRecyclingProcess[];
 *  orgName: string;
 *  site: RegistrationSite;
 *  submittedToRegulator: string;
 *  submitterContactDetails: User;
 *  wasteProcessingType: string;
 *  reprocessingType?: ReprocessingType;
 *  overseasSites?: Record<string, {overseasSiteId: string}>;
 * }} RegistrationBase
 */

/**
 * @typedef {RegistrationBase & {
 *  registrationNumber: string;
 *  status: Extract<RegistrationStatus, 'approved'>;
 *  validFrom: string;
 *  validTo: string;
 * }} RegistrationApproved
 */

/**
 * @typedef {RegistrationBase & {
 *  registrationNumber?: string;
 *  cbduNumber?: string;
 *  status: Extract<RegistrationStatus, 'created'|'rejected'|'cancelled'>;
 *  validFrom?: string;
 *  validTo?: string
 * }} RegistrationOther
 */

/**
 * @typedef {RegistrationApproved | RegistrationOther} Registration
 */

/**
 * A registration that appears in regulator reports: approved, or cancelled
 * after approval. A cancelled registration was previously approved, so it
 * carries its registration number and validity dates.
 * @typedef {RegistrationBase & {
 *  registrationNumber: string;
 *  status: Extract<RegistrationStatus, 'approved'|'cancelled'>;
 *  validFrom: string;
 *  validTo: string;
 * }} ReportableRegistration
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
