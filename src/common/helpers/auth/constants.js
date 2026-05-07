/**
 * @typedef {typeof ROLES[keyof typeof ROLES]} Roles
 */
export const ROLES = {
  serviceMaintainer: 'service_maintainer',
  standardUser: 'standard_user',
  inquirer: 'inquirer',
  linker: 'linker'
}

/**
 * @typedef {typeof SCOPES[keyof typeof SCOPES]} Scopes
 */
export const SCOPES = {
  adminRead: 'admin.read',
  adminWrite: 'admin.write',
  adminDlqPurge: 'admin.dlq.purge'
}
