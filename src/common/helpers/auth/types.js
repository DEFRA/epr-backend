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
 *   defraIdRelationshipId: string
 *   defraIdOrgId: string
 *   defraIdOrgName: string
 *   isCurrent: boolean
 * }} DefraIdRelationship
 */

/**
 * Authentication credentials for Entra ID (service maintainer) users
 *
 * @typedef {{
 *   id: string | undefined
 *   email: string
 *   issuer: string
 *   scope: string[]
 * }} EntraIdCredentials
 */

/**
 * Authentication credentials for Defra ID (standard user) users
 *
 * @typedef {{
 *   id: string
 *   email: string
 *   issuer: string
 *   scope: string[]
 *   currentRelationshipId: string
 *   linkedOrgId: string | undefined
 *   tokenPayload: DefraIdTokenPayload
 * }} DefraIdCredentials
 */

/**
 * Union type for all authentication credentials
 *
 * @typedef {EntraIdCredentials | DefraIdCredentials} AuthCredentials
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
