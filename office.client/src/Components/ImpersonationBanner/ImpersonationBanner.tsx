import { useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../../Store";
import Button from "../Button/Button";
import { getFriendlyErrorMessage, stopImpersonation } from "../../Services/api";
import styles from "./ImpersonationBanner.module.css";

/** Полоса «под чужой учёткой»: видна на каждой странице, пока админ не вернётся к себе. */
export default function ImpersonationBanner() {
  const impersonatedBy = useSelector((state: RootState) => state.auth.impersonatedBy);
  const fullName = useSelector((state: RootState) => state.auth.fullName);
  const userId = useSelector((state: RootState) => state.auth.id);
  const [returning, setReturning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!impersonatedBy) return null;

  const handleReturn = async () => {
    setReturning(true);
    setError(null);
    try {
      await stopImpersonation(userId === null ? "/Users" : `/Users/Edit/${userId}`);
    } catch (returnError) {
      setError(getFriendlyErrorMessage(returnError, "Не удалось вернуться"));
      setReturning(false);
    }
  };

  return (
    <div className={styles.banner} role="status">
      <span>Вы вошли как {fullName ?? "другой пользователь"}</span>
      {error && <span role="alert">{error}</span>}
      <Button size="sm" onClick={() => void handleReturn()} loading={returning}>
        Вернуться
      </Button>
    </div>
  );
}
