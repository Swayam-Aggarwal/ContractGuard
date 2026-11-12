import { lazy, Suspense } from "react";

import {
  Link,
  Navigate,
  Route,
  Routes,
} from "react-router";

import AppShell from "./components/AppShell.jsx";

import {
  ProtectedRoute,
  PublicOnlyRoute,
} from "./components/ProtectedRoute.jsx";

import "./App.css";

const AuthPage = lazy(() => import("./pages/AuthPage.jsx"));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage.jsx"));
const ProjectPage = lazy(() => import("./pages/ProjectPage.jsx"));
const ApiExplorerPage = lazy(() => import("./pages/ApiExplorerPage.jsx"));
const ComparisonPage = lazy(() => import("./pages/ComparisonPage.jsx"));
const DiffReportPage = lazy(() => import("./pages/DiffReportPage.jsx"));
const TestCasesPage = lazy(() => import("./pages/TestCasesPage.jsx"));
const TestRunsPage = lazy(() => import("./pages/TestRunsPage.jsx"));

const RouteLoading = () => (
  <main
    role="status"
    aria-live="polite"
    style={{
      display: "grid",
      minHeight: "55vh",
      placeItems: "center",
      padding: "24px",
      color: "#718096",
      fontSize: "13px",
      fontWeight: 600,
    }}
  >
    Loading workspace...
  </main>
);

const NotFoundPage = () => (
  <main className="not-found-page">
    <span className="eyebrow">404 · PAGE NOT FOUND</span>

    <h1>This page doesn't exist.</h1>

    <p>
      The page may have moved or the address may be incorrect.
    </p>

    <Link to="/projects" className="button button-primary">
      Return to projects
    </Link>
  </main>
);

const App = () => {
  return (
    <Suspense fallback={<RouteLoading />}>
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

            <Route
              path="/projects/:projectId/specifications/:specVersionId/explorer"
              element={<ApiExplorerPage />}
            />

            <Route
              path="/projects/:projectId/comparisons"
              element={<ComparisonPage />}
            />

            <Route
              path="/projects/:projectId/diff-reports/:reportId"
              element={<DiffReportPage />}
            />

            <Route
              path="/projects/:projectId/specifications/:specVersionId/test-cases"
              element={<TestCasesPage />}
            />

            <Route
              path="/projects/:projectId/diff-reports/:reportId/coverage"
              element={<TestCasesPage />}
            />

            <Route
              path="/projects/:projectId/diff-reports/:reportId/test-runs"
              element={<TestRunsPage />}
            />
          </Route>
        </Route>

        <Route
          path="*"
          element={<NotFoundPage />}
        />
      </Routes>
    </Suspense>
  );
};

export default App;