"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, DocumentTextIcon, TrashIcon, PencilSquareIcon } from "@heroicons/react/24/outline";

const API = process.env.NEXT_PUBLIC_API_URL || "";

export default function NotesPage() {
  const [notes, setNotes] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token") || ""}` });

  const loadNotes = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API}/api/notes`, { headers: headers() });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Failed to load notes");
      setNotes(Array.isArray(data) ? data : []);
    } catch (e: any) { setError(e.message || "Failed to load notes"); } finally { setLoading(false); }
  };

  useEffect(() => { loadNotes(); }, []);

  const reset = () => { setTitle(""); setSubject(""); setGrade(""); setContent(""); setEditingId(null); };

  const save = async () => {
    setError(""); setMessage("");
    if (!title.trim() || !content.trim()) { setError("Title and note content are required."); return; }
    setSaving(true);
    try {
      const response = await fetch(`${API}/api/notes${editingId ? `/${editingId}` : ""}`, {
        method: editingId ? "PUT" : "POST", headers: headers(),
        body: JSON.stringify({ title: title.trim(), content, subject: subject.trim() || undefined, grade: grade.trim() || undefined })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Failed to save note");
      setMessage(editingId ? "Note updated." : "Note saved.");
      reset(); await loadNotes();
    } catch (e: any) { setError(e.message || "Failed to save note"); } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this note?")) return;
    try {
      const response = await fetch(`${API}/api/notes/${id}`, { method: "DELETE", headers: headers() });
      if (!response.ok) { const d = await response.json(); throw new Error(d?.error || "Failed to delete note"); }
      setNotes((current) => current.filter((n) => n.id !== id));
    } catch (e: any) { setError(e.message || "Failed to delete note"); }
  };

  const edit = (note: any) => { setEditingId(note.id); setTitle(note.title || ""); setSubject(note.subject || ""); setGrade(note.grade || ""); setContent(note.content || ""); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const readFile = async (file: File) => {
    setError(""); setMessage("");
    const allowed = /\.(pdf|txt|md|csv|json)$/i.test(file.name);
    if (!allowed) {
      setError("Unsupported file. Please upload a PDF, TXT, MD, CSV or JSON notes file.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("File is too large. Maximum size is 15 MB.");
      return;
    }

    setSaving(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (title.trim()) form.append("title", title.trim());
      if (subject.trim()) form.append("subject", subject.trim());
      if (grade.trim()) form.append("grade", grade.trim());

      const response = await fetch(`${API}/api/notes/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Failed to upload notes");

      setTitle(data.title || file.name.replace(/\.[^.]+$/, ""));
      setSubject(data.subject || subject);
      setGrade(data.grade || grade);
      setContent(data.content || "");
      setMessage(`✓ ${file.name} uploaded and its text was extracted. You can review or edit it above.`);
      await loadNotes();
    } catch (e: any) {
      setError(e.message || "Failed to upload notes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-primary text-white shadow-md"><div className="max-w-7xl mx-auto px-4 flex justify-between items-center h-16"><div className="flex items-center gap-4"><Link href="/dashboard"><ArrowLeftIcon className="w-5 h-5" /></Link><span className="text-2xl font-bold">mytoolbox</span></div><nav className="hidden md:flex gap-6"><Link href="/dashboard">Dashboard</Link><Link href="/generate">Lessons</Link><Link href="/assessments">Assessments</Link><Link href="/notes" className="text-secondary font-semibold">Notes</Link></nav></div></header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6"><h1 className="text-3xl font-bold text-primary flex items-center gap-3"><DocumentTextIcon className="w-8 h-8 text-secondary" /> Notes</h1><p className="text-dark/70">Upload, save, edit and manage teaching notes.</p></div>
        {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700">⚠️ {error}</div>}
        {message && <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-700">✅ {message}</div>}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1"><div className="bg-white rounded-xl shadow-sm border border-highlight p-6"><div className="flex justify-between items-center mb-4"><h2 className="text-lg font-semibold text-primary">{editingId ? "Edit Note" : "Add Note"}</h2><button onClick={() => fileRef.current?.click()} className="px-3 py-2 bg-primary text-white rounded-lg text-sm">Upload File</button><input ref={fileRef} type="file" accept=".pdf,.txt,.md,.csv,.json" className="hidden" onChange={(e) => { const f=e.target.files?.[0]; if(f) readFile(f); e.currentTarget.value=""; }} /></div>
            <div className="space-y-3"><input value={title} onChange={(e)=>setTitle(e.target.value)} className="w-full px-3 py-2 border rounded-md" placeholder="Note title" /><input value={subject} onChange={(e)=>setSubject(e.target.value)} className="w-full px-3 py-2 border rounded-md" placeholder="Subject" /><input value={grade} onChange={(e)=>setGrade(e.target.value)} className="w-full px-3 py-2 border rounded-md" placeholder="Grade/Form" /><textarea value={content} onChange={(e)=>setContent(e.target.value)} rows={12} className="w-full px-3 py-2 border rounded-md" placeholder="Paste or type your teaching notes here..." /><div className="flex gap-2"><button onClick={save} disabled={saving} className="btn-primary flex-1 disabled:opacity-50">{saving ? "Saving..." : editingId ? "Update Note" : "Save Note"}</button>{editingId && <button onClick={reset} className="btn-secondary">Cancel</button>}</div></div>
          </div></div>
          <div className="lg:col-span-2"><div className="bg-white rounded-xl shadow-sm border border-highlight p-6"><h2 className="text-lg font-semibold text-primary mb-4">Saved Notes</h2>{loading ? <p>Loading notes...</p> : notes.length === 0 ? <p className="text-dark/60 py-8 text-center">No notes saved yet.</p> : <div className="space-y-3">{notes.map((n)=><div key={n.id} className="border rounded-lg p-4"><div className="flex justify-between gap-4"><div><h3 className="font-semibold text-primary">{n.title}</h3><p className="text-xs text-gray-500">{n.subject || ""}{n.subject && n.grade ? " · " : ""}{n.grade || ""}</p></div><div className="flex gap-2"><button onClick={()=>edit(n)} className="text-primary"><PencilSquareIcon className="w-5 h-5" /></button><button onClick={()=>remove(n.id)} className="text-red-500"><TrashIcon className="w-5 h-5" /></button></div></div><p className="mt-3 text-sm whitespace-pre-wrap text-gray-700 line-clamp-6">{n.content}</p></div>)}</div>}</div></div>
        </div>
      </main>
    </div>
  );
}
