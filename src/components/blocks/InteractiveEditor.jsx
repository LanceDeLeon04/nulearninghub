import { INTERACTIVE_SUBTYPES, defaultInteractiveData } from '../../lib/blockTypes'
import FlashcardsEditor from './FlashcardsEditor'
import HotspotsEditor from './HotspotsEditor'

const SUBTYPE_EDITORS = {
  flashcards: FlashcardsEditor,
  hotspots: HotspotsEditor,
}

// Interactive is the most open-ended block type — this component just
// routes to the right sub-editor by `data.subtype`. Add a new subtype by
// adding it to INTERACTIVE_SUBTYPES / defaultInteractiveData in
// lib/blockTypes.js and registering its editor + view here.
export default function InteractiveEditor({ data, onChange, context }) {
  const subtype = data.subtype ?? 'flashcards'
  const SubEditor = SUBTYPE_EDITORS[subtype]

  return (
    <div className="block-editor">
      <label>
        Interactive Type
        <select value={subtype} onChange={(e) => onChange(defaultInteractiveData(e.target.value))}>
          {INTERACTIVE_SUBTYPES.map((s) => (
            <option key={s.subtype} value={s.subtype}>{s.label}</option>
          ))}
        </select>
      </label>
      {SubEditor && <SubEditor data={data} onChange={onChange} context={context} />}
    </div>
  )
}
