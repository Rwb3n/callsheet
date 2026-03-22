// 4rfv subcategory → CALLSHEET specialisation slug mapping — CS-WORK-024 AC-04
// Maps 4rfv's ~790 subcategories (43 categories) to CALLSHEET taxonomy (7/64/269).
// Approach: category-level rules first, then keyword overrides for specific subcategories.
// Unmapped subcategories logged. Target: ≥90% listing coverage.

// ── Category-level mappings ──
// Maps a 4rfv category name to one or more CALLSHEET specialisation slugs.
// When a category maps to multiple slugs, all are assigned (provider has multiple capabilities).

const CATEGORY_MAP: Record<string, string[]> = {
  "Aerial Filming": ["drone-operator", "drone-systems"],
  "AV Equipment": ["on-set-monitors", "playback-systems"],
  "Animation": ["2d", "3d", "motion-graphics", "character-animation"],
  "Archive": ["mam-dam"],
  "Broadcast Audio": ["sound-design", "mixers-recorders", "microphones"],
  "Broadcast Equipment": ["broadcast-cameras", "routers", "switchers"],
  "Broadcast Facilities": ["tv-studio", "servers", "playout"],
  "Broadcast Kit hire": ["cinema-cameras", "broadcast-cameras", "microphones"],
  "Camera crew": ["camera-operator", "director-of-photography", "focus-puller"],
  "Cameras": ["cinema-cameras", "broadcast-cameras", "specialty-cameras"],
  "Casting and Agents": ["casting-directors", "talent-agents", "extras-supporting-artist-agencies"],
  "Catering": ["location-catering", "craft-services"],
  "Content Management": ["mam-dam", "collaboration-tools"],
  "Corporate video": ["corporate-film", "branded-content"],
  "Duplication": ["format-conversion", "deliverables"],
  "Event production": ["live-event", "conference", "hybrid-virtual-event"],
  "Internet TV": ["livestream", "encoding"],
  "Jobs & Training": ["short-courses", "apprenticeships"],
  "Lighting Equipment": ["led", "tungsten", "hmi"],
  "Locations": ["location-library", "location-management", "location-scouting"],
  "Logistics and Transport": ["unit-vehicles", "freight-shipping", "artiste-transport"],
  "Makeup - Wigs, Prosthetics, Suppliers, Artists": ["makeup-artist", "prosthetics", "hair-stylist"],
  "Modelmaking": ["prop-making"],
  "Music & recording": ["music-recording", "composition", "scoring"],
  "Music - Production": ["production-music-library", "composition"],
  "Music Composition": ["composition", "scoring"],
  "Outside broadcast": ["broadcast-cameras", "switchers", "encoding"],
  "Post Production": ["offline-edit", "online-edit", "colour-grading", "sound-design"],
  "Production Companies": ["feature-film", "drama", "documentary"],
  "Production Services": ["production-manager", "production-coordinator", "line-producer"],
  "Props & Models": ["prop-hire", "prop-making", "set-dressing"],
  "SFX & Stunts": ["pyrotechnics", "mechanical-effects", "stunt-coordinator"],
  "Scenery & Set": ["set-construction", "scenic-painting", "set-decorator"],
  "Studios": ["sound-stage", "tv-studio", "film-studio"],
  "Support Services": ["production-insurance", "production-accounting", "entertainment-law"],
  "System Integration": ["routers", "switchers", "servers"],
}

// ── Subcategory-level keyword overrides ──
// Maps specific subcategory names (case-insensitive) to specialisation slugs.
// These override the category-level mapping when matched.

