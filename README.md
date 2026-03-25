# MTG Hub - React + Vite Web Application

A complete Magic: The Gathering personal hub application built with React, Vite, and Supabase. Track matches, manage your collection, monitor the metagame, and connect with friends.

## Features

### Core Functionality (Offline-First with Supabase Sync)
- **Dashboard**: Win rate stats, match history, matchup summary
- **Match Log**: Log competitive and casual matches with detailed tracking
- **Statistics**: Win rates by deck, format, and opponent archetype
- **Meta Tracker**: Standard, Modern, Legacy, and Brawl metagame data with tier lists
- **Card Lookup**: Search Scryfall for card details, prices, and all printings
- **MTG News**: Official Wizards, MTGGoldfish, and EDHREC news feeds
- **My Collection**: Build and manage your card collection with autocomplete search
- **Friends & Trades** (NEW): Friend connections, collection sharing, and trade matching

### Technical Highlights
- ✅ **Works offline**: All data stored in localStorage by default
- ✅ **Supabase integration**: When configured, syncs data to cloud database
- ✅ **Auth system**: Login/signup modal (only shown when Supabase is configured)
- ✅ **Fully responsive**: Desktop, tablet, and mobile-optimized
- ✅ **No external CSS libraries**: Pure CSS with MTG gold dark theme
- ✅ **Deployable to Netlify**: Zero configuration needed after adding .env

## Project Structure

```
mtg-hub-react/
├── src/
│   ├── main.jsx                 # React entry point
│   ├── App.jsx                  # Main app component with routing
│   ├── styles.css               # All CSS (27KB, MTG gold theme)
│   ├── lib/
│   │   ├── supabase.js          # Supabase client (null if no env vars)
│   │   ├── db.js                # Smart storage layer (Supabase or localStorage)
│   │   └── utils.js             # Helper functions, Scryfall API, news fetching
│   ├── data/
│   │   ├── meta.js              # Metagame data (Standard, Modern, Legacy, Brawl)
│   │   └── decklists.js         # Full decklist database
│   ├── components/
│   │   ├── Sidebar.jsx
│   │   ├── TopBar.jsx
│   │   ├── MobileNav.jsx
│   │   ├── Toast.jsx
│   │   └── auth/AuthModal.jsx   # Login/signup (Supabase only)
│   ├── modals/
│   │   ├── LogMatchModal.jsx
│   │   ├── AddCardModal.jsx
│   │   ├── DecklistModal.jsx
│   │   └── CameraModal.jsx
│   └── pages/
│       ├── Dashboard.jsx
│       ├── MatchLog.jsx
│       ├── Stats.jsx
│       ├── News.jsx
│       ├── CardLookup.jsx
│       ├── Collection.jsx
│       ├── MetaTracker.jsx
│       └── Friends.jsx          # NEW social features
├── index.html
├── package.json
├── vite.config.js
├── netlify.toml
└── .env.example
```

## Getting Started

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start dev server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173)

3. **Build for production:**
   ```bash
   npm run build
   npm run preview
   ```

### Optional: Enable Supabase Cloud Features

1. **Set up a Supabase project:**
   - Go to [supabase.com](https://supabase.com) and create a new project
   - In Project Settings > API, copy your Project URL and anon key

2. **Create `.env` file** (from `.env.example`):
   ```env
   VITE_SUPABASE_URL=your-project-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

3. **Run the Supabase setup script** (in Supabase SQL Editor):
   See the SQL schema below to create tables and enable RLS.

4. **When Supabase is configured:**
   - Auth modal appears on the app
   - Users can sign in/sign up
   - Data syncs to cloud database
   - Friends & Trades features become available

## Supabase Database Schema

Run this in your Supabase SQL Editor to set up the database:

```sql
-- Profiles table (extends Supabase auth.users)
create table profiles (
  id uuid references auth.users primary key,
  username text unique not null,
  avatar_color text default '#c9a84c',
  collection_public boolean default false,
  created_at timestamptz default now()
);

-- Matches table
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

-- Collection table
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

-- Trade wants table
create table trade_wants (
  id bigserial primary key,
  user_id uuid references auth.users not null,
  card_name text not null,
  unique(user_id, card_name)
);

-- Friendships table
create table friendships (
  id bigserial primary key,
  user_id uuid references auth.users not null,
  friend_id uuid references auth.users not null,
  status text default 'pending',
  created_at timestamptz default now(),
  unique(user_id, friend_id)
);

-- Enable Row Level Security
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

## Deployment to Netlify

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/mtg-hub-react
   git push -u origin main
   ```

2. **Connect to Netlify:**
   - Go to [netlify.com](https://netlify.com)
   - Click "New site from Git"
   - Choose your GitHub repo
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Deploy!

3. **Add environment variables:**
   - In Netlify dashboard: Site settings > Build & deploy > Environment
   - Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
   - Redeploy

## API Integrations

- **Scryfall API**: Card search, details, prices, printings
- **MTG Goldfish**: Meta data (metagame breakdowns, tier lists)
- **EDHREC**: Commander meta, trending commanders
- **RSS News**: Multiple proxy chains for Wizards, MTGGoldfish, EDHREC

## Data Storage

### Without Supabase (Offline Mode)
- All data stored in browser localStorage
- Data persists between sessions
- Export/import JSON backups supported
- No cloud sync

### With Supabase (Cloud Mode)
- Data syncs to cloud database
- Access from multiple devices
- Share collections with friends
- Real-time friend system
- Enable Friend requests, trade matching, collection sharing

## Features In Detail

### Match Logging
- Track format, date, both decks, colors, result
- Add notes for each match
- Filter by format
- Calculate win rates automatically

### Collection Management
- Search by card name (local autocomplete)
- Filter by color
- Track quantity and condition
- Integrated Scryfall card images
- CSV export
- JSON backup/restore

### Meta Tracker
- Current Standard/Modern/Legacy/Brawl metagame
- Tier list (S/A/B/C)
- Key cards for each archetype
- Direct links to MTGGoldfish and EDHREC

### Friends & Trades (NEW)
- Search and add friends by username
- View friend collections
- Exchange trade wants
- Trade matcher algorithm (coming soon)

## Styling

- **Dark theme** with MTG gold accents (#c9a84c)
- **CSS variables** for easy theme customization
- **Responsive grid layouts** (grid-2, grid-3, grid-4)
- **Accessible form elements** with focus states
- **Mobile-optimized** with fixed bottom navigation

## Browser Support

- Chrome, Firefox, Safari, Edge (all modern versions)
- Mobile browsers (iOS Safari, Chrome Android)
- Requires JavaScript enabled

## License

MIT

## Contributing

This is a personal project. Feel free to fork and customize!

---

**Built with:** React 18, Vite 5, Supabase, Scryfall API

**Deployed:** [mtg-hub.netlify.app](https://mtg-hub.netlify.app)
