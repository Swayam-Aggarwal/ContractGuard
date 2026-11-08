import {
  Navigate,
  Route,
  Routes,
} from "react-router";

import AppShell from "./components/AppShell.jsx";

import {
  ProtectedRoute,
  PublicOnlyRoute,
} from "./components/ProtectedRoute.jsx";

import AuthPage from "./pages/AuthPage.jsx";
import ProjectsPage from "./pages/ProjectsPage.jsx";
import ProjectPage from "./pages/ProjectPage.jsx";

import "./App.css";

const NotFoundPage = () => (
  <main className="not-found-page">
    <span className="eyebrow">404 · PAGE NOT FOUND</span>

    <h1>This page doesn't exist.</h1>

    <p>
      The page may have moved or the address may be incorrect.
    </p>

    <NavigateToProjects />
  </main>
);

const NavigateToProjects = () => (
  <a href="/projects" className="button button-primary">
    Return to projects
  </a>
);

const App = () => {
  return (
    <Routes>
      <Route
        path="/"
        element={<Navigate to="/projects" replace />}
      />

      <Route element={<PublicOnlyRoute />}>
        <Route
          path="/login"
          element={<AuthPage key="login" mode="login" />}
        />

        <Route
          path="/register"
          element={<AuthPage key="register" mode="register" />}
        />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route
            path="/projects"
            element={<ProjectsPage />}
          />

          <Route
            path="/projects/:projectId"
            element={<ProjectPage />}
          />
        </Route>
      </Route>

      <Route
        path="*"
        element={<NotFoundPage />}
      />
    </Routes>
  );
};

export default App;