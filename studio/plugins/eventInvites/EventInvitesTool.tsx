import { UsersIcon } from "@sanity/icons";
import {
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Select,
  Spinner,
  Stack,
  Text,
} from "@sanity/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useClient } from "sanity";
import { fetchInviteSummary, sendInvites } from "./adminClient";
import type { EventOption, SummaryResponse } from "./types";
import { adminBaseUrl, adminSecret, baserowGridUrl } from "./types";

const EVENTS_QUERY = `*[_type == "event"] | order(date asc) {
  "id": slug.current,
  title,
  date
}`;

type Phase = "idle" | "loading" | "sending" | "dry-run";

export function EventInvitesTool() {
  const client = useClient({ apiVersion: "2025-01-01" });
  const configured = Boolean(adminBaseUrl() && adminSecret());

  const [events, setEvents] = useState<EventOption[]>([]);
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === slug) ?? null,
    [events, slug],
  );

  const loadEvents = useCallback(async () => {
    const rows = await client.fetch<EventOption[]>(EVENTS_QUERY);
    setEvents(rows.filter((row) => row.id && row.title));
    if (!slug && rows[0]?.id) setSlug(rows[0].id);
  }, [client, slug]);

  const loadSummary = useCallback(async () => {
    if (!slug || !configured) return;
    setPhase("loading");
    setError(null);
    try {
      const next = await fetchInviteSummary(slug);
      setSummary(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load summary.");
      setSummary(null);
    } finally {
      setPhase("idle");
    }
  }, [slug, configured]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const handleSend = useCallback(
    async (dryRun: boolean) => {
      if (!slug) return;
      setPhase(dryRun ? "dry-run" : "sending");
      setError(null);
      try {
        const result = await sendInvites(slug, dryRun);
        if (dryRun) {
          setError(
            `Dry run: ${result.emailCount ?? 0} email, ${result.instagramSent ?? 0} Instagram, ` +
              `${result.instagramManual ?? 0} manual Instagram, ${result.skipped ?? 0} skipped`,
          );
        } else {
          await loadSummary();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Send failed.");
      } finally {
        setPhase("idle");
      }
    },
    [slug, loadSummary],
  );

  const baserowUrl = baserowGridUrl();

  return (
    <Box padding={4} sizing="border">
      <Stack space={4}>
        <Heading as="h1" size={2}>
          Event invites
        </Heading>
        <Text muted size={1}>
          Manage private event guests in Baserow. Headcount and send run against the live site API.
        </Text>

        {!configured ? (
          <Card padding={4} tone="caution" radius={2} border>
            <Stack space={3}>
              <Text size={1}>
                Set <code>SANITY_STUDIO_EVENT_ADMIN_URL</code> and{" "}
                <code>SANITY_STUDIO_EVENT_ADMIN_SECRET</code> in studio env (same value as{" "}
                <code>EVENT_ADMIN_SECRET</code> on the site).
              </Text>
            </Stack>
          </Card>
        ) : null}

        <Card padding={4} radius={2} border>
          <Stack space={4}>
            <Stack space={2}>
              <Text size={1} weight="semibold">
                Event
              </Text>
              <Select
                value={slug}
                onChange={(event) => setSlug(event.currentTarget.value)}
              >
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title} ({event.date})
                  </option>
                ))}
              </Select>
            </Stack>

            {selectedEvent ? (
              <Text size={1} muted>
                Baserow filter: Event Slug = <code>{selectedEvent.id}</code>
              </Text>
            ) : null}

            {phase === "loading" ? (
              <Flex align="center" gap={3}>
                <Spinner muted />
                <Text size={1}>Loading headcount…</Text>
              </Flex>
            ) : summary?.summary ? (
              <Flex gap={3} wrap="wrap">
                <Metric label="Invited" value={summary.summary.invited} />
                <Metric label="Responded" value={summary.summary.responded} />
                <Metric label="Attending" value={summary.summary.totalAttending} />
                <Metric label="Pending send" value={summary.summary.pendingSend} />
              </Flex>
            ) : null}

            <Flex gap={3} wrap="wrap">
              {baserowUrl ? (
                <Button
                  as="a"
                  href={baserowUrl}
                  target="_blank"
                  rel="noreferrer"
                  mode="ghost"
                  text="Open guest list in Baserow"
                />
              ) : null}
              <Button
                mode="ghost"
                text="Refresh"
                onClick={() => void loadSummary()}
                disabled={!configured || phase !== "idle"}
              />
              <Button
                mode="ghost"
                text="Dry run send"
                onClick={() => void handleSend(true)}
                disabled={!configured || phase !== "idle" || !slug}
              />
              <Button
                tone="primary"
                text="Send invites"
                onClick={() => void handleSend(false)}
                disabled={!configured || phase !== "idle" || !slug}
              />
            </Flex>

            {phase === "sending" || phase === "dry-run" ? (
              <Flex align="center" gap={3}>
                <Spinner muted />
                <Text size={1}>{phase === "dry-run" ? "Running dry run…" : "Sending…"}</Text>
              </Flex>
            ) : null}

            {error ? (
              <Card padding={3} tone="critical" radius={2} border>
                <Text size={1}>{error}</Text>
              </Card>
            ) : null}
          </Stack>
        </Card>
      </Stack>
    </Box>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card padding={3} radius={2} border style={{ minWidth: "7rem" }}>
      <Stack space={2}>
        <Text size={0} muted>
          {label}
        </Text>
        <Text size={3} weight="semibold">
          {value}
        </Text>
      </Stack>
    </Card>
  );
}
