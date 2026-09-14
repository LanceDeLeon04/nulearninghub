import confetti from 'canvas-confetti'
import { haptic } from './haptics'

const NU_COLORS = ['#2b3990', '#ffc72c', '#5865c7', '#ffffff']

// A cheerful little burst used whenever a student finishes/submits
// something worth celebrating. Kept short and light so it never blocks
// the UI or feels gimmicky on repeat use.
export function celebrate({ big = false } = {}) {
  haptic('celebrate')

  const base = {
    colors: NU_COLORS,
    disableForReducedMotion: true,
  }

  confetti({
    ...base,
    particleCount: big ? 90 : 50,
    spread: big ? 100 : 70,
    startVelocity: big ? 45 : 35,
    origin: { y: 0.65 },
  })

  if (big) {
    setTimeout(() => {
      confetti({ ...base, particleCount: 60, angle: 60, spread: 55, origin: { x: 0 } })
      confetti({ ...base, particleCount: 60, angle: 120, spread: 55, origin: { x: 1 } })
    }, 180)
  }
}

export function fizzle() {
  haptic('warning')
}

export default celebrate
