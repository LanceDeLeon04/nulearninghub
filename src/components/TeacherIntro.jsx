import { useState } from 'react'
import { ChevronRight, PartyPopper } from 'lucide-react'
import { haptic } from '../lib/haptics'
import { celebrate } from '../lib/confetti'

// A short, skippable "visual novel" style welcome from the teacher, shown
// before a student dives into the Preliminaries module. Purely front-end —
// nothing is persisted here; the caller decides whether/when to show it
// and remembers that choice (e.g. via localStorage).
export default function TeacherIntro({
  teacherName = 'Your Teacher',
  emoji = '🧑‍🏫',
  lines,
  onFinish,
}) {
  const dialogue = lines && lines.length > 0 ? lines : [
    "Hello, class! Welcome to our learning hub.",
    "This first module — Preliminaries — will walk you through the basics before we get into the real content.",
    "Take your time, explore each block, and don't worry about getting everything perfect on the first try. Let's begin!",
  ]

  const [step, setStep] = useState(0)
  const isLast = step === dialogue.length - 1

  function next() {
    if (isLast) {
      haptic('celebrate')
      celebrate()
      onFinish?.()
      return
    }
    haptic('tap')
    setStep((s) => s + 1)
  }

  function skip() {
    haptic('tap')
    onFinish?.()
  }

  return (
    <div className="teacher-intro-backdrop" role="dialog" aria-modal="true" aria-label={`Introduction from ${teacherName}`}>
      <div className="teacher-intro-stage">
        <button type="button" className="teacher-intro-skip" onClick={skip}>Skip intro</button>

        <div className="teacher-intro-bubble">
          <div>
            <div className="teacher-intro-eyebrow">👋 A quick word before you start</div>
            <p className="teacher-intro-line" key={step}>{dialogue[step]}</p>
          </div>
          <div className="teacher-intro-name">— {teacherName}</div>

          <div className="teacher-intro-controls">
            <div className="teacher-intro-dots">
              {dialogue.map((_, i) => (
                <span key={i} className={`teacher-intro-dot${i === step ? ' teacher-intro-dot-active' : ''}`} />
              ))}
            </div>
            <button type="button" className="teacher-intro-next-btn" onClick={next}>
              {isLast ? <>Let's start <PartyPopper size={16} /></> : <>Next <ChevronRight size={16} /></>}
            </button>
          </div>
        </div>

        <div className="teacher-intro-portrait">
          <div className="teacher-intro-portrait-circle" aria-hidden="true">{emoji}</div>
        </div>
      </div>
    </div>
  )
}
