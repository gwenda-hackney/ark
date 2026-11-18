/**
 * A fake Mailchimp audience behind fetch, for the sync's tests: members by
 * hash, the member GET/PUT, tags, and the members list with a status
 * filter, since_last_changed and paging. Like Mailchimp, it refuses to PUT
 * `subscribed` for someone who unsubscribed ("Member In Compliance State").
 */
import { mailchimpSubscriberHash } from "../src/sync";

export type FakeMember = {
  email_address: string;
  status: "subscribed" | "unsubscribed" | "cleaned" | "pending" | "archived";
  last_changed: string;
  tags: string[];
};

export function fakeMailchimp(now = "2026-11-18T12:00:00+00:00") {
  const members = new Map<string, FakeMember>();
  const puts: Array<{ email: string; body: Record<string, unknown> }> = [];
  const listQueries: URLSearchParams[] = [];

  const add = (member: Partial<FakeMember> & { email_address: string }) =>
    members.set(mailchimpSubscriberHash(member.email_address), {
      status: "subscribed",
      last_changed: now,
      tags: [],
      ...member,
    });

  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const path = url.pathname.replace(/^\/3\.0/, "");

    if (method === "GET" && /^\/lists\/[^/]+\/members$/.test(path)) {
      listQueries.push(url.searchParams);
      const status = url.searchParams.get("status");
      const since = url.searchParams.get("since_last_changed");
      const count = Number(url.searchParams.get("count") ?? 10);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const matching = [...members.values()].filter(
        (m) =>
          (!status || m.status === status) &&
          (!since || Date.parse(m.last_changed) >= Date.parse(since)),
      );
      return Response.json({
        members: matching.slice(offset, offset + count),
        total_items: matching.length,
      });
    }

    const member = path.match(
      /^\/lists\/[^/]+\/members\/([0-9a-f]+)(\/tags)?$/,
    );
    if (!member) throw new Error(`Fake Mailchimp: unexpected ${method} ${url}`);
    const [, hash, tags] = member;
    const existing = members.get(hash);

    if (tags && method === "POST") {
      const body = JSON.parse(String(init?.body)) as {
        tags: Array<{ name: string }>;
      };
      if (!existing)
        return Response.json({ title: "Resource Not Found" }, { status: 404 });
      for (const { name } of body.tags)
        if (!existing.tags.includes(name)) existing.tags.push(name);
      return new Response(null, { status: 204 });
    }
    if (method === "GET") {
      return existing
        ? Response.json(existing)
        : Response.json({ title: "Resource Not Found" }, { status: 404 });
    }
    if (method === "PUT") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const email = String(body.email_address);
      puts.push({ email, body });
      if (existing?.status === "unsubscribed" && body.status === "subscribed")
        return Response.json(
          {
            title: "Member In Compliance State",
            status: 400,
            detail: `${email} is in a compliance state due to unsubscribe, bounce, or compliance review and cannot be subscribed.`,
          },
          { status: 400 },
        );
      const status = (body.status ??
        (existing
          ? existing.status
          : body.status_if_new)) as FakeMember["status"];
      members.set(hash, {
        email_address: email,
        tags: existing?.tags ?? [],
        status,
        last_changed: now,
      });
      return Response.json(members.get(hash));
    }
    throw new Error(`Fake Mailchimp: unexpected ${method} ${url}`);
  };

  const member = (email: string) => members.get(mailchimpSubscriberHash(email));
  return {
    fetch: fetch as unknown as typeof globalThis.fetch,
    add,
    member,
    puts,
    listQueries,
  };
}
