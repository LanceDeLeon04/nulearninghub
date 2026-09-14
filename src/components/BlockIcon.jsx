import { BookOpenText, ClipboardCheck, Shuffle } from 'lucide-react'

const ICONS = {
  lecture: BookOpenText,
  activity: ClipboardCheck,
  interactive: Shuffle,
}

export default function BlockIcon({ type, size = 15, ...props }) {
  const Icon = ICONS[type] ?? BookOpenText
  return <Icon size={size} {...props} />
}
