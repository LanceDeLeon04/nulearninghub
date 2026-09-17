import { useEffect, useState } from 'react'
import { ChevronRight, PartyPopper, Volume2, VolumeX } from 'lucide-react'
import { haptic } from '../lib/haptics'
import { celebrate } from '../lib/confetti'
import { createCalmUtterance, isSpeechSupported } from '../lib/voice'

const MUTE_KEY = 'lh_teacher_intro_muted'

// A short, skippable "visual novel" style welcome from the teacher, shown
// before a student dives into the Preliminaries module. Purely front-end —
// nothing is persisted here; the caller decides whether/when to show it
// and remembers that choice (e.g. via localStorage).
export default function TeacherIntro({
  teacherName = 'Your Teacher',
  emoji = '🧑‍🏫',
  portraitSrc = null,
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
  const speechSupported = isSpeechSupported()
  const [muted, setMuted] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(MUTE_KEY) === '1'
  })

  // Auto-read each line aloud, in a calm female voice, as it appears — this
  // is the whole point of the intro being narrated rather than just read.
  // Re-runs whenever the line changes or the student (un)mutes.
  useEffect(() => {
    if (!speechSupported || muted) return
    const synth = window.speechSynthesis
    synth.cancel()
    synth.speak(createCalmUtterance(dialogue[step]))
    return () => synth.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, muted])

  function stopSpeaking() {
    if (speechSupported) window.speechSynthesis.cancel()
  }

  function toggleMute() {
    haptic('tap')
    setMuted((m) => {
      const nextMuted = !m
      if (typeof window !== 'undefined') localStorage.setItem(MUTE_KEY, nextMuted ? '1' : '0')
      if (nextMuted) stopSpeaking()
      return nextMuted
    })
  }

  function next() {
    if (isLast) {
      haptic('celebrate')
      celebrate()
      stopSpeaking()
      onFinish?.()
      return
    }
    haptic('tap')
    setStep((s) => s + 1)
  }

  function skip() {
    haptic('tap')
    stopSpeaking()
    onFinish?.()
  }

  return (
    <div className="teacher-intro-backdrop" role="dialog" aria-modal="true" aria-label={`Introduction from ${teacherName}`}>
      <div className="teacher-intro-stage">
        <div className="teacher-intro-topbar">
          {speechSupported && (
            <button
              type="button"
              className="teacher-intro-mute"
              onClick={toggleMute}
              aria-label={muted ? 'Turn narration on' : 'Turn narration off'}
              title={muted ? 'Turn narration on' : 'Turn narration off'}
            >
              {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
          )}
          <button type="button" className="teacher-intro-skip" onClick={skip}>Skip intro</button>
        </div>

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
          <div className="teacher-intro-portrait-circle" aria-hidden="true">
            {portraitSrc
              ? <img src={portraitSrc} alt="" className="teacher-intro-portrait-img" />
              : emoji}
          </div>
        </div>
      </div>
    </div>
  )
}
