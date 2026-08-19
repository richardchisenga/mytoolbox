import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-green-800 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
          <div className="flex items-center space-x-2">
            <span className="text-2xl font-bold">mytoolbox</span>
            <span className="text-xs bg-yellow-500 text-black px-2 py-0.5 rounded-full font-semibold">Beta</span>
          </div>
          <nav className="hidden md:flex space-x-6">
            <Link href="/" className="hover:text-yellow-400">Home</Link>
            <Link href="/register" className="hover:text-yellow-400">Sign Up</Link>
          </nav>
          <div className="flex items-center space-x-4">
            <Link href="/login" className="text-sm hover:text-yellow-400">Login</Link>
            <Link href="/register" className="bg-yellow-500 text-black px-4 py-2 rounded-md hover:bg-yellow-400">
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-green-50 to-white py-20 px-4 flex-1">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-green-800 leading-tight">
            Teaching made easy
          </h1>
          <p className="text-lg md:text-xl text-gray-600 mt-4 max-w-2xl mx-auto">
            Create professional, curriculum-aligned lesson plans in minutes.
            Spend less time planning, more time teaching.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
            <Link href="/register" className="bg-yellow-500 text-black px-8 py-3 rounded-md hover:bg-yellow-400 font-semibold">
              Try mytoolbox free →
            </Link>
            <span className="text-sm text-gray-500 self-center">
              Free to start · No credit card · Cancel anytime
            </span>
          </div>

          {/* Features */}
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-green-200">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mb-2">
                <span className="text-green-700 text-xl">📚</span>
              </div>
              <h3 className="font-semibold text-green-800">Curriculum aligned</h3>
              <p className="text-sm text-gray-600">CDC & ECZ standards, from Grade 1 to 12</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-green-200">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mb-2">
                <span className="text-green-700 text-xl">⏱️</span>
              </div>
              <h3 className="font-semibold text-green-800">Minutes, not Sundays</h3>
              <p className="text-sm text-gray-600">Generate a full lesson in seconds</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm border border-green-200">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mb-2">
                <span className="text-green-700 text-xl">📄</span>
              </div>
              <h3 className="font-semibold text-green-800">Export anywhere</h3>
              <p className="text-sm text-gray-600">Word, PDF, PowerPoint, Google Slides</p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="bg-green-50 py-6 border-y border-green-200">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap justify-center gap-8 text-center">
          <div>
            <div className="font-bold text-green-800 text-2xl">10,000+</div>
            <div className="text-sm text-gray-600">Teachers helped</div>
          </div>
          <div>
            <div className="font-bold text-green-800 text-2xl">50,000+</div>
            <div className="text-sm text-gray-600">Resources generated</div>
          </div>
          <div>
            <div className="font-bold text-green-800 text-2xl">100%</div>
            <div className="text-sm text-gray-600">Curriculum aligned</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-green-800 text-white py-8 px-4">
        <div className="max-w-7xl mx-auto text-center text-sm">
          © 2026 mytoolbox – Made for teachers in Zambia
        </div>
      </footer>
    </div>
  )
}
