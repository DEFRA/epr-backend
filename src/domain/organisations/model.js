/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import { OrganisationNumber } from '#shared/organisations/numbers.js' */
/** @import { BusinessTypeValue, NationValue, PartnershipType, RegulatorValue, StoredOrganisationStatus, UserRoles, WasteProcessingTypeValue } from '#shared/organisations/model.js' */

/**
 * @typedef {Registration | Accreditation} RegistrationOrAccreditation
 */

/**
 * @typedef {{
 *   line1?: string;
 *   line2?: string;
 *   town?: string;
 *   county?: string;
 *   country?: string;
 *   postcode?: string;
 *   region?: string;
 *   fullAddress?: string;
 * }} Address
 */

/**
 * @typedef {{
 *   name: string;
 *   tradingName?: string;
 *   companiesHouseNumber?: string;
 *   registeredAddress?: Address;
 *   address?: Address;
 * }} CompanyDetails
 */

/**
 * @typedef {{
 *   fullName: string;
 *   email: string;
 *   phone: string;
 *   role?: string;
 *   title?: string;
 * }} User
 */

/**
 * @typedef {{
 *   contactId?: string;
 *   fullName: string;
 *   email: string;
 *   roles: UserRoles[];
 * }} CollatedUser
 */

/**
 * @typedef {{
 *   orgId: string;
 *   orgName: string;
 *   linkedAt: string;
 *   linkedBy: {
 *     email: string
 *     id: string
 *   }
 * }} StoredLinkedDefraOrganisation
 */

/**
 * @typedef {{
 *   status: StoredOrganisationStatus;
 *   updatedAt: Date;
 *   updatedBy?: string;
 * }} StatusHistoryItem
 */

/**
 * @typedef {{
 *   name: string;
 *   type: 'company'|'individual';
 * }} Partner
 */

/**
 * @typedef {{
 *   type: PartnershipType;
 *   partners?: Partner[];
 * }} Partnership
 */

/**
 * @typedef {{
 *   id: string;
 *   accreditations: Accreditation[];
 *   businessType?: BusinessTypeValue;
 *   companyDetails: CompanyDetails;
 *   formSubmission: { id: string; time: Date };
 *   linkedDefraOrganisation?: StoredLinkedDefraOrganisation;
 *   managementContactDetails?: User;
 *   organisationNumber: OrganisationNumber;
 *   partnership?: Partnership;
 *   registrations: Registration[];
 *   reprocessingNations?: NationValue[];
 *   schemaVersion: number;
 *   status: StoredOrganisationStatus;
 *   statusHistory: StatusHistoryItem[];
 *   submittedToRegulator: RegulatorValue;
 *   submitterContactDetails: User;
 *   users: CollatedUser[];
 *   version: number;
 *   wasteProcessingTypes: WasteProcessingTypeValue[];
 * }} Organisation
 */
