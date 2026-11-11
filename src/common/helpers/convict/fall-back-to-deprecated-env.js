/**
 * @typedef {{ deprecated: string, replacement: string }} EnvRename
 */

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {EnvRename[]} renames
 * @returns {{ env: NodeJS.ProcessEnv, used: EnvRename[] }}
 */
export const fallBackToDeprecatedEnv = (env, renames) => {
  const used = renames.filter(
    ({ deprecated, replacement }) =>
      env[deprecated] !== undefined && env[replacement] === undefined
  )

  return {
    env: {
      ...Object.fromEntries(
        used.map(({ deprecated, replacement }) => [
          replacement,
          env[deprecated]
        ])
      ),
      ...env
    },
    used
  }
}
