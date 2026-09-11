// Subject-specific CBC generation guidance for Zambia's 2023/2024 CBC secondary lessons.
// This file controls pedagogy/materials/activities only; verified curriculum rows remain authoritative.

const PROFILES = {
  biology: {
    family: 'life_science',
    competences: ['Analytical thinking', 'Collaboration', 'Communication', 'Critical thinking'],
    environment: 'Classroom, laboratory, school garden or local environment as appropriate to the topic.',
    materials: ['Charts', 'Diagrams', 'Manila paper', 'Markers', 'Relevant specimens or locally available examples where appropriate'],
    methods: ['Observation', 'Question and Answer', 'Group Discussion', 'Practical Activity'],
    activityGuidance: 'Use observation, classification, specimens, diagrams, demonstrations, practical investigations and familiar local examples when they genuinely fit the topic. Avoid forcing food/specimens into unrelated Biology topics.'
  },
  chemistry: {
    family: 'physical_science',
    competences: ['Analytical thinking', 'Collaboration', 'Communication', 'Critical thinking'],
    environment: 'Chemistry classroom or laboratory with appropriate safety controls.',
    materials: ['Chemistry apparatus', 'Charts', 'Samples/substances relevant to the topic', 'Manila paper', 'Markers'],
    methods: ['Demonstration', 'Experiment', 'Question and Answer', 'Group Discussion'],
    activityGuidance: 'Prioritise laboratory safety, observation, classification of substances, practical investigations, particle-level explanations, measurements and chemical representations when relevant.'
  },
  physics: {
    family: 'physical_science',
    competences: ['Analytical thinking', 'Collaboration', 'Communication', 'Critical thinking'],
    environment: 'Physics classroom or laboratory with safe access to relevant apparatus.',
    materials: ['Physics apparatus relevant to the topic', 'Measuring instruments', 'Charts/graphs', 'Manila paper', 'Markers'],
    methods: ['Demonstration', 'Practical Investigation', 'Question and Answer', 'Problem Solving'],
    activityGuidance: 'Use measurement, apparatus, demonstrations, experiments, calculations, graphs, observations and evidence-based explanations when appropriate. Do not invent equipment that is unnecessary for the selected topic.'
  },
  mathematics: {
    family: 'mathematics',
    competences: ['Analytical thinking', 'Problem solving', 'Communication', 'Critical thinking'],
    environment: 'Mathematics classroom with board space and learner exercise books.',
    materials: ['Whiteboard', 'Mathematical instruments', 'Worked-example sheets', 'Graph paper', 'Manila paper'],
    methods: ['Question and Answer', 'Worked Examples', 'Problem Solving', 'Pair/Group Work'],
    activityGuidance: 'Use worked examples, learner reasoning, mathematical language, calculations, representations, diagrams/graphs and graduated exercises. Do not use unrelated real objects merely to make the lesson practical.'
  },
  language: {
    family: 'language',
    competences: ['Communication', 'Collaboration', 'Critical thinking', 'Creativity'],
    environment: 'Language classroom with opportunities for individual, pair and group communication.',
    materials: ['Reading passages', 'Writing materials', 'Charts', 'Dictionaries/reference materials where available', 'Manila paper'],
    methods: ['Reading', 'Discussion', 'Question and Answer', 'Pair/Group Work', 'Writing Practice'],
    activityGuidance: 'Use authentic or teacher-prepared texts, reading/listening, speaking, vocabulary, grammar, comprehension and writing activities that directly match the selected language topic.'
  },
  humanities: {
    family: 'humanities',
    competences: ['Analytical thinking', 'Communication', 'Collaboration', 'Critical thinking'],
    environment: 'Classroom and, where relevant, the local community/environment for observation or field-based learning.',
    materials: ['Maps', 'Pictures', 'Charts', 'Source extracts', 'Manila paper', 'Markers'],
    methods: ['Source Analysis', 'Discussion', 'Question and Answer', 'Group Work', 'Presentation'],
    activityGuidance: 'Use evidence, maps, timelines, source extracts, case studies, local examples, interpretation and discussion according to the subject. Do not fabricate historical/geographical/civic evidence.'
  },
  technology: {
    family: 'technology',
    competences: ['Problem solving', 'Collaboration', 'Communication', 'Critical thinking'],
    environment: 'Computer laboratory or classroom with available digital devices and safe-use procedures.',
    materials: ['Computer/device where available', 'Relevant software or screenshots', 'Charts', 'Manila paper', 'Markers'],
    methods: ['Demonstration', 'Practical Activity', 'Guided Practice', 'Question and Answer'],
    activityGuidance: 'Use step-by-step practical tasks, demonstrations, procedures, digital examples and troubleshooting where appropriate. Never require unavailable software or internet access unless supplied by the teacher.'
  },
  practical: {
    family: 'practical_subject',
    competences: ['Creativity', 'Collaboration', 'Communication', 'Problem solving'],
    environment: 'Classroom, workshop, kitchen, studio, field or other appropriate practical learning space.',
    materials: ['Only materials appropriate to the selected practical task', 'Manila paper', 'Markers'],
    methods: ['Demonstration', 'Practical Activity', 'Guided Practice', 'Group Work'],
    activityGuidance: 'Prioritise demonstration, safe practical performance, observation, creation and reflection using only resources appropriate to the actual topic.'
  }
};

function normalise(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function getCBCSubjectProfile(subject) {
  const s = normalise(subject);
  if (s.includes('biology')) return PROFILES.biology;
  if (s.includes('chemistry')) return PROFILES.chemistry;
  if (s.includes('physics')) return PROFILES.physics;
  if (s.includes('mathematics') || s === 'math' || s.includes('maths')) return PROFILES.mathematics;
  if (s.includes('english') || s.includes('french') || s.includes('language') || s.includes('zambian language')) return PROFILES.language;
  if (s.includes('history') || s.includes('geography') || s.includes('civic') || s.includes('religious') || s === 're') return PROFILES.humanities;
  if (s.includes('computer') || s.includes('ict')) return PROFILES.technology;
  if (s.includes('agricultur') || s.includes('food') || s.includes('fashion') || s.includes('design') || s.includes('hospitality') || s.includes('travel') || s.includes('music') || s.includes('art') || s.includes('physical education')) return PROFILES.practical;
  return PROFILES.humanities;
}

module.exports = { getCBCSubjectProfile };