const SUBCAT_OVERRIDES: Record<string, string[]> = {
  // Aerial Filming
  "aerial - cameramen": ["drone-operator", "camera-operator"],
  "aerial - photography": ["drone-operator"],
  "aerial filming": ["drone-operator", "drone-systems"],
  "aerial filming drones": ["drone-operator", "drone-systems"],
  "aerial filming helicopters": ["drone-operator"],
  "unmanned aerial filming systems": ["drone-systems", "drone-operator"],

  // Animation
  "animation": ["2d", "3d"],
  "animation - 3d computer generated": ["3d", "cgi"],
  "animation - computer graphics": ["3d", "cgi"],
  "animation - director": ["director"],
  "animation - effects": ["compositing", "cgi"],
  "animation - equipment": ["vfx-software"],
  "animation - production companies": ["2d", "3d", "character-animation"],
  "animation computer games": ["3d", "character-animation"],
  "animation services - film treatment / processing": ["2d", "3d"],
  "animation studios": ["2d", "3d"],
  "animationtraining": ["short-courses"],
  "animator": ["character-animation", "2d"],
  "architectural illustrations": ["3d"],
  "architectural walk throughs": ["3d", "vr-ar-xr-content"],
  "augmented reality": ["vr-ar-xr-content"],
  "cinematics": ["3d", "cgi"],
  "computer graphics": ["cgi", "3d"],
  "digital animation": ["2d", "3d"],
  "matte painting": ["matte-painting"],
  "motion graphics": ["motion-graphics"],
  "storyboard": ["production-designer"],
  "virtual reality": ["vr-ar-xr-content"],

  // Broadcast Audio
  "audio broadcast": ["mixers-recorders"],
  "audio conferencing": ["comms"],
  "audio description": ["access-services-ad-hoh"],
  "audio engineer": ["sound-mixer"],
  "audio networking": ["comms"],
  "audio visual equipment": ["on-set-monitors", "playback-systems"],
  "broadcast audio": ["mixers-recorders"],
  "broadcast microphones": ["microphones"],
  "broadcast mixers": ["mixers-recorders"],
  "commentary systems": ["comms"],
  "headphones": ["microphones"],
  "hearing loops": ["comms"],
  "intercom": ["comms"],
  "ipdc audio over ip": ["comms"],
  "microphones": ["microphones"],
  "radio mics": ["wireless"],
  "radio microphones": ["wireless"],
  "speakers": ["microphones"],
  "studio monitoring": ["on-set-monitors"],
  "talkback systems": ["comms"],

  // Camera crew
  "camera - crew": ["camera-operator"],
  "cameraman": ["camera-operator"],
  "crew hire": ["camera-operator"],
  "focus puller": ["focus-puller"],
  "lighting cameraman": ["camera-operator", "gaffer"],
  "steadicam operator": ["steadicam"],
  "camera operator": ["camera-operator"],
  "director of photography": ["director-of-photography"],
  "dop": ["director-of-photography"],
  "underwater cameraman": ["underwater-camera"],

  // Cameras
  "digital cameras": ["cinema-cameras"],
  "digital still cameras": ["cinema-cameras"],
  "film cameras": ["cinema-cameras"],
  "hd cameras": ["cinema-cameras"],
  "high speed cameras": ["specialty-cameras"],
  "ip cameras": ["broadcast-cameras"],
  "miniature cameras": ["specialty-cameras"],
  "obs cameras": ["broadcast-cameras"],
  "pov cameras": ["specialty-cameras"],
  "ptz cameras": ["broadcast-cameras"],
  "studio cameras": ["broadcast-cameras"],
  "thermal cameras": ["specialty-cameras"],
  "underwater cameras": ["specialty-cameras"],
  "camera crane": ["cranes"],
  "camera stabilizer": ["stabilised-heads"],
  "camera support": ["dollies", "sliders"],
  "camera dolly": ["dollies"],
  "tripods": ["dollies"],
  "camera remote heads": ["stabilised-heads"],
  "jibs": ["jibs"],
  "camera filters": ["filters"],
  "field recorders": ["mixers-recorders"],

  // Casting and Agents
  "actors agents": ["talent-agents"],
  "casting": ["casting-directors"],
  "casting director": ["casting-directors"],
  "extras agency": ["extras-supporting-artist-agencies"],
  "extras and walk ons": ["extras-supporting-artist-agencies"],
  "literary agents": ["talent-agents"],
  "model agency": ["model-agencies"],
  "presenters": ["presenter-speaker-agencies"],
  "talent agent": ["talent-agents"],
  "voice over": ["voice-over-agencies"],
  "voice over agencies": ["voice-over-agencies"],
  "voice over artist": ["voice-over-agencies"],

  // Corporate video
  "corporate video production companies": ["corporate-film"],
  "corporate video production company": ["corporate-film"],
  "production companies - corporate & non broadcast": ["corporate-film"],
  "production companies - commercials and promos": ["tv-commercials", "branded-content"],
  "video production company": ["corporate-film", "branded-content"],
  "web video production": ["social-media-content"],

  // Event production
  "events": ["live-event"],
  "event hire": ["live-event"],
  "conference production": ["conference"],
  "exhibition production": ["exhibition"],
  "live events": ["live-event"],
  "awards shows": ["live-event"],
  "audio pa hire": ["live-event"],
  "concert production": ["live-event"],

  // Lighting
  "lighting": ["led", "tungsten"],
  "lighting design": ["lighting-designer"],
  "lighting director": ["lighting-director"],
  "lighting hire": ["led", "tungsten", "hmi"],
  "studio lighting": ["led", "tungsten"],
  "led lighting": ["led"],
  "moving lights": ["led"],
  "grip and rigging": ["grip-rigging"],
  "grip equipment": ["grip-rigging"],
  "gaffer": ["gaffer"],

  // Locations
  "location - filming": ["location-library"],
  "location finding": ["location-scouting"],
  "location management": ["location-management"],
  "location scout": ["location-scouting"],
  "studio hire": ["sound-stage"],
  "transport - vehicles": ["unit-vehicles"],
  "parking & basecamp": ["parking-basecamp"],
  "accommodation": ["crew-accommodation"],

  // Music & recording
  "dubbing theatre": ["dubbing-mixing"],
  "music library": ["production-music-library"],
  "music licensing": ["music-supervision"],
  "music supervision": ["music-supervision"],
  "recording studios": ["music-recording"],
  "sound recording": ["sound-recordist"],
  "voice over studios": ["voice-adr"],
  "voice recording": ["voice-adr"],
  "adr": ["adr"],
  "foley": ["foley"],

  // Post Production
  "audio - post production": ["sound-design", "dubbing-mixing"],
  "closed captioning": ["closed-captioning"],
  "colour grading": ["colour-grading"],
  "colour correction": ["colour-correction"],
  "conforming": ["conform"],
  "digital intermediate": ["colour-grading"],
  "digital mastering": ["mastering"],
  "duplication": ["format-conversion"],
  "dvd authoring": ["deliverables"],
  "encoding": ["encoding"],
  "film scanning": ["film-scan"],
  "graphics": ["title-design", "infographics"],
  "high definition": ["online-edit"],
  "hdr": ["hdr-mastering"],
  "non linear editing": ["offline-edit"],
  "offline edit": ["offline-edit"],
  "online edit": ["online-edit"],
  "post production": ["offline-edit", "online-edit"],
  "restoration": ["audio-restoration"],
  "subtitling": ["subtitling"],
  "telecine": ["film-scan"],
  "vfx": ["compositing", "cgi"],
  "visual effects": ["compositing", "cgi"],

  // Production Companies
  "production companies - film & television": ["feature-film", "drama"],
  "independent production companies": ["feature-film", "documentary"],
  "documentary production": ["documentary"],
  "factual production": ["factual"],
  "news production": ["news"],
  "sport production": ["sport"],

  // Production Services
  "art director": ["art-director"],
  "catering": ["location-catering"],
  "craft services": ["craft-services"],
  "construction": ["set-construction"],
  "costume": ["costume-designer", "costume-hire"],
  "costume hire": ["costume-hire"],
  "first aid": ["first-aid"],
  "health and safety": ["hs-supervision"],
  "health & safety": ["hs-supervision"],
  "production accountant": ["production-accounting"],
  "production coordinator": ["production-coordinator"],
  "production designer": ["production-designer"],
  "production manager": ["production-manager"],
  "production office": ["production-office"],
  "risk assessment": ["risk-assessment"],
  "runner": ["runner"],
  "script supervisor": ["script-supervisor"],
  "security": ["location-security"],
  "wardrobe": ["wardrobe-supervisor"],

  // Props & Models
  "model making": ["prop-making"],
  "prop hire": ["prop-hire"],
  "prop making": ["prop-making"],
  "propmaker": ["prop-making"],
  "scenic artist": ["scenic-artist"],
  "set dressing": ["set-dressing"],
  "action vehicles": ["action-vehicles"],
  "greens and plants": ["greens-plants"],

  // SFX & Stunts
  "armourer": ["armourer"],
  "fight choreographer": ["fight-choreographer"],
  "pyrotechnics": ["pyrotechnics"],
  "special effects": ["mechanical-effects", "pyrotechnics"],
  "stunt coordinator": ["stunt-coordinator"],
  "stunt performer": ["stunt-performer"],
  "weather effects": ["weather-effects"],
  "atmospherics": ["atmospherics"],
  "mechanical effects": ["mechanical-effects"],

  // Studios
  "dubbing studios": ["dubbing-theatre"],
  "edit suite": ["edit-suite"],
  "grading suite": ["grading-suite"],
  "green screen": ["green-blue-screen"],
  "recording studio": ["music-recording"],
  "rehearsal rooms": ["sound-stage"],
  "screening room": ["review-screening-room"],
  "sound stages": ["sound-stage"],
  "studios": ["sound-stage", "tv-studio"],
  "tv studio": ["tv-studio"],

  // Support Services
  "accountants": ["production-accounting"],
  "completion bonds": ["completion-bonds"],
  "entertainment lawyers": ["entertainment-law"],
  "insurance": ["production-insurance"],
  "legal": ["entertainment-law", "contracts"],
  "production insurance": ["production-insurance"],
  "publicists": ["unit-publicity"],
  "recruitment": ["freelance", "crew-agencies"],
  "tax credits": ["tax-credits-relief"],

  // Logistics and Transport
  "couriers": ["freight-shipping"],
  "freight": ["freight-shipping"],
  "vehicle hire": ["unit-vehicles"],
  "unit base": ["parking-basecamp"],

  // Miscellaneous / catch-all
  "3": [], // Appears to be a data error (subcategory name "3" in Music - Production)
}

