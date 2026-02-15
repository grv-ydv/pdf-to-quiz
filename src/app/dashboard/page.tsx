'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Quiz } from '@/types';
import { Plus, FileText, Clock, CheckCircle, LogOut, ChevronRight } from 'lucide-react';

export default function DashboardPage() {
    const { user, profile, loading, logout } = useAuth();
    const router = useRouter();
    const [quizzes, setQuizzes] = useState<Quiz[]>([]);
    const [fetching, setFetching] = useState(true);

    useEffect(() => {
        if (!loading && !user) router.replace('/login');
        if (!loading && user && profile && !profile.profileCompleted) router.replace('/setup-profile');
    }, [user, profile, loading, router]);

    useEffect(() => {
        async function fetchQuizzes() {
            if (!user) return;
            const { data, error } = await supabase
                .from('quizzes')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (data && !error) {
                setQuizzes(data.map(q => ({
                    id: q.id,
                    userId: q.user_id,
                    title: q.title,
                    pdfUrl: q.pdf_url,
                    answerKeyUrl: q.answer_key_url,
                    timerMinutes: q.timer_minutes,
                    status: q.status,
                    totalQuestions: q.total_questions,
                    createdAt: new Date(q.created_at),
                })));
            }
            setFetching(false);
        }
        if (user) fetchQuizzes();
    }, [user]);

    if (loading || !user) return null;

    const statusColors: Record<string, { bg: string; text: string; label: string }> = {
        draft: { bg: 'var(--bg-elevated)', text: 'var(--text-secondary)', label: 'Draft' },
        parsing: { bg: 'var(--warning-light)', text: '#b45309', label: 'Parsing...' },
        review: { bg: 'var(--accent-light)', text: 'var(--accent)', label: 'Review' },
        active: { bg: 'var(--accent-light)', text: 'var(--accent)', label: 'Active' },
        completed: { bg: 'var(--success-light)', text: 'var(--success)', label: 'Completed' },
    };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
            {/* Navbar */}
            <div className="navbar">
                <span className="nav-logo">📝 PDF Quiz</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                        {profile?.displayName || user.email}
                    </span>
                    <button className="btn btn-ghost btn-sm" onClick={() => { logout(); router.push('/login'); }}>
                        <LogOut size={16} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="container" style={{ paddingTop: '40px', paddingBottom: '40px' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                    <div>
                        <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.5px' }}>My Quizzes</h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
                            {quizzes.length === 0 ? 'No quizzes yet — create your first one!' : `${quizzes.length} quiz${quizzes.length > 1 ? 'zes' : ''}`}
                        </p>
                    </div>
                    <button className="btn btn-primary" onClick={() => router.push('/new-quiz')}>
                        <Plus size={18} /> New Quiz
                    </button>
                </div>

                {/* Quiz Grid */}
                {fetching ? (
                    <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--text-muted)' }}>Loading...</div>
                ) : quizzes.length === 0 ? (
                    <div className="fade-in" style={{
                        textAlign: 'center', padding: '80px 20px',
                        border: '2px dashed var(--border)', borderRadius: 'var(--radius-lg)',
                        background: 'var(--bg-secondary)',
                    }}>
                        <FileText size={48} color="var(--text-muted)" style={{ marginBottom: '16px' }} />
                        <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>No quizzes yet</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px' }}>
                            Upload a question paper PDF to get started
                        </p>
                        <button className="btn btn-primary" onClick={() => router.push('/new-quiz')}>
                            <Plus size={18} /> Create your first quiz
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                        {quizzes.map(quiz => {
                            const status = statusColors[quiz.status] || statusColors.draft;
                            return (
                                <div key={quiz.id} className="card fade-in"
                                    style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '12px' }}
                                    onClick={() => {
                                        if (quiz.status === 'review') router.push(`/quiz/${quiz.id}/review`);
                                        else if (quiz.status === 'active') router.push(`/quiz/${quiz.id}/attempt`);
                                        else if (quiz.status === 'completed') router.push(`/quiz/${quiz.id}/results`);
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ flex: 1 }}>
                                            <h3 style={{ fontSize: '16px', fontWeight: 600, lineHeight: 1.3 }}>{quiz.title}</h3>
                                            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                                                {quiz.totalQuestions > 0 ? `${quiz.totalQuestions} questions` : 'Processing...'}
                                            </p>
                                        </div>
                                        <span style={{
                                            padding: '4px 10px', borderRadius: 'var(--radius-full)',
                                            fontSize: '12px', fontWeight: 500,
                                            background: status.bg, color: status.text,
                                        }}>
                                            {status.label}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Clock size={14} /> {quiz.timerMinutes}m
                                            </span>
                                            {quiz.answerKeyUrl && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <CheckCircle size={14} /> Key uploaded
                                                </span>
                                            )}
                                        </div>
                                        <ChevronRight size={16} color="var(--text-muted)" />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
