import { useState } from "react";
import { mutate, remove } from "./api";
import {
  applicationsPageSchema,
  applicationReplySchema,
  statuses,
  statusNames,
  type Application,
  type User,
} from "./contracts";
import { Empty, ErrorNotice, Icon, Pager } from "./components";
import { useQuery } from "./hooks";

export function Applications({ user }: { user: User | null }) {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const params = new URLSearchParams({
    page: String(page),
    limit: "10",
    ...(status ? { status } : {}),
  });
  const { data, error, busy, reload } = useQuery(
    `/applications?${params}`,
    applicationsPageSchema,
    Boolean(user),
  );
  async function change(item: Application, nextStatus: string) {
    setPending(true);
    setActionError(null);
    try {
      await mutate(
        `/applications/${encodeURIComponent(item.id)}`,
        "PATCH",
        { status: nextStatus },
        applicationReplySchema,
      );
      reload();
    } catch (reason) {
      setActionError(reason);
    } finally {
      setPending(false);
    }
  }
  async function discard(item: Application) {
    if (!window.confirm("Удалить этот отклик из базы?")) return;
    setPending(true);
    setActionError(null);
    try {
      await remove(`/applications/${encodeURIComponent(item.id)}`);
      reload();
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
          <span className="eyebrow">ДЕНЬ 3 · СВЯЗИ И ПРАВА</span>
          <h1>
            Мои отклики <span className="count">{data?.total ?? "—"}</span>
          </h1>
          <p>Один пользователь. Несколько вакансий. Своя история откликов.</p>
        </div>
        <button
          className="btn secondary"
          disabled={!user || busy}
          onClick={reload}
        >
          <Icon name="refresh" />
          Обновить
        </button>
      </div>
      <div className="lesson-note">
        <Icon name="lock" />
        <div>
          <strong>Фильтрация по владельцу — задача сервера</strong>
          <p>
            Клиент не передаёт userId. Backend берёт его из проверенной сессии и
            возвращает только её отклики. Скрытая кнопка не заменяет проверку
            прав.
          </p>
        </div>
      </div>
      {!user ? (
        <Empty title="Сначала войди в аккаунт">
          Открой «Аккаунт», зарегистрируйся и войди. Затем выбери вакансию и
          нажми «Откликнуться».
        </Empty>
      ) : (
        <>
          <div className="list-meta">
            <span>Статус отклика</span>
            <select
              aria-label="Фильтр статуса"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Все статусы</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {statusNames[s]}
                </option>
              ))}
            </select>
          </div>
          <ErrorNotice error={error || actionError} />
          {busy && (
            <div className="loading" role="status">
              Загрузка откликов...
            </div>
          )}
          {data?.items.length === 0 && (
            <Empty title="Здесь появятся твои отклики">
              Нажми «Откликнуться» у вакансии. Ответ 409 при повторном отклике
              поможет проверить ограничение уникальности.
            </Empty>
          )}
          {data?.items.map((item) => (
            <article className="job-card" key={item.id}>
              <div className="company-avatar">
                <Icon name="list" />
              </div>
              <div className="job-copy">
                <span className="muted">{item.job.company}</span>
                <h3>{item.job.title}</h3>
                <small>
                  Отклик #{item.id} · вакансия #{item.job.id}
                </small>
              </div>
              <div className="job-actions">
                <select
                  aria-label={`Статус отклика ${item.id}`}
                  value={item.status}
                  disabled={pending}
                  onChange={(e) => void change(item, e.target.value)}
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {statusNames[s]}
                    </option>
                  ))}
                </select>
                <button
                  className="icon-btn danger"
                  aria-label={`Удалить отклик ${item.id}`}
                  disabled={pending}
                  onClick={() => void discard(item)}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </article>
          ))}
          {data && (
            <Pager
              page={page}
              total={data.total}
              limit={10}
              onPage={setPage}
              busy={busy}
            />
          )}
        </>
      )}
    </>
  );
}
