const fs = require('fs');
const path = require('path');

const CDC_BASE = 'https://library.cdcrepository.info';
const MINISTRY_BASE = 'https://www.edu.gov.zm';
const MINISTRY_CDC_PAGE = `${MINISTRY_BASE}/?page_id=1142`;
const CACHE_DIR = path.join(__dirname, '..', 'data', 'curriculum', '.cdc-cache');
const CACHE_TTL_MS = 1000 * 60 * 60 * 24;
let pdfParse = null;
try { pdfParse = require('pdf-parse'); } catch { pdfParse = null; }

function normalise(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
function cleanHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/\s+/g, ' ')
    .trim();
}
function safeName(value) {
  return normalise(value).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'all';
}
function cachePath(name) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  return path.join(CACHE_DIR, `${safeName(name)}.json`);
}
function readCache(name) {
  try {
    const file = cachePath(name);
    if (!fs.existsSync(file)) return null;
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { return null; }
}
function writeCache(name, value) {
  try { fs.writeFileSync(cachePath(name), JSON.stringify(value)); } catch {}
  return value;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'MyToolbox-CBC-Curriculum/1.0' },
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`CDC HTTP ${response.status}`);
  return response.text();
}

function gradeQuery(grade) {
  const v = normalise(grade);
  const gm = v.match(/^grade\s*(\d+)$/);
  const fm = v.match(/^form\s*(\d+)$/);
  if (gm) return { level: 'primary', grade: `g${gm[1]}` };
  if (fm) return { level: 'secondary', grade: `f${fm[1]}` };
  return null;
}

function subjectAliases(subject) {
  const s = normalise(subject);
  const aliases = {
    'english': ['english language'],
    'ict': ['information and communication technology'],
    'information technology': ['information and communication technology'],
    'physical education and sport': ['physical education'],
    'physical education and sports': ['physical education'],
    'design and technology studies': ['design and technology'],
    'mathematics i': ['mathematics'],
    'mathematics ii': ['mathematics'],
    'musical arts education': ['music'],
    'agriculture science': ['agricultural science']
  };
  return [s, ...(aliases[s] || [])];
}

function extractLinks(html) {
  const links = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) links.push({ href: m[1], text: cleanHtml(m[2]) });
  return links;
}

async function getSubjectCatalog({ grade } = {}) {
  const g = gradeQuery(grade);
  if (!g) return [];
  const key = `subject-catalog-${g.level}-${g.grade}`;
  const cached = readCache(key);
  if (cached) return cached;
  const html = await fetchText(`${CDC_BASE}/browse.php?grade=${encodeURIComponent(g.grade)}&level=${encodeURIComponent(g.level)}`);
  const links = extractLinks(html);
  const subjects = [];
  for (const link of links) {
    if (/(?:\?|&)subject=\d+/i.test(link.href) && link.text) subjects.push(link.text);
  }
  return writeCache(key, [...new Set(subjects)].sort((a,b)=>a.localeCompare(b)));
}

async function getSubjectIds({ grade, subject }) {
  const g = gradeQuery(grade);
  if (!g) return [];
  const key = `subject-map-${g.level}-${g.grade}`;
  const cached = readCache(key);
  if (cached) return cached[normalise(subject)] || [];
  const url = `${CDC_BASE}/browse.php?grade=${encodeURIComponent(g.grade)}&level=${encodeURIComponent(g.level)}`;
  const html = await fetchText(url);
  const links = extractLinks(html);
  const map = {};
  for (const link of links) {
    const match = link.href.match(/(?:\?|&)subject=(\d+)/i);
    if (!match || !link.text) continue;
    map[normalise(link.text)] = map[normalise(link.text)] || [];
    if (!map[normalise(link.text)].includes(match[1])) map[normalise(link.text)].push(match[1]);
  }
  writeCache(key, map);
  const wanted = subjectAliases(subject);
  return wanted.flatMap((name) => map[name] || []).filter((v, i, a) => a.indexOf(v) === i);
}

