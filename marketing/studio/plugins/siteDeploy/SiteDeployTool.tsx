import { LaunchIcon } from "@sanity/icons/Launch";
import {
  Box,
  Button,
  Card,
  Flex,
  Heading,
  Spinner,
  Stack,
  Text,
} from "@sanity/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useClient } from "sanity";
import { fetchDeployStatus, triggerContentDeploy, wait } from "./deployClient";
import type { ContentSummary } from "./types";
import {
  deployTargetForDataset,
  deployToolTitle,
  liveSiteUrl,
} from "./types";

const CONTENT_TYPES = ["menuSection", "menuItem", "event"];

const SUMMARY_QUERY = `{
  "menuSections": count(*[_type == "menuSection" && !(_id in path("drafts.**"))]),
  "menuItems": count(*[_type == "menuItem" && !(_id in path("drafts.**"))]),
  "events": count(*[_type == "event" && !(_id in path("drafts.**"))]),
  "draftsHeldBack": count(*[_id in path("drafts.**") && _type in $types])
}`;

type DeployPhase = "idle" | "deploying" | "success" | "error";

export function SiteDeployTool() {
  const client = useClient({ apiVersion: "2025-01-01" });
  const dataset = process.env.SANITY_STUDIO_DATASET || "staging";
  const deployUrl = process.env.SANITY_STUDIO_SITE_DEPLOY_URL?.trim() || "";
  const deploySecret = process.env.SANITY_STUDIO_SITE_DEPLOY_SECRET?.trim() || "";

  const target = useMemo(() => deployTargetForDataset(dataset), [dataset]);
  const canDeploy = target === "staging";
  const siteUrl =
    target === "production" ? liveSiteUrl("production") : liveSiteUrl("staging");
  const title = deployToolTitle(target);

  const [summary, setSummary] = useState<ContentSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [phase, setPhase] = useState<DeployPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [runUrl, setRunUrl] = useState<string | null>(null);

  const configured = Boolean(deployUrl && deploySecret);
  const busy = phase === "deploying";

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const next = await client.fetch<ContentSummary>(SUMMARY_QUERY, {
        types: CONTENT_TYPES,
      });
      setSummary(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load content summary");
    } finally {
      setSummaryLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const pollUntilComplete = useCallback(
    async (runId: number) => {
      let status = await fetchDeployStatus(deployUrl, deploySecret, runId);
      while (!status.completed) {
        await wait(5000);
        status = await fetchDeployStatus(deployUrl, deploySecret, runId);
      }
      return status;
    },
    [deploySecret, deployUrl],
  );

  const handleStagingDeploy = useCallback(async () => {
    setPhase("deploying");
    setError(null);
    setRunUrl(null);

    try {
      const trigger = await triggerContentDeploy(deployUrl, deploySecret, "staging");
      setRunUrl(trigger.runUrl);

      const status = await pollUntilComplete(trigger.runId);
      if (status.conclusion === "success") {
        setPhase("success");
        await loadSummary();
        return;
      }

      setPhase("error");
      setError(`Deploy failed. See ${status.runUrl}`);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Deploy failed");
    }
  }, [deploySecret, deployUrl, loadSummary, pollUntilComplete, target]);

  return (
    <Box padding={4} sizing="border">
      <Stack space={4}>
        <Stack space={3}>
          <Heading as="h1" size={2}>
            {title}
          </Heading>
          <Text muted size={2}>
            {target === "production"
              ? "Production is a copy of staging. Promote from ops Web. Do not deploy this dataset directly."
              : "Rebuild gwenda-staging from published documents. Drafts stay in Studio until you publish, then rebuild."}
          </Text>
        </Stack>

        {!configured && canDeploy ? (
          <Card padding={4} radius={2} shadow={1} tone="caution">
            <Text size={2}>
              Site deploy is not configured for this Studio. Set{" "}
              <code>SANITY_STUDIO_SITE_DEPLOY_URL</code> and{" "}
              <code>SANITY_STUDIO_SITE_DEPLOY_SECRET</code>, then redeploy Studio.
            </Text>
          </Card>
        ) : null}

        {target === "production" ? (
          <Card padding={4} radius={2} tone="caution">
            <Text size={2}>
              Change copy in Dev Studio, publish, rebuild staging, review the
              site, then promote to production.
            </Text>
          </Card>
        ) : null}

        <Card padding={4} radius={2} shadow={1}>
          <Stack space={4}>
            <Heading as="h2" size={1}>
              Published content
            </Heading>
            {summaryLoading ? (
              <Flex align="center" gap={3}>
                <Spinner muted />
                <Text muted>Loading summary…</Text>
              </Flex>
            ) : summary ? (
              <Stack space={3}>
                <Text size={2}>{summary.menuSections} menu sections</Text>
                <Text size={2}>{summary.menuItems} menu items</Text>
                <Text size={2}>{summary.events} events</Text>
                <Text size={2} muted>
                  {summary.draftsHeldBack} document
                  {summary.draftsHeldBack === 1 ? "" : "s"} held back as drafts
                </Text>
              </Stack>
            ) : null}
          </Stack>
        </Card>

        <Flex gap={3} wrap="wrap">
          {canDeploy ? (
            <Button
              icon={LaunchIcon}
              text={busy ? "Deploying…" : title}
              tone="primary"
              disabled={!configured || busy}
              onClick={() => void handleStagingDeploy()}
            />
          ) : null}
          <Button
            mode="ghost"
            text="Refresh summary"
            disabled={summaryLoading || busy}
            onClick={() => void loadSummary()}
          />
        </Flex>

        {phase === "deploying" ? (
          <Card padding={4} radius={2} tone="primary">
            <Flex align="center" gap={3}>
              <Spinner />
              <Stack space={2}>
                <Text size={2}>Building and deploying published content…</Text>
                {runUrl ? (
                  <Text size={1} muted>
                    <a href={runUrl} target="_blank" rel="noreferrer">
                      View GitHub Actions run
                    </a>
                  </Text>
                ) : null}
              </Stack>
            </Flex>
          </Card>
        ) : null}

        {phase === "success" && siteUrl ? (
          <Card padding={4} radius={2} tone="positive">
            <Stack space={2}>
              <Text size={2}>
                {target === "production"
                ? "Site updated."
                : "Staging rebuilt from published content."}
              </Text>
              <Text size={2}>
                <a href={siteUrl} target="_blank" rel="noreferrer">
                  {siteUrl}
                </a>
              </Text>
            </Stack>
          </Card>
        ) : null}

        {error ? (
          <Card padding={4} radius={2} tone="critical">
            <Text size={2}>{error}</Text>
          </Card>
        ) : null}
      </Stack>
    </Box>
  );
}
