import Navbar from '../components/Navbar'
import LectureView from '../components/blocks/LectureView'
import { BookMarked, AlertTriangle } from 'lucide-react'

// Static, permanent page — not stored in module_content, so it isn't tied
// to any module/assignment. Reached via a "References & Rubric" button on
// each role's Modules page (Modules.jsx / MyModules.jsx / ModuleApproval.jsx)
// rather than a top-nav tab, but the route stays open to every signed-in role.

const RUBRIC_BODY = `ASSESSMENT RUBRIC — For Performance-Based Tasks
Use this rubric to evaluate dialogue building tasks, paragraph and reflection writing, and approximation/reconstruction exercises.

Language Appropriateness
- Excellent (4): Uses highly context-appropriate expressions throughout
- Good (3): Generally uses appropriate expressions
- Satisfactory (2): Some errors in appropriateness
- Needs Improvement (1): Many expressions are not context-appropriate

Task Completion
- Excellent (4): All elements fully addressed and complete
- Good (3): Most elements complete
- Satisfactory (2): Some parts missing
- Needs Improvement (1): Incomplete response

Accuracy and Clarity
- Excellent (4): Sentences are accurate and ideas clearly expressed
- Good (3): Minor errors but meaning is clear
- Satisfactory (2): Errors affect clarity in some parts
- Needs Improvement (1): Errors significantly affect clarity

Use of Strategy (Approximation/Reconstruction)
- Excellent (4): Skillfully applies strategy (e.g., rephrasing, approximation)
- Good (3): Applies strategy with some effectiveness
- Satisfactory (2): Attempts but lacks fluency
- Needs Improvement (1): Rare or no use of strategy

Coherence and Organization
- Excellent (4): Well-organized, logical flow of ideas
- Good (3): Mostly organized, minor issues in flow
- Satisfactory (2): Inconsistent organization
- Needs Improvement (1): Disorganized or lacks logical flow`

// No reference list ever existed in the original source material — the
// old Table of Contents just had a "References" heading with nothing
// underneath it. Leaving this as an honest placeholder rather than
// inventing citations.
const REFERENCES_BODY = `A reference list has not been added yet.

Once you have the source citations, replace this placeholder with the full reference list.`

export default function ResourcesHub() {
  return (
    <div>
      <Navbar />
      <main className="page">
        <div className="page-header">
          <h1><BookMarked size={22} /> References & Rubric</h1>
        </div>
        <p className="subtitle">A permanent reference — always available here, independent of any single module.</p>

        <div className="module-card" style={{ marginTop: '1rem' }}>
          <h3>Assessment Rubric</h3>
          <LectureView data={{ body: RUBRIC_BODY, readAloudEnabled: true }} progress={null} onComplete={() => {}} readOnly />
        </div>

        <div className="module-card" style={{ marginTop: '1rem' }}>
          <h3>References</h3>
          <div className="info-banner">
            <AlertTriangle size={15} /> Placeholder — no source citations were included in the original material.
          </div>
          <LectureView data={{ body: REFERENCES_BODY, readAloudEnabled: false }} progress={null} onComplete={() => {}} readOnly />
        </div>
      </main>
    </div>
  )
}
