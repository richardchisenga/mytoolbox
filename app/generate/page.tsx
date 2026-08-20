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
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-primary">
                  {generatedLesson.title}
                </h2>
                <p className="text-gray-600">
                  {generatedLesson.grade} · {generatedLesson.subject}
                </p>
                {generatedLesson.duration && (
                  <p className="text-sm text-gray-500">⏱️ {generatedLesson.duration}</p>
                )}
                {generatedLesson.curriculum && (
                  <p className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full inline-block mt-1">
                    {generatedLesson.curriculum.toUpperCase()}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button className="btn-primary text-sm px-4 py-2">📄 Export</button>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {/* CBC Template Display */}
              {generatedLesson.generalCompetences && (
                <div>
                  <h3 className="font-semibold text-primary">General Competences</h3>
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    {generatedLesson.generalCompetences.map((comp: string, i: number) => (
                      <li key={i} className="text-gray-700">{comp}</li>
                    ))}
                  </ul>
                </div>
              )}

              {generatedLesson.specificCompetence && (
                <div>
                  <h3 className="font-semibold text-primary">Specific Competence</h3>
                  <p className="text-gray-700 mt-1">{generatedLesson.specificCompetence}</p>
                </div>
              )}

              {generatedLesson.lessonGoal && (
                <div>
                  <h3 className="font-semibold text-primary">Lesson Goal</h3>
                  <p className="text-gray-700 mt-1">{generatedLesson.lessonGoal}</p>
                </div>
              )}

              {generatedLesson.rationale && (
                <div>
                  <h3 className="font-semibold text-primary">Rationale</h3>
                  <p className="text-gray-700 mt-1">{generatedLesson.rationale}</p>
                </div>
              )}

              {generatedLesson.priorKnowledge && (
                <div>
                  <h3 className="font-semibold text-primary">Prior Knowledge</h3>
                  <p className="text-gray-700 mt-1">{generatedLesson.priorKnowledge}</p>
                </div>
              )}

              {/* Lesson Progression / Development */}
              {(generatedLesson.lessonProgression || generatedLesson.lessonDevelopment) && (
                <div>
                  <h3 className="font-semibold text-primary">Lesson Progression</h3>
                  <div className="space-y-3 mt-2">
                    {(generatedLesson.lessonProgression || generatedLesson.lessonDevelopment).map((item: any, i: number) => (
                      <div key={i} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-primary">{item.stage || item.learningPoints}</span>
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{item.time}</span>
                        </div>
                        {item.teacherRole && <p className="text-sm text-gray-600 mt-1">👨‍🏫 {item.teacherRole}</p>}
                        {item.learnerRole && <p className="text-sm text-gray-600">👨‍🎓 {item.learnerRole}</p>}
                        {item.assessmentCriteria && <p className="text-sm text-gray-500 mt-1">📝 {item.assessmentCriteria}</p>}
                        {item.teacherActivities && <p className="text-sm text-gray-600 mt-1">👨‍🏫 {item.teacherActivities}</p>}
                        {item.pupilActivities && <p className="text-sm text-gray-600">👨‍🎓 {item.pupilActivities}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Learning Outcomes (OBC) */}
              {generatedLesson.learningOutcomes && (
                <div>
                  <h3 className="font-semibold text-primary">Learning Outcomes</h3>
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    {generatedLesson.learningOutcomes.map((outcome: string, i: number) => (
                      <li key={i} className="text-gray-700">{outcome}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* References */}
              {generatedLesson.references && generatedLesson.references.length > 0 && (
                <div>
                  <h3 className="font-semibold text-primary">References</h3>
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    {generatedLesson.references.map((ref: string, i: number) => (
                      <li key={i} className="text-gray-700">{ref}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Materials / Teaching Aids */}
              {(generatedLesson.materials || generatedLesson.teachingAids) && (
                <div>
                  <h3 className="font-semibold text-primary">
                    {generatedLesson.materials ? 'Materials' : 'Teaching Aids'}
                  </h3>
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    {(generatedLesson.materials || generatedLesson.teachingAids).map((item: string, i: number) => (
                      <li key={i} className="text-gray-700">{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {generatedLesson.expectedStandard && (
                <div>
                  <h3 className="font-semibold text-primary">Expected Standard</h3>
                  <p className="text-gray-700 mt-1">{generatedLesson.expectedStandard}</p>
                </div>
              )}

              {generatedLesson.homework && (
                <div>
                  <h3 className="font-semibold text-primary">Homework</h3>
                  <p className="text-gray-700 mt-1">{generatedLesson.homework}</p>
                </div>
              )}

              {generatedLesson.lessonEvaluation && (
                <div>
                  <h3 className="font-semibold text-primary">Lesson Evaluation</h3>
                  <p className="text-gray-700 mt-1">{generatedLesson.lessonEvaluation}</p>
                </div>
              )}
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
