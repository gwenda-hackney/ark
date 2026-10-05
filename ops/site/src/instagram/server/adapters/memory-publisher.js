/**
 * InstagramPublisher in memory (#26), for use-case tests. Switches make a
 * step fail or a container slow:
 *
 *   const publisher = memoryPublisher();
 *   publisher.failNext("createImage", error);  // the next createImage throws it
 *   publisher.slow = 3;                         // containers need 3 more checks
 *   publisher.stuck = true;                     // containers never finish
 */
export function memoryPublisher({ username = "gwenda_test", quota = { used: 0, total: 100 } } = {}) {
  const containers = new Map();
  const media = new Map();
  const failures = new Map();
  let next = 1;
  const calls = [];

  const maybeFail = (step) => {
    calls.push(step);
    const error = failures.get(step);
    if (error) {
      failures.delete(step);
      throw error;
    }
  };

  const publisher = {
    mode: "fake",
    slow: 0,
    stuck: false,
    quotaNow: { ...quota },
    calls,
    containers,
    media,
    /** The posts that went out: [{ id, imageUrl, caption }]. */
    get published() {
      return [...media.values()];
    },
    failNext(step, error) {
      failures.set(step, error);
    },
    async account() {
      maybeFail("account");
      return { id: "17840000000000001", username, profileUrl: `https://www.instagram.com/${username}/` };
    },
    async quota() {
      maybeFail("quota");
      return { ...publisher.quotaNow };
    },
    async createImage(imageUrl, caption) {
      maybeFail("createImage");
      const id = `c${next++}`;
      containers.set(id, { id, imageUrl, caption, status: "IN_PROGRESS", checksLeft: publisher.slow, mediaId: "" });
      return id;
    },
    async status(containerId) {
      maybeFail("status");
      const container = containers.get(containerId);
      if (!container) return "ERROR";
      if (container.status === "IN_PROGRESS" && !publisher.stuck) {
        if (container.checksLeft > 0) container.checksLeft -= 1;
        else container.status = "FINISHED";
      }
      return container.status;
    },
    async publish(containerId) {
      maybeFail("publish");
      const container = containers.get(containerId);
      if (!container || container.status !== "FINISHED") {
        const error = new Error("Instagram is still preparing the image. Try again in a minute.");
        error.status = 409;
        throw error;
      }
      const id = `m${next++}`;
      container.status = "PUBLISHED";
      container.mediaId = id;
      media.set(id, { id, imageUrl: container.imageUrl, caption: container.caption });
      publisher.quotaNow.used += 1;
      return id;
    },
    async permalink(mediaId) {
      maybeFail("permalink");
      return media.has(mediaId) ? `https://www.instagram.com/p/${mediaId}/` : "";
    },
  };
  return publisher;
}