function parseResourceCards(html, requestedSubject = '') {
  const links = extractLinks(html);
  const out = [];
  for (const link of links) {
    const m = link.href.match(/resource\.php\?id=(\d+)/i);
    if (!m || !link.text) continue;
    const title = link.text;
    const low = normalise(title);
    if (requestedSubject) {
      const aliases = subjectAliases(requestedSubject);
      if (!aliases.some((a) => low.includes(a))) continue;
    }
    out.push({ id: m[1], title, url: `${CDC_BASE}/resource.php?id=${m[1]}` });
  }
  return out.filter((r, i, a) => a.findIndex(x => x.id === r.id) === i);
}

async function listCDCResources({ grade, subject, term = '' } = {}) {
  const g = gradeQuery(grade);
  if (!g || !subject) return [];
  const cacheKey = `resources-${g.level}-${g.grade}-${safeName(subject)}-${safeName(term || 'all')}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  let subjectIds = [];
  try { subjectIds = await getSubjectIds({ grade, subject }); } catch (error) {
    console.warn(`⚠️ CDC subject map failed: ${error.message}`);
  }

  const pages = [];
  if (subjectIds.length) {
    for (const subjectId of subjectIds.slice(0, 3)) {
      let url = `${CDC_BASE}/browse.php?grade=${encodeURIComponent(g.grade)}&level=${encodeURIComponent(g.level)}&subject=${encodeURIComponent(subjectId)}`;
      if (term) url += `&term=${encodeURIComponent(String(term).replace(/^term\s*/i, ''))}`;
      pages.push(url);
    }
  } else {
    let url = `${CDC_BASE}/browse.php?grade=${encodeURIComponent(g.grade)}&level=${encodeURIComponent(g.level)}`;
    if (term) url += `&term=${encodeURIComponent(String(term).replace(/^term\s*/i, ''))}`;
    pages.push(url);
  }

  const resources = [];
  for (const url of pages) {
    try {
      const html = await fetchText(url);
      resources.push(...parseResourceCards(html, subject));
    } catch (error) {
      console.warn(`⚠️ CDC resource listing failed: ${error.message}`);
    }
  }

  const result = resources.filter((r, i, a) => a.findIndex(x => x.id === r.id) === i);
  return writeCache(cacheKey, result);
}

async function getCDCResource(id) {
  const cacheKey = `resource-${id}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;
  const html = await fetchText(`${CDC_BASE}/resource.php?id=${encodeURIComponent(id)}`);
  const links = extractLinks(html);
  const download = links.find((l) => /resource\.php\?download=1&id=/i.test(l.href) || /view-file\.php\?id=/i.test(l.href));
  const body = cleanHtml(html);
  const result = { id: String(id), pageUrl: `${CDC_BASE}/resource.php?id=${id}`, downloadUrl: download ? new URL(download.href, CDC_BASE).toString() : '', body };
  return writeCache(cacheKey, result);
}

async function downloadPdfText(url) {
  if (!url || !pdfParse) return null;
  const key = `pdf-${safeName(url)}`;
  const cached = readCache(key);
  if (cached) return cached.text || '';

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MyToolbox-CBC-Curriculum/1.0',
      'Accept': 'application/pdf,application/octet-stream;q=0.9,*/*;q=0.1'
    },
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`CDC PDF HTTP ${response.status}`);

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const buffer = Buffer.from(await response.arrayBuffer());

  // CDC occasionally returns an HTML error/resource page with a 200 status.
  // pdf-parse then emits misleading "invalid character" / "invalid PDF"
  // warnings. Validate both the MIME type and the PDF magic header first.
  const isPdfSignature = buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  const looksHtml = /^text\/html|application\/(xhtml\+xml)/i.test(contentType) ||
    /^\s*<(?:!doctype\s+html|html|head|body)\b/i.test(buffer.toString('utf8', 0, Math.min(buffer.length, 512)));

  if (!isPdfSignature || looksHtml) {
    const detail = contentType ? `content-type ${contentType}` : 'unknown content-type';
    throw new Error(`CDC file is not a valid PDF (${detail})`);
  }

  let parsed;
  try {
    parsed = await pdfParse(buffer);
  } catch (error) {
    throw new Error(`CDC PDF parse failed: ${error.message}`);
  }

  const text = String(parsed.text || '').replace(/\s+/g, ' ').trim().slice(0, 500000);
  writeCache(key, { text, pages: parsed.numpages || 0 });
  return text;
}

