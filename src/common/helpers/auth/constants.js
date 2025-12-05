/**
 * @typedef {typeof ROLES[keyof typeof ROLES]} Roles
 */
// FIXME are these the same as USER_ROLES in src/domain/organisations/model.js?
export const ROLES = {
  serviceMaintainer: 'service_maintainer',
  standardUser: 'standard_user',
  inquirer: 'inquirer',
  linker: 'linker'
}
