// audio-capture-napi: cross-platform audio capture using SoX (rec) on macOS
// and arecord (ALSA) on Linux. Replaces the original cpal-based native module.

import { type ChildProcess, spawn, spawnSync } from 'child_process'

let recordingProcess: ChildProcess | null = null
let availabilityCache: boolean | null = null

function commandExists(cmd: string): boolean {
  const result = spawnSync(cmd, ['--version'], {
    stdio: 'ignore',
    timeout: 3000,
  })
  return result.error === undefined
}

export function isNativeAudioAvailable(): boolean {
  if (availabilityCache !== null) {
    return availabilityCache
  }

  if (process.platform === 'win32') {
    availabilityCache = false
    return false
  }

  if (process.platform === 'darwin') {
    availabilityCache = commandExists('rec')
    return availabilityCache
  }

  if (process.platform === 'linux') {
    availabilityCache = commandExists('arecord') || commandExists('rec')
    return availabilityCache
  }

  availabilityCache = false
  return false
}

export function isNativeRecordingActive(): boolean {
  return recordingProcess !== null && !recordingProcess.killed
}

export function stopNativeRecording(): void {
  if (recordingProcess) {
    const proc = recordingProcess
    recordingProcess = null
    if (!proc.killed) {
      proc.kill('SIGTERM')
    }
  }
}

export function startNativeRecording(
  onData: (data: Buffer) => void,
  onEnd: () => void,
): boolean {
  if (isNativeRecordingActive()) {
    stopNativeRecording()
  }

  if (!isNativeAudioAvailable()) {
    return false
  }

  let child: ChildProcess

  if (
    process.platform === 'darwin' ||
    (process.platform === 'linux' && commandExists('rec'))
  ) {
    child = spawn(
      'rec',
      [
        '-q',
        '--buffer',
        '1024',
        '-t',
        'raw',
        '-r',
        '16000',
        '-e',
        'signed',
        '-b',
        '16',
        '-c',
        '1',
        '-',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    )
  } else if (process.platform === 'linux' && commandExists('arecord')) {
    child = spawn(
      'arecord',
      [
        '-f',
        'S16_LE',
        '-r',
        '16000',
        '-c',
        '1',
        '-t',
        'raw',
        '-q',
        '-',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    )
  } else {
    return false
  }

  recordingProcess = child

  child.stdout?.on('data', (chunk: Buffer) => {
    onData(chunk)
  })

  child.stderr?.on('data', () => {})

  child.on('close', () => {
    recordingProcess = null
    onEnd()
  })

  child.on('error', () => {
    recordingProcess = null
    onEnd()
  })

  return true
}
