export type InviteChannel = "email" | "instagram";

export type Guest = {
  rowId: number;
  /** ClickUp task id when sourced from ClickUp. */
  taskId: string | null;
  name: string;
  /** Username or email address — meaning depends on `channel`. */
  contact: string | null;
  channel: InviteChannel | null;
  token: string | null;
  rsvpGuests: number | null;
  status: string | null;
};

export type ClickUpCustomField = {
  name?: string;
  type?: string;
  value?: unknown;
  type_config?: {
    options?: Array<{
      id?: string;
      name?: string;
      orderindex?: number;
    }>;
  };
};

export type ClickUpTask = {
  id: string;
  name?: string;
  status?: { status?: string };
  custom_fields?: ClickUpCustomField[];
};

export type ClickUpListTasksResponse = {
  tasks?: ClickUpTask[];
  last_page?: boolean;
};

export type InstagramParticipant = {
  id?: string;
  username?: string;
};

export type InstagramConversation = {
  participants?: { data?: InstagramParticipant[] };
};

export type InstagramPagedResponse<T> = {
  data?: T[];
  paging?: { next?: string };
};
