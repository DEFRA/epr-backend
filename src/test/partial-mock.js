/**
 * Wraps a partial test double so it satisfies the full type it stands in for,
 * while still type-checking the properties you do supply against that type.
 * Prefer this over an `unknown` cast for partial mocks: the target type is
 * inferred from the assignment, so misspelled or wrongly-typed properties are
 * still caught.
 *
 *   \@type {FormSubmissionsRepository}
 *   let repo
 *   repo = partialMock({ findAllOrganisations: vi.fn() })
 *
 * @template T
 * @param {Partial<NoInfer<T>>} value
 * @returns {T}
 */
export const partialMock = (value) => /** @type {T} */ (value)
