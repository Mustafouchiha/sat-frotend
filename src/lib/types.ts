export type Role = 'SUPER_ADMIN' | 'OPERATOR' | 'TEACHER' | 'STUDENT' | 'PARENT';
export type Section = 'RW' | 'MATH';
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface User {
  id: string;
  tgId: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  photoUrl: string | null;
  name: string;
  lang: 'uz' | 'ru' | 'en';
  roles: Role[];
  status: 'PENDING' | 'ACTIVE' | 'BLOCKED';
  targetScore: number | null;
  examDate: string | null;
  xp: number;
  answeredTotal: number;
  correctTotal: number;
  notifyDaily: boolean;
}

export interface Title {
  name: string;
  min: number;
  color: string;
  icon: string;
}

export interface RatingView {
  rating: number;
  games: number;
  peak: number;
  provisional: boolean;
  title: Title;
  estimatedSat: number;
}

export interface Stats {
  ratings: Record<'OVERALL' | 'MATH' | 'RW', RatingView>;
  streak: { current: number; best: number; lastDate: string | null; doneToday: boolean };
  level: { level: number; current: number; next: number; progress: number };
}

export interface Choice {
  label: string;
  text: string;
}

export interface Question {
  order?: number;
  type: 'MCQ' | 'SPR';
  stem: string;
  passage?: string;
  svg?: string;
  imageUrl?: string;
  choices?: Choice[];
}

export interface ReviewQuestion extends Question {
  correctLabel?: string;
  correctDisplay: string;
  explanation?: string;
}

export interface Achievement {
  code: string;
  name: string;
  description: string;
  icon: string;
  earnedAt?: string | null;
}

export interface SessionState {
  id: string;
  mode: 'PRACTICE' | 'REVIEW' | 'DAILY' | 'RUSH' | 'DUEL';
  status: 'IN_PROGRESS' | 'FINISHED' | 'BREAK' | 'ABANDONED';
  title: string | null;
  deadlineAt: string | null;
  serverNow: string;
  total: number | null;
  answered: number;
  correct: number;
  mistakes: number;
  lives: number | null;
  ratingDelta: number;
  duelId: string | null;
  index?: number;
  question: (Question & { order: number }) | null;
}

export interface AnswerResult {
  correct: boolean;
  correctLabel?: string;
  correctDisplay: string;
  explanation?: string;
  ratingDelta: number;
  rating: number;
  finished: boolean;
  lives: number | null;
  achievements: Achievement[];
  expired?: boolean;
  ref: { templateId: string; templateVersion: number; seed: number };
}

export interface Domain {
  id: string;
  section: Section;
  name: string;
  skills: Array<{ id: string; name: string }>;
}