function extractRowsFromText(text, resource) {
  if (!text) return [];
  const normal = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ');
  const topicRe = /(?:^|\n|\s)(?:T0PIC|TOPIC)\s*([0-9.\-]*)\s*[:\-]?\s*([^\n]{2,140})/gi;
  const subRe = /(?:^|\n|\s)(?:SUB-?TOPIC|SUB TOPIC)\s*([0-9.\-]*)\s*[:\-]?\s*([^\n]{2,180})/gi;
  const topics = [];
  let m;
  while ((m = topicRe.exec(normal))) {
    const name = cleanTopic(m[2]);
    if (name) topics.push({ index: m.index, code: m[1] || '', topic: `${m[1] ? m[1].trim() + ' ' : ''}${name}`.trim() });
  }
  if (!topics.length) return [];
  const subs = [];
  while ((m = subRe.exec(normal))) {
    const name = cleanTopic(m[2]);
    if (name) subs.push({ index: m.index, code: m[1] || '', subTopic: `${m[1] ? m[1].trim() + ' ' : ''}${name}`.trim() });
  }

  const rows = [];
  for (let i = 0; i < subs.length; i++) {
    const sub = subs[i];
    const next = subs[i + 1]?.index || normal.length;
    const parent = [...topics].reverse().find(t => t.index < sub.index);
    if (!parent) continue;
    const section = normal.slice(sub.index, Math.min(next, sub.index + 16000));
    const specific = firstAfter(section, /Specific Competence\s*[:\-]?\s*([^\n]{10,500})/i);
    const standard = firstAfter(section, /Expected Standard\s*[:\-]?\s*([^\n]{10,500})/i);
    const materials = firstAfter(section, /Learning materials?\s*[:\-]?\s*([^\n]{10,700})/i);
    const methods = firstAfter(section, /(?:Teaching strategies|Teaching methods|Strategies)\s*[:\-]?\s*([^\n]{10,500})/i);
    rows.push({
      topic: parent.topic,
      subTopic: sub.subTopic,
      specificCompetence: specific,
      expectedStandard: standard,
      resources: materials,
      methods,
      knowledge: firstParagraph(section, 1200),
      reference: `${resource.title} — CDC Digital Library`,
      cdcResourceTitle: resource.title,
      cdcResourceUrl: resource.downloadUrl || resource.pageUrl,
      sourceType: 'cdc_digital_library',
      sourceBasis: 'CDC Digital Library — Curriculum Development Centre, Ministry of Education, Zambia',
      officialSource: resource.downloadUrl || resource.pageUrl
    });
  }
  return rows;
}

function cleanTopic(value) {
  return String(value || '').replace(/\s+/g, ' ').replace(/[|]+/g, '').trim().replace(/[.]+$/, '');
}
function firstAfter(text, regex) {
  const m = String(text || '').match(regex);
  return m ? String(m[1]).replace(/\s+/g, ' ').trim() : '';
}
function firstParagraph(text, max) {
  return String(text || '').split(/(?:Specific Competence|Learning Activity|Assessment|Expected Standard)/i)[0].replace(/\s+/g, ' ').trim().slice(0, max);
}



