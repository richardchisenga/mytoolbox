// In the CBC template section
{
  // ... existing fields
  teacherName: "MR CHISENGA",
  date: new Date().toISOString().split('T')[0],
  time: "10:20-11:00",
  subtopic: "3.1 Nutrition in Man – Types of Food Nutrients",
  boys: Math.floor((classSize || 40) * 0.45),
  girls: (classSize || 40) - boys,
  generalCompetences: ["Analytical thinking", "Collaboration", "Communication", "Critical thinking"],
  specificCompetence: "Classify types of food nutrients.",
  lessonGoal: `By the end of this lesson, learners will be able to identify, classify, and explain the importance of the seven types of food nutrients.`,
  rationale: "Nutrition is essential for growth, energy, and health.",
  priorKnowledge: "Learners know that food is necessary for life and have eaten a variety of local foods.",
  references: ["2025 Biology Form 1 Teaching Module, pages 71–78", "Biology Module 2, Term 2"],
  learningEnvironment: "Natural: school garden / market area. Artificial: classroom, laboratory.",
  materials: ["Assorted local foods", "Manila paper", "Markers", "Flip chart"],
  expectedStandard: "Types of food nutrients classified correctly.",
  // ... rest
}
