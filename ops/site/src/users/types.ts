/** Who may sign in to ops (the users list). */
export type OpsUser = {
  _id?: string;
  id?: string;
  email?: string;
  name?: string;
  active?: boolean;
};
