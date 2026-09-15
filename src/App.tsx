import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { SessionProvider, useSession } from './lib/session';
import { Shell } from './components/Shell';
import { Landing } from './pages/Landing';
import { SignIn } from './pages/SignIn';
import { Inbox } from './pages/Inbox';
import { Investigations } from './pages/Investigations';
import { CaseDetail } from './pages/CaseDetail';
import { Claims } from './pages/Claims';
import { Activity } from './pages/Activity';
import { Chat } from './pages/Chat';
import { Settings } from './pages/Settings';
import './App.css';

/**
 * Routes.
 *
 * A public landing page and one authenticated application. `Protected` hides
 * signed-out UI; it is not the security boundary — every Convex function
 * re-authorises on the server.
 */

function Protected({ children }: { children: ReactNode }) {
  const { isAuthed, isLoading } = useSession();

  if (isLoading) {
    return (
      <div className="boot">
        <span className="spinner" aria-hidden="true" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }
  return isAuthed ? <Shell>{children}</Shell> : <SignIn />;
}

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Routes>
          <Route path="/" element={<Landing />} />

          <Route path="/app" element={<Protected><Inbox /></Protected>} />
          <Route path="/app/investigations" element={<Protected><Investigations /></Protected>} />
          <Route path="/app/investigations/:id" element={<Protected><CaseDetail /></Protected>} />
          <Route path="/app/claims" element={<Protected><Claims /></Protected>} />
          <Route path="/app/activity" element={<Protected><Activity /></Protected>} />
          <Route path="/app/chat" element={<Protected><Chat /></Protected>} />
          <Route path="/app/settings" element={<Protected><Settings /></Protected>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  );
}
