import { ROLES } from '#common/helpers/auth/constants.js'
import { STATUS } from './model.js'

const eligibleStatuses = [STATUS.APPROVED, STATUS.ACTIVE, STATUS.SUSPENDED]

export function deduplicateUsers(users) {
  return (
    users?.reduce(
      (prev, user) =>
        prev.find(({ email }) => user.email === email)
          ? prev
          : [
              ...prev,
              {
                fullName: user.fullName,
                email: user.email,
                isInitialUser: user.isInitialUser,
                roles: user.roles
              }
            ],
      []
    ) ?? []
  )
}

export function generateInitialUsers({
  accreditations,
  allowedUsers,
  registrations,
  submitterContactDetails
}) {
  return deduplicateUsers(
    [
      submitterContactDetails,
      ...(allowedUsers?.map((user) => user) ?? []),
      ...registrations.reduce(
        (
          prev,
          { approvedPersons, statusHistory: registrationStatusHistory }
        ) =>
          eligibleStatuses.includes(registrationStatusHistory.at(-1)?.status)
            ? [...prev, ...approvedPersons]
            : prev,
        []
      ),
      ...accreditations.reduce(
        (
          prev,
          { prnIssuance = {}, statusHistory: accreditationStatusHistory }
        ) =>
          eligibleStatuses.includes(accreditationStatusHistory.at(-1)?.status)
            ? [...prev, ...(prnIssuance.signatories ?? [])]
            : prev,
        []
      )
    ].map((user) => ({
      ...user,
      isInitialUser: true,
      roles: [ROLES.standardUser]
    }))
  )
}
