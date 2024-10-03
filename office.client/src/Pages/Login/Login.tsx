import React, {useState} from 'react'
import styles from "./Login.module.css"
import {Button, TextField, CircularProgress} from "@mui/material"
import { Auth } from "../Requests";
import { AuthAnswer } from "../../Interfaces/AuthAnswer"
import { useNotifications } from '@toolpad/core';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [password, setPassword] = useState<string>("");
  const [login, setLogin] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [buttonText, setButtonText] = useState<string>("Войти");

  const navigator = useNavigate();
  const notifications = useNotifications();

  const handlerAuth = async(e: React.FormEvent) => {
    e.preventDefault();
    
    setButtonText("");
    setIsLoading(true);

    const authToken : AuthAnswer | string = await Auth(login, password)
    console.log(authToken)
    if(typeof authToken !== "string")
    {
      notifications.show('Авторизация прошла успешно!', { severity: 'success', autoHideDuration: 3000 });
      navigator("/Main")
    } else {
      notifications.show(authToken, { severity: 'error', autoHideDuration: 3000 });
    }
    
    setIsLoading(false)
    setButtonText("Войти")
  }

  return (
    <>
      <header className={styles.login_header}>
        <p className={styles.login_p}>
            <img className={styles.login_img} src="/img/logo-big.svg" alt="Logo" />
        </p>
      </header>

      <div className={styles.login_formWrapper}>

        <form className={styles.login_form} onSubmit={handlerAuth}>

          <TextField
            required
            className={styles.form_input_text}
            type="text"
            autoComplete="username"
            value={login}
            label="Логин"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLogin(e.target.value)}
            variant="outlined"
            size="medium"
            sx={{
              '& .MuiOutlinedInput-root': { borderRadius: 0 },
              backgroundColor: 'white',
            }}
          />
      
          <TextField
            required
            className={styles.form_input_text}
            type="password"
            autoComplete="current-password"
            value={password}
            label="Пароль"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
            variant="outlined"
            size="medium"
            sx={{
              '& .MuiOutlinedInput-root': { borderRadius: 0 },
              backgroundColor: 'white',
            }}
          />

          <Button
            className={styles.form_input_button}
            size="medium"
            variant="contained"
            type="submit"
            sx={{
              backgroundColor: "#F47920",
              fontFamily: 'Akrobat',
              fontSize: "14px"
            }}
            disabled={isLoading}
          >
            {isLoading ? <CircularProgress sx={{ color: "orange" }} size={26} /> : buttonText}
          </Button>
        </form>

        <p className={styles.form_p}>{import.meta.env.VITE_VERSION}</p>
      </div>

      
    </>
  )
}

export default Login