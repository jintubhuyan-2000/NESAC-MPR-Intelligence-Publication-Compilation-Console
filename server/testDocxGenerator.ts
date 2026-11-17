import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOC_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildDocxArchive(
  documentXml: string,
  headerXml: string,
  footerXml: string
): Buffer {
  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from(CONTENT_TYPES_XML, 'utf8'));
  zip.addFile('_rels/.rels', Buffer.from(ROOT_RELS_XML, 'utf8'));
  zip.addFile('word/_rels/document.xml.rels', Buffer.from(DOC_RELS_XML, 'utf8'));
  zip.addFile('word/document.xml', Buffer.from(documentXml, 'utf8'));
  zip.addFile('word/header1.xml', Buffer.from(headerXml, 'utf8'));
  zip.addFile('word/footer1.xml', Buffer.from(footerXml, 'utf8'));
  return zip.toBuffer();
}

export function createTestDocxSuiteBuffers(): Array<{ filename: string; buffer: Buffer }> {
  // Document 1: October 2026 MPR
  // Tests:
  // - Regular paragraph heading (Section IV)
  // - Table entry inside Section IV
  // - Floating DrawingML text box (mc:AlternateContent -> wps:txbx -> w:txbxContent) for Section V heading + publication inside text box
  // - VML text box inside Header (word/header1.xml -> v:textbox -> w:txbxContent) containing a Section V publication
  const doc1Body = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
            xmlns:v="urn:schemas-microsoft-com:vml">
  <w:body>
    <w:p><w:r><w:t>NORTH EASTERN SPACE APPLICATIONS CENTRE (NESAC) - MONTHLY PROGRESS REPORT (OCTOBER 2026)</w:t></w:r></w:p>
    <w:p><w:r><w:t>I. Ongoing Projects &amp; Remote Sensing Operations</w:t></w:r></w:p>
    <w:p><w:r><w:t>Flood hazard zonation mapping for Brahmaputra basin completed for Q3.</w:t></w:r></w:p>

    <!-- Regular paragraph heading for Section IV -->
    <w:p><w:r><w:t>IV. Conferences/ Workshops/ Seminars/ Exhibitions</w:t></w:r></w:p>

    <!-- Table entry inside Section IV -->
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
      <w:tr>
        <w:tc><w:p><w:r><w:t>2</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>P. L. N. Raju, K. K. Sarma. "Space Technology Applications for North Eastern Region Development" (Keynote Address)</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>National Symposium on Geomatics for Sustainable Mountains, Shillong, Meghalaya, 22-23 October 2026</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>

    <!-- Section V heading AND publication inside a Floating DrawingML Text Box (with mc:AlternateContent) -->
    <w:p>
      <w:r>
        <mc:AlternateContent>
          <mc:Choice Requires="wps">
            <w:drawing>
              <wp:anchor>
                <wps:wsp>
                  <wps:txbx>
                    <w:txbxContent>
                      <w:p><w:r><w:t>V. Research Papers/ Reports Published</w:t></w:r></w:p>
                      <w:p><w:r><w:t>1. S. K. Srivastav, R. K. Sharma, D. Barman (2026). "Multi-Sensor Hyperspectral Assessment of Shifting Cultivation Dynamics in Meghalaya Plateau". International Journal of Applied Earth Observation and Geoinformation, Vol. 132, Issue 4, pp. 104-118. DOI: 10.1016/j.jag.2026.104118, ISSN: 1569-8432.</w:t></w:r></w:p>
                      <w:p><w:r><w:t>2. B. K. Handique, C. Goswami (2026). "AI-Driven Crop Yield Estimation in North East India". In: Geospatial Technologies for Precision Agriculture (Eds. R. P. Singh, M. Kumar), Springer Nature, pp. 211-234. ISBN: 978-981-19-8842-1.</w:t></w:r></w:p>
                    </w:txbxContent>
                  </wps:txbx>
                </wps:wsp>
              </wp:anchor>
            </w:drawing>
          </mc:Choice>
          <mc:Fallback>
            <w:pict>
              <v:shape>
                <v:textbox>
                  <w:txbxContent>
                    <w:p><w:r><w:t>V. Research Papers/ Reports Published</w:t></w:r></w:p>
                    <w:p><w:r><w:t>1. S. K. Srivastav, R. K. Sharma, D. Barman (2026). "Multi-Sensor Hyperspectral Assessment of Shifting Cultivation Dynamics in Meghalaya Plateau". International Journal of Applied Earth Observation and Geoinformation, Vol. 132, Issue 4, pp. 104-118. DOI: 10.1016/j.jag.2026.104118, ISSN: 1569-8432.</w:t></w:r></w:p>
                    <w:p><w:r><w:t>2. B. K. Handique, C. Goswami (2026). "AI-Driven Crop Yield Estimation in North East India". In: Geospatial Technologies for Precision Agriculture (Eds. R. P. Singh, M. Kumar), Springer Nature, pp. 211-234. ISBN: 978-981-19-8842-1.</w:t></w:r></w:p>
                  </w:txbxContent>
                </v:textbox>
              </v:shape>
            </w:pict>
          </mc:Fallback>
        </mc:AlternateContent>
      </w:r>
    </w:p>

    <w:p><w:r><w:t>VI. Capacity Building &amp; Training Programmes</w:t></w:r></w:p>
    <w:p><w:r><w:t>Conducted 5-day QGIS training for state remote sensing officials.</w:t></w:r></w:p>
    <w:sectPr>
      <w:headerReference w:type="default" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/>
      <w:footerReference w:type="default" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId2"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  // Header text box with a publication entry (VML text box inside header1.xml)
  const doc1Header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
       xmlns:v="urn:schemas-microsoft-com:vml">
  <w:p><w:r><w:t>NESAC Monthly Progress Report - October 2026</w:t></w:r></w:p>
  <w:p>
    <w:r>
      <w:pict>
        <v:shape>
          <v:textbox>
            <w:txbxContent>
              <w:p><w:r><w:t>V. Research Papers/ Reports Published</w:t></w:r></w:p>
              <w:p><w:r><w:t>J. M. Bhuyan, N. Kalita (2026). "Atmospheric Boundary Layer Aerosol Profiling over Umiam Valley Using Lidar". Journal of Atmospheric and Solar-Terrestrial Physics, Vol. 258, pp. 45-56. DOI: 10.1016/j.jastp.2026.106210.</w:t></w:r></w:p>
            </w:txbxContent>
          </v:textbox>
        </v:shape>
      </w:pict>
    </w:r>
  </w:p>
</w:hdr>`;

  const doc1Footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:r><w:t>Page 1 of 1</w:t></w:r></w:p>
</w:ftr>`;

  // Document 2: November 2026 MPR
  // Tests:
  // - Floating VML text box heading for Section IV (punctuation variation: "IV - Conferences, Workshops, Seminars & Exhibitions:")
  // - Duplicate publication across Oct & Nov documents (both exact DOI match and fuzzy title match)
  // - Book chapter inside Section V
  // - Ambiguous technical report without publication status (Review Required)
  // - Footer text box
  const doc2Body = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:v="urn:schemas-microsoft-com:vml">
  <w:body>
    <w:p><w:r><w:t>NORTH EASTERN SPACE APPLICATIONS CENTRE (NESAC) - MONTHLY PROGRESS REPORT (NOVEMBER 2026)</w:t></w:r></w:p>

    <!-- VML floating text box for Section IV -->
    <w:p>
      <w:r>
        <w:pict>
          <v:shape>
            <v:textbox>
              <w:txbxContent>
                <w:p><w:r><w:t>IV - Conferences, Workshops, Seminars &amp; Exhibitions:</w:t></w:r></w:p>
                <w:p><w:r><w:t>1. D. Dutta, S. Baruah. "Landslide Susceptibility Mapping Along NH-6 Using InSAR and Machine Learning" (Poster Presentation). Indian Society of Remote Sensing National Symposium (ISRS 2026), Dehradun, 10-12 November 2026.</w:t></w:r></w:p>
                <w:p><w:r><w:t>2. R. K. Sharma, A. B. Das, M. Devi (2026). "SAR-Based Flood Inundation Monitoring in Assam Using Sentinel-1 Time Series". Proceedings of the 45th Asian Conference on Remote Sensing (ACRS 2026), Colombo, Sri Lanka, Oct 2026.</w:t></w:r></w:p>
              </w:txbxContent>
            </v:textbox>
          </v:shape>
        </w:pict>
      </w:r>
    </w:p>

    <!-- Regular paragraph heading with variation for Section V -->
    <w:p><w:r><w:t>V: Research Papers &amp; Reports Published</w:t></w:r></w:p>
    <!-- Confirmed duplicate of Oct paper (matching DOI) -->
    <w:p><w:r><w:t>S. K. Srivastav, R. K. Sharma, D. Barman (2026). "Multi-Sensor Hyperspectral Assessment of Shifting Cultivation Dynamics in Meghalaya Plateau". Int. J. Appl. Earth Obs. Geoinf., Vol. 132(4), pp. 104-118. DOI: 10.1016/j.jag.2026.104118.</w:t></w:r></w:p>
    <!-- New Research Paper -->
    <w:p><w:r><w:t>K. K. Sarma, T. Bora (2026). "Wetland Ecological Changes in Kaziranga National Park Using Landsat 9 and Sentinel-2". Current Science, Vol. 130, No. 7, pp. 812-821. ISSN: 0011-3891. DOI: 10.18520/cs/v130/i7/812-821.</w:t></w:r></w:p>
    <!-- Ambiguous internal technical report (should flag Review Required) -->
    <w:p><w:r><w:t>Internal Technical Report on UAV Photogrammetry Calibration Trials at Umiam Campus (Draft submitted for internal division review, November 2026).</w:t></w:r></w:p>

    <w:sectPr>
      <w:headerReference w:type="default" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/>
      <w:footerReference w:type="default" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId2"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const doc2Header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:r><w:t>NESAC Monthly Progress Report - November 2026</w:t></w:r></w:p>
</w:hdr>`;

  const doc2Footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
       xmlns:v="urn:schemas-microsoft-com:vml">
  <w:p>
    <w:r>
      <w:pict>
        <v:shape>
          <v:textbox>
            <w:txbxContent>
              <w:p><w:r><w:t>A. K. Bora, R. K. Sharma (2026). "Hydrological Modelling of Barak River Basin". In: Himalayan Hydrology and Climate Resilience (Ed. V. P. Dimri), Elsevier, pp. 89-112. ISBN: 978-0-443-19201-4.</w:t></w:r></w:p>
            </w:txbxContent>
          </v:textbox>
        </v:shape>
      </w:pict>
    </w:r>
  </w:p>
</w:ftr>`;

  return [
    {
      filename: 'NESAC_MPR_October_2026.docx',
      buffer: buildDocxArchive(doc1Body, doc1Header, doc1Footer),
    },
    {
      filename: 'NESAC_MPR_November_2026.docx',
      buffer: buildDocxArchive(doc2Body, doc2Header, doc2Footer),
    },
  ];
}

export function ensureTestDocxFilesOnDisk(): string[] {
  const testDir = path.resolve(process.cwd(), 'test_data');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  const suite = createTestDocxSuiteBuffers();
  const paths: string[] = [];
  for (const item of suite) {
    const outPath = path.join(testDir, item.filename);
    fs.writeFileSync(outPath, item.buffer);
    paths.push(outPath);
  }
  return paths;
}
