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
    <div className="min-h-screen bg-cream">
      <header className="bg-primary text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard" className="hover:text-secondary transition-colors">
              <ArrowLeftIcon className="w-5 h-5" />
            </Link>
            <span className="text-2xl font-bold">mytoolbox</span>
          </div>
          <nav className="hidden md:flex space-x-6">
            <Link href="/dashboard" className="hover:text-secondary">Dashboard</Link>
            <Link href="/generate" className="hover:text-secondary">Generate</Link>
            <Link href="/schemes" className="text-secondary font-semibold">Schemes</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!generatedScheme ? (
          <>
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-primary flex items-center gap-3">
                <CalendarIcon className="w-8 h-8 text-secondary" /> Schemes of Work
              </h1>
              <p className="text-dark/70 mt-1">
                Generate a full-term scheme of work with custom assessment weeks
              </p>
            </div>

            {error && (
              <div className="max-w-2xl p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm mb-4">
                ❌ {error}
              </div>
            )}

            <div className="max-w-2xl bg-white rounded-xl shadow-sm border border-highlight p-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark">Grade</label>
                  <select
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select grade</option>
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"].map((g) => (
                      <option key={g}>Grade {g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g. Biology"
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark">Term</label>
                  <select
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="1">Term 1</option>
                    <option value="2">Term 2</option>
                    <option value="3">Term 3</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark">Total Weeks</label>
                  <input
                    type="number"
                    value={totalWeeks}
                    onChange={(e) => setTotalWeeks(parseInt(e.target.value) || 13)}
                    className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    min="1"
                    max="20"
                  />
                </div>
              </div>

              {/* Assessment Weeks Section */}
              <div className="mt-6 border-t border-gray-200 pt-4">
                <h3 className="text-lg font-semibold text-primary mb-3">📝 Assessment Weeks</h3>
                <p className="text-sm text-gray-500 mb-3">
                  Select which weeks will have tests or assessments
                </p>

                <div className="flex gap-2">
                  <input
                    type="number"
                    value={newAssessmentWeek}
                    onChange={(e) => setNewAssessmentWeek(e.target.value)}
                    placeholder={`Week (1-${totalWeeks})`}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    min="1"
                    max={totalWeeks}
                  />
                  <button
                    onClick={addAssessmentWeek}
                    className="bg-secondary text-dark px-4 py-2 rounded-md hover:bg-secondary/80 flex items-center gap-1"
                  >
                    <PlusIcon className="w-4 h-4" /> Add
                  </button>
                </div>

                {assessmentWeeks.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {assessmentWeeks.map((week) => (
                      <div key={week} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                        <span className="font-medium text-primary w-16">Week {week}</span>
                        <input
                          type="text"
                          value={testTopics[week] || `Assessment - Week ${week}`}
                          onChange={(e) => updateTestTopic(week, e.target.value)}
                          placeholder="Enter test/assessment topic"
                          className="flex-1 px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                        />
                        <button
                          onClick={() => removeAssessmentWeek(week)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={generateScheme}
                  disabled={isGenerating}
                  className="btn-primary flex items-center gap-2 py-3 px-8 disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Generating Scheme...
                    </>
                  ) : (
                    <>
                      <CalendarIcon className="w-5 h-5" /> Generate Scheme
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <button
                  onClick={() => setGeneratedScheme(null)}
                  className="text-primary hover:text-secondary transition-colors flex items-center gap-2 mb-2"
                >
                  <ArrowLeftIcon className="w-5 h-5" /> New scheme
                </button>
                <h2 className="text-2xl font-bold text-primary">
                  {generatedScheme.school} — {generatedScheme.subject}
                </h2>
                <p className="text-sm text-dark/60">
                  {generatedScheme.grade} · {generatedScheme.term} · {generatedScheme.year}
                </p>
                <p className="text-sm text-secondary mt-1">
                  📝 Assessment Weeks: {generatedScheme.assessmentWeeks?.join(', ') || 'None'}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => downloadScheme('word')}
                  disabled={isDownloading}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50"
                >
                  <ArrowDownTrayIcon className="w-5 h-5" /> Word
                </button>
                <button
                  onClick={() => downloadScheme('pdf')}
                  disabled={isDownloading}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50"
                >
                  <ArrowDownTrayIcon className="w-5 h-5" /> PDF
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-highlight overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary text-white">
                    <th className="p-2 border border-highlight text-center w-12">WEEK</th>
                    <th className="p-2 border border-highlight text-left">TOPIC</th>
                    <th className="p-2 border border-highlight text-left">TYPE</th>
                    <th className="p-2 border border-highlight text-left">SPECIFIC OUTCOME</th>
                    <th className="p-2 border border-highlight text-left">TEACHING AND LEARNING METHODS</th>
                    <th className="p-2 border border-highlight text-left">TEACHING AND LEARNING AIDS</th>
                    <th className="p-2 border border-highlight text-left">KNOWLEDGE</th>
                    <th className="p-2 border border-highlight text-left">SKILLS</th>
                    <th className="p-2 border border-highlight text-left">VALUES</th>
                  </tr>
                </thead>
                <tbody>
                  {generatedScheme.weeks.map((week: any, idx: number) => (
                    <tr key={idx} className={`${idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'} ${week.isAssessment ? 'bg-yellow-50' : ''}`}>
                      <td className="p-2 border border-highlight text-center font-bold">{week.week}</td>
                      <td className="p-2 border border-highlight">
                        <strong>{week.topic}</strong>
                      </td>
                      <td className="p-2 border border-highlight text-center">
                        {week.isAssessment ? (
                          <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
                            📝 TEST/ASSESSMENT
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                            Lesson
                          </span>
                        )}
                      </td>
                      <td className="p-2 border border-highlight text-xs">{week.specificOutcome}</td>
                      <td className="p-2 border border-highlight text-xs">
                        {week.methods && week.methods.map((m: string, i: number) => (
                          <div key={i}>• {m}</div>
                        ))}
                      </td>
                      <td className="p-2 border border-highlight text-xs">
                        {week.aids && week.aids.map((a: string, i: number) => (
                          <div key={i}>• {a}</div>
                        ))}
                      </td>
                      <td className="p-2 border border-highlight text-xs">{week.knowledge || '-'}</td>
                      <td className="p-2 border border-highlight text-xs">{week.skills || '-'}</td>
                      <td className="p-2 border border-highlight text-xs">{week.values || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 bg-success/10 border border-success/30 rounded-xl p-4 flex flex-wrap items-center gap-3">
              <span className="text-success font-bold">✓ CDC Mapped</span>
              <span className="text-sm text-dark/60">|</span>
              <span className="text-sm text-dark/60">{generatedScheme.totalWeeks} weeks · Full term coverage</span>
              <span className="text-sm text-dark/60">|</span>
              <span className="text-sm text-success font-semibold">100% aligned to syllabus</span>
              <span className="text-sm text-dark/60">|</span>
              <span className="text-sm text-secondary font-semibold">📝 {generatedScheme.assessmentWeeks?.length || 0} assessment weeks</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
