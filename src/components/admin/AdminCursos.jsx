import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import AvancesLista from '../common/AvancesLista';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

export default function AdminCursos() {
  const [allProgress, setAllProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedGrade, setSelectedGrade] = useState(null);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    api.get('/daily-progress').then(data => {
      setAllProgress(data);
      setLoading(false);
    }).catch(console.error);
  }, []);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(() => load(true));

  if (loading) return <div className="loading">Cargando...</div>;

  const numSort = (a, b) => {
    const n = s => parseInt((s || '').match(/\d+/) || 0);
    return n(a) - n(b) || a.localeCompare(b, 'es');
  };

  // View 3: avances for course + grade
  if (selectedCourse && selectedGrade) {
    const avances = allProgress.filter(p =>
      p.course_id === selectedCourse.course_id && p.grade_level_id === selectedGrade.grade_level_id
    );
    const gradeName = selectedGrade.grade_name + (selectedGrade.section ? ` "${selectedGrade.section}"` : '');
    return (
      <div>
        <div className="page-header" style={{ background: `linear-gradient(135deg, ${selectedCourse.color}, ${selectedCourse.color}cc)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div onClick={() => setSelectedGrade(null)} style={{ cursor: 'pointer', opacity: 0.8, color: 'white' }}>←</div>
            <div>
              <h1 style={{ color: 'white' }}>{gradeName}</h1>
              <p style={{ color: 'rgba(255,255,255,0.8)' }}>{selectedCourse.course_name}</p>
            </div>
          </div>
        </div>
        <div className="content-area">
          <AvancesLista avances={avances} />
        </div>
      </div>
    );
  }

  // View 2: grades within selected course
  if (selectedCourse) {
    const courseProgress = allProgress.filter(p => p.course_id === selectedCourse.course_id);
    const gradeMap = {};
    courseProgress.forEach(p => {
      const k = p.grade_level_id;
      if (!gradeMap[k]) gradeMap[k] = { grade_level_id: k, grade_name: p.grade_name || '—', section: p.section, count: 0 };
      gradeMap[k].count++;
    });
    const gradeList = Object.values(gradeMap).sort((a, b) => numSort(a.grade_name, b.grade_name));
    const color = selectedCourse.color;

    return (
      <div>
        <div className="page-header" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div onClick={() => setSelectedCourse(null)} style={{ cursor: 'pointer', opacity: 0.8, color: 'white' }}>←</div>
            <div>
              <h1 style={{ color: 'white' }}>{selectedCourse.course_name}</h1>
              <p style={{ color: 'rgba(255,255,255,0.8)' }}>{gradeList.length} grado{gradeList.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
        <div className="content-area">
          {gradeList.length === 0 && <div className="empty-state"><p>Sin avances registrados</p></div>}
          {gradeList.map(g => {
            const gradeName = g.grade_name + (g.section ? ` "${g.section}"` : '');
            return (
              <div key={g.grade_level_id} className="card" style={{ marginBottom: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px' }}
                onClick={() => setSelectedGrade(g)}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{gradeName}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{g.count} avance{g.count !== 1 ? 's' : ''}</p>
                </div>
                <span style={{ fontSize: 18, color: 'var(--text-muted)' }}>›</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // View 1: courses grid (2 per row)
  const courseMap = {};
  allProgress.forEach(p => {
    if (!courseMap[p.course_id]) courseMap[p.course_id] = { course_id: p.course_id, course_name: p.course_name, color: p.color, count: 0 };
    courseMap[p.course_id].count++;
  });
  const courseList = Object.values(courseMap).sort((a, b) => a.course_name.localeCompare(b.course_name, 'es'));

  return (
    <div>
      <div className="page-header">
        <h1>Avances por Curso</h1>
        <p>Vista de avances registrados por los docentes</p>
      </div>
      <div className="content-area">
        {courseList.length === 0 && <div className="empty-state"><p>Sin avances registrados</p></div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {courseList.map(c => (
            <div key={c.course_id} className="card" style={{ cursor: 'pointer', borderTop: `4px solid ${c.color}`, padding: '14px 14px 12px' }}
              onClick={() => setSelectedCourse(c)}>
              <p style={{ fontSize: 15, fontWeight: 700, color: c.color, marginBottom: 4 }}>{c.course_name}</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.count} avance{c.count !== 1 ? 's' : ''}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
