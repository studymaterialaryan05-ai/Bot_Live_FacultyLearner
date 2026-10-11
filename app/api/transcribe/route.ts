import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const groqKey = process.env.GROQ_API_KEY!;

function adminClient() {
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  if (!url || !serviceKey || !groqKey || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return fail("Server setup is incomplete. Check Supabase and Groq environment variables.", 500);
  const bearer = req.headers.get("authorization") || "";
  const token = bearer.startsWith("Bearer ") ? bearer.slice(7) : "";
  if (!token) return fail("Please sign in before transcribing.", 401);
  const auth = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await auth.auth.getUser(token);
  const allowedEmail = (process.env.ALLOWED_USER_EMAIL || "").trim().toLowerCase();
  if (error || !data.user || !allowedEmail || data.user.email?.toLowerCase() !== allowedEmail) return fail("This account is not authorised to use this private workspace.", 403);

  let body: any;
  try { body = await req.json(); } catch { return fail("Invalid request body."); }
  const path = String(body?.audioPath || "");
  if (!path || !path.startsWith(data.user.id + "/") || path.includes("..") || path.split("/").length !== 3) return fail("Invalid private audio path.", 403);

  const admin = adminClient();
  const { data: blob, error: downloadError } = await admin.storage.from("lecture-audio").download(path);
  if (downloadError || !blob) return fail("Could not retrieve this temporary audio chunk.", 404);
  if (blob.size > 20 * 1024 * 1024) return fail("Chunk exceeds the 20 MB application limit.", 413);

  const form = new FormData();
  const audio = new File([blob], "lecture-chunk.mp3", { type: "audio/mpeg" });
  form.append("file", audio);
  form.append("model", "whisper-large-v3");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.append("prompt", "Transcribe an MBA management lecture in an Indian classroom. Preserve business, operations, economics, finance, marketing, strategy, rural management, supply chain, quantitative methods, acronyms, company names, formulas and examples. Do not summarize or silently fill unclear speech.");

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: "Bearer " + groqKey }, body: form,
    signal: AbortSignal.timeout(55000)
  });
  if (!response.ok) {
    const detail = await response.text();
    return fail("Groq transcription error (" + response.status + "): " + detail.slice(0, 450), response.status === 429 ? 429 : 502);
  }
  const result: any = await response.json();
  if (!String(result.text || "").trim()) return fail("Groq returned an empty transcript.", 502);
  return NextResponse.json({ text: String(result.text).trim(), segments: result.segments || [] });
}
