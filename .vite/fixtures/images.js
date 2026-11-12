import { readFileSync } from 'node:fs'

const compose = readFileSync(new URL('./compose.yml', import.meta.url), 'utf8')

/** @type {Record<string, string>} */
export const images = Object.fromEntries(
  [...compose.matchAll(/^ {2}([\w-]+):\n {4}image: (\S+)$/gm)].map(
    ([, service, image]) => [service, image]
  )
)
