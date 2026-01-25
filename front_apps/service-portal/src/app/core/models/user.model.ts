/**
 * User and Authentication Models
 */

export interface User {
  name: string;
  email: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  user_image?: string;
  roles?: string[];
  enabled?: boolean;
}

export interface LoginCredentials {
  usr: string; // username or email
  pwd: string; // password
}

export interface LoginResponse {
  message: string;
  home_page?: string;
  full_name?: string;
}
