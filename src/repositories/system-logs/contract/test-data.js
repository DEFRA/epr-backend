/**
 * @param {object} [overrides]
 * @param {string} [overrides.organisationId]
 * @param {string} [overrides.organisationNumber]
 * @param {Date} [overrides.createdAt]
 * @param {string} [overrides.userId]
 * @param {string} [overrides.email]
 * @param {string | null} [overrides.role]
 * @param {string} [overrides.subCategory]
 * @param {string} [overrides.action]
 * @param {*} [overrides.id]
 * @param {string} [overrides.summaryLogId]
 */
export const buildSystemLog = ({
  organisationId,
  organisationNumber,
  createdAt = new Date(),
  userId = 'user-001',
  email = 'user@email.com',
  role = null,
  subCategory = 'test-sub-category',
  action = 'test-action',
  id,
  summaryLogId
} = {}) => ({
  createdAt,
  createdBy: { id: userId, email, scope: [], role },
  event: {
    category: 'test-category',
    subCategory,
    action
  },
  context: {
    ...(organisationId !== undefined && { organisationId }),
    ...(organisationNumber !== undefined && { organisationNumber }),
    ...(id !== undefined && { id }),
    ...(summaryLogId !== undefined && { summaryLogId })
  }
})
