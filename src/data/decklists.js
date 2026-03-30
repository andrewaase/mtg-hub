export const DECKLISTS = {

  // ── STANDARD ──────────────────────────────────────────────────────────────

  'Dimir Midrange': {
    format: 'Standard', tier: 'S', link: 'https://www.mtggoldfish.com/archetype/standard-dimir-midrange',
    note: 'Dominant Standard control/midrange shell built around Psychic Frog and Deep-Cavern Bat.',
    creatures:     [[4,'Psychic Frog'],[4,'Deep-Cavern Bat'],[3,'Atraxa, Grand Unifier']],
    spells:        [[4,'Go for the Throat'],[4,'Cut Down'],[4,'Enduring Curiosity'],[3,'Deadly Cover-Up'],[3,'Deduce'],[2,'Long Goodbye'],[2,'Preordain']],
    planeswalkers: [[2,'Kaito, Bane of Nightmares'],[2,'Ashiok, Wicked Manipulator']],
    lands:         [[4,'Underground River'],[4,'Darkslick Shores'],[4,'Restless Reef'],[4,'Sunken Citadel'],[3,'Undercity Sewers'],[3,'Fountainport'],[3,'Island'],[3,'Swamp']],
    sideboard:     [[2,'Negate'],[2,'Mystical Dispute'],[2,'Test of Talents'],[2,'Leyline of the Void'],[2,'Extinction Event'],[2,'Void Rend'],[1,'Unlicensed Hearse'],[2,'Sunfall']],
  },

  'Mono Red Aggro': {
    format: 'Standard', tier: 'S', link: 'https://www.mtggoldfish.com/archetype/standard-mono-red-aggro',
    note: 'Blazing-fast aggro deck that wins on turn 3-5 with efficient red threats and burn spells.',
    creatures:     [[4,'Slickshot Show-Off'],[4,'Heartfire Hero'],[4,'Monastery Swiftspear'],[4,'Cacophony Scamp'],[2,'Emberheart Challenger']],
    spells:        [[4,'Lightning Strike'],[4,'Torch the Tower'],[4,'Shock'],[4,'Play with Fire'],[3,'Witchstalker Frenzy']],
    lands:         [[21,'Mountain']],
    sideboard:     [[3,'Rampaging Ferocidon'],[3,'Leyline of Combustion'],[2,'Roiling Vortex'],[2,'Flame-Blessed Bolt'],[2,'Sokenzan, Crucible of Defiance'],[3,'Tibalt\'s Trickery']],
  },

  'Boros Convoke': {
    format: 'Standard', tier: 'S', link: 'https://www.mtggoldfish.com/archetype/standard-boros-convoke',
    note: 'Swarm the board with tokens and convoke out a huge Knight-Errant of Eos for a devastating board state.',
    creatures:     [[4,'Imodane\'s Recruiter'],[4,'Novice Inspector'],[4,'Resolute Reinforcements'],[3,'Knight-Errant of Eos'],[4,'Recruitment Officer']],
    spells:        [[4,'Gleeful Demolition'],[4,'Warleader\'s Call'],[3,'Pia Nalaar, Consul of Revival']],
    lands:         [[4,'Sundown Pass'],[4,'Restless Bivouac'],[4,'Inspiring Vantage'],[4,'Plains'],[3,'Mountain'],[2,'Arena of Glory']],
    sideboard:     [[3,'Temporary Lockdown'],[2,'Deafening Clarion'],[2,'Surge of Salvation'],[2,'Reckless Rage'],[2,'Lay Down Arms'],[2,'Destroy Evil'],[2,'Depopulate']],
  },

  'Esper Midrange': {
    format: 'Standard', tier: 'A', link: 'https://www.mtggoldfish.com/archetype/standard-esper-midrange',
    note: 'Grindy three-color midrange with top-tier threats and the best removal in Standard.',
    creatures:     [[4,'Raffine, Scheming Seer'],[4,'Sheoldred, the Apocalypse'],[3,'Atraxa, Grand Unifier'],[2,'Ertai Resurrected']],
    spells:        [[4,'Cut Down'],[4,'Make Disappear'],[3,'Sunfall'],[3,'Wandering Emperor']],
    planeswalkers: [[2,'The Wandering Emperor'],[2,'Kaito, Bane of Nightmares'],[2,'Ashiok, Wicked Manipulator']],
    lands:         [[4,'Raffine\'s Tower'],[4,'Obscura Storefront'],[4,'Spara\'s Headquarters'],[4,'Darkslick Shores'],[4,'Underground River'],[2,'Swamp'],[2,'Island'],[2,'Plains']],
    sideboard:     [[2,'Farewell'],[2,'Negate'],[2,'Void Rend'],[2,'Mystical Dispute'],[2,'Unlicensed Hearse'],[2,'Invasion of Gobakhan'],[3,'Duress']],
  },

  // ── MODERN ────────────────────────────────────────────────────────────────

  'Boros Energy': {
    format: 'Modern', tier: 'S', link: 'https://www.mtggoldfish.com/archetype/modern-boros-energy',
    note: 'The premier Modern aggro deck generating energy with efficient creatures and Ajani as the value engine.',
    creatures:     [[4,'Amped Raptor'],[4,'Phlage, Titan of Fire\'s Fury'],[4,'Ocelot Pride'],[4,'Ajani, Nacatl Pariah'],[2,'Guide of Souls']],
    spells:        [[4,'Galvanic Discharge'],[4,'Lightning Bolt'],[4,'Ral, Crackling Wit'],[4,'Tribal Flames'],[2,'Torch the Tower']],
    lands:         [[4,'Sacred Foundry'],[4,'Inspiring Vantage'],[4,'Sunbaked Canyon'],[4,'Fiery Islet'],[4,'Clifftop Retreat'],[4,'Mountain'],[2,'Plains']],
    sideboard:     [[2,'Damping Sphere'],[2,'Rest in Peace'],[2,'Leyline of the Void'],[2,'Deflecting Palm'],[2,'Wear // Tear'],[2,'Sanctifier en-Vec'],[3,'Prismatic Ending']],
  },

  'Living End': {
    format: 'Modern', tier: 'S', link: 'https://www.mtggoldfish.com/archetype/modern-living-end',
    note: 'Cycle creatures into the graveyard then cascade into Living End to reanimate your whole team.',
    creatures:     [[4,'Street Wraith'],[4,'Architects of Will'],[4,'Monstrous Carabid'],[4,'Striped Riverwinder'],[3,'Grief'],[2,'Curator of Chaos']],
    spells:        [[4,'Living End'],[4,'Shardless Agent'],[4,'Violent Outburst'],[4,'Subtlety'],[3,'Brainstorm']],
    lands:         [[4,'Gemstone Mine'],[4,'Verdant Catacombs'],[3,'Blood Crypt'],[3,'Stomping Ground'],[2,'Steam Vents'],[2,'Ketria Triome'],[2,'Swamp']],
    sideboard:     [[3,'Endurance'],[2,'Force of Vigor'],[2,'Mystical Dispute'],[2,'Leyline of Sanctity'],[2,'Surgical Extraction'],[2,'Engineered Explosives'],[2,'Boseiju, Who Endures']],
  },

  'Amulet Titan': {
    format: 'Modern', tier: 'S', link: 'https://www.mtggoldfish.com/archetype/modern-amulet-titan',
    note: 'Generates massive mana via Amulet of Vigor bouncing lands, then slams Primeval Titan for a quick kill.',
    creatures:     [[4,'Primeval Titan'],[4,'Dryad of the Ilysian Grove'],[3,'Azusa, Lost but Seeking'],[2,'Cultivator Colossus']],
    spells:        [[4,'Amulet of Vigor'],[4,'Summoner\'s Pact'],[4,'Ancient Stirrings'],[4,'Explore'],[3,'Arboreal Grazer']],
    lands:         [[4,'Simic Growth Chamber'],[4,'Golgari Rot Farm'],[4,'Tolaria West'],[3,'Vesuva'],[3,'Boros Garrison'],[3,'Cavern of Souls'],[2,'Forest'],[3,'Radiant Fountain']],
    sideboard:     [[2,'Force of Vigor'],[2,'Reclamation Sage'],[2,'Bojuka Bog'],[2,'Engineered Explosives'],[2,'Cavern of Souls'],[2,'Boseiju, Who Endures'],[3,'Veil of Summer']],
  },

  // ── BRAWL (100-card singleton) ────────────────────────────────────────────

  'Raffine, Scheming Seer': {
    format: 'Brawl', tier: 'S', link: 'https://edhrec.com/commanders/raffine-scheming-seer',
    note: 'Esper control/midrange. Connive engine with Raffine fuels card advantage while a suite of counters and removal protects the board.',
    commander: 'Raffine, Scheming Seer',
    creatures: [
      [1,'Atraxa, Grand Unifier'],[1,'Sheoldred, the Apocalypse'],[1,'Deep-Cavern Bat'],
      [1,'Faerie Mastermind'],[1,'Psychic Frog'],[1,'Kitesail Larcenist'],
      [1,'Wandering Mind'],[1,'Toluz, Clever Conductor'],[1,'Ledger Shredder'],
      [1,'Chrome Host Seedshark'],[1,'Ertai Resurrected'],[1,'Dennick, Pious Apprentice'],
      [1,'Malevolent Hermit'],[1,'Monastery Mentor'],[1,'Haughty Djinn'],
      [1,'Brazen Borrower'],[1,'Skrelv, Defector Mite'],
    ],
    spells: [
      [1,'Counterspell'],[1,'Make Disappear'],[1,'No More Lies'],[1,'Negate'],
      [1,'Cut Down'],[1,'Go for the Throat'],[1,'Vanishing Verse'],[1,'Infernal Grasp'],
      [1,'Sunfall'],[1,'Farewell'],[1,'Depopulate'],[1,'Deadly Cover-Up'],
      [1,'The Wandering Emperor'],[1,'March of Otherworldly Light'],[1,'Lay Down Arms'],
      [1,'Preordain'],[1,'Consider'],[1,'Memory Deluge'],[1,'Temporary Lockdown'],
    ],
    artifacts: [
      [1,'Arcane Signet'],[1,'Talisman of Dominance'],[1,'Talisman of Progress'],
      [1,'Talisman of Hierarchy'],
    ],
    enchantments: [
      [1,'Wedding Announcement'],[1,'Phyrexian Arena'],[1,'Ossification'],
    ],
    planeswalkers: [
      [1,'Kaito, Bane of Nightmares'],[1,'Ashiok, Wicked Manipulator'],
      [1,'Teferi, Who Slows the Sunset'],[1,'Narset, Parter of Veils'],
    ],
    lands: [
      [1,'Raffine\'s Tower'],[1,'Obscura Storefront'],[1,'Spara\'s Headquarters'],
      [1,'Underground River'],[1,'Darkslick Shores'],[1,'Adarkar Wastes'],
      [1,'Caves of Koilos'],[1,'Glacial Fortress'],[1,'Drowned Catacomb'],
      [1,'Isolated Chapel'],[1,'Hallowed Fountain'],[1,'Watery Grave'],
      [1,'Godless Shrine'],[1,'Fetid Isle'],[1,'Silent Clearing'],
      [1,'Concealed Courtyard'],[1,'Port Town'],[1,'Shipwreck Marsh'],
      [1,'Deserted Beach'],[1,'Shattered Sanctum'],
      [1,'Hengegate Pathway'],[1,'Brightclimb Pathway'],[1,'Clearwater Pathway'],
      [1,'Prismatic Vista'],
      [8,'Plains'],[8,'Island'],[8,'Swamp'],
    ],
  },

  'Sheoldred, the Apocalypse': {
    format: 'Brawl', tier: 'S', link: 'https://edhrec.com/commanders/sheoldred-the-apocalypse',
    note: 'Mono Black control. Opponents lose 2 life every draw; you gain 2. Combine with card draw spells and drain effects for a relentless life advantage.',
    commander: 'Sheoldred, the Apocalypse',
    creatures: [
      [1,'Ob Nixilis, the Adversary'],[1,'Braids, Arisen Nightmare'],
      [1,'Preacher of the Schism'],[1,'Phyrexian Obliterator'],
      [1,'Graveyard Trespasser'],[1,'Sedgemoor Witch'],
      [1,'Ayara, First of Locthwain'],[1,'Archghoul of Thraben'],
      [1,'Dusk Legion Zealot'],[1,'Skullclamp'],
      [1,'Tergrid, God of Fright'],[1,'Gloomshrieker'],
      [1,'Black Market Connections'],[1,'Evolved Sleeper'],
      [1,'Sheoldred\'s Edict'],
    ],
    spells: [
      [1,'Liliana of the Veil'],[1,'The Meathook Massacre'],
      [1,'Invoke Despair'],[1,'Cut Down'],[1,'Go for the Throat'],
      [1,'Deadly Cover-Up'],[1,'Extinction Event'],[1,'Thoughtseize'],
      [1,'Gix\'s Command'],[1,'Tainted Pact'],[1,'Duress'],
      [1,'Divest'],[1,'Eaten Alive'],[1,'Infernal Grasp'],
      [1,'Vraska\'s Fall'],[1,'Soul Transfer'],[1,'Read the Bones'],
      [1,'Phyrexian Arena'],[1,'Sign in Blood'],[1,'Night\'s Whisper'],
    ],
    artifacts: [
      [1,'Arcane Signet'],[1,'Talisman of Dominance'],
      [1,'Jet Medallion'],[1,'Mind Stone'],[1,'Midnight Clock'],
    ],
    enchantments: [
      [1,'Underworld Dreams'],[1,'Kaya\'s Ghostform'],
    ],
    planeswalkers: [
      [1,'Liliana, Dreadhorde General'],[1,'Lolth, Spider Queen'],
      [1,'Karn, the Great Creator'],
    ],
    lands: [
      [1,'Hive of the Eye Tyrant'],[1,'Field of Ruin'],[1,'Demolition Field'],
      [1,'Castle Locthwain'],[1,'Takenuma, Abandoned Mire'],
      [1,'Cabal Stronghold'],[1,'Witch\'s Cottage'],
      [1,'Malakir Rebirth'],[1,'Prismatic Vista'],
      [45,'Swamp'],
    ],
  },

  'Atraxa, Praetors\' Voice': {
    format: 'Brawl', tier: 'S', link: 'https://edhrec.com/commanders/atraxa-praetors-voice',
    note: '4-color Proliferate midrange. Atraxa proliferates every end step, stacking counters on planeswalkers, creatures, and permanents for overwhelming value.',
    commander: 'Atraxa, Praetors\' Voice',
    creatures: [
      [1,'Sheoldred, the Apocalypse'],[1,'Jace, Vryn\'s Prodigy'],
      [1,'Roalesk, Apex Hybrid'],[1,'Nissa, Voice of Zendikar'],
      [1,'Grateful Apparition'],[1,'Evolution Sage'],
      [1,'Merfolk Skydiver'],[1,'Simic Ascendancy'],
      [1,'Crystalline Giant'],[1,'Viral Drake'],
      [1,'Bloated Contaminator'],[1,'Flux Channeler'],
      [1,'Kros, Defense Contractor'],[1,'Ozolith, the Shattered Spire'],
      [1,'Sword of Truth and Justice'],
    ],
    spells: [
      [1,'Doubling Season'],[1,'Resourceful Defense'],[1,'Primal Vigor'],
      [1,'Planewide Celebration'],[1,'Karn\'s Bastion'],
      [1,'Fuel for the Cause'],[1,'Steady Progress'],
      [1,'Contentious Plan'],[1,'Tezzeret\'s Gambit'],
      [1,'Inexorable Tide'],[1,'Biomass Mutation'],
      [1,'Smell Fear'],[1,'The Wandering Emperor'],
      [1,'Sunfall'],[1,'Farewell'],[1,'Teferi\'s Ageless Insight'],
    ],
    artifacts: [
      [1,'Arcane Signet'],[1,'Talisman of Progress'],[1,'Talisman of Dominance'],
      [1,'Talisman of Unity'],[1,'Talisman of Curiosity'],[1,'Mind Stone'],
      [1,'Contagion Clasp'],
    ],
    enchantments: [
      [1,'Phyrexian Arena'],[1,'Enchantress\'s Presence'],
    ],
    planeswalkers: [
      [1,'Ajani, Mentor of Heroes'],[1,'Elspeth Resplendent'],
      [1,'Vraska, Golgari Queen'],[1,'Kaito, Bane of Nightmares'],
      [1,'Teferi, Who Slows the Sunset'],[1,'Narset, Parter of Veils'],
    ],
    lands: [
      [1,'Raffine\'s Tower'],[1,'Spara\'s Headquarters'],[1,'Ziatora\'s Proving Ground'],
      [1,'Jetmir\'s Garden'],[1,'Obscura Storefront'],[1,'Brokers Hideout'],
      [1,'Hallowed Fountain'],[1,'Watery Grave'],[1,'Godless Shrine'],[1,'Temple Garden'],
      [1,'Overgrown Tomb'],[1,'Breeding Pool'],[1,'Glacial Fortress'],
      [1,'Drowned Catacomb'],[1,'Isolated Chapel'],[1,'Sunpetal Grove'],
      [1,'Hinterland Harbor'],[1,'Woodland Cemetery'],[1,'Prismatic Vista'],
      [6,'Plains'],[6,'Island'],[5,'Swamp'],[6,'Forest'],
    ],
  },

  'The Wandering Emperor': {
    format: 'Brawl', tier: 'A', link: 'https://edhrec.com/commanders/the-wandering-emperor',
    note: 'Mono White Flash/Control. Play everything at flash speed, generate Samurai tokens, and control the board with efficient removal.',
    commander: 'The Wandering Emperor',
    creatures: [
      [1,'Thalia, Guardian of Thraben'],[1,'Adeline, Resplendent Cathar'],
      [1,'Luminarch Aspirant'],[1,'Brutal Cathar'],[1,'Benalish Marshal'],
      [1,'Sanctuary Warden'],[1,'Spirited Companion'],[1,'Wedding Announcement'],
      [1,'Ambitious Farmhand'],[1,'Loran of the Third Path'],
      [1,'Skrelv, Defector Mite'],[1,'Heliod, the Radiant Dawn'],
      [1,'Michiko\'s Reign of Truth'],[1,'Imperial Oath'],
    ],
    spells: [
      [1,'Lay Down Arms'],[1,'March of Otherworldly Light'],[1,'Ossification'],
      [1,'Brave the Elements'],[1,'Destroy Evil'],[1,'Surge of Salvation'],
      [1,'Farewell'],[1,'Sunfall'],[1,'Depopulate'],[1,'Temporary Lockdown'],
      [1,'The Restoration of Eiganjo'],[1,'Elspeth Resplendent'],
      [1,'Elspeth, Sun\'s Champion'],[1,'Heliod, Sun-Crowned'],
    ],
    artifacts: [
      [1,'Sword of Forge and Frontier'],[1,'Sword of Fire and Ice'],
      [1,'Sigarda\'s Aid'],[1,'Basri\'s Lieutenant'],
    ],
    enchantments: [
      [1,'Glass Casket'],[1,'Paladin Class'],[1,'Journey to Nowhere'],
      [1,'Luminarch Ascension'],
    ],
    planeswalkers: [
      [1,'Elspeth, Knight-Errant'],[1,'Gideon Blackblade'],
      [1,'Ajani, Strength of the Pride'],
    ],
    lands: [
      [1,'Eiganjo, Seat of the Empire'],[1,'Emeria, the Sky Ruin'],
      [1,'Castle Ardenvale'],[1,'Caves of Koilos'],
      [1,'Shefet Dunes'],[1,'Flagstones of Trokair'],
      [1,'Mirrex'],[1,'Prismatic Vista'],
      [47,'Plains'],
    ],
  },
}
