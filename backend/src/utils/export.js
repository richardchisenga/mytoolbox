const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  WidthType,
  PageOrientation,
  BorderStyle,
} = require('docx');
const PDFDocument = require('pdfkit');

const termWord = (term) => {
  const n = String(term || '').replace(/\D/g, '') || '1';
  return ({ '1': 'ONE', '2': 'TWO', '3': 'THREE' })[n] || n;
};

const listText = (value) => Array.isArray(value) ? value.join('\n') : String(value || '');
const cbcRow = (w) => ({
  week: String(w.week ?? ''),
  topic: String(w.topic || ''),
  subTopic: String(w.subTopic ?? w.subtopic ?? ''),
  specificCompetences: listText(w.specificCompetences ?? w.competencies ?? w.specificOutcome),
  learningActivities: listText(w.learningActivities ?? w.activities ?? ''),
  expectedStandards: String(w.expectedStandards || w.specificOutcome || ''),
  resources: listText(w.resources ?? w.aids),
  strategies: listText(w.strategies ?? w.methods),
  reference: listText(w.reference ?? w.references ?? ['2024 New Biology Syllabus']),
});

function cell(text, options = {}) {
  return new TableCell({
    width: { size: options.width || 100, type: WidthType.PERCENTAGE },
    children: [new Paragraph({
      alignment: options.align || AlignmentType.LEFT,
      spacing: { before: 0, after: 0, line: 180 },
      children: [new TextRun({
        text: String(text ?? ''),
        bold: !!options.bold,
        font: 'Times New Roman',
        size: options.size || 16,
      })]
    })]
  });
}

function headerCell(text, width) {
  return cell(text, { bold: true, align: AlignmentType.CENTER, width, size: 15 });
}

async function exportCBCToWord(scheme) {
  const rows = (scheme.weeks || []).map(cbcRow);
  const widths = [6, 11, 13, 15, 17, 13, 11, 13, 13];

  const tableRows = [new TableRow({
    children: [
      headerCell('week', widths[0]),
      headerCell('Topic', widths[1]),
      headerCell('Sub- topic', widths[2]),
      headerCell('Specific competences', widths[3]),
      headerCell('Learning activities', widths[4]),
      headerCell('Expected standards', widths[5]),
      headerCell('T/L\nRESOURCES', widths[6]),
      headerCell('STRATEGIES\nTECHNIQUES', widths[7]),
      headerCell('REFERENCE', widths[8]),
    ]
  })];

  for (const r of rows) {
    tableRows.push(new TableRow({
      children: [
        cell(r.week, { align: AlignmentType.CENTER, width: widths[0], size: 14 }),
        cell(r.topic, { width: widths[1], size: 14 }),
        cell(r.subTopic, { width: widths[2], size: 14 }),
        cell(r.specificCompetences, { width: widths[3], size: 14 }),
        cell(r.learningActivities, { width: widths[4], size: 14 }),
        cell(r.expectedStandards, { width: widths[5], size: 14 }),
        cell(r.resources, { width: widths[6], size: 14 }),
        cell(r.strategies, { width: widths[7], size: 14 }),
        cell(r.reference, { width: widths[8], size: 14 }),
      ]
    }));
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          size: { width: 16838, height: 11906, orientation: PageOrientation.LANDSCAPE },
          margin: { top: 360, right: 360, bottom: 360, left: 360 }
        }
      },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: 'MINISTRY OF EDUCATION', font: 'Times New Roman', size: 22, bold: true })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: scheme.school || 'KASHINAKAZI SECONDARY SCHOOL', font: 'Times New Roman', size: 21, bold: true })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: 'DEPARTMENT OF NATURAL SCIENCES', font: 'Times New Roman', size: 21, bold: true })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: `SCHEMES OF WORK FOR ${String(scheme.subject || '').toUpperCase()}`, font: 'Times New Roman', size: 21, bold: true })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 100 }, children: [new TextRun({ text: `SUBJECT: ${String(scheme.subject || '').toUpperCase()}     FORM: ${scheme.grade || ''}     TERM: ${termWord(scheme.term)}     YEAR: ${scheme.year || new Date().getFullYear()}`, font: 'Times New Roman', size: 18, bold: true })] }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows, borders: { insideHorizontal: { style: BorderStyle.SINGLE, size: 4 }, insideVertical: { style: BorderStyle.SINGLE, size: 4 }, top: { style: BorderStyle.SINGLE, size: 4 }, bottom: { style: BorderStyle.SINGLE, size: 4 }, left: { style: BorderStyle.SINGLE, size: 4 }, right: { style: BorderStyle.SINGLE, size: 4 } } }),
      ]
    }]
  });
  return Packer.toBuffer(doc);
}

async function exportSchemeToWord(scheme) {
  if (String(scheme.curriculum || '').toLowerCase() === 'cbc') return exportCBCToWord(scheme);

  // Existing OBC export retained.
  const doc = new Document({ sections: [{ properties: {}, children: [
    new Paragraph({ children: [new TextRun({ text: scheme.school || 'KASHINAKAZHI SECONDARY SCHOOL', size: 28, bold: true })], alignment: AlignmentType.CENTER }),
    new Paragraph({ children: [new TextRun({ text: `${scheme.subject} SCHEMES OF WORK`, size: 24, bold: true })], alignment: AlignmentType.CENTER }),
    new Paragraph({ children: [new TextRun({ text: `${scheme.grade} ${scheme.term}`, size: 20 })], alignment: AlignmentType.CENTER, spacing: { after: 300 } }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
      new TableRow({ children: ['WEEK','TOPIC','TYPE','SPECIFIC OUTCOME','METHODS','AIDS','KNOWLEDGE','SKILLS','VALUES'].map(h => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })], alignment: AlignmentType.CENTER })] })) }),
      ...(scheme.weeks || []).map(w => new TableRow({ children: [
        cell(w.week, { align: AlignmentType.CENTER }), cell(w.topic), cell(w.isAssessment ? 'TEST/ASSESSMENT' : 'Lesson', { align: AlignmentType.CENTER }), cell(w.specificOutcome), cell(listText(w.methods)), cell(listText(w.aids)), cell(w.knowledge), cell(w.skills), cell(w.values)
      ] }))
    ]})
  ] }] });
  return Packer.toBuffer(doc);
}

