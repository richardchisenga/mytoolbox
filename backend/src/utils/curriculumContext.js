const fs = require('fs');
const path = require('path');

const CURRICULUM_DIR = path.join(__dirname, '..', 'data', 'curriculum');
const CATALOG_FILE = path.join(CURRICULUM_DIR, 'catalog', 'zambia_subject_catalog.json');
const REGISTRY_FILE = path.join(CURRICULUM_DIR, 'registry', 'official_secondary_syllabus_registry.json');
const REMOTE_CACHE_DIR = path.join(CURRICULUM_DIR, '.remote-cache');
const REMOTE_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7;

let pdfParse = null;
try { pdfParse = require('pdf-parse'); } catch { pdfParse = null; }

function normalise(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function canonicalGrade(value) {
  const v = normalise(value).replace(/-/g, ' ');
  return v
    .replace(/^grade\s+/, 'grade ')
    .replace(/^form\s+/, 'form ')
    .replace(/^g\s*(\d+)$/, 'grade $1')
    .replace(/^f\s*(\d+)$/, 'form $1');
}

function walkJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJsonFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.json') && full !== CATALOG_FILE) out.push(full);
  }
  return out;
}

function loadPacks() {
  return walkJsonFiles(CURRICULUM_DIR).map((file) => {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return { ...parsed, _file: path.relative(CURRICULUM_DIR, file) };
    } catch (error) {
      console.warn(`⚠️ Could not load curriculum pack ${file}: ${error.message}`);
      return null;
    }
  }).filter(Boolean);
}

