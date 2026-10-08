import { useEffect, useRef, useState, type FormEvent } from "react";
import Button from "../../Components/Button/Button";
import Select from "../../Components/Select/Select";
import Textarea from "../../Components/Textarea/Textarea";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import { getFriendlyErrorMessage } from "../../Services/api";
import { getCashLocations, sendCashMessage, type CashLocation } from "./cash.api";
import useSectionTitle from "./useSectionTitle";
import styles from "./SectionPage.module.css";

export default function CashMessagesPage() {
  useSectionTitle("Сообщения на кассы", "/Cash");
  const [locations, setLocations] = useState<CashLocation[]>([]);
  const [location, setLocation] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    getCashLocations().then((data) => { if (active) setLocations(data); })
      .catch((reason) => { if (active) setLoadError(getFriendlyErrorMessage(reason, "Не удалось загрузить торговые точки.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (sendingRef.current) return;
    const target = locations.find((entry) => entry.guid === location);
    if (!target || !message.trim()) {
      setError("Выберите торговую точку и введите сообщение.");
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setError("");
    setResult("");
    try {
      await sendCashMessage(target.guid, message.trim());
      setResult(`Сервис принял запрос на отправку сообщения в «${target.name}».`);
      setMessage("");
    } catch (reason) {
      setError(getFriendlyErrorMessage(reason, "Не удалось подтвердить отправку сообщения. Проверьте результат на кассе перед повторной отправкой."));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return <main className={styles.page}>
    {loading ? <LoadingSpinner label="Загружаем торговые точки…" /> : loadError ? <div role="alert">
      <p className={styles.error}>{loadError}</p><Button onClick={() => setAttempt((value) => value + 1)}>Повторить</Button>
    </div> : locations.length === 0 ? <p>Нет доступных торговых точек с кассами.</p> : <form className={styles.form} onSubmit={(event) => void send(event)}>
      <Select label="Торговая точка" options={locations.map((entry) => ({ value: entry.guid, label: entry.name }))}
        value={location} onChange={(event) => { setLocation(event.target.value); setResult(""); setError(""); }}
        placeholder="Выберите торговую точку" search disabled={sending} />
      <Textarea label="Сообщение" value={message} onChange={(event) => { setMessage(event.target.value); setResult(""); setError(""); }}
        rows={6} placeholder="Текст сообщения для сотрудников" disabled={sending} />
      {error && <p role="alert" className={`${styles.status} ${styles.error}`}>{error}</p>}
      {result && <p role="status" className={styles.status}>{result}</p>}
      <Button type="submit" variant="primary" loading={sending} disabled={sending || !location || !message.trim()}>Отправить сообщение</Button>
    </form>}
  </main>;
}
