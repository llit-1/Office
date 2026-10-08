import { useId, useMemo, useState } from "react";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import Button from "../../../Components/Button/Button";
import LoadingSpinner from "../../../Components/LoadingSpinner/LoadingSpinner";
import Select from "../../../Components/Select/Select";
import { getFriendlyErrorMessage } from "../../../Services/api";
import { lookupDeclaration } from "../deliveryMenu.api";
import type { Declaration } from "../deliveryMenu.types";
import {
  formatDeclarationDate,
  matchDeclarations,
  selectionTnvedOptions,
  type DeclarationSelection,
} from "../declarations.utils";
import styles from "../DeliveryMenu.module.css";

type DeclarationFieldProps = {
  declarations: Declaration[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  selection: DeclarationSelection | null;
  onSelectionChange: (selection: DeclarationSelection | null) => void;
  tnvedCode: string;
  onTnvedCodeChange: (code: string) => void;
  tnvedError: string;
  disabled: boolean;
  /** Для новой позиции декларация обязательна. */
  required?: boolean;
};

const MAX_SUGGESTIONS = 30;

export default function DeclarationField({
  declarations,
  loading,
  error,
  onRetry,
  selection,
  onSelectionChange,
  tnvedCode,
  onTnvedCodeChange,
  tnvedError,
  disabled,
  required = false,
}: DeclarationFieldProps) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMessage, setLookupMessage] = useState("");

  const matches = useMemo(() => matchDeclarations(declarations, query), [declarations, query]);
  const trimmedQuery = query.trim();
  // Реестр запрашиваем, только если в нашей базе по введённому тексту нет ни одной декларации — так исключаем дубли.
  const canLookup = !loading && !error && trimmedQuery.length > 0 && matches.length === 0;

  const choose = (next: DeclarationSelection | null) => {
    setLookupMessage("");
    onSelectionChange(next);
    const options = selectionTnvedOptions(next);
    onTnvedCodeChange(options.length === 1 ? options[0].code ?? "" : "");
  };

  const runLookup = async () => {
    if (!canLookup || lookupLoading) return;
    setLookupLoading(true);
    setLookupMessage("");
    try {
      const result = await lookupDeclaration(trimmedQuery);
      if (!result) {
        setLookupMessage("Декларация не найдена в реестре. Проверьте номер.");
        return;
      }
      choose({ kind: "lookup", declaration: result });
      setQuery("");
    } catch (lookupError) {
      setLookupMessage(getFriendlyErrorMessage(lookupError, "Не удалось выполнить поиск в реестре."));
    } finally {
      setLookupLoading(false);
    }
  };

  const options = selectionTnvedOptions(selection);

  return (
    <section className={styles.declarationField} aria-labelledby={`${inputId}-title`}>
      <div className={styles.declarationHeading}>
        <strong id={`${inputId}-title`}>Декларация соответствия{required ? " *" : ""}</strong>
        <small>Нужна Яндексу по закону о платформенной экономике</small>
      </div>

      {selection ? (
        <div className={styles.declarationCard}>
          <div className={styles.declarationCardHeader}>
            <strong>{selection.declaration.docNumber || "Номер не указан"}</strong>
            {selection.kind === "lookup" ? (
              <span className={`${styles.declarationBadge} ${styles.declarationBadgeNew}`}>Из реестра · сохранится с позицией</span>
            ) : selection.expired ? (
              <span className={`${styles.declarationBadge} ${styles.declarationBadgeExpired}`}>Не действует</span>
            ) : (
              <span className={`${styles.declarationBadge} ${styles.declarationBadgeValid}`}>Действует</span>
            )}
          </div>
          <dl className={styles.declarationDetails}>
            {selection.declaration.manufacturerName ? (
              <div><dt>Изготовитель</dt><dd>{selection.declaration.manufacturerName}</dd></div>
            ) : null}
            {selection.declaration.productName ? (
              <div><dt>Продукция</dt><dd className={styles.declarationClamp}>{selection.declaration.productName}</dd></div>
            ) : null}
            {selection.declaration.dateFrom || selection.declaration.dateTo ? (
              <div>
                <dt>Срок действия</dt>
                <dd>
                  {formatDeclarationDate(selection.declaration.dateFrom) || "—"} — {formatDeclarationDate(selection.declaration.dateTo) || "бессрочно"}
                </dd>
              </div>
            ) : null}
          </dl>

          {options.length > 1 ? (
            <div className={`${styles.declarationTnved} ${tnvedError ? styles.declarationInvalid : ""}`}>
              <Select
                label="Код ТН ВЭД позиции *"
                options={options.map((item) => ({
                  value: item.code ?? "",
                  label: item.name ? `${item.code} — ${item.name}` : item.code ?? "",
                }))}
                placeholder="Выберите код"
                value={tnvedCode}
                search
                disabled={disabled}
                onChange={(event) => onTnvedCodeChange(event.target.value)}
              />
              {tnvedError ? <p className={styles.declarationError}>{tnvedError}</p> : null}
            </div>
          ) : options.length === 1 ? (
            <p className={styles.declarationHint}>
              Код ТН ВЭД: <b>{options[0].code}</b>{options[0].name ? ` — ${options[0].name}` : ""}
            </p>
          ) : (
            <p className={styles.declarationHint}>В декларации нет кодов ТН ВЭД.</p>
          )}

          <div className={styles.declarationActions}>
            <Button variant="secondary" size="sm" disabled={disabled} onClick={() => choose(null)}>
              Отвязать декларацию
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.declarationPicker}>
          <label className={styles.searchField} htmlFor={inputId}>
            <SearchRoundedIcon />
            <input
              id={inputId}
              value={query}
              disabled={disabled}
              placeholder="Номер декларации, например ЕАЭС N RU Д-RU.РА01.В.68440/24"
              aria-label="Поиск декларации"
              onChange={(event) => {
                setQuery(event.target.value);
                setLookupMessage("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void runLookup();
                }
              }}
            />
          </label>

          {loading ? (
            <div className={styles.declarationState}><LoadingSpinner size={24} /></div>
          ) : error ? (
            <div className={styles.declarationState} role="alert">
              <span>{error}</span>
              <Button variant="secondary" size="sm" onClick={onRetry}>Повторить</Button>
            </div>
          ) : matches.length > 0 ? (
            <ul className={styles.declarationList} aria-label="Декларации в базе">
              {matches.slice(0, MAX_SUGGESTIONS).map((declaration) => (
                <li key={declaration.id}>
                  <button
                    type="button"
                    className={styles.declarationOption}
                    disabled={disabled}
                    onClick={() => choose({ kind: "saved", declaration, expired: false })}
                  >
                    <strong>{declaration.docNumber}</strong>
                    <small>
                      {declaration.manufacturerName}
                      {declaration.dateTo ? ` · до ${formatDeclarationDate(declaration.dateTo)}` : ""}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.declarationState}>
              <span>{trimmedQuery ? "В базе нет такой декларации." : "В базе пока нет действующих деклараций."}</span>
              {canLookup ? (
                <Button
                  variant="primary"
                  size="sm"
                  leadingIcon={<SearchRoundedIcon />}
                  loading={lookupLoading}
                  disabled={disabled}
                  onClick={() => void runLookup()}
                >
                  Поиск в реестре
                </Button>
              ) : null}
            </div>
          )}
          {lookupMessage ? <p className={styles.declarationError} role="alert">{lookupMessage}</p> : null}
        </div>
      )}
    </section>
  );
}