// Ministry of Education fallback. The Ministry DCD page publishes the finalized
// CBC syllabi; use it only when the CDC Digital Library cannot supply rows.
async function getMinistrySyllabusResources({ subject = '', grade = '' } = {}) {
  const key = `ministry-resources-${safeName(subject)}-${safeName(grade)}`;
  const cached = readCache(key);
  if (cached) return cached;
  try {
    const html = await fetchText(MINISTRY_CDC_PAGE);
    const links = extractLinks(html);
    const aliases = subjectAliases(subject).map(normalise);
    const g = gradeQuery(grade);
    const wantsForm = g?.level === 'secondary';
    const filtered = links.filter((link) => {
      if (!link.href || !/^https?:|^\//i.test(link.href)) return false;
      const text = normalise(link.text);
      if (!aliases.some(a => text.includes(a) || a.includes(text))) return false;
      if (wantsForm && !/form\s*[1-6]|secondary|syllabus/i.test(text + ' ' + link.href)) return false;
      return /syllabus|curriculum/i.test(text + ' ' + link.href);
    }).map((link) => ({
      title: link.text,
      url: new URL(link.href, MINISTRY_BASE).toString()
    }));
    const result = filtered.filter((r, i, a) => a.findIndex(x => x.url === r.url) === i);
    return writeCache(key, result);
  } catch (error) {
    console.warn(`⚠️ Ministry DCD resource lookup failed: ${error.message}`);
    return [];
  }
}

function extractRowsFromMinistryText(text, resource) {
  if (!text) return [];
  const normal = String(text).replace(/\r/g, '').replace(/[ \t]+/g, ' ');
  const topicMatches = [];
  const topicRe = /(?:^|\n)\s*((?:\d+\.){2}\d+\.?\s+[^\n]{3,180})/g;
  let m;
  while ((m = topicRe.exec(normal))) {
    const line = cleanTopic(m[1]);
    if (/^(?:vision|preface|acknowledgement|introduction|assessment|form\s+\d|competences?\b)/i.test(line)) continue;
    topicMatches.push({ index: m.index, topic: line });
  }
  if (!topicMatches.length) return [];

  const rows = [];
  for (let i = 0; i < topicMatches.length; i++) {
    const parent = topicMatches[i];
    const next = topicMatches[i + 1]?.index || normal.length;
    const section = normal.slice(parent.index, Math.min(next, parent.index + 30000));
    const topicCode = (parent.topic.match(/^((?:\d+\.){2}\d+)/) || [,''])[1];
    const subRe = new RegExp(`(?:^|\\n)\\s*(${topicCode.replace(/\\./g,'\\.')}\\.\\d+\\s+[^\\n]{3,180})`, 'g');
    const subs = [];
    let sm;
    while ((sm = subRe.exec(section))) subs.push(cleanTopic(sm[1]));
    if (!subs.length) {
      const genericSub = section.match(/(?:Sub-?topic|Sub Topic)\s*[:\-]?\s*([^\n]{3,180})/i)?.[1];
      if (genericSub) subs.push(cleanTopic(genericSub));
    }
    if (!subs.length) {
      rows.push({
        topic: parent.topic, subTopic: '',
        specificCompetence: firstAfter(section, /Specific Competence\s*[:\-]?\s*([^\n]{10,500})/i),
        expectedStandard: firstAfter(section, /Expected Standard\s*[:\-]?\s*([^\n]{10,500})/i),
        knowledge: firstParagraph(section, 1400),
        reference: `${resource.title} — Ministry of Education, Zambia`,
        cdcResourceTitle: resource.title, cdcResourceUrl: resource.url,
        sourceType: 'ministry_dcd_syllabus',
        sourceBasis: 'Ministry of Education, Directorate of Curriculum Development — finalized syllabus',
        officialSource: resource.url
      });
    } else {
      for (const sub of subs) {
        const specific = firstAfter(section, /Specific Competence\s*[:\-]?\s*([^\n]{10,500})/i);
        const standard = firstAfter(section, /Expected Standard\s*[:\-]?\s*([^\n]{10,500})/i);
        rows.push({
          topic: parent.topic, subTopic: sub,
          specificCompetence: specific, expectedStandard: standard,
          knowledge: firstParagraph(section, 1400),
          reference: `${resource.title} — Ministry of Education, Zambia`,
          cdcResourceTitle: resource.title, cdcResourceUrl: resource.url,
          sourceType: 'ministry_dcd_syllabus',
          sourceBasis: 'Ministry of Education, Directorate of Curriculum Development — finalized syllabus',
          officialSource: resource.url
        });
      }
    }
  }
  return rows;
}

async function loadMinistryRows({ grade, subject, term = '' } = {}) {
  const resources = await getMinistrySyllabusResources({ subject, grade });
  const rows = [];
  for (const resource of resources.slice(0, 2)) {
    try {
      const text = resource.url.toLowerCase().includes('.pdf') ? await downloadPdfText(resource.url) : cleanHtml(await fetchText(resource.url));
      rows.push(...extractRowsFromMinistryText(text, resource));
    } catch (error) {
      console.warn(`⚠️ Ministry syllabus ${resource.title} could not be indexed: ${error.message}`);
    }
  }
  return rows;
}

async function loadCDCRows({ grade, subject, term = '' } = {}) {
  const resources = await listCDCResources({ grade, subject, term });
  const rows = [];
  // Prefer teaching modules. Keep the number of PDFs bounded for Render.
  const ordered = [...resources].sort((a, b) => {
    const at = /teaching module/i.test(a.title) ? 0 : 1;
    const bt = /teaching module/i.test(b.title) ? 0 : 1;
    return at - bt;
  }).slice(0, 4);
  for (const item of ordered) {
    try {
      const detail = await getCDCResource(item.id);
      // Never treat the CDC resource HTML page itself as a PDF. If the
      // resource page does not expose a downloadable/viewable file URL,
      // skip it and continue with the next CDC resource.
      const downloadUrl = detail.downloadUrl;
      if (!downloadUrl) {
        console.warn(`⚠️ CDC resource ${item.id} has no downloadable file; skipped`);
        continue;
      }
      const text = await downloadPdfText(downloadUrl);
      const resource = { ...item, pageUrl: detail.pageUrl, downloadUrl };
      rows.push(...extractRowsFromText(text, resource));
    } catch (error) {
      console.warn(`⚠️ CDC resource ${item.id} could not be indexed: ${error.message}`);
    }
  }
  if (rows.length) return rows;
  try {
    const ministryRows = await loadMinistryRows({ grade, subject, term });
    if (ministryRows.length) {
      console.log(`📚 Ministry DCD fallback supplied ${ministryRows.length} curriculum rows for ${subject} ${grade}`);
      return ministryRows;
    }
  } catch (error) {
    console.warn(`⚠️ Ministry fallback failed: ${error.message}`);
  }
  return rows;
}

async function getCDCContext({ grade, subject, term = '', topic = '', subtopic = '' } = {}) {
  let resources = await listCDCResources({ grade, subject, term });
  const rows = await loadCDCRows({ grade, subject, term });
  if (!resources.length && rows.length) {
    resources = [{
      title: rows[0].cdcResourceTitle || `${subject} ${grade} finalized syllabus`,
      url: rows[0].cdcResourceUrl || rows[0].officialSource || MINISTRY_CDC_PAGE,
      id: 'ministry-dcd'
    }];
  }
  const topicKey = normalise(topic);
  const subKey = normalise(subtopic);
  let match = null;
  if (topicKey || subKey) {
    match = rows.find((r) => {
      const t = normalise(r.topic), s = normalise(r.subTopic);
      return (subKey && (s === subKey || s.includes(subKey) || subKey.includes(s))) ||
        (topicKey && (t === topicKey || t.includes(topicKey) || topicKey.includes(t) || s.includes(topicKey) || topicKey.includes(s)));
    }) || null;
  }
  const source = resources[0] ? {
    sourceType: 'cdc_digital_library',
    sourceBasis: 'CDC Digital Library — Curriculum Development Centre, Ministry of Education, Zambia',
    officialSource: resources[0].url,
    resourceTitle: resources[0].title,
    resourceUrl: resources[0].url,
    subject, grade, term
  } : null;
  return {
    matched: Boolean(match),
    sourceStatus: match ? (String(match.sourceType || '').includes('ministry') ? 'VERIFIED_MINISTRY_FALLBACK_MATCH' : 'VERIFIED_CDC_LIBRARY_MATCH') : (rows.some(r => String(r.sourceType || '').includes('ministry')) ? 'MINISTRY_FALLBACK_RESOURCE_AVAILABLE' : (resources.length ? 'CDC_LIBRARY_RESOURCE_AVAILABLE' : 'CDC_LIBRARY_RESOURCE_NOT_FOUND')),
    source,
    resources,
    rows,
    match
  };
}

module.exports = { CDC_BASE, MINISTRY_BASE, MINISTRY_CDC_PAGE, listCDCResources, loadCDCRows, loadMinistryRows, getCDCContext, getCDCResource, getSubjectCatalog };
