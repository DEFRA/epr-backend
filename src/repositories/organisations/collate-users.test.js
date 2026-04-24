import { describe, expect, it } from 'vitest'
import { collateUsers } from './collate-users.js'
import { REG_ACC_STATUS, USER_ROLES } from '#domain/organisations/model.js'

describe('collateUsers', () => {
  const buildOrg = ({
    registrations = [],
    accreditations = [],
    users = [],
    submitterContactDetails = {
      fullName: 'Org Submitter',
      email: 'org-submitter@example.com'
    }
  } = {}) => ({
    statusHistory: [{ status: 'created', updatedAt: new Date() }],
    submitterContactDetails,
    users,
    registrations,
    accreditations
  })

  const buildRegistration = ({
    id = 'reg-1',
    status,
    submitterEmail = 'reg-submitter@example.com',
    approvedPersons = []
  }) => ({
    id,
    statusHistory: [{ status, updatedAt: new Date() }],
    submitterContactDetails: {
      fullName: 'Reg Submitter',
      email: submitterEmail
    },
    approvedPersons
  })

  const buildAccreditation = ({
    id = 'acc-1',
    status,
    submitterEmail = 'acc-submitter@example.com',
    signatories = []
  }) => ({
    id,
    statusHistory: [{ status, updatedAt: new Date() }],
    submitterContactDetails: {
      fullName: 'Acc Submitter',
      email: submitterEmail
    },
    prnIssuance: { signatories }
  })

  it('returns submitter and all approvedPersons for an approved registration', () => {
    const org = buildOrg({
      registrations: [
        buildRegistration({
          status: REG_ACC_STATUS.APPROVED,
          approvedPersons: [
            { email: 'ap-one@example.com', fullName: 'AP One' },
            { email: 'ap-two@example.com', fullName: 'AP Two' }
          ]
        })
      ]
    })

    const result = collateUsers(org)
    const emails = result.map((u) => u.email)

    expect(emails).toContain('reg-submitter@example.com')
    expect(emails).toContain('ap-one@example.com')
    expect(emails).toContain('ap-two@example.com')
    expect(
      result.find((u) => u.email === 'ap-one@example.com').roles
    ).toContain(USER_ROLES.INITIAL)
  })

  it('omits approvedPersons from a non-approved registration', () => {
    const org = buildOrg({
      registrations: [
        buildRegistration({
          status: REG_ACC_STATUS.CREATED,
          approvedPersons: [
            { email: 'pending@example.com', fullName: 'Pending AP' }
          ]
        })
      ]
    })

    const emails = collateUsers(org).map((u) => u.email)

    expect(emails).not.toContain('pending@example.com')
  })

  it('dedupes an approvedPerson appearing in multiple approved registrations', () => {
    const approvedPersons = [
      { email: 'shared@example.com', fullName: 'Shared AP' }
    ]
    const org = buildOrg({
      registrations: [
        buildRegistration({
          id: 'reg-1',
          status: REG_ACC_STATUS.APPROVED,
          approvedPersons
        }),
        buildRegistration({
          id: 'reg-2',
          status: REG_ACC_STATUS.APPROVED,
          approvedPersons
        })
      ]
    })

    const sharedCount = collateUsers(org).filter(
      (u) => u.email === 'shared@example.com'
    ).length

    expect(sharedCount).toBe(1)
  })

  it('returns submitter and signatories for an approved accreditation', () => {
    const org = buildOrg({
      accreditations: [
        buildAccreditation({
          status: REG_ACC_STATUS.APPROVED,
          signatories: [
            { email: 'signatory@example.com', fullName: 'Signatory' }
          ]
        })
      ]
    })

    const result = collateUsers(org)
    const emails = result.map((u) => u.email)

    expect(emails).toContain('acc-submitter@example.com')
    expect(emails).toContain('signatory@example.com')
    expect(
      result.find((u) => u.email === 'signatory@example.com').roles
    ).toContain(USER_ROLES.INITIAL)
  })

  it('omits the org-level submitter when it is absent', () => {
    const org = buildOrg()
    delete org.submitterContactDetails

    const emails = collateUsers(org).map((u) => u.email)

    expect(emails).not.toContain('org-submitter@example.com')
  })

  it('handles an org with no users field', () => {
    const org = buildOrg()
    delete org.users

    expect(() => collateUsers(org)).not.toThrow()
    expect(collateUsers(org)).toEqual([
      {
        fullName: 'Org Submitter',
        email: 'org-submitter@example.com',
        roles: [USER_ROLES.INITIAL, USER_ROLES.STANDARD]
      }
    ])
  })
})
