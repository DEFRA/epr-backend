/**
 * @param {object} [overrides]
 * @param {string} [overrides.organisationId]
 * @param {Date} [overrides.createdAt]
 * @param {string} [overrides.userId]
 * @param {string} [overrides.email]
 * @param {string} [overrides.subCategory]
 * @param {string} [overrides.action]
 * @param {*} [overrides.id]
 * @param {string} [overrides.summaryLogId]
 */
export const buildSystemLog = ({
  organisationId,
  createdAt = new Date(),
  userId = 'user-001',
  email = 'user@email.com',
  subCategory = 'test-sub-category',
  action = 'test-action',
  id,
  summaryLogId
} = {}) => ({
  createdAt,
  createdBy: { id: userId, email, scope: [] },
  event: {
    category: 'test-category',
    subCategory,
    action
  },
  context: {
    ...(organisationId !== undefined && { organisationId }),
    ...(id !== undefined && { id }),
    ...(summaryLogId !== undefined && { summaryLogId })
  }
})
