// See run-compute-commander-decks-background.js for why this twin exists:
// Netlify blocks direct HTTP invocation of any scheduled function at the
// edge (bare 403), so the admin UI's manual trigger hits this unscheduled
// re-export instead. The cron entry in netlify.toml still points at
// harvest-deals-background.js.
exports.handler = require('./harvest-deals-background').handler
