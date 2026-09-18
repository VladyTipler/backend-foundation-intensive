import { useEffect, useState } from "react";
import type { z } from "zod";
import { request } from "./api";

export function useQuery<T>(
  path: string,
  schema: z.ZodType<T>,
  enabled = true,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(null);
    if (!enabled) {
      setBusy(false);
      return;
    }
    setBusy(true);
    request(path, schema, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [path, schema, enabled, version]);
  return { data, error, busy, reload: () => setVersion((v) => v + 1) };
}
