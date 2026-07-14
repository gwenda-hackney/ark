import { Box, Button, Flex, Stack, Text, TextInput } from "@sanity/ui";
import { useCallback, useMemo, useState } from "react";
import type { StringInputProps } from "sanity";
import { useFormValue } from "sanity";
import { buildEventChannelUrl } from "../lib/site";

export function ChannelUrlInput(props: StringInputProps) {
  const token = props.value;
  const slug = useFormValue(["slug", "current"]) as string | undefined;
  const url = useMemo(
    () => (slug?.trim() && token?.trim() ? buildEventChannelUrl(slug, token) : ""),
    [slug, token],
  );
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [url]);

  if (!token?.trim()) {
    return (
      <Box paddingY={1}>
        <Text size={1} muted>
          A token is generated automatically when you add the channel.
        </Text>
      </Box>
    );
  }

  if (!slug?.trim()) {
    return (
      <Box paddingY={1}>
        <Text size={1} muted>
          Set the event slug to build the shareable link.
        </Text>
      </Box>
    );
  }

  return (
    <Stack space={2}>
      <Flex gap={2}>
        <Box flex={1}>
          <TextInput readOnly value={url} />
        </Box>
        <Button
          mode="ghost"
          text={copied ? "Copied" : "Copy link"}
          onClick={() => void copy()}
          title="Copy this channel's invite link"
        />
      </Flex>
      <Text size={1} muted>
        Share this link for this channel. RSVPs from it are tagged with the label above.
      </Text>
    </Stack>
  );
}
