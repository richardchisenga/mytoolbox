const generateHTMLContent = (lesson: any) => {
  const isOBC = lesson.curriculum === 'obc';

  if (isOBC) {
    // ============================================
    // OBC FORMAT - Plain Black & White
    // ============================================
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Lesson Plan - ${lesson.title || lesson.topic}</title>
  <style>
    body { font-family: 'Times New Roman', Arial, sans-serif; margin: 40px; }
    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
    .header h1 { margin: 0; font-size: 24px; }
    .header h2 { margin: 5px 0; font-size: 20px; }
    .header h3 { margin: 5px 0; font-size: 18px; }
    .header p { margin: 3px 0; color: #000; font-size: 14px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 20px; margin: 15px 0; }
    .info-grid p { margin: 3px 0; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 13px; }
    th, td { border: 1px solid #000; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { background-color: #e0e0e0; font-weight: bold; }
    .section { margin: 20px 0; }
    .section h4 { border-bottom: 1px solid #000; padding-bottom: 5px; font-size: 16px; margin-bottom: 8px; }
    ul, ol { margin: 5px 0; padding-left: 25px; }
    li { margin: 3px 0; font-size: 14px; }
    .footer { text-align: center; border-top: 2px solid #000; padding-top: 10px; margin-top: 20px; font-size: 12px; color: #555; }
    .teacher-eval { font-style: italic; color: #333; background: #f5f5f5; padding: 10px; border-left: 3px solid #666; }
    @media print { body { margin: 30px; } }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <h1>MINISTRY OF EDUCATION</h1>
    <h2>${lesson.school || 'KASHINAKAZHI SECONDARY SCHOOL'}</h2>
    <h3>LESSON PLAN</h3>
    <p>DEPARTMENT OF NATURAL SCIENCES</p>
  </div>

  <!-- Teacher Info -->
  <div class="info-grid">
    <p><strong>NAME OF TEACHER:</strong> ${lesson.teacherName || '_________________'}</p>
    <p><strong>SUBJECT:</strong> ${lesson.subject || ''}</p>
    <p><strong>TOPIC:</strong> ${lesson.title || lesson.topic || ''}</p>
    <p><strong>SUBTOPIC:</strong> ${lesson.subtopic || '_________________'}</p>
    <p><strong>DATE:</strong> ${lesson.date || '_________________'}</p>
    <p><strong>DURATION:</strong> ${lesson.duration || '80 MINUTES'}</p>
    <p><strong>CLASS:</strong> ${lesson.grade || ''}</p>
    <p><strong>NO. OF BOYS:</strong> ${lesson.boys || '___'}</p>
    <p><strong>NO. OF GIRLS:</strong> ${lesson.girls || '___'}</p>
  </div>

  <!-- References -->
  <div class="section">
    <h4>REFERENCES:</h4>
    <ul>
      ${(lesson.references || ['_________________']).map((r: string) => `<li>${r}</li>`).join('')}
    </ul>
  </div>

  <!-- Teaching Aids -->
  <div class="section">
    <h4>TEACHING &amp; LEARNING AIDS:</h4>
    <ul>
      ${(lesson.teachingAids || ['_________________']).map((a: string) => `<li>${a}</li>`).join('')}
    </ul>
  </div>

  <!-- Rationale -->
  <div class="section">
    <h4>RATIONALE:</h4>
    <p>${lesson.rationale || '_________________'}</p>
  </div>

  <!-- Learning Outcomes -->
  <div class="section">
    <h4>LEARNING OUTCOMES:</h4>
    <ol>
      ${(lesson.learningOutcomes || ['_________________']).map((o: string) => `<li>${o}</li>`).join('')}
    </ol>
  </div>

  <!-- Lesson Development Table -->
  <div class="section">
    <h4>LESSON DEVELOPMENT</h4>
    <table>
      <thead>
        <tr>
          <th style="width:12%;">TIME</th>
          <th style="width:28%;">LEARNING POINTS</th>
          <th style="width:30%;">TEACHER'S ACTIVITIES</th>
          <th style="width:30%;">PUPIL'S ACTIVITIES</th>
        </tr>
      </thead>
      <tbody>
        ${(lesson.lessonDevelopment || []).map((item: any) => `
          <tr>
            <td style="text-align:center;font-weight:bold;">${item.time || ''}</td>
            <td>${item.learningPoints || ''}</td>
            <td>${item.teacherActivities || ''}</td>
            <td>${item.pupilActivities || ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <!-- Learners Evaluation -->
  <div class="section">
    <h4>LEARNERS' EVALUATION</h4>
    <ol>
      ${(lesson.learnersEvaluation || ['_________________']).map((q: string) => `<li>${q}</li>`).join('')}
    </ol>
  </div>

  <!-- Teacher's Evaluation -->
  <div class="section">
    <h4>TEACHER'S EVALUATION</h4>
    <p class="teacher-eval">${lesson.teacherEvaluation || 'Space for teacher\'s reflections'}</p>
  </div>

  <div class="footer">© 2026 mytoolbox - Made for teachers in Zambia</div>
</body>
</html>
    `;
  }

  // ============================================
  // CBC FORMAT - Plain Black & White
  // ============================================
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Lesson Plan - ${lesson.title || lesson.topic}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
    .header h1 { margin: 0; }
    .header p { margin: 5px 0; color: #000; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #000; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { background-color: #e0e0e0; font-weight: bold; }
    .section { margin: 20px 0; }
    .section h3 { border-bottom: 1px solid #000; padding-bottom: 5px; }
    ul { margin: 5px 0; padding-left: 20px; }
    li { margin: 3px 0; }
    .footer { text-align: center; border-top: 2px solid #000; padding-top: 10px; margin-top: 20px; font-size: 12px; color: #555; }
    @media print { body { margin: 30px; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>MINISTRY OF EDUCATION</h1>
    <h2>${lesson.subject || ''} LESSON PLAN</h2>
    <p><strong>NAME OF TEACHER:</strong> ${lesson.teacherName || '_________________'}</p>
    <p><strong>DATE:</strong> ${lesson.date || new Date().toLocaleDateString()}</p>
    <p><strong>DURATION:</strong> ${lesson.duration || '40 min'}</p>
    <p><strong>CLASS:</strong> ${lesson.grade || ''}</p>
    <p><strong>TOPIC:</strong> ${lesson.title || lesson.topic || ''}</p>
    <p><strong>SUB-TOPIC:</strong> ${lesson.subtopic || '_________________'}</p>
    <p><strong>NO. OF PUPILS:</strong> ${lesson.classSize || 40} <strong>BOYS:</strong> ${lesson.boys || '___'} <strong>GIRLS:</strong> ${lesson.girls || '___'}</p>
  </div>

  <div class="section">
    <h3>GENERAL COMPETENCES</h3>
    <ul>${(lesson.generalCompetences || ['Analytical thinking', 'Collaboration', 'Communication', 'Critical thinking']).map((c: string) => `<li>${c}</li>`).join('')}</ul>
  </div>

  <div class="section">
    <h3>SPECIFIC COMPETENCE</h3>
    <p>${lesson.specificCompetence || '_________________'}</p>
  </div>

  <div class="section">
    <h3>LESSON GOAL</h3>
    <p>${lesson.lessonGoal || '_________________'}</p>
  </div>

  <div class="section">
    <h3>RATIONALE</h3>
    <p>${lesson.rationale || '_________________'}</p>
  </div>

  <div class="section">
    <h3>PRIOR KNOWLEDGE</h3>
    <p>${lesson.priorKnowledge || '_________________'}</p>
  </div>

  <div class="section">
    <h3>REFERENCES</h3>
    <ul>${(lesson.references || ['_________________']).map((r: string) => `<li>${r}</li>`).join('')}</ul>
  </div>

  <div class="section">
    <h3>LEARNING ENVIRONMENT</h3>
    <p>${lesson.learningEnvironment || 'Classroom, laboratory'}</p>
  </div>

  <div class="section">
    <h3>MATERIALS/RESOURCES</h3>
    <ul>${(lesson.materials || ['_________________']).map((m: string) => `<li>${m}</li>`).join('')}</ul>
  </div>

  <div class="section">
    <h3>EXPECTED STANDARD</h3>
    <p>${lesson.expectedStandard || '_________________'}</p>
  </div>

  <div class="section">
    <h3>LESSON PROGRESSION</h3>
    <table>
      <thead>
        <tr>
          <th>STAGE/TIME</th>
          <th>TEACHER'S ROLE</th>
          <th>LEARNERS' ROLE</th>
          <th>ASSESSMENT CRITERIA</th>
        </tr>
      </thead>
      <tbody>
        ${(lesson.lessonProgression || []).map((item: any) => `
          <tr>
            <td><strong>${item.stage || 'Stage'}</strong><br>${item.time || ''}</td>
            <td>${item.teacherRole || ''}</td>
            <td>${item.learnerRole || ''}</td>
            <td>${item.assessmentCriteria || ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h3>HOMEWORK</h3>
    <p>${lesson.homework || '_________________'}</p>
  </div>

  <div class="section">
    <h3>LESSON EVALUATION</h3>
    <p>${lesson.lessonEvaluation || '_________________'}</p>
  </div>

  <div class="footer">© 2026 mytoolbox - Made for teachers in Zambia</div>
</body>
</html>
  `;
};
