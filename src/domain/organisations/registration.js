/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {GlassRecyclingProcess, Material, User} from '#domain/organisations/model.js' */

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
 * @typedef {{ id: string } & {
 *  accreditation?: Accreditation;
 *  accreditationId?: string;
 *  approvedPersons: User[]
 *  formSubmissionTime: Date;
 *  material: Material;
 *  glassRecyclingProcess?: GlassRecyclingProcess[];
 *  orgName: string;
 *  site: RegistrationSite;
 *  submittedToRegulator: string;
 *  submitterContactDetails: User;
 *  wasteProcessingType: string;
 *  overseasSites?: Record<string, {overseasSiteId: string}>;
 * }} RegistrationBase
 */

/**
 * @typedef {RegistrationBase & {
 *  registrationNumber: string;
 *  status: 'approved'|'suspended';
 *  validFrom: string;
 *  validTo: string;
 * }} RegistrationApproved
 */

/**
 * @typedef {RegistrationBase & {
 *  registrationNumber?: string;
 *  cbduNumber?: string;
 *  status: 'created'|'rejected'|'archived';
 *  validFrom?: string;
 *  validTo?: string
 * }} RegistrationOther
 */

/**
 * @typedef {RegistrationApproved | RegistrationOther} Registration
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
