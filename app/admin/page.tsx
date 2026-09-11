"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "";

type Panel = "users" | "content" | "payments" | "moderation" | null;

export default function AdminDashboard() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [schemes, setSchemes] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [activePanel, setActivePanel] = useState<Panel>(null);
  const [panelLoading, setPanelLoading] = useState(false);

  const token = () => localStorage.getItem("token") || "";

  async function api(path: string, options: RequestInit = {}) {
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token()}`,
        ...(options.headers || {}),
      },
    });

    if (response.status === 401 || response.status === 403) {
      setIsAuthenticated(false);
      throw new Error("Administrator access required.");
    }

    const text = await response.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Server returned an invalid response (${response.status}).`);
    }

    if (!response.ok) {
      throw new Error(data?.error || `Request failed (${response.status}).`);
    }
    return data;
  }

  async function loadDashboard() {
    setLoading(true);
    setError("");
    try {
      const me = await api("/api/auth/me");
      if (me.role !== "ADMIN") throw new Error("Administrator access required.");
      setIsAuthenticated(true);

      const [statsData, usersData] = await Promise.all([
        api("/api/admin/stats"),
        api("/api/admin/users/detailed"),
      ]);

      const raw = statsData?.stats ?? statsData ?? {};
      setStats({
        totalUsers: Number(raw.totalUsers ?? 0),
        totalLessons: Number(raw.totalLessons ?? 0),
        totalSchemes: Number(raw.totalSchemes ?? 0),
        totalPayments: Number(raw.totalPayments ?? 0),
        revenue: Number(raw.revenue ?? raw.totalRevenue ?? 0),
        newUsersToday: Number(raw.newUsersToday ?? 0),
        lessonsToday: Number(raw.lessonsToday ?? 0),
        schemesToday: Number(raw.schemesToday ?? 0),
        paymentsToday: Number(raw.paymentsToday ?? 0),
        activeUsers: Number(raw.activeUsers ?? 0),
        pendingModeration: Number(raw.pendingModeration ?? 0),
        systemHealth: raw.systemHealth ?? "Operational",
        uptime: raw.uptime ?? "N/A",
        proPayments: Number(raw.proPayments ?? 0),
        schoolPayments: Number(raw.schoolPayments ?? 0),
      });

      setUsers(Array.isArray(usersData) ? usersData : usersData?.users || []);
    } catch (e: any) {
      console.error("Admin dashboard error:", e);
      setError(e.message || "Failed to load administrator data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  async function openPanel(panel: Panel) {
    setActivePanel(panel);
    if (!panel || panel === "users") return;

    setPanelLoading(true);
    setError("");
    try {
      if (panel === "content" || panel === "moderation") {
        const [lessonData, schemeData] = await Promise.all([
          api("/api/admin/lessons"),
          api("/api/admin/schemes"),
        ]);
        setLessons(Array.isArray(lessonData) ? lessonData : lessonData?.lessons || []);
        setSchemes(Array.isArray(schemeData) ? schemeData : schemeData?.schemes || []);
      }

      if (panel === "payments") {
        const paymentData = await api("/api/admin/payments");
        setPayments(Array.isArray(paymentData) ? paymentData : paymentData?.payments || []);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load this section.");
    } finally {
      setPanelLoading(false);
    }
  }

  async function changePayment(id: string, action: "approve" | "reject") {
    try {
      setPanelLoading(true);
      await api(`/api/admin/payments/${id}/${action}`, { method: "POST" });
      const paymentData = await api("/api/admin/payments");
      setPayments(Array.isArray(paymentData) ? paymentData : paymentData?.payments || []);
      await loadDashboard();
    } catch (e: any) {
      setError(e.message || `Failed to ${action} payment.`);
    } finally {
      setPanelLoading(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-sm w-full text-center border border-gray-200">
          <h1 className="text-2xl font-bold text-primary">🔐 Admin Access</h1>
          <p className="text-gray-600 mt-2 text-sm">Administrator access is controlled by your authenticated account.</p>
          {error && <div className="my-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{error}</div>}
          <button onClick={loadDashboard} className="mt-4 bg-primary text-white px-6 py-3 rounded-lg w-full font-semibold">
            Verify Admin Account
          </button>
        </div>
      </div>
    );
  }

  if (loading || !stats) {
    return <div className="min-h-screen flex items-center justify-center text-gray-600">Loading dashboard data...</div>;
  }

  const revenue = Number(stats.revenue || 0);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-primary">Admin Dashboard</h1>
            <p className="text-gray-600">Real-time platform analytics</p>
          </div>
          <div className="flex gap-4 items-center">
            <button onClick={() => { setIsAuthenticated(false); setActivePanel(null); }} className="text-sm text-red-600">🔒 Lock Admin</button>
            <Link href="/dashboard" className="text-primary hover:underline">← Back to Dashboard</Link>
          </div>
        </div>

        {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700">⚠️ {error}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            ["Total Users", stats.totalUsers],
            ["Lessons Created", stats.totalLessons],
            ["Schemes of Work", stats.totalSchemes],
            ["Revenue (ZMW)", `K${revenue.toLocaleString()}`],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-white rounded-xl shadow-sm border p-6">
              <div className="text-2xl font-bold text-primary">{value}</div>
              <p className="text-sm text-gray-600 mt-2">{label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[["New Users Today", stats.newUsersToday], ["Lessons Today", stats.lessonsToday], ["Schemes Today", stats.schemesToday], ["Payments Today", stats.paymentsToday]].map(([label, value]) => (
            <div key={String(label)} className="bg-white rounded-xl shadow-sm border p-4 text-center">
              <div className="text-2xl font-bold text-primary">{value}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
          <h2 className="text-lg font-semibold text-primary mb-4">System Status</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>System Health: <span className="text-green-600 font-medium">✅ {stats.systemHealth}</span></div>
            <div>Uptime: <span className="font-medium">{stats.uptime}</span></div>
            <div>Active Users: <span className="font-medium">{stats.activeUsers}</span></div>
            <div>Pending Moderation: <span className="text-red-600 font-medium">{stats.pendingModeration}</span></div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <button onClick={() => openPanel("users")} className="bg-primary text-white p-3 rounded-lg font-medium">👥 Manage Users ({stats.totalUsers})</button>
          <button onClick={() => openPanel("content")} className="bg-yellow-500 text-black p-3 rounded-lg font-medium">📄 Review Content</button>
          <button onClick={() => openPanel("payments")} className="bg-green-600 text-white p-3 rounded-lg font-medium">💰 View Payments (K{revenue.toLocaleString()})</button>
          <button onClick={() => openPanel("moderation")} className="bg-purple-600 text-white p-3 rounded-lg font-medium">🛡️ Moderation</button>
        </div>

        {panelLoading && <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6 text-blue-700">Loading section...</div>}

        {activePanel === "users" && (
          <section className="bg-white rounded-xl shadow-sm border p-6 mb-6">
            <h3 className="text-lg font-semibold text-primary mb-4">👥 All Users ({users.length})</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50"><th className="p-2 text-left">Name</th><th className="p-2 text-left">School</th><th className="p-2">Lessons</th><th className="p-2">Schemes</th><th className="p-2">Revenue</th><th className="p-2">Joined</th></tr></thead>
                <tbody>{users.slice(0, 50).map((u: any) => <tr key={u.id} className="border-t"><td className="p-2"><b>{u.fullName}</b><div className="text-xs text-gray-500">{u.email}</div></td><td className="p-2">{u.school || "—"}</td><td className="p-2 text-center">{u.lessons ?? u.lessonsUsed ?? 0}</td><td className="p-2 text-center">{u.schemes ?? u.schemesUsed ?? 0}</td><td className="p-2">K{Number(u.revenue || 0).toLocaleString()}</td><td className="p-2">{u.createdAt || u.joined ? new Date(u.createdAt || u.joined).toLocaleDateString() : "—"}</td></tr>)}</tbody>
              </table>
            </div>
          </section>
        )}

        {(activePanel === "content" || activePanel === "moderation") && (
          <section className="bg-white rounded-xl shadow-sm border p-6 mb-6">
            <h3 className="text-lg font-semibold text-primary mb-4">{activePanel === "moderation" ? "🛡️ Moderation" : "📄 Content Review"}</h3>
            <div className="mb-6"><h4 className="font-semibold mb-2">Recent Lessons ({lessons.length})</h4><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50"><th className="p-2 text-left">Topic</th><th className="p-2 text-left">Subject</th><th className="p-2 text-left">Grade</th><th className="p-2 text-left">User</th></tr></thead><tbody>{lessons.map((l: any) => <tr key={l.id} className="border-t"><td className="p-2">{l.topic || "—"}</td><td className="p-2">{l.subject || "—"}</td><td className="p-2">{l.grade || "—"}</td><td className="p-2">{l.user?.fullName || l.teacherName || "—"}</td></tr>)}</tbody></table></div></div>
            <div><h4 className="font-semibold mb-2">Recent Schemes ({schemes.length})</h4><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50"><th className="p-2 text-left">Subject</th><th className="p-2 text-left">Grade</th><th className="p-2 text-left">Term</th><th className="p-2 text-left">User</th></tr></thead><tbody>{schemes.map((s: any) => <tr key={s.id} className="border-t"><td className="p-2">{s.subject || "—"}</td><td className="p-2">{s.grade || "—"}</td><td className="p-2">{s.term || "—"}</td><td className="p-2">{s.user?.fullName || "—"}</td></tr>)}</tbody></table></div></div>
          </section>
        )}

        {activePanel === "payments" && (
          <section className="bg-white rounded-xl shadow-sm border p-6 mb-6">
            <h3 className="text-lg font-semibold text-primary mb-4">💰 Payments ({payments.length})</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              <div className="bg-gray-50 p-4 rounded-lg text-center"><b>{stats.totalPayments}</b><div className="text-xs text-gray-500">Completed/Recorded</div></div>
              <div className="bg-gray-50 p-4 rounded-lg text-center"><b>K{revenue.toLocaleString()}</b><div className="text-xs text-gray-500">Revenue</div></div>
              <div className="bg-gray-50 p-4 rounded-lg text-center"><b>{stats.proPayments}</b><div className="text-xs text-gray-500">Pro Plans</div></div>
              <div className="bg-gray-50 p-4 rounded-lg text-center"><b>{stats.schoolPayments}</b><div className="text-xs text-gray-500">School Plans</div></div>
            </div>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50"><th className="p-2 text-left">User</th><th className="p-2">Amount</th><th className="p-2">Plan</th><th className="p-2">Status</th><th className="p-2">Date</th><th className="p-2">Action</th></tr></thead><tbody>{payments.map((p: any) => <tr key={p.id} className="border-t"><td className="p-2">{p.user?.fullName || p.user?.email || p.userId || "—"}</td><td className="p-2">K{Number(p.amount || 0).toLocaleString()}</td><td className="p-2">{p.plan || "—"}</td><td className="p-2">{p.status || "—"}</td><td className="p-2">{p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "—"}</td><td className="p-2">{p.status === "pending" ? <div className="flex gap-2"><button onClick={() => changePayment(p.id, "approve")} className="px-2 py-1 rounded bg-green-600 text-white">Approve</button><button onClick={() => changePayment(p.id, "reject")} className="px-2 py-1 rounded bg-red-600 text-white">Reject</button></div> : "—"}</td></tr>)}</tbody></table></div>
          </section>
        )}
      </div>
    </div>
  );
}
