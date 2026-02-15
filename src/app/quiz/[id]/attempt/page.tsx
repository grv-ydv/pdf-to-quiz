'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Quiz, Question, OptionKey } from '@/types';
import { Clock, AlertTriangle, ChevronLeft, ChevronRight, Send, Bookmark, SkipForward, Eraser } from 'lucide-react';

type QuestionStatus = 'not-visited' | 'not-answered' | 'answered' | 'review';

export default function QuizAttemptPage() {
    const { user } = useAuth();
    const router = useRouter();
    const params = useParams();
    const quizId = params.id as string;

    const [quiz, setQuiz] = useState<Quiz | null>(null);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [answers, setAnswers] = useState<Record<number, OptionKey>>({});
    const [currentQ, setCurrentQ] = useState(0); // index into questions[]
    const [visited, setVisited] = useState<Set<number>>(new Set([0]));
    const [markedForReview, setMarkedForReview] = useState<Set<number>>(new Set());
    const [timeLeft, setTimeLeft] = useState(0);
    const [submitted, setSubmitted] = useState(false);
    const [loading, setLoading] = useState(true);

    // Fetch quiz and questions
    useEffect(() => {
        async function load() {
            if (!quizId) return;

            const { data: quizData, error: quizError } = await supabase
                .from('quizzes')
                .select('*')
                .eq('id', quizId)
                .single();

            if (quizError || !quizData) { router.push('/dashboard'); return; }

            const mappedQuiz: Quiz = {
                id: quizData.id,
                userId: quizData.user_id,
                title: quizData.title,
                pdfUrl: quizData.pdf_url,
                answerKeyUrl: quizData.answer_key_url,
                timerMinutes: quizData.timer_minutes,
                status: quizData.status,
                totalQuestions: quizData.total_questions,
                createdAt: new Date(quizData.created_at),
            };
            setQuiz(mappedQuiz);
            setTimeLeft(mappedQuiz.timerMinutes * 60);

            const { data: qData } = await supabase
                .from('questions')
                .select('*')
                .eq('quiz_id', quizId)
                .order('question_number', { ascending: true });

            if (qData && qData.length > 0) {
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

    // Countdown timer
    useEffect(() => {
        if (timeLeft <= 0 || submitted || loading) return;
        const interval = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) { handleSubmit(); return 0; }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, [timeLeft, submitted, loading]);

    const handleSubmit = useCallback(async () => {
        if (submitted || !user || !quiz) return;
        setSubmitted(true);

        const { data: attemptData } = await supabase
            .from('attempts')
            .insert({
                quiz_id: quizId,
                user_id: user.id,
                answers,
                score: null,
                total_questions: questions.length || 50,
                is_graded: false,
            })
            .select()
            .single();

        await supabase
            .from('quizzes')
            .update({ status: 'completed' })
            .eq('id', quizId);

        if (attemptData) {
            router.push(`/quiz/${quizId}/results?attemptId=${attemptData.id}`);
        } else {
            router.push(`/quiz/${quizId}/results`);
        }
    }, [submitted, user, quiz, quizId, answers, questions, router]);

    // ─── Navigation Helpers ───
    function goToQuestion(index: number) {
        if (index < 0 || index >= questions.length) return;
        setCurrentQ(index);
        setVisited(prev => new Set(prev).add(index));
    }

    function selectAnswer(qNum: number, option: OptionKey) {
        if (submitted) return;
        setAnswers(prev => ({
            ...prev,
            [qNum]: prev[qNum] === option ? undefined as unknown as OptionKey : option,
        }));
    }

    function saveAndNext() {
        if (currentQ < questions.length - 1) {
            goToQuestion(currentQ + 1);
        }
    }

    function saveAndMarkForReview() {
        setMarkedForReview(prev => new Set(prev).add(currentQ));
        if (currentQ < questions.length - 1) {
            goToQuestion(currentQ + 1);
        }
    }

    function markForReviewAndNext() {
        setMarkedForReview(prev => new Set(prev).add(currentQ));
        // Clear the answer for this question
        const qNum = questions[currentQ]?.questionNumber;
        if (qNum) {
            setAnswers(prev => {
                const next = { ...prev };
                delete next[qNum];
                return next;
            });
        }
        if (currentQ < questions.length - 1) {
            goToQuestion(currentQ + 1);
        }
    }

    function clearResponse() {
        const qNum = questions[currentQ]?.questionNumber;
        if (qNum) {
            setAnswers(prev => {
                const next = { ...prev };
                delete next[qNum];
                return next;
            });
        }
        setMarkedForReview(prev => {
            const next = new Set(prev);
            next.delete(currentQ);
            return next;
        });
    }

    function getQuestionStatus(index: number): QuestionStatus {
        if (markedForReview.has(index)) return 'review';
        const qNum = questions[index]?.questionNumber;
        if (qNum && answers[qNum]) return 'answered';
        if (visited.has(index)) return 'not-answered';
        return 'not-visited';
    }

    function formatTime(seconds: number) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    if (loading) {
        return (
            <div className="page-center">
                <p style={{ color: 'var(--text-muted)' }}>Loading quiz...</p>
            </div>
        );
    }

    if (questions.length === 0) {
        return (
            <div className="page-center">
                <div className="card fade-in" style={{ textAlign: 'center', padding: '60px', maxWidth: '400px' }}>
                    <p style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>No questions found</p>
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '20px' }}>
                        The PDF may still be processing or no questions were extracted.
                    </p>
                    <button className="btn btn-primary" onClick={() => router.push('/dashboard')}>
                        Back to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    const question = questions[currentQ];
    const totalQ = questions.length;
    const answeredCount = Object.keys(answers).filter(k => answers[parseInt(k)]).length;
    const notAnsweredCount = visited.size - answeredCount - markedForReview.size;
    const reviewCount = markedForReview.size;
    const notVisitedCount = totalQ - visited.size;
    const options: OptionKey[] = ['A', 'B', 'C', 'D'];
    const timerClass = timeLeft <= 60 ? 'timer timer-danger' : timeLeft <= 300 ? 'timer timer-warning' : 'timer';

    return (
        <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* ─── Top Bar ─── */}
            <div className="exam-topbar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h2 style={{ fontSize: '15px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '400px', margin: 0 }}>
                        📝 {quiz?.title || 'Quiz'}
                    </h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div className={timerClass}>
                        <Clock size={16} />
                        {formatTime(timeLeft)}
                    </div>
                </div>
            </div>

            {/* ─── Main Layout ─── */}
            <div className="exam-layout">
                {/* Left: Question Area */}
                <div className="exam-question-panel">
                    {/* Question Header */}
                    <div className="question-header">
                        <h2>Question {currentQ + 1}:</h2>
                        <span className="q-badge">
                            {getQuestionStatus(currentQ) === 'answered' ? '✓ Answered' :
                                getQuestionStatus(currentQ) === 'review' ? '🔖 Marked' :
                                    'Not Answered'}
                        </span>
                    </div>

                    {/* Question Text */}
                    <div className="question-text">
                        {question.questionText}
                    </div>

                    {/* Option Cards */}
                    <div style={{ marginBottom: '24px' }}>
                        {options.map(opt => {
                            const isSelected = answers[question.questionNumber] === opt;
                            const optionText = question.options[opt];
                            return (
                                <div
                                    key={opt}
                                    className={`option-card ${isSelected ? 'option-card--selected' : ''}`}
                                    onClick={() => selectAnswer(question.questionNumber, opt)}
                                >
                                    <div className="option-card__letter">{opt}</div>
                                    <div className="option-card__text">
                                        {optionText || `Option ${opt}`}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Right: Navigation Panel */}
                <div className="exam-nav-panel">
                    {/* Status Legend */}
                    <div className="exam-nav-panel-header">
                        <div className="q-status-legend">
                            <div className="q-status-item">
                                <div className="q-status-dot q-status-dot--not-visited" />
                                <span>{notVisitedCount} Not Visited</span>
                            </div>
                            <div className="q-status-item">
                                <div className="q-status-dot q-status-dot--not-answered" />
                                <span>{notAnsweredCount < 0 ? 0 : notAnsweredCount} Not Answered</span>
                            </div>
                            <div className="q-status-item">
                                <div className="q-status-dot q-status-dot--answered" />
                                <span>{answeredCount} Answered</span>
                            </div>
                            <div className="q-status-item">
                                <div className="q-status-dot q-status-dot--review" />
                                <span>{reviewCount} Marked for Review</span>
                            </div>
                        </div>
                    </div>

                    {/* Question Grid */}
                    <div className="q-grid">
                        {questions.map((q, idx) => {
                            const status = getQuestionStatus(idx);
                            const isCurrent = idx === currentQ;
                            let className = 'q-grid-btn';
                            if (status === 'answered') className += ' q-grid-btn--answered';
                            else if (status === 'not-answered') className += ' q-grid-btn--not-answered';
                            else if (status === 'review') className += ' q-grid-btn--review';
                            if (isCurrent) className += ' q-grid-btn--current';
                            return (
                                <button
                                    key={idx}
                                    className={className}
                                    onClick={() => goToQuestion(idx)}
                                    title={`Question ${idx + 1} - ${status.replace('-', ' ')}`}
                                >
                                    {idx + 1}
                                </button>
                            );
                        })}
                    </div>

                    {/* Submit Button in Nav Panel */}
                    <div style={{ padding: '16px 20px', marginTop: 'auto', borderTop: '1px solid var(--border-light)' }}>
                        <button
                            className="btn btn-primary"
                            style={{ width: '100%', fontWeight: 700, fontSize: '15px' }}
                            onClick={handleSubmit}
                            disabled={submitted}
                        >
                            <Send size={16} />
                            SUBMIT
                        </button>
                        <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                            {answeredCount} of {totalQ} answered
                        </p>
                    </div>
                </div>
            </div>

            {/* ─── Bottom Action Bar ─── */}
            <div className="exam-action-bar">
                <div className="exam-action-bar__left">
                    <button className="btn btn-sm btn-save" onClick={saveAndNext} disabled={submitted}>
                        SAVE & NEXT
                    </button>
                    <button className="btn btn-sm btn-review" onClick={saveAndMarkForReview} disabled={submitted}>
                        <Bookmark size={14} />
                        SAVE & MARK FOR REVIEW
                    </button>
                    <button className="btn btn-sm btn-clear" onClick={clearResponse} disabled={submitted}>
                        <Eraser size={14} />
                        CLEAR RESPONSE
                    </button>
                    <button className="btn btn-sm btn-review" onClick={markForReviewAndNext} disabled={submitted}>
                        <SkipForward size={14} />
                        MARK FOR REVIEW & NEXT
                    </button>
                </div>
                <div className="exam-action-bar__right">
                    <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => goToQuestion(currentQ - 1)}
                        disabled={currentQ === 0 || submitted}
                    >
                        <ChevronLeft size={14} /> BACK
                    </button>
                    <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => goToQuestion(currentQ + 1)}
                        disabled={currentQ === totalQ - 1 || submitted}
                    >
                        NEXT <ChevronRight size={14} />
                    </button>
                </div>
            </div>

            {/* Time Warning Toast */}
            {timeLeft > 0 && timeLeft <= 300 && (
                <div style={{
                    position: 'fixed', bottom: '90px', left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--warning-light)', border: '1px solid var(--warning)',
                    borderRadius: 'var(--radius)', padding: '10px 20px',
                    display: 'flex', alignItems: 'center', gap: '8px',
                    fontSize: '13px', fontWeight: 600, color: '#b45309',
                    boxShadow: 'var(--shadow-lg)', zIndex: 60,
                }}>
                    <AlertTriangle size={16} />
                    {timeLeft <= 60 ? 'Less than 1 minute remaining!' : `${Math.ceil(timeLeft / 60)} minutes remaining`}
                </div>
            )}
        </div>
    );
}
