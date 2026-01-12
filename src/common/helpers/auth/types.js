/**
 * Entra ID (Azure Active Directory) token payload
 *
 * Used for Admin UI authentication and service maintainer access
 *
 * @typedef {{
 *   id: string
 *   email?: string
 *   preferred_username?: string
 *   iss: string
 *   aud: string
 *   sub?: string
 *   oid?: string
 *   exp: number
 *   iat: number
 *   nbf?: number
 * }} EntraIdTokenPayload
 */

/**
 * Defra ID token payload
 *
 * Used for Frontend application authentication and organization-based access control
 *
 * @typedef {{
 *   contactId: string
 *   email: string
 *   firstName: string
 *   lastName: string
 *   currentRelationshipId: string
 *   relationships: string[]
 *   iss: string
 *   aud: string
 *   exp: number
 *   iat: number
 *   nbf?: number
 * }} DefraIdTokenPayload
 */

/**
 * Union type representing any valid token payload from either identity provider
 *
 * @typedef {EntraIdTokenPayload | DefraIdTokenPayload} TokenPayload
 */

/**
 * Parsed organization data extracted from Defra ID token relationships
 *
 * @typedef {{
 *   defraIdOrgId: string
 *   defraIdOrgName: string
 *   isCurrent: boolean
 * }} DefraIdRelationship
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