function loadRegistry() {
  try { return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8')); }
  catch { return { subjects: {}, authority: '', index: '' }; }
}

function getRegisteredOfficialSource(subject) {
  const registry = loadRegistry();
  return registry.subjects?.[subject] || Object.entries(registry.subjects || {}).find(([name]) => normalise(name) === normalise(subject))?.[1] || null;
}

function loadCatalog() {
  try { return JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8')); }
  catch { return { levels: {}, officialCatalogSource: '', authority: '' }; }
}

function catalogSubjects({ level = '' } = {}) {
  const catalog = loadCatalog();
  const key = normalise(level);
  const values = key && catalog.levels[key] ? catalog.levels[key] : Object.values(catalog.levels).flat();
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function listCurriculumSources({ curriculum = 'cbc', grade = '', subject = '', term = '' } = {}) {
  const type = normalise(curriculum);
  return loadPacks()
    .filter((p) => normalise(p.curriculum || 'cbc') === type)
    .filter((p) => !grade || [p.grade, ...(p.gradeAliases || [])].some((g) => canonicalGrade(g) === canonicalGrade(grade)))
    .filter((p) => !subject || normalise(p.subject) === normalise(subject))
    .filter((p) => !term || normalise(p.term) === normalise(term))
    .map((p) => ({
      curriculum: type,
      subject: p.subject,
      grade: p.grade,
      term: p.term,
      sourceType: p.sourceType || 'local curriculum pack',
      sourceBasis: p.sourceBasis || '',
      officialSource: p.officialSource || '',
      file: p._file,
      topics: [...new Set((p.rows || []).map((r) => r.topic).filter(Boolean))],
      subtopics: [...new Set((p.rows || []).map((r) => r.subTopic || r.subtopic).filter(Boolean))]
    }));
}

function listCurriculumRows({ curriculum = 'cbc', grade = '', subject = '', term = '' } = {}) {
  return loadPacks()
    .filter((p) => normalise(p.curriculum || 'cbc') === normalise(curriculum))
    .filter((p) => !grade || [p.grade, ...(p.gradeAliases || [])].some((g) => canonicalGrade(g) === canonicalGrade(grade)))
    .filter((p) => !subject || normalise(p.subject) === normalise(subject))
    .filter((p) => !term || normalise(p.term) === normalise(term))
    .flatMap((p) => (Array.isArray(p.rows) ? p.rows : []).map((row) => ({
      ...row,
      _source: {
        subject: p.subject,
        grade: p.grade,
        term: p.term,
        sourceType: p.sourceType || 'local curriculum pack',
        sourceBasis: p.sourceBasis || '',
        officialSource: p.officialSource || '',
        file: p._file
      }
    })));
}

function rowText(row, ...keys) {
  for (const key of keys) if (row && row[key] !== undefined && row[key] !== null && String(row[key]).trim()) return row[key];
  return '';
}


function safeCacheName(subject, grade) {
  return `${normalise(subject)}-${normalise(grade)}`.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '.json';
}

async function loadOfficialRemoteText(subject, grade) {
  const registered = getRegisteredOfficialSource(subject);
  if (!registered?.officialSource || !pdfParse) return null;
  try {
    fs.mkdirSync(REMOTE_CACHE_DIR, { recursive: true });
    const cacheFile = path.join(REMOTE_CACHE_DIR, safeCacheName(subject, grade));
    if (fs.existsSync(cacheFile)) {
      const stat = fs.statSync(cacheFile);
      if (Date.now() - stat.mtimeMs < REMOTE_CACHE_TTL_MS) return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    }
    const response = await fetch(registered.officialSource, { headers: { 'User-Agent': 'MyToolbox Curriculum Indexer/1.0' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const parsed = await pdfParse(buffer);
    const result = {
      subject, grade, officialSource: registered.officialSource,
      officialTitle: registered.officialTitle || `${subject} Syllabus, Forms 1–4`,
      text: String(parsed.text || '').replace(/\s+/g, ' ').slice(0, 250000)
    };
    fs.writeFileSync(cacheFile, JSON.stringify(result));
    return result;
  } catch (error) {
    console.warn(`⚠️ Official curriculum fetch failed for ${subject}: ${error.message}`);
    return null;
  }
}

function findRemoteTopic(text, topic, subtopic) {
  const hay = normalise(text);
  const keys = [topic, subtopic].map(normalise).filter(Boolean).sort((a,b)=>b.length-a.length);
  if (!keys.length) return null;
  const key = keys.find(k => hay.includes(k));
  if (!key) return null;
  const index = hay.indexOf(key);
  const start = Math.max(0, index - 1400);
  const end = Math.min(hay.length, index + key.length + 4200);
  return { topic: topic || key, subTopic: subtopic || '', sourceExcerpt: text.slice(start, end) };
}

async function getCurriculumContextAsync(args) {
  const local = getCurriculumContext(args);
  if (local.matched || normalise(args.curriculum) !== 'cbc') return local;
  const remote = await loadOfficialRemoteText(args.subject, args.grade);
  if (!remote) return local;
  const match = findRemoteTopic(remote.text, args.topic, args.subtopic);
  if (!match) return {
    ...local,
    sourceStatus: 'OFFICIAL_SOURCE_FETCHED_NO_TOPIC_MATCH',
    source: { sourceType: 'official_dcd_syllabus', sourceBasis: 'Official Ministry of Education DCD syllabus fetched from ministry website', officialSource: remote.officialSource, subject: args.subject, grade: args.grade, term: args.term || '', file: 'remote-official-syllabus' },
    remoteExcerpt: remote.text.slice(0, 6000)
  };
  return {
    matched: true,
    sourceStatus: 'VERIFIED_OFFICIAL_REMOTE_MATCH',
    source: { sourceType: 'official_dcd_syllabus', sourceBasis: 'Official Ministry of Education DCD syllabus fetched from ministry website', officialSource: remote.officialSource, subject: args.subject, grade: args.grade, term: args.term || '', file: 'remote-official-syllabus' },
    match
  };
}

function getCurriculumContext({ curriculum, grade, subject, term, topic, subtopic }) {
  if (normalise(curriculum) !== 'cbc') {
    return { matched: false, sourceStatus: 'OBC_MODE', source: null, match: null };
  }

  const candidates = loadPacks().filter((item) =>
    normalise(item.curriculum || 'cbc') === 'cbc' &&
    normalise(item.subject) === normalise(subject) &&
    [item.grade, ...(item.gradeAliases || [])].some((g) => canonicalGrade(g) === canonicalGrade(grade)) &&
    (!normalise(term) || normalise(item.term) === normalise(term))
  );

  if (!candidates.length) {
    const registered = getRegisteredOfficialSource(subject);
    if (registered) return { matched: false, sourceStatus: 'OFFICIAL_SOURCE_REGISTERED_NO_LOCAL_PACK', source: { sourceType: registered.sourceType, sourceBasis: 'Official DCD syllabus registry; detailed local topic index not yet imported', officialSource: registered.officialSource, subject, grade: grade || 'Form 1-4', term: term || '', file: 'registry/official_secondary_syllabus_registry.json' }, match: null };
    return { matched: false, sourceStatus: 'SOURCE_NOT_FOUND', source: null, match: null };
  }

  const topicKey = normalise(topic);
  const subtopicKey = normalise(subtopic);
  let match = null;
  let pack = candidates[0];

  for (const candidate of candidates) {
    const rows = Array.isArray(candidate.rows) ? candidate.rows : [];
    match = rows.find((row) => {
      const rowTopic = normalise(row.topic);
      const rowSubtopic = normalise(row.subTopic || row.subtopic);
      const competence = normalise(row.specificCompetence || row.specificCompetences);
      return (topicKey && (rowTopic === topicKey || rowSubtopic === topicKey || rowTopic.includes(topicKey) || topicKey.includes(rowTopic) || rowSubtopic.includes(topicKey) || topicKey.includes(rowSubtopic))) ||
             (subtopicKey && (rowSubtopic.includes(subtopicKey) || subtopicKey.includes(rowSubtopic))) ||
             (topicKey && competence.includes(topicKey));
    });
    if (match) { pack = candidate; break; }
  }

  const source = {
    sourceType: pack.sourceType || 'local curriculum pack',
    sourceBasis: pack.sourceBasis || '',
    officialSource: pack.officialSource || '',
    subject: pack.subject,
    grade: pack.grade,
    term: pack.term,
    file: pack._file
  };

  return {
    matched: Boolean(match),
    sourceStatus: match ? 'VERIFIED_LOCAL_PACK_MATCH' : 'LOCAL_PACK_NO_TOPIC_MATCH',
    source,
    availableTopics: [...new Set((pack.rows || []).map((r) => r.topic).filter(Boolean))],
    match: match || null
  };
}


function getOfficialReferences({ subject = '', grade = '', term = '', context = null } = {}) {
  const refs = [];
  const registered = getRegisteredOfficialSource(subject);
  const authority = 'Ministry of Education - Directorate of Curriculum Development';

  if (registered) {
    refs.push({
      title: registered.officialTitle || `${subject} Syllabus, Forms 1–4`,
      type: 'Official DCD syllabus',
      authority,
      url: registered.sourceType === 'official_dcd_syllabus_registry' ? registered.officialSource : '',
      source: 'official_dcd_syllabus_registry'
    });
    if (registered.officialDcdIndex) {
      refs.push({
        title: 'Finalised Syllabi and Teaching Module Downloads',
        type: 'Official DCD curriculum index',
        authority,
        url: registered.officialDcdIndex,
        source: 'official_dcd_index'
      });
    }
  }

  // A local pack can contain an exact source reference/page range. Keep it,
  // but never present a teacher-supplied local pack as an official CDC book.
  const localRef = context?.match?.reference || context?.match?.references || '';
  if (localRef) {
    refs.push({
      title: String(localRef),
      type: 'Local curriculum/source-pack reference',
      authority: context?.source?.sourceBasis || 'MyToolbox local curriculum source',
      url: context?.source?.officialSource || '',
      source: 'local_pack'
    });
  }

  return refs.filter((r, i, arr) => arr.findIndex(x => `${x.type}|${x.title}|${x.url}` === `${r.type}|${r.title}|${r.url}`) === i);
}

function formatOfficialReferences({ subject = '', grade = '', term = '', context = null, includeUrls = false } = {}) {
  return getOfficialReferences({ subject, grade, term, context })
    .map((r) => includeUrls && r.url ? `${r.title} — ${r.authority} — ${r.url}` : r.title);
}

function getReferenceTitles({ subject = '', grade = '', term = '', context = null } = {}) {
  return formatOfficialReferences({ subject, grade, term, context, includeUrls: false });
}

function formatContext(context) {
  if (!context?.matched || !context.match) {
    if (context?.sourceStatus === 'OFFICIAL_SOURCE_REGISTERED_NO_LOCAL_PACK') {
      const refs = getReferenceTitles({ subject: context.source?.subject, grade: context.source?.grade, term: context.source?.term });
      return JSON.stringify({
        status: context.sourceStatus,
        instruction: 'Use the registered official DCD source titles as references. Do not invent syllabus codes, page numbers, textbook titles, Teaching Module titles, authors or publishers.',
        officialSource: context.source?.officialSource || '',
        references: refs
      }, null, 2);
    }
    return 'NO VERIFIED LOCAL CURRICULUM MATCH WAS FOUND. Generate useful topic-specific teaching content, but DO NOT invent CDC syllabus codes, page numbers, official references, textbook titles or Teaching Module titles.';
  }
  const m = context.match;
  if (context.sourceStatus === 'VERIFIED_OFFICIAL_REMOTE_MATCH') {
    return JSON.stringify({
      status: context.sourceStatus,
      syllabusTopic: m.topic,
      syllabusSubTopic: m.subTopic || '',
      officialSource: context.source?.officialSource || '',
      officialCurriculumExcerpt: m.sourceExcerpt || '',
      instruction: 'Use only the official Ministry curriculum evidence in this context. Do not invent syllabus codes, page numbers, competencies or outcomes that are not supported by the excerpt. If a detail is not present, write a sensible lesson-specific formulation and do not label it as an official syllabus statement.'
    }, null, 2);
  }
  return JSON.stringify({
    syllabusTopic: m.topic,
    syllabusSubTopic: m.subTopic || m.subtopic || '',
    specificCompetence: rowText(m, 'specificCompetence', 'specificCompetences'),
    expectedStandard: rowText(m, 'expectedStandard', 'expectedStandards'),
    suggestedMethods: rowText(m, 'methods', 'strategies'),
    teachingLearningResources: rowText(m, 'resources', 'aids'),
    knowledge: m.knowledge || '',
    skills: m.skills || '',
    values: m.values || '',
    reference: m.reference || m.references || '',
    source: context.source
  }, null, 2);
}

module.exports = {
  getCurriculumContext,
  getCurriculumContextAsync,
  formatContext,
  listCurriculumSources,
  listCurriculumRows,
  catalogSubjects,
  loadPacks,
  loadCatalog,
  loadRegistry,
  getRegisteredOfficialSource,
  getOfficialReferences,
  formatOfficialReferences,
  getReferenceTitles
};
