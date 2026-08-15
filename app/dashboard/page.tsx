"use client"

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
} from '@heroicons/react/24/outline'

export default function DashboardPage() {
  const router = useRouter()
  const [userName] = useState('John Banda')
  const [school] = useState('Manungu Secondary School')

  const stats = [
    { label: 'Lessons created', value: '24', icon: DocumentTextIcon },
    { label: 'Schemes of work', value: '3', icon: CalendarIcon },
    { label: 'Assessments', value: '12', icon: ClipboardDocumentListIcon },
    { label: 'Curriculum alignment', value: '100%', icon: ChartBarIcon },
  ]

  const recentLessons = [
    { id: 1, title: 'Fractions – Introduction', grade: 'Grade 5', subject: 'Mathematics', date: '2026-08-14' },
    { id: 2, title: 'Photosynthesis', grade: 'Grade 8', subject: 'Science', date: '2026-08-13' },
    { id: 3, title: 'Reading Comprehension', grade: 'Grade 3', subject: 'English', date: '2026-08-12' },
    { id: 4, title: 'Human Rights – Lesson 3', grade: 'Grade 10', subject: 'Civic Education', date: '2026-08-11' },
  ]

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-primary text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
          <div className="flex items-center space-x-2">
            <span className="text-2xl font-bold">mytoolbox</span>
          </div>
          <nav className="hidden md:flex space-x-6">
            <Link href="/dashboard" className="text-secondary font-semibold">Dashboard</Link>
            <Link href="/generate" className="hover:text-secondary">Generate</Link>
            <Link href="/schemes" className="hover:text-secondary">Schemes</Link>
            <Link href="/profile" className="hover:text-secondary">Profile</Link>
          </nav>
          <div className="flex items-center space-x-4">
            <span className="text-sm hidden md:inline">{userName}</span>
            <button onClick={() => router.push('/')} className="text-sm hover:text-secondary">Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-primary">Welcome back, {userName.split(' ')[0]}! 👋</h1>
            <p className="text-dark/70 mt-1">{school} · <span className="text-success font-semibold">100% curriculum aligned</span></p>
          </div>
          <div className="mt-4 md:mt-0 flex flex-col sm:flex-row gap-3">
            <Link href="/generate" className="btn-primary flex items-center justify-center gap-2"><PlusCircleIcon className="w-5 h-5" /> New Lesson</Link>
            <Link href="/schemes" className="btn-outline flex items-center justify-center gap-2"><CalendarIcon className="w-5 h-5" /> New Scheme</Link>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {stats.map((stat, index) => (
            <div key={index} className="bg-white p-6 rounded-xl shadow-sm border border-highlight hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <stat.icon className="w-8 h-8 text-primary" />
                <span className="text-2xl font-bold text-primary">{stat.value}</span>
              </div>
              <p className="text-sm text-dark/70 mt-2">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-highlight p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-primary flex items-center gap-2">
                  <DocumentTextIcon className="w-5 h-5" /> Recent Lessons
                </h2>
                <Link href="/dashboard/lessons" className="text-sm text-primary hover:underline flex items-center gap-1">View all <ArrowRightIcon className="w-4 h-4" /></Link>
              </div>
              <div className="space-y-3">
                {recentLessons.map((lesson) => (
                  <div key={lesson.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-primary/5 transition-colors cursor-pointer border border-transparent hover:border-highlight">
                    <div>
                      <p className="font-medium text-dark">{lesson.title}</p>
                      <p className="text-sm text-dark/60">{lesson.grade} · {lesson.subject}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-dark/40">{lesson.date}</span>
                      <button className="text-primary hover:text-secondary transition-colors"><PencilSquareIcon className="w-5 h-5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="bg-gradient-to-br from-primary/5 to-white rounded-xl shadow-sm border border-highlight p-6">
              <h2 className="text-xl font-semibold text-primary flex items-center gap-2 mb-4">
                <SparklesIcon className="w-5 h-5 text-secondary" /> Quick Actions
              </h2>
              <div className="space-y-3">
                <button className="w-full text-left p-3 bg-white rounded-lg border border-highlight hover:border-secondary hover:shadow-sm transition-all flex items-center gap-3">
                  <BookOpenIcon className="w-5 h-5 text-primary" />
                  <span className="text-sm font-medium">Generate from topic</span>
                </button>
                <button className="w-full text-left p-3 bg-white rounded-lg border border-highlight hover:border-secondary hover:shadow-sm transition-all flex items-center gap-3">
                  <PlusCircleIcon className="w-5 h-5 text-primary" />
                  <span className="text-sm font-medium">Upload notes</span>
                </button>
                <button className="w-full text-left p-3 bg-white rounded-lg border border-highlight hover:border-secondary hover:shadow-sm transition-all flex items-center gap-3">
                  <ClipboardDocumentListIcon className="w-5 h-5 text-primary" />
                  <span className="text-sm font-medium">Create assessment</span>
                </button>
              </div>
            </div>

            <div className="mt-4 bg-white rounded-xl shadow-sm border border-highlight p-6">
              <div className="flex items-center gap-1 text-secondary mb-2">{'★'.repeat(5)}</div>
              <p className="text-sm text-dark/80 italic">"This app is very helpful, I love it. It has made my life easier 😊"</p>
              <p className="text-xs text-dark/60 mt-2">— Martha Kaluba, Itezhi-Tezhi Boarding School</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
