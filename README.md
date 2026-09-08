# SIG GRIR Dashboard — Supabase edition

Based on v12 dashboard. UI and dashboard calculations are preserved; browser IndexedDB is replaced by central Supabase storage.

## Architecture
- `/` = public read-only dashboard
- `/admin` = Supabase Auth admin login + Excel upload
- `/api/admin/upload` = server-side Excel ingestion using service-role key
- Public users have SELECT-only access through RLS

## Vercel environment variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or publishable key)
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; never expose to browser)
- `ADMIN_EMAIL`

Create the admin account in Supabase Auth with the email in `ADMIN_EMAIL`.

## Important
Existing browser IndexedDB snapshots are not automatically migrated. Re-upload each required month once the central version is deployed.
