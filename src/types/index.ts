// ─── Core Types ─────────────────────────────────────

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  mobile?: string;
  dob?: string;
  examPreparingFor?: string;
  profileCompleted: boolean;
  createdAt: Date;
}

export interface Quiz {
  id: string;
  userId: string;
  title: string;
  pdfUrl: string;
  answerKeyUrl?: string;
  timerMinutes: number;
  status: 'draft' | 'parsing' | 'review' | 'active' | 'completed';
  totalQuestions: number;
  createdAt: Date;
}

export interface Question {
  id: string;
  quizId: string;
  questionNumber: number;
  questionText: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  correctOption?: 'A' | 'B' | 'C' | 'D';
}

export interface Attempt {
  id: string;
  quizId: string;
  userId: string;
  answers: Record<number, 'A' | 'B' | 'C' | 'D' | null>;
  score?: number;
  totalQuestions: number;
  isGraded: boolean;
  submittedAt: Date;
}

export type OptionKey = 'A' | 'B' | 'C' | 'D';
