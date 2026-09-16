// A tiny circular progress ring used to make module/badge completion feel
// more tactile than a plain bar. Purely presentational — pass 0-100.
export default function RingProgress({ percent = 0, size = 54, stroke = 6, label }) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference

  return (
    <span
      className="ring-progress"
      style={{ width: size, height: size, '--ring-total': circumference, '--ring-offset': offset }}
    >
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffc72c" />
            <stop offset="100%" stopColor="#2b3990" />
          </linearGradient>
        </defs>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
        <circle
          className="ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="ring-progress-label" style={{ fontSize: size * 0.28 }}>
        {label ?? `${Math.round(percent)}%`}
      </span>
    </span>
  )
}
