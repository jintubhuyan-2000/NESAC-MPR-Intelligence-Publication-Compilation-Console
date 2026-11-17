"""
NESAC MPR Intelligence Agent - Local Report Exporter (pandas + openpyxl + python-docx)
"""

import io
from typing import Any, Dict, List
import pandas as pd
from docx import Document as DocxDocument
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt, RGBColor


def build_local_excel_bytes(records: List[Dict[str, Any]], approved_only: bool = False) -> bytes:
    if approved_only:
        records = [r for r in records if r.get("review_status") == "approved"]

    df_all = pd.DataFrame(records) if records else pd.DataFrame(columns=[
        "id", "category", "title", "authors", "journal_name", "book_title",
        "conference_name", "publication_year", "doi", "isbn", "issn",
        "volume", "issue", "page_numbers", "presentation_type",
        "event_location", "event_date", "source_filename", "source_section",
        "review_status", "duplicate_status", "ai_confidence", "original_text"
    ])

    def filter_cat(cat: str) -> pd.DataFrame:
        if df_all.empty:
            return df_all.copy()
        return df_all[df_all["category"] == cat].copy()

    df_rp = filter_cat("Research Papers")
    df_bc = filter_cat("Book Chapters")
    df_conf = filter_cat("Conference Proceedings/Seminars")
    df_dup = df_all[df_all["duplicate_status"] != "unique"].copy() if not df_all.empty else df_all.copy()
    df_rev = df_all[(df_all["category"] == "Review Required") | (df_all["review_status"].isin(["pending", "flagged"]))].copy() if not df_all.empty else df_all.copy()

    # Author-wise summary
    author_rows: List[Dict[str, Any]] = []
    author_map: Dict[str, Dict[str, Any]] = {}
    for rec in records:
        raw_auth = str(rec.get("authors") or "").strip()
        if not raw_auth:
            continue
        for a in [x.strip() for x in raw_auth.split(",") if x.strip()]:
            if a not in author_map:
                author_map[a] = {"Author Name": a, "Total": 0, "Research Papers": 0, "Book Chapters": 0, "Conferences": 0}
            author_map[a]["Total"] += 1
            cat = rec.get("category")
            if cat == "Research Papers":
                author_map[a]["Research Papers"] += 1
            elif cat == "Book Chapters":
                author_map[a]["Book Chapters"] += 1
            elif cat == "Conference Proceedings/Seminars":
                author_map[a]["Conferences"] += 1
    author_rows = sorted(author_map.values(), key=lambda x: x["Total"], reverse=True)
    df_authors = pd.DataFrame(author_rows) if author_rows else pd.DataFrame(columns=["Author Name", "Total", "Research Papers", "Book Chapters", "Conferences"])

    df_summary = pd.DataFrame([
        {"Metric": "Export Mode", "Value": "Approved Only" if approved_only else "All Records"},
        {"Metric": "Total Exported Records", "Value": len(df_all)},
        {"Metric": "Research Papers", "Value": len(df_rp)},
        {"Metric": "Book Chapters", "Value": len(df_bc)},
        {"Metric": "Conferences and Seminars", "Value": len(df_conf)},
        {"Metric": "Possible Duplicates", "Value": len(df_dup)},
        {"Metric": "Review Required", "Value": len(df_rev)},
    ])

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df_all.to_excel(writer, sheet_name="All Records", index=False)
        df_rp.to_excel(writer, sheet_name="Research Papers", index=False)
        df_bc.to_excel(writer, sheet_name="Book Chapters", index=False)
        df_conf.to_excel(writer, sheet_name="Conferences and Seminars", index=False)
        df_authors.to_excel(writer, sheet_name="Author-wise", index=False)
        df_dup.to_excel(writer, sheet_name="Possible Duplicates", index=False)
        df_rev.to_excel(writer, sheet_name="Review Required", index=False)
        df_summary.to_excel(writer, sheet_name="Processing Summary", index=False)
    return buf.getvalue()


def build_local_docx_bytes(records: List[Dict[str, Any]], approved_only: bool = False) -> bytes:
    if approved_only:
        records = [r for r in records if r.get("review_status") == "approved"]

    doc = DocxDocument()
    title_p = doc.add_paragraph()
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title_p.add_run("NORTH EASTERN SPACE APPLICATIONS CENTRE (NESAC)\nConsolidated Monthly Progress Report")
    run.bold = True
    run.font.size = Pt(18)
    run.font.color.rgb = RGBColor(15, 41, 74)

    doc.add_page_break()
    doc.add_heading("1. Compilation Summary", level=1)
    doc.add_paragraph(f"Total Records Included: {len(records)} ({'Approved Only' if approved_only else 'All Records'})")

    sections = [
        ("2. Research Papers", [r for r in records if r.get("category") == "Research Papers"]),
        ("3. Book Chapters", [r for r in records if r.get("category") == "Book Chapters"]),
        ("4. Conference Proceedings / Seminars", [r for r in records if r.get("category") == "Conference Proceedings/Seminars"]),
    ]

    for heading, items in sections:
        doc.add_heading(heading, level=1)
        if not items:
            doc.add_paragraph("No records in this category.")
            continue
        for idx, rec in enumerate(items, start=1):
            p = doc.add_paragraph()
            r_num = p.add_run(f"{idx}. {rec.get('title') or '(Untitled)'}")
            r_num.bold = True
            if rec.get("authors"):
                doc.add_paragraph(f"Authors: {rec.get('authors')}")
            doc.add_paragraph(f"Original Text ({rec.get('source_filename', 'MPR')}): {rec.get('original_text', '')}")

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
