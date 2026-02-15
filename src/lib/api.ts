import axios from 'axios';

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000',
});

/**
 * Parse a PDF by URL (original endpoint, kept for backward compat)
 */
export async function parsePdf(pdfUrl: string, quizId: string) {
    const { data } = await api.post('/api/parse-pdf', { pdf_url: pdfUrl, quiz_id: quizId });
    return data;
}

/**
 * Parse a PDF by direct file upload — more reliable, no URL download needed.
 */
export async function parsePdfUpload(file: File, quizId: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('quiz_id', quizId);
    const { data } = await api.post('/api/parse-pdf-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300000, // 5 min timeout for AI processing
    });
    return data;
}

/**
 * Parse answer key by URL (original endpoint)
 */
export async function parseAnswerKey(pdfUrl: string, quizId: string) {
    const { data } = await api.post('/api/parse-answer-key', { pdf_url: pdfUrl, quiz_id: quizId });
    return data;
}

/**
 * Parse answer key by direct file upload
 */
export async function parseAnswerKeyUpload(file: File, quizId: string) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('quiz_id', quizId);
    const { data } = await api.post('/api/parse-answer-key-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300000, // 5 min timeout for AI processing
    });
    return data;
}

/**
 * Grade a quiz attempt
 */
export async function gradeQuiz(quizId: string, attemptId: string) {
    const { data } = await api.post('/api/grade-quiz', { quiz_id: quizId, attempt_id: attemptId });
    return data;
}

export default api;
