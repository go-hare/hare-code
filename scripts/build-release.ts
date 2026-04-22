import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { chmodSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { unzipSync, zipSync } from 'fflate'
import packageJson from '../package.json' with { type: 'json' }
import { getMacroDefines, DEFAULT_BUILD_FEATURES } from './defines.ts'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  TARGETS,
  getArchiveName,
  getBinaryBaseName,
  getExecutableFileName,
  getTargetInfoByCompileTarget,
} = require('./release-assets.cjs') as typeof import('./release-assets.cjs')

const ROOT = process.cwd()
const RELEASE_DIR = join(ROOT, 'release-assets')
const BUN_CACHE_DIR = join(ROOT, '.cache', 'bun-targets')
const BINARY_BASE_NAME = getBinaryBaseName(packageJson)
const BUN_RELEASE_VERSION = Bun.version

function parseArgs() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const help = args.includes('--help') || args.includes('-h')
  const targetsArg = args.find(arg => arg.startsWith('--targets='))
  const selectedTargets = targetsArg
    ? targetsArg
        .slice('--targets='.length)
        .split(',')
        .map(target => target.trim())
        .filter(Boolean)
    : TARGETS.map(target => target.compileTarget)
  return { dryRun, help, selectedTargets }
}

function usage() {
  console.log(`Usage: bun run scripts/build-release.ts [--dry-run] [--targets=target1,target2]

Targets:
${TARGETS.map(target => `  - ${target.compileTarget}`).join('\n')}
`)
}

function resolveTargets(targets: string[]) {
  return targets.map(target => {
    const info = getTargetInfoByCompileTarget(target)
    if (!info) {
      throw new Error(`Unknown compile target: ${target}`)
    }
    return info
  })
}

function getFeatureList() {
  const envFeatures = Object.keys(process.env)
    .filter(key => key.startsWith('FEATURE_'))
    .map(key => key.replace('FEATURE_', ''))
  return [...new Set([...DEFAULT_BUILD_FEATURES, ...envFeatures])]
}

async function collectFiles(baseDir: string): Promise<string[]> {
  const entries = await readdir(baseDir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(baseDir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)))
    } else if (entry.isFile()) {
      files.push(fullPath)
    }
  }
  return files
}

async function createZipArchive(stageDir: string, archivePath: string) {
  const files = await collectFiles(stageDir)
  const archiveEntries: Record<string, Uint8Array> = {}
  for (const file of files) {
    const relativePath = relative(stageDir, file).replace(/\\/g, '/')
    archiveEntries[relativePath] = new Uint8Array(await readFile(file))
  }
  const zipped = zipSync(archiveEntries, { level: 9 })
  await writeFile(archivePath, Buffer.from(zipped))
}

async function createTarArchive(stageDir: string, archivePath: string) {
  const result = spawnSync('tar', ['-czf', archivePath, '-C', stageDir, '.'], {
    cwd: ROOT,
    stdio: 'pipe',
    windowsHide: true,
  })
  if (result.status !== 0) {
    throw new Error(result.stderr.toString().trim() || 'tar archive creation failed')
  }
}

function getTargetExecutableName(targetInfo: (typeof TARGETS)[number]) {
  return targetInfo.platform === 'win32' ? 'bun.exe' : 'bun'
}

function getBunAssetUrl(targetInfo: (typeof TARGETS)[number]) {
  const assetTarget = targetInfo.compileTarget.replace(/arm64/g, 'aarch64')
  return `https://github.com/oven-sh/bun/releases/download/bun-v${BUN_RELEASE_VERSION}/${assetTarget}.zip`
}

