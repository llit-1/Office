import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { Link } from "react-router-dom";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import Button from "../../Components/Button/Button";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import Select from "../../Components/Select/Select";
import StatePanel from "../../Components/StatePanel/StatePanel";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { CALCULATOR_CATEGORIES } from "./calculator.categories";
import { useCalculatorTt } from "./useCalculatorTt";
import styles from "./CalculatorHome.module.css";

const today = () =>
  new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" })
    .format(new Date())
    .replace(/^./, (letter) => letter.toUpperCase());

export default function CalculatorHome() {
  const dispatch = useDispatch();
  const { locations, current, select } = useCalculatorTt();

  useEffect(() => {
    dispatch(visibleSet({ visible: true }));
    dispatch(pathSet({ path: "/Main" }));
    dispatch(titleSet({ title: "Калькуляторы" }));
  }, [dispatch]);

  if (!locations.data) {
    return locations.error ? (
      <StatePanel
        tone="error"
        icon={<ErrorOutlineRoundedIcon />}
        title="Не удалось загрузить точки"
        action={<Button onClick={() => void locations.reload()}>Повторить</Button>}
      />
    ) : (
      <div className={styles.loading}><LoadingSpinner label="Загружаем точки…" /></div>
    );
  }
  if (!current) {
    return (
      <StatePanel
        icon={<StorefrontOutlinedIcon />}
        title="Нет точек с калькулятором"
        text="Попросите администратора привязать вашу торговую точку к учётной записи."
      />
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1>{current.name}</h1>
          <p>{today()}</p>
        </div>
        {locations.data.length > 1 ? (
          <Select
            label="Торговая точка"
            search
            wrapperClassName={styles.storeSelect}
            value={String(current.code)}
            options={locations.data.map((location) => ({ value: String(location.code), label: location.name }))}
            onChange={(event) => select(Number(event.target.value))}
          />
        ) : null}
      </header>

      <div className={styles.grid}>
        {CALCULATOR_CATEGORIES.map(({ slug, title, image }) => (
          <Link key={slug} to={`/Calculator/${slug}`} className={styles.card}>
            <img className={styles.image} src={image} alt="" aria-hidden="true" />
            <span className={styles.title}>{title}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
