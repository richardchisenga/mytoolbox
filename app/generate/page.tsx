"use client";

import { useState } from "react";
import Link from "next/link";

export default function GeneratePage() {
  const [topic, setTopic] = useState("");
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLesson, setGeneratedLesson] = useState<any>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/lessons/generate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ topic, grade, subject, classSize: 40 }),
        }
      );
      const data = await response.json();
      setGeneratedLesson(data);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/dashboard" className="text-gray-600 hover:text-gray-800">
          ← Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-gray-800 mt-4">Create a New Lesson</h1>
        <p className="text-gray-600 mt-2">Generate curriculum-aligned lesson plans in seconds</p>

        {!generatedLesson ? (
          <form onSubmit={handleGenerate} className="bg-white p-6 rounded-lg shadow-sm mt-6 border border-gray-200">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Grade</label>
                <input
                  type="text"
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  placeholder="e.g. Grade 5"
                  className="w-full p-3 border border-gray-300 rounded-md"
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
                  className="w-full p-3 border border-gray-300 rounded-md"
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
                  className="w-full p-3 border border-gray-300 rounded-md"
                  required
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
            <h2 className="text-2xl font-bold text-gray-800">
              {generatedLesson.title || generatedLesson.topic}
            </h2>
            <p className="text-gray-600">{generatedLesson.grade} · {generatedLesson.subject}</p>
            <div className="mt-4">
              <h3 className="font-semibold text-gray-700">Objectives</h3>
              <ul className="list-disc pl-5">
                {generatedLesson.objectives?.map((obj: string, i: number) => (
                  <li key={i}>{obj}</li>
                ))}
              </ul>
            </div>
            <div className="mt-4">
              <h3 className="font-semibold text-gray-700">Activities</h3>
              <ul className="list-disc pl-5">
                {generatedLesson.activities?.map((activity: string, i: number) => (
                  <li key={i}>{activity}</li>
                ))}
              </ul>
            </div>
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
