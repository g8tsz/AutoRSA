# AutoRSA

Desktop app (Electron) that provides a **task-based UI** around **[AutoRSA](https://github.com/NelsonDane/auto-rsa)** / `auto_rsa_bot` for **buy**, **sell**, and **holdings** across the brokerages that upstream supports.

## Requirements

- **Node.js** 18 or newer (includes `npm`)
- **Python 3.12+** and **pip** (required by the published `auto_rsa_bot` package)
- **Windows** is the primary target; other platforms may work with the same flow if Python and Node are available

## Get the code

```bash
git clone https://github.com/g8tsz/AutoRSA.git
cd AutoRSA
```

## 1) Install the UI dependencies

```bash
npm install
```

## 2) Install AutoRSA (Python) and Playwright

From the `python` folder, run the setup script (PowerShell on Windows):

```powershell
cd python
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\setup.ps1
```

This creates `python/venv`, installs `auto_rsa_bot` from `python/requirements.txt`, and runs `playwright install` for brokers that need it. On macOS or Linux, use your shell’s equivalent: create a venv, `pip install -r python/requirements.txt`, then `python -m playwright install`.

## 3) Configure credentials

1. Open **Settings** in the app (after you start it below).
2. Set **`.env` directory** to a **dedicated folder** where the CLI will run (this becomes the process working directory).
3. Put a file named **`.env`** in that folder. Start from `python/.env.example` and fill in the brokers you use. Full variable names and formats are in the [upstream AutoRSA README](https://github.com/NelsonDane/auto-rsa).
4. Set **path to** `auto_rsa_bot` to your venv’s executable, for example on Windows:  
   `python\venv\Scripts\auto_rsa_bot.exe` (use **Browse** in Settings if the name differs on your system).

## 4) Start the app (development)

From the **repository root** (same folder as `package.json`):

```bash
npm run dev
```

Wait until the terminal shows that the Vite dev server and Electron are starting. A window titled **AutoRSA Desktop** will open.

**Important:** Use **only that Electron window**. Do not rely on opening `http://localhost:5173` in Chrome or Edge; that page will not have the Electron **preload** bridge and the app will not work there.

**Production build of the UI (no dev server):**

```bash
npm run build
npm start
```

## How to use the UI

- **Tasks:** Create **groups** (left column) and **tasks** in the current group. Each task maps to one `auto_rsa_bot` run: **holdings**, **buy**, or **sell**, with broker lists and **dry run** as in the upstream docs.
- **Start / Stop:** **Start all** runs every task in the selected group in order. **Stop** cancels a batch and kills the running child process.
- **Settings:** Max log size, optional command **timeout** (kills a hung CLI), and paths for `.env` and `auto_rsa_bot`.
- The shell sets **`DANGER_MODE=true`** for subprocesses so the Python CLI does not block on a terminal “press Enter” step; use **dry run** and the in-app confirmation for live orders.

## Troubleshooting

- **Blank or wrong screen with `window.api`:** You are in a **browser** on port 5173, or the preload path failed. Use the **AutoRSA Desktop** window; check the terminal for a line like `[main] Preload file: ...` and that the file exists.
- **Port 5173 in use:** Free the port or change the dev server in `electron.vite.config.ts` (keep Electron and Vite in sync).
- **Python errors:** Install **3.12+** and re-run `python/setup.ps1` (or manual venv + `pip install -r python/requirements.txt`).

## Security and legal

This repository is a **user interface** only; trading and broker automation carry **financial and legal** risk. You are responsible for following your brokers’ terms of service. See the [AutoRSA project disclaimer](https://github.com/NelsonDane/auto-rsa).

## License

GPL-3.0. See `LICENSE` and [GNU GPL v3](https://www.gnu.org/licenses/gpl-3.0.html). The upstream `auto_rsa_bot` package is also GPL-3.0.
