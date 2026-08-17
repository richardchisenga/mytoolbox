"use client";

import { useState } from "react";
import Link from "next/link";

export default function GeneratePage() {
  const [topic, setTopic] = useState("");
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const [generatedLesson, setGeneratedLesson] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic || !grade || !subject) {
      alert("Please fill in all fields");
      return;
    }

    setIsGenerating(true);
    // Simulate API call
    setTimeout(() => {
      setGeneratedLesson({
        title: topic,
        grade,
        subject,
        objectives: [
          `Understand the key concepts of ${topic}`,
          `Apply ${topic} to real-world problems`,
          "Demonstrate understanding through activities",
        ],
        activities: ["Group discussion", "Hands-on practice", "Peer teaching"],
        assessment: "Observation and short quiz",
      });
      setIsGenerating(false);
    }, 1500);
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

        {!generatedLesson ? (
          <form
            onSubmit={handleGenerate}
            className="bg-white p-6 rounded-xl shadow-md mt-6"
          >
            <div className="space-y-4">
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
              <button
                type="submit"
                disabled={isGenerating}
                className="bg-yellow-500 text-black px-6 py-3 rounded-md hover:bg-yellow-400 disabled:opacity-50 w-full font-semibold"
              >
                {isGenerating ? "⏳ Generating..." : "🚀 Generate Lesson"}
              </button>
            </div>
          </form>
        ) : (
          <div className="bg-white p-6 rounded-xl shadow-md mt-6">
            <h2 className="text-2xl font-bold text-primary">
              {generatedLesson.title}
            </h2>
            <p className="text-gray-600">
              {generatedLesson.grade} · {generatedLesson.subject}
            </p>
            <div className="mt-4">
              <h3 className="font-semibold text-primary">Objectives</h3>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                {generatedLesson.objectives.map((obj: string, i: number) => (
                  <li key={i} className="text-gray-700">{obj}</li>
                ))}
              </ul>
            </div>
            <div className="mt-4">
              <h3 className="font-semibold text-primary">Activities</h3>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                {generatedLesson.activities.map((activity: string, i: number) => (
                  <li key={i} className="text-gray-700">{activity}</li>
                ))}
              </ul>
            </div>
            <div className="mt-4">
              <h3 className="font-semibold text-primary">Assessment</h3>
              <p className="text-gray-700 mt-1">{generatedLesson.assessment}</p>
            </div>
            <button
              onClick={() => setGeneratedLesson(null)}
              className="mt-4 text-primary hover:underline"
            >
              ← Generate Another Lesson
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
