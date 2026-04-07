const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const THRESHOLD = 0.5; //  mic sensitivity
const COOLDOWN = 2000; // Wait 2 seconds before allowing another trigger
const RETRY_DELAY = 3000; 
const SAMPLE_RATE = 48000;
const CHANNELS = 1;
const MIC_DEVICE = process.env.MIC_DEVICE || 'default';
const soxResolution = resolveSoxBinary();
if (!soxResolution.command) {
  console.error('SoX binary was not found in this project.');
  console.error('Expected one of these paths:');
  soxResolution.searched.forEach((candidate) => console.error(`- ${candidate}`));
  console.error('Put sox.exe in ./sox/sox.exe (recommended) or set SOX_PATH.');
  process.exit(1);
}
let lastTrigger = 0;
let recordingProcess = null;
let retryTimer = null;

console.log("Listening for claps...");

startRecorder();

function startRecorder() {
  if (recordingProcess) return;

  const args = [
    '-t', 'waveaudio',
    MIC_DEVICE,
    '--no-show-progress',
    '--rate', String(SAMPLE_RATE),
    '--channels', String(CHANNELS),
    '--encoding', 'signed-integer',
    '--bits', '16',
    '--type', 'raw',
    '-'
  ];

  console.log(
    `Starting SoX recorder (device: ${MIC_DEVICE}, cmd: ${soxResolution.command})...`
  );
  recordingProcess = spawn(soxResolution.command, args, {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  recordingProcess.stdout.on('data', handleAudioChunk);

  recordingProcess.stderr.on('data', (chunk) => {
    const message = chunk.toString().trim();
    if (message) {
      console.error(`Recorder Error: ${message}`);
    }
  });

  recordingProcess.on('error', (err) => {
    console.error('Recorder process failed to start:', err.message);
    if (err.code === 'ENOENT') {
      console.error('Configured SoX path was not found.');
      console.error(`Current SoX command: ${soxResolution.command}`);
      console.error('Put sox.exe in ./sox/sox.exe (recommended) or set SOX_PATH.');
    }
    scheduleRestart();
  });

  recordingProcess.on('close', (code) => {
    console.error(`Recorder exited with code ${code}.`);
    scheduleRestart();
  });
}

function scheduleRestart() {
  if (recordingProcess) {
    recordingProcess.removeAllListeners();
    recordingProcess = null;
  }
  if (retryTimer) return;

  console.log(`Retrying recorder in ${RETRY_DELAY / 1000}s...`);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    startRecorder();
  }, RETRY_DELAY);
}

function handleAudioChunk(data) {
  // 16-bit little-endian PCM peak detection in range [0, 1].
  let peak = 0;
  for (let i = 0; i + 1 < data.length; i += 2) {
    const sample = data.readInt16LE(i);
    const normalized = Math.abs(sample) / 32768;
    if (normalized > peak) peak = normalized;
  }

  if (peak > THRESHOLD && Date.now() - lastTrigger > COOLDOWN) {
    console.log(`Clap detected! (Peak: ${peak.toFixed(2)})`);
    openVSCode();
    lastTrigger = Date.now();
  }
}

function openVSCode() {
  // 'code' command works if VS Code is in your PATH
  exec('code', (err) => {
    if (err) console.error("Could not open VS Code. Is it in your PATH?");
  });
}

function shutdown() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (recordingProcess) {
    recordingProcess.kill();
    recordingProcess = null;
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

function resolveSoxBinary() {
  const envPath = process.env.SOX_PATH;
  const directCandidates = [
    envPath,
    path.join(process.cwd(), 'sox', 'sox.exe'),
    path.join(process.cwd(), 'sox.exe'),
    path.join(__dirname, 'sox', 'sox.exe'),
    path.join(__dirname, 'sox.exe'),
  ].filter(Boolean);

  const discoveredCandidates = [];
  const scanRoots = [process.cwd(), __dirname];
  for (const root of scanRoots) {
    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (!/^sox/i.test(entry.name)) continue;
        const soxFolder = path.join(root, entry.name);
        discoveredCandidates.push(path.join(soxFolder, 'sox.exe'));
        discoveredCandidates.push(path.join(soxFolder, 'sox', 'sox.exe'));

        // Support extracted Windows packages like ./sox/sox-14-4-2/sox.exe
        const nestedEntries = fs.readdirSync(soxFolder, { withFileTypes: true });
        for (const nested of nestedEntries) {
          if (!nested.isDirectory()) continue;
          const nestedFolder = path.join(soxFolder, nested.name);
          discoveredCandidates.push(path.join(nestedFolder, 'sox.exe'));
          discoveredCandidates.push(path.join(nestedFolder, 'sox', 'sox.exe'));
        }
      }
    } catch (err) {
      // Ignore unreadable roots and continue checking other locations.
    }
  }

  const candidates = [
    ...new Set([
      ...directCandidates,
      ...discoveredCandidates
    ])
  ];

  const local = candidates.find((candidate) => fs.existsSync(candidate));
  return { command: local || null, searched: candidates };
}