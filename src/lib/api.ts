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
 * Parse a PDF with SSE progress streaming.
 * Calls onProgress for each stage update from the backend.
 */
export async function parsePdfUploadStream(
    file: File,
    quizId: string,
    onProgress: (data: { stage: string; message: string; total_questions?: number }) => void,
): Promise<void> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('quiz_id', quizId);

    const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
    const response = await fetch(`${baseUrl}/api/parse-pdf-upload-stream`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                try {
                    const data = JSON.parse(line.slice(6));
                    onProgress(data);
                    if (data.stage === 'error') {
                        throw new Error(data.message);
                    }
                } catch (e) {
                    if (e instanceof SyntaxError) continue;
                    throw e;
                }
            }
        }
    }
}

/**
 * Grade a quiz attempt
 */
export async function gradeQuiz(quizId: string, attemptId: string) {
    const { data } = await api.post('/api/grade-quiz', { quiz_id: quizId, attempt_id: attemptId });
    return data;
}

export default api;
