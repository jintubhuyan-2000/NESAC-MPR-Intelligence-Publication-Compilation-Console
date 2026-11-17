# NESAC MPR Intelligence Agent

AI-powered **Monthly Progress Report (MPR) Compilation System** for the **North Eastern Space Applications Centre (NESAC)**.

Consolidates Section IV and Section V entries from multiple monthly Word (`.docx`) documents—including content stored inside floating DrawingML/VML text boxes, tables, headers, and footers—into three authoritative categories:

1. **Research Papers**
2. **Book Chapters**
3. **Conference Proceedings/Seminars**
*(with `Review Required` as a temporary verification status for ambiguous entries)*

---

## Architecture

- **Frontend**: React 19, TypeScript, Tailwind CSS, Recharts, Lucide Icons
- **Backend**: Node.js, Express, TypeScript, SQLite (`better-sqlite3`), server-side Google Gemini SDK (`@google/genai`)
- **Local Windows Agent**: Python 3.10+, FastAPI, `python-docx`, `lxml`, `pandas`, `openpyxl` running on `http://127.0.0.1:8765`
- **Reports**: Institutional Word (`.docx`) and 8-sheet Excel (`.xlsx`) generators

---

## Quick Start (Cloud / Browser Mode)

1. Install Node.js 20+ dependencies:
   ```bash
   npm install
   ```
2. Configure `.env` from `.env.example` and provide `GEMINI_API_KEY` (only if using AI extraction; Local-Only Mode works offline without an API key).
3. Start the full-stack server on port `3000`:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000`. Use **MPR Document Manager** to upload `.docx` files or click **Load & Verify Test MPR Suite** to inspect OOXML extraction across paragraphs, tables, DrawingML text boxes, VML text boxes, headers/footers, and cross-document duplicates.

---

## Windows 10 / 11 Local Folder Setup (`W:\REKHA\17-11-2026\MPR`)

Because browsers and cloud servers cannot directly read local or mapped Windows drives (`W:\`), NESAC MPR Intelligence Agent uses a companion localhost Python agent.

1. Run the Windows setup script:
   ```bat
   scripts\setup_windows.bat
   ```
2. Start the Local Python Agent:
   ```bat
   scripts\start_local_agent.bat
   ```
   This starts `http://127.0.0.1:8765` with strict localhost CORS rules and requires the `X-NESAC-Local-Agent: nesac-mpr-v1` header.
3. In the web app's **MPR Document Manager**, verify **Local Python Agent** shows Online, enter `W:\REKHA\17-11-2026\MPR` (default), click **Scan Windows Folder**, and process documents incrementally. Temporary Word lock files (`~$*.docx`) are automatically ignored.

---

## Security & Data Governance

- `GEMINI_API_KEY` is strictly server-side (`process.env.GEMINI_API_KEY`) and never exposed to React/browser code.
- Entire `.docx` files are never uploaded to Gemini; only minimal extracted Section IV/V text lines are sent upon explicit user processing confirmation.
- **Local-Only Mode** (configurable in Settings) disables all external AI transmissions and uses deterministic local OOXML + regex/heuristic classification.
- Human review keeps a full audit trail of metadata edits, category changes, approvals, rejections, and author corrections in SQLite (`data/nesac_mpr.db`).
