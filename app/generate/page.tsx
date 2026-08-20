"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function GeneratePage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [classSize, setClassSize] = useState("40");
  const [curriculum, setCurriculum] = useState("cbc");
  const [generatedLesson, setGeneratedLesson] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!topic || !grade || !subject) {
      setError("Please fill in all fields");
      return;
    }

    setIsGenerating(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/lessons/generate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            topic,
            grade,
            subject,
            classSize: parseInt(classSize),
            curriculum: curriculum,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate lesson");
      }

      const data = await response.json();
      setGeneratedLesson(data);
    } catch (error: any) {
      console.error("Generation failed:", error);
      setError(error.message || "Failed to generate lesson. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // Export functions
  const exportToPDF = () => {
    if (!generatedLesson) return;
    // Simple print version - you can expand this later
    window.print();
  };

  const exportToWord = () => {
    if (!generatedLesson) return;
    // Create a simple HTML version that can be copied to Word
    const content = generateHTMLContent(generatedLesson);
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generatedLesson.title || generatedLesson.topic}_lesson_plan.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateHTMLContent = (lesson: any) => {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Lesson Plan - ${lesson.title || lesson.topic}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    .header { text-align: center; border-bottom: 2px solid #1B5E20; padding-bottom: 10px; margin-bottom: 20px; }
    .header h1 { color: #1B5E20; margin: 0; }
    .header p { margin: 5px 0; color: #555; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 10px; text-align: left; vertical-align: top; }
    th { background-color: #1B5E20; color: white; }
    .section { margin: 20px 0; }
    .section h3 { color: #1B5E20; border-bottom: 1px solid #F9A825; padding-bottom: 5px; }
    ul { margin: 5px 0; padding-left: 20px; }
    li { margin: 3px 0; }
    .footer { text-align: center; border-top: 2px solid #1B5E20; padding-top: 10px; margin-top: 20px; font-size: 12px; color: #777; }
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

  <div class="footer">
    © 2026 mytoolbox - Made for teachers in Zambia
  </div>
</body>
</html>
    `;
  };

  const quickTopics = [
    { grade: "Grade 5", subject: "Mathematics", topic: "Fractions" },
    { grade: "Grade 8", subject: "Science", topic: "Photosynthesis" },
    { grade: "Grade 3", subject: "English", topic: "Reading Comprehension" },
    { grade: "Grade 10", subject: "Civic Education", topic: "Human Rights" },
    { grade: "Grade 12", subject: "Biology", topic: "Excretion" },
    { grade: "Grade 12", subject: "Biology", topic: "Ecology" },
  ];

  return (
    <div className="min-h-screen bg-cream p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/dashboard" className="text-primary hover:underline">
          ← Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-primary mt-4">
          Create a New Lesson
        </h1>
        <p className="text-gray-600 mt-2">
          Generate curriculum-aligned lesson plans in seconds
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {quickTopics.map((qt, idx) => (
            <button
              key={idx}
              onClick={() => {
                setGrade(qt.grade);
                setSubject(qt.subject);
                setTopic(qt.topic);
              }}
              className="px-3 py-1 bg-white border border-highlight rounded-lg text-sm hover:border-secondary hover:bg-secondary/5 transition-all"
            >
              {qt.grade} {qt.subject} - {qt.topic}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            ❌ {error}
          </div>
        )}

        {!generatedLesson ? (
          <form
            onSubmit={handleGenerate}
            className="bg-white p-6 rounded-xl shadow-md mt-6"
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Curriculum Type
                </label>
                <select
                  value={curriculum}
                  onChange={(e) => setCurriculum(e.target.value)}
                  className="mt-1 w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="cbc">CBC (Competency-Based Curriculum)</option>
                  <option value="obc">OBC (Objective-Based Curriculum)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Grade
                </label>
                <input
                  type="text"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  placeholder="e.g. Grade 5"
                  className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Mathematics"
                  className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Topic
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Fractions"
                  className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Class Size
                </label>
                <input
                  type="number"
                  value={classSize}
                  onChange={(e) => setClassSize(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <button
                type="submit"
                disabled={isGenerating}
                className="bg-yellow-500 text-black px-6 py-3 rounded-md hover:bg-yellow-400 disabled:opacity-50 w-full font-semibold"
              >
                {isGenerating ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></span>
                    Generating Lesson Plan...
                  </span>
                ) : (
                  "🚀 Generate Lesson"
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="bg-white p-6 rounded-xl shadow-md mt-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-bold text-primary">
                  {generatedLesson.title || generatedLesson.topic}
                </h2>
                <p className="text-gray-600">
                  {generatedLesson.grade} · {generatedLesson.subject}
                </p>
                <p className="text-sm text-gray-500">⏱️ {generatedLesson.duration || '40 min'}</p>
                {generatedLesson.curriculum && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full inline-block mt-1">
                    {generatedLesson.curriculum.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={exportToPDF}
                  className="bg-red-500 text-white px-3 py-1 rounded-md text-sm hover:bg-red-600"
                >
                  📄 PDF
                </button>
                <button
                  onClick={exportToWord}
                  className="bg-blue-500 text-white px-3 py-1 rounded-md text-sm hover:bg-blue-600"
                >
                  📝 Word
                </button>
              </div>
            </div>

            {/* Ministry of Education Template Display */}
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              {/* Header */}
              <div className="text-center border-b-2 border-primary pb-4 mb-4">
                <h3 className="text-xl font-bold text-primary">MINISTRY OF EDUCATION</h3>
                <h4 className="text-lg font-semibold">{generatedLesson.subject} LESSON PLAN</h4>
                <p><strong>NAME OF TEACHER:</strong> {generatedLesson.teacherName || '_________________'}</p>
                <p><strong>DATE:</strong> {generatedLesson.date || new Date().toLocaleDateString()}</p>
                <p><strong>DURATION:</strong> {generatedLesson.duration || '40 min'}</p>
                <p><strong>CLASS:</strong> {generatedLesson.grade}</p>
                <p><strong>TOPIC:</strong> {generatedLesson.title || generatedLesson.topic}</p>
                <p><strong>SUB-TOPIC:</strong> {generatedLesson.subtopic || '_________________'}</p>
                <p><strong>NO. OF PUPILS:</strong> {generatedLesson.classSize || 40} <strong>BOYS:</strong> {generatedLesson.boys || '___'} <strong>GIRLS:</strong> {generatedLesson.girls || '___'}</p>
              </div>

              {/* General Competences */}
              <div className="mb-3">
                <h4 className="font-semibold text-primary">GENERAL COMPETENCES</h4>
                <ul className="list-disc pl-5">
                  {(generatedLesson.generalCompetences || ['Analytical thinking', 'Collaboration', 'Communication', 'Critical thinking']).map((c: string, i: number) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>

              {/* Specific Competence */}
              <div className="mb-3">
                <h4 className="font-semibold text-primary">SPECIFIC COMPETENCE</h4>
                <p>{generatedLesson.specificCompetence || '_________________'}</p>
              </div>

              {/* Lesson Goal */}
              <div className="mb-3">
                <h4 className="font-semibold text-primary">LESSON GOAL</h4>
                <p>{generatedLesson.lessonGoal || '_________________'}</p>
              </div>

              {/* Rationale */}
              <div className="mb-3">
                <h4 className="font-semibold text-primary">RATIONALE</h4>
                <p>{generatedLesson.rationale || '_________________'}</p>
              </div>

              {/* Prior Knowledge */}
              <div className="mb-3">
                <h4 className="font-semibold text-primary">PRIOR KNOWLEDGE</h4>
                <p>{generatedLesson.priorKnowledge || '_________________'}</p>
              </div>

              {/* References */}
              <div className="mb-3">
                <h4 className="font-semibold text-primary">REFERENCES</h4>
                <ul className="list-disc pl-5">
                  {(generatedLesson.references || ['_________________']).map((r: string, i: number) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>

              {/* Learning Environment */}
              <div className="mb-3">
                <h4 className="font-semibold text-primary">LEARNING ENVIRONMENT</h4>
                <p>{generatedLesson.learningEnvironment || 'Classroom, laboratory'}</p>
              </div>

              {/* Materials */}
              <div className="mb-3">
                <h4 className="font-semibold text-primary">MATERIALS/RESOURCES</h4>
                <ul className="list-disc pl-5">
                  {(generatedLesson.materials || ['_________________']).map((m: string, i: number) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>

              {/* Expected Standard */}
              <div className="mb-3">
                <h4 className="font-semibold text-primary">EXPECTED STANDARD</h4>
                <p>{generatedLesson.expectedStandard || '_________________'}</p>
              </div>

              {/* Lesson Progression Table */}
              <div className="mb-3">
                <h4 className="font-semibold text-primary">LESSON PROGRESSION</h4>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300 text-sm">
                    <thead>
                      <tr className="bg-primary text-white">
                        <th className="border border-gray-300 p-2">STAGE/TIME</th>
                        <th className="border border-gray-300 p-2">TEACHER'S ROLE</th>
                        <th className="border border-gray-300 p-2">LEARNERS' ROLE</th>
                        <th className="border border-gray-300 p-2">ASSESSMENT CRITERIA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(generatedLesson.lessonProgression || []).map((item: any, index: number) => (
                        <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                          <td className="border border-gray-300 p-2 font-medium">
                            {item.stage || 'Stage'}<br />
                            <span className="text-xs text-gray-500">{item.time || ''}</span>
                          </td>
                          <td className="border border-gray-300 p-2">{item.teacherRole || ''}</td>
                          <td className="border border-gray-300 p-2">{item.learnerRole || ''}</td>
                          <td className="border border-gray-300 p-2">{item.assessmentCriteria || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Homework */}
              <div className="mb-3">
                <h4 className="font-semibold text-primary">HOMEWORK</h4>
                <p>{generatedLesson.homework || '_________________'}</p>
              </div>

              {/* Lesson Evaluation */}
              <div className="mb-3">
                <h4 className="font-semibold text-primary">LESSON EVALUATION</h4>
                <p>{generatedLesson.lessonEvaluation || '_________________'}</p>
              </div>
            </div>

            <button
              onClick={() => setGeneratedLesson(null)}
              className="mt-6 text-primary hover:underline"
            >
              ← Generate Another Lesson
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
