/**
 * @param {object} [overrides]
 * @param {string} [overrides.organisationId]
 * @param {Date} [overrides.createdAt]
 * @param {string} [overrides.email]
 * @param {string} [overrides.subCategory]
 * @param {*} [overrides.id]
 */
export const buildSystemLog = ({
  organisationId,
  createdAt = new Date(),
  email = 'user@email.com',
  subCategory = 'test-sub-category',
  id
} = {}) => ({
  createdAt,
  createdBy: { id: 'user-001', email, scope: [] },
  event: {
    category: 'test-category',
    subCategory,
    action: 'test-action'
  },
  context: {
    ...(organisationId !== undefined && { organisationId }),
    ...(id !== undefined && { id })
  }
})
