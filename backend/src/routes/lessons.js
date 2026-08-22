// Add this function to your lessons.js
function buildOBCPrompt(grade, subject, topic, size, boys, girls, teacherName, schoolName, province, district) {
  return `
You are an expert Zambian teacher creating an OBC (Objective-Based Curriculum) lesson plan for ${grade} ${subject} on the topic: "${topic}".

Teacher Name: ${teacherName}
School: ${schoolName}
Province: ${province}
District: ${district}

Follow the Ministry of Education OBC lesson plan template exactly.

Return ONLY valid JSON with this exact structure:

{
  "title": "${topic}",
  "grade": "${grade}",
  "subject": "${subject}",
  "teacherName": "${teacherName}",
  "school": "${schoolName}",
  "province": "${province}",
  "district": "${district}",
  "date": "${new Date().toISOString().split('T')[0]}",
  "duration": "80 MINUTES",
  "classSize": ${size},
  "boys": ${boys},
  "girls": ${girls},
  "references": [
    "Biological Science by Lisuba Bornface",
    "Simply Biology by Xavier (Page 80-81)",
    "Biology 12 Golden Tips"
  ],
  "teachingAids": ["Chart of excretory organs", "Images of metabolic wastes", "Video on deamination", "PowerPoint slides", "Worksheet"],
  "rationale": "Excretion is the removal of metabolic wastes that would otherwise become toxic. This lesson introduces the concept of excretion and distinguishes it from egestion and secretion. Understanding which wastes are produced and which organs remove them is essential for later topics on kidney function, osmoregulation, and homeostasis.",
  "learningOutcomes": [
    "Define excretion and differentiate it from egestion and secretion.",
    "Name the main metabolic waste products (CO₂, urea, water, salts, bile pigments).",
    "List the principal excretory organs (lungs, kidneys, skin, liver) and state what each excretes.",
    "Explain how the liver produces urea (deamination of amino acids)."
  ],
  "lessonDevelopment": [
    {
      "time": "10 MIN",
      "learningPoints": "INTRODUCTION: What is Excretion? – Removal of metabolic wastes. Distinguish from egestion (undigested food) and secretion (useful substances).",
      "teacherActivities": "Teacher asks: 'What is the difference between faeces and urine?' Writes definitions on board.",
      "pupilActivities": "Pupils define excretion in their own words."
    },
    {
      "time": "20 MIN",
      "learningPoints": "Metabolic wastes and their sources – CO₂ (respiration), urea (protein breakdown in liver), bile pigments (haemoglobin breakdown), excess water and salts.",
      "teacherActivities": "Teacher lists wastes on board with their sources. Uses a diagram of the liver's role in deamination.",
      "pupilActivities": "Pupils complete a table: waste → source → excretory organ."
    },
    {
      "time": "20 MIN",
      "learningPoints": "Excretory organs – Lungs (CO₂, water), Kidneys (urea, excess water/salts, toxins), Skin (water, salts, trace urea), Liver (converts amino acids to urea; excretes bile pigments into gut).",
      "teacherActivities": "Teacher uses a body chart to point out each organ. Explains deamination simply.",
      "pupilActivities": "Pupils label organs on a diagram and write one waste product for each."
    },
    {
      "time": "15 MIN",
      "learningPoints": "Distinctions – Excretion vs. egestion vs. secretion.",
      "teacherActivities": "Teacher gives contrasting examples (e.g., sweating vs. passing faeces).",
      "pupilActivities": "Pupils classify given processes as excretion, egestion, or secretion."
    },
    {
      "time": "15 MIN",
      "learningPoints": "CONCLUSION: Summary – Recap of wastes, organs, and distinctions.",
      "teacherActivities": "Teacher leads oral quiz: 'Which organ removes CO₂?' 'What is deamination?'",
      "pupilActivities": "Pupils answer worksheet questions."
    }
  ],
  "learnersEvaluation": [
    "Define excretion.",
    "Name three metabolic waste products.",
    "Which organ excretes carbon dioxide?",
    "What is the difference between excretion and egestion?",
    "Why is the liver considered an excretory organ even though it does not directly expel waste?"
  ]
}
`;
}
