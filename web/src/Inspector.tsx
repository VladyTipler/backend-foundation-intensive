import { clearRequests, useRequests } from "./api";
import { Icon } from "./components";

export function Inspector() {
  const records = useRequests();
  const latest = records[0];
  return (
    <aside className="inspector" aria-label="Панель запросов">
      <div className="inspector-title">
        <div className="row">
          <Icon name="code" />
          <strong>Под капотом</strong>
        </div>
        <span className="live-label">LIVE</span>
      </div>
      <p className="inspector-intro">
        Каждое действие — настоящий HTTP-запрос. Посмотри, что отвечает твой
        сервер.
      </p>
      <div className="request-summary">
        <span className="eyebrow">ПОСЛЕДНИЙ ОТВЕТ</span>
        <div>
          <strong className={latest?.problem ? "text-error" : ""}>
            {latest ? (latest.status ?? "СЕТЬ") : "—"}
          </strong>
          <span>{latest ? `${latest.duration} мс` : "Нет запросов"}</span>
        </div>
        <code>
          {latest
            ? `${latest.method} ${latest.path.split("?")[0]}`
            : "Сначала проверь соединение"}
        </code>
      </div>
      <div className="inspector-tools">
        <span>Журнал · {records.length}/30</span>
        <button onClick={clearRequests} disabled={!records.length}>
          Очистить
        </button>
      </div>
      <div className="request-log">
        {records.map((record) => (
          <details key={record.id} className="request-record">
            <summary>
              <span className={`method ${record.method.toLowerCase()}`}>
                {record.method}
              </span>
              <span className="request-path" title={record.path}>
                {record.path}
              </span>
              <span className={record.problem ? "text-error" : "text-ok"}>
                {record.status ?? "ERR"}
              </span>
            </summary>
            <div className="request-detail">
              <small>
                {record.time} · {record.duration} мс
              </small>
              {record.problem && <p className="text-error">{record.problem}</p>}
              {record.requestId && (
                <p>
                  Request ID: <code>{record.requestId}</code>
                </p>
              )}
              <span className="eyebrow">ОТПРАВЛЕНО</span>
              <pre>
                {JSON.stringify(record.request ?? "(без тела)", null, 2)}
              </pre>
              <span className="eyebrow">ПОЛУЧЕНО</span>
              <pre>
                {JSON.stringify(record.response ?? "(без тела)", null, 2)}
              </pre>
            </div>
          </details>
        ))}
      </div>
      <div className="inspector-foot">
        <Icon name="lock" size={16} />
        <p>
          Ответы авторизации, пароли и токены скрыты. Журнал хранится только в
          памяти вкладки; массивы показаны частично.
        </p>
      </div>
    </aside>
  );
}
