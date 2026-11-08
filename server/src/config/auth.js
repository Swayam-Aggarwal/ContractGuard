export const AUTH_COOKIE_NAME = "cg_access";

export const AUTH_COOKIE_MAX_AGE_MS = 30 * 60 * 1000;

export const JWT_ALGORITHM = "HS256";

export const JWT_ISSUER = "contractguard-api";

export const JWT_AUDIENCE = "contractguard-client";

export const getAuthCookieOptions = (nodeEnv) => ({
  httpOnly: true,
  secure: nodeEnv === "production",
  sameSite: "lax",
  path: "/api/v1",
  maxAge: AUTH_COOKIE_MAX_AGE_MS,
});

export const getClearAuthCookieOptions = (nodeEnv) => {
  const { maxAge, ...options } = getAuthCookieOptions(nodeEnv);

  return options;
};