"""
NESAC MPR Intelligence Agent - Localhost Python Processing Server
Runs on Windows 10/11 at http://127.0.0.1:8765 to securely access local Windows folders
(e.g., W:\\REKHA\\17-11-2026\\MPR) without allowing cloud servers direct drive access.
"""

import hashlib
import os
import platform
from datetime import datetime
from typing import Any, Dict, List

import uvicorn
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from docx_xml_extractor import extract_docx_file
from report_exporter import build_local_docx_bytes, build_local_excel_bytes

DEFAULT_FOLDER = r"W:\REKHA\17-11-2026\MPR"
AGENT_VERSION = "1.0.0"

app = FastAPI(title="NESAC MPR Local Processing Agent", version=AGENT_VERSION)

# Explicit localhost & AI Studio preview CORS configuration
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"^https://ais-(dev|pre)-[a-z0-9-]+\.[a-z0-9.-]+\.run\.app$",
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-NESAC-Local-Agent", "Access-Control-Request-Private-Network"],
)


@app.middleware("http")
async def add_private_network_header(request: Any, call_next: Any) -> Any:
    response = await call_next(request)
    response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


class ScanRequest(BaseModel):
    folder_path: str = DEFAULT_FOLDER


class ExtractRequest(BaseModel):
    file_paths: List[str]


class ExportRequest(BaseModel):
    records: List[Dict[str, Any]]
    approved_only: bool = False


def verify_agent_header(x_nesac_local_agent: str | None) -> None:
    if x_nesac_local_agent != "nesac-mpr-v1":
        raise HTTPException(status_code=403, detail="Missing or invalid X-NESAC-Local-Agent header.")


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "online",
        "agent": "NESAC MPR Local Processing Agent",
        "version": AGENT_VERSION,
        "os": platform.platform(),
        "python": platform.python_version(),
        "default_folder": DEFAULT_FOLDER,
        "default_folder_exists": os.path.isdir(DEFAULT_FOLDER),
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


@app.post("/scan")
def scan_folder(
    req: ScanRequest,
    x_nesac_local_agent: str | None = Header(default=None),
) -> Dict[str, Any]:
    verify_agent_header(x_nesac_local_agent)
    folder = req.folder_path.strip() or DEFAULT_FOLDER

    if not os.path.exists(folder):
        raise HTTPException(status_code=404, detail=f"Folder does not exist on this machine: {folder}")
    if not os.path.isdir(folder):
        raise HTTPException(status_code=400, detail=f"Path is not a directory: {folder}")

    discovered: List[Dict[str, Any]] = []
    ignored_temp: List[str] = []

    for entry in sorted(os.listdir(folder)):
        full_path = os.path.join(folder, entry)
        if not os.path.isfile(full_path):
            continue
        if not entry.lower().endswith(".docx"):
            continue
        if entry.startswith("~$") or entry.startswith("."):
            ignored_temp.append(entry)
            continue

        stat = os.stat(full_path)
        sha = hashlib.sha256()
        with open(full_path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                sha.update(chunk)

        discovered.append({
            "filename": entry,
            "file_path": full_path,
            "file_size": stat.st_size,
            "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "file_hash": sha.hexdigest(),
        })

    return {
        "folder_path": folder,
        "files": discovered,
        "ignored_temporary_files": ignored_temp,
        "total_found": len(discovered),
    }


@app.post("/extract")
def extract_files(
    req: ExtractRequest,
    x_nesac_local_agent: str | None = Header(default=None),
) -> Dict[str, Any]:
    verify_agent_header(x_nesac_local_agent)
    results: List[Dict[str, Any]] = []
    for fp in req.file_paths:
        if not os.path.isfile(fp):
            results.append({
                "filename": os.path.basename(fp),
                "file_path": fp,
                "error": f"File not found: {fp}",
            })
            continue
        results.append(extract_docx_file(fp))
    return {"extracted": results}


@app.post("/export/xlsx")
def export_xlsx(
    req: ExportRequest,
    x_nesac_local_agent: str | None = Header(default=None),
) -> Response:
    verify_agent_header(x_nesac_local_agent)
    xlsx_bytes = build_local_excel_bytes(req.records, req.approved_only)
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="NESAC_MPR_Local_Report.xlsx"'},
    )


@app.post("/export/docx")
def export_docx(
    req: ExportRequest,
    x_nesac_local_agent: str | None = Header(default=None),
) -> Response:
    verify_agent_header(x_nesac_local_agent)
    docx_bytes = build_local_docx_bytes(req.records, req.approved_only)
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": 'attachment; filename="NESAC_MPR_Local_Report.docx"'},
    )


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8765)
