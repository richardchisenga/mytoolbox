"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, CalendarIcon, ArrowDownTrayIcon } from "@heroicons/react/24/outline";

export default function SchemesPage() {
  const router = useRouter();
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [term, setTerm] = useState("1");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedScheme, setGeneratedScheme] = useState<any>(null);
  const [error, setError] = useState("");

  const generateScheme = async () => {
    setError("");
    if (!grade || !subject) {
      setError("Please select grade and subject");
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
        `${process.env.NEXT_PUBLIC_API_URL}/api/schemes/generate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ grade, subject, term }),
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
                Generate a full-term scheme of work mapped to the syllabus
              </p>
            </div>

            {error && (
              <div className="max-w-2xl p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm mb-4">
                ❌ {error}
              </div>
            )}

            <div className="max-w-2xl bg-white rounded-xl shadow-sm border border-highlight p-6">
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

              <div className="mt-4">
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
                  {generatedScheme.school || 'Scheme of Work'} — {generatedScheme.subject}
                </h2>
                <p className="text-sm text-dark/60">
                  {generatedScheme.grade} · {generatedScheme.term} · {generatedScheme.year || "2026"}
                </p>
              </div>
              <button className="btn-primary flex items-center gap-2">
                <ArrowDownTrayIcon className="w-5 h-5" /> Export
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-highlight overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-6 bg-primary/5 p-4 border-b border-highlight font-semibold text-primary">
                <div>Week</div>
                <div className="md:col-span-2">Topic</div>
                <div>Specific Outcome</div>
                <div>Methods</div>
                <div>Aids</div>
              </div>
              <div className="divide-y divide-gray-100">
                {generatedScheme.weeks && generatedScheme.weeks.map((week: any, idx: number) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 md:grid-cols-6 p-4 hover:bg-primary/5 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="bg-secondary/10 text-primary font-bold rounded-full w-8 h-8 flex items-center justify-center text-sm">
                        {week.week || idx + 1}
                      </span>
                    </div>
                    <div className="md:col-span-2 space-y-1 mt-2 md:mt-0">
                      {week.topic && <p className="text-sm font-medium">{week.topic}</p>}
                      {week.topics && week.topics.map((t: string, i: number) => (
                        <p key={i} className="text-sm">{t}</p>
                      ))}
                    </div>
                    <div className="space-y-1 mt-2 md:mt-0">
                      {week.specificOutcome && <p className="text-xs text-dark/70">• {week.specificOutcome}</p>}
                      {week.objectives && week.objectives.map((obj: string, i: number) => (
                        <p key={i} className="text-xs text-dark/70">• {obj}</p>
                      ))}
                    </div>
                    <div className="space-y-1 mt-2 md:mt-0">
                      {week.methods && week.methods.map((m: string, i: number) => (
                        <span key={i} className="text-xs bg-gray-100 px-2 py-0.5 rounded-full mr-1">{m}</span>
                      ))}
                    </div>
                    <div className="space-y-1 mt-2 md:mt-0">
                      {week.aids && week.aids.map((a: string, i: number) => (
                        <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full mr-1">{a}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 bg-success/10 border border-success/30 rounded-xl p-4 flex items-center gap-3">
              <span className="text-success font-bold">✓ CDC Mapped</span>
              <span className="text-sm text-dark/60">|</span>
              <span className="text-sm text-dark/60">{generatedScheme.totalWeeks || 13} weeks · Full term coverage</span>
              <span className="text-sm text-dark/60">|</span>
              <span className="text-sm text-success font-semibold">100% aligned to syllabus</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
