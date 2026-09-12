"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DocumentTextIcon,
  CalendarIcon,
  ClipboardDocumentListIcon,
  ChartBarIcon,
  PlusCircleIcon,
  ArrowRightIcon,
  SparklesIcon,
  BookOpenIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lessons, setLessons] = useState<any[]>([]);

  const [stats, setStats] = useState({
    totalLessons: 0,
    totalSchemes: 0,
    totalAssessments: 0,
    alignment: "100%",
  });

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const token = localStorage.getItem("token");

        if (!token) {
          router.push("/login");
          return;
        }

        const api = process.env.NEXT_PUBLIC_API_URL;

        // Fetch user
        const userResponse = await fetch(
          `${api}/api/auth/me`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (userResponse.ok) {
          const userData = await userResponse.json();
          setUser(userData);
        } else {
          localStorage.removeItem("token");
          router.push("/login");
          return;
        }

        // Fetch lessons and schemes
        const [lessonsResponse, schemesResponse] =
          await Promise.all([
            fetch(`${api}/api/lessons/mine`, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }),

            fetch(`${api}/api/schemes/mine`, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }),
          ]);

        const lessonData = lessonsResponse.ok
          ? await lessonsResponse.json()
          : [];

        const schemeData = schemesResponse.ok
          ? await schemesResponse.json()
          : [];

        const userLessons = Array.isArray(lessonData)
          ? lessonData
          : [];

        const userSchemes = Array.isArray(schemeData)
          ? schemeData
          : [];

        setLessons(userLessons.slice(0, 5));

        setStats({
          totalLessons: userLessons.length,
          totalSchemes: userSchemes.length,
          totalAssessments: 0,
          alignment: "100%",
        });
      } catch (error) {
        console.error(
          "Failed to fetch dashboard data:",
          error
        );
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>

          <p className="mt-4 text-dark/60">
            Loading your dashboard...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const statCards = [
    {
      label: "Lessons created",
      value: stats.totalLessons,
      icon: DocumentTextIcon,
    },
    {
      label: "Schemes of work",
      value: stats.totalSchemes,
      icon: CalendarIcon,
    },
    {
      label: "Assessments",
      value: stats.totalAssessments,
      icon: ClipboardDocumentListIcon,
    },
    {
      label: "Curriculum alignment",
      value: stats.alignment,
      icon: ChartBarIcon,
    },
  ];

  return (
    <div className="min-h-screen bg-cream">

      {/* ================= HEADER ================= */}

      <header className="bg-primary text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">

          <div className="flex items-center space-x-2">
            <span className="text-2xl font-bold">
              mytoolbox
            </span>
          </div>

          <nav className="hidden md:flex items-center space-x-6">

            <Link
              href="/dashboard"
              className="text-secondary font-semibold"
            >
              Dashboard
            </Link>

            <Link
              href="/generate"
              className="hover:text-secondary"
            >
              Generate
            </Link>

            <Link
              href="/schemes"
              className="hover:text-secondary"
            >
              Schemes
            </Link>

            {/* RECORD OF WORK */}
            <Link
              href="/record-of-work"
              className="hover:text-secondary"
            >
              Record of Work
            </Link>

            {/* WEEKLY FORECAST */}
            <Link
              href="/weekly-forecast"
              className="hover:text-secondary"
            >
              Weekly Forecast
            </Link>

            <Link
              href="/profile"
              className="hover:text-secondary"
            >
              Profile
            </Link>

          </nav>

          <div className="flex items-center space-x-4">

            <span className="text-sm hidden md:inline">
              {user.fullName}
            </span>

            <button
              onClick={() => {
                localStorage.removeItem("token");
                router.push("/login");
              }}
              className="text-sm hover:text-secondary"
            >
              Logout
            </button>

          </div>
        </div>
      </header>


      {/* ================= MAIN ================= */}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">


        {/* ================= WELCOME ================= */}

        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">

          <div>

            <h1 className="text-3xl font-bold text-primary">
              Welcome back,{" "}
              {user.fullName?.split(" ")[0]}! 👋
            </h1>

            <p className="text-dark/70 mt-1">
              {user.school} ·{" "}
              <span className="text-success font-semibold">
                100% curriculum aligned
              </span>
            </p>

          </div>


          {/* ================= MAIN BUTTONS ================= */}

          <div className="mt-4 md:mt-0 flex flex-wrap gap-3">

            {/* NEW LESSON */}
            <Link
              href="/generate"
              className="btn-primary flex items-center justify-center gap-2"
            >
              <PlusCircleIcon className="w-5 h-5" />
              New Lesson
            </Link>


            {/* NEW SCHEME */}
            <Link
              href="/schemes"
              className="btn-outline flex items-center justify-center gap-2"
            >
              <CalendarIcon className="w-5 h-5" />
              New Scheme
            </Link>


            {/* RECORD OF WORK */}
            <Link
              href="/record-of-work"
              className="btn-outline flex items-center justify-center gap-2"
            >
              <DocumentTextIcon className="w-5 h-5" />
              Record of Work
            </Link>


            {/* WEEKLY FORECAST */}
            <Link
              href="/weekly-forecast"
              className="btn-outline flex items-center justify-center gap-2"
            >
              <CalendarIcon className="w-5 h-5" />
              Weekly Forecast
            </Link>

          </div>

        </div>


        {/* ================= PLANNING DOCUMENTS ================= */}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">


          {/* RECORD OF WORK CARD */}

          <Link
            href="/record-of-work"
            className="bg-white rounded-xl shadow-sm border border-highlight p-6 hover:shadow-md hover:border-secondary transition-all"
          >

            <div className="flex items-center gap-4">

              <div className="p-3 rounded-lg bg-primary/10">
                <DocumentTextIcon className="w-8 h-8 text-primary" />
              </div>

              <div>

                <h2 className="font-semibold text-primary text-lg">
                  Record of Work
                </h2>

                <p className="text-sm text-dark/60 mt-1">
                  Create, edit and export your Record of Work.
                </p>

                <span className="inline-block mt-3 text-sm font-medium text-primary">
                  Open Record of Work →
                </span>

              </div>

            </div>

          </Link>


          {/* WEEKLY FORECAST CARD */}

          <Link
            href="/weekly-forecast"
            className="bg-white rounded-xl shadow-sm border border-highlight p-6 hover:shadow-md hover:border-secondary transition-all"
          >

            <div className="flex items-center gap-4">

              <div className="p-3 rounded-lg bg-primary/10">
                <CalendarIcon className="w-8 h-8 text-primary" />
              </div>

              <div>

                <h2 className="font-semibold text-primary text-lg">
                  Weekly Forecast
                </h2>

                <p className="text-sm text-dark/60 mt-1">
                  Create, edit and export your Weekly Forecast.
                </p>

                <span className="inline-block mt-3 text-sm font-medium text-primary">
                  Open Weekly Forecast →
                </span>

              </div>

            </div>

          </Link>

        </div>


        {/* ================= STATISTICS ================= */}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">

          {statCards.map((stat, index) => {

            const Icon = stat.icon;

            return (
              <div
                key={index}
                className="bg-white p-6 rounded-xl shadow-sm border border-highlight hover:shadow-md transition-shadow"
              >

                <div className="flex items-center justify-between">

                  <Icon className="w-8 h-8 text-primary" />

                  <span className="text-2xl font-bold text-primary">
                    {stat.value}
                  </span>

                </div>

                <p className="text-sm text-dark/70 mt-2">
                  {stat.label}
                </p>

              </div>
            );

          })}

        </div>


        {/* ================= RECENT LESSONS + QUICK ACTIONS ================= */}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">


          {/* RECENT LESSONS */}

          <div className="lg:col-span-2">

            <div className="bg-white rounded-xl shadow-sm border border-highlight p-6">

              <div className="flex justify-between items-center mb-4">

                <h2 className="text-xl font-semibold text-primary flex items-center gap-2">

                  <DocumentTextIcon className="w-5 h-5" />

                  Recent Lessons

                </h2>

                <Link
                  href="/dashboard/lessons"
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  View all
                  <ArrowRightIcon className="w-4 h-4" />
                </Link>

              </div>


              <div className="space-y-3">

                {lessons.length === 0 ? (

                  <div className="text-center py-8 text-dark/50">
                    No lessons created yet.
                  </div>

                ) : (

                  lessons.map((lesson) => (

                    <div
                      key={lesson.id}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-primary/5 transition-colors border border-transparent hover:border-highlight"
                    >

                      <div>

                        <p className="font-medium text-dark">
                          {lesson.title}
                        </p>

                        <p className="text-sm text-dark/60">
                          {lesson.grade} · {lesson.subject}
                        </p>

                      </div>

                      <div className="flex items-center gap-3">

                        <span className="text-xs text-dark/40">
                          {lesson.date}
                        </span>

                        <button
                          onClick={() =>
                            router.push(
                              `/dashboard/lessons/${lesson.id}`
                            )
                          }
                          className="text-primary hover:text-secondary transition-colors"
                        >
                          <PencilSquareIcon className="w-5 h-5" />
                        </button>

                      </div>

                    </div>

                  ))

                )}

              </div>

            </div>

          </div>


          {/* ================= QUICK ACTIONS ================= */}

          <div>

            <div className="bg-gradient-to-br from-primary/5 to-white rounded-xl shadow-sm border border-highlight p-6">

              <h2 className="text-xl font-semibold text-primary flex items-center gap-2 mb-4">

                <SparklesIcon className="w-5 h-5 text-secondary" />

                Quick Actions

              </h2>


              <div className="space-y-3">


                {/* GENERATE */}

                <button
                  onClick={() =>
                    router.push("/generate")
                  }
                  className="w-full text-left p-3 bg-white rounded-lg border border-highlight hover:border-secondary hover:shadow-sm transition-all flex items-center gap-3"
                >

                  <BookOpenIcon className="w-5 h-5 text-primary" />

                  <span className="text-sm font-medium">
                    Generate from topic
                  </span>

                </button>


                {/* NOTES */}

                <button
                  onClick={() =>
                    router.push("/notes")
                  }
                  className="w-full text-left p-3 bg-white rounded-lg border border-highlight hover:border-secondary hover:shadow-sm transition-all flex items-center gap-3"
                >

                  <PlusCircleIcon className="w-5 h-5 text-primary" />

                  <span className="text-sm font-medium">
                    Upload notes
                  </span>

                </button>


                {/* ASSESSMENT */}

                <button
                  onClick={() =>
                    router.push("/assessments")
                  }
                  className="w-full text-left p-3 bg-white rounded-lg border border-highlight hover:border-secondary hover:shadow-sm transition-all flex items-center gap-3"
                >

                  <ClipboardDocumentListIcon className="w-5 h-5 text-primary" />

                  <span className="text-sm font-medium">
                    Create assessment
                  </span>

                </button>


                {/* RECORD OF WORK */}

                <button
                  onClick={() =>
                    router.push("/record-of-work")
                  }
                  className="w-full text-left p-3 bg-white rounded-lg border border-highlight hover:border-secondary hover:shadow-sm transition-all flex items-center gap-3"
                >

                  <DocumentTextIcon className="w-5 h-5 text-primary" />

                  <span className="text-sm font-medium">
                    Record of Work
                  </span>

                </button>


                {/* WEEKLY FORECAST */}

                <button
                  onClick={() =>
                    router.push("/weekly-forecast")
                  }
                  className="w-full text-left p-3 bg-white rounded-lg border border-highlight hover:border-secondary hover:shadow-sm transition-all flex items-center gap-3"
                >

                  <CalendarIcon className="w-5 h-5 text-primary" />

                  <span className="text-sm font-medium">
                    Weekly Forecast
                  </span>

                </button>

              </div>

            </div>


            {/* TESTIMONIAL */}

            <div className="mt-4 bg-white rounded-xl shadow-sm border border-highlight p-6">

              <div className="flex items-center gap-1 text-secondary mb-2">
                {"★".repeat(5)}
              </div>

              <p className="text-sm text-dark/80 italic">
                "This app is very helpful, I love it.
                It has made my life easier 😊"
              </p>

              <p className="text-xs text-dark/60 mt-2">
                — {user.fullName}, {user.school}
              </p>

            </div>

          </div>

        </div>

      </main>

    </div>
  );
}
