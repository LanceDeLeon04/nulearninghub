import { Link } from 'react-router-dom'
import Navbar from '../../components/Navbar'
import LectureView from '../../components/blocks/LectureView'
import { ArrowLeft, GraduationCap } from 'lucide-react'

// Static, permanent reference for teachers — not stored in module_content,
// so it isn't tied to any module, assignment, or sequence_order and can't
// be accidentally reordered, deleted, or lost when a module is edited.
// Reuses LectureView in read-only mode purely for consistent styling
// (read-aloud, typography) — nothing here is saved or tracked as progress.
const GUIDE_BODY = `TEACHER'S GUIDE

Overview: This teacher's guide supports the implementation of the supplementary material designed to enhance communicative competence among Filipino L2 college freshmen. It outlines instructional strategies, tips for facilitation, suggested pacing, and tools for feedback.

Learning Delivery Tips
- Use each module as a weekly focus across a 4-week span.
- Facilitate discussions before each activity using the mini-lessons.
- Allow students to access modules asynchronously but require participation in feedback tasks or video reflection.
- Convert self-check quizzes into auto-graded assessments (already done for you in this platform).

Suggested Timeline
- Week 1: Module 1 – Linguistic Competence
- Week 2: Module 2 – Sociolinguistic Competence
- Week 3: Module 3 – Discourse Competence
- Week 4: Module 4 – Strategic Competence

Suggested Grouping of Learners
- Small peer groups for collaborative dialogue and reconstruction tasks
- Individual for writing, quizzes, and reflection tasks

Facilitator's Role
- Guide discussions around sociolinguistic and discourse norms
- Encourage approximation and reformulation without judgment
- Monitor use of cohesive devices and unity in output tasks`

export default function TeachersGuide() {
  return (
    <div>
      <Navbar />
      <main className="page">
        <div className="page-header">
          <h1><GraduationCap size={22} /> Teacher's Guide</h1>
          <Link className="btn" to="/teacher/modules"><ArrowLeft size={15} /> Back to Modules</Link>
        </div>
        <p className="subtitle">A permanent reference — always available here, independent of any single module.</p>

        <div className="module-card" style={{ marginTop: '1rem' }}>
          <LectureView data={{ body: GUIDE_BODY, readAloudEnabled: true }} progress={null} onComplete={() => {}} readOnly />
        </div>
      </main>
    </div>
  )
}
