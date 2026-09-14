// Tiny wrapper around the Vibration API so interactions feel tactile on
// devices that support it (mostly Android/mobile browsers). It's a total
// no-op everywhere else, so it's safe to sprinkle on any interaction.

const PATTERNS = {
  tap: 8,
  light: 10,
  select: 15,
  success: [12, 40, 18],
  warning: [10, 30, 10, 30, 10],
  error: [30, 60, 30],
  celebrate: [15, 30, 15, 30, 15, 30, 40],
}

export function haptic(pattern = 'tap') {
  if (typeof window === 'undefined') return
  if (!('vibrate' in navigator)) return
  try {
    navigator.vibrate(PATTERNS[pattern] ?? pattern)
  } catch {
    // Ignore — some browsers throw if called outside a user gesture.
  }
}

export default haptic
