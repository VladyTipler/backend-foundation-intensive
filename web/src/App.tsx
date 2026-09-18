import { useEffect, useState } from "react";
import { ApiError, request } from "./api";
import { healthSchema, userReplySchema, type User } from "./contracts";
import { dayName, ErrorNotice, Icon } from "./components";
import { useQuery } from "./hooks";
import { Overview } from "./Overview";
import { Jobs } from "./Jobs";
import { Auth } from "./Auth";
import { Applications } from "./Applications";
import { Exports } from "./Exports";
import { Inspector } from "./Inspector";

type Page = "overview" | "jobs" | "applications" | "auth" | "exports";
const nav: { page: Page; title: string; icon: string; from: number }[] = [
  { page: "overview", title: "Обзор", icon: "grid", from: 0 },
  { page: "jobs", title: "Вакансии", icon: "briefcase", from: 2 },
  { page: "applications", title: "Мои отклики", icon: "list", from: 3 },
  { page: "auth", title: "Аккаунт", icon: "user", from: 3 },
  { page: "exports", title: "Экспорт", icon: "download", from: 4 },
];
function savedDay() {
  try {
    const value = Number(localStorage.getItem("job-tracker-day"));
    return Number.isInteger(value) && value >= 0 && value <= 7 ? value : 0;
  } catch {
    return 0;
  }
}
export default function App() {
  const [day, setDay] = useState(savedDay);
  const [page, setPage] = useState<Page>("overview");
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<unknown>(null);
  const [checking, setChecking] = useState(false);
  const [sessionRevision, setSessionRevision] = useState(0);
  const health = useQuery("/health", healthSchema);
  const authEnabled = day >= 3;
  useEffect(() => {
    if (!authEnabled) {
      setUser(null);
      setChecking(false);
      setAuthError(null);
      return;
    }
    const controller = new AbortController();
    setChecking(true);
    setAuthError(null);
    request("/auth/me", userReplySchema, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setUser(result.user);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setUser(null);
        if (!(error instanceof ApiError && error.status === 401))
          setAuthError(error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [authEnabled, sessionRevision]);
  function chooseDay(value: number) {
    setDay(value);
    try {
      localStorage.setItem("job-tracker-day", String(value));
    } catch {
      /* Optional preference. */
    }
    if ((nav.find((item) => item.page === page)?.from ?? 0) > value)
      setPage("overview");
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        К содержимому
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            setPage("overview");
          }}
        >
          <span className="brand-mark">
            jt<span>.</span>
          </span>
          <span>
            Job Tracker<small>BACKEND LAB</small>
          </span>
        </a>
        <div className="day-selector">
          <label htmlFor="course-day">МОЙ ЭТАП</label>
          <select
            id="course-day"
            value={day}
            onChange={(e) => chooseDay(Number(e.target.value))}
          >
            {Array.from({ length: 8 }, (_, value) => (
              <option key={value} value={value}>
                День {value} — {dayName(value)}
              </option>
            ))}
          </select>
          <p>Это навигация по урокам, не проверка готовности backend.</p>
        </div>
        <nav aria-label="Разделы приложения">
          {nav.map((item) => (
            <button
              key={item.page}
              className={`nav-item ${page === item.page ? "selected" : ""}`}
              disabled={day < item.from}
              onClick={() => setPage(item.page)}
              aria-current={page === item.page ? "page" : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.title}</span>
              {day < item.from && <small>день {item.from}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a
            href="https://github.com/VladyTipler/backend-foundation-intensive/blob/main/docs/api-contract.md"
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="code" />
            API-контракт
            <Icon name="arrow" size={16} />
          </a>
          <a
            href="https://github.com/VladyTipler/backend-foundation-intensive"
            target="_blank"
            rel="noreferrer"
          >
            Учебный репозиторий ↗
          </a>
          <div className="sidebar-tip">
            <Icon name="check" />
            <p>
              Ты пишешь backend.
              <br />
              Мы берём интерфейс на себя.
            </p>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Лаборатория <span>/</span>{" "}
            <strong>{nav.find((item) => item.page === page)?.title}</strong>
          </div>
          <div className="topbar-right">
            <span
              className={`connection ${health.data ? "connected" : ""}`}
              title="Результат последней проверки /health"
            >
              <span className="dot" />
              {health.busy
                ? "Проверяем API"
                : health.data
                  ? "API на связи"
                  : "API не проверен"}
            </span>
            <span className="user-chip">
              <Icon name="user" size={16} />
              {user?.name || "Ученик"}
            </span>
          </div>
        </header>
        <div className="content-grid">
          <main id="main" className="main-content">
            <div className="stage-label">
              ДЕНЬ {day}
              <span>{dayName(day)}</span>
            </div>
            {page === "overview" && (
              <Overview
                connected={Boolean(health.data)}
                databaseTime={health.data?.databaseTime}
                error={health.error}
                busy={health.busy}
                onCheck={health.reload}
                onStart={() => {
                  if (day < 2) chooseDay(2);
                  setPage("jobs");
                }}
              />
            )}{" "}
            {page === "jobs" && (
              <Jobs
                key={`jobs-${day}-${user?.id ?? "guest"}`}
                day={day}
                user={user}
              />
            )}{" "}
            {page === "auth" && (
              <>
                <ErrorNotice error={authError} />
                <Auth
                  user={user}
                  checking={checking}
                  onRefresh={() => setSessionRevision((v) => v + 1)}
                  onUser={(value) => {
                    setUser(value);
                    setSessionRevision((v) => v + 1);
                  }}
                />
              </>
            )}{" "}
            {page === "applications" && (
              <Applications key={user?.id || "guest"} user={user} />
            )}{" "}
            {page === "exports" && (
              <Exports key={user?.id || "guest"} user={user} />
            )}
          </main>
          <Inspector />
        </div>
        <footer>
          JOB TRACKER LAB{" "}
          <span>Сначала понимание. Потом код. Потом проверка.</span>
        </footer>
      </div>
    </div>
  );
}
