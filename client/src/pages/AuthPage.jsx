
import { useState } from "react";

import {
  Link,
  useNavigate,
} from "react-router";

import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import {
  useForm,
} from "react-hook-form";

import {
  zodResolver,
} from "@hookform/resolvers/zod";

import {
  loginSchema,
  registerSchema,
  useLogin,
  useRegister,
} from "../features/auth/auth.js";

const AUTH_DRAFT_PREFIX = "contractguard:auth-draft:v1:";

// Keep the password in JavaScript memory only.
// It survives SPA navigation, but not a page refresh.
let inMemoryPasswordDraft = "";

// Restore non-sensitive fields from the current browser tab.
const loadAuthDraft = (mode) => {
  try {
    const savedDraft = sessionStorage.getItem(
      `${AUTH_DRAFT_PREFIX}${mode}`
    );

    if (!savedDraft) {
      return {};
    }

    const parsedDraft = JSON.parse(savedDraft);

    const draft = {
      email:
        typeof parsedDraft.email === "string"
          ? parsedDraft.email.slice(0, 254)
          : "",
    };

    if (mode === "register") {
      draft.displayName =
        typeof parsedDraft.displayName === "string"
          ? parsedDraft.displayName.slice(0, 80)
          : "";
    }

    return draft;
  } catch {
    return {};
  }
};

// Persist display name and email, never the password.
const saveAuthDraft = (mode, values) => {
  try {
    const draft = {
      email:
        typeof values.email === "string"
          ? values.email.slice(0, 254)
          : "",
    };

    if (mode === "register") {
      draft.displayName =
        typeof values.displayName === "string"
          ? values.displayName.slice(0, 80)
          : "";
    }

    sessionStorage.setItem(
      `${AUTH_DRAFT_PREFIX}${mode}`,
      JSON.stringify(draft)
    );
  } catch {
    // Storage failure must not interrupt form usage.
  }
};

// Clear both drafts after successful authentication.
const clearAuthDrafts = () => {
  try {
    sessionStorage.removeItem(
      `${AUTH_DRAFT_PREFIX}login`
    );

    sessionStorage.removeItem(
      `${AUTH_DRAFT_PREFIX}register`
    );
  } catch {
    // Authentication must continue if storage is unavailable.
  }

  inMemoryPasswordDraft = "";
};

