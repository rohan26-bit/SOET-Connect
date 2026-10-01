/**
 * Authentication Service
 * Manages user registration and authentication lifecycle.
 *
 * Current Backend Status:
 * - POST /auth/register: Supported (registers user in MongoDB)
 * - POST /auth/login: NOT YET IMPLEMENTED on FastAPI backend
 * - JWT / Session Tokens: NOT YET IMPLEMENTED on FastAPI backend
 */

import api, { ApiError } from "./api";

const TOKEN_KEY = "soet_auth_token";
const USER_KEY = "soet_auth_user";

export const authService = {
  /**
   * Registers a new student or alumni user.
   * Backed by verified backend endpoint POST /auth/register.
   */
  async register(userData) {
    return await api.registerUser(userData);
  },

  /**
   * Initiates login.
   * NOTE: Backend does not currently implement POST /auth/login.
   * Throws an informative ApiError to communicate the exact status
   * without creating fake tokens or simulated authentication.
   */
  async login() {
    throw new ApiError(
      "Login endpoint (POST /auth/login) is not yet implemented by the backend team.",
      501
    );
  },

  /**
   * Returns current auth token if one exists in storage.
   */
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  /**
   * Stores auth token in localStorage.
   */
  setToken(token) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  },

  /**
   * Returns stored user profile info if present.
   */
  getUser() {
    try {
      const user = localStorage.getItem(USER_KEY);
      return user ? JSON.parse(user) : null;
    } catch {
      return null;
    }
  },

  /**
   * Checks whether a valid authentication token exists.
   * Returns false until backend provides real login and token issuance.
   */
  isAuthenticated() {
    return Boolean(this.getToken());
  },

  /**
   * Logs out the user by removing local tokens and user records.
   */
  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

export default authService;
