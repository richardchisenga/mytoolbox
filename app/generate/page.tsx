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
        if (response.status === 403) {
          alert(errorData.error);
          router.push("/pricing");
          return;
        }
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

  const quickTopics = [
    { grade: "Grade 5", subject: "Mathematics", topic: "Fractions" },
    { grade: "Grade 8", subject: "Science", topic: "Photosynthesis" },
    { grade: "Grade 3", subject: "English", topic: "Reading Comprehension" },
    { grade: "Grade 10", subject: "Civic Education", topic: "Human Rights" },
    { grade: "Grade 12", subject: "Biology", topic: "Excretion" },
    { grade: "Grade 12", subject: "Biology", topic: "Ecology" },
  ];

  const exportToPDF = () => {
    if (!generatedLesson) return;
    window.print();
  };

  const exportToWord = () => {
    if (!generatedLesson) return;
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
    const isOBC = lesson.curriculum === "obc";

    if (isOBC) {
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
  <div class="header">
    <h1>MINISTRY OF EDUCATION</h1>
    <h2>${lesson.school || "KASHINAKAZHI SECONDARY SCHOOL"}</h2>
    <h3>LESSON PLAN</h3>
    <p>DEPARTMENT OF NATURAL SCIENCES</p>
  </div>

  <div class="info-grid">
    <p><strong>NAME OF TEACHER:</strong> ${lesson.teacherName || "_________________"}</p>
    <p><strong>SUBJECT:</strong> ${lesson.subject || ""}</p>
    <p><strong>TOPIC:</strong> ${lesson.title || lesson.topic || ""}</p>
    <p><strong>SUBTOPIC:</strong> ${lesson.subtopic || "_________________"}</p>
    <p><strong>DATE:</strong> ${lesson.date || "_________________"}</p>
    <p><strong>DURATION:</strong> ${lesson.duration || "80 MINUTES"}</p>
    <p><strong>CLASS:</strong> ${lesson.grade || ""}</p>
    <p><strong>NO. OF BOYS:</strong> ${lesson.boys || "___"}</p>
    <p><strong>NO. OF GIRLS:</strong> ${lesson.girls || "___"}</p>
  </div>

  <div class="section">
    <h4>REFERENCES:</h4>
    <ul>
      ${(lesson.references || ["_________________"]).map((r: string) => `<li>${r}</li>`).join("")}
    </ul>
  </div>

  <div class="section">
    <h4>TEACHING &amp; LEARNING AIDS:</h4>
    <ul>
      ${(lesson.teachingAids || ["_________________"]).map((a: string) => `<li>${a}</li>`).join("")}
    </ul>
  </div>

  <div class="section">
    <h4>RATIONALE:</h4>
    <p>${lesson.rationale || "_________________"}</p>
  </div>

  <div class="section">
    <h4>LEARNING OUTCOMES:</h4>
    <ol>
      ${(lesson.learningOutcomes || ["_________________"]).map((o: string) => `<li>${o}</li>`).join("")}
    </ol>
  </div>

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
            <td style="text-align:center;font-weight:bold;">${item.time || ""}</td>
            <td>${item.learningPoints || ""}</td>
            <td>${item.teacherActivities || ""}</td>
            <td>${item.pupilActivities || ""}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h4>LEARNERS' EVALUATION</h4>
    <ol>
      ${(lesson.learnersEvaluation || ["_________________"]).map((q: string) => `<li>${q}</li>`).join("")}
    </ol>
  </div>

  <div class="section">
    <h4>TEACHER'S EVALUATION</h4>
    <p class="teacher-eval">${lesson.teacherEvaluation || "Space for teacher's reflections"}</p>
  </div>

  <div class="footer">© 2026 mytoolbox - Made for teachers in Zambia</div>
</body>
</html>
      `;
    }

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
    <h2>${lesson.subject || ""} LESSON PLAN</h2>
    <p><strong>NAME OF TEACHER:</strong> ${lesson.teacherName || "_________________"}</p>
    <p><strong>DATE:</strong> ${lesson.date || new Date().toLocaleDateString()}</p>
    <p><strong>DURATION:</strong> ${lesson.duration || "40 min"}</p>
    <p><strong>CLASS:</strong> ${lesson.grade || ""}</p>
    <p><strong>TOPIC:</strong> ${lesson.title || lesson.topic || ""}</p>
    <p><strong>SUB-TOPIC:</strong> ${lesson.subtopic || "_________________"}</p>
    <p><strong>NO. OF PUPILS:</strong> ${lesson.classSize || 40} <strong>BOYS:</strong> ${lesson.boys || "___"} <strong>GIRLS:</strong> ${lesson.girls || "___"}</p>
  </div>

  <div class="section">
    <h3>GENERAL COMPETENCES</h3>
    <ul>${(lesson.generalCompetences || ["Analytical thinking", "Collaboration", "Communication", "Critical thinking"]).map((c: string) => `<li>${c}</li>`).join("")}</ul>
  </div>

  <div class="section">
    <h3>SPECIFIC COMPETENCE</h3>
    <p>${lesson.specificCompetence || "_________________"}</p>
  </div>

  <div class="section">
    <h3>LESSON GOAL</h3>
    <p>${lesson.lessonGoal || "_________________"}</p>
  </div>

  <div class="section">
    <h3>RATIONALE</h3>
    <p>${lesson.rationale || "_________________"}</p>
  </div>

  <div class="section">
    <h3>PRIOR KNOWLEDGE</h3>
    <p>${lesson.priorKnowledge || "_________________"}</p>
  </div>

  <div class="section">
    <h3>REFERENCES</h3>
    <ul>${(lesson.references || ["_________________"]).map((r: string) => `<li>${r}</li>`).join("")}</ul>
  </div>

  <div class="section">
    <h3>LEARNING ENVIRONMENT</h3>
    <p>${lesson.learningEnvironment || "Classroom, laboratory"}</p>
  </div>

  <div class="section">
    <h3>MATERIALS/RESOURCES</h3>
    <ul>${(lesson.materials || ["_________________"]).map((m: string) => `<li>${m}</li>`).join("")}</ul>
  </div>

  <div class="section">
    <h3>EXPECTED STANDARD</h3>
    <p>${lesson.expectedStandard || "_________________"}</p>
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
            <td><strong>${item.stage || "Stage"}</strong><br>${item.time || ""}</td>
            <td>${item.teacherRole || ""}</td>
            <td>${item.learnerRole || ""}</td>
            <td>${item.assessmentCriteria || ""}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h3>HOMEWORK</h3>
    <p>${lesson.homework || "_________________"}</p>
  </div>

  <div class="section">
    <h3>LESSON EVALUATION</h3>
    <p>${lesson.lessonEvaluation || "_________________"}</p>
  </div>

  <div class="footer">© 2026 mytoolbox - Made for teachers in Zambia</div>
</body>
</html>
    `;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/dashboard" className="text-gray-600 hover:text-gray-800">
          ← Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-800 mt-4">
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
              className="px-3 py-1 bg-white border border-gray-300 rounded-lg text-sm hover:border-gray-500"
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
          <form onSubmit={handleGenerate} className="bg-white p-6 rounded-lg shadow-sm mt-6 border border-gray-200">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Curriculum Type
                </label>
                <select
                  value={curriculum}
                  onChange={(e) => setCurriculum(e.target.value)}
                  className="mt-1 w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
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
                  className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
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
                  className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
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
                  className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
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
                  className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>

              <button
                type="submit"
                disabled={isGenerating}
                className="bg-gray-800 text-white px-6 py-3 rounded-md hover:bg-gray-700 disabled:opacity-50 w-full font-semibold"
              >
                {isGenerating ? "Generating..." : "Generate Lesson"}
              </button>
            </div>
          </form>
        ) : (
          <div className="bg-white p-6 rounded-lg shadow-sm mt-6 border border-gray-200">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">
                  {generatedLesson.title || generatedLesson.topic}
                </h2>
                <p className="text-gray-600">
                  {generatedLesson.grade} · {generatedLesson.subject}
                </p>
                <p className="text-sm text-gray-500">⏱️ {generatedLesson.duration || "40 min"}</p>
                {generatedLesson.curriculum && (
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full inline-block mt-1">
                    {generatedLesson.curriculum.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={exportToPDF}
                  className="bg-gray-700 text-white px-3 py-1 rounded-md text-sm hover:bg-gray-600"
                >
                  📄 PDF
                </button>
                <button
                  onClick={exportToWord}
                  className="bg-gray-700 text-white px-3 py-1 rounded-md text-sm hover:bg-gray-600"
                >
                  📝 Word
                </button>
              </div>
            </div>

            {generatedLesson.curriculum === "obc" && (
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="text-center border-b-2 border-gray-300 pb-4 mb-4">
                  <h3 className="text-xl font-bold text-gray-800">MINISTRY OF EDUCATION</h3>
                  <h4 className="text-lg font-semibold">{generatedLesson.school || "KASHINAKAZHI SECONDARY SCHOOL"}</h4>
                  <h4 className="text-lg font-semibold">LESSON PLAN</h4>
                  <p className="text-sm">DEPARTMENT OF NATURAL SCIENCES</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                  <p><strong>NAME OF TEACHER:</strong> {generatedLesson.teacherName || "_________________"}</p>
                  <p><strong>SUBJECT:</strong> {generatedLesson.subject}</p>
                  <p><strong>TOPIC:</strong> {generatedLesson.title}</p>
                  <p><strong>SUBTOPIC:</strong> {generatedLesson.subtopic || "_________________"}</p>
                  <p><strong>DATE:</strong> {generatedLesson.date || "_________________"}</p>
                  <p><strong>DURATION:</strong> {generatedLesson.duration || "80 MINUTES"}</p>
                  <p><strong>CLASS:</strong> {generatedLesson.grade}</p>
                  <p><strong>NO. OF BOYS:</strong> {generatedLesson.boys || "___"}</p>
                  <p><strong>NO. OF GIRLS:</strong> {generatedLesson.girls || "___"}</p>
                </div>

                <div className="mb-3">
                  <h4 className="font-semibold text-gray-800 border-b border-gray-200 pb-1">REFERENCES:</h4>
                  <ul className="list-disc pl-5">
                    {(generatedLesson.references || ["_________________"]).map((r: string, i: number) => (
                      <li key={i} className="text-sm">{r}</li>
                    ))}
                  </ul>
                </div>

                <div className="mb-3">
                  <h4 className="font-semibold text-gray-800 border-b border-gray-200 pb-1">TEACHING &amp; LEARNING AIDS:</h4>
                  <ul className="list-disc pl-5">
                    {(generatedLesson.teachingAids || ["_________________"]).map((a: string, i: number) => (
                      <li key={i} className="text-sm">{a}</li>
                    ))}
                  </ul>
                </div>

                <div className="mb-3">
                  <h4 className="font-semibold text-gray-800 border-b border-gray-200 pb-1">RATIONALE:</h4>
                  <p className="text-sm">{generatedLesson.rationale || "_________________"}</p>
                </div>

                <div className="mb-3">
                  <h4 className="font-semibold text-gray-800 border-b border-gray-200 pb-1">LEARNING OUTCOMES:</h4>
                  <ol className="list-decimal pl-5">
                    {(generatedLesson.learningOutcomes || ["_________________"]).map((o: string, i: number) => (
                      <li key={i} className="text-sm">{o}</li>
                    ))}
                  </ol>
                </div>

                <div className="mb-3">
                  <h4 className="font-semibold text-gray-800 border-b border-gray-200 pb-1">LESSON DEVELOPMENT</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-300 text-sm">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="border border-gray-300 p-2">TIME</th>
                          <th className="border border-gray-300 p-2">LEARNING POINTS</th>
                          <th className="border border-gray-300 p-2">TEACHER'S ACTIVITIES</th>
                          <th className="border border-gray-300 p-2">PUPIL'S ACTIVITIES</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(generatedLesson.lessonDevelopment || []).map((item: any, index: number) => (
                          <tr key={index} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                            <td className="border border-gray-300 p-2 text-center font-medium">{item.time || ""}</td>
                            <td className="border border-gray-300 p-2">{item.learningPoints || ""}</td>
                            <td className="border border-gray-300 p-2">{item.teacherActivities || ""}</td>
                            <td className="border border-gray-300 p-2">{item.pupilActivities || ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mb-3">
                  <h4 className="font-semibold text-gray-800 border-b border-gray-200 pb-1">LEARNERS' EVALUATION:</h4>
                  <ol className="list-decimal pl-5">
                    {(generatedLesson.learnersEvaluation || ["_________________"]).map((q: string, i: number) => (
                      <li key={i} className="text-sm">{q}</li>
                    ))}
                  </ol>
                </div>

                <div className="mb-3">
                  <h4 className="font-semibold text-gray-800 border-b border-gray-200 pb-1">TEACHER'S EVALUATION:</h4>
                  <p className="text-sm italic">{generatedLesson.teacherEvaluation || "Space for teacher's reflections"}</p>
                </div>
              </div>
            )}

            {generatedLesson.curriculum === "cbc" && (
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <p className="text-center text-gray-600">CBC Lesson Plan Display</p>
              </div>
            )}

            <button
              onClick={() => setGeneratedLesson(null)}
              className="mt-6 text-gray-600 hover:text-gray-800"
            >
              ← Generate Another Lesson
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
