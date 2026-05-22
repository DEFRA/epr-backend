/**
 * @param {object} [overrides]
 * @param {string} [overrides.organisationId]
 * @param {Date} [overrides.createdAt]
 * @param {string} [overrides.userId]
 * @param {string} [overrides.email]
 * @param {string} [overrides.subCategory]
 * @param {*} [overrides.id]
 */
export const buildSystemLog = ({
  organisationId,
  createdAt = new Date(),
  userId = 'user-001',
  email = 'user@email.com',
  subCategory = 'test-sub-category',
  id
} = {}) => ({
  createdAt,
  createdBy: { id: userId, email, scope: [] },
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
