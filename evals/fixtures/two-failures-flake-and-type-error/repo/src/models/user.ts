export interface User {
  id: string;
  /** Absent for users who signed up with a phone number only. */
  email?: string;
  phone?: string;
  displayName: string;
  locale: string;
  digestOptIn: boolean;
  createdAt: Date;
}

/** A signup needs an email address, a phone number, or both. */
export type NewUser = {
  displayName: string;
  locale?: string;
} & ({ email: string; phone?: string } | { email?: string; phone: string });
