# Quick Start Guide

## 30 Seconds to Running MTG Hub

### Local Development

```bash
cd mtg-hub-react
npm install
npm run dev
```

Open http://localhost:5173 - Done! The app is running with full offline functionality.

---

## 5 Minutes to Supabase Cloud Features

### 1. Create Supabase Project
- Go to [supabase.com](https://supabase.com)
- Click "New Project"
- Create a project (takes ~30 seconds)

### 2. Get API Keys
- Project Settings > API > Copy:
  - Project URL (looks like: `https://xxxxxx.supabase.co`)
  - `anon public` key

### 3. Create `.env` File
```bash
cp .env.example .env
```

Edit `.env`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Set Up Database
Copy this entire block into Supabase SQL Editor and run:

```sql
-- Profiles
create table profiles (
  id uuid references auth.users primary key,
  username text unique not null,
  avatar_color text default '#c9a84c',
  collection_public boolean default false,
  created_at timestamptz default now()
);

-- Matches
create table matches (
  id bigserial primary key,
  user_id uuid references auth.users not null,
  date date,
  format text,
  my_deck text,
  my_colors text,
  opp_deck text,
  opp_type text,
  result text,
  notes text,
  created_at timestamptz default now()
);

-- Collection
create table collection (
  id bigserial primary key,
  user_id uuid references auth.users not null,
  name text not null,
  set_name text,
  qty integer default 1,
  condition text default 'NM',
  img text,
  colors text[],
  price numeric,
  note text,
  created_at timestamptz default now()
);

-- Trade wants
create table trade_wants (
  id bigserial primary key,
  user_id uuid references auth.users not null,
  card_name text not null,
  unique(user_id, card_name)
);

-- Friendships
create table friendships (
  id bigserial primary key,
  user_id uuid references auth.users not null,
  friend_id uuid references auth.users not null,
  status text default 'pending',
  created_at timestamptz default now(),
  unique(user_id, friend_id)
);

-- Enable RLS
alter table profiles enable row level security;
alter table matches enable row level security;
alter table collection enable row level security;
alter table trade_wants enable row level security;
alter table friendships enable row level security;

-- RLS Policies
create policy "profiles_select" on profiles for select using (true);
create policy "profiles_insert" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on profiles for update using (auth.uid() = id);
create policy "matches_all" on matches for all using (auth.uid() = user_id);
create policy "collection_own" on collection for all using (auth.uid() = user_id);
create policy "wants_own" on trade_wants for all using (auth.uid() = user_id);
create policy "friendships_all" on friendships for all using (auth.uid() = user_id or auth.uid() = friend_id);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, split_part(new.email, '@', 1) || '_' || floor(random()*9000+1000)::text);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
```

### 5. Restart Dev Server
```bash
npm run dev
```

Auth modal now appears! Sign up and test cloud features.

---

## 10 Minutes to Netlify Deployment

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Deploy MTG Hub"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/mtg-hub-react
git push -u origin main
```

### 2. Connect to Netlify
- Go to [netlify.com](https://netlify.com)
- Click "New site from Git"
- Select your GitHub repo
- Build command: `npm run build`
- Publish directory: `dist`
- Click Deploy

### 3. (Optional) Add Supabase Env Vars
- Netlify Site Settings > Build & Deploy > Environment
- Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Trigger redeploy

Done! Your app is live.

---

## What Works Without Supabase

✅ Dashboard and stats  
✅ Match logging  
✅ Collection management  
✅ Meta tracker  
✅ Card lookup  
✅ News feeds  

**No sign-in needed!** Everything works locally.

---

## What Requires Supabase

✅ Friends & Trades  
✅ Cloud sync across devices  
✅ Account sign-up/login  

---

## Troubleshooting

**Build fails:**
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

**News feeds not loading:**
- RSS proxies sometimes go down
- Try again in a few minutes
- Fallback data loads if proxies fail

**Supabase not working:**
- Check `.env` file has correct keys (no spaces)
- Verify SQL schema ran without errors
- Check Supabase authentication is enabled

**Collection not saving:**
- Without Supabase: Check browser allows localStorage
- With Supabase: Check user is signed in

---

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Build for production
npm run preview      # Preview production build locally
```

---

## Project Structure at a Glance

```
src/
  App.jsx           - Main app + routing
  main.jsx          - React entry
  styles.css        - All CSS (dark gold theme)
  lib/
    db.js           - Storage (localStorage or Supabase)
    supabase.js     - Supabase client
    utils.js        - Helpers, API calls
  data/
    meta.js         - Metagame data
    decklists.js    - Deck lists
  components/       - Sidebar, TopBar, etc.
  modals/          - Log Match, Add Card, etc.
  pages/           - Dashboard, Stats, Collection, Friends, etc.
```

---

## Need Help?

- Check `README.md` for detailed docs
- Check `IMPLEMENTATION_SUMMARY.md` for architecture details
- Review `src/lib/db.js` to understand offline/cloud sync
- Check browser console for errors

---

**Happy deck building!** ⚔️
