
import { useState } from "react";

import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router";

import {
  ChartNoAxesCombined,
  ClipboardCheck,
  FolderKanban,
  LogOut,
  ShieldCheck,
} from "lucide-react";

import {
  useCurrentUser,
  useLogout,
} from "../features/auth/auth.js";

const AppShell = () => {
  const { data: user } = useCurrentUser();
  const logoutMutation = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const [logoutError, setLogoutError] = useState("");

  const pathname = location.pathname;
  const explorerMatch = pathname.match(
    /^\/projects\/([^/]+)\/specifications\/([^/]+)\/explorer$/u
  );
  const testCasesMatch = pathname.match(
    /^\/projects\/([^/]+)\/specifications\/([^/]+)\/test-cases$/u
  );
  const reportMatch = pathname.match(
    /^\/projects\/([^/]+)\/diff-reports\/([^/]+)$/u
  );
  const coverageMatch = pathname.match(
    /^\/projects\/([^/]+)\/diff-reports\/([^/]+)\/coverage$/u
  );

  const isExplorer = Boolean(explorerMatch);
  const isTestCases = Boolean(testCasesMatch);
  const isDiffReport = Boolean(reportMatch);
  const isCoverage = Boolean(coverageMatch);
  const isComparisons = pathname.endsWith("/comparisons");
  const isProjectDetail = /^\/projects\/[^/]+/u.test(pathname);

  const currentPage = isCoverage
    ? "Test coverage"
    : isTestCases
      ? "Test case library"
      : isDiffReport
        ? "Comparison report"
        : isComparisons
          ? "Comparisons"
          : isExplorer
            ? "API Explorer"
            : isProjectDetail
              ? "Project overview"
              : "Projects";

  const projectId = explorerMatch?.[1] || testCasesMatch?.[1] || reportMatch?.[1] || coverageMatch?.[1];
  const specVersionId = explorerMatch?.[2] || testCasesMatch?.[2];
  const reportId = reportMatch?.[2] || coverageMatch?.[2];

  const testCasesPath = projectId && specVersionId
    ? `/projects/${encodeURIComponent(projectId)}/specifications/${encodeURIComponent(specVersionId)}/test-cases`
    : null;
  const coveragePath = projectId && reportId
    ? `/projects/${encodeURIComponent(projectId)}/diff-reports/${encodeURIComponent(reportId)}/coverage`
    : null;

  const handleLogout = async () => {
    setLogoutError("");

    try {
      await logoutMutation.mutateAsync();
      navigate("/login", { replace: true });
    } catch (error) {
      setLogoutError(error.message);
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">
            <ShieldCheck size={21} strokeWidth={2.1} />
          </div>

          <div className="brand-copy">
            <span className="brand-name">ContractGuard</span>
            <span className="brand-subtitle">API WORKBENCH</span>
          </div>
        </div>

        <div className="sidebar-section-label">WORKSPACE</div>

        <nav className="sidebar-navigation" aria-label="Main navigation">
          <NavLink
            to="/projects"
            end
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "active" : ""}`
            }
          >
            <FolderKanban size={17} />
            <span>Projects</span>
          </NavLink>

          {testCasesPath && (
            <NavLink
              to={testCasesPath}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? "active" : ""}`
              }
            >
              <ClipboardCheck size={17} />
              <span>Test cases</span>
            </NavLink>
          )}

          {coveragePath && (
            <NavLink
              to={coveragePath}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? "active" : ""}`
              }
            >
              <ChartNoAxesCombined size={17} />
              <span>Test coverage</span>
            </NavLink>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="account-block">
            <div className="account-avatar">
              {(user?.displayName || user?.email || "U")
                .charAt(0)
                .toUpperCase()}
            </div>

            <div className="account-info">
              <span className="account-name">
                {user?.displayName || "Account"}
              </span>
              <span className="account-email">{user?.email}</span>
            </div>
          </div>

          {logoutError && (
            <p className="sidebar-error" role="alert">{logoutError}</p>
          )}

          <button
            className="sidebar-logout"
            type="button"
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
          >
            <LogOut size={16} />
            <span>
              {logoutMutation.isPending ? "Signing out..." : "Sign out"}
            </span>
          </button>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span className="breadcrumb-divider">/</span>

            {(isExplorer || isTestCases || isComparisons || isDiffReport || isCoverage) && (
              <>
                <span>Project</span>
                <span className="breadcrumb-divider">/</span>
              </>
            )}

            <span className="breadcrumb-current">{currentPage}</span>
          </div>

          <div className="topbar-meta">
            <span className="connection-indicator" />
            <span>Personal workspace</span>
          </div>
        </header>

        <main className="workspace-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppShell;
