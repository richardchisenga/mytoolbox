"use client";
import { useState } from "react";

const API=process.env.NEXT_PUBLIC_API_URL || "";
const empty={week:"1",date:"",topic:"",subTopic:"",workCovered:"",remarks:""};
export default function RecordOfWorkPage(){
 const [form,setForm]=useState({title:"Term Record",subject:"",grade:"",term:"",year:String(new Date().getFullYear()),teacher:"",school:""});
 const [rows,setRows]=useState([empty]); const [status,setStatus]=useState("");
 const update=(k:string,v:string)=>setForm({...form,[k]:v});
 const row=(i:number,k:string,v:string)=>{const n=[...rows];n[i]={...n[i],[k]:v};setRows(n)};
 const save=async()=>{try{setStatus("Saving...");const token=localStorage.getItem("token");const r=await fetch(`${API}/api/records-of-work`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({...form,rows})});const d=await r.json();setStatus(r.ok?"Saved successfully":(d.error||"Save failed"));}catch{setStatus("Could not save");}};
 const exportFile=async(type:"word"|"pdf")=>{try{setStatus(`Preparing ${type.toUpperCase()}...`);const token=localStorage.getItem("token");const r=await fetch(`${API}/api/planner/export/record-of-work/${type}`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({...form,rows})});if(!r.ok)throw new Error((await r.json()).error||"Export failed");const blob=await r.blob();const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`record-of-work_${form.subject||"document"}_${form.term||""}_${form.year}.`+(type==="word"?"docx":"pdf");a.click();URL.revokeObjectURL(a.href);setStatus(`${type.toUpperCase()} downloaded`);}catch(e:any){setStatus(e.message||"Export failed");}};
 return <main className="p-4 max-w-7xl mx-auto space-y-4"><h1 className="text-2xl font-bold">Record of Work</h1>
 <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">{Object.entries(form).map(([k,v])=><input key={k} value={v} onChange={e=>update(k,e.target.value)} placeholder={k} className="border rounded px-3 py-2"/>)}</div>
 <div className="overflow-x-auto"><table className="min-w-[1000px] w-full border"><thead><tr>{["week","date","topic","subTopic","workCovered","remarks"].map(h=><th className="border p-2" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}>{Object.keys(empty).map(k=><td className="border p-1" key={k}><input className="w-full p-2" value={(r as any)[k]||""} onChange={e=>row(i,k,e.target.value)}/></td>)}</tr>)}</tbody></table></div>
 <div className="flex gap-2 flex-wrap"><button onClick={()=>setRows([...rows,{...empty,week:String(rows.length+1)}])} className="border rounded px-4 py-2">Add Row</button><button onClick={save} className="border rounded px-4 py-2">Save</button><button onClick={()=>exportFile("word")} className="rounded px-4 py-2 bg-black text-white">Export Editable Word</button><button onClick={()=>exportFile("pdf")} className="border rounded px-4 py-2">Export PDF</button></div><p>{status}</p></main>;
}
