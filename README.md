# FacultyLens AI | MBA Lecture Intelligence

FacultyLens AI turns MBA lecture recordings into searchable transcripts, structured learning modules, practice questions, assignments, and evidence-based faculty teaching-pattern insights.

## Current MVP
- Email magic-link sign-in through Supabase Auth
- Upload audio directly to private Supabase Storage
- Transcription with Groq Whisper
- Structured lecture analysis and study materials with Groq
- Optional external source discovery through Tavily Search
- Saved lecture history in Supabase
- Faculty/course tags to support cumulative analysis over time
- Exam question suggestions labelled as estimates, never guarantees

## Stack
- Next.js App Router + TypeScript
- Supabase Auth, Postgres and private Storage
- Groq API for transcription and analysis (free tier, subject to limits)
- Optional Tavily API for web research
- Vercel deployment

## Setup (beginner-friendly)

### 1. Create a Supabase project
1. Create a project at https://supabase.com.
2. Open **SQL Editor**, create a new query, paste all of `supabase/schema.sql`, and run it.
3. In **Project Settings → API**, copy the Project URL, anon/publishable key, and service-role key.
4. Keep the service-role key private. Never put it in a `NEXT_PUBLIC_...` variable.
5. In **Authentication → URL Configuration**, add your local URL `http://localhost:3000` and your eventual Vercel URL to allowed redirect URLs.

### 2. Create API keys
- Groq API key (free developer tier): https://console.groq.com/keys
- Optional Tavily Search key: https://tavily.com

This setup is designed to use Groq's free developer tier and free hosting/database tiers where eligible. Free quotas and model availability can change. Do not enable paid plans if you want to maintain a ₹0 budget.

### 3. Configure Vercel
1. Import this GitHub repository into https://vercel.com.
2. Add these Environment Variables in Vercel Project Settings → Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GROQ_API_KEY`
   - `TAVILY_API_KEY` (optional)
3. Deploy or redeploy after saving the variables.

### 4. Run locally (optional)
Install Node.js LTS, clone the repository, run `npm install`, copy `.env.example` to `.env.local`, fill in the keys, and run `npm run dev`. Open http://localhost:3000.

## Important limits and safety
- The app only processes audio you are authorized to record and upload. Follow your institution's rules and applicable consent/privacy requirements.
- Audio remains in a private Storage bucket. Do not make the bucket public.
- The current MVP enforces a 24 MB per-recording limit to stay within the free transcription API file-size constraint. Split long lectures into shorter audio parts or compress them before upload. Automatic audio chunking is a planned enhancement.
- Transcription can mishear names, formulas, acronyms and fast speech. Review flagged/uncertain sections against the recording.
- Exam predictions are study-prioritization estimates based on available evidence, not promises or access to confidential exam papers.
- The initial MVP stores lecture analysis and history. Stronger cross-lecture faculty pattern scoring, editing/reprocessing, export to PDF/DOCX, and richer assessment analytics are planned next.

## Troubleshooting
- **Sign-in link does not work:** check Supabase Authentication URL Configuration and your email spam folder.
- **Upload fails:** check the private `lecture-audio` bucket and Storage policies created by the SQL script.
- **Analysis fails:** confirm `GROQ_API_KEY` is set correctly in Vercel and review Vercel function logs and Groq usage limits.
- **Research is missing:** add `TAVILY_API_KEY`; research is optional and the app should still process a lecture without it.

## Zero-cost configuration
Use Groq's free developer API key for both transcription and structured analysis. Keep Tavily optional, as it has its own usage quota. Vercel Hobby and Supabase Free are intended for personal/small projects, subject to their current usage limits. Do not enable billing or upgrade prompts if you want to maintain a ₹0 budget.

Deployment trigger check for Vercel.