function exportCBCToPDF(scheme) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 22, size: 'A3', layout: 'landscape' });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      doc.font('Helvetica-Bold').fontSize(15).text('MINISTRY OF EDUCATION', { align: 'center' });
      doc.fontSize(14).text(scheme.school || 'KASHINAKAZI SECONDARY SCHOOL', { align: 'center' });
      doc.fontSize(14).text('DEPARTMENT OF NATURAL SCIENCES', { align: 'center' });
      doc.fontSize(14).text(`SCHEMES OF WORK FOR ${String(scheme.subject || '').toUpperCase()}`, { align: 'center' });
      doc.fontSize(11).text(`SUBJECT: ${String(scheme.subject || '').toUpperCase()}     FORM: ${scheme.grade || ''}     TERM: ${termWord(scheme.term)}     YEAR: ${scheme.year || new Date().getFullYear()}`, { align: 'center' });
      doc.moveDown(0.6);

      const headers = ['week','Topic','Sub- topic','Specific competences','Learning activities','Expected standards','T/L RESOURCES','STRATEGIES TECHNIQUES','REFERENCE'];
      const widths = [35, 75, 90, 125, 145, 105, 95, 105, 115];
      const startX = 22;
      const usable = doc.page.width - 44;
      const scale = usable / widths.reduce((a,b)=>a+b,0);
      const colWidths = widths.map(w => w * scale);
      let y = doc.y;

      const drawCell = (x, yy, w, h, text, bold=false, align='left') => {
        doc.rect(x, yy, w, h).stroke();
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(6.2).text(String(text || ''), x + 3, yy + 3, { width: w - 6, height: h - 6, align });
      };

      let x = startX;
      headers.forEach((h,i) => { drawCell(x,y,colWidths[i],26,h,true,'center'); x += colWidths[i]; });
      y += 26;

      for (const raw of (scheme.weeks || []).map(cbcRow)) {
        const vals = [raw.week,raw.topic,raw.subTopic,raw.specificCompetences,raw.learningActivities,raw.expectedStandards,raw.resources,raw.strategies,raw.reference];
        const heights = vals.map((v,i) => {
          const chars = Math.max(12, Math.floor(colWidths[i] / 4.1));
          return Math.ceil(String(v || '').length / chars) * 7 + 8;
        });
        const h = Math.max(24, Math.min(150, Math.max(...heights)));
        x = startX;
        vals.forEach((v,i) => { drawCell(x,y,colWidths[i],h,v,false,i===0?'center':'left'); x += colWidths[i]; });
        y += h;
        if (y > doc.page.height - 40) { doc.addPage(); y = 25; x=startX; headers.forEach((h,i)=>{drawCell(x,y,colWidths[i],26,h,true,'center');x+=colWidths[i];}); y+=26; }
      }
      doc.end();
    } catch (e) { reject(e); }
  });
}

function exportSchemeToPDF(scheme) {
  if (String(scheme.curriculum || '').toLowerCase() === 'cbc') return exportCBCToPDF(scheme);
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A3', layout: 'landscape' });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.fontSize(18).font('Helvetica-Bold').text(scheme.school || 'KASHINAKAZHI SECONDARY SCHOOL', { align: 'center' });
      doc.moveDown(.5); doc.fontSize(16).text(`${scheme.subject} SCHEMES OF WORK`, { align: 'center' });
      doc.moveDown(.5); doc.fontSize(14).font('Helvetica').text(`${scheme.grade} ${scheme.term}`, { align: 'center' });
      doc.moveDown(1);
      const headers=['WEEK','TOPIC','TYPE','SPECIFIC OUTCOME','METHODS','AIDS','KNOWLEDGE','SKILLS','VALUES'];
      const widths=[30,80,50,90,70,70,80,80,80]; const startX=40; let y=doc.y; let x=startX;
      headers.forEach((h,i)=>{doc.rect(x,y,widths[i],25).stroke();doc.fontSize(9).font('Helvetica-Bold').text(h,x+3,y+5,{width:widths[i]-6,align:'center'});x+=widths[i];}); y+=25;
      (scheme.weeks||[]).forEach(w=>{const vals=[String(w.week),w.topic||'',w.isAssessment?'TEST':'Lesson',w.specificOutcome||'',listText(w.methods),listText(w.aids),w.knowledge||'',w.skills||'',w.values||''];const h=Math.max(...vals.map(v=>Math.max(String(v).split('\n').length*10,18)))+10;let xx=startX;vals.forEach((v,i)=>{doc.rect(xx,y,widths[i],h).stroke();doc.fontSize(7).font('Helvetica').text(v,xx+3,y+3,{width:widths[i]-6});xx+=widths[i];});y+=h;});
      doc.end();
    } catch(e){reject(e);}
  });
}

module.exports = { exportSchemeToWord, exportSchemeToPDF };

