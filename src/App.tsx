import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BottomNav } from './components/Layout';
import { Toaster } from './components/Toast';
import { Loading } from './components/ui';
import { launchParams } from './lib/telegram';
import Home from './pages/Home';
import Join from './pages/Join';
import { LoginPage, Splash } from './pages/Login';
import { hasRole, useAuth } from './store/auth';

const Practice = lazy(() => import('./pages/Practice'));
const SessionRunner = lazy(() => import('./pages/Session'));
const SessionReview = lazy(() => import('./pages/Session').then((m) => ({ default: m.SessionReview })));
const Daily = lazy(() => import('./pages/Daily'));
const Rush = lazy(() => import('./pages/Rush'));
const Duel = lazy(() => import('./pages/Duel'));
const DuelJoin = lazy(() => import('./pages/Duel').then((m) => ({ default: m.DuelJoin })));
const DuelRoom = lazy(() => import('./pages/Duel').then((m) => ({ default: m.DuelRoom })));
const Tests = lazy(() => import('./pages/Tests'));
const TestRunner = lazy(() => import('./pages/TestRunner'));
const Result = lazy(() => import('./pages/Result'));
const Mistakes = lazy(() => import('./pages/Mistakes'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const Profile = lazy(() => import('./pages/Profile'));
const TeacherHome = lazy(() => import('./pages/teacher/TeacherHome'));
const GroupDetail = lazy(() => import('./pages/teacher/GroupDetail'));
const StudentDetail = lazy(() => import('./pages/teacher/StudentDetail'));
const AssignmentResults = lazy(() => import('./pages/teacher/AssignmentResults'));
const AdminHome = lazy(() => import('./pages/admin/AdminHome'));
const TemplatesList = lazy(() => import('./pages/admin/TemplatesList'));
const TemplateEditor = lazy(() => import('./pages/admin/TemplateEditor'));
const AdminTests = lazy(() => import('./pages/admin/AdminTests'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminMisc = lazy(() => import('./pages/admin/AdminMisc'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } },
});

function RequireActive({ children }: { children: ReactNode }) {
  const user = useAuth((s) => s.user);
  if (user && user.status !== 'ACTIVE' && !hasRole(user, 'OPERATOR', 'TEACHER')) return <Navigate to="/join" replace />;
  return <>{children}</>;
}

function RequireRole({ roles, children }: { roles: Array<'OPERATOR' | 'TEACHER'>; children: ReactNode }) {
  const user = useAuth((s) => s.user);
  if (!hasRole(user, ...roles)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Bot havolalari: ?join=KOD, ?duel=KOD, ?path=/..., yoki startapp=join_KOD / duel_KOD */
function StartParamHandler() {
  const nav = useNavigate();
  const done = useRef(false);
  const startParam = useAuth((s) => s.startParam);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const { start, query } = launchParams();
    const sp = startParam ?? start;
    const join = query.get('join') ?? (sp?.startsWith('join_') ? sp.slice(5) : null);
    const duel = query.get('duel') ?? (sp?.startsWith('duel_') ? sp.slice(5) : null);
    const path = query.get('path');
    if (join) nav(`/join?code=${encodeURIComponent(join)}`, { replace: true });
    else if (duel) nav(`/duel/join/${encodeURIComponent(duel)}`, { replace: true });
    else if (path && path.startsWith('/')) nav(path, { replace: true });
  }, [nav, startParam]);
  return null;
}

function Shell() {
  const loc = useLocation();
  const immersive = /^\/(session|attempt)\/[^/]+$/.test(loc.pathname);
  const a = (el: ReactNode) => <RequireActive>{el}</RequireActive>;
  return (
    <>
      <StartParamHandler />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={a(<Home />)} />
          <Route path="/join" element={<Join />} />
          <Route path="/practice" element={a(<Practice />)} />
          <Route path="/session/:id" element={a(<SessionRunner />)} />
          <Route path="/session/:id/review" element={a(<SessionReview />)} />
          <Route path="/daily" element={a(<Daily />)} />
          <Route path="/rush" element={a(<Rush />)} />
          <Route path="/duel" element={a(<Duel />)} />
          <Route path="/duel/join/:code" element={a(<DuelJoin />)} />
          <Route path="/duel/:id" element={a(<DuelRoom />)} />
          <Route path="/tests" element={a(<Tests />)} />
          <Route path="/attempt/:id" element={a(<TestRunner />)} />
          <Route path="/attempt/:id/result" element={<Result />} />
          <Route path="/mistakes" element={a(<Mistakes />)} />
          <Route path="/leaderboard" element={a(<Leaderboard />)} />
          <Route path="/profile" element={<Profile />} />

          <Route path="/teacher" element={<RequireRole roles={['TEACHER', 'OPERATOR']}><TeacherHome /></RequireRole>} />
          <Route path="/teacher/groups/:id" element={<RequireRole roles={['TEACHER', 'OPERATOR']}><GroupDetail /></RequireRole>} />
          <Route path="/teacher/students/:id" element={<RequireRole roles={['TEACHER', 'OPERATOR']}><StudentDetail /></RequireRole>} />
          <Route path="/teacher/assignments/:id" element={<RequireRole roles={['TEACHER', 'OPERATOR']}><AssignmentResults /></RequireRole>} />

          <Route path="/admin" element={<RequireRole roles={['OPERATOR']}><AdminHome /></RequireRole>} />
          <Route path="/admin/templates" element={<RequireRole roles={['OPERATOR', 'TEACHER']}><TemplatesList /></RequireRole>} />
          <Route path="/admin/templates/new" element={<RequireRole roles={['OPERATOR', 'TEACHER']}><TemplateEditor /></RequireRole>} />
          <Route path="/admin/templates/:id" element={<RequireRole roles={['OPERATOR', 'TEACHER']}><TemplateEditor /></RequireRole>} />
          <Route path="/admin/tests" element={<RequireRole roles={['OPERATOR']}><AdminTests /></RequireRole>} />
          <Route path="/admin/users" element={<RequireRole roles={['OPERATOR']}><AdminUsers /></RequireRole>} />
          <Route path="/admin/:section" element={<RequireRole roles={['OPERATOR']}><AdminMisc /></RequireRole>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      {!immersive && <BottomNav />}
    </>
  );
}

export default function App() {
  const status = useAuth((s) => s.status);
  const init = useAuth((s) => s.init);
  useEffect(() => {
    void init();
  }, [init]);

  return (
    <QueryClientProvider client={queryClient}>
      <Toaster />
      {status === 'ready' ? (
        <BrowserRouter>
          <Shell />
        </BrowserRouter>
      ) : status === 'need-login' ? (
        <LoginPage />
      ) : (
        <Splash />
      )}
    </QueryClientProvider>
  );
}
