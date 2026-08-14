import { post, get } from "../Services/api";
import { AxiosError } from 'axios';
import { AuthAnswer } from "../Interfaces/AuthAnswer"
import { FactoryNXReport } from "./FactoryNX/FactoryNXReport"
import { FactoryNXPersonReport } from "./FactoryNX/FactoryNXPersonReport"


// Using central api instance (src/Services/api.ts)
export const Auth = async (
  login: string,
  password: string
): Promise<AuthAnswer> => {
  try {
    const data = await post<AuthAnswer>("/Authorization/login", { login, password }, {
      skipAuthRefresh: true,
      skipAuthRedirect: true,
    });
    return data;
  } catch (e: unknown) {
    throw parseError(e, "Ошибка отправки");
  }
};

export const getFactoryNXReports = async (): Promise<FactoryNXReport[]> => {
  try {
    const data = await get<FactoryNXReport[]>("/FactoryNX/getreports");
    return data;
  } catch (e: unknown) {
    throw parseError(e, "Ошибка получения отчётов");
  }
};

export const getUserReports = async (personID: number | string): Promise<FactoryNXPersonReport> => {
  try {
    const data = await get<FactoryNXPersonReport>("/FactoryNX/getuserreport", { params: { personID } });
    return data;
  } catch (e: unknown) {
    throw parseError(e, "Ошибка получения фото пользователя");
  }
};

const parseError = (error: unknown, defaultMessage = "Ошибка") => {
  const axiosError = error as AxiosError<{ message?: string }>;
  const message = axiosError?.response?.data?.message || axiosError?.message || defaultMessage;
  return new Error(message);
};
