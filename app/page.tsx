import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header with Logo */}
      <header className="bg-green-800 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
          <div className="flex items-center space-x-2">
            {/* 📚 Logo */}
            <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
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

      {/* Rest of your page... */}
    </div>
  )
}
