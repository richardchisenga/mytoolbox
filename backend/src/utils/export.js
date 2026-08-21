const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, WidthType } = require('docx');
const PDFDocument = require('pdfkit');

// Export Scheme to Word
async function exportSchemeToWord(scheme) {
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        // Header
        new Paragraph({
          children: [
            new TextRun({ text: scheme.school || 'KASHINAKAZHI SECONDARY SCHOOL', size: 28, bold: true }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `${scheme.subject} SCHEMES OF WORK`, size: 24, bold: true }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 }
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `${scheme.grade} ${scheme.term}`, size: 20 }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 }
        }),
        
        // Table Header
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'WEEK', bold: true })], alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'TOPIC', bold: true })], alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'TYPE', bold: true })], alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'SPECIFIC OUTCOME', bold: true })], alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'METHODS', bold: true })], alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'AIDS', bold: true })], alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'KNOWLEDGE', bold: true })], alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'SKILLS', bold: true })], alignment: AlignmentType.CENTER })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'VALUES', bold: true })], alignment: AlignmentType.CENTER })] }),
              ],
            }),
          ],
        }),
        
        // Table Rows
        ...scheme.weeks.map((week) => 
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(week.week) })], alignment: AlignmentType.CENTER })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: week.topic || '' })], size: 16 })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: week.isAssessment ? '📝 TEST/ASSESSMENT' : 'Lesson' })], alignment: AlignmentType.CENTER })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: week.specificOutcome || '' })], size: 16 })] }),
              new TableCell({ children: (week.methods || ['']).map((m) => new Paragraph({ children: [new TextRun({ text: m })], size: 16 })) }),
              new TableCell({ children: (week.aids || ['']).map((a) => new Paragraph({ children: [new TextRun({ text: a })], size: 16 })) }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: week.knowledge || '' })], size: 16 })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: week.skills || '' })], size: 16 })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: week.values || '' })], size: 16 })] }),
            ],
          })
        ),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

// Export Scheme to PDF
function exportSchemeToPDF(scheme) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A3', layout: 'landscape' });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      // Header
      doc.fontSize(18).font('Helvetica-Bold').text(scheme.school || 'KASHINAKAZHI SECONDARY SCHOOL', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(16).font('Helvetica-Bold').text(`${scheme.subject} SCHEMES OF WORK`, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).font('Helvetica').text(`${scheme.grade} ${scheme.term}`, { align: 'center' });
      doc.moveDown(1);

      // Table Headers
      const headers = ['WEEK', 'TOPIC', 'TYPE', 'SPECIFIC OUTCOME', 'METHODS', 'AIDS', 'KNOWLEDGE', 'SKILLS', 'VALUES'];
      const colWidths = [30, 80, 50, 90, 70, 70, 80, 80, 80];
      const startX = 40;
      let y = doc.y;

      let x = startX;
      headers.forEach((header, i) => {
        doc.rect(x, y, colWidths[i], 25).stroke();
        doc.fontSize(9).font('Helvetica-Bold').text(header, x + 3, y + 5, { width: colWidths[i] - 6, align: 'center' });
        x += colWidths[i];
      });

      y += 25;

      scheme.weeks.forEach((week) => {
        const rowData = [
          String(week.week),
          week.topic || '',
          week.isAssessment ? '📝 TEST' : 'Lesson',
          week.specificOutcome || '',
          (week.methods || ['']).join('\n'),
          (week.aids || ['']).join('\n'),
          week.knowledge || '',
          week.skills || '',
          week.values || ''
        ];

        const rowHeight = Math.max(...rowData.map(text => {
          const lines = text.split('\n').length;
          return Math.max(lines * 10, 18);
        })) + 10;

        let x2 = startX;
        rowData.forEach((text, i) => {
          doc.rect(x2, y, colWidths[i], rowHeight).stroke();
          doc.fontSize(7).font('Helvetica').text(text, x2 + 3, y + 3, { width: colWidths[i] - 6, align: 'left' });
          x2 += colWidths[i];
        });

        y += rowHeight;
      });

      doc.fontSize(10).font('Helvetica-Oblique')
        .text('Generated by mytoolbox - Made for teachers in Zambia', 40, doc.page.height - 50, { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { exportSchemeToWord, exportSchemeToPDF };
