/** @import {Accreditation, StatusHistoryOf} from '#domain/organisations/accreditation.js' */
/** @import {GlassRecyclingProcess, Material, RegistrationStatus, ReprocessingType, TimeScale, User, WastePermitType} from '#domain/organisations/model.js' */

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
 * A weight the site's permit or exemption authorises it to handle, declared
 * against the material the applicant applied for rather than a glass process.
 *
 * @typedef {{
 *  material: Material;
 *  authorisedWeightInTonnes: number;
 *  timeScale: TimeScale;
 * }} AuthorisedMaterial
 */

/**
 * @typedef {{
 *  reference: string;
 *  exemptionCode: string;
 *  materials: Material[];
 * }} WasteExemption
 */

/**
 * What authorises the site to handle the material: an environmental or
 * installation permit, identified by its number and the weights it authorises,
 * or a set of waste exemptions.
 *
 * @typedef {{
 *  type: WastePermitType;
 *  permitNumber?: string;
 *  exemptions?: WasteExemption[];
 *  authorisedMaterials?: AuthorisedMaterial[];
 * }} WasteManagementPermit
 */

/**
 * @typedef {{
 *  siteCapacityInTonnes: number;
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
 *  cbduNumber?: string;
 *  exportPorts?: string[];
 *  formSubmission: { id: string; time: Date };
 *  material: Material;
 *  glassRecyclingProcess?: GlassRecyclingProcess[];
 *  noticeAddress?: RegistrationAddress;
 *  orgName: string;
 *  plantEquipmentDetails?: string;
 *  site: RegistrationSite;
 *  submittedToRegulator: string;
 *  submitterContactDetails: User;
 *  suppliers: string;
 *  wasteManagementPermits?: WasteManagementPermit[];
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
