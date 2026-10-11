"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";

type Lecture = {
  id: string; course_name: string; faculty_name: string; lecture_date: string | null;
  audio_filename: string; status: string; transcript: string | null; analysis: any;
  error_message: string | null; created_at: string;
};

const supabase = createBrowserSupabase();

export default function Home() {

  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [failedJob, setFailedJob] = useState<any>(null);
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
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session?.user?.id) return;
    supabase.from("lectures").select("*").order("created_at", { ascending: false }).limit(20).then(({ data, error }) => {
      if (!error && data) setLectures(data as Lecture[]);
    });
  }, [session?.user?.id]);
  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault(); setAuthBusy(true); setNotice("");
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } });
    setAuthBusy(false); setNotice(error ? error.message : "Check your inbox for your private sign-in link.", error ? "error" : "success");
  }
  async function resumeJob(job: any) {
    setBusy(true); setFailedJob(null);
    let transcriptParts: string[] = [...job.transcripts];
    try {
      const token = session?.access_token;
      if (!token) throw new Error("Your sign-in session expired. Sign in again.");
      for (let i = job.nextIndex; i < job.chunks.length; i++) {
        const chunk = job.chunks[i];
        const path = job.userId + "/" + job.jobId + "/chunk-" + String(i + 1).padStart(3, "0") + ".mp3";
        setProgressLabel("Uploading chunk " + (i + 1) + " of " + job.chunks.length);
        const { error: uploadError } = await supabase.storage.from("lecture-audio").upload(path, chunk, { contentType: "audio/mpeg", upsert: true });
        if (uploadError) throw new Error(uploadError.message);
        let response: Response | null = null; let lastError = "";
        for (let attempt = 1; attempt <= 3; attempt++) {
          setProgressLabel("Transcribing chunk " + (i + 1) + " of " + job.chunks.length + " · attempt " + attempt + "/3");
          response = await fetch("/api/transcribe", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ audioPath: path }) });
          if (response.ok) break;
          const detail = await response.json().catch(() => ({})); lastError = detail.error || "Transcription failed.";
          if (response.status !== 429 && response.status < 500) break;
          await new Promise(resolve => setTimeout(resolve, attempt * 2500));
        }
        if (!response?.ok) throw new Error(lastError || "Chunk " + (i + 1) + " failed.");
        const data = await response.json(); transcriptParts[i] = String(data.text || "").trim();
        const { error: cleanupError } = await supabase.storage.from("lecture-audio").remove([path]);
        if (cleanupError) console.warn("Temporary chunk cleanup failed:", cleanupError.message);
        setProgress(Math.round(((i + 1) / job.chunks.length) * 90));
        setFailedJob({ ...job, transcripts: transcriptParts, nextIndex: i + 1 });
      }
      const merged = transcriptParts.filter(Boolean).join("\n\n");
      if (!merged) throw new Error("No transcript text was returned.");
      setProgressLabel("Building the study module…");
      const response = await fetch("/api/process", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ filename: job.filename, courseName: job.courseName, facultyName: job.facultyName, lectureDate: job.lectureDate, transcript: merged }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Lecture analysis failed.");
      setNotice("Lecture processed successfully. Temporary audio chunks have been removed.", "success");
      setProgress(100); setProgressLabel("Completed"); setFile(null); setFailedJob(null);
      const picker = document.getElementById("audio-file") as HTMLInputElement | null; if (picker) picker.value = "";
      if (result.lecture) { setLectures(prev => [result.lecture, ...prev].slice(0,20)); setSelected(result.lecture); }
    } catch (err: any) {
      setNotice(err?.message || "Processing failed. Retry the failed chunk.", "error");
      setFailedJob({ ...job, transcripts: transcriptParts, nextIndex: (() => { const missing = transcriptParts.findIndex((x,i)=>!x && i>=job.nextIndex); return missing < 0 ? job.chunks.length : missing; })() });
    } finally { setBusy(false); }
  }

  async function uploadAndProcess(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !course.trim() || !faculty.trim()) return setNotice("Add a recording, course name, and faculty name.", "error");
    if (!session?.user?.id) return setNotice("Sign in before uploading.", "error");
    setBusy(true); setProgress(0); setProgressLabel("Preparing browser audio splitter…"); setNotice("Preparing your recording…");
    try {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { fetchFile, toBlobURL } = await import("@ffmpeg/util");
      const ffmpeg = new FFmpeg();
      ffmpeg.on("progress", ({ progress: ratio }) => { setProgress(Math.max(0, Math.min(25, Math.round(ratio * 25)))); });
      const base = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
      await ffmpeg.load({ coreURL: await toBlobURL(base + "/ffmpeg-core.js","text/javascript"), wasmURL: await toBlobURL(base + "/ffmpeg-core.wasm","application/wasm") });
      setProgressLabel("Splitting and compressing audio in your browser…");
      await ffmpeg.writeFile("source-audio", await fetchFile(file));
      const code = await ffmpeg.exec(["-i","source-audio","-vn","-map","0:a:0","-f","segment","-segment_time","600","-reset_timestamps","1","-c:a","libmp3lame","-b:a","64k","-ac","1","-ar","16000","part-%03d.mp3"]);
      if (code !== 0) throw new Error("The browser audio splitter could not process this file. Try MP3, M4A or WAV.");
      const entries = await ffmpeg.listDir("/");
      const names = entries.filter((x:any)=>x.name.startsWith("part-")&&x.name.endsWith(".mp3")).map((x:any)=>x.name).sort();
      if (!names.length) throw new Error("No audio chunks were created. Check that the file contains an audio track.");
      const chunks: Blob[] = [];
      for (const name of names) {
        const data = await ffmpeg.readFile(name); const bytes = data as Uint8Array; const safeBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer; const chunk = new Blob([safeBuffer],{type:"audio/mpeg"});
        if (chunk.size >= 20*1024*1024) throw new Error("A generated chunk reached 20 MB. Please try a lower-bitrate source.");
        chunks.push(chunk);
      }
      await ffmpeg.deleteFile("source-audio").catch(()=>{}); for (const name of names) await ffmpeg.deleteFile(name).catch(()=>{}); ffmpeg.terminate();
      const job = { chunks, transcripts:Array(chunks.length).fill(""), nextIndex:0, userId:session.user.id, jobId:crypto.randomUUID(), filename:file.name, courseName:course.trim(), facultyName:faculty.trim(), lectureDate:date||null };
      setNotice("Created "+chunks.length+" chunks. Starting sequential transcription…"); await resumeJob(job);
    } catch(err:any) { setNotice(err?.message||"Could not split this recording.", "error"); setBusy(false); }
  }

  const analysis = selected?.analysis || {};
  if (!session) return <main className="shell"><header className="topbar"><div className="brand"><div className="brandmark">F</div><div><h1>FacultyLens AI</h1><p>Private MBA Lecture Intelligence</p></div></div></header><section className="panel" style={{maxWidth:480,margin:"10vh auto"}}><h3>Private workspace sign-in</h3><p className="muted">Only the authorised owner can access this workspace. There is no public registration.</p><form onSubmit={sendMagicLink}><div className="field"><label>Your authorised email address</label><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></div><div className="actions"><button className="btn" disabled={authBusy}>{authBusy?"Sending…":"Send private sign-in link"}</button></div>{message&&<div className={"notice "+messageType}>{message}</div>}</form></section></main>;
  return <main className="shell">
    <header className="topbar">
      <div className="brand"><div className="brandmark">F</div><div><h1>FacultyLens AI</h1><p>MBA Lecture Intelligence</p></div></div>
      <div className="topnote">{session?.user?.email || "Private owner workspace"} · <button onClick={() => supabase.auth.signOut()}>Sign out</button></div>
    </header>

    <section className="hero">
      <div><div className="eyebrow">Open academic learning workspace</div><h2>Turn every lecture into a learning advantage.</h2><p>Capture what was said, understand what it means, connect it to management theory, and practise applying it. Sign in to your private owner workspace to save transcripts and study modules.</p></div>
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
              <div className="drop"><p style={{fontWeight:700,fontSize:13,marginTop:0}}>Choose your lecture recording</p><p className="muted">MP3, M4A, WAV, WebM or supported audio/video formats. Large recordings are split in your browser into compressed chunks under 20 MB and transcribed sequentially.</p><input id="audio-file" type="file" accept="audio/*,video/mp4,.m4a,.mp3,.wav,.webm" onChange={e=>setFile(e.target.files?.[0] || null)}/>{file && <p className="muted">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}</div>
              <div className="actions"><button className="btn" disabled={busy}>{busy ? "Working…" : "Upload and analyse lecture"}</button></div>
              {message && <div className={"notice " + messageType}>{message}</div>}{busy && <div className="notice"><b>{progressLabel}</b><div style={{height:8,background:"#e4ebe5",borderRadius:8,marginTop:8,overflow:"hidden"}}><div style={{height:8,width:progress+"%",background:"#1f6a50"}}/></div><p>{progress}% complete</p></div>}{failedJob && !busy && <button type="button" className="btn" onClick={()=>resumeJob(failedJob)}>Retry failed chunk / continue</button>}
            </form>
            <div className="notice">Private single-user workspace. Temporary audio chunks are deleted after successful transcription. Transcripts and study modules are saved. Upload only recordings you are permitted to use.</div>
          </div>
          <div className="panel">
            <h4>This session’s lecture library</h4><p className="muted">Your latest saved lectures are loaded from your private account.</p>
            <div className="list">{lectures.length ? lectures.map(l=><button key={l.id} className="lecture" style={{background:selected?.id===l.id?"#f4f8f4":"white",textAlign:"left",width:"100%"}} onClick={()=>setSelected(l)}>
              <div><h5>{l.course_name}</h5><p>{l.faculty_name} · {l.lecture_date || new Date(l.created_at).toLocaleDateString()}<br/>{l.audio_filename}</p></div><span className={"pill " + l.status}>{l.status}</span>
            </button>) : <div className="empty">No lectures processed in this session yet. Upload your first recording to begin.</div>}</div>
          </div>
        </div>
      </section>
      {selected && <section className="section panel results">
        <div className="section-head"><div><h3>{selected.course_name}</h3><p>{selected.faculty_name} · {selected.lecture_date || "Date not set"} · {selected.audio_filename}</p></div><button className="btn secondary" onClick={()=>setSelected(null)}>Close notes</button></div>
        {selected.status === "failed" && <div className="notice error">{selected.error_message || "This lecture failed to process. Check API configuration and try again."}</div>}
        {selected.status !== "completed" ? <><div className="empty">This lecture is {selected.status}. {selected.error_message || "Processing is not complete."}</div>{selected.transcript && <div className="result-section"><h4>Saved transcript</h4><pre style={{whiteSpace:"pre-wrap",fontFamily:"inherit",fontSize:12,lineHeight:1.8}}>{selected.transcript}</pre></div>}</> : <>
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
      </section>}
    <footer className="footer">FacultyLens AI · Built for learning, not certainty. Always verify important concepts, formulas, citations, and exam priorities against your course materials.</footer>
  </main>;
}
