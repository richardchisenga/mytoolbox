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

      // Normalize OBC development fields for data returned by older/newer
      // backend generators. This keeps the screen and exports compatible.
      if (data.curriculum === "obc" && Array.isArray(data.lessonDevelopment)) {
        data.lessonDevelopment = data.lessonDevelopment.map((item: any) => ({
          ...item,
          learningPoints: item.learningPoints ?? item.content ?? "",
          teacherActivities: item.teacherActivities ?? item.teacherActivity ?? "",
          pupilActivities: item.pupilActivities ?? item.pupilActivity ?? ""
        }));
      }

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

  // ============================================
  // EXPORT FUNCTIONS
  // ============================================

  const exportToPDF = () => {
    if (!generatedLesson) return;

    // Print a clean, dedicated lesson document. The browser's Print dialog can
    // then be saved as PDF, and OBC's lesson-development table is included.
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1000,height=800');
    if (!printWindow) {
      alert('Please allow pop-ups for this site to export the lesson as PDF.');
      return;
    }

    const html = generateWordHTML(generatedLesson).replace(
      '</head>',
      `<style>@page { size: A4 portrait; margin: 12mm; } body { margin: 0 !important; } table { page-break-inside: auto; } tr { page-break-inside: avoid; page-break-after: auto; } .section { break-inside: auto; }</style></head>`
    );
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
    };
  };

  const exportToWord = () => {
    if (!generatedLesson) return;
    const content = generateWordHTML(generatedLesson);
    const blob = new Blob([content], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${generatedLesson.title || generatedLesson.topic}_lesson_plan.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ============================================
  // OBC FORMAT - Ministry of Education Template
  // ============================================

  const generateOBCWordHTML = (lesson: any) => {
    const development = Array.isArray(lesson.lessonDevelopment) && lesson.lessonDevelopment.length
      ? lesson.lessonDevelopment
      : [
          { time: '10 min', learningPoints: `Meaning, characteristics and examples of ${lesson.topic || lesson.title || 'the topic'}`, teacherActivities: `Introduce ${lesson.topic || lesson.title || 'the topic'} using a relevant example and ask focused questions.`, pupilActivities: `Discuss the example, define the topic in their own words and give one relevant example.` },
          { time: '15 min', learningPoints: `Key concepts or stages of ${lesson.topic || lesson.title || 'the topic'}`, teacherActivities: `Guide learners through the key concepts or stages using examples and probing questions.`, pupilActivities: `Identify, discuss and record the key concepts or stages.` },
          { time: '15 min', learningPoints: `Application and practice of ${lesson.topic || lesson.title || 'the topic'}`, teacherActivities: `Facilitate a topic-specific task or problem-solving activity.`, pupilActivities: `Complete the task and explain their answers.` },
          { time: '10 min', learningPoints: `Summary and assessment of ${lesson.topic || lesson.title || 'the topic'}`, teacherActivities: `Ask topic-specific assessment questions and correct misconceptions.`, pupilActivities: `Answer questions and summarise the key points learned.` }
        ];

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Lesson Plan - ${lesson.title || lesson.topic}</title>
  <style>
    body { font-family: 'Times New Roman', Times, serif; margin: 40px; font-size: 12pt; line-height: 1.5; }
    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
    .header h1 { font-size: 18pt; margin: 0; font-weight: bold; }
    .header h2 { font-size: 16pt; margin: 5px 0; }
    .header h3 { font-size: 14pt; margin: 5px 0; }
    .header p { margin: 3px 0; font-size: 12pt; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 20px; margin: 10px 0; }
    .info-grid p { margin: 3px 0; font-size: 12pt; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 11pt; }
    th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background-color: #e0e0e0; font-weight: bold; }
    .section { margin: 15px 0; }
    .section h4 { border-bottom: 1px solid #000; padding-bottom: 3px; font-size: 13pt; margin-bottom: 5px; font-weight: bold; }
    ul, ol { margin: 3px 0; padding-left: 20px; }
    li { margin: 2px 0; font-size: 12pt; }
    .footer { text-align: center; border-top: 2px solid #000; padding-top: 10px; margin-top: 20px; font-size: 10pt; }
    .teacher-eval { font-style: italic; padding: 10px; border-left: 3px solid #666; background: #f9f9f9; }
    @media print { body { margin: 30px; } th { background-color: #e0e0e0 !important; } }
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
  <ul>${(lesson.references || ["_________________"]).map((r: string) => `<li>${r}</li>`).join("")}</ul>
</div>

<div class="section">
  <h4>TEACHING &amp; LEARNING AIDS:</h4>
  <ul>${(lesson.teachingAids || ["_________________"]).map((a: string) => `<li>${a}</li>`).join("")}</ul>
</div>

<div class="section">
  <h4>RATIONALE:</h4>
  <p>${lesson.rationale || "_________________"}</p>
</div>

<div class="section">
  <h4>LEARNING OUTCOMES:</h4>
  <ol>${(lesson.learningOutcomes || ["_________________"]).map((o: string) => `<li>${o}</li>`).join("")}</ol>
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
      ${development.map((item: any) => `
        <tr>
          <td style="text-align:center;font-weight:bold;">${item.time || ""}</td>
          <td>${item.learningPoints ?? item.content ?? ""}</td>
          <td>${item.teacherActivities ?? item.teacherActivity ?? ""}</td>
          <td>${item.pupilActivities ?? item.pupilActivity ?? ""}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>
</div>

<div class="section">
  <h4>LEARNERS' EVALUATION</h4>
  <ol>${(lesson.learnersEvaluation || ["_________________"]).map((q: string) => `<li>${q}</li>`).join("")}</ol>
</div>

<div class="section">
  <h4>TEACHER'S EVALUATION</h4>
  <p class="teacher-eval">${lesson.teacherEvaluation || "Space for teacher's reflections"}</p>
</div>

<div class="footer">© 2026 mytoolbox - Made for teachers in Zambia</div>

</body>
</html>
    `;
  };

  // ============================================
  // CBC FORMAT - Ministry of Education Template
  // ============================================

  const generateCBCWordHTML = (lesson: any) => {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Lesson Plan - ${lesson.title || lesson.topic}</title>
  <style>
    body { font-family: 'Times New Roman', Times, serif; margin: 40px; font-size: 12pt; line-height: 1.5; }
    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
    .header h1 { font-size: 18pt; margin: 0; font-weight: bold; }
    .header h2 { font-size: 16pt; margin: 5px 0; }
    .header p { margin: 3px 0; font-size: 12pt; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 20px; margin: 10px 0; }
    .info-grid p { margin: 3px 0; font-size: 12pt; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 11pt; }
    th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background-color: #e0e0e0; font-weight: bold; }
    .section { margin: 15px 0; }
    .section h4 { border-bottom: 1px solid #000; padding-bottom: 3px; font-size: 13pt; margin-bottom: 5px; font-weight: bold; }
    ul, ol { margin: 3px 0; padding-left: 20px; }
    li { margin: 2px 0; font-size: 12pt; }
    .footer { text-align: center; border-top: 2px solid #000; padding-top: 10px; margin-top: 20px; font-size: 10pt; }
    .teacher-eval { font-style: italic; padding: 10px; border-left: 3px solid #666; background: #f9f9f9; }
    @media print { body { margin: 30px; } th { background-color: #e0e0e0 !important; } }
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
  <p><strong>DATE:</strong> ${lesson.date || "_________________"}</p>
  <p><strong>DURATION:</strong> ${lesson.duration || "40 min"}</p>
  <p><strong>CLASS:</strong> ${lesson.grade || ""}</p>
  <p><strong>NO. OF PUPILS:</strong> ${lesson.classSize || 40}</p>
  <p><strong>BOYS:</strong> ${lesson.boys || "___"} <strong>GIRLS:</strong> ${lesson.girls || "___"}</p>
</div>

<div class="section">
  <h4>GENERAL COMPETENCES</h4>
  <ul>${(lesson.generalCompetences || ["Analytical thinking", "Collaboration", "Communication", "Critical thinking"]).map((c: string) => `<li>${c}</li>`).join("")}</ul>
</div>

<div class="section">
  <h4>SPECIFIC COMPETENCE</h4>
  <p>${lesson.specificCompetence || "_________________"}</p>
</div>

<div class="section">
  <h4>LESSON GOAL</h4>
  <p>${lesson.lessonGoal || "_________________"}</p>
</div>

<div class="section">
  <h4>RATIONALE</h4>
  <p>${lesson.rationale || "_________________"}</p>
</div>

<div class="section">
  <h4>PRIOR KNOWLEDGE</h4>
  <p>${lesson.priorKnowledge || "_________________"}</p>
</div>

<div class="section">
  <h4>REFERENCES</h4>
  <ul>${(lesson.references || ["_________________"]).map((r: string) => `<li>${r}</li>`).join("")}</ul>
</div>

<div class="section">
  <h4>LEARNING ENVIRONMENT</h4>
  <p>${lesson.learningEnvironment || "Classroom, laboratory"}</p>
</div>

<div class="section">
  <h4>MATERIALS/RESOURCES</h4>
  <ul>${(lesson.materials || ["_________________"]).map((m: string) => `<li>${m}</li>`).join("")}</ul>
</div>

<div class="section">
  <h4>EXPECTED STANDARD</h4>
  <p>${lesson.expectedStandard || "_________________"}</p>
</div>

<div class="section">
  <h4>LESSON PROGRESSION</h4>
  <table>
    <thead>
      <tr>
        <th style="width:15%;">STAGE/TIME</th>
        <th style="width:28%;">TEACHER'S ROLE</th>
        <th style="width:28%;">LEARNERS' ROLE</th>
        <th style="width:29%;">ASSESSMENT CRITERIA</th>
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
  <h4>HOMEWORK</h4>
  <p>${lesson.homework || "_________________"}</p>
</div>

<div class="section">
  <h4>LESSON EVALUATION</h4>
  <p>${lesson.lessonEvaluation || "_________________"}</p>
</div>

<div class="footer">© 2026 mytoolbox - Made for teachers in Zambia</div>

</body>
</html>
    `;
  };

  const generateWordHTML = (lesson: any) => {
    if (lesson.curriculum === "obc") {
      return generateOBCWordHTML(lesson);
    }
    return generateCBCWordHTML(lesson);
  };

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <div className="min-h-screen bg-white p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/dashboard" className="text-gray-600 hover:text-gray-800">
          ← Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-800 mt-4">Create a New Lesson</h1>
        <p className="text-gray-600 mt-2">Generate curriculum-aligned lesson plans in seconds</p>

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
                <label className="block text-sm font-medium text-gray-700">Curriculum Type</label>
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
                <label className="block text-sm font-medium text-gray-700">Grade</label>
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
                <label className="block text-sm font-medium text-gray-700">Subject</label>
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
                <label className="block text-sm font-medium text-gray-700">Topic</label>
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
                <label className="block text-sm font-medium text-gray-700">Class Size</label>
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
                <p className="text-gray-600">{generatedLesson.grade} · {generatedLesson.subject}</p>
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
                  PDF
                </button>
                <button
                  onClick={exportToWord}
                  className="bg-gray-700 text-white px-3 py-1 rounded-md text-sm hover:bg-gray-600"
                >
                  Word
                </button>
              </div>
            </div>

            {/* ============================================ */}
            {/* OBC FORMAT DISPLAY */}
            {/* ============================================ */}
            {generatedLesson.curriculum === "obc" && (
              <div className="border border-gray-300 rounded-lg p-4 bg-white">
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
                            <td className="border border-gray-300 p-2">{item.learningPoints ?? item.content ?? ""}</td>
                            <td className="border border-gray-300 p-2">{item.teacherActivities ?? item.teacherActivity ?? ""}</td>
                            <td className="border border-gray-300 p-2">{item.pupilActivities ?? item.pupilActivity ?? ""}</td>
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

            {/* ============================================ */}
            {/* CBC FORMAT DISPLAY */}
            {/* ============================================ */}
            {generatedLesson.curriculum === "cbc" && (
              <div className="border border-gray-300 rounded-lg p-4 bg-white">
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
                  <p><strong>DATE:</strong> {generatedLesson.date || "_________________"}</p>
                  <p><strong>DURATION:</strong> {generatedLesson.duration || "40 min"}</p>
                  <p><strong>CLASS:</strong> {generatedLesson.grade}</p>
                  <p><strong>NO. OF PUPILS:</strong> {generatedLesson.classSize || 40}</p>
                  <p><strong>BOYS:</strong> {generatedLesson.boys || "___"} <strong>GIRLS:</strong> {generatedLesson.girls || "___"}</p>
                </div>

                <div className="mb-3">
                  <h4 className="font-semibold text-gray-800 border-b border-gray-200 pb-1">GENERAL COMPETENCES</h4>
                  <ul className="list-disc pl-5">
                    {(generatedLesson.generalCompetences || ["Analytical thinking", "Collaboration", "Communication", "Critical thinking"]).map((c: string, i: number) => (
                      <li key={i} className="text-sm">{c}</li>
                    ))}
                  </ul>
                </div>

                <div className="mb-3">
                  <h4 className="font-semibold text-gray-800 border-b border-gray-200 pb-1">SPECIFIC COMPETENCE</h4>
                  <p className="text-sm">{generatedLesson.specificCompetence || "_________________"}</p>
                </div>

                <div className="mb-3">
                  <h4 className="font-semibold text-gray-800 border-b border-gray-200 pb-1">LESSON GOAL</h4>
                  <p className="text-sm">{generatedLesson.lessonGoal || "_________________"}</p>
                </div>

                <div className="mb-3">
                  <h4 className="font-semibold text-gray-800 border-b border-gray-200 pb-1">RATIONALE</h4>
                  <p className="text-sm">{generatedLesson.rationale || "_________________"}</p>
                </div>

                <div className="mb-3">
                  <h4 className="font-semibold text-gray-800 border-b border-gray-200 pb-1">PRIOR KNOWLEDGE</h4>
                  <p className="text-sm">{generatedLesson.priorKnowledge || "_________________"}</p>
                </div>

                <div className="mb-3">
                  <h4 className="font-semibold text-gray-800 border-b border-gray-200 pb-1">REFERENCES</h4>
                  <ul className="list-disc pl-5">
                    {(generatedLesson.references || ["_________________"]).map((r: string, i: number) => (
                      <li key={i} className="text-sm">{r}</li>
                    ))}
                  </ul>
                </div>

                <div className="mb-3">
                  <h4 className="font-semibold text-gray-800 border-b border-gray-200 pb-1">LEARNING ENVIRONMENT</h4>
                  <p className="text-sm">{generatedLesson.learningEnvironment || "Classroom, laboratory"}</p>
                </div>

                <div className="mb-3">
                  <h4 className="font-semibold text-gray-800 border-b border-gray-200 pb-1">MATERIALS/RESOURCES</h4>
                  <ul className="list-disc pl-5">
                    {(generatedLesson.materials || ["_________________"]).map((m: string, i: number) => (
                      <li key={i} className="text-sm">{m}</li>
                    ))}
                  </ul>
                </div>

                <div className="mb-3">
                  <h4 className="font-semibold text-gray-800 border-b border-gray-200 pb-1">EXPECTED STANDARD</h4>
                  <p className="text-sm">{generatedLesson.expectedStandard || "_________________"}</p>
                </div>

                <div className="mb-3">
                  <h4 className="font-semibold text-gray-800 border-b border-gray-200 pb-1">LESSON PROGRESSION</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-300 text-sm">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="border border-gray-300 p-2">STAGE/TIME</th>
                          <th className="border border-gray-300 p-2">TEACHER'S ROLE</th>
                          <th className="border border-gray-300 p-2">LEARNERS' ROLE</th>
                          <th className="border border-gray-300 p-2">ASSESSMENT CRITERIA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(generatedLesson.lessonProgression || []).map((item: any, index: number) => (
                          <tr key={index} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                            <td className="border border-gray-300 p-2">
                              <strong>{item.stage || "Stage"}</strong><br />
                              <span className="text-xs">{item.time || ""}</span>
                            </td>
                            <td className="border border-gray-300 p-2">{item.teacherRole || ""}</td>
                            <td className="border border-gray-300 p-2">{item.learnerRole || ""}</td>
                            <td className="border border-gray-300 p-2">{item.assessmentCriteria || ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mb-3">
                  <h4 className="font-semibold text-gray-800 border-b border-gray-200 pb-1">HOMEWORK</h4>
                  <p className="text-sm">{generatedLesson.homework || "_________________"}</p>
                </div>

                <div className="mb-3">
                  <h4 className="font-semibold text-gray-800 border-b border-gray-200 pb-1">LESSON EVALUATION</h4>
                  <p className="text-sm">{generatedLesson.lessonEvaluation || "_________________"}</p>
                </div>
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
