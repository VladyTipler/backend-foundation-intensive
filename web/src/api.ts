import { useSyncExternalStore } from "react";
import type { z } from "zod";
import { csrfSchema } from "./contracts";

export const apiBase = (import.meta.env.VITE_API_BASE || "/api").replace(
  /\/$/,
  "",
);
export type RequestRecord = {
  id: number;
  method: string;
  path: string;
  status: number | null;
  duration: number;
  time: string;
  request?: unknown;
  response?: unknown;
  requestId?: string;
  problem?: string;
};
let records: RequestRecord[] = [];
const listeners = new Set<() => void>();
let sequence = 0;
const publish = () => {
  for (const listener of listeners) listener();
};
export function useRequests() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => records,
  );
}
export function clearRequests() {
  records = [];
  publish();
}
const secretKey =
  /password|passwd|token|authorization|cookie|secret|credential|stack|connectionstring|databaseurl/i;
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[вложенные данные]";
  if (typeof value === "string")
    return value
      .replace(/Bearer\s+[^\s]+/gi, "[скрыто]")
      .replace(
        /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
        "[JWT скрыт]",
      )
      .slice(0, 700);
  if (Array.isArray(value))
    return value.slice(0, 10).map((v) => redact(v, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 30)
        .map(([k, v]) => [
          k,
          secretKey.test(k.replace(/[_-]/g, ""))
            ? "[скрыто]"
            : redact(v, depth + 1),
        ]),
    );
  return value;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export const describeError = (error: unknown) =>
  error instanceof Error ? error.message : "Не удалось выполнить запрос.";
type Options = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};
const hints: Record<number, string> = {
  400: "Сервер отклонил данные. Проверь формат и правила валидации.",
  401: "Нужен вход в аккаунт: сервер не принял сессию.",
  403: "Сервер запретил действие. Проверь права владельца и CSRF-защиту.",
  404: "Маршрут ещё не реализован или запись не найдена. Сверь API-контракт.",
  409: "Конфликт: запись уже существует или операция с этим ключом отличается.",
  422: "Данные не прошли проверку на сервере.",
  429: "Слишком много запросов. Подожди перед следующей попыткой.",
  500: "Ошибка backend. Найди запрос в серверных логах.",
  502: "Прокси не получил ответ backend. Проверь npm run dev и адрес API.",
  503: "Сервис временно недоступен.",
  504: "Сервер не дождался ответа зависимости.",
};

async function send<T>(
  path: string,
  options: Options,
  decode: (response: Response, payload: unknown) => T | Promise<T>,
  binary = false,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 10000);
  const started = performance.now();
  const record: RequestRecord = {
    id: ++sequence,
    method: options.method || "GET",
    path,
    status: null,
    duration: 0,
    time: new Date().toLocaleTimeString("ru-RU"),
    request: path.startsWith("/auth/")
      ? "[данные авторизации скрыты]"
      : redact(options.body),
  };
  try {
    const response = await fetch(`${apiBase}${path}`, {
      method: record.method,
      credentials: "include",
      signal: controller.signal,
      headers: {
        Accept: binary ? "text/csv" : "application/json",
        ...(options.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
        ...options.headers,
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    record.status = response.status;
    record.requestId =
      response.headers.get("X-Request-Id")?.slice(0, 100) || undefined;
    let payload: unknown = undefined;
    const contentType = response.headers.get("Content-Type") || "";
    if (!binary || !response.ok) {
      const text = await response.text();
      try {
        payload = text ? JSON.parse(text) : undefined;
      } catch {
        payload = undefined;
      }
      record.response = path.startsWith("/auth/")
        ? "[ответ авторизации скрыт]"
        : payload === undefined && text
          ? `[Не JSON: ${contentType || "тип не указан"}, ${text.length} символов]`
          : redact(payload);
    } else {
      record.response = "[CSV-файл, содержимое не записывается в журнал]";
    }
    if (!response.ok)
      throw new ApiError(
        `${record.method} ${path.split("?")[0]} → ${response.status}. ${hints[response.status] || "Проверь ответ в панели запросов."}`,
        response.status,
      );
    return await decode(response, payload);
  } catch (error) {
    if (controller.signal.aborted) {
      const message = timedOut
        ? "Ответ не получен за 10 секунд. Для записи это НЕ означает, что сервер ничего не сохранил. Проверь состояние перед повтором."
        : "Запрос отменён.";
      record.problem = message;
      throw new ApiError(message, record.status);
    }
    const normalized =
      error instanceof ApiError
        ? error
        : new ApiError(
            "Нет соединения с API. Проверь запуск backend, адрес прокси и CORS.",
          );
    record.problem = normalized.message;
    throw normalized;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
    record.duration = Math.round(performance.now() - started);
    records = [record, ...records].slice(0, 30);
    publish();
  }
}
export function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options: Options = {},
): Promise<T> {
  return send(path, options, (response, payload) => {
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const fields = parsed.error.issues
        .slice(0, 4)
        .map((issue) => issue.path.join(".") || "корень ответа")
        .join(", ");
      throw new ApiError(
        `HTTP ${response.status}, но формат ответа не совпал с контрактом: ${fields}. Проверь docs/api-contract.md.`,
        response.status,
      );
    }
    return parsed.data;
  });
}
async function mutationOptions(
  method: string,
  body: unknown,
  protectedWrite: boolean,
  extra: Record<string, string> = {},
): Promise<Options> {
  // Fetch a fresh token so login/logout rotation cannot leave a stale token cached.
  const csrf = protectedWrite ? await request("/auth/csrf", csrfSchema) : null;
  return {
    method,
    body,
    headers: { ...extra, ...(csrf ? { "X-CSRF-Token": csrf.csrfToken } : {}) },
  };
}
export async function mutate<T>(
  path: string,
  method: string,
  body: unknown,
  schema: z.ZodType<T>,
  protectedWrite = true,
  extra: Record<string, string> = {},
) {
  return request(
    path,
    schema,
    await mutationOptions(method, body, protectedWrite, extra),
  );
}
export async function remove(
  path: string,
  protectedWrite = true,
  method = "DELETE",
) {
  return send(
    path,
    await mutationOptions(method, undefined, protectedWrite),
    (response) => {
      if (response.status !== 204)
        throw new ApiError(
          "Ожидался HTTP 204 без тела ответа. Сверь контракт.",
          response.status,
        );
    },
  );
}
export async function downloadExport(id: string) {
  return send(
    `/exports/${encodeURIComponent(id)}/file`,
    {},
    async (response) => {
      if (
        !(response.headers.get("Content-Type") || "")
          .toLowerCase()
          .includes("text/csv")
      )
        throw new ApiError(
          "Ожидался CSV с Content-Type: text/csv, а не HTML или JSON.",
          response.status,
        );
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = `applications-${id}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    },
    true,
  );
}
