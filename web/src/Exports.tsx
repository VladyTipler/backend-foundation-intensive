import { useEffect, useState, type FormEvent } from "react";
import { apiBase, downloadExport, mutate, request } from "./api";
import { exportReplySchema, type ExportJob, type User } from "./contracts";
import { Empty, ErrorNotice, Icon } from "./components";

const labels = {
  queued: "В очереди",
  processing: "Готовится",
  completed: "Готово",
  failed: "Не удалось выполнить",
};
function stored(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function remember(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* Storage can be disabled; the interface remains usable. */
  }
}
export function Exports({ user }: { user: User | null }) {
  const namespace = `job-tracker:${apiBase}:${user?.id ?? "guest"}`;
  const [id, setId] = useState(() => stored(`${namespace}:export`) || "");
  const [input, setInput] = useState(id);
  const [job, setJob] = useState<ExportJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [polling, setPolling] = useState(Boolean(id));
  const [revision, setRevision] = useState(0);
  const [key, setKey] = useState(
    () => stored(`${namespace}:pending-key`) || crypto.randomUUID(),
  );
  const [pollNote, setPollNote] = useState("");
  useEffect(() => {
    if (!id || !user || !polling) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 5 * 60 * 1000;
    async function poll() {
      try {
        const result = await request(
          `/exports/${encodeURIComponent(id)}`,
          exportReplySchema,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setJob(result.export);
        setError(null);
        if (
          result.export.status === "completed" ||
          result.export.status === "failed"
        ) {
          setPolling(false);
          return;
        }
        if (Date.now() >= deadline) {
          setPolling(false);
          setPollNote(
            "Проверка приостановлена через 5 минут. Сама задача на сервере не отменена.",
          );
          return;
        }
        timer = setTimeout(() => void poll(), 2000);
      } catch (reason) {
        if (!controller.signal.aborted) {
          setError(reason);
          setPolling(false);
        }
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, user, polling, revision]);
  async function create() {
    setBusy(true);
    setError(null);
    setPollNote("");
    remember(`${namespace}:pending-key`, key);
    try {
      const result = await mutate(
        "/exports",
        "POST",
        { format: "csv" },
        exportReplySchema,
        true,
        { "Idempotency-Key": key },
      );
      setJob(result.export);
      setId(result.export.id);
      setInput(result.export.id);
      setPolling(true);
      setRevision((v) => v + 1);
      remember(`${namespace}:export`, result.export.id);
      remember(`${namespace}:pending-key`, null);
      setKey(crypto.randomUUID());
    } catch (reason) {
      setError(reason);
    } finally {
      setBusy(false);
    }
  }
  function resume(event: FormEvent) {
    event.preventDefault();
    const value = input.trim();
    if (!/^[1-9]\d*$/.test(value)) return;
    setId(value);
    setJob(null);
    setError(null);
    setPollNote("");
    setPolling(true);
    setRevision((v) => v + 1);
    remember(`${namespace}:export`, value);
  }
  async function download() {
    setBusy(true);
    setError(null);
    try {
      await downloadExport(id);
    } catch (reason) {
      setError(reason);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="section-head">
        <div>
          <span className="eyebrow">ДЕНЬ 4 · ФОНОВЫЕ ЗАДАЧИ</span>
          <h1>Экспорт откликов</h1>
          <p>HTTP принимает задачу. Worker выполняет. Ты видишь результат.</p>
        </div>
      </div>
      {!user ? (
        <Empty title="Войди, чтобы создать экспорт">
          Файл содержит отклики текущего пользователя. Backend обязан проверять
          владельца и при проверке статуса, и при скачивании.
        </Empty>
      ) : (
        <>
          <section className="export-hero">
            <div className="export-symbol">
              <Icon name="download" size={40} />
            </div>
            <div>
              <span className="eyebrow">ТВОИ ДАННЫЕ В CSV</span>
              <h2>Не держим запрос открытым.</h2>
              <p>
                Создай экспорт и наблюдай, как задача проходит очередь.
                <br />
                Здесь нет искусственного прогресса: статус приходит из API.
              </p>
              <button
                className="btn primary"
                onClick={() => void create()}
                disabled={busy || polling}
              >
                {busy ? "Отправляем запрос..." : "Экспортировать отклики"}
                <Icon name="arrow" />
              </button>
            </div>
          </section>
          <ErrorNotice error={error} />
          {job && (
            <section className="panel">
              <div className="row between">
                <h3>Экспорт #{job.id}</h3>
                <span className={`status ${job.status}`}>
                  {labels[job.status]}
                </span>
              </div>
              {(job.status === "queued" || job.status === "processing") && (
                <progress
                  max={100}
                  value={job.progress}
                  aria-label="Прогресс экспорта"
                />
              )}
              {job.status === "completed" && (
                <button
                  className="btn primary"
                  disabled={busy}
                  onClick={() => void download()}
                >
                  <Icon name="download" />
                  Скачать CSV
                </button>
              )}
              {job.status === "failed" && (
                <p>
                  Worker сообщил об ошибке. Проверь его логи и failed jobs;
                  автоматического повтора операции в клиенте нет.
                </p>
              )}
              <p className="muted">
                {polling
                  ? "Проверяем статус раз в 2 секунды, без параллельных запросов."
                  : "Автоматическая проверка остановлена."}
              </p>
            </section>
          )}
          {pollNote && <div className="notice">{pollNote}</div>}
          <form className="panel row" onSubmit={resume}>
            <label className="grow">
              Продолжить по ID экспорта
              <input
                aria-label="ID экспорта"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                pattern="[1-9][0-9]*"
                required
                placeholder="Например, 42"
              />
            </label>
            <button className="btn secondary" disabled={busy}>
              Проверить статус
            </button>
          </form>
          <div className="lesson-note">
            <Icon name="code" />
            <div>
              <strong>А если ответ потерялся?</strong>
              <p>
                Повторная попытка создания использует тот же Idempotency-Key,
                пока сервер не подтвердил результат. Ключ сохраняется в этой
                вкладке. Гарантию отсутствия дублей реализует backend.
              </p>
            </div>
          </div>
        </>
      )}
    </>
  );
}
