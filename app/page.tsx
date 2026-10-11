"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";

type Lecture = {
  id: string; course_name: string; faculty_name: string; lecture_date: string | null;
  audio_filename: string; status: string; transcript: string | null; analysis: any;
  error_message: string | null; created_at: string;
};

const supabase = createBrowserSupabase();

export default function Home() {

  const [course, setCourse] = useState("");
  const [faculty, setFaculty] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [selected, setSelected] = useState<Lecture | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  function setNotice(text: string, type = "") { setMessage(text); setMessageType(type); }

  async function uploadAndProcess(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !course.trim() || !faculty.trim()) return setNotice("Add a recording, course name, and faculty name.", "error");
    if (file.size > 24 * 1024 * 1024) return setNotice("This recording is over 24 MB. The current transcription API limit requires a smaller file. Compress it or split it into shorter parts, then upload each part as a separate lecture segment.", "error");
    setBusy(true); setNotice("Uploading audio securely…");
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = "public/" + crypto.randomUUID() + "-" + safeName;
      const { error: uploadError } = await supabase.storage.from("lecture-audio").upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
      if (uploadError) throw uploadError;
      setNotice("Audio uploaded. Transcribing and analysing the lecture…");
      const response = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioPath: path, filename: file.name, courseName: course.trim(), facultyName: faculty.trim(), lectureDate: date || null })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Processing failed.");
      setNotice("Lecture processed successfully. Your transcript and study module are ready.", "success");
      setFile(null);
      const picker = document.getElementById("audio-file") as HTMLInputElement | null; if (picker) picker.value = "";
      if (result.lecture) { setLectures(prev => [result.lecture, ...prev].slice(0, 20)); setSelected(result.lecture); }
    } catch (err: any) {
      setNotice(err?.message || "Something went wrong. Check your settings and try again.", "error");

    } finally { setBusy(false); }
  }


  const analysis = selected?.analysis || {};
  return <main className="shell">
    <header className="topbar">
      <div className="brand"><div className="brandmark">F</div><div><h1>FacultyLens AI</h1><p>MBA Lecture Intelligence</p></div></div>
      <div className="topnote">"Open student workspace · No account required"</div>
    </header>

    <section className="hero">
      <div><div className="eyebrow">Open academic learning workspace</div><h2>Turn every lecture into a learning advantage.</h2><p>Capture what was said, understand what it means, connect it to management theory, and practise applying it. Upload without creating an account. Your notes remain in this browser session.</p></div>
      <div className="hero-stat"><strong>{lectures.length.toString().padStart(2, "0")}</strong><span>recordings in your library<br/>Your processed lectures appear here during this session.</span></div>
    </section>

      <section className="section">
        <div className="section-head"><div><h3>Lecture workspace</h3><p>Upload one recording at a time. The system will transcribe and build a study pack.</p></div></div>
        <div className="grid">
          <div className="panel">
            <h4>Process a new lecture</h4><p className="muted">For best results, choose clear audio and enter the exact course and faculty names every time.</p>
            <form onSubmit={uploadAndProcess}>
              <div className="formgrid">
                <div className="field"><label>Course / subject *</label><input required value={course} onChange={e=>setCourse(e.target.value)} placeholder="e.g. Operations Management"/></div>
                <div className="field"><label>Faculty name *</label><input required value={faculty} onChange={e=>setFaculty(e.target.value)} placeholder="e.g. Professor Sharma"/></div>
                <div className="field full"><label>Lecture date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></div>
              </div>
              <div className="drop"><p style={{fontWeight:700,fontSize:13,marginTop:0}}>Choose your lecture recording</p><p className="muted">MP3, M4A, WAV, WebM or supported audio/video formats. For this MVP, each audio file must be 24 MB or smaller. Larger recordings should be split into parts first.</p><input id="audio-file" type="file" accept="audio/*,video/mp4,.m4a,.mp3,.wav,.webm" onChange={e=>setFile(e.target.files?.[0] || null)}/>{file && <p className="muted">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}</div>
              <div className="actions"><button className="btn" disabled={busy}>{busy ? "Working…" : "Upload and analyse lecture"}</button></div>
              {message && <div className={"notice " + messageType}>{message}</div>}
            </form>
            <div className="notice">No account is required. Do not upload confidential or sensitive recordings. Upload only where permitted and with appropriate consent. AI transcripts can contain errors. Your session library clears when you refresh or close the page.</div>
          </div>
          <div className="panel">
            <h4>This session’s lecture library</h4><p className="muted">Open a processed lecture during this browser session. Refreshing the page clears this temporary list.</p>
            <div className="list">{lectures.length ? lectures.map(l=><button key={l.id} className="lecture" style={{background:selected?.id===l.id?"#f4f8f4":"white",textAlign:"left",width:"100%"}} onClick={()=>setSelected(l)}>
              <div><h5>{l.course_name}</h5><p>{l.faculty_name} · {l.lecture_date || new Date(l.created_at).toLocaleDateString()}<br/>{l.audio_filename}</p></div><span className={"pill " + l.status}>{l.status}</span>
            </button>) : <div className="empty">No lectures processed in this session yet. Upload your first recording to begin.</div>}</div>
          </div>
        </div>
      </section>
      {selected && <section className="section panel results">
        <div className="section-head"><div><h3>{selected.course_name}</h3><p>{selected.faculty_name} · {selected.lecture_date || "Date not set"} · {selected.audio_filename}</p></div><button className="btn secondary" onClick={()=>setSelected(null)}>Close notes</button></div>
        {selected.status === "failed" && <div className="notice error">{selected.error_message || "This lecture failed to process. Check API configuration and try again."}</div>}
        {selected.status !== "completed" ? <div className="empty">This lecture is {selected.status}. Refresh the page after processing finishes.</div> : <>
          <div className="result-section"><h4>Executive summary</h4><p>{analysis.executive_summary || "No summary available."}</p></div>
          <div className="result-section"><h4>Core concepts and frameworks</h4>{(analysis.concepts || []).map((c:any,i:number)=><div key={i} style={{marginBottom:14}}><strong style={{fontSize:13}}>{i+1}. {c.name}</strong><p>{c.explanation}</p>{c.management_application && <p><b>Management application:</b> {c.management_application}</p>}{c.evidence && <p className="muted">Lecture evidence: {c.evidence}</p>}</div>)}</div>
          <div className="result-section"><h4>Examples and cases</h4><ul>{(analysis.examples || []).map((x:any,i:number)=><li key={i}><b>{x.example || x.name}:</b> {x.lesson || x.explanation}</li>)}</ul></div>
          <div className="result-section"><h4>Faculty emphasis signals</h4><p className="muted">Signals from this recording only. Stronger patterns require multiple lectures.</p><ul>{(analysis.faculty_signals || []).map((x:any,i:number)=><li key={i}><b>{x.signal}:</b> {x.evidence} <span className="tag">{x.strength || "observed"}</span></li>)}</ul></div>
          <div className="result-section"><h4>Likely exam practice questions</h4><p className="muted">Practice priorities inferred from lecture evidence, not guaranteed exam questions.</p>{(analysis.exam_questions || []).map((q:any,i:number)=><div key={i} style={{marginBottom:14}}><b style={{fontSize:13}}>{i+1}. {q.question}</b><p className="muted">Format: {q.format} · Priority: {q.priority} · Confidence: {q.confidence}</p><p>{q.answer_outline}</p></div>)}</div>
          <div className="result-section"><h4>MCQ practice</h4>{(analysis.mcqs || []).map((q:any,i:number)=><div key={i} style={{marginBottom:14}}><b style={{fontSize:13}}>{i+1}. {q.question}</b><ul>{(q.options || []).map((o:string,j:number)=><li key={j}>{String.fromCharCode(65+j)}. {o}</li>)}</ul><p><b>Answer:</b> {q.answer} . {q.explanation}</p></div>)}</div>
          <div className="result-section"><h4>Assignment / application task</h4><p>{analysis.assignment?.prompt || "No assignment generated."}</p>{analysis.assignment?.deliverables && <p><b>Deliverables:</b> {analysis.assignment.deliverables}</p>}</div>
          <div className="result-section"><h4>Research sources</h4>{(analysis.sources || []).length ? <ul>{analysis.sources.map((s:any,i:number)=><li key={i}><a href={s.url} target="_blank" rel="noreferrer">{s.title || s.url}</a> {s.summary ? "· " + s.summary : ""}</li>)}</ul> : <p className="muted">No external research sources were retrieved. Configure TAVILY_API_KEY to enable web research.</p>}</div>
          <div className="result-section"><h4>Full transcript</h4><details><summary style={{cursor:"pointer",fontSize:13,fontWeight:700}}>Show transcript</summary><pre style={{whiteSpace:"pre-wrap",fontFamily:"inherit",fontSize:12,lineHeight:1.8,color:"#34433c"}}>{selected.transcript}</pre></details></div>
        </>}
      </section>
    <footer className="footer">FacultyLens AI · Built for learning, not certainty. Always verify important concepts, formulas, citations, and exam priorities against your course materials.</footer>
  </main>;
}
