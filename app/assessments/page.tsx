"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, DocumentTextIcon, PlusIcon, TrashIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

interface Question {
  id: string;
  type: "multiple-choice" | "short-answer" | "essay";
  question: string;
  options?: string[];
  answer?: string;
  marks: number;
}

const API = process.env.NEXT_PUBLIC_API_URL || "";

export default function AssessmentsPage() {
  const [title, setTitle] = useState("");
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [type, setType] = useState("test");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [saved, setSaved] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const totalMarks = useMemo(() => questions.reduce((sum, q) => sum + Number(q.marks || 0), 0), [questions]);

  const authHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(`${API}/api/assessments`, { headers: authHeaders() });
        if (response.ok) {
          const data = await response.json();
          setSaved(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        console.error("Failed to load assessments", e);
      }
    };
    load();
  }, []);

  const addQuestion = () => setQuestions((current) => [
    ...current,
    { id: `q-${Date.now()}-${current.length}`, type: "short-answer", question: "", marks: 5 },
  ]);

  const removeQuestion = (id: string) => setQuestions((current) => current.filter((q) => q.id !== id));

  const updateQuestion = (id: string, field: keyof Question, value: any) => {
    setQuestions((current) => current.map((q) => q.id === id ? { ...q, [field]: value } : q));
  };

  const generateAssessment = async () => {
    setError(""); setMessage("");
    if (!title || !grade || !subject || !topic) {
      setError("Please provide title, grade, subject and topic.");
      return;
    }
    const token = localStorage.getItem("token");
    if (!token) { setError("Please sign in first."); return; }

    setIsGenerating(true);
    try {
      const response = await fetch(`${API}/api/assessments/generate`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ title, type, subject, grade, topic, description }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Failed to generate assessment");
      setQuestions(Array.isArray(data.questions) ? data.questions : []);
      setDescription(data.description || description);
      setMessage(`Assessment generated: ${data.questions?.length || 0} questions.`);
    } catch (e: any) {
      setError(e.message || "Failed to generate assessment.");
    } finally {
      setIsGenerating(false);
    }
  };

  const saveAssessment = async () => {
    setError(""); setMessage("");
    if (!title || !type || !questions.length) { setError("Generate or add at least one question before saving."); return; }
    setIsSaving(true);
    try {
      const response = await fetch(`${API}/api/assessments`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ title, type, subject, grade, description, questions, maxScore: totalMarks }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Failed to save assessment");
      setSaved((current) => [data, ...current].slice(0, 20));
      setMessage("Assessment saved successfully.");
    } catch (e: any) {
      setError(e.message || "Failed to save assessment.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-primary text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard" className="hover:text-secondary"><ArrowLeftIcon className="w-5 h-5" /></Link>
            <span className="text-2xl font-bold">mytoolbox</span>
          </div>
          <nav className="hidden md:flex space-x-6">
            <Link href="/dashboard" className="hover:text-secondary">Dashboard</Link>
            <Link href="/generate" className="hover:text-secondary">Lessons</Link>
            <Link href="/schemes" className="hover:text-secondary">Schemes</Link>
            <Link href="/assessments" className="text-secondary font-semibold">Assessments</Link>
            <Link href="/notes" className="hover:text-secondary">Notes</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary flex items-center gap-3"><DocumentTextIcon className="w-8 h-8 text-secondary" /> Activity Sheets & Assessments</h1>
          <p className="text-dark/70 mt-1">Create topic-specific worksheets, quizzes, tests and exams.</p>
        </div>

        {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700">⚠️ {error}</div>}
        {message && <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700">✅ {message}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <div className="bg-white rounded-xl shadow-sm border border-highlight p-6">
              <h2 className="text-lg font-semibold text-primary mb-4">Generate Assessment</h2>
              <div className="space-y-4">
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-md" placeholder="Title e.g. Photosynthesis Test" />
                <select value={type} onChange={(e) => setType(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-md">
                  <option value="quiz">Quiz</option><option value="test">Test</option><option value="exam">Exam</option><option value="assignment">Assignment</option>
                </select>
                <select value={grade} onChange={(e) => setGrade(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-md">
                  <option value="">Select grade/form</option>
                  {[...Array(12)].map((_, i) => <option key={`g${i+1}`}>Grade {i+1}</option>)}
                  {[...Array(6)].map((_, i) => <option key={`f${i+1}`}>Form {i+1}</option>)}
                </select>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-md" placeholder="Subject e.g. Biology" />
                <input value={topic} onChange={(e) => setTopic(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-md" placeholder="Specific topic e.g. Photosynthesis" />
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-md" rows={3} placeholder="Optional instructions or scope" />
                <button onClick={generateAssessment} disabled={isGenerating} className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 disabled:opacity-50">
                  {isGenerating ? <><ArrowPathIcon className="w-5 h-5 animate-spin" /> Generating...</> : <><DocumentTextIcon className="w-5 h-5" /> Generate Assessment</>}
                </button>
                <button onClick={saveAssessment} disabled={isSaving || !questions.length} className="btn-secondary w-full py-2.5 disabled:opacity-50">
                  {isSaving ? "Saving..." : `Save Assessment (${totalMarks} marks)`}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-highlight p-6 mt-6">
              <h2 className="text-lg font-semibold text-primary mb-3">Saved Assessments</h2>
              {saved.length === 0 ? <p className="text-sm text-dark/60">No saved assessments yet.</p> : <div className="space-y-2">{saved.map((a) => <div key={a.id} className="p-3 border rounded-lg"><div className="font-medium">{a.title}</div><div className="text-xs text-gray-500">{a.subject || ""} · {a.grade || ""} · {a.type} · {a.maxScore || 0} marks</div></div>)}</div>}
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-highlight p-6">
              <div className="flex justify-between items-center mb-4"><h2 className="text-lg font-semibold text-primary">Questions</h2><button onClick={addQuestion} className="btn-secondary flex items-center gap-2 text-sm"><PlusIcon className="w-4 h-4" /> Add Question</button></div>
              {questions.length === 0 ? <p className="text-center text-dark/60 py-12">No questions yet. Enter a specific topic and generate an assessment.</p> : <div className="space-y-4">
                {questions.map((q, index) => <div key={q.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between"><span className="text-sm font-semibold text-primary">Question {index + 1}</span><button onClick={() => removeQuestion(q.id)} className="text-red-500"><TrashIcon className="w-5 h-5" /></button></div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
                    <select value={q.type} onChange={(e) => updateQuestion(q.id, "type", e.target.value)} className="px-3 py-2 border rounded-md"><option value="multiple-choice">Multiple Choice</option><option value="short-answer">Short Answer</option><option value="essay">Essay</option></select>
                    <input type="number" min="1" max="50" value={q.marks} onChange={(e) => updateQuestion(q.id, "marks", Number(e.target.value))} className="px-3 py-2 border rounded-md" />
                    <input value={q.answer || ""} onChange={(e) => updateQuestion(q.id, "answer", e.target.value)} className="px-3 py-2 border rounded-md md:col-span-2" placeholder="Answer / marking point (optional)" />
                  </div>
                  <textarea value={q.question} onChange={(e) => updateQuestion(q.id, "question", e.target.value)} className="mt-3 w-full px-3 py-2 border rounded-md" rows={3} placeholder="Question" />
                  {q.type === "multiple-choice" && <input value={(q.options || []).join(", ")} onChange={(e) => updateQuestion(q.id, "options", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} className="mt-3 w-full px-3 py-2 border rounded-md" placeholder="Option A, Option B, Option C, Option D" />}
                </div>)}
                <div className="p-3 bg-primary/5 rounded-lg font-semibold text-primary">Total Marks: {totalMarks}</div>
              </div>}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
