/** Who may sign in to ops (the users list). */
export type OpsUser = {
  _id?: string;
  id?: string;
  email?: string;
  name?: string;
  active?: boolean;
  /** Their role (#375); null: the default role. */
  roleId?: number | null;
  /** Areas given to them alone, above their role. */
  extras?: Record<string, "view" | "edit">;
};

export type Level = "none" | "view" | "edit";

/** A role (#375): a name and a level on each area. */
export type OpsRole = {
  id: number;
  name: string;
  /** Owner: everything; can't be changed or removed. */
  owner: boolean;
  /** Everyone without a role has this one (Manager). */
  isDefault: boolean;
  areas: Record<string, Level>;
  /** How many people have it. */
  people: number;
};
