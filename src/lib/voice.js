// Picks a calm-sounding FEMALE voice for the browser's built-in speech
// synthesis (window.speechSynthesis), and actively avoids anything flagged
// as male — used by every read-aloud feature in the app (lecture bodies,
// activity instructions, flashcards, hotspots, and the "meet your teacher"
// intro) so they all speak with one consistent voice.
//
// Caveat: the browser only exposes whatever voices the user's OS/browser
// ships with, and most platforms don't label voices with a proper male/
// female field — just a name. This uses a name-hint heuristic, which
// covers the voices bundled with Chrome, Edge, Safari and most mobile
// OSes, but an unusual or third-party voice pack could still slip through
// unrecognized. There's no way to guarantee a specific voice or gender
// with 100% certainty across every browser without a paid TTS API.

const FEMALE_NAME_HINTS = [
  'female', 'woman',
  'samantha', 'victoria', 'karen', 'moira', 'tessa', 'susan', 'zira',
  'salli', 'joanna', 'kimberly', 'kendra', 'ivy', 'ava', 'allison',
  'emma', 'amelia', 'aria', 'jenny', 'michelle', 'linda', 'heather',
  'fiona', 'catherine', 'serena', 'nicky', 'sandy', 'shelley', 'flo',
  'google us english', // Chrome's built-in default is a female voice
]

const MALE_NAME_HINTS = [
  'male', 'man', 'david', 'mark', 'daniel', 'alex', 'fred', 'james',
  'george', 'thomas', 'oliver', 'aaron', 'arthur', 'eric', 'gordon',
  'guy', 'ryan', 'brian', 'justin', 'kevin', 'matthew', 'rishi',
]

let cachedVoices = []

function refreshVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return []
  cachedVoices = window.speechSynthesis.getVoices() || []
  return cachedVoices
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  refreshVoices()
  // Chrome (and some others) load the voice list asynchronously — it's
  // often empty on the very first call, and only populated once this
  // fires.
  window.speechSynthesis.onvoiceschanged = refreshVoices
}

function scoreVoice(voice) {
  const name = voice.name.toLowerCase()
  let score = 0
  if (MALE_NAME_HINTS.some((hint) => name.includes(hint))) score -= 100
  if (FEMALE_NAME_HINTS.some((hint) => name.includes(hint))) score += 50
  if (voice.lang?.toLowerCase().startsWith('en')) score += 10
  if (voice.localService) score += 2 // offline voices are more reliable than network ones
  return score
}

export function isSpeechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function getCalmFemaleVoice() {
  const voices = cachedVoices.length ? cachedVoices : refreshVoices()
  if (voices.length === 0) return null
  return [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0]
}

// Builds a ready-to-speak utterance with the calm female voice, a touch
// slower than default rate, applied.
export function createCalmUtterance(text) {
  const utterance = new SpeechSynthesisUtterance(text)
  const voice = getCalmFemaleVoice()
  if (voice) utterance.voice = voice
  utterance.rate = 0.92
  utterance.pitch = 1.0
  return utterance
}
