import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const GITLEAKS_VERSION = '8.30.0'

/**
 * @param {string} platform
 * @param {string} arch
 * @returns {{ target: string, ext: string }}
 */
function resolvePlatform(platform, arch) {
  if (platform === 'darwin' && arch === 'arm64') {
    return { target: 'darwin_arm64', ext: 'tar.gz' }
  }
  if (platform === 'darwin' && arch === 'x64') {
    return { target: 'darwin_x64', ext: 'tar.gz' }
  }
  if (platform === 'linux' && arch === 'arm64') {
    return { target: 'linux_arm64', ext: 'tar.gz' }
  }
  if (platform === 'linux' && arch === 'x64') {
    return { target: 'linux_x64', ext: 'tar.gz' }
  }
  if (platform === 'linux' && arch === 'ia32') {
    return { target: 'linux_x32', ext: 'tar.gz' }
  }
  if (platform === 'win32' && arch === 'x64') {
    return { target: 'windows_x64', ext: 'zip' }
  }
  if (platform === 'win32' && arch === 'ia32') {
    return { target: 'windows_x32', ext: 'zip' }
  }
  throw new Error(`Unsupported platform/arch: ${platform}/${arch}`)
}

/**
 * @param {string[]} args
 * @returns {Promise<string>}
 */
function run(args) {
  return new Promise((resolve, reject) => {
    const [cmd, ...rest] = args
    const proc = spawn(cmd, rest, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    proc.stdout.on('data', (d) => (out += d))
    proc.on('close', (code) =>
      code === 0
        ? resolve(out.trim())
        : reject(new Error(`${cmd} exited ${code}`))
    )
    proc.on('error', reject)
  })
}

async function main() {
  if (process.env.GITHUB_ACTIONS) return

  const isWindows = process.platform === 'win32'
  const binDir = '.bin'
  const binName = isWindows ? 'gitleaks.exe' : 'gitleaks'
  const binPath = join(binDir, binName)

  async function currentVersion() {
    if (!existsSync(binPath)) return null
    try {
      const out = await run([binPath, 'version'])
      return out.replace(/^v/, '').trim()
    } catch {
      return null
    }
  }

  const existing = await currentVersion()
  if (existing === GITLEAKS_VERSION) {
    console.log(
      `gitleaks v${GITLEAKS_VERSION} already installed, skipping download`
    )
    return
  }

  const { target, ext } = resolvePlatform(process.platform, process.arch)
  const filename = `gitleaks_${GITLEAKS_VERSION}_${target}.${ext}`
  const url = `https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${filename}`
  const archivePath = join(binDir, filename)

  console.log(`Downloading gitleaks v${GITLEAKS_VERSION} for ${target}...`)

  await mkdir(binDir, { recursive: true })

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Failed to download ${url}: ${response.status} ${response.statusText}`
    )
  }

  const buffer = await response.arrayBuffer()
  await writeFile(archivePath, Buffer.from(buffer))

  if (ext === 'tar.gz') {
    await run(['tar', '-xzf', archivePath, '-C', binDir])
  } else {
    try {
      await run(['tar', '-xf', archivePath, '-C', binDir])
    } catch {
      await run([
        'powershell',
        '-Command',
        `Expand-Archive -Path "${archivePath}" -DestinationPath "${binDir}" -Force`
      ])
    }
  }

  await unlink(archivePath)

  if (!isWindows) {
    await chmod(binPath, 0o755)
  }

  console.log(`gitleaks v${GITLEAKS_VERSION} installed to ${binPath}`)
}

await main()
