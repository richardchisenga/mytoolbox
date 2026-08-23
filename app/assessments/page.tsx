"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, DocumentTextIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";

interface Question {
  id: string;
  type: "multiple-choice" | "short-answer" | "essay";
  question: string;
  options?: string[];
  marks: number;
}

export default function AssessmentsPage() {
  const [title, setTitle] = useState("");
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const addQuestion = () => { 
    setQuestions([
      ...questions,
      { id: `q-${Date.now()}`, type: "short-answer", question: "", marks: 5 },
    ]);
  };

  const removeQuestion = (id: string) => {
    setQuestions(questions.filter((q) => q.id !== id));
  };

  const updateQuestion = (id: string, field: keyof Question, value: any) => {
    setQuestions(
      questions.map((q) => (q.id === id ? { ...q, [field]: value } : q))
    );
  };

  const generateAssessment = () => {
    if (!title || !grade || !subject) {
      alert("Please fill in all required fields");
      return;
    }
    setIsGenerating(true);
    setTimeout(() => {
      setQuestions([
        {
          id: "q1",
          type: "multiple-choice",
          question: `What is the main concept of ${subject}?`,
          options: ["Option A", "Option B", "Option C", "Option D"],
          marks: 5,
        },
        {
          id: "q2",
          type: "short-answer",
          question: `Explain the importance of ${subject} in everyday life.`,
          marks: 10,
        },
        {
          id: "q3",
          type: "essay",
          question: `Describe the key principles of ${subject}.`,
          marks: 15,
        },
      ]);
      setIsGenerating(false);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-primary text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <Link href="/dashboard" className="hover:text-secondary">
              <ArrowLeftIcon className="w-5 h-5" />
            </Link>
            <span className="text-2xl font-bold">mytoolbox</span>
          </div>
          <nav className="hidden md:flex space-x-6">
            <Link href="/dashboard" className="hover:text-secondary">Dashboard</Link>
            <Link href="/generate" className="hover:text-secondary">Lessons</Link>
            <Link href="/schemes" className="hover:text-secondary">Schemes</Link>
            <Link href="/assessments" className="text-secondary font-semibold">
              Assessments
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-primary flex items-center gap-3">
            <DocumentTextIcon className="w-8 h-8 text-secondary" /> Activity Sheets &
            Assessments
          </h1>
          <p className="text-dark/70 mt-1">
            Create worksheets, quizzes, tests, and exams in seconds
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-highlight p-6">
              <h2 className="text-lg font-semibold text-primary mb-4">
                Generate Assessment
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-dark">
                    Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g. Fractions Assessment"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark">
                    Grade
                  </label>
                  <select
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select grade</option>
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"].map(
                      (g) => (
                        <option key={g}>Grade {g}</option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark">
                    Subject
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="e.g. Mathematics"
                  />
                </div>
                <button
                  onClick={generateAssessment}
                  disabled={isGenerating}
                  className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <DocumentTextIcon className="w-5 h-5" /> Generate Assessment
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-highlight p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-primary">Questions</h2>
                <button
                  onClick={addQuestion}
                  className="btn-secondary flex items-center gap-2 text-sm"
                >
                  <PlusIcon className="w-4 h-4" /> Add Question
                </button>
              </div>

              {questions.length === 0 ? (
                <p className="text-center text-dark/60 py-8">
                  No questions yet. Generate an assessment or add questions manually.
                </p>
              ) : (
                <div className="space-y-4">
                  {questions.map((q, index) => (
                    <div
                      key={q.id}
                      className="border border-gray-200 rounded-lg p-4 hover:border-highlight transition-colors"
                    >
                      <div className="flex justify-between items-start">
                        <span className="text-sm font-medium text-primary">
                          Question {index + 1}
                        </span>
                        <button
                          onClick={() => removeQuestion(q.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <TrashIcon className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="space-y-3 mt-2">
                        <div>
                          <label className="block text-sm font-medium text-dark">
                            Type
                          </label>
                          <select
                            value={q.type}
                            onChange={(e) =>
                              updateQuestion(q.id, "type", e.target.value as any)
                            }
                            className="mt-1 w-full px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          >
                            <option value="multiple-choice">Multiple Choice</option>
                            <option value="short-answer">Short Answer</option>
                            <option value="essay">Essay</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-dark">
                            Question
                          </label>
                          <input
                            type="text"
                            value={q.question}
                            onChange={(e) =>
                              updateQuestion(q.id, "question", e.target.value)
                            }
                            className="mt-1 w-full px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Enter question"
                          />
                        </div>
                        {q.type === "multiple-choice" && (
                          <div>
                            <label className="block text-sm font-medium text-dark">
                              Options (comma separated)
                            </label>
                            <input
                              type="text"
                              value={q.options?.join(", ") || ""}
                              onChange={(e) =>
                                updateQuestion(
                                  q.id,
                                  "options",
                                  e.target.value.split(",").map((s) => s.trim())
                                )
                              }
                              className="mt-1 w-full px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                              placeholder="Option A, Option B, Option C"
                            />
                          </div>
                        )}
                        <div>
                          <label className="block text-sm font-medium text-dark">
                            Marks
                          </label>
                          <input
                            type="number"
                            value={q.marks}
                            onChange={(e) =>
                              updateQuestion(q.id, "marks", parseInt(e.target.value))
                            }
                            className="mt-1 w-20 px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            min="1"
                            max="50"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="mt-4 p-3 bg-primary/5 rounded-lg">
                    <p className="text-sm text-dark/70">
                      Total Marks:{" "}
                      <span className="font-bold text-primary">
                        {questions.reduce((sum, q) => sum + q.marks, 0)}
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
