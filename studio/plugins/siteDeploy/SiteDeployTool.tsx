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
import {
  clearStoredProductionPreview,
  fetchDeployStatus,
  loadStoredProductionPreview,
  storeProductionPreview,
  triggerContentDeploy,
  triggerContentPromote,
  wait,
} from "./deployClient";
import type { ContentSummary } from "./types";
import {
  deployTargetForDataset,
  deployToolTitle,
  liveSiteUrl,
  previewSiteUrl,
} from "./types";

const CONTENT_TYPES = ["menuSection", "menuItem", "event"];

const SUMMARY_QUERY = `{
  "menuSections": count(*[_type == "menuSection" && !(_id in path("drafts.**"))]),
  "menuItems": count(*[_type == "menuItem" && !(_id in path("drafts.**"))]),
  "events": count(*[_type == "event" && !(_id in path("drafts.**"))]),
  "draftsHeldBack": count(*[_id in path("drafts.**") && _type in $types])
}`;

type DeployPhase =
  | "idle"
  | "previewing"
  | "preview_ready"
  | "promoting"
  | "deploying"
  | "success"
  | "error";

export function SiteDeployTool() {
  const client = useClient({ apiVersion: "2025-01-01" });
  const dataset = process.env.SANITY_STUDIO_DATASET || "development";
  const deployUrl = process.env.SANITY_STUDIO_SITE_DEPLOY_URL?.trim() || "";
  const deploySecret = process.env.SANITY_STUDIO_SITE_DEPLOY_SECRET?.trim() || "";

  const target = useMemo(() => deployTargetForDataset(dataset), [dataset]);
  const isProduction = target === "production";
  const siteUrl = liveSiteUrl(target);
  const title = deployToolTitle(target);

  const [summary, setSummary] = useState<ContentSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [phase, setPhase] = useState<DeployPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [runUrl, setRunUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewRunId, setPreviewRunId] = useState<number | null>(null);

  const configured = Boolean(deployUrl && deploySecret);
  const busy =
    phase === "deploying" || phase === "previewing" || phase === "promoting";

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

  useEffect(() => {
    if (!isProduction) return;
    const stored = loadStoredProductionPreview();
    if (!stored) return;
    setPreviewRunId(stored.previewRunId);
    setPreviewUrl(stored.previewUrl);
    setRunUrl(stored.runUrl);
    setPhase("preview_ready");
  }, [isProduction]);

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
    setPreviewUrl(null);
    setPreviewRunId(null);

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
  }, [deploySecret, deployUrl, loadSummary, pollUntilComplete]);

  const handleProductionPreview = useCallback(async () => {
    setPhase("previewing");
    setError(null);
    setRunUrl(null);
    setPreviewUrl(null);
    setPreviewRunId(null);
    clearStoredProductionPreview();

    try {
      const trigger = await triggerContentDeploy(
        deployUrl,
        deploySecret,
        "production",
      );
      setRunUrl(trigger.runUrl);

      const status = await pollUntilComplete(trigger.runId);
      if (status.conclusion !== "success") {
        setPhase("error");
        setError(`Preview failed. See ${status.runUrl}`);
        return;
      }

      const nextPreviewUrl = status.previewUrl || previewSiteUrl();
      const nextPreviewRunId = status.previewRunId ?? status.runId;
      setPreviewUrl(nextPreviewUrl);
      setPreviewRunId(nextPreviewRunId);
      setRunUrl(status.runUrl);
      storeProductionPreview({
        previewRunId: nextPreviewRunId,
        previewUrl: nextPreviewUrl,
        runUrl: status.runUrl,
      });
      setPhase("preview_ready");
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Preview failed");
    }
  }, [deploySecret, deployUrl, pollUntilComplete]);

  const handleProductionPromote = useCallback(async () => {
    if (!previewRunId) return;

    setPhase("promoting");
    setError(null);

    try {
      const trigger = await triggerContentPromote(
        deployUrl,
        deploySecret,
        previewRunId,
      );
      setRunUrl(trigger.runUrl);

      const status = await pollUntilComplete(trigger.runId);
      if (status.conclusion === "success") {
        clearStoredProductionPreview();
        setPhase("success");
        await loadSummary();
        return;
      }

      setPhase("error");
      setError(`Promote failed. See ${status.runUrl}`);
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Promote failed");
    }
  }, [deploySecret, deployUrl, loadSummary, pollUntilComplete, previewRunId]);

  const primaryLabel = isProduction
    ? phase === "previewing"
      ? "Deploying preview…"
      : "Deploy preview"
    : phase === "deploying"
      ? "Deploying…"
      : title;

  return (
    <Box padding={4} sizing="border">
      <Stack space={4}>
        <Stack space={3}>
          <Heading as="h1" size={2}>
            {title}
          </Heading>
          <Text muted size={2}>
            {isProduction
              ? "Rebuild the live site from published content. First deploy a preview for review, then promote that exact build to gwenda.co.uk."
              : "Rebuild the website from published content in Sanity. Draft documents are held back and will not appear on the site."}
          </Text>
        </Stack>

        {!configured ? (
          <Card padding={4} radius={2} shadow={1} tone="caution">
            <Text size={2}>
              Site deploy is not configured for this Studio. Set{" "}
              <code>SANITY_STUDIO_SITE_DEPLOY_URL</code> and{" "}
              <code>SANITY_STUDIO_SITE_DEPLOY_SECRET</code>, then redeploy Studio.
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
          <Button
            icon={LaunchIcon}
            text={primaryLabel}
            tone="primary"
            disabled={!configured || busy}
            onClick={() =>
              void (isProduction ? handleProductionPreview() : handleStagingDeploy())
            }
          />
          {isProduction && (phase === "preview_ready" || phase === "promoting") ? (
            <Button
              text={phase === "promoting" ? "Promoting…" : "Promote to live"}
              tone="positive"
              disabled={!configured || busy || !previewRunId}
              onClick={() => void handleProductionPromote()}
            />
          ) : null}
          <Button
            mode="ghost"
            text="Refresh summary"
            disabled={summaryLoading || busy}
            onClick={() => void loadSummary()}
          />
        </Flex>

        {phase === "deploying" || phase === "previewing" || phase === "promoting" ? (
          <Card padding={4} radius={2} tone="primary">
            <Flex align="center" gap={3}>
              <Spinner />
              <Stack space={2}>
                <Text size={2}>
                  {phase === "previewing"
                    ? "Building production content preview…"
                    : phase === "promoting"
                      ? "Promoting previewed content to live…"
                      : "Building and deploying published content…"}
                </Text>
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

        {phase === "preview_ready" && previewUrl ? (
          <Card padding={4} radius={2} tone="caution">
            <Stack space={3}>
              <Text size={2}>Preview ready for review.</Text>
              <Text size={2}>
                <a href={previewUrl} target="_blank" rel="noreferrer">
                  {previewUrl}
                </a>
              </Text>
              <Text size={1} muted>
                Promote deploys this exact build to {siteUrl}. Publishing more
                documents in Studio will not change the preview until you deploy
                preview again.
              </Text>
              {runUrl ? (
                <Text size={1} muted>
                  <a href={runUrl} target="_blank" rel="noreferrer">
                    View preview build run
                  </a>
                </Text>
              ) : null}
            </Stack>
          </Card>
        ) : null}

        {phase === "success" ? (
          <Card padding={4} radius={2} tone="positive">
            <Stack space={2}>
              <Text size={2}>
                {isProduction ? "Live site updated." : "Site updated."}
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
