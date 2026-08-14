import React, { useEffect, useState } from "react";
import { Button } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { useNotifications } from "@toolpad/core";
import styles from "./Login.module.css";
import { Auth } from "../Requests";
import type { AuthAnswer } from "../../Interfaces/AuthAnswer";
import Input from "../../Components/Input/Input";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import { Modal } from "../../Components/Modal/Modal";
import { login } from "../../Store/authSlice";
import { setUserData } from "../../Store/userDataSlice";
import { getUserData } from "../../Services/userData";
import { RootState } from "../../Store";
import { setAccessToken } from "../../Services/api";

type ModalKind = "warning" | "error";

type ModalState =
  | { open: false }
  | {
      open: true;
      kind: ModalKind;
      title: string;
      message: string;
      img?: string;
    };

const Login = () => {
  const [password, setPassword] = useState("");
  const [loginState, setLoginState] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [modal, setModal] = useState<ModalState>({ open: false });

  const notifications = useNotifications();
  const navigator = useNavigate();
  const dispatch = useDispatch();
  const token = useSelector((state: RootState) => state.auth.token);
  const initialized = useSelector((state: RootState) => state.auth.initialized);

  useEffect(() => {
    if (initialized && token) {
      navigator("/Main", { replace: true });
    }
  }, [initialized, navigator, token]);

  const closeModal = () => setModal({ open: false });

  const handlerAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsLoading(true);

    try {
      const authToken: AuthAnswer | string = await Auth(loginState, password);

      if (typeof authToken === "string") {
        notifications.show("Не удалось выполнить авторизацию.", {
          severity: "error",
          autoHideDuration: 3000,
        });
        return;
      }

      if (authToken.responseCode === 0) {
        setModal({
          open: true,
          kind: "warning",
          title: "Аккаунт ещё не активирован",
          message:
            "Ваш аккаунт создан, но ещё не активирован. Пожалуйста, дождитесь активации администратором.",
          img: "/img/clock.svg",
        });
        return;
      }

      if (authToken.responseCode === 1) {
        setAccessToken(authToken.token);
        dispatch(
          login({
            id: authToken.id,
            token: authToken.token,
            fullName: authToken.fullName ?? null,
            position: authToken.position ?? null,
          }),
        );

        try {
          const userData = await getUserData(authToken.id);
          dispatch(setUserData(userData));
        } catch (userDataError) {
          console.error("Failed to preload user data after login", userDataError);
        }

        navigator("/Main");
        return;
      }

      if (authToken.responseCode === 2) {
        setModal({
          open: true,
          kind: "error",
          title: "Доступ запрещён",
          message:
            "Вход запрещён. Если вы считаете это ошибкой, обратитесь к администратору.",
          img: "/img/stop.svg",
        });
        return;
      }
    } catch {
      notifications.show("Не удалось выполнить авторизацию.", {
        severity: "error",
        autoHideDuration: 3000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <header className={styles.login_header}>
        <div className={styles.login_brand}>
          <div className={styles.login_brandMark} aria-hidden="true"></div>
          <div className={styles.login_brandText}>
            <div className={styles.login_brandTitle}>Люди Любят</div>
            <div className={styles.login_brandSubtitle}>
              корпоративный портал
            </div>
          </div>
        </div>
      </header>

      <div className={styles.login_formWrapper}>
        <form className={styles.login_form} onSubmit={handlerAuth}>
          <Input
            label="Логин"
            required
            wrapperClassName={styles.form_input_text}
            type="text"
            autoComplete="username"
            value={loginState}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setLoginState(e.target.value)
            }
          />

          <Input
            label="Пароль"
            required
            wrapperClassName={styles.form_input_text}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setPassword(e.target.value)
            }
          />

          <Button
            className={`${styles.form_input_button} ${styles.submitButton}`}
            size="medium"
            variant="contained"
            type="submit"
            disabled={isLoading}
          >
            <span className={`${styles.submitButtonText} ${isLoading ? styles.submitButtonTextHidden : ""}`} translate="no">
              Войти
            </span>
            <span className={`${styles.submitButtonLoader} ${isLoading ? styles.submitButtonLoaderVisible : ""}`} aria-hidden="true">
              <LoadingSpinner size={24} />
            </span>
          </Button>
        </form>

        <p className={styles.form_p}>{import.meta.env.VITE_VERSION}</p>
      </div>

      <Modal
        isOpen={modal.open}
        onClose={closeModal}
        title={modal.open ? modal.title : ""}
        panelClassName={styles.authModalPanel}
      >
        <div className={styles.modalContent}>
          <img
            className={styles.modalImg}
            src={modal.open ? modal.img : ""}
            alt="modal"
          />

          <p className={styles.modalText}>{modal.open ? modal.message : ""}</p>

          <div className={styles.modalActions}>
            <button onClick={closeModal} className={styles.modalButton}>
              ОК
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default Login;
