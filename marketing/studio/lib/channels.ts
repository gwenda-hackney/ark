import {
  EVENT_PASSWORD_PATTERN,
  generateEventPassword,
} from "../web/functions/_lib/event-password.js";

export { generateEventPassword as generateChannelToken };

export const channelPasswordPattern = EVENT_PASSWORD_PATTERN;
