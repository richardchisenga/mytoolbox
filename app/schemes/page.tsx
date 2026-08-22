"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, CalendarIcon, ArrowDownTrayIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";

export default function SchemesPage() {
  const router = useRouter();
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [term, setTerm] = useState("1");
  const [totalWeeks, setTotalWeeks] = useState(13);
  const [assessmentWeeks, setAssessmentWeeks] = useState<number[]>([6, 13]);
  const [testTopics, setTestTopics] = useState<{ [key: number]: string }>({});
  const [weekTopics, setWeekTopics] = useState<{ [key: number]: string }>({});
  const [newAssessmentWeek, setNewAssessmentWeek] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedScheme, setGeneratedScheme] = useState<any>(null);
  const [error, setError] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);

  const addAssessmentWeek = () => {
    const week = parseInt(newAssessmentWeek);
    if (!week || week < 1 || week > totalWeeks) {
      alert(`Please enter a valid week (1-${totalWeeks})`);
      return;
    }
    if (assessmentWeeks.includes(week)) {
      alert(`Week ${week} is already an assessment week`);
      return;
    }
    setAssessmentWeeks([...assessmentWeeks, week].sort((a, b) => a - b));
    setNewAssessmentWeek("");
  };

  const removeAssessmentWeek = (week: number) => {
    setAssessmentWeeks(assessmentWeeks.filter(w => w !== week));
    const newTopics = { ...testTopics };
    delete newTopics[week];
    setTestTopics(newTopics);
  };

  const updateTestTopic = (week: number, topic: string) => {
    setTestTopics({ ...testTopics, [week]: topic });
  };

  const updateWeekTopic = (week: number, topic: string) => {
    setWeekTopics({ ...weekTopics, [week]: topic });
  };

  const generateScheme = async () => {
    setError("");
    if (!grade || !subject) {
      setError("Please select grade and subject");
      return;
    }

    if (assessmentWeeks.length === 0) {
      setError("Please add at least one assessment week");
      return;
    }

    const missingTopics = [];
    for (let i = 1; i <= totalWeeks; i++) {
      if (!weekTopics[i] && !assessmentWeeks.includes(i)) {
        missingTopics.push(i);
      }
    }
    if (missingTopics.length > 0) {
      setError(`Please add topics for weeks: ${missingTopics.join(', ')}`);
      return;
    }

    setIsGenerating(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        router.push("/login");
        return;
      }

      const testTopicMap: { [key: number]: string } = {};
      assessmentWeeks.forEach(week => {
        testTopicMap[week] = testTopics[week] || `Assessment - Week ${week}`;
      });

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/schemes/generate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            grade,
            subject,
            term,
            weeks: totalWeeks,
            assessmentWeeks,
            testTopics: testTopicMap,
            weekTopics,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to generate scheme");
      }

      const data = await response.json();
      setGeneratedScheme(data);
    } catch (error: any) {
      console.error("Generation failed:", error);
      setError(error.message || "Failed to generate scheme. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadScheme = async (format: 'word' | 'pdf') => {
    if (!generatedScheme) return;
    
    setIsDownloading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/schemes/export/${generatedScheme.id}/${format}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${generatedScheme.subject}_Scheme_of_Work_Term_${generatedScheme.term}.${format === 'word' ? 'docx' : 'pdf'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        alert('Failed to download scheme');
      }
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download scheme');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-8 border-b-2 border-gray-300 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="text-gray-600 hover:text-gray-800">
                <ArrowLeftIcon className="w-5 h-5" />
              </Link>
              <h1 className="text-2xl font-bold text-gray-800">Schemes of Work</h1>
            </div>
            <nav className="flex gap-6 text-sm">
              <Link href="/dashboard" className="text-gray-600 hover:text-gray-800">Dashboard</Link>
              <Link href="/generate" className="text-gray-600 hover:text-gray-800">Generate</Link>
              <Link href="/schemes" className="text-gray-900 font-semibold">Schemes</Link>
            </nav>
          </div>
        </header>

        {!generatedScheme ? (
          <>
            <p className="text-gray-600 mb-6">
              Generate a full-term scheme of work with custom topics and assessment weeks
            </p>

            {error && (
              <div className="max-w-4xl p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm mb-4">
                ❌ {error}
              </div>
            )}

            <div className="max-w-4xl bg-white border border-gray-300 rounded-lg p-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Grade</label>
                  <select
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                  >
                    <option value="">Select grade</option>
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"].map((g) => (
                      <option key={g}>Grade {g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                    placeholder="e.g. Biology"
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Term</label>
                  <select
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                  >
                    <option value="1">Term 1</option>
                    <option value="2">Term 2</option>
                    <option value="3">Term 3</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Total Weeks</label>
                  <input
                    type="number"
                    value={totalWeeks}
                    onChange={(e) => setTotalWeeks(parseInt(e.target.value) || 13)}
                    className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                    min="1"
                    max="20"
                  />
                </div>
              </div>

              {/* Week Topics */}
              <div className="mt-6 border-t border-gray-200 pt-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Week Topics</h3>
                <p className="text-sm text-gray-500 mb-3">
                  Enter the topic for each week. Assessment weeks will be marked automatically.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Array.from({ length: totalWeeks }, (_, i) => {
                    const week = i + 1;
                    const isAssessment = assessmentWeeks.includes(week);
                    return (
                      <div key={week} className="p-3 rounded-lg border border-gray-200 bg-white">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-700">
                            Week {week}
                            {isAssessment && (
                              <span className="ml-2 text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">Test</span>
                            )}
                          </span>
                          {isAssessment && (
                            <span className="text-xs text-gray-500">(Assessment week)</span>
                          )}
                        </div>
                        {isAssessment ? (
                          <input
                            type="text"
                            value={testTopics[week] || `Assessment - Week ${week}`}
                            onChange={(e) => updateTestTopic(week, e.target.value)}
                            placeholder="Enter test topic"
                            className="mt-1 w-full px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 text-sm"
                          />
                        ) : (
                          <input
                            type="text"
                            value={weekTopics[week] || ""}
                            onChange={(e) => updateWeekTopic(week, e.target.value)}
                            placeholder={`Enter topic for Week ${week}`}
                            className="mt-1 w-full px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400 text-sm"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Assessment Weeks */}
              <div className="mt-6 border-t border-gray-200 pt-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Select Assessment Weeks</h3>
                <p className="text-sm text-gray-500 mb-3">
                  Add weeks that will have tests or assessments
                </p>

                <div className="flex gap-2">
                  <input
                    type="number"
                    value={newAssessmentWeek}
                    onChange={(e) => setNewAssessmentWeek(e.target.value)}
                    placeholder={`Week (1-${totalWeeks})`}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                    min="1"
                    max={totalWeeks}
                  />
                  <button
                    onClick={addAssessmentWeek}
                    className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 flex items-center gap-1"
                  >
                    <PlusIcon className="w-4 h-4" /> Add
                  </button>
                </div>

                {assessmentWeeks.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {assessmentWeeks.map((week) => (
                      <span key={week} className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                        Week {week}
                        <button
                          onClick={() => removeAssessmentWeek(week)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-6">
                <button
                  onClick={generateScheme}
                  disabled={isGenerating}
                  className="bg-gray-800 text-white px-6 py-2 rounded-md hover:bg-gray-700 disabled:opacity-50"
                >
                  {isGenerating ? "Generating..." : "Generate Scheme"}
                </button>
              </div>
            </div>
          </>
        ) : (
          // ============================================
          // GENERATED SCHEME - DOCUMENT STYLE
          // ============================================
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <button
                  onClick={() => setGeneratedScheme(null)}
                  className="text-gray-600 hover:text-gray-800 flex items-center gap-2 mb-2"
                >
                  <ArrowLeftIcon className="w-4 h-4" /> New scheme
                </button>
                <h2 className="text-2xl font-bold text-gray-800">
                  {generatedScheme.school} — {generatedScheme.subject}
                </h2>
                <p className="text-sm text-gray-600">
                  {generatedScheme.grade} · {generatedScheme.term} · {generatedScheme.year}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Assessment Weeks: {generatedScheme.assessmentWeeks?.join(', ') || 'None'}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => downloadScheme('word')}
                  disabled={isDownloading}
                  className="bg-gray-800 text-white px-4 py-2 rounded-md hover:bg-gray-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <ArrowDownTrayIcon className="w-4 h-4" /> Word
                </button>
                <button
                  onClick={() => downloadScheme('pdf')}
                  disabled={isDownloading}
                  className="bg-gray-800 text-white px-4 py-2 rounded-md hover:bg-gray-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <ArrowDownTrayIcon className="w-4 h-4" /> PDF
                </button>
              </div>
            </div>

            {/* Document-Style Table */}
            <div className="bg-white border border-gray-300 rounded-lg overflow-x-auto shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100 border-b-2 border-gray-300">
                    <th className="p-2 border-r border-gray-300 text-center font-bold text-gray-800">WEEK</th>
                    <th className="p-2 border-r border-gray-300 text-left font-bold text-gray-800">TOPIC</th>
                    <th className="p-2 border-r border-gray-300 text-left font-bold text-gray-800">TYPE</th>
                    <th className="p-2 border-r border-gray-300 text-left font-bold text-gray-800">SPECIFIC OUTCOME</th>
                    <th className="p-2 border-r border-gray-300 text-left font-bold text-gray-800">METHODS</th>
                    <th className="p-2 border-r border-gray-300 text-left font-bold text-gray-800">AIDS</th>
                    <th className="p-2 border-r border-gray-300 text-left font-bold text-gray-800">KNOWLEDGE</th>
                    <th className="p-2 border-r border-gray-300 text-left font-bold text-gray-800">SKILLS</th>
                    <th className="p-2 border-l border-gray-300 text-left font-bold text-gray-800">VALUES</th>
                  </tr>
                </thead>
                <tbody>
                  {generatedScheme.weeks.map((week: any, idx: number) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="p-2 border border-gray-300 text-center font-bold">{week.week}</td>
                      <td className="p-2 border border-gray-300">
                        <strong>{week.topic}</strong>
                      </td>
                      <td className="p-2 border border-gray-300 text-center">
                        {week.isAssessment ? (
                          <span className="px-2 py-1 bg-gray-200 text-gray-700 rounded-full text-xs font-semibold">TEST</span>
                        ) : (
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">Lesson</span>
                        )}
                      </td>
                      <td className="p-2 border border-gray-300 text-xs">{week.specificOutcome}</td>
                      <td className="p-2 border border-gray-300 text-xs">
                        {week.methods && week.methods.map((m: string, i: number) => (
                          <div key={i}>• {m}</div>
                        ))}
                      </td>
                      <td className="p-2 border border-gray-300 text-xs">
                        {week.aids && week.aids.map((a: string, i: number) => (
                          <div key={i}>• {a}</div>
                        ))}
                      </td>
                      <td className="p-2 border border-gray-300 text-xs">{week.knowledge || '-'}</td>
                      <td className="p-2 border border-gray-300 text-xs">{week.skills || '-'}</td>
                      <td className="p-2 border border-gray-300 text-xs">{week.values || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 bg-gray-50 border border-gray-300 rounded-lg p-4 flex flex-wrap items-center gap-3">
              <span className="text-gray-700 font-semibold">✓ CDC Mapped</span>
              <span className="text-sm text-gray-500">|</span>
              <span className="text-sm text-gray-500">{generatedScheme.totalWeeks} weeks · Full term coverage</span>
              <span className="text-sm text-gray-500">|</span>
              <span className="text-sm text-gray-700 font-semibold">100% aligned to syllabus</span>
              <span className="text-sm text-gray-500">|</span>
              <span className="text-sm text-gray-600 font-semibold">📝 {generatedScheme.assessmentWeeks?.length || 0} assessment weeks</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
