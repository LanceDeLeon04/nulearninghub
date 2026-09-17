// Minimal inline formatting for activity prompts and instructions.
//
// Several activities in the course material refer to "the underlined word"
// or "the bolded word" — which only works if the word is actually marked.
// Plain text can't carry that, so prompts mark it inline:
//
//   __underlined__   ->  <u>
//   **bold**         ->  <strong>
//
// Deliberately tiny: no links, no nesting, no HTML passthrough. Anything it
// doesn't recognise is rendered as literal text, so a stray asterisk in a
// prompt is harmless rather than a parse error.

const TOKEN = /(\*\*[\s\S]+?\*\*|__[\s\S]+?__)/g

export default function RichText({ text = '', as: Tag = 'span', className }) {
  const parts = String(text).split(TOKEN).filter((p) => p !== '')
  return (
    <Tag className={className}>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>
        }
        if (part.startsWith('__') && part.endsWith('__')) {
          return <u key={i} className="prompt-underline">{part.slice(2, -2)}</u>
        }
        return <span key={i}>{part}</span>
      })}
    </Tag>
  )
}

// The same text with the markers stripped — for read-aloud, which should
// not say "underscore underscore".
export function plainText(text = '') {
  return String(text).replace(/\*\*|__/g, '')
}
