"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

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
  time?: string;
  classSize?: number;
  boys?: number;
  girls?: number;

  teacherName?: string;
  school?: string;
  province?: string;
  district?: string;

  specificCompetence?: string;
  lessonGoal?: string;
  rationale?: string;
  priorKnowledge?: string;
  learningEnvironment?: string;
  expectedStandard?: string;
  homework?: string;
  lessonEvaluation?: string;
  teacherEvaluation?: string;

  learningOutcomes?: string[];
  learnersEvaluation?: string[];
  generalCompetences?: string[];
  references?: string[];
  materials?: string[];
  teachingAids?: string[];

  lessonProgression?: any[];
  lessonDevelopment?: any[];
};

export default function LessonDetailsPage() {
  const params = useParams();
  const router = useRouter();

  const lessonId = String(params.id);

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadLesson = async () => {
      try {
        const token = localStorage.getItem("token");

        if (!token) {
          router.push("/login");
          return;
        }

        const apiUrl = process.env.NEXT_PUBLIC_API_URL;

        const response = await fetch(
          `${apiUrl}/api/lessons/mine`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (response.status === 401) {
          localStorage.removeItem("token");
          router.push("/login");
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to load lessons");
        }

        const data = await response.json();

        const lessons = Array.isArray(data) ? data : [];

        const foundLesson = lessons.find(
          (item: Lesson) => String(item.id) === lessonId
        );

        if (!foundLesson) {
          setError("Lesson not found.");
          return;
        }

        setLesson(foundLesson);
      } catch (err) {
        console.error("Error loading lesson:", err);
        setError("Unable to load this lesson.");
      } finally {
        setLoading(false);
      }
    };

    loadLesson();
  }, [lessonId, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-cream p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm p-10 text-center">
            <p className="text-gray-500">
              Loading lesson...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div className="min-h-screen bg-cream p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm p-10 text-center">
            <div className="text-5xl mb-4">📚</div>

            <h1 className="text-2xl font-bold text-primary">
              Lesson Not Found
            </h1>

            <p className="text-gray-600 mt-2">
              {error || "This lesson could not be found."}
            </p>

            <button
              onClick={() => router.push("/dashboard/lessons")}
              className="mt-6 bg-primary text-white px-6 py-3 rounded-lg font-semibold"
            >
              ← Back to Lessons
            </button>
          </div>
        </div>
      </div>
    );
  }

  const list = (items?: string[]) =>
    Array.isArray(items) ? items : [];

  return (
    <div className="min-h-screen bg-cream p-4 md:p-8">
      <div className="max-w-7xl mx-auto">

        {/* TOP BAR */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <button
              onClick={() => router.push("/dashboard/lessons")}
              className="text-primary hover:underline mb-3"
            >
              ← Back to All Lessons
            </button>

            <h1 className="text-3xl font-bold text-primary">
              {lesson.title || lesson.topic || "Lesson Plan"}
            </h1>

            <p className="text-gray-600 mt-1">
              {lesson.subject || "Subject"} ·{" "}
              {lesson.grade || "Grade"} ·{" "}
              {lesson.curriculum?.toUpperCase() || "CBC"}
            </p>
          </div>

          <button
            onClick={() => window.print()}
            className="bg-primary text-white px-5 py-3 rounded-lg font-semibold hover:opacity-90"
          >
            🖨️ Print / Save PDF
          </button>
        </div>

        {/* LESSON HEADER */}
        <section className="bg-white rounded-xl shadow-sm border border-highlight p-6 mb-6">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-primary uppercase">
              MINISTRY OF EDUCATION
            </h2>

            <h3 className="text-lg font-semibold mt-1">
              LESSON PLAN
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

            <Info
              label="School"
              value={lesson.school}
            />

            <Info
              label="Teacher"
              value={lesson.teacherName}
            />

            <Info
              label="Subject"
              value={lesson.subject}
            />

            <Info
              label="Grade"
              value={lesson.grade}
            />

            <Info
              label="Topic"
              value={lesson.topic}
            />

            <Info
              label="Sub-topic"
              value={lesson.subtopic}
            />

            <Info
              label="Curriculum"
              value={lesson.curriculum?.toUpperCase()}
            />

            <Info
              label="Duration"
              value={lesson.duration}
            />

            <Info
              label="Date"
              value={lesson.date}
            />

            <Info
              label="Time"
              value={lesson.time}
            />

            <Info
              label="Class Size"
              value={
                lesson.classSize
                  ? String(lesson.classSize)
                  : undefined
              }
            />

            <Info
              label="Learners"
              value={
                lesson.boys !== undefined ||
                lesson.girls !== undefined
                  ? `${lesson.boys || 0} Boys / ${
                      lesson.girls || 0
                    } Girls`
                  : undefined
              }
            />

          </div>
        </section>

        {/* COMPETENCES */}
        <Section title="General Competences">
          <List items={list(lesson.generalCompetences)} />
        </Section>

        {/* SPECIFIC COMPETENCE */}
        <Section title="Specific Competence">
          <p className="text-gray-700 whitespace-pre-wrap">
            {lesson.specificCompetence || "Not specified."}
          </p>
        </Section>

        {/* LESSON GOAL */}
        <Section title="Lesson Goal">
          <p className="text-gray-700 whitespace-pre-wrap">
            {lesson.lessonGoal || "Not specified."}
          </p>
        </Section>

        {/* LEARNING OUTCOMES */}
        <Section title="Learning Outcomes">
          <List items={list(lesson.learningOutcomes)} />
        </Section>

        {/* PRIOR KNOWLEDGE */}
        <Section title="Prior Knowledge">
          <p className="text-gray-700 whitespace-pre-wrap">
            {lesson.priorKnowledge || "Not specified."}
          </p>
        </Section>

        {/* RATIONALE */}
        <Section title="Rationale">
          <p className="text-gray-700 whitespace-pre-wrap">
            {lesson.rationale || "Not specified."}
          </p>
        </Section>

        {/* CBC PROGRESSION */}
        {lesson.lessonProgression &&
          lesson.lessonProgression.length > 0 && (
            <Section title="Lesson Progression">

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-primary/10">
                      <th className="border px-4 py-3 text-left">
                        Stage
                      </th>

                      <th className="border px-4 py-3 text-left">
                        Time
                      </th>

                      <th className="border px-4 py-3 text-left">
                        Teacher Role
                      </th>

                      <th className="border px-4 py-3 text-left">
                        Learner Role
                      </th>

                      <th className="border px-4 py-3 text-left">
                        Assessment
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {lesson.lessonProgression.map(
                      (stage: any, index: number) => (
                        <tr key={index}>
                          <td className="border px-4 py-3 font-semibold">
                            {stage.stage ||
                              stage.name ||
                              `Stage ${index + 1}`}
                          </td>

                          <td className="border px-4 py-3">
                            {stage.time ||
                              stage.duration ||
                              "-"}
                          </td>

                          <td className="border px-4 py-3 whitespace-pre-wrap">
                            {stage.teacherRole ||
                              stage.teacherActivity ||
                              stage.teacherActivities ||
                              "-"}
                          </td>

                          <td className="border px-4 py-3 whitespace-pre-wrap">
                            {stage.learnerRole ||
                              stage.pupilActivity ||
                              stage.pupilActivities ||
                              "-"}
                          </td>

                          <td className="border px-4 py-3 whitespace-pre-wrap">
                            {stage.assessmentCriteria ||
                              stage.assessment ||
                              "-"}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

        {/* OBC DEVELOPMENT */}
        {lesson.lessonDevelopment &&
          lesson.lessonDevelopment.length > 0 && (
            <Section title="Lesson Development">

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-primary/10">
                      <th className="border px-4 py-3 text-left">
                        Learning Points
                      </th>

                      <th className="border px-4 py-3 text-left">
                        Teacher Activities
                      </th>

                      <th className="border px-4 py-3 text-left">
                        Pupil Activities
                      </th>

                      <th className="border px-4 py-3 text-left">
                        Methods
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {lesson.lessonDevelopment.map(
                      (item: any, index: number) => (
                        <tr key={index}>
                          <td className="border px-4 py-3 whitespace-pre-wrap">
                            {item.learningPoints ||
                              item.content ||
                              "-"}
                          </td>

                          <td className="border px-4 py-3 whitespace-pre-wrap">
                            {item.teacherActivities ||
                              item.teacherActivity ||
                              "-"}
                          </td>

                          <td className="border px-4 py-3 whitespace-pre-wrap">
                            {item.pupilActivities ||
                              item.pupilActivity ||
                              "-"}
                          </td>

                          <td className="border px-4 py-3 whitespace-pre-wrap">
                            {item.methods || "-"}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

        {/* MATERIALS */}
        <Section title="Teaching & Learning Materials">
          <List items={list(lesson.materials)} />
        </Section>

        {/* TEACHING AIDS */}
        <Section title="Teaching Aids">
          <List items={list(lesson.teachingAids)} />
        </Section>

        {/* LEARNING ENVIRONMENT */}
        <Section title="Learning Environment">
          <p className="text-gray-700 whitespace-pre-wrap">
            {lesson.learningEnvironment || "Not specified."}
          </p>
        </Section>

        {/* EXPECTED STANDARD */}
        <Section title="Expected Standard">
          <p className="text-gray-700 whitespace-pre-wrap">
            {lesson.expectedStandard || "Not specified."}
          </p>
        </Section>

        {/* LEARNERS EVALUATION */}
        <Section title="Learners' Evaluation">
          <List items={list(lesson.learnersEvaluation)} />
        </Section>

        {/* HOMEWORK */}
        <Section title="Homework">
          <p className="text-gray-700 whitespace-pre-wrap">
            {lesson.homework || "No homework specified."}
          </p>
        </Section>

        {/* REFERENCES */}
        <Section title="References">
          <List items={list(lesson.references)} />
        </Section>

        {/* LESSON EVALUATION */}
        <Section title="Lesson Evaluation">
          <p className="text-gray-700 whitespace-pre-wrap">
            {lesson.lessonEvaluation || "Not specified."}
          </p>
        </Section>

        {/* TEACHER EVALUATION */}
        <Section title="Teacher Evaluation">
          <p className="text-gray-700 whitespace-pre-wrap">
            {lesson.teacherEvaluation || "Not specified."}
          </p>
        </Section>

        {/* BOTTOM BUTTONS */}
        <div className="flex flex-col sm:flex-row gap-3 mt-8 mb-10">

          <button
            onClick={() => router.push("/dashboard/lessons")}
            className="px-6 py-3 rounded-lg border border-gray-300 bg-white text-gray-700 font-semibold hover:bg-gray-50"
          >
            ← All Lessons
          </button>

          <button
            onClick={() => router.push("/generate")}
            className="px-6 py-3 rounded-lg bg-primary text-white font-semibold hover:opacity-90"
          >
            + Create New Lesson
          </button>

        </div>

      </div>
    </div>
  );
}


/* =========================
   REUSABLE COMPONENTS
========================= */

function Info({
  label,
  value,
}: {
  label: string;
  value?: string;
}) {
  return (
    <div className="border rounded-lg p-4 bg-gray-50">
      <p className="text-xs uppercase font-semibold text-gray-500">
        {label}
      </p>

      <p className="mt-1 font-medium text-gray-800">
        {value || "-"}
      </p>
    </div>
  );
}


function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl shadow-sm border border-highlight p-6 mb-6">

      <h2 className="text-xl font-bold text-primary mb-4">
        {title}
      </h2>

      {children}

    </section>
  );
}


function List({
  items,
}: {
  items: string[];
}) {
  if (!items.length) {
    return (
      <p className="text-gray-500">
        Not specified.
      </p>
    );
  }

  return (
    <ul className="list-disc pl-6 space-y-2 text-gray-700">
      {items.map((item, index) => (
        <li key={index}>
          {item}
        </li>
      ))}
    </ul>
  );
}
