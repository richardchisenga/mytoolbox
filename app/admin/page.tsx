"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  UsersIcon,
  DocumentTextIcon,
  ChatBubbleLeftIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  CheckCircleIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";

export default function AdminDashboard() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [stats, setStats] = useState<any>(null);
  const [showUsers, setShowUsers] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [showPayments, setShowPayments] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [content, setContent] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);

  // Admin password
  const ADMIN_PASSWORD = "1914@29ce";

  const handleLogin = () => {
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      setError("");
      loadStats();
      loadUsers();
      loadContent();
      loadPayments();
    } else {
      setError("Wrong password! Please try again.");
      setPassword("");
    }
  };

  const loadStats = () => {
    setStats({
      totalUsers: 1247,
      totalLessons: 3456,
      totalSchemes: 892,
      totalAssessments: 2103,
      totalPosts: 567,
      totalPayments: 234,
      revenue: 45600,
      activeUsers: 876,
      newUsersToday: 23,
      pendingModeration: 12,
      systemHealth: "Operational",
      uptime: "99.98%",
    });
  };

  const loadUsers = () => {
    // Mock users - in production, fetch from API
    setUsers([
      { id: 1, name: "Martha Kaluba", email: "martha@example.com", school: "Itezhi-Tezhi Boarding", role: "Teacher", joined: "2025-01-15" },
      { id: 2, name: "John Phiri", email: "john@example.com", school: "Manungu Secondary", role: "Teacher", joined: "2025-02-20" },
      { id: 3, name: "Sarah Mwansa", email: "sarah@example.com", school: "Lusaka Girls", role: "Admin", joined: "2024-11-01" },
      { id: 4, name: "David Banda", email: "david@example.com", school: "Chilenje Primary", role: "Teacher", joined: "2025-03-10" },
    ]);
  };

  const loadContent = () => {
    setContent([
      { id: 1, type: "Lesson", title: "Fractions - Introduction", author: "Martha Kaluba", status: "Published", date: "2026-08-15" },
      { id: 2, type: "Scheme", title: "Term 2 Science Scheme", author: "John Phiri", status: "Pending", date: "2026-08-14" },
      { id: 3, type: "Assessment", title: "Math Quiz - Week 3", author: "Sarah Mwansa", status: "Flagged", date: "2026-08-13" },
    ]);
  };

  const loadPayments = () => {
    setPayments([
      { id: 1, user: "Martha Kaluba", amount: 150, plan: "Pro", date: "2026-08-15", status: "Completed" },
      { id: 2, user: "John Phiri", amount: 150, plan: "Pro", date: "2026-08-14", status: "Pending" },
      { id: 3, user: "David Banda", amount: 500, plan: "School", date: "2026-08-13", status: "Completed" },
    ]);
  };

  // Password screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-sm w-full border border-gray-200">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-primary">🔐 Admin Access</h1>
            <p className="text-gray-600 mt-2 text-sm">Enter the admin password to continue.</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              ❌ {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Enter admin password"
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              autoFocus
            />
          </div>

          <button
            onClick={handleLogin}
            className="mt-4 bg-yellow-500 text-black px-6 py-3 rounded-lg hover:bg-yellow-400 w-full font-semibold transition-colors"
          >
            🔑 Access Admin
          </button>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const statCards = [
    { label: "Total Users", value: stats.totalUsers, icon: UsersIcon, color: "text-blue-600", bg: "bg-blue-100" },
    { label: "Lessons Created", value: stats.totalLessons, icon: DocumentTextIcon, color: "text-green-600", bg: "bg-green-100" },
    { label: "Community Posts", value: stats.totalPosts, icon: ChatBubbleLeftIcon, color: "text-purple-600", bg: "bg-purple-100" },
    { label: "Revenue (ZMW)", value: `K${stats.revenue.toLocaleString()}`, icon: CurrencyDollarIcon, color: "text-yellow-600", bg: "bg-yellow-100" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-primary">Admin Dashboard</h1>
            <p className="text-gray-600">Overview of your platform</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setIsAuthenticated(false);
                setPassword("");
                setShowUsers(false);
                setShowContent(false);
                setShowPayments(false);
              }}
              className="text-sm text-red-600 hover:text-red-800 transition-colors"
            >
              🔒 Lock Admin
            </button>
            <Link href="/dashboard" className="text-primary hover:underline flex items-center gap-1">
              ← Back to Dashboard
            </Link>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {statCards.map((stat, index) => (
            <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div className={`${stat.bg} p-3 rounded-lg`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <span className="text-2xl font-bold text-primary">{stat.value}</span>
              </div>
              <p className="text-sm text-gray-600 mt-2">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Quick Status */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-primary">{stats.newUsersToday}</div>
            <div className="text-xs text-gray-500">New Users Today</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-primary">{stats.totalSchemes}</div>
            <div className="text-xs text-gray-500">Schemes of Work</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-primary">{stats.totalAssessments}</div>
            <div className="text-xs text-gray-500">Assessments Created</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{stats.pendingModeration}</div>
            <div className="text-xs text-gray-500">Pending Moderation</div>
          </div>
        </div>

        {/* System Status */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-primary mb-4">System Status</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">System Health</span>
              <span className="text-sm text-green-600 font-medium">✅ {stats.systemHealth}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Uptime</span>
              <span className="text-sm text-primary font-medium">{stats.uptime}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Active Users</span>
              <span className="text-sm text-primary font-medium">{stats.activeUsers}</span>
            </div>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <button
            onClick={() => setShowUsers(!showUsers)}
            className="bg-primary text-white p-3 rounded-lg hover:bg-primary/80 transition-colors"
          >
            👥 Manage Users
          </button>
          <button
            onClick={() => setShowContent(!showContent)}
            className="bg-yellow-500 text-black p-3 rounded-lg hover:bg-yellow-400 transition-colors"
          >
            📄 Review Content
          </button>
          <button
            onClick={() => setShowPayments(!showPayments)}
            className="bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 transition-colors"
          >
            💰 View Payments
          </button>
          <button className="bg-purple-600 text-white p-3 rounded-lg hover:bg-purple-700 transition-colors">
            🛡️ Moderation
          </button>
        </div>

        {/* Users Section */}
        {showUsers && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-primary mb-4">👥 User Management</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="p-2 text-left">Name</th>
                    <th className="p-2 text-left">Email</th>
                    <th className="p-2 text-left">School</th>
                    <th className="p-2 text-left">Role</th>
                    <th className="p-2 text-left">Joined</th>
                    <th className="p-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-t border-gray-100">
                      <td className="p-2">{user.name}</td>
                      <td className="p-2 text-xs">{user.email}</td>
                      <td className="p-2 text-xs">{user.school}</td>
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          user.role === 'Admin' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="p-2 text-xs">{user.joined}</td>
                      <td className="p-2">
                        <button className="text-blue-600 hover:underline text-xs">Edit</button>
                        <button className="text-red-600 hover:underline text-xs ml-2">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Content Section */}
        {showContent && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-primary mb-4">📄 Content Review</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="p-2 text-left">Type</th>
                    <th className="p-2 text-left">Title</th>
                    <th className="p-2 text-left">Author</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Date</th>
                    <th className="p-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {content.map((item) => (
                    <tr key={item.id} className="border-t border-gray-100">
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          item.type === 'Lesson' ? 'bg-blue-100 text-blue-700' :
                          item.type === 'Scheme' ? 'bg-green-100 text-green-700' :
                          'bg-purple-100 text-purple-700'
                        }`}>
                          {item.type}
                        </span>
                      </td>
                      <td className="p-2 text-xs">{item.title}</td>
                      <td className="p-2 text-xs">{item.author}</td>
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          item.status === 'Published' ? 'bg-green-100 text-green-700' :
                          item.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="p-2 text-xs">{item.date}</td>
                      <td className="p-2">
                        <button className="text-blue-600 hover:underline text-xs">View</button>
                        <button className="text-red-600 hover:underline text-xs ml-2">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Payments Section */}
        {showPayments && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-primary mb-4">💰 Payment Management</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="p-2 text-left">User</th>
                    <th className="p-2 text-left">Amount</th>
                    <th className="p-2 text-left">Plan</th>
                    <th className="p-2 text-left">Date</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-t border-gray-100">
                      <td className="p-2 text-xs">{payment.user}</td>
                      <td className="p-2 font-semibold">ZMW {payment.amount}</td>
                      <td className="p-2 text-xs">{payment.plan}</td>
                      <td className="p-2 text-xs">{payment.date}</td>
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          payment.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {payment.status}
                        </span>
                      </td>
                      <td className="p-2">
                        <button className="text-blue-600 hover:underline text-xs">View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
