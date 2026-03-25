export const META_DATA = {
  standard: {
    label: 'Standard', updated: 'Early 2025',
    link: 'https://www.mtggoldfish.com/metagame/standard',
    tiers: [
      {
        tier: 'S', label: 'Tier S — Best in Format',
        decks: [
          { name: 'Dimir Midrange', colors: '🔵⚫', arch: 'Midrange', pct: '~18%', keys: 'Psychic Frog, Deep-Cavern Bat, Enduring Curiosity', link: 'https://www.mtggoldfish.com/archetype/standard-dimir-midrange' },
          { name: 'Mono Red Aggro', colors: '🔴', arch: 'Aggro', pct: '~15%', keys: 'Slickshot Show-Off, Heartfire Hero, Torch the Tower', link: 'https://www.mtggoldfish.com/archetype/standard-mono-red-aggro' },
          { name: 'Boros Convoke', colors: '⚪🔴', arch: 'Aggro', pct: '~13%', keys: 'Gleeful Demolition, Imodane\'s Recruiter, Knight-Errant of Eos', link: 'https://www.mtggoldfish.com/archetype/standard-boros-convoke' },
        ]
      },
      {
        tier: 'A', label: 'Tier A — Strong Contenders',
        decks: [
          { name: 'Domain Ramp', colors: '⚪🔵⚫🔴🟢', arch: 'Ramp', pct: '~10%', keys: 'Atraxa, Sunfall, Up the Beanstalk, Sunfall', link: 'https://www.mtggoldfish.com/archetype/standard-domain-ramp' },
          { name: 'Azorius Soldiers', colors: '⚪🔵', arch: 'Aggro', pct: '~9%', keys: 'Valiant Veteran, Harbin, Vanguard Aviator, Cavalry Pegasus', link: 'https://www.mtggoldfish.com/archetype/standard-azorius-soldiers' },
          { name: 'Esper Midrange', colors: '⚪🔵⚫', arch: 'Midrange', pct: '~8%', keys: 'Raffine, Sheoldred, Wandering Emperor, Sunfall', link: 'https://www.mtggoldfish.com/archetype/standard-esper-midrange' },
        ]
      },
      {
        tier: 'B', label: 'Tier B — Viable Picks',
        decks: [
          { name: 'Gruul Prowess', colors: '🔴🟢', arch: 'Aggro', pct: '~6%', keys: 'Monastery Swiftspear, Questing Druid, Urabrask\'s Forge', link: 'https://www.mtggoldfish.com/metagame/standard' },
          { name: 'Azorius Control', colors: '⚪🔵', arch: 'Control', pct: '~5%', keys: 'Farewell, Sunfall, Teferi, Wandering Emperor', link: 'https://www.mtggoldfish.com/metagame/standard' },
          { name: 'Golgari Midrange', colors: '⚫🟢', arch: 'Midrange', pct: '~5%', keys: 'Glissa, Go for the Throat, Tear Asunder, Polukranos', link: 'https://www.mtggoldfish.com/metagame/standard' },
        ]
      },
      {
        tier: 'C', label: 'Tier C — Rogue / Brewing',
        decks: [
          { name: 'Mono White Soldiers', colors: '⚪', arch: 'Aggro', pct: '~3%', keys: 'Valiant Veteran, Recruitment Officer, Stalwart Valkyrie', link: 'https://www.mtggoldfish.com/metagame/standard' },
          { name: 'Green Stompy', colors: '🟢', arch: 'Aggro', pct: '~2%', keys: 'Rhonas, Blossoming Defense, Bristly Bill', link: 'https://www.mtggoldfish.com/metagame/standard' },
        ]
      }
    ]
  },
  modern: {
    label: 'Modern', updated: 'Early 2025',
    link: 'https://www.mtggoldfish.com/metagame/modern',
    tiers: [
      {
        tier: 'S', label: 'Tier S — Best in Format',
        decks: [
          { name: 'Boros Energy', colors: '⚪🔴', arch: 'Aggro/Midrange', pct: '~16%', keys: 'Ajani, Ral, Guide of Souls, Amped Raptor, Galvanic Discharge', link: 'https://www.mtggoldfish.com/archetype/modern-boros-energy' },
          { name: 'Living End', colors: '🔵⚫🔴🟢', arch: 'Combo', pct: '~10%', keys: 'Grief, Living End, Street Wraith, Shardless Agent', link: 'https://www.mtggoldfish.com/archetype/modern-living-end' },
          { name: 'Amulet Titan', colors: '🟢', arch: 'Combo/Ramp', pct: '~9%', keys: 'Amulet of Vigor, Primeval Titan, Bounce Lands, Saga', link: 'https://www.mtggoldfish.com/archetype/modern-amulet-titan' },
        ]
      },
      {
        tier: 'A', label: 'Tier A — Strong Contenders',
        decks: [
          { name: 'Yawgmoth Combo', colors: '⚫🟢', arch: 'Combo', pct: '~8%', keys: 'Yawgmoth, Undying Creatures, Blood Artist, Chord of Calling', link: 'https://www.mtggoldfish.com/archetype/modern-yawgmoth' },
          { name: 'Hammer Time', colors: '⚪', arch: 'Aggro/Combo', pct: '~7%', keys: 'Colossus Hammer, Sigarda\'s Aid, Puresteel Paladin, Ornithopter', link: 'https://www.mtggoldfish.com/archetype/modern-hammer-time' },
          { name: 'Murktide Regent', colors: '🔵🔴', arch: 'Tempo', pct: '~7%', keys: 'Murktide Regent, Dragon\'s Rage Channeler, Mishra\'s Bauble', link: 'https://www.mtggoldfish.com/archetype/modern-izzet-murktide' },
          { name: 'Mono Black Necro', colors: '⚫', arch: 'Combo', pct: '~6%', keys: 'Necropotence, Peer into the Abyss, Dark Ritual, Sheoldred', link: 'https://www.mtggoldfish.com/metagame/modern' },
        ]
      },
      {
        tier: 'B', label: 'Tier B — Viable Picks',
        decks: [
          { name: 'Eldrazi Tron', colors: 'Colorless', arch: 'Ramp', pct: '~5%', keys: 'Urza Lands, Thought-Knot Seer, Reality Smasher, Karn', link: 'https://www.mtggoldfish.com/archetype/modern-eldrazi-tron' },
          { name: 'Burn', colors: '🔴', arch: 'Aggro', pct: '~5%', keys: 'Goblin Guide, Monastery Swiftspear, Lightning Bolt, Rift Bolt', link: 'https://www.mtggoldfish.com/archetype/modern-burn' },
          { name: 'Grixis Death\'s Shadow', colors: '🔵⚫🔴', arch: 'Tempo', pct: '~4%', keys: 'Death\'s Shadow, Scourge of the Skyclaves, Expressive Iteration', link: 'https://www.mtggoldfish.com/archetype/modern-grixis-death-shadow' },
        ]
      },
      {
        tier: 'C', label: 'Tier C — Rogue / Brewing',
        decks: [
          { name: 'Dredge', colors: '⚫🔴🟢', arch: 'Combo/Graveyard', pct: '~2%', keys: 'Creeping Chill, Narcomoeba, Prized Amalgam, Faithless Looting', link: 'https://www.mtggoldfish.com/metagame/modern' },
          { name: 'Enchantress', colors: '⚪🟢', arch: 'Combo', pct: '~2%', keys: 'Sythis, Sanctum Weaver, Sterling Grove, Solitary Confinement', link: 'https://www.mtggoldfish.com/metagame/modern' },
        ]
      }
    ]
  },
  legacy: {
    label: 'Legacy', updated: 'Early 2025',
    link: 'https://www.mtggoldfish.com/metagame/legacy',
    tiers: [
      {
        tier: 'S', label: 'Tier S — Best in Format',
        decks: [
          { name: 'Reanimator', colors: '⚫', arch: 'Combo', pct: '~14%', keys: 'Entomb, Reanimate, Griselbrand, Grief, Chancellor of Annex', link: 'https://www.mtggoldfish.com/archetype/legacy-reanimator' },
          { name: 'Doomsday', colors: '🔵⚫', arch: 'Combo', pct: '~11%', keys: 'Doomsday, Thassa\'s Oracle, Force of Will, Dark Ritual', link: 'https://www.mtggoldfish.com/archetype/legacy-doomsday' },
          { name: 'UR Delver', colors: '🔵🔴', arch: 'Tempo', pct: '~10%', keys: 'Delver of Secrets, Dragon\'s Rage Channeler, Murktide, Daze', link: 'https://www.mtggoldfish.com/archetype/legacy-ur-delver' },
        ]
      },
      {
        tier: 'A', label: 'Tier A — Strong Contenders',
        decks: [
          { name: 'Death & Taxes', colors: '⚪', arch: 'Hatebears', pct: '~9%', keys: 'Thalia, Rishadan Port, Wasteland, Skyclave Apparition', link: 'https://www.mtggoldfish.com/archetype/legacy-death-and-taxes' },
          { name: 'Mono Red Prison', colors: '🔴', arch: 'Stax/Prison', pct: '~8%', keys: 'Blood Moon, Chalice, Goblin Rabblemaster, Chrome Mox', link: 'https://www.mtggoldfish.com/archetype/legacy-red-prison' },
          { name: 'Lands', colors: '🔴🟢', arch: 'Control', pct: '~7%', keys: 'Dark Depths, Thespian\'s Stage, Wasteland, Exploration', link: 'https://www.mtggoldfish.com/archetype/legacy-lands' },
        ]
      },
      {
        tier: 'B', label: 'Tier B — Viable Picks',
        decks: [
          { name: 'ANT Storm', colors: '🔵⚫', arch: 'Combo', pct: '~6%', keys: 'Ad Nauseam, Tendrils, Dark Ritual, Brainstorm, Ponder', link: 'https://www.mtggoldfish.com/archetype/legacy-ant' },
          { name: 'Elves', colors: '🟢', arch: 'Combo/Aggro', pct: '~5%', keys: 'Allosaurus Shepherd, Natural Order, Elvish Visionary, Wirewood Lodge', link: 'https://www.mtggoldfish.com/archetype/legacy-elves' },
          { name: 'Riddlesmith Combo', colors: '🔵', arch: 'Combo', pct: '~4%', keys: 'Riddlesmith, Urza, Mystic Forge, Emry', link: 'https://www.mtggoldfish.com/metagame/legacy' },
        ]
      },
      {
        tier: 'C', label: 'Tier C — Rogue / Brewing',
        decks: [
          { name: 'Maverick', colors: '⚪🟢', arch: 'Hatebears/Midrange', pct: '~2%', keys: 'Knight of the Reliquary, Thalia, Wasteland, GSZ', link: 'https://www.mtggoldfish.com/metagame/legacy' },
          { name: 'Imperial Painter', colors: '🔴', arch: 'Combo', pct: '~2%', keys: 'Painter\'s Servant, Grindstone, Imperial Recruiter, Pyroblast', link: 'https://www.mtggoldfish.com/metagame/legacy' },
        ]
      }
    ]
  },
  brawl: {
    label: 'Brawl', updated: 'Early 2025',
    link: 'https://www.mtggoldfish.com/metagame/brawl',
    tiers: [
      {
        tier: 'S', label: 'Tier S — Dominant Commanders',
        decks: [
          { name: 'Raffine, Scheming Seer', colors: '⚪🔵⚫', arch: 'Control/Midrange', pct: 'Very High', keys: 'Connive engine, removal suite, card selection, evasion on Raffine', link: 'https://edhrec.com/commanders/raffine-scheming-seer' },
          { name: 'Sheoldred, the Apocalypse', colors: '⚫', arch: 'Control', pct: 'Very High', keys: 'Life drain, Phyrexian Arena, card draw punishment', link: 'https://edhrec.com/commanders/sheoldred-the-apocalypse' },
          { name: 'Atraxa, Praetors\' Voice', colors: '⚪🔵⚫🟢', arch: 'Midrange/Proliferate', pct: 'High', keys: 'Proliferate, planeswalkers, counters, evasion', link: 'https://edhrec.com/commanders/atraxa-praetors-voice' },
        ]
      },
      {
        tier: 'A', label: 'Tier A — Strong Picks',
        decks: [
          { name: 'The Wandering Emperor', colors: '⚪', arch: 'Control/Flash', pct: 'High', keys: 'Flash plays, Samurai synergies, removal, token generation', link: 'https://edhrec.com/commanders/the-wandering-emperor' },
          { name: 'Teferi, Who Slows the Sunset', colors: '⚪🔵', arch: 'Control/Combo', pct: 'High', keys: 'Mana untap, artifact acceleration, proliferate combos', link: 'https://edhrec.com/commanders/teferi-who-slows-the-sunset' },
          { name: 'Rona, Herald of Invasion', colors: '🔵⚫', arch: 'Combo', pct: 'Moderate-High', keys: 'Legendary synergies, discard value, transform combo finish', link: 'https://edhrec.com/commanders/rona-herald-of-invasion' },
          { name: 'Lathril, Blade of the Elves', colors: '⚫🟢', arch: 'Tribal/Combo', pct: 'Moderate-High', keys: 'Elf synergies, life drain, token generation', link: 'https://edhrec.com/commanders/lathril-blade-of-the-elves' },
        ]
      },
      {
        tier: 'B', label: 'Tier B — Solid Choices',
        decks: [
          { name: 'Giada, Font of Hope', colors: '⚪', arch: 'Tribal/Aggro', pct: 'Moderate', keys: 'Angel tribal, mana ramp, flying aggro', link: 'https://edhrec.com/commanders/giada-font-of-hope' },
          { name: 'Jodah, the Unifier', colors: '⚪🔵⚫🔴🟢', arch: 'Good Stuff', pct: 'Moderate', keys: 'Cascade-like trigger on Legendary spells, 5-color value', link: 'https://edhrec.com/commanders/jodah-the-unifier' },
          { name: 'Toxrill, the Corrosive', colors: '🔵⚫', arch: 'Control', pct: 'Moderate', keys: 'Slug generation, creature control, slime token payoffs', link: 'https://edhrec.com/commanders/toxrill-the-corrosive' },
        ]
      },
      {
        tier: 'C', label: 'Tier C — Fun / Brewing',
        decks: [
          { name: 'Torens, Fist of the Angels', colors: '⚪🟢', arch: 'Tokens', pct: 'Lower', keys: 'Human/token synergies, +1/+1 counter payoffs', link: 'https://edhrec.com/commanders/torens-fist-of-the-angels' },
          { name: 'Chishiro, the Shattered Blade', colors: '🔴🟢', arch: 'Aggro', pct: 'Lower', keys: 'Equipment/Aura synergies, spirit token generation', link: 'https://edhrec.com/commanders/chishiro-the-shattered-blade' },
        ]
      }
    ]
  }
}

