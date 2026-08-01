// Netlify blocks direct HTTP invocation of any function that has a `schedule`
// entry in netlify.toml — the edge returns a bare 403 before our code even
// runs, regardless of our own auth. This unscheduled twin re-exports the
// exact same handler so the admin UI can still trigger it manually; the cron
// entry in netlify.toml continues to point at compute-commander-decks-background.js.
exports.handler = require('./compute-commander-decks-background').handler
