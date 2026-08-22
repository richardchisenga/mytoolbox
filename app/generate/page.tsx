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
    // ... same as before
    return `<!DOCTYPE html>...`;
  };

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
          <form onSubmit={handleGenerate} className="bg-white p-6 rounded-xl shadow-md mt-6">
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

            {/* OBC Format Display */}
            {generatedLesson.curriculum === 'obc' && (
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                {/* Header */}
                <div className="text-center border-b-2 border-primary pb-4 mb-4">
                  <h3 className="text-xl font-bold text-primary">MINISTRY OF EDUCATION</h3>
                  <h4 className="text-lg font-semibold">{generatedLesson.school || 'KASHINAKAZHI SECONDARY SCHOOL'}</h4>
                  <h4 className="text-lg font-semibold">LESSON PLAN</h4>
                  <p className="text-sm">DEPARTMENT OF NATURAL SCIENCES</p>
                </div>

                {/* Teacher Info Grid */}
                <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                  <p><strong>NAME OF TEACHER:</strong> {generatedLesson.teacherName || '_________________'}</p>
                  <p><strong>SUBJECT:</strong> {generatedLesson.subject}</p>
                  <p><strong>TOPIC:</strong> {generatedLesson.title}</p>
                  <p><strong>SUBTOPIC:</strong> {generatedLesson.subtopic || '_________________'}</p>
                  <p><strong>DATE:</strong> {generatedLesson.date || '_________________'}</p>
                  <p><strong>DURATION:</strong> {generatedLesson.duration || '80 MINUTES'}</p>
                  <p><strong>CLASS:</strong> {generatedLesson.grade}</p>
                  <p><strong>NO. OF BOYS:</strong> {generatedLesson.boys || '___'}</p>
                  <p><strong>NO. OF GIRLS:</strong> {generatedLesson.girls || '___'}</p>
                </div>

                {/* References */}
                <div className="mb-3">
                  <h4 className="font-semibold text-primary">REFERENCES:</h4>
                  <ul className="list-disc pl-5">
                    {(generatedLesson.references || ['_________________']).map((r: string, i: number) => (
                      <li key={i} className="text-sm">{r}</li>
                    ))}
                  </ul>
                </div>

                {/* Teaching Aids */}
                <div className="mb-3">
                  <h4 className="font-semibold text-primary">TEACHING &amp; LEARNING AIDS:</h4>
                  <ul className="list-disc pl-5">
                    {(generatedLesson.teachingAids || ['_________________']).map((a: string, i: number) => (
                      <li key={i} className="text-sm">{a}</li>
                    ))}
                  </ul>
                </div>

                {/* Rationale */}
                <div className="mb-3">
                  <h4 className="font-semibold text-primary">RATIONALE:</h4>
                  <p className="text-sm">{generatedLesson.rationale || '_________________'}</p>
                </div>

                {/* Learning Outcomes */}
                <div className="mb-3">
                  <h4 className="font-semibold text-primary">LEARNING OUTCOMES:</h4>
                  <ol className="list-decimal pl-5">
                    {(generatedLesson.learningOutcomes || ['_________________']).map((o: string, i: number) => (
                      <li key={i} className="text-sm">{o}</li>
                    ))}
                  </ol>
                </div>

                {/* Lesson Development Table */}
                <div className="mb-3">
                  <h4 className="font-semibold text-primary">LESSON DEVELOPMENT</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-300 text-sm">
                      <thead>
                        <tr className="bg-primary text-white">
                          <th className="border border-gray-300 p-2">TIME</th>
                          <th className="border border-gray-300 p-2">LEARNING POINTS</th>
                          <th className="border border-gray-300 p-2">TEACHER'S ACTIVITIES</th>
                          <th className="border border-gray-300 p-2">PUPIL'S ACTIVITIES</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(generatedLesson.lessonDevelopment || []).map((item: any, index: number) => (
                          <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                            <td className="border border-gray-300 p-2 text-center font-medium">{item.time || ''}</td>
                            <td className="border border-gray-300 p-2">{item.learningPoints || ''}</td>
                            <td className="border border-gray-300 p-2">{item.teacherActivities || ''}</td>
                            <td className="border border-gray-300 p-2">{item.pupilActivities || ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Learners Evaluation */}
                <div className="mb-3">
                  <h4 className="font-semibold text-primary">LEARNERS' EVALUATION</h4>
                  <ol className="list-decimal pl-5">
                    {(generatedLesson.learnersEvaluation || ['_________________']).map((q: string, i: number) => (
                      <li key={i} className="text-sm">{q}</li>
                    ))}
                  </ol>
                </div>

                {/* Teacher's Evaluation */}
                <div className="mb-3">
                  <h4 className="font-semibold text-primary">TEACHER'S EVALUATION</h4>
                  <p className="text-sm italic">{generatedLesson.teacherEvaluation || 'Space for teacher\'s reflections'}</p>
                </div>
              </div>
            )}

            {/* CBC Format Display */}
            {generatedLesson.curriculum === 'cbc' && (
              // ... CBC display code
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <p className="text-center">CBC Lesson Plan Display</p>
              </div>
            )}

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
