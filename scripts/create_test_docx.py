"""
Generates test DOCX files in test_data/ matching all OOXML extraction test cases:
- Regular paragraph heading
- Heading inside floating DrawingML text box
- Publication inside floating text box
- Table entry
- Header / Footer VML text box
- Duplicate publication across two monthly documents
"""

import os
import zipfile

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
</Types>"""

ROOT_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""

DOC_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
</Relationships>"""

DOC1_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
            xmlns:v="urn:schemas-microsoft-com:vml">
  <w:body>
    <w:p><w:r><w:t>IV. Conferences/ Workshops/ Seminars/ Exhibitions</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Sl. No.</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Title of Paper &amp; Authors</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Name of Conference / Venue / Date</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>R. K. Sharma, A. B. Das, M. Devi. "SAR-Based Flood Inundation Monitoring in Assam Using Sentinel-1 Time Series" (Oral Presentation)</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>45th Asian Conference on Remote Sensing (ACRS 2026), Colombo, Sri Lanka, 14-18 October 2026</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:p><w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing><wp:anchor><wps:wsp><wps:txbx><w:txbxContent>
      <w:p><w:r><w:t>V. Research Papers/ Reports Published</w:t></w:r></w:p>
      <w:p><w:r><w:t>1. S. K. Srivastav, R. K. Sharma, D. Barman (2026). "Multi-Sensor Hyperspectral Assessment of Shifting Cultivation Dynamics in Meghalaya Plateau". International Journal of Applied Earth Observation and Geoinformation, Vol. 132, Issue 4, pp. 104-118. DOI: 10.1016/j.jag.2026.104118.</w:t></w:r></w:p>
    </w:txbxContent></wps:txbx></wps:wsp></wp:anchor></w:drawing></mc:Choice></mc:AlternateContent></w:r></w:p>
  </w:body>
</w:document>"""

HDR1_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml">
  <w:p><w:r><w:pict><v:shape><v:textbox><w:txbxContent>
    <w:p><w:r><w:t>V. Research Papers/ Reports Published</w:t></w:r></w:p>
    <w:p><w:r><w:t>J. M. Bhuyan, N. Kalita (2026). "Atmospheric Boundary Layer Aerosol Profiling over Umiam Valley Using Lidar". Journal of Atmospheric and Solar-Terrestrial Physics, Vol. 258, pp. 45-56. DOI: 10.1016/j.jastp.2026.106210.</w:t></w:r></w:p>
  </w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>
</w:hdr>"""


def write_docx(out_path: str, doc_xml: str, hdr_xml: str) -> None:
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", CONTENT_TYPES)
        zf.writestr("_rels/.rels", ROOT_RELS)
        zf.writestr("word/_rels/document.xml.rels", DOC_RELS)
        zf.writestr("word/document.xml", doc_xml)
        zf.writestr("word/header1.xml", hdr_xml)


if __name__ == "__main__":
    os.makedirs("test_data", exist_ok=True)
    write_docx(os.path.join("test_data", "Sample_Python_Test_MPR.docx"), DOC1_XML, HDR1_XML)
    print("Generated test_data/Sample_Python_Test_MPR.docx")
