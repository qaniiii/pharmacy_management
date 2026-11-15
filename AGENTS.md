# Project Architecture & Rules
- **Monorepo Structure:** `/frontend` for Next.js 16 (App Router, TypeScript, Tailwind CSS, Shadcn UI) and `/backend` for Python FastAPI.
- **Database & Auth:** Supabase (PostgreSQL). Never bypass Row Level Security (RLS) on the client side.
- **User Roles:** Strictly isolate `system_admin`, `welfare_admin`, and `pharmacy_admin`.
- **Coding Standards:** Use strict TypeScript interfaces for all frontend payloads and Pydantic v2 models for all FastAPI endpoints.
- **Workflow:** Build iteratively. Never generate placeholder mock data when real Supabase tables exist.
