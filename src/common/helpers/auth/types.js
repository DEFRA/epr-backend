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
 * Note: currentRelationshipId and relationships may be undefined for users
 * who haven't been enrolled in the service (confirmed by Defra ID team)
 *
 * @typedef {{
 *   contactId: string
 *   email: string
 *   firstName: string
 *   lastName: string
 *   currentRelationshipId?: string
 *   relationships?: string[]
 *   iss: string
 *   aud: string
 *   exp: number
 *   iat: number
 *   nbf?: number
 * }} DefraIdTokenPayload
 */

/**
 * AWS Cognito access token payload
 *
 * Standard claims: iss, sub, exp, iat, jti, scope, auth_time
 * Cognito-specific: client_id, token_use, version,
 *
 * @typedef {{
 *   iss: string
 *   sub: string
 *   exp: number
 *   iat: number
 *   jti: string
 *   scope: string
 *   auth_time: number
 *   client_id: string
 *   token_use: 'access'
 *   version: number
 * }} CognitoAccessTokenPayload
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

/**
 * Authenticated user context passed through command messages (e.g. SQS)
 * for audit logging and traceability
 *
 * @typedef {{
 *   id: string
 *   email: string
 *   scope: string[]
 * }} CommandUser
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
