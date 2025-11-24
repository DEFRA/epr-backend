/**
 * @import {OrganisationWithAccreditations, OrganisationUser, User} from './types.js'
 */

/**
 * Collates users from multiple sources and deduplicates by email
 *
 * @param {OrganisationWithAccreditations} organisation
 * @returns {OrganisationUser[]}
 */
export function collateUsers(organisation) {
  /** @type {Partial<User>[]} */
  const users = []

  if (organisation.submitterContactDetails) {
    users.push({
      fullName: organisation.submitterContactDetails.fullName,
      email: organisation.submitterContactDetails.email
    })
  }

  for (const reg of organisation.registrations || []) {
    for (const person of reg.approvedPersons || []) {
      users.push({
        fullName: person.fullName,
        email: person.email
      })
    }
  }

  for (const acc of organisation.accreditations || []) {
    for (const signatory of acc.prnIssuance?.signatories || []) {
      users.push({
        fullName: signatory.fullName,
        email: signatory.email
      })
    }
  }

  return deduplicateUsers(users)
}

/**
 * Deduplicates users by email address
 *
 * @param {Partial<User>[]} users
 * @returns {OrganisationUser[]}
 */
function deduplicateUsers(users) {
  const userMap = new Map()

  for (const user of users) {
    const key = user.email.toLowerCase()

    if (!userMap.has(key)) {
      userMap.set(key, {
        fullName: user.fullName,
        email: user.email,
        isInitialUser: true,
        roles: ['standardUser']
      })
    }
  }

  return Array.from(userMap.values())
}
