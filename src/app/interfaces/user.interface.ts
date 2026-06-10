/**
 * Represents a user within the application.
 */
export interface User {
  /**
   * The unique identifier of the user (e.g., database ID or auth UID).
   */
  id: string;
  /**
   * The display name of the user.
   */
  display_name: string;
  /**
   * The email address of the user.
   */
  email: string;
  /**
   * The URL pointing to the user's avatar image.
   */
  avatar_url: string;
  /**
   * The presence status of the user.
   */
  status: 'online' | 'offline' | 'away';
  /**
   * A custom status message set by the user (optional).
   */
  custom_status?: string;
  /**
   * The timestamp indicating when the user was created (optional).
   */
  created_at?: string;
}