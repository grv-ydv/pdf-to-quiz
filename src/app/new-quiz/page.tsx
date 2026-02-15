'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { parsePdfUpload, parseAnswerKeyUpload } from '@/lib/api';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Key, Clock, ArrowLeft, ArrowRight, Check, X, Loader2 } from 'lucide-react';

export default function NewQuizPage() {
    const { user } = useAuth();
    const router = useRouter();

    // PDF files
    const [questionFile, setQuestionFile] = useState<File | null>(null);
    const [answerKeyFile, setAnswerKeyFile] = useState<File | null>(null);

    // Timer
    const [timerMinutes, setTimerMinutes] = useState(30);
    const [customTimer, setCustomTimer] = useState('');

    // State
    const [step, setStep] = useState<'upload' | 'processing'>('upload');
    const [error, setError] = useState('');
    const [progress, setProgress] = useState('');

    // Question PDF dropzone
    const onDropQuestion = useCallback((accepted: File[]) => {
        if (accepted[0]?.type === 'application/pdf') setQuestionFile(accepted[0]);
    }, []);

    const { getRootProps: getQuestionProps, getInputProps: getQuestionInput, isDragActive: isQuestionDrag } = useDropzone({
        onDrop: onDropQuestion,
        accept: { 'application/pdf': ['.pdf'] },
        maxFiles: 1,
    });

    // Answer Key PDF dropzone
    const onDropKey = useCallback((accepted: File[]) => {
        if (accepted[0]?.type === 'application/pdf') setAnswerKeyFile(accepted[0]);
    }, []);

    const { getRootProps: getKeyProps, getInputProps: getKeyInput, isDragActive: isKeyDrag } = useDropzone({
        onDrop: onDropKey,
        accept: { 'application/pdf': ['.pdf'] },
        maxFiles: 1,
    });

    const presetTimers = [15, 30, 45, 60, 90, 120];

    function handleTimerSelect(mins: number) {
        setTimerMinutes(mins);
        setCustomTimer('');
    }

    function handleCustomTimer(value: string) {
        setCustomTimer(value);
        const num = parseInt(value);
        if (!isNaN(num) && num > 0 && num <= 300) {
            setTimerMinutes(num);
        }
    }

    async function handleStartQuiz() {
        if (!user || !questionFile) return;

        setStep('processing');
        setError('');

        try {
            // 1. Upload Question Paper to Supabase Storage (for PDF viewer reference)
            setProgress('Uploading question paper...');
            const questionPath = `pdfs/${user.id}/${Date.now()}_${questionFile.name}`;
            const { error: qUploadError } = await supabase.storage
                .from('pdfs')
                .upload(questionPath, questionFile);

            if (qUploadError) throw new Error(`Upload failed: ${qUploadError.message}`);

            const { data: qUrlData } = supabase.storage
                .from('pdfs')
                .getPublicUrl(questionPath);
            const pdfUrl = qUrlData.publicUrl;

            // 2. Upload Answer Key to storage if provided
            let answerKeyUrl = '';
            if (answerKeyFile) {
                setProgress('Uploading answer key...');
                const keyPath = `pdfs/${user.id}/${Date.now()}_key_${answerKeyFile.name}`;
                const { error: kUploadError } = await supabase.storage
                    .from('pdfs')
                    .upload(keyPath, answerKeyFile);

                if (!kUploadError) {
                    const { data: kUrlData } = supabase.storage
                        .from('pdfs')
                        .getPublicUrl(keyPath);
                    answerKeyUrl = kUrlData.publicUrl;
                }
            }

            // 3. Create quiz record in Supabase
            setProgress('Creating quiz...');
            const title = questionFile.name.replace('.pdf', '').replace(/[_-]/g, ' ');
            const { data: quizData, error: quizError } = await supabase
                .from('quizzes')
                .insert({
                    user_id: user.id,
                    title,
                    pdf_url: pdfUrl,
                    answer_key_url: answerKeyUrl || null,
                    timer_minutes: timerMinutes,
                    status: 'parsing',
                    total_questions: 0,
                })
                .select()
                .single();

            if (quizError) throw new Error(`Quiz creation failed: ${quizError.message}`);

            // 4. Parse PDF via direct file upload to backend (no URL download needed)
            setProgress('Parsing questions with AI... This may take up to a minute.');
            const parseResult = await parsePdfUpload(questionFile, quizData.id);
            console.log('Parse result:', parseResult);

            // 5. Parse answer key if provided
            if (answerKeyFile) {
                setProgress('Parsing answer key with AI...');
                try {
                    const keyResult = await parseAnswerKeyUpload(answerKeyFile, quizData.id);
                    console.log('Answer key result:', keyResult);
                } catch (keyErr: any) {
                    console.warn('Answer key parsing failed:', keyErr);
                    // Don't block quiz creation, just log the warning
                }
            }

            // 6. Navigate to review page
            router.push(`/quiz/${quizData.id}/review`);
        } catch (err: any) {
            console.error('Quiz creation error:', err);
            const detail = err?.response?.data?.detail || err?.message || 'Something went wrong';
            setError(detail);
            setStep('upload');
        }
    }

    if (step === 'processing') {
        return (
            <div className="page-center">
                <div className="fade-in" style={{ textAlign: 'center', maxWidth: '400px' }}>
                    <Loader2 size={40} color="var(--accent)" style={{ animation: 'spin 1s linear infinite', marginBottom: '20px' }} />
                    <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>Setting up your quiz</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{progress}</p>
                    {error && <p className="error-text" style={{ marginTop: '12px' }}>{error}</p>}
                    <style jsx>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
            {/* Navbar */}
            <div className="navbar">
                <button className="btn btn-ghost btn-sm" onClick={() => router.push('/dashboard')}>
                    <ArrowLeft size={16} /> Back
                </button>
                <span className="nav-logo">New Quiz</span>
                <div style={{ width: '80px' }} />
            </div>

            <div className="container" style={{ paddingTop: '40px', paddingBottom: '40px', maxWidth: '900px' }}>
                <div className="fade-in">
                    {/* Header */}
                    <div style={{ marginBottom: '36px' }}>
                        <h1 style={{ fontSize: '28px', fontWeight: 700, letterSpacing: '-0.5px' }}>Upload Question Paper</h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '6px' }}>
                            Upload your PDF and set a timer to start your quiz
                        </p>
                    </div>

                    {/* Upload Section — Two columns */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '36px' }}>
                        {/* Question Paper Upload */}
                        <div>
                            <label className="label" style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <FileText size={14} /> Question Paper (PDF) *
                            </label>
                            <div {...getQuestionProps()}
                                className={`dropzone ${isQuestionDrag ? 'dropzone-active' : ''} ${questionFile ? 'dropzone-accepted' : ''}`}
                                style={{ minHeight: '180px' }}>
                                <input {...getQuestionInput()} />
                                {questionFile ? (
                                    <>
                                        <Check size={32} color="var(--success)" />
                                        <p style={{ fontWeight: 500, fontSize: '14px' }}>{questionFile.name}</p>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                                            {(questionFile.size / 1024 / 1024).toFixed(1)} MB
                                        </p>
                                        <button className="btn btn-sm btn-secondary" onClick={e => { e.stopPropagation(); setQuestionFile(null); }}>
                                            <X size={14} /> Remove
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <Upload size={32} color="var(--text-muted)" />
                                        <p style={{ fontWeight: 500, fontSize: '14px' }}>Drop your question paper here</p>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>or click to browse · PDF only</p>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Answer Key Upload */}
                        <div>
                            <label className="label" style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Key size={14} /> Answer Key (PDF) <span style={{ color: 'var(--text-muted)' }}>— optional</span>
                            </label>
                            <div {...getKeyProps()}
                                className={`dropzone ${isKeyDrag ? 'dropzone-active' : ''} ${answerKeyFile ? 'dropzone-accepted' : ''}`}
                                style={{ minHeight: '180px' }}>
                                <input {...getKeyInput()} />
                                {answerKeyFile ? (
                                    <>
                                        <Check size={32} color="var(--success)" />
                                        <p style={{ fontWeight: 500, fontSize: '14px' }}>{answerKeyFile.name}</p>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                                            {(answerKeyFile.size / 1024 / 1024).toFixed(1)} MB
                                        </p>
                                        <button className="btn btn-sm btn-secondary" onClick={e => { e.stopPropagation(); setAnswerKeyFile(null); }}>
                                            <X size={14} /> Remove
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <Key size={32} color="var(--text-muted)" />
                                        <p style={{ fontWeight: 500, fontSize: '14px' }}>Have the answer key?</p>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                                            Upload now or after the quiz · PDF only
                                        </p>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Timer Section */}
                    <div className="card" style={{ marginBottom: '36px' }}>
                        <label className="label" style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '15px' }}>
                            <Clock size={16} /> Set Timer
                        </label>

                        {/* Preset Chips */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
                            {presetTimers.map(t => (
                                <button key={t}
                                    className={`btn btn-sm ${timerMinutes === t && !customTimer ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => handleTimerSelect(t)}>
                                    {t < 60 ? `${t} min` : `${t / 60} hr${t > 60 ? 's' : ''}`}
                                </button>
                            ))}
                        </div>

                        {/* Custom Timer Input */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>or custom:</span>
                            <input className="input" type="number" min="1" max="300"
                                placeholder="e.g. 45"
                                value={customTimer}
                                onChange={e => handleCustomTimer(e.target.value)}
                                style={{ width: '100px' }} />
                            <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>minutes</span>
                        </div>

                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '12px' }}>
                            Timer: <strong>{timerMinutes} minute{timerMinutes !== 1 ? 's' : ''}</strong>
                            {timerMinutes >= 60 && ` (${Math.floor(timerMinutes / 60)}h ${timerMinutes % 60}m)`}
                        </p>
                    </div>

                    {/* Error */}
                    {error && <p className="error-text" style={{ marginBottom: '16px' }}>{error}</p>}

                    {/* Start Button */}
                    <button className="btn btn-primary btn-lg" onClick={handleStartQuiz}
                        disabled={!questionFile}
                        style={{ width: '100%' }}>
                        Start Quiz <ArrowRight size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
}
