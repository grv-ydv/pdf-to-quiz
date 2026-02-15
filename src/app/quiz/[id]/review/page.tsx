'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Quiz, Question } from '@/types';
import { ArrowLeft, Check, Edit3, Loader2 } from 'lucide-react';

export default function ReviewQuestionsPage() {
    const router = useRouter();
    const params = useParams();
    const quizId = params.id as string;

    const [quiz, setQuiz] = useState<Quiz | null>(null);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [editing, setEditing] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            // Load quiz
            const { data: quizData, error: quizError } = await supabase
                .from('quizzes')
                .select('*')
                .eq('id', quizId)
                .single();

            if (quizError || !quizData) { router.push('/dashboard'); return; }

            setQuiz({
                id: quizData.id,
                userId: quizData.user_id,
                title: quizData.title,
                pdfUrl: quizData.pdf_url,
                answerKeyUrl: quizData.answer_key_url,
                timerMinutes: quizData.timer_minutes,
                status: quizData.status,
                totalQuestions: quizData.total_questions,
                createdAt: new Date(quizData.created_at),
            });

            // Load questions
            const { data: qData } = await supabase
                .from('questions')
                .select('*')
                .eq('quiz_id', quizId)
                .order('question_number', { ascending: true });

            if (qData) {
                setQuestions(qData.map(q => ({
                    id: q.id,
                    quizId: q.quiz_id,
                    questionNumber: q.question_number,
                    questionText: q.question_text,
                    options: q.options || { A: '', B: '', C: '', D: '' },
                    correctOption: q.correct_option,
                })));
            }
            setLoading(false);
        }
        load();
    }, [quizId, router]);

    function updateQuestion(id: string, field: string, value: string) {
        setQuestions(prev => prev.map(q => {
            if (q.id !== id) return q;
            if (field.startsWith('options.')) {
                const key = field.split('.')[1];
                return { ...q, options: { ...q.options, [key]: value } };
            }
            return { ...q, [field]: value };
        }));
    }

    async function handleConfirm() {
        setSaving(true);
        try {
            // Update each question
            for (const q of questions) {
                await supabase
                    .from('questions')
                    .update({
                        question_text: q.questionText,
                        options: q.options,
                    })
                    .eq('id', q.id);
            }

            // Update quiz status
            await supabase
                .from('quizzes')
                .update({
                    status: 'active',
                    total_questions: questions.length,
                })
                .eq('id', quizId);

            router.push(`/quiz/${quizId}/attempt`);
        } catch (err) {
            console.error(err);
        }
        setSaving(false);
    }

    if (loading) return (
        <div className="page-center"><p style={{ color: 'var(--text-muted)' }}>Loading questions...</p></div>
    );

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
            <div className="navbar">
                <button className="btn btn-ghost btn-sm" onClick={() => router.push('/dashboard')}>
                    <ArrowLeft size={16} /> Back
                </button>
                <span className="nav-logo">Review Questions</span>
                <button className="btn btn-primary btn-sm" onClick={handleConfirm} disabled={saving}>
                    {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
                    Confirm & Start
                </button>
            </div>

            <div className="container" style={{ maxWidth: '750px', paddingTop: '32px', paddingBottom: '40px' }}>
                <div style={{ marginBottom: '24px' }}>
                    <h1 style={{ fontSize: '22px', fontWeight: 700 }}>{quiz?.title}</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
                        Review the AI-parsed questions below. Click any text to edit.
                    </p>
                </div>

                {questions.length === 0 ? (
                    <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
                        <p style={{ color: 'var(--text-muted)' }}>No questions parsed. The PDF may still be processing.</p>
                        <button className="btn btn-secondary" style={{ marginTop: '16px' }} onClick={() => router.push(`/quiz/${quizId}/attempt`)}>
                            Skip to quiz (bubble-only mode)
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {questions.map(q => (
                            <div key={q.id} className="card fade-in" style={{ padding: '18px' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                    <span style={{
                                        fontWeight: 700, fontSize: '14px', color: 'var(--accent)',
                                        minWidth: '30px', paddingTop: '2px',
                                    }}>
                                        Q{q.questionNumber}
                                    </span>
                                    <div style={{ flex: 1 }}>
                                        {/* Question Text */}
                                        {editing === `${q.id}-text` ? (
                                            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                                <textarea className="input" rows={2} value={q.questionText}
                                                    onChange={e => updateQuestion(q.id, 'questionText', e.target.value)}
                                                    autoFocus onBlur={() => setEditing(null)}
                                                    style={{ fontSize: '14px', resize: 'vertical' }} />
                                            </div>
                                        ) : (
                                            <p style={{
                                                fontSize: '14px', lineHeight: 1.5, marginBottom: '12px', cursor: 'pointer',
                                                padding: '4px', borderRadius: '4px',
                                            }}
                                                onClick={() => setEditing(`${q.id}-text`)}
                                                title="Click to edit"
                                            >
                                                {q.questionText}
                                                <Edit3 size={12} color="var(--text-muted)" style={{ marginLeft: '6px', verticalAlign: 'middle' }} />
                                            </p>
                                        )}

                                        {/* Options */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                            {(['A', 'B', 'C', 'D'] as const).map(opt => (
                                                editing === `${q.id}-${opt}` ? (
                                                    <input key={opt} className="input" value={q.options[opt]}
                                                        onChange={e => updateQuestion(q.id, `options.${opt}`, e.target.value)}
                                                        autoFocus onBlur={() => setEditing(null)}
                                                        style={{ fontSize: '13px' }} />
                                                ) : (
                                                    <span key={opt} style={{
                                                        fontSize: '13px', color: 'var(--text-secondary)',
                                                        padding: '6px 10px', borderRadius: '6px',
                                                        background: 'var(--bg-elevated)', cursor: 'pointer',
                                                    }}
                                                        onClick={() => setEditing(`${q.id}-${opt}`)}
                                                    >
                                                        <strong>({opt})</strong> {q.options[opt] || '—'}
                                                    </span>
                                                )
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
