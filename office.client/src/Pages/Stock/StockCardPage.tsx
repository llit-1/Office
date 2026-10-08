import { useEffect, useId, useState } from "react";
import { useSearchParams } from "react-router-dom";
import QrCodeScannerRoundedIcon from "@mui/icons-material/QrCodeScannerRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SensorsRoundedIcon from "@mui/icons-material/SensorsRounded";
import Button from "../../Components/Button/Button";
import Input from "../../Components/Input/Input";
import StockObjectDetails from "./components/StockObjectDetails";
import { ScannerStatus, StockState } from "./components/StockUi";
import { toObjectCode } from "./stock.utils";
import useRfidScanner from "./useRfidScanner";
import shared from "./StockShared.module.css";
import styles from "./StockCard.module.css";

const CODE_HINT = "До 24 символов: цифры 0–9 и буквы A–F. Короткий код дополнится нулями слева.";
const CODE_ERROR = "Код должен содержать до 24 символов: цифры 0–9 и буквы A–F.";

export default function StockCardPage() {
  const helpId = useId();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCode = toObjectCode(searchParams.get("code") ?? "");
  const [input, setInput] = useState(activeCode ?? "");
  const [inputError, setInputError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [openCount, setOpenCount] = useState(0);

  useEffect(() => {
    if (activeCode) setInput(activeCode);
  }, [activeCode]);

  const openCode = (raw: string) => {
    const code = toObjectCode(raw);
    if (!code) {
      setInputError(CODE_ERROR);
      return;
    }

    setInputError("");
    setInput(code);
    setScanning(false);
    // Повторный поиск того же кода обновляет карточку.
    setOpenCount((count) => count + 1);
    if (code !== activeCode) setSearchParams({ code });
  };

  useRfidScanner(scanning, openCode);

  return (
    <div className={shared.page}>
      <section className={shared.panel} aria-label="Поиск объекта по коду">
        <form
          className={styles.searchForm}
          onSubmit={(event) => {
            event.preventDefault();
            openCode(input);
          }}
          noValidate
        >
          <div className={`${shared.field} ${styles.codeField} ${inputError ? shared.invalid : ""}`}>
            <Input
              label="Код объекта"
              className={shared.codeInput}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                if (inputError) setInputError("");
              }}
              placeholder="E28011700000020F1A2B3C4D"
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={inputError ? true : undefined}
              aria-describedby={helpId}
            />
            <p id={helpId} className={inputError ? shared.fieldError : shared.fieldHint}>
              {inputError || CODE_HINT}
            </p>
          </div>
          <Button type="submit" variant="primary" size="lg" leadingIcon={<SearchRoundedIcon />}>
            Найти
          </Button>
          <Button
            variant="secondary"
            size="lg"
            aria-pressed={scanning}
            leadingIcon={<SensorsRoundedIcon />}
            onClick={() => setScanning((value) => !value)}
          >
            {scanning ? "Остановить" : "Сканировать"}
          </Button>
        </form>
        {scanning ? (
          <ScannerStatus className={styles.scanner}>
            Сканер включён — поднесите метку, карточка откроется автоматически.
          </ScannerStatus>
        ) : null}
      </section>

      {activeCode ? (
        <StockObjectDetails key={`${activeCode}-${openCount}`} code={activeCode} />
      ) : (
        <section className={shared.panel}>
          <StockState
            icon={<QrCodeScannerRoundedIcon />}
            title="Найдите объект"
            text="Введите код с RFID-метки или нажмите «Сканировать» и поднесите метку к считывателю."
          />
        </section>
      )}
    </div>
  );
}
