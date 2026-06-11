# mtg-hub-react (Mana Mint)

React + Vite web app, packaged as an iOS/Android app via Capacitor, backed by Supabase.

## Build & Deploy

- **Web (Netlify)**: push to `origin/main` → Netlify auto-builds (`npm run build`, publishes `dist/`) and deploys. No manual Netlify step needed — just push.
- **Mobile (Capacitor)**: `npm run build:mobile` runs `npm run build` + `cap sync`, copying the web bundle into `ios/App/App/public` and the Android assets dir.
  - This is REQUIRED before any iOS/Android testing or TestFlight build. Capacitor bundles the web JS into the native binary at build time — it does NOT load live from Netlify. A web-only fix pushed to `main` will NOT appear in the installed iOS app until a new build is synced and shipped.
  - `ios/` and `android/` are gitignored except a handful of tracked project files (`project.pbxproj`, etc.) — only source changes under `src/` typically need committing.
  - To ship a new TestFlight build: bump `CURRENT_PROJECT_VERSION` in `ios/App/App.xcodeproj/project.pbxproj` (both the Debug and Release build configs — two occurrences), run `npm run build:mobile`, commit the pbxproj bump. The user then archives + uploads via Xcode (`npm run open:ios`, i.e. `cap open ios`) — this last step needs the user's signing certs/Apple auth and can't be done from the CLI here.

## Supabase

- DB columns are **snake_case**; JS objects in this app use **camelCase**. Map explicitly between the two — do not assume `insert({...jsObject})` works directly. PostgREST returns `PGRST204 "Could not find column"` for any key that doesn't match a real column (silently breaking the insert).
- See `collectionRowToCard`/`addCard` (cards) and `matchRowToObj`/`matchToRow` (matches) in `src/lib/db.js` for the established row<->object mapping pattern. Follow this pattern for any new Supabase tables.
- No SQL migration files exist in this repo. Schema changes (new columns, etc.) must be applied manually — give the user a `SELECT`/`ALTER TABLE` statement to run in the Supabase SQL editor.
- `matches` table columns: `id, user_id, format, my_deck, opponent_deck, my_deck_type, opponent_deck_type, played_date, result, notes, created_at`.
- `"date"` is a reserved-ish identifier that causes PostgREST issues in `order=` params — avoid using it as a column name (the matches table uses `played_date`).
- To probe schema/columns without DB credentials, POST a minimal insert to `https://<project>.supabase.co/rest/v1/<table>` with the anon key — `PGRST204` means the column doesn't exist, `42501` (RLS violation) means the column exists but the row was rejected by RLS (expected when using a fake user_id).
