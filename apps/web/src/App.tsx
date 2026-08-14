import { Navigate, Route, Routes } from 'react-router';
import { Layout } from './components/Layout.js';
import { useFeature } from './lib/useAppConfig.js';
import { LoginPage } from './pages/LoginPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { SchedulePage } from './pages/SchedulePage.js';
import { MapPage } from './pages/MapPage.js';
import { ProfilePage } from './pages/ProfilePage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';

export function App() {
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
        <Route path="profil" element={<ProfilePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
