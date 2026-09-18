import { ErrorNotice, Icon } from "./components";
import { apiBase } from "./api";

export function Overview({
  connected,
  databaseTime,
  error,
  busy,
  onCheck,
  onStart,
}: {
  connected: boolean;
  databaseTime?: string;
  error: unknown;
  busy: boolean;
  onCheck: () => void;
  onStart: () => void;
}) {
  return (
    <>
      <div className="section-head">
        <div>
          <span className="eyebrow">BACKEND FOUNDATION INTENSIVE</span>
          <h1>Твоя лаборатория.</h1>
          <p>Готовый интерфейс. Твой backend. Настоящий результат.</p>
        </div>
        <span className="pill">Без демоданных</span>
      </div>
      <section className="hero">
        <div>
          <span className="hero-label">ОТ ЗАПРОСА ДО РЕЗУЛЬТАТА</span>
          <h2>
            Оживи приложение.
            <br />
            <em>Одним endpoint за раз.</em>
          </h2>
          <p>
            Фронтенд уже написан. Создавай таблицы, реализуй API и наблюдай, как
            знакомые кнопки начинают работать.
          </p>
          <button className="btn light" onClick={onStart}>
            Перейти к вакансиям
            <Icon name="arrow" />
          </button>
        </div>
        <div
          className="flow-art"
          aria-label="Браузер вызывает API, API обращается к PostgreSQL"
        >
          <div className="flow-node">
            <Icon name="grid" />
            <span>
              Браузер<small>Готовый клиент</small>
            </span>
            <span className="tiny-pill">UI</span>
          </div>
          <div className="flow-line">HTTP ↓</div>
          <div className="flow-node accent">
            <Icon name="code" />
            <span>
              Твой Node.js API<small>Здесь начинается практика</small>
            </span>
          </div>
          <div className="flow-line">SQL ↓</div>
          <div className="flow-node">
            <Icon name="list" />
            <span>
              PostgreSQL<small>Твои таблицы и данные</small>
            </span>
          </div>
        </div>
      </section>
      <div className="overview-grid">
        <section className="panel connection-panel">
          <div className="row between">
            <span className="eyebrow">ПРОВЕРКА ОКРУЖЕНИЯ</span>
            <span className={`dot ${connected ? "on" : ""}`} />
          </div>
          <h2>
            {busy
              ? "Проверяем соединение..."
              : connected
                ? "API и база на связи"
                : "Подключим твой backend"}
          </h2>
          <p>
            {connected
              ? "Сервер вернул время из PostgreSQL. Следующий шаг — создать таблицы в Дне 1."
              : "Запусти контейнеры и backend. Пустая база в Дне 0 — нормально: /health не требует таблиц."}
          </p>
          <div className="code-strip">
            <code>GET {apiBase}/health</code>
          </div>
          {databaseTime && <p className="muted">Время базы: {databaseTime}</p>}
          <button className="btn secondary" onClick={onCheck} disabled={busy}>
            <Icon name="refresh" />
            Проверить подключение
          </button>
          <ErrorNotice error={error} />
        </section>
        <section className="panel">
          <span className="eyebrow">ПОРЯДОК РАБОТЫ</span>
          <h2>Не нужно делать всё сразу.</h2>
          <p>
            Выбери свой день в меню слева. Клиент откроет только нужные разделы
            и не будет обращаться к будущим endpoint.
          </p>
          <div className="mini-steps">
            <div>
              <b>01</b>
              <span>
                Прочитай API-контракт
                <small>Какой запрос ожидает интерфейс</small>
              </span>
            </div>
            <div>
              <b>02</b>
              <span>
                Реализуй backend<small>SQL, обработчик и проверка данных</small>
              </span>
            </div>
            <div>
              <b>03</b>
              <span>
                Нажми кнопку и проверь ответ
                <small>Панель «Под капотом» покажет результат</small>
              </span>
            </div>
          </div>
        </section>
      </div>
      <section className="milestones">
        <div>
          <span>00—01</span>
          <h3>Основа</h3>
          <p>Окружение и SQL в Adminer</p>
        </div>
        <div>
          <span>02</span>
          <h3>Вакансии</h3>
          <p>Чтение, поиск и изменение</p>
        </div>
        <div>
          <span>03</span>
          <h3>Аккаунт</h3>
          <p>Сессия, права и отклики</p>
        </div>
        <div>
          <span>04—07</span>
          <h3>Весь путь</h3>
          <p>Экспорт, очередь и диагностика</p>
        </div>
      </section>
      <p className="bottom-note">
        Интерфейс — помощник, не автопроверка всего курса. Индексы проверяй
        через EXPLAIN, N+1 — в SQL-логах, а права — прямыми запросами к API.
      </p>
    </>
  );
}
