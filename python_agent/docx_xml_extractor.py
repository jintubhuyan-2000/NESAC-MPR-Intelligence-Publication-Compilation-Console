"""
NESAC MPR Intelligence Agent - OOXML/XML DOCX Extraction Engine (Python + lxml)
Extracts normal paragraphs, tables, DrawingML text boxes, VML text boxes,
headers, and footers in original document order while deduplicating mc:AlternateContent.
"""

import hashlib
import os
import re
import zipfile
from typing import Any, Dict, List, Optional, Tuple

from docx import Document as DocxDocument  # verifies standard python-docx compatibility
from lxml import etree

NAMESPACES = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    "wps": "http://schemas.microsoft.com/office/word/2010/wordprocessingShape",
    "v": "urn:schemas-microsoft-com:vml",
}

W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
MC_NS = "{http://schemas.openxmlformats.org/markup-compatibility/2006}"
WPS_NS = "{http://schemas.microsoft.com/office/word/2010/wordprocessingShape}"
V_NS = "{urn:schemas-microsoft-com:vml}"


def normalize_heading_text(text: str) -> str:
    clean = text.lower().replace("\u2013", "-").replace("\u2014", "-")
    clean = re.sub(r"[^a-z0-9/\s&-]", " ", clean)
    return re.sub(r"\s+", " ", clean).strip()


def classify_heading(text: str) -> Tuple[bool, str]:
    clean = normalize_heading_text(text)
    if not clean or len(clean) > 160:
        return False, "OTHER"

    sec_iv_re = re.compile(
        r"^(?:section\s*)?(?:iv|4)\b[\s.:)-]*(?:.*?(?:conferences?|workshops?|seminars?|exhibitions?|symposi(?:a|ums?)))",
        re.IGNORECASE,
    )
    if sec_iv_re.match(clean):
        return True, "SECTION_IV"

    sec_v_re = re.compile(
        r"^(?:section\s*)?(?:v|5)\b[\s.:)-]*(?:.*?(?:research\s*papers?|publications?|reports?\s*published|book\s*chapters?|papers?\s*published))",
        re.IGNORECASE,
    )
    if sec_v_re.match(clean):
        return True, "SECTION_V"

    later_re = re.compile(r"^(?:section\s*)?(?:vi|vii|viii|ix|x|6|7|8|9|10)\b[\s.:)-]+[a-z]{3,}", re.IGNORECASE)
    if later_re.match(clean):
        return True, "END_SECTION"

    earlier_re = re.compile(r"^(?:section\s*)?(?:i|ii|iii|1|2|3)\b[\s.:)-]+[a-z]{3,}", re.IGNORECASE)
    if earlier_re.match(clean):
        return True, "END_SECTION"

    return False, "OTHER"


def is_boilerplate(text: str) -> bool:
    clean = text.strip()
    if not clean or len(clean) < 3:
        return True
    if re.match(r"^(?:nil|none|na|n/a|-+|—+)$", clean, re.IGNORECASE):
        return True
    if re.match(r"^page\s*\d+(\s*of\s*\d+)?$", clean, re.IGNORECASE):
        return True
    return False


def is_table_header_row(cells: List[str]) -> bool:
    if not cells:
        return True
    joined = " ".join(cells).lower()
    if len(joined) > 140:
        return False
    keywords = ["sl. no", "sl no", "s. no", "s.no", "particulars", "title of paper", "name of conference", "venue", "author(s)", "remarks"]
    hits = sum(1 for kw in keywords if kw in joined)
    return hits >= 2 or bool(re.match(r"^(?:sl\.?\s*no\.?|s\.?\s*no\.?)$", cells[0].strip(), re.IGNORECASE))


def extract_paragraph_text(p_elem: etree._Element) -> str:
    parts: List[str] = []

    def walk_runs(node: etree._Element) -> None:
        for child in node:
            tag = child.tag
            if tag == f"{MC_NS}AlternateContent":
                choice = child.find(f"{MC_NS}Choice")
                fallback = child.find(f"{MC_NS}Fallback")
                if choice is not None:
                    walk_runs(choice)
                elif fallback is not None:
                    walk_runs(fallback)
                continue

            if tag in (f"{W_NS}txbxContent", f"{V_NS}textbox", f"{WPS_NS}txbx"):
                continue

            if tag in (f"{W_NS}t", f"{W_NS}delText"):
                if child.text:
                    parts.append(child.text)
            elif tag in (f"{W_NS}tab", f"{W_NS}br", f"{W_NS}cr"):
                parts.append(" ")
            else:
                walk_runs(child)

    walk_runs(p_elem)
    return re.sub(r"\s+", " ", "".join(parts)).strip()


