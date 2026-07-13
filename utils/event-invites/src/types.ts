export type InviteChannel = "email" | "instagram";

export type Guest = {
  rowId: number;
  name: string;
  /** Username or email address — meaning depends on `channel`. */
  contact: string | null;
  channel: InviteChannel | null;
  token: string | null;
  rsvpGuests: number | null;
  status: string | null;
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