// ── Keyword fallback rules ──
// If no override and no category match, try keyword matching against the subcategory name.
// Each rule: [pattern, slugs]. First match wins.

const KEYWORD_RULES: [RegExp, string[]][] = [
  [/drone|uav|unmanned/i, ["drone-operator", "drone-systems"]],
  [/aerial/i, ["drone-operator"]],
  [/animat/i, ["2d", "3d"]],
  [/vfx|visual effect/i, ["compositing", "cgi"]],
  [/camera\b.*\bhire|camera\b.*\brental/i, ["cinema-cameras"]],
  [/camera\b.*\bcrew|cameraman|camera operator/i, ["camera-operator"]],
  [/steadicam/i, ["steadicam"]],
  [/dop|director of photography/i, ["director-of-photography"]],
  [/focus pull/i, ["focus-puller"]],
  [/gaffer/i, ["gaffer"]],
  [/grip|rigging/i, ["grip-rigging"]],
  [/lighting/i, ["led"]],
  [/sound\b.*\brecord|sound\b.*\bmix/i, ["sound-recordist", "sound-mixer"]],
  [/sound\b.*\bdesign/i, ["sound-design"]],
  [/boom\b.*\boperator/i, ["boom-operator"]],
  [/edit(?:ing|or)?(?:\b|$)/i, ["offline-edit"]],
  [/colour|color|grad(?:ing|er)/i, ["colour-grading"]],
  [/composit/i, ["compositing"]],
  [/cgi/i, ["cgi"]],
  [/subtitle|captioning/i, ["subtitling", "closed-captioning"]],
  [/dubbing/i, ["dubbing", "dubbing-mixing"]],
  [/translat/i, ["translation"]],
  [/foley/i, ["foley"]],
  [/adr/i, ["adr"]],
  [/music\b.*\bcompos/i, ["composition"]],
  [/music\b.*\bprod/i, ["production-music-library"]],
  [/music\b.*\bsupervi/i, ["music-supervision"]],
  [/scor(?:ing|er)/i, ["scoring"]],
  [/studio(?:s)?(?:\b|$)/i, ["sound-stage"]],
  [/location\b.*\bscout/i, ["location-scouting"]],
  [/location\b.*\bmanag/i, ["location-management"]],
  [/location/i, ["location-library"]],
  [/cater(?:ing|er)/i, ["location-catering"]],
  [/transport/i, ["unit-vehicles"]],
  [/accomm/i, ["crew-accommodation"]],
  [/secur(?:ity|e)/i, ["location-security"]],
  [/health.*safety|h\s*&\s*s/i, ["hs-supervision"]],
  [/first\s*aid/i, ["first-aid"]],
  [/insur(?:ance|er)/i, ["production-insurance"]],
  [/legal|lawyer|solicitor/i, ["entertainment-law"]],
  [/account(?:ant|ing)/i, ["production-accounting"]],
  [/tax\b.*\bcredit|tax\b.*\brelief/i, ["tax-credits-relief"]],
  [/recruit/i, ["freelance"]],
  [/training|course/i, ["short-courses"]],
  [/apprent/i, ["apprenticeships"]],
  [/mentor/i, ["mentoring"]],
  [/prop\b.*\bhire/i, ["prop-hire"]],
  [/prop\b.*\bmak/i, ["prop-making"]],
  [/set\b.*\bconstruct/i, ["set-construction"]],
  [/scenic\b.*\bpaint/i, ["scenic-painting"]],
  [/costum/i, ["costume-hire"]],
  [/wardrobe/i, ["wardrobe-supervisor"]],
  [/makeup|make-up/i, ["makeup-artist"]],
  [/prosthetic/i, ["prosthetics"]],
  [/wig|hair/i, ["hair-stylist"]],
  [/stunt/i, ["stunt-coordinator"]],
  [/pyro/i, ["pyrotechnics"]],
  [/special\b.*\beffect|sfx/i, ["mechanical-effects"]],
  [/casting/i, ["casting-directors"]],
  [/voice\b.*\bover/i, ["voice-over-agencies"]],
  [/present(?:er|ation)/i, ["presenter-speaker-agencies"]],
  [/model\b.*\bagenc/i, ["model-agencies"]],
  [/extra(?:s)?.*\b(?:agenc|artist)/i, ["extras-supporting-artist-agencies"]],
  [/broadcast\b.*\bequip/i, ["broadcast-cameras"]],
  [/broadcast/i, ["broadcast-cameras"]],
  [/projector|projection/i, ["playback-systems"]],
  [/monitor/i, ["on-set-monitors"]],
  [/teleprompter|autocue|prompt/i, ["playback-systems"]],
  [/podcast/i, ["podcast-video", "podcast-studio"]],
  [/livestream|live\s*stream/i, ["livestream"]],
  [/web\b.*\bseries/i, ["web-series"]],
  [/social\b.*\bmedia/i, ["social-media-content"]],
  [/generator/i, ["generators"]],
  [/power\b.*\bdistrib/i, ["distribution"]],
  [/cable|connector/i, ["cabling-connectors"]],
  [/scaffold/i, ["scaffolding"]],
  [/crane/i, ["cranes"]],
  [/dolly|track(?:ing)?/i, ["dollies", "tracking"]],
  [/slider/i, ["sliders"]],
  [/jib/i, ["jibs"]],
  [/led\b.*\bwall|led\b.*\bvolume/i, ["led-walls-volumes"]],
  [/virtual\b.*\bprod/i, ["led-volume", "real-time-unreal-unity"]],
  [/motion\b.*\bcaptur/i, ["motion-capture"]],
  [/previz/i, ["previz"]],
]

