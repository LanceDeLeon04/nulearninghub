import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Square, Volume2 } from 'lucide-react'
import { haptic } from '../lib/haptics'
import { createCalmUtterance } from '../lib/voice'

// Play / Pause / Stop controls that read the given text aloud using the
// browser's built-in speech synthesis. No external service or API key
// needed — works offline in any modern browser.
export default function ReadAloud({ text }) {
  const [state, setState] = useState('idle') // idle | speaking | paused
  const [supported, setSupported] = useState(true)
  const utteranceRef = useRef(null)

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window)
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  // Stop playback if the underlying text changes (e.g. navigating blocks).
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
    }
  }, [text])

  function handlePlay() {
    haptic('tap')
    if (!supported || !text) return
    const synth = window.speechSynthesis

    if (state === 'paused') {
      synth.resume()
      setState('speaking')
      return
    }

    synth.cancel()
    const utterance = createCalmUtterance(text)
    utterance.onend = () => setState('idle')
    utterance.onerror = () => setState('idle')
    utteranceRef.current = utterance
    synth.speak(utterance)
    setState('speaking')
  }

  function handlePause() {
    if (!supported) return
    window.speechSynthesis.pause()
    setState('paused')
  }

  function handleStop() {
    if (!supported) return
    window.speechSynthesis.cancel()
    setState('idle')
  }

  if (!supported) {
    return <p className="muted small">Read-aloud isn't supported in this browser.</p>
  }

  return (
    <div className="read-aloud">
      {state !== 'speaking' && (
        <button type="button" className="btn" onClick={handlePlay}>
          {state === 'paused' ? <><Play size={14} /> Resume</> : <><Volume2 size={14} /> Read Aloud</>}
        </button>
      )}
      {state === 'speaking' && (
        <button type="button" className="btn" onClick={() => { haptic('tap'); handlePause() }}><Pause size={14} /> Pause</button>
      )}
      {state !== 'idle' && (
        <button type="button" className="btn btn-reject" onClick={() => { haptic('tap'); handleStop() }}><Square size={13} /> Stop</button>
      )}
    </div>
  )
}
