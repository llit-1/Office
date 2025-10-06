import axios, { AxiosError , AxiosResponse} from 'axios';
// import { showNotification } from '../store/notificationSlice';
// import { login } from '../store/authSlice';
// import { User } from "../interfaces/user";


import { AuthAnswer } from "../Interfaces/AuthAnswer"

// Получаем хоста для дев режима
const getHost = (): string => {
  return import.meta.env.VITE_DEV === "1" && import.meta.env.VITE_DEV_HOST 
    ? import.meta.env.VITE_DEV_HOST 
    : "";
};



export const Auth = async (
  login: string, 
  password: string, 
): Promise<AuthAnswer | string> => {

  const host = getHost();

  try {
    const response : AxiosResponse<AuthAnswer> = await axios.post(`${host}/api/Authorization/login`, {
      login,
      password,
    });

    if (response.status === 200) {
      const data = response.data;
      localStorage.setItem("token", data.token);
      localStorage.setItem("id", data.id.toString());
      
      return data;
    } else {
      return response.statusText;
    }
  } catch(e : unknown) {
    return handleError(e, "Ошибка отправки")
  }
};



// // Обработчик ошибок
const handleError = (error: unknown, defaultMessage: string) => {
  const axiosError = error as AxiosError<{ message: string }>;
  console.log(axiosError.response)
  const message = axiosError.response?.data.message || defaultMessage;
  return message;
};