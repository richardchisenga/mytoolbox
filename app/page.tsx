import Link from 'next/link'
import { AcademicCapIcon, ClockIcon, DocumentTextIcon, SparklesIcon } from '@heroicons/react/24/outline'

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-primary text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
          <div className="flex items-center space-x-2">
            <span className="text-2xl font-bold">mytoolbox</span>
            <span className="text-xs bg-secondary text-dark px-2 py-0.5 rounded-full font-semibold">Beta</span>
          </div>
          <nav className="hidden md:flex space-x-6">
            <Link href="/" className="hover:text-secondary">Home</Link>
            <Link href="#features" className="hover:text-secondary">Features</Link>
            <Link href="/register" className="hover:text-secondary">Sign Up</Link>
          </nav>
          <div className="flex items-center space-x-4">
            <Link href="/login" className="text-sm hover:text-secondary">Login</Link>
            <Link href="/register" className="btn-primary text-sm">Get Started</Link>
          </div>
        </div>
      </header>

      <section className="bg-gradient-to-b from-primary/5 to-white py-20 px-4 flex-1">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-primary leading-tight">
            Reclaim your weekends,<br />
            <span className="text-secondary">starting today</span>
          </h1>
          <p className="text-lg md:text-xl text-dark/80 mt-4 max-w-2xl mx-auto">
            Create professional, curriculum-aligned lesson plans in minutes.
            Spend less time planning, more time teaching.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
            <Link href="/register" className="btn-primary text-lg px-8 py-3">
              Try mytoolbox free →
            </Link>
            <span className="text-sm text-dark/60 self-center">
              Free to start · No credit card · Cancel anytime
            </span>
          </div>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-highlight">
              <AcademicCapIcon className="w-8 h-8 text-primary mb-2" />
              <h3 className="font-semibold text-primary">Curriculum aligned</h3>
              <p className="text-sm text-dark/70">CDC & ECZ standards, from Grade 1 to 12</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-highlight">
              <ClockIcon className="w-8 h-8 text-primary mb-2" />
              <h3 className="font-semibold text-primary">Minutes, not Sundays</h3>
              <p className="text-sm text-dark/70">Generate a full lesson in seconds</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-highlight">
              <DocumentTextIcon className="w-8 h-8 text-primary mb-2" />
              <h3 className="font-semibold text-primary">Export anywhere</h3>
              <p className="text-sm text-dark/70">Word, PDF, PowerPoint, Google Slides</p>
            </div>
          </div>
        </div>
      </section>

      <div className="bg-primary/5 py-6 border-y border-highlight">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap justify-center gap-8 text-center">
          <div><span className="font-bold text-primary text-2xl">10,000+</span><br />Teachers helped</div>
          <div><span className="font-bold text-primary text-2xl">50,000+</span><br />Resources generated</div>
          <div><span className="font-bold text-primary text-2xl">100%</span><br />Curriculum aligned</div>
        </div>
      </div>

      <footer className="bg-primary text-white py-8 px-4">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
          <div>
            <h4 className="font-semibold text-secondary">Product</h4>
            <ul className="space-y-1 mt-2">
              <li><Link href="#">For Teachers</Link></li>
              <li><Link href="#">For Schools</Link></li>
              <li><Link href="#">Pricing</Link></li>
              <li><Link href="#">FAQ</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-secondary">Company</h4>
            <ul className="space-y-1 mt-2">
              <li><Link href="#">Contact</Link></li>
              <li><Link href="#">Privacy</Link></li>
              <li><Link href="#">Terms</Link></li>
              <li><Link href="#">Accessibility</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-secondary">Education</h4>
            <ul className="space-y-1 mt-2">
              <li>Ministry of Education</li>
              <li>Exams Council (ECZ)</li>
              <li>Teaching Council (TCZ)</li>
              <li>Curriculum Dev. (CDC)</li>
              <li>Zambia eLearning (NSDC)</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-secondary">Get started</h4>
            <ul className="space-y-1 mt-2">
              <li><Link href="/register" className="text-secondary hover:underline">Sign up free</Link></li>
              <li><Link href="/login">Login</Link></li>
              <li className="text-highlight">support@mytoolbox.io</li>
            </ul>
          </div>
        </div>
        <div className="mt-8 text-center text-xs border-t border-highlight/20 pt-4">
          © 2026 mytoolbox by Your Company – Made for teachers in Zambia
        </div>
      </footer>
    </div>
  )
}