export const BRAWL_TRENDING_FALLBACK = [
  { name: 'Raffine, Scheming Seer', colors: '⚪🔵⚫', change: '▲ +3%', sub: 'Esper Control' },
  { name: 'Sheoldred, the Apocalypse', colors: '⚫', change: '▲ +2%', sub: 'Mono Black' },
  { name: 'Atraxa, Praetors\' Voice', colors: '⚪🔵⚫🟢', change: '▲ +1%', sub: 'Proliferate' },
  { name: 'The Wandering Emperor', colors: '⚪', change: '— Stable', sub: 'White Control' },
  { name: 'Teferi, Temporal Pilgrim', colors: '🔵', change: '▲ +2%', sub: 'Blue Control' },
  { name: 'Rona, Herald of Invasion', colors: '🔵⚫', change: '▲ +4%', sub: 'Dimir Combo' },
  { name: 'Lathril, Blade of Elves', colors: '⚫🟢', change: '▼ -1%', sub: 'Elf Tribal' },
  { name: 'Giada, Font of Hope', colors: '⚪', change: '▲ +1%', sub: 'Angel Tribal' },
  { name: 'Jodah, the Unifier', colors: '⚪🔵⚫🔴🟢', change: '— Stable', sub: '5-Color Good Stuff' },
  { name: 'Toxrill, the Corrosive', colors: '🔵⚫', change: '▲ +2%', sub: 'Dimir Control' },
]
