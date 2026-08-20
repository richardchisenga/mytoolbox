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

  // Export to Word/HTML
  const exportScheme = () => {
    if (!generatedScheme) return;
    
    const content = `
<!DOCTYPE html>
<html>
<head>
  <title>Scheme of Work - ${generatedScheme.subject}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 30px; }
    .header { text-align: center; border-bottom: 3px solid #1B5E20; padding-bottom: 10px; margin-bottom: 20px; }
    .header h1 { color: #1B5E20; margin: 0; }
    .header h2 { margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #333; padding: 8px; text-align: left; vertical-align: top; }
    th { background-color: #1B5E20; color: white; font-weight: bold; }
    .week-col { width: 5%; text-align: center; }
    .topic-col { width: 15%; }
    .outcome-col { width: 15%; }
    .methods-col { width: 10%; }
    .aids-col { width: 10%; }
    .references-col { width: 10%; }
    .knowledge-col { width: 15%; }
    .skills-col { width: 10%; }
    .values-col { width: 10%; }
    .subtopic { font-size: 11px; color: #555; }
    .footer { text-align: center; border-top: 2px solid #1B5E20; padding-top: 10px; margin-top: 20px; font-size: 11px; color: #777; }
    @media print {
      body { margin: 15px; }
      th { background-color: #1B5E20 !important; color: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>KASHINAKAZHI SECONDARY SCHOOL</h1>
    <h2>${generatedScheme.subject} SCHEMES OF WORK</h2>
    <p><strong>${generatedScheme.grade} TERM ${generatedScheme.term}</strong></p>
  </div>

  <table>
    <thead>
      <tr>
        <th class="week-col">WEEK</th>
        <th class="topic-col">TOPIC</th>
        <th class="outcome-col">SPECIFIC OUTCOME</th>
        <th class="methods-col">TEACHING AND LEARNING METHODS</th>
        <th class="aids-col">TEACHING AND LEARNING AIDS</th>
        <th class="references-col">REFERENCE BOOKS</th>
        <th class="knowledge-col">KNOWLEDGE</th>
        <th class="skills-col">SKILLS</th>
        <th class="values-col">VALUES</th>
      </tr>
    </thead>
    <tbody>
      ${generatedScheme.weeks.map((week: any) => `
        <tr>
          <td class="week-col">${week.week}</td>
          <td class="topic-col">
            <strong>${week.topic}</strong>
            ${week.subtopics ? week.subtopics.map((s: string) => `<div class="subtopic">• ${s}</div>`).join('') : ''}
          </td>
          <td class="outcome-col">${week.specificOutcome}</td>
          <td class="methods-col">${week.methods ? week.methods.map((m: string) => `<div>${m}</div>`).join('') : ''}</td>
          <td class="aids-col">${week.aids ? week.aids.map((a: string) => `<div>${a}</div>`).join('') : ''}</td>
          <td class="references-col">${week.references ? week.references.map((r: string) => `<div>${r}</div>`).join('') : ''}</td>
          <td class="knowledge-col">${week.knowledge || ''}</td>
          <td class="skills-col">${week.skills || ''}</td>
          <td class="values-col">${week.values || ''}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    © 2026 mytoolbox - Made for teachers in Zambia
  </div>
</body>
</html>
    `;

    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generatedScheme.subject}_Scheme_of_Work_Term_${generatedScheme.term}.html`;
    a.click();
    URL.revokeObjectURL(url);
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
                  {generatedScheme.school} — {generatedScheme.subject}
                </h2>
                <p className="text-sm text-dark/60">
                  {generatedScheme.grade} · {generatedScheme.term} · {generatedScheme.year}
                </p>
              </div>
              <button
                onClick={exportScheme}
                className="btn-primary flex items-center gap-2"
              >
                <ArrowDownTrayIcon className="w-5 h-5" /> Export
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-highlight overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary text-white">
                    <th className="p-2 border border-highlight text-center w-12">WEEK</th>
                    <th className="p-2 border border-highlight text-left">TOPIC</th>
                    <th className="p-2 border border-highlight text-left">SPECIFIC OUTCOME</th>
                    <th className="p-2 border border-highlight text-left">TEACHING AND LEARNING METHODS</th>
                    <th className="p-2 border border-highlight text-left">TEACHING AND LEARNING AIDS</th>
                    <th className="p-2 border border-highlight text-left">REFERENCE BOOKS</th>
                    <th className="p-2 border border-highlight text-left">KNOWLEDGE</th>
                    <th className="p-2 border border-highlight text-left">SKILLS</th>
                    <th className="p-2 border border-highlight text-left">VALUES</th>
                  </tr>
                </thead>
                <tbody>
                  {generatedScheme.weeks.map((week: any, idx: number) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="p-2 border border-highlight text-center font-bold">{week.week}</td>
                      <td className="p-2 border border-highlight">
                        <strong>{week.topic}</strong>
                        {week.subtopics && week.subtopics.map((s: string, i: number) => (
                          <div key={i} className="text-xs text-gray-600">• {s}</div>
                        ))}
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
                      <td className="p-2 border border-highlight text-xs">
                        {week.references && week.references.map((r: string, i: number) => (
                          <div key={i}>• {r}</div>
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
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
