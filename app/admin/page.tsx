
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    // Simulate loading stats - replace with actual API call
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
  }, []);

  if (!stats) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Users",
      value: stats.totalUsers,
      icon: UsersIcon,
      color: "text-blue-600",
      bg: "bg-blue-100",
    },
    {
      label: "Lessons Created",
      value: stats.totalLessons,
      icon: DocumentTextIcon,
      color: "text-green-600",
      bg: "bg-green-100",
    },
    {
      label: "Community Posts",
      value: stats.totalPosts,
      icon: ChatBubbleLeftIcon,
      color: "text-purple-600",
      bg: "bg-purple-100",
    },
    {
      label: "Revenue (ZMW)",
      value: `K${stats.revenue.toLocaleString()}`,
      icon: CurrencyDollarIcon,
      color: "text-yellow-600",
      bg: "bg-yellow-100",
    },
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
          <Link
            href="/dashboard"
            className="text-primary hover:underline flex items-center gap-1"
          >
            ← Back to Dashboard
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {statCards.map((stat, index) => (
            <div
              key={index}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
            >
              <div className="flex items-center justify-between">
                <div className={`${stat.bg} p-3 rounded-lg`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <span className="text-2xl font-bold text-primary">
                  {stat.value}
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-2">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Quick Status */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-primary">
              {stats.newUsersToday}
            </div>
            <div className="text-xs text-gray-500">New Users Today</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-primary">
              {stats.totalSchemes}
            </div>
            <div className="text-xs text-gray-500">Schemes of Work</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-primary">
              {stats.totalAssessments}
            </div>
            <div className="text-xs text-gray-500">Assessments Created</div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
            <div className="text-2xl font-bold text-red-600">
              {stats.pendingModeration}
            </div>
            <div className="text-xs text-gray-500">Pending Moderation</div>
          </div>
        </div>

        {/* System Status */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-primary mb-4">
            System Status
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">System Health</span>
              <span className="text-sm text-green-600 font-medium">
                ✅ {stats.systemHealth}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Uptime</span>
              <span className="text-sm text-primary font-medium">
                {stats.uptime}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Active Users</span>
              <span className="text-sm text-primary font-medium">
                {stats.activeUsers}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <button className="bg-primary text-white p-3 rounded-lg hover:bg-primary/80 transition-colors">
            👥 Manage Users
          </button>
          <button className="bg-yellow-500 text-black p-3 rounded-lg hover:bg-yellow-400 transition-colors">
            📄 Review Content
          </button>
          <button className="bg-green-600 text-white p-3 rounded-lg hover:bg-green-700 transition-colors">
            🛡️ Moderation
          </button>
          <button className="bg-purple-600 text-white p-3 rounded-lg hover:bg-purple-700 transition-colors">
            💰 View Payments
          </button>
        </div>
      </div>
    </div>
  );
}
