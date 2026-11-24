export interface User {
  id: string;
  email: string;
  displayName: string;
  locale: string;
  digestOptIn: boolean;
  createdAt: Date;
}

export interface NewUser {
  email: string;
  displayName: string;
  locale?: string;
}
