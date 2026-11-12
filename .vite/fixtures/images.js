import { readFileSync } from 'node:fs'

const compose = readFileSync(new URL('./compose.yml', import.meta.url), 'utf8')

/** @type {Record<string, string>} */
export const images = Object.fromEntries(
  [...compose.matchAll(/^ {2}([\w-]+):\n {4}image: (\S+)$/gm)].map(
    ([, service, image]) => [service, image]
  )
)

/**
 * The tag of an image reference, without any digest: `mongo:7.0.28@sha256:...`
 * gives `7.0.28`.
 * @param {string} image
 */
export const imageTag = (image) => image.split('@')[0].split(':').at(-1)
