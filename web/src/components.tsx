import { useEffect, useRef, type ReactNode } from "react";
import { describeError } from "./api";

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    briefcase: (
      <>
        <rect x="3" y="7" width="18" height="14" rx="2" />
        <path d="M8 7V3h8v4M3 12c5 4 13 4 18 0M12 12v4" />
      </>
    ),
    list: (
      <>
        <path d="M8 5h13M8 12h13M8 19h13" />
        <path d="M3 5h.01M3 12h.01M3 19h.01" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    code: (
      <>
        <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    refresh: (
      <>
        <path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V6a4 4 0 0 1 8 0v4" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    edit: (
      <>
        <path d="m15 4 5 5-11 11H4v-5L15 4Zm-3 3 5 5" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.code}
    </svg>
  );
}
export function ErrorNotice({ error }: { error: unknown }) {
  return error ? (
    <div className="notice error" role="alert">
      <strong>Запрос не выполнен</strong>
      <p>{describeError(error)}</p>
      <small>
        Это сообщение от учебного клиента. Подробности — в панели запросов
        справа.
      </small>
    </div>
  ) : null;
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name="briefcase" size={28} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Pager({
  page,
  total,
  limit,
  onPage,
  busy,
}: {
  page: number;
  total: number;
  limit: number;
  onPage: (p: number) => void;
  busy: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="pager">
      <span>
        Страница {page} из {pages} · записей: {total}
      </span>
      <div>
        <button
          className="btn secondary"
          disabled={page <= 1 || busy}
          onClick={() => onPage(page - 1)}
        >
          Назад
        </button>
        <button
          className="btn secondary"
          disabled={page >= pages || busy}
          onClick={() => onPage(page + 1)}
        >
          Далее
        </button>
      </div>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      aria-labelledby="modal-title"
    >
      <div className="dialog-heading">
        <h2 id="modal-title">{title}</h2>
        <button
          className="icon-btn"
          disabled={busy}
          onClick={onClose}
          aria-label="Закрыть"
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function dayName(day: number) {
  return day < 2
    ? "Окружение и SQL"
    : day === 2
      ? "Node.js и ORM"
      : day === 3
        ? "HTTP и авторизация"
        : day === 4
          ? "Очереди и экспорт"
          : "Практика и диагностика";
}
