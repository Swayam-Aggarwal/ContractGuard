import {
  Navigate,
  Outlet,
} from "react-router";

import { useCurrentUser } from "../features/auth/auth.js";

const LoadingScreen = () => (
  <main className="loading-screen">
    <div className="loading-brand">
      <span className="brand-mark">CG</span>
      <span>ContractGuard</span>
    </div>

    <div className="loading-indicator">
      <span className="spinner" />
      Checking your session...
    </div>
  </main>
);

const SessionError = ({ onRetry, message }) => (
  <main className="loading-screen">
    <div className="error-panel">
      <h1>Workspace unavailable</h1>

      <p>{message}</p>

      <button
        className="button button-primary"
        onClick={onRetry}
        type="button"
      >
        Retry connection
      </button>
    </div>
  </main>
);

export const ProtectedRoute = () => {
  const authQuery = useCurrentUser();

  if (authQuery.isPending) {
    return <LoadingScreen />;
  }

  if (authQuery.data) {
    return <Outlet />;
  }

  if (authQuery.error?.status === 401 || !authQuery.error) {
    return <Navigate to="/login" replace />;
  }

  return (
    <SessionError
      message={authQuery.error.message}
      onRetry={() => authQuery.refetch()}
    />
  );
};

export const PublicOnlyRoute = () => {
  const authQuery = useCurrentUser();

  if (authQuery.isPending) {
    return <LoadingScreen />;
  }

  if (authQuery.data) {
    return <Navigate to="/projects" replace />;
  }

  return <Outlet />;
};