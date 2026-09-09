const fs = require('fs');
const path = require('path');

const CURRICULUM_DIR = path.join(__dirname, '..', 'data', 'curriculum');
const CATALOG_FILE = path.join(CURRICULUM_DIR, 'catalog', 'zambia_subject_catalog.json');
const REGISTRY_FILE = path.join(CURRICULUM_DIR, 'registry', 'official_secondary_syllabus_registry.json');

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

function formatContext(context) {
  if (!context?.matched || !context.match) {
    if (context?.sourceStatus === 'OFFICIAL_SOURCE_REGISTERED_NO_LOCAL_PACK') {
    return `An official Zambia Ministry of Education Directorate of Curriculum Development syllabus is registered for this subject, but a detailed local topic index has not yet been imported. Generate useful topic-specific content without inventing syllabus codes, page numbers, or claiming exact CDC alignment. Official source: ${context.source?.officialSource || context.source?.sourceBasis || ''}`;
  }
  return 'NO VERIFIED LOCAL CURRICULUM MATCH WAS FOUND. Generate useful topic-specific teaching content, but DO NOT invent CDC syllabus codes, page numbers, official references, or claim unverified details are from the Ministry/CDC.';
  }
  const m = context.match;
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
  formatContext,
  listCurriculumSources,
  listCurriculumRows,
  catalogSubjects,
  loadPacks,
  loadCatalog,
  loadRegistry,
  getRegisteredOfficialSource
};
