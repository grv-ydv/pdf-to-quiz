'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { parseAnswerKey } from '@/lib/api';
import { Quiz, Question, Attempt, OptionKey } from '@/types';
import { useDropzone } from 'react-dropzone';
import { Trophy, CheckCircle, XCircle, Minus, ArrowLeft, Key, Upload, Loader2 } from 'lucide-react';

export default function QuizResultsPage() {
    const { user } = useAuth();
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const quizId = params.id as string;
    const attemptId = searchParams.get('attemptId');

    const [quiz, setQuiz] = useState<Quiz | null>(null);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [attempt, setAttempt] = useState<Attempt | null>(null);
    const [loading, setLoading] = useState(true);
    const [grading, setGrading] = useState(false);
    const [needsKey, setNeedsKey] = useState(false);

    useEffect(() => {
        async function load() {
            if (!quizId) return;

            // Load quiz
            const { data: quizRow } = await supabase
                .from('quizzes')
                .select('*')
                .eq('id', quizId)
                .single();

            if (!quizRow) { router.push('/dashboard'); return; }

            const quizData: Quiz = {
                id: quizRow.id,
                userId: quizRow.user_id,
                title: quizRow.title,
                pdfUrl: quizRow.pdf_url,
                answerKeyUrl: quizRow.answer_key_url,
                timerMinutes: quizRow.timer_minutes,
                status: quizRow.status,
                totalQuestions: quizRow.total_questions,
                createdAt: new Date(quizRow.created_at),
            };
            setQuiz(quizData);

            // Load questions
            const { data: qData } = await supabase
                .from('questions')
                .select('*')
                .eq('quiz_id', quizId)
                .order('question_number', { ascending: true });

            const qs: Question[] = (qData || []).map(q => ({
                id: q.id,
                quizId: q.quiz_id,
                questionNumber: q.question_number,
                questionText: q.question_text,
                options: q.options || { A: '', B: '', C: '', D: '' },
                correctOption: q.correct_option,
            }));
            setQuestions(qs);

            // Load attempt
            if (attemptId) {
                const { data: aRow } = await supabase
                    .from('attempts')
                    .select('*')
                    .eq('id', attemptId)
                    .single();

                if (aRow) {
                    const attemptData: Attempt = {
                        id: aRow.id,
                        quizId: aRow.quiz_id,
                        userId: aRow.user_id,
                        answers: aRow.answers || {},
                        score: aRow.score,
                        totalQuestions: aRow.total_questions,
                        isGraded: aRow.is_graded,
                        submittedAt: new Date(aRow.submitted_at),
                    };
                    setAttempt(attemptData);

                    // Check if we can grade
                    const hasCorrectAnswers = qs.some(q => q.correctOption);
                    if (hasCorrectAnswers && !attemptData.isGraded) {
                        // Auto-grade
                        let score = 0;
                        qs.forEach(q => {
                            if (q.correctOption && attemptData.answers[q.questionNumber] === q.correctOption) {
                                score++;
                            }
                        });
                        await supabase
                            .from('attempts')
                            .update({ score, is_graded: true })
                            .eq('id', attemptId);
                        setAttempt(prev => prev ? { ...prev, score, isGraded: true } : null);
                    } else if (!hasCorrectAnswers && !quizData.answerKeyUrl) {
                        setNeedsKey(true);
                    }
                }
            }
            setLoading(false);
        }
        load();
    }, [quizId, attemptId, router]);

    // Handle answer key upload
    async function handleKeyUpload(file: File) {
        if (!user || !quiz) return;
        setGrading(true);
        try {
            const keyPath = `pdfs/${user.id}/${Date.now()}_key_${file.name}`;
            const { error: uploadError } = await supabase.storage
                .from('pdfs')
                .upload(keyPath, file);

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from('pdfs')
                .getPublicUrl(keyPath);
            const keyUrl = urlData.publicUrl;

            // Update quiz with answer key URL
            await supabase
                .from('quizzes')
                .update({ answer_key_url: keyUrl })
                .eq('id', quizId);

            // Parse answer key via backend
            try {
                await parseAnswerKey(keyUrl, quizId);
                window.location.reload();
            } catch {
                setNeedsKey(false);
                setGrading(false);
            }
        } catch (err) {
            console.error(err);
            setGrading(false);
        }
    }

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop: (files) => { if (files[0]) handleKeyUpload(files[0]); },
        accept: { 'application/pdf': ['.pdf'] },
        maxFiles: 1,
    });

    if (loading) return (
        <div className="page-center"><p style={{ color: 'var(--text-muted)' }}>Loading results...</p></div>
    );

    const score = attempt?.score ?? 0;
    const total = questions.length || attempt?.totalQuestions || 0;
    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
    const options: OptionKey[] = ['A', 'B', 'C', 'D'];

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
            {/* Navbar */}
            <div className="navbar">
                <button className="btn btn-ghost btn-sm" onClick={() => router.push('/dashboard')}>
                    <ArrowLeft size={16} /> Dashboard
                </button>
                <span className="nav-logo">Results</span>
                <div style={{ width: '100px' }} />
            </div>

            <div className="container" style={{ maxWidth: '700px', paddingTop: '40px', paddingBottom: '40px' }}>
                <div className="fade-in">
                    {/* Score Card */}
                    {attempt?.isGraded ? (
                        <div className="card score-card" style={{ marginBottom: '32px', textAlign: 'center' }}>
                            <div className="score-ring" style={{
                                borderColor: percentage >= 70 ? 'var(--success)' : percentage >= 40 ? 'var(--warning)' : 'var(--danger)',
                            }}>
                                <span className="score-value" style={{
                                    color: percentage >= 70 ? 'var(--success)' : percentage >= 40 ? '#b45309' : 'var(--danger)',
                                }}>
                                    {percentage}%
                                </span>
                                <span className="score-label">{score}/{total}</span>
                            </div>
                            <div style={{ marginTop: '16px' }}>
                                <Trophy size={24} color={percentage >= 70 ? 'var(--success)' : 'var(--warning)'} />
                            </div>
                            <h2 style={{ fontSize: '20px', fontWeight: 600 }}>
                                {percentage >= 80 ? 'Excellent!' : percentage >= 60 ? 'Good job!' : percentage >= 40 ? 'Keep practicing!' : 'Don\'t give up!'}
                            </h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                                {quiz?.title}
                            </p>
                        </div>
                    ) : needsKey ? (
                        /* Upload Answer Key */
                        <div className="card" style={{ marginBottom: '32px', textAlign: 'center', padding: '40px' }}>
                            <Key size={40} color="var(--accent)" style={{ marginBottom: '16px' }} />
                            <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>Upload Answer Key to see your score</h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px' }}>
                                Your answers have been saved. Upload the answer key PDF to get graded.
                            </p>
                            {grading ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                    <Loader2 size={24} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
                                    <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Processing answer key...</p>
                                </div>
                            ) : (
                                <div {...getRootProps()} className={`dropzone ${isDragActive ? 'dropzone-active' : ''}`}
                                    style={{ maxWidth: '360px', margin: '0 auto', minHeight: '140px' }}>
                                    <input {...getInputProps()} />
                                    <Upload size={28} color="var(--text-muted)" />
                                    <p style={{ fontWeight: 500, fontSize: '14px' }}>Drop answer key PDF here</p>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>or click to browse</p>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="card" style={{ marginBottom: '32px', textAlign: 'center', padding: '40px' }}>
                            <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>Quiz Submitted!</h2>
                            <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                                Your answers have been saved successfully.
                            </p>
                        </div>
                    )}

                    {/* Answer Review (when graded) */}
                    {attempt?.isGraded && questions.length > 0 && (
                        <div>
                            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Answer Review</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {questions.map(q => {
                                    const userAnswer = attempt.answers[q.questionNumber];
                                    const correct = q.correctOption;
                                    const isCorrect = userAnswer === correct;
                                    const isUnanswered = !userAnswer;

                                    return (
                                        <div key={q.questionNumber} className="card" style={{ padding: '14px 16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                                <div style={{ marginTop: '2px' }}>
                                                    {isUnanswered ? <Minus size={18} color="var(--text-muted)" /> :
                                                        isCorrect ? <CheckCircle size={18} color="var(--success)" /> :
                                                            <XCircle size={18} color="var(--danger)" />}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <p style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px', lineHeight: 1.4 }}>
                                                        Q{q.questionNumber}. {q.questionText}
                                                    </p>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        {options.map(opt => {
                                                            let bubbleClass = 'bubble';
                                                            if (opt === correct) bubbleClass += ' bubble-correct';
                                                            else if (opt === userAnswer && !isCorrect) bubbleClass += ' bubble-wrong';
                                                            return (
                                                                <div key={opt} className={bubbleClass} style={{ width: '34px', height: '34px', fontSize: '13px', cursor: 'default' }}>
                                                                    {opt}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    {!isCorrect && !isUnanswered && (
                                                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                                                            Your answer: {userAnswer} · Correct: {correct}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