// ── Public API ──

export function map4rfvSubcategory(subcategory: string): string[] {
  const key = subcategory.trim().toLowerCase()

  // 1. Check override table
  if (key in SUBCAT_OVERRIDES) return SUBCAT_OVERRIDES[key]

  // 2. Keyword rules
  for (const [pattern, slugs] of KEYWORD_RULES) {
    if (pattern.test(key)) return slugs
  }

  // Empty array = unmapped
  return []
}

export function map4rfvCategory(category: string): string[] {
  return CATEGORY_MAP[category] ?? []
}

/**
 * Maps a company's subcategories to CALLSHEET specialisation slugs.
 * Uses subcategory-level overrides first, then keyword rules, then category fallback.
 * Returns deduplicated slug array.
 */
export function mapCompanyServices(
  subcategories: Array<{ name: string; category: string }>,
): string[] {
  const slugSet = new Set<string>()

  for (const { name, category } of subcategories) {
    // Try subcategory-level first
    const subcatSlugs = map4rfvSubcategory(name)
    if (subcatSlugs.length > 0) {
      for (const s of subcatSlugs) slugSet.add(s)
      continue
    }

    // Fallback to category-level
    const catSlugs = map4rfvCategory(category)
    for (const s of catSlugs) slugSet.add(s)
  }

  return [...slugSet].sort()
}

/**
 * Returns all unmapped subcategories (for logging).
 */
export function findUnmappedSubcategories(
  subcategories: Array<{ name: string; category: string }>,
): string[] {
  return subcategories
    .filter(({ name, category }) => {
      const subcatSlugs = map4rfvSubcategory(name)
      if (subcatSlugs.length > 0) return false
      const catSlugs = map4rfvCategory(category)
      return catSlugs.length === 0
    })
    .map(({ name }) => name)
}
