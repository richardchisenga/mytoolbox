"use client"

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [school, setSchool] = useState('')
  const [province, setProvince] = useState('')
  const [district, setDistrict] = useState('')
  const [grades, setGrades] = useState<string[]>([])
  const [subjects, setSubjects] = useState<string[]>([])

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      alert('Passwords do not match')
      return
    }
    if (password.length < 8) {
      alert('Password must be at least 8 characters')
      return
    }
    setStep(2)
  }

  const handleStep2Submit = (e: React.FormEvent) => {
    e.preventDefault()
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-cream px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-6 md:p-8 border border-highlight">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-primary">Mwabuka buti — good morning</h1>
          <p className="text-sm text-dark/70 mt-1">Set up once — your details flow straight onto your lesson plans.</p>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div className={`flex-1 h-1 rounded-full ${step >= 1 ? 'bg-secondary' : 'bg-gray-200'}`} />
          <span className={`text-xs font-medium mx-2 ${step === 1 ? 'text-primary' : 'text-gray-400'}`}>1. Account</span>
          <div className={`flex-1 h-1 rounded-full ${step >= 2 ? 'bg-secondary' : 'bg-gray-200'}`} />
          <span className={`text-xs font-medium mx-2 ${step === 2 ? 'text-primary' : 'text-gray-400'}`}>2. Profile</span>
        </div>

        {step === 1 && (
          <form onSubmit={handleStep1Submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark">Full name</label>
              <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary" placeholder="John Banda" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary" placeholder="you@example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark">Password</label>
              <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Min. 8 characters" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark">Confirm password</label>
              <input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary" placeholder="Re-enter password" />
            </div>
            <button type="submit" className="btn-primary w-full py-2.5">Continue</button>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-300" /></div>
              <div className="relative flex justify-center text-sm"><span className="bg-white px-2 text-dark/60">or</span></div>
            </div>
            <button type="button" className="w-full flex items-center justify-center gap-2 border border-primary text-primary font-semibold py-2 rounded-md hover:bg-primary hover:text-white transition-colors">
              <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </button>
            <p className="text-xs text-dark/60 text-center mt-4">
              By creating an account, you agree to our <Link href="/terms" className="text-primary underline">Terms</Link> and <Link href="/privacy" className="text-primary underline">Privacy Policy</Link>
            </p>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleStep2Submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark">School name</label>
              <input type="text" required value={school} onChange={(e) => setSchool(e.target.value)} className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary" placeholder="e.g. Manungu Secondary School" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark">Province</label>
              <select required value={province} onChange={(e) => setProvince(e.target.value)} className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">Select province</option>
                <option>Central</option><option>Copperbelt</option><option>Eastern</option>
                <option>Luapula</option><option>Lusaka</option><option>Muchinga</option>
                <option>Northern</option><option>North-Western</option><option>Southern</option><option>Western</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark">District</label>
              <input type="text" required value={district} onChange={(e) => setDistrict(e.target.value)} className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary" placeholder="e.g. Itezhi-Tezhi" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark">Grades you teach</label>
              <input type="text" value={grades.join(', ')} onChange={(e) => setGrades(e.target.value.split(',').map(s => s.trim()))} className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary" placeholder="e.g. Grade 5, Grade 8" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark">Subjects</label>
              <input type="text" value={subjects.join(', ')} onChange={(e) => setSubjects(e.target.value.split(',').map(s => s.trim()))} className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary" placeholder="e.g. Mathematics, Science" />
            </div>
            <button type="submit" className="btn-primary w-full py-2.5">Complete Registration</button>
          </form>
        )}
      </div>
    </div>
  )
}