def extract_docx_file(file_path: str) -> Dict[str, Any]:
    filename = os.path.basename(file_path)
    with open(file_path, "rb") as f:
        raw_bytes = f.read()

    file_hash = hashlib.sha256(raw_bytes).hexdigest()
    file_size = len(raw_bytes)

    # Validate readable via python-docx
    try:
        _ = DocxDocument(file_path)
    except Exception:
        pass

    diagnostics: Dict[str, Any] = {
        "xmlFilesScanned": [],
        "totalParagraphs": 0,
        "normalParagraphs": 0,
        "drawingMlTextBoxes": 0,
        "vmlTextBoxes": 0,
        "tableCells": 0,
        "headerFooterItems": 0,
        "sectionIvFound": False,
        "sectionIvLocation": None,
        "sectionVFound": False,
        "sectionVLocation": None,
        "sectionIvItemCount": 0,
        "sectionVItemCount": 0,
        "warnings": [],
        "errors": [],
    }

    items: List[Dict[str, Any]] = []
    paragraph_counter = 0

    try:
        zf = zipfile.ZipFile(file_path, "r")
    except Exception as exc:
        diagnostics["errors"].append(f"Invalid DOCX/ZIP archive ({filename}): {exc}")
        return {"filename": filename, "file_path": file_path, "file_hash": file_hash, "file_size": file_size, "items": [], "diagnostics": diagnostics}

    with zf:
        all_names = set(zf.namelist())
        xml_paths: List[str] = []
        if "word/document.xml" in all_names:
            xml_paths.append("word/document.xml")
        else:
            diagnostics["errors"].append("Missing word/document.xml inside DOCX archive.")

        headers = sorted(n for n in all_names if re.match(r"^word/header\d*\.xml$", n, re.IGNORECASE))
        footers = sorted(n for n in all_names if re.match(r"^word/footer\d*\.xml$", n, re.IGNORECASE))
        xml_paths.extend(headers)
        xml_paths.extend(footers)

        for xml_path in xml_paths:
            diagnostics["xmlFilesScanned"].append(xml_path)
            try:
                root = etree.fromstring(zf.read(xml_path))
            except Exception as exc:
                diagnostics["errors"].append(f"Failed parsing {xml_path}: {exc}")
                continue

            is_header = xml_path.lower().startswith("word/header")
            is_footer = xml_path.lower().startswith("word/footer")
            current_section = "OTHER"

            def record_item(text: str, container_type: str) -> None:
                nonlocal paragraph_counter, current_section
                if is_boilerplate(text):
                    return

                is_heading, heading_sec = classify_heading(text)
                if is_heading:
                    if heading_sec == "SECTION_IV":
                        current_section = "SECTION_IV"
                        if not diagnostics["sectionIvFound"]:
                            diagnostics["sectionIvFound"] = True
                            diagnostics["sectionIvLocation"] = f"{xml_path} ({container_type})"
                    elif heading_sec == "SECTION_V":
                        current_section = "SECTION_V"
                        if not diagnostics["sectionVFound"]:
                            diagnostics["sectionVFound"] = True
                            diagnostics["sectionVLocation"] = f"{xml_path} ({container_type})"
                    else:
                        current_section = "OTHER"

                paragraph_counter += 1
                diagnostics["totalParagraphs"] += 1
                if container_type == "paragraph":
                    diagnostics["normalParagraphs"] += 1
                elif container_type == "textbox_drawingml":
                    diagnostics["drawingMlTextBoxes"] += 1
                elif container_type == "textbox_vml":
                    diagnostics["vmlTextBoxes"] += 1
                elif container_type == "table":
                    diagnostics["tableCells"] += 1
                if is_header or is_footer:
                    diagnostics["headerFooterItems"] += 1

                if not is_heading:
                    if current_section == "SECTION_IV":
                        diagnostics["sectionIvItemCount"] += 1
                    elif current_section == "SECTION_V":
                        diagnostics["sectionVItemCount"] += 1

                items.append({
                    "paragraphNumber": paragraph_counter,
                    "containerType": container_type,
                    "xmlSource": xml_path,
                    "sectionDetected": "OTHER" if (is_heading and heading_sec == "END_SECTION") else current_section,
                    "rawText": text,
                    "isHeading": is_heading,
                })

            def walk_nested_textboxes(node: etree._Element) -> None:
                for child in node:
                    tag = child.tag
                    if tag == f"{MC_NS}AlternateContent":
                        choice = child.find(f"{MC_NS}Choice")
                        fallback = child.find(f"{MC_NS}Fallback")
                        if choice is not None:
                            walk_nested_textboxes(choice)
                        elif fallback is not None:
                            walk_nested_textboxes(fallback)
                    elif tag == f"{WPS_NS}txbx":
                        walk_nodes(child, "textbox_drawingml", False)
                    elif tag == f"{V_NS}textbox":
                        walk_nodes(child, "textbox_vml", False)
                    elif tag == f"{W_NS}txbxContent":
                        walk_nodes(child, "textbox_drawingml", False)
                    else:
                        walk_nested_textboxes(child)

            def walk_nodes(node: etree._Element, tb_kind: Optional[str], inside_table: bool) -> None:
                for child in node:
                    tag = child.tag
                    if tag == f"{MC_NS}AlternateContent":
                        choice = child.find(f"{MC_NS}Choice")
                        fallback = child.find(f"{MC_NS}Fallback")
                        if choice is not None:
                            walk_nodes(choice, tb_kind, inside_table)
                        elif fallback is not None:
                            walk_nodes(fallback, tb_kind, inside_table)
                        continue

                    if tag == f"{WPS_NS}txbx":
                        walk_nodes(child, "textbox_drawingml", inside_table)
                        continue
                    if tag == f"{V_NS}textbox":
                        walk_nodes(child, "textbox_vml", inside_table)
                        continue
                    if tag == f"{W_NS}txbxContent":
                        walk_nodes(child, tb_kind or "textbox_drawingml", inside_table)
                        continue

                    if tag == f"{W_NS}tbl" and not tb_kind:
                        for tr in child.findall(f"{W_NS}tr"):
                            row_cells: List[str] = []
                            for tc in tr.findall(f"{W_NS}tc"):
                                cell_paras: List[str] = []
                                for tc_child in tc:
                                    if tc_child.tag == f"{W_NS}p":
                                        ptxt = extract_paragraph_text(tc_child)
                                        if ptxt:
                                            cell_paras.append(ptxt)
                                        walk_nested_textboxes(tc_child)
                                    elif tc_child.tag == f"{W_NS}tbl":
                                        walk_nodes(tc_child, tb_kind, True)
                                if cell_paras:
                                    row_cells.append(" ".join(cell_paras))
                            if row_cells and not is_table_header_row(row_cells):
                                if len(row_cells) > 1 and re.match(r"^\d{1,3}\.?$", row_cells[0].strip()):
                                    row_cells = row_cells[1:]
                                eff = "header" if is_header else ("footer" if is_footer else "table")
                                record_item(" — ".join(row_cells).strip(), eff)
                        continue

                    if tag == f"{W_NS}p":
                        txt = extract_paragraph_text(child)
                        if txt:
                            eff = tb_kind or ("header" if is_header else ("footer" if is_footer else ("table" if inside_table else "paragraph")))
                            record_item(txt, eff)
                        walk_nested_textboxes(child)
                        continue

                    walk_nodes(child, tb_kind, inside_table)

            walk_nodes(root, None, False)

    if not diagnostics["sectionIvFound"]:
        diagnostics["warnings"].append("Section IV (Conferences/Workshops/Seminars/Exhibitions) heading not detected.")
    if not diagnostics["sectionVFound"]:
        diagnostics["warnings"].append("Section V (Research Papers/Reports Published) heading not detected.")
    if diagnostics["totalParagraphs"] == 0:
        diagnostics["warnings"].append("No readable text paragraphs extracted from DOCX.")

    return {
        "filename": filename,
        "file_path": file_path,
        "file_hash": file_hash,
        "file_size": file_size,
        "items": items,
        "diagnostics": diagnostics,
    }
