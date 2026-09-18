import { useState, type FormEvent } from "react";
import { mutate, remove } from "./api";
import {
  applicationReplySchema,
  jobReplySchema,
  jobsPageSchema,
  type Job,
  type User,
} from "./contracts";
import { Empty, ErrorNotice, Icon, Modal, Pager } from "./components";
import { useQuery } from "./hooks";

export function Jobs({ day, user }: { day: number; user: User | null }) {
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("");
  const [filters, setFilters] = useState({ q: "", company: "" });
  const [sort, setSort] = useState("created_at_desc");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Job | "new" | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [message, setMessage] = useState("");
  const params = new URLSearchParams({
    page: String(page),
    limit: "10",
    sort,
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.company ? { company: filters.company } : {}),
  });
  const { data, error, busy, reload } = useQuery(
    `/jobs?${params}`,
    jobsPageSchema,
  );
  const canWrite = day === 2 || Boolean(user);
  function search(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setFilters({ q: query.trim(), company: company.trim() });
  }
  async function deleteJob(job: Job) {
    if (
      !window.confirm(
        `Удалить вакансию «${job.title}»? Это запрос к настоящему API.`,
      )
    )
      return;
    setPending(true);
    setActionError(null);
    setMessage("");
    try {
      await remove(`/jobs/${encodeURIComponent(job.id)}`, day >= 3);
      setMessage("Сервер подтвердил удаление.");
      reload();
    } catch (reason) {
      setActionError(reason);
    } finally {
      setPending(false);
    }
  }
  async function apply(job: Job) {
    setPending(true);
    setActionError(null);
    setMessage("");
    try {
      await mutate(
        "/applications",
        "POST",
        { jobId: job.id },
        applicationReplySchema,
      );
      setMessage(
        `Отклик на «${job.title}» сохранён. Он доступен в разделе «Мои отклики».`,
      );
    } catch (reason) {
      setActionError(reason);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <div className="section-head">
        <div>
          <span className="eyebrow">ДАННЫЕ ИЗ ТВОЕГО API</span>
          <h1>
            Вакансии <span className="count">{data?.total ?? "—"}</span>
          </h1>
          <p>Читай, фильтруй и изменяй настоящие записи PostgreSQL.</p>
        </div>
        <button
          className="btn primary"
          disabled={!canWrite || pending}
          onClick={() => setEditing("new")}
        >
          <Icon name="plus" />
          Новая вакансия
        </button>
      </div>
      <div className="lesson-note">
        <Icon name="code" />
        <div>
          <strong>День 2 · От SQL к живому приложению</strong>
          <p>
            Реализуй <code>GET /jobs</code>. Для наполнения сначала создай
            таблицы, затем запусти <code>npm run seed:base</code>. Ошибка 404 до
            реализации маршрута — ожидаема.
          </p>
        </div>
      </div>
      {day >= 3 && !user && (
        <div className="notice">
          Для изменения вакансий и создания откликов войди во вкладке «Аккаунт».
          Права на каждую запись всё равно проверяет backend.
        </div>
      )}
      <form className="filters" onSubmit={search}>
        <label className="search-field">
          <Icon name="search" />
          <input
            aria-label="Поиск вакансий"
            placeholder="Название вакансии..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <input
          aria-label="Компания"
          placeholder="Компания"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
        <button className="btn secondary" type="submit">
          Найти
        </button>
      </form>
      <div className="list-meta">
        <span>
          {busy
            ? "Загружаем ответ сервера..."
            : data
              ? `Найдено: ${data.total}`
              : "Ожидаем данные backend"}
        </span>
        <div>
          <select
            aria-label="Сортировка"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="created_at_desc">Сначала новые</option>
            <option value="created_at_asc">Сначала старые</option>
          </select>
          <button
            className="icon-btn"
            onClick={reload}
            disabled={busy}
            aria-label="Обновить вакансии"
          >
            <Icon name="refresh" />
          </button>
        </div>
      </div>
      <ErrorNotice error={error || actionError} />
      {message && (
        <div className="notice success" role="status">
          {message}
        </div>
      )}
      {busy && (
        <div className="loading" role="status">
          Загрузка вакансий...
        </div>
      )}
      {!busy && data?.items.length === 0 && (
        <Empty title="Пока ни одной вакансии">
          API ответил, но список пуст. Добавь запись или подготовь данные
          командой seeder. При активном фильтре попробуй изменить запрос.
        </Empty>
      )}
      {data && (
        <div className="job-list">
          {data.items.map((job) => (
            <article className="job-card" key={job.id}>
              <div className="company-avatar">
                {job.company.slice(0, 2).toUpperCase()}
              </div>
              <div className="job-copy">
                <span className="muted">{job.company}</span>
                <h3>{job.title}</h3>
                <small>
                  ID {job.id}
                  {job.createdAt &&
                    ` · ${Number.isNaN(Date.parse(job.createdAt)) ? job.createdAt : new Date(job.createdAt).toLocaleDateString("ru-RU")}`}
                </small>
              </div>
              <div className="job-actions">
                {day >= 3 && (
                  <button
                    className="btn secondary"
                    disabled={!user || pending}
                    onClick={() => void apply(job)}
                  >
                    Откликнуться
                  </button>
                )}
                <button
                  className="icon-btn"
                  disabled={!canWrite || pending}
                  onClick={() => setEditing(job)}
                  aria-label={`Изменить ${job.title}`}
                >
                  <Icon name="edit" />
                </button>
                <button
                  className="icon-btn danger"
                  disabled={!canWrite || pending}
                  onClick={() => void deleteJob(job)}
                  aria-label={`Удалить ${job.title}`}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {data && (
        <Pager
          page={page}
          limit={10}
          total={data.total}
          onPage={setPage}
          busy={busy}
        />
      )}
      {editing && (
        <JobEditor
          job={editing}
          protectedWrite={day >= 3}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setMessage(
              "Сервер подтвердил сохранение. Список загружается заново.",
            );
            reload();
          }}
        />
      )}
    </>
  );
}
function JobEditor({
  job,
  protectedWrite,
  onClose,
  onSaved,
}: {
  job: Job | "new";
  protectedWrite: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(job === "new" ? "" : job.title);
  const [company, setCompany] = useState(job === "new" ? "" : job.company);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await mutate(
        job === "new" ? "/jobs" : `/jobs/${encodeURIComponent(job.id)}`,
        job === "new" ? "POST" : "PATCH",
        { title: title.trim(), company: company.trim() },
        jobReplySchema,
        protectedWrite,
      );
      onSaved();
    } catch (reason) {
      setError(reason);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={job === "new" ? "Новая вакансия" : "Редактирование вакансии"}
      onClose={onClose}
      busy={busy}
    >
      <form className="stack" onSubmit={save}>
        <label>
          Название
          <input
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Компания
          <input
            required
            maxLength={200}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </label>
        <p className="muted">
          Автор определяется сервером. Клиент не отправляет чужой userId.
        </p>
        <ErrorNotice error={error} />
        <button
          className="btn primary"
          disabled={busy || !title.trim() || !company.trim()}
        >
          {busy ? "Сохраняем..." : "Сохранить"}
        </button>
      </form>
    </Modal>
  );
}
