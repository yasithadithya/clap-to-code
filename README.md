# Clap to Code

A small Node.js utility that listens to your microphone for a clap and opens Visual Studio Code when a clap is detected.

## Requirements

- Windows
- Node.js 18+
- Visual Studio Code with the `code` CLI available in PATH
- SoX for Windows (`sox.exe`)

## Project Structure

- `index.js` - Clap detector and VS Code launcher
- `sox/` - Place SoX binaries here (this project already includes a SoX folder)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Make sure SoX is available to the app.

The app checks these locations automatically:

- `SOX_PATH` environment variable (highest priority)
- `./sox/sox.exe`
- `./sox.exe`
- Nested folders such as `./sox/sox-14-4-2/sox.exe`

Optional (PowerShell) to set a custom SoX path for the current terminal:

```powershell
$env:SOX_PATH = "D:\path\to\sox.exe"
```

3. Optional: choose a microphone device (default is `default`):

```powershell
$env:MIC_DEVICE = "default"
```

## Run

```bash
node index.js
```

You should see: `Listening for claps...`

When a clap is detected, the app runs the `code` command.

## Config Values

In `index.js`:

- `THRESHOLD` - Clap sensitivity (lower = more sensitive)
- `COOLDOWN` - Delay between triggers in milliseconds
- `RETRY_DELAY` - Delay before restarting recorder after failure

## Notes

- If VS Code does not open, ensure the `code` command is installed in PATH.
- If recording fails, verify your microphone and SoX path.
- The app retries recorder startup automatically when SoX exits.