const AuthPage = ({ mode = "login" }) => {
  const isRegister = mode === "register";

  const navigate = useNavigate();

  const loginMutation = useLogin();
  const registerMutation = useRegister();

  const [showPassword, setShowPassword] = useState(false);

  const [savedDraft] = useState(
    () => loadAuthDraft(mode)
  );

  const {
    register,
    getValues,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm({
    resolver: zodResolver(
      isRegister ? registerSchema : loginSchema
    ),

    // Only registration contains displayName.
    // Password is restored from memory, not browser storage.
    defaultValues: {
      ...(isRegister
        ? {
            displayName: savedDraft.displayName ?? "",
          }
        : {}),

      email: savedDraft.email ?? "",

      password: inMemoryPasswordDraft,
    },
  });

  const displayNameField = isRegister
    ? register("displayName")
    : null;

  const emailField = register("email");
  const passwordField = register("password");

  const handleDisplayNameChange = (event) => {
    const value = event.target.value;

    displayNameField.onChange(event);

    saveAuthDraft(mode, {
      displayName: value,
      email: getValues("email"),
    });
  };

  const handleEmailChange = (event) => {
    const value = event.target.value;

    emailField.onChange(event);

    saveAuthDraft(mode, {
      email: value,
      ...(isRegister
        ? { displayName: getValues("displayName") }
        : {}),
    });
  };

  const handlePasswordChange = (event) => {
    const value = event.target.value;

    passwordField.onChange(event);

    // Keep the password in memory only.
    inMemoryPasswordDraft = value;
  };

  const onSubmit = async (values) => {
    try {
      if (isRegister) {
        await registerMutation.mutateAsync(values);
      } else {
        await loginMutation.mutateAsync({
          email: values.email,
          password: values.password,
        });
      }

      clearAuthDrafts();

      navigate("/projects", {
        replace: true,
      });
    } catch (error) {
      setError("root.server", {
        type: "server",
        message: error.message,
      });
    }
  };

  const isBusy =
    isSubmitting ||
    loginMutation.isPending ||
    registerMutation.isPending;

  return (
    <main className="auth-page">
      <div className="auth-topbar">
        <Link to="/" className="auth-brand">
          <span className="brand-mark">
            <ShieldCheck size={21} />
          </span>

          <span>ContractGuard</span>
        </Link>

        <span className="auth-topbar-label">
          DEVELOPER WORKBENCH
        </span>
      </div>

      <section className="auth-layout">
        <div className="auth-intro">
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            API CHANGE-IMPACT ANALYSIS
          </div>

          <h1>
            Understand API changes
            <br />
            before they break things.
          </h1>

          <p className="auth-intro-description">
            Compare API contracts, understand potential
            regressions, and connect changes to meaningful
            tests—all in one engineering workspace.
          </p>

          <div className="auth-feature-list">
            <div className="auth-feature">
              <span className="feature-check">
                <ShieldCheck size={16} />
              </span>

              <div>
                <strong>Explainable analysis</strong>
                <span>
                  Understand what changed and why it matters.
                </span>
              </div>
            </div>

            <div className="auth-feature">
              <span className="feature-check">
                <LockKeyhole size={16} />
              </span>

              <div>
                <strong>Controlled regression testing</strong>
                <span>
                  Validate candidate APIs against baseline contracts.
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="auth-card">
          <div className="auth-card-heading">
            <span className="auth-card-label">
              {isRegister ? "GET STARTED" : "WELCOME BACK"}
            </span>

            <h2>
              {isRegister
                ? "Create your account"
                : "Sign in to ContractGuard"}
            </h2>

            <p>
              {isRegister
                ? "Set up your personal API engineering workspace."
                : "Continue to your API engineering workspace."}
            </p>
          </div>

          {errors.root?.server?.message && (
            <div className="form-alert" role="alert">
              {errors.root.server.message}
            </div>
          )}

          <form
            className="auth-form"
            onSubmit={handleSubmit(onSubmit)}
            noValidate
          >
            {isRegister && (
              <div className="form-field">
                <label htmlFor="displayName">
                  Display name
                </label>

                <div className="input-with-icon">
                  <UserRound size={17} />

                  <input
                    id="displayName"
                    type="text"
                    placeholder="Your name"
                    autoComplete="name"
                    maxLength={80}
                    {...displayNameField}
                    onChange={handleDisplayNameChange}
                    aria-invalid={Boolean(errors.displayName)}
                    aria-describedby={
                      errors.displayName
                        ? "displayName-error"
                        : undefined
                    }
                  />
                </div>

                {errors.displayName && (
                  <p
                    className="field-error"
                    id="displayName-error"
                  >
                    {errors.displayName.message}
                  </p>
                )}
              </div>
            )}

            <div className="form-field">
              <label htmlFor="email">
                Email address
              </label>

              <div className="input-with-icon">
                <Mail size={17} />

                <input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  maxLength={254}
                  {...emailField}
                  onChange={handleEmailChange}
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={
                    errors.email ? "email-error" : undefined
                  }
                />
              </div>

              {errors.email && (
                <p className="field-error" id="email-error">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="password">
                Password
              </label>

              <div className="input-with-icon password-input">
                <LockKeyhole size={17} />

                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={
                    isRegister
                      ? "At least 15 characters"
                      : "Enter your password"
                  }
                  autoComplete={
                    isRegister
                      ? "new-password"
                      : "current-password"
                  }
                  {...passwordField}
                  onChange={handlePasswordChange}
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={
                    errors.password
                      ? "password-error"
                      : undefined
                  }
                />

                <button
                  className="password-toggle"
                  type="button"
                  onClick={() =>
                    setShowPassword((current) => !current)
                  }
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  {showPassword ? (
                    <EyeOff size={17} />
                  ) : (
                    <Eye size={17} />
                  )}
                </button>
              </div>

              {errors.password && (
                <p
                  className="field-error"
                  id="password-error"
                >
                  {errors.password.message}
                </p>
              )}

              {isRegister && (
                <p className="field-hint">
                  Use at least 15 characters. Maximum 72 UTF-8 bytes.
                </p>
              )}
            </div>

            <button
              className="button button-primary auth-submit"
              type="submit"
              disabled={isBusy}
            >
              {isBusy ? (
                <>
                  <span className="spinner spinner-light" />

                  {isRegister
                    ? "Creating account..."
                    : "Signing in..."}
                </>
              ) : (
                <>
                  {isRegister
                    ? "Create account"
                    : "Sign in"}

                  <span aria-hidden="true">→</span>
                </>
              )}
            </button>
          </form>

          <div className="auth-switch">
            {isRegister ? (
              <>
                Already have an account?{" "}
                <Link to="/login">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                New to ContractGuard?{" "}
                <Link to="/register">
                  Create an account
                </Link>
              </>
            )}
          </div>

          <div className="auth-card-footer">
            <span>
              <LockKeyhole size={13} />
              Secure cookie-based authentication
            </span>
          </div>
        </div>
      </section>

      <footer className="auth-footer">
        <span>CONTRACTGUARD</span>
        <span>API CHANGE-IMPACT & REGRESSION WORKBENCH</span>
      </footer>
    </main>
  );
};

export default AuthPage;
