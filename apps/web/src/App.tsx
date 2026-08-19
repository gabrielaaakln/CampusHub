import { Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout.js';
import { useFeature } from './lib/useAppConfig.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { SchedulePage } from './pages/SchedulePage.js';
import { MapPage } from './pages/MapPage.js';
import { CalendarPage } from './pages/CalendarPage.js';
import { NotificationsPage } from './pages/NotificationsPage.js';
import { ForumPage } from './pages/ForumPage.js';
import { PostPage } from './pages/PostPage.js';
import { MarketPage } from './pages/MarketPage.js';
import { ListingPage } from './pages/ListingPage.js';
import { EventsPage } from './pages/EventsPage.js';
import { ProfilePage } from './pages/ProfilePage.js';
import { RightsPage } from './pages/RightsPage.js';
import { ModerationPage } from './pages/ModerationPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';

export function App() {
  const events = useFeature('events');
  const moderation = useFeature('moderationPanel');
  const registration = useFeature('registration');

  return (
    <Routes>
      <Route element={<Layout />}>
        {/* until the now screen exists the timetable is the landing page */}
        <Route index element={<SchedulePage />} />
        <Route path="intra" element={<LoginPage />} />
        {/* an account comes from the institutional sign in the form is only the local fallback */}
        <Route
          path="cont-nou"
          element={registration ? <RegisterPage /> : <Navigate to="/intra" replace />}
        />
        <Route path="orar" element={<SchedulePage />} />
        <Route path="harta" element={<MapPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="notificari" element={<NotificationsPage />} />
        <Route path="forum" element={<ForumPage />} />
        <Route path="forum/:id" element={<PostPage />} />
        <Route path="anunturi" element={<MarketPage />} />
        <Route path="anunturi/:id" element={<ListingPage />} />
        <Route path="drepturi" element={<RightsPage />} />
        <Route path="profil" element={<ProfilePage />} />
        {/* a disabled module redirects instead of showing a dead screen */}
        <Route path="evenimente" element={events ? <EventsPage /> : <Navigate to="/" replace />} />
        <Route
          path="moderare"
          element={moderation ? <ModerationPage /> : <Navigate to="/" replace />}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