async function downloadTargetBunArchive(
  targetInfo: (typeof TARGETS)[number],
  archivePath: string,
) {
  const url = getBunAssetUrl(targetInfo)
  console.log(`[release] Downloading ${targetInfo.compileTarget} runtime from ${url}`)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Failed to download Bun runtime for ${targetInfo.compileTarget}: ${response.status} ${response.statusText}`,
    )
  }

  const archiveBytes = new Uint8Array(await response.arrayBuffer())
  await writeFile(archivePath, archiveBytes)
}

async function ensureTargetBunExecutable(targetInfo: (typeof TARGETS)[number]) {
  const cacheDir = join(BUN_CACHE_DIR, `bun-v${BUN_RELEASE_VERSION}`, targetInfo.id)
  const executablePath = join(cacheDir, getTargetExecutableName(targetInfo))
  if (existsSync(executablePath)) {
    return executablePath
  }

  await mkdir(cacheDir, { recursive: true })
  const archivePath = join(cacheDir, `${targetInfo.compileTarget}.zip`)
  if (!(existsSync(archivePath) && (await stat(archivePath)).size > 0)) {
    await downloadTargetBunArchive(targetInfo, archivePath)
  }

  const archiveEntries = unzipSync(new Uint8Array(await readFile(archivePath)))
  const executableEntry = Object.entries(archiveEntries).find(([entryName]) => {
    const normalizedName = entryName.replace(/\\/g, '/')
    return basename(normalizedName) === getTargetExecutableName(targetInfo)
  })

  if (!executableEntry) {
    throw new Error(
      `Unable to locate ${getTargetExecutableName(targetInfo)} in ${archivePath}`,
    )
  }

  await writeFile(executablePath, executableEntry[1])
  if (targetInfo.platform !== 'win32') {
    chmodSync(executablePath, 0o755)
  }
  return executablePath
}

async function buildTarget(targetInfo: (typeof TARGETS)[number], features: string[]) {
  const stageDir = await mkdtemp(join(tmpdir(), `${BINARY_BASE_NAME}-${targetInfo.id}-`))
  const executableName = getExecutableFileName(BINARY_BASE_NAME, targetInfo)
  const executableOutfile = join(stageDir, executableName)
  const archiveName = getArchiveName(BINARY_BASE_NAME, targetInfo)
  const archivePath = join(RELEASE_DIR, archiveName)

  const vendorAudioSource = join(
    ROOT,
    'vendor',
    'audio-capture',
    targetInfo.audioCaptureDir,
    'audio-capture.node',
  )

  if (!existsSync(vendorAudioSource)) {
    throw new Error(`Missing audio capture binary for ${targetInfo.id}: ${vendorAudioSource}`)
  }

  console.log(`[release] Building ${targetInfo.compileTarget} -> ${archiveName}`)
  const executablePath = await ensureTargetBunExecutable(targetInfo)

  const result = await Bun.build({
    entrypoints: ['src/entrypoints/cli.tsx'],
    compile: {
      target: targetInfo.compileTarget,
      executablePath,
      outfile: executableOutfile,
    },
    define: getMacroDefines(),
    features,
  })

  if (!result.success) {
    console.error(`[release] Build failed for ${targetInfo.compileTarget}`)
    for (const log of result.logs) {
      console.error(log)
    }
    throw new Error(`Compile failed for ${targetInfo.compileTarget}`)
  }

  await mkdir(join(stageDir, 'vendor', 'audio-capture', targetInfo.audioCaptureDir), {
    recursive: true,
  })
  await cp(
    vendorAudioSource,
    join(stageDir, 'vendor', 'audio-capture', targetInfo.audioCaptureDir, 'audio-capture.node'),
  )

  const rgBinaryName = targetInfo.platform === 'win32' ? 'rg.exe' : 'rg'
  const rgDirName = `${targetInfo.arch}-${targetInfo.platform}`
  const rgSource = join(ROOT, 'src', 'utils', 'vendor', 'ripgrep', rgDirName, rgBinaryName)
  if (existsSync(rgSource)) {
    await mkdir(join(stageDir, 'vendor', 'ripgrep', rgDirName), { recursive: true })
    await cp(rgSource, join(stageDir, 'vendor', 'ripgrep', rgDirName, rgBinaryName))
    if (targetInfo.platform !== 'win32') {
      chmodSync(join(stageDir, 'vendor', 'ripgrep', rgDirName, rgBinaryName), 0o755)
    }
  }

  const manifest = {
    name: packageJson.name,
    version: packageJson.version,
    target: targetInfo.compileTarget,
    executable: executableName,
    archive: archiveName,
  }
  await writeFile(join(stageDir, 'release-manifest.json'), JSON.stringify(manifest, null, 2))
  if (targetInfo.platform !== 'win32') {
    chmodSync(executableOutfile, 0o755)
  }

  if (targetInfo.archiveExt === 'zip') {
    await createZipArchive(stageDir, archivePath)
  } else {
    await createTarArchive(stageDir, archivePath)
  }

  console.log(`[release] Wrote ${archivePath}`)
  await rm(stageDir, { recursive: true, force: true })
}

async function main() {
  const { dryRun, help, selectedTargets } = parseArgs()
  if (help) {
    usage()
    return
  }

  const targets = resolveTargets(selectedTargets)
  const features = getFeatureList()

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          releaseDir: RELEASE_DIR,
          binaryBaseName: BINARY_BASE_NAME,
          targets: targets.map(target => ({
            compileTarget: target.compileTarget,
            archiveName: getArchiveName(BINARY_BASE_NAME, target),
            executable: getExecutableFileName(BINARY_BASE_NAME, target),
          })),
          features,
        },
        null,
        2,
      ),
    )
    return
  }

  await rm(RELEASE_DIR, { recursive: true, force: true })
  await mkdir(RELEASE_DIR, { recursive: true })

  for (const target of targets) {
    await buildTarget(target, features)
  }
}

await main()
