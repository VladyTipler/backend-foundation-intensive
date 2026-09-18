import { useState, type FormEvent } from "react";
import { mutate, remove } from "./api";
import { userReplySchema, type User } from "./contracts";
import { ErrorNotice, Icon } from "./components";

export function Auth({
  user,
  onUser,
  onRefresh,
  checking,
}: {
  user: User | null;
  onUser: (user: User | null) => void;
  onRefresh: () => void;
  checking: boolean;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await mutate(
        `/auth/${mode}`,
        "POST",
        {
          email: email.trim(),
          password,
          ...(mode === "register" ? { name: name.trim() } : {}),
        },
        userReplySchema,
      );
      setPassword("");
      onUser(result.user);
    } catch (reason) {
      setPassword("");
      setError(reason);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError(null);
    try {
      await remove("/auth/logout", true, "POST");
      onUser(null);
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
          <span className="eyebrow">ДЕНЬ 3 · AUTHENTICATION</span>
          <h1>Аккаунт</h1>
          <p>
            Узнай, кто делает запрос, прежде чем разрешать ему менять данные.
          </p>
        </div>
      </div>
      <div className="auth-grid">
        <section className="panel">
          <div className="panel-icon">
            <Icon name="user" size={26} />
          </div>
          {user ? (
            <>
              <h2>{user.name}</h2>
              <p>{user.email}</p>
              <p className="muted">
                ID пользователя: {user.id}. Сессия подтверждена backend.
              </p>
              <ErrorNotice error={error} />
              <div className="row">
                <button
                  className="btn secondary"
                  disabled={checking}
                  onClick={onRefresh}
                >
                  Проверить сессию
                </button>
                <button
                  className="btn primary"
                  disabled={busy}
                  onClick={() => void logout()}
                >
                  {busy ? "Выходим..." : "Выйти"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="tabs">
                <button
                  className={mode === "login" ? "active" : ""}
                  onClick={() => {
                    setMode("login");
                    setError(null);
                  }}
                >
                  Вход
                </button>
                <button
                  className={mode === "register" ? "active" : ""}
                  onClick={() => {
                    setMode("register");
                    setError(null);
                  }}
                >
                  Регистрация
                </button>
              </div>
              <form className="stack" onSubmit={submit}>
                {mode === "register" && (
                  <label>
                    Имя
                    <input
                      required
                      maxLength={100}
                      value={name}
                      autoComplete="name"
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                )}
                <label>
                  Email
                  <input
                    required
                    type="email"
                    value={email}
                    autoComplete="username"
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label>
                  Пароль
                  <input
                    required
                    type="password"
                    minLength={mode === "register" ? 8 : 1}
                    maxLength={128}
                    value={password}
                    autoComplete={
                      mode === "register" ? "new-password" : "current-password"
                    }
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <ErrorNotice error={error} />
                <button className="btn primary" disabled={busy}>
                  {busy
                    ? "Проверяем..."
                    : mode === "login"
                      ? "Войти"
                      : "Создать аккаунт"}
                </button>
              </form>
            </>
          )}
        </section>
        <aside className="lesson-card">
          <span className="eyebrow">КАК ЭТО РАБОТАЕТ</span>
          <h2>
            Не логин на словах.
            <br />
            Настоящая сессия.
          </h2>
          <p>
            Клиент отправляет данные в API. Сервер проверяет пароль и
            устанавливает <code>HttpOnly</code> cookie — JavaScript не читает
            её.
          </p>
          <p>
            Перед изменением данных клиент получает <code>GET /auth/csrf</code>{" "}
            и отправляет токен в <code>X-CSRF-Token</code>. Проверять его должен
            backend.
          </p>
          <p>
            После перезагрузки <code>GET /auth/me</code> восстанавливает
            пользователя. В localStorage нет паролей или токенов.
          </p>
          <div className="notice">
            У пользователей seeder нет готовых паролей. Для этой практики
            зарегистрируй новый учебный аккаунт.
          </div>
        </aside>
      </div>
    </>
  );
}
