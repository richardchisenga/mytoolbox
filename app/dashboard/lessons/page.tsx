"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Lesson = {
  id: string;
  title?: string;
  grade?: string;
  subject?: string;
  topic?: string;
  subtopic?: string;
  curriculum?: string;
  duration?: string;
  date?: string;
  createdAt?: string;
};

export default function LessonsPage() {
  const router = useRouter();

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadLessons = async () => {
      try {
        const token = localStorage.getItem("token");

        if (!token) {
          router.push("/login");
          return;
        }

        const apiUrl = process.env.NEXT_PUBLIC_API_URL;

        const response = await fetch(`${apiUrl}/api/lessons/mine`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.status === 401) {
          localStorage.removeItem("token");
          router.push("/login");
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to load lessons");
        }

        const data = await response.json();

        setLessons(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Error loading lessons:", err);
        setError("Unable to load your lessons.");
      } finally {
        setLoading(false);
      }
    };

    loadLessons();
  }, [router]);

  const formatDate = (lesson: Lesson) => {
    if (lesson.date) return lesson.date;

    if (lesson.createdAt) {
      return new Date(lesson.createdAt).toLocaleDateString();
    }

    return "";
  };

  return (
    <div className="min-h-screen bg-cream p-4 md:p-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-primary">
              All Lessons
            </h1>

            <p className="text-gray-600 mt-2">
              View and manage all your generated lesson plans.
            </p>
          </div>

          <button
            onClick={() => router.push("/generate")}
            className="bg-primary text-white px-5 py-3 rounded-lg font-semibold hover:opacity-90 transition"
          >
            + New Lesson
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="bg-white rounded-xl shadow-sm border border-highlight p-10 text-center">
            <div className="animate-pulse text-gray-500">
              Loading your lessons...
            </div>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="bg-white rounded-xl shadow-sm border border-red-200 p-8 text-center">
            <p className="text-red-600 font-medium">{error}</p>

            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-primary text-white rounded-lg"
            >
              Try Again
            </button>
          </div>
        )}

        {/* No lessons */}
        {!loading && !error && lessons.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-highlight p-12 text-center">
            <div className="text-5xl mb-4">📚</div>

            <h2 className="text-xl font-semibold text-primary">
              No lessons yet
            </h2>

            <p className="text-gray-600 mt-2">
              Generate your first lesson plan and it will appear here.
            </p>

            <button
              onClick={() => router.push("/generate")}
              className="mt-6 bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90"
            >
              Generate Lesson
            </button>
          </div>
        )}

        {/* Lessons */}
        {!loading && !error && lessons.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-highlight overflow-hidden">

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-primary/5 border-b border-highlight">
                    <th className="text-left px-6 py-4 text-sm font-semibold text-primary">
                      Lesson
                    </th>

                    <th className="text-left px-6 py-4 text-sm font-semibold text-primary">
                      Grade
                    </th>

                    <th className="text-left px-6 py-4 text-sm font-semibold text-primary">
                      Subject
                    </th>

                    <th className="text-left px-6 py-4 text-sm font-semibold text-primary">
                      Curriculum
                    </th>

                    <th className="text-left px-6 py-4 text-sm font-semibold text-primary">
                      Date
                    </th>

                    <th className="text-right px-6 py-4 text-sm font-semibold text-primary">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {lessons.map((lesson) => (
                    <tr
                      key={lesson.id}
                      className="border-b border-gray-100 hover:bg-primary/5 transition"
                    >
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold text-gray-800">
                            {lesson.title || lesson.topic || "Untitled Lesson"}
                          </p>

                          {lesson.subtopic && (
                            <p className="text-xs text-gray-500 mt-1">
                              {lesson.subtopic}
                            </p>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-gray-700">
                        {lesson.grade || "-"}
                      </td>

                      <td className="px-6 py-4 text-gray-700">
                        {lesson.subject || "-"}
                      </td>

                      <td className="px-6 py-4">
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary uppercase">
                          {lesson.curriculum || "CBC"}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-500">
                        {formatDate(lesson)}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() =>
                            router.push(
                              `/dashboard/lessons/${lesson.id}`
                            )
                          }
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-primary hover:bg-primary/10 transition"
                          title="View lesson"
                        >
                          ✏️
                          <span className="hidden lg:inline">
                            Open
                          </span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-100">
              {lessons.map((lesson) => (
                <div
                  key={lesson.id}
                  className="p-5 hover:bg-primary/5 transition"
                >
                  <div className="flex justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-800">
                        {lesson.title || lesson.topic || "Untitled Lesson"}
                      </h3>

                      {lesson.subtopic && (
                        <p className="text-sm text-gray-500 mt-1">
                          {lesson.subtopic}
                        </p>
                      )}

                      <p className="text-sm text-gray-600 mt-3">
                        {lesson.grade || "-"} ·{" "}
                        {lesson.subject || "-"}
                      </p>

                      <p className="text-xs text-gray-400 mt-1">
                        {formatDate(lesson)}
                      </p>
                    </div>

                    <button
                      onClick={() =>
                        router.push(
                          `/dashboard/lessons/${lesson.id}`
                        )
                      }
                      className="shrink-0 h-10 px-3 rounded-lg bg-primary/10 text-primary font-medium"
                    >
                      ✏️
                    </button>
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
