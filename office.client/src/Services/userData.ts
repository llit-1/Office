import { get } from "./api";
import type {
  OfficeNotification,
  UserDataApiNotification,
  UserDataApiResponse,
  UserDataResponse,
} from "../Interfaces/UserData";

export function normalizeNotification(
  item: UserDataApiNotification
): OfficeNotification {
  return {
    id: item.id,
    dateTime: item.dateTime,
    typeId: item.typeId,
    officeNotificationType:
      item.officeNotificationType ?? { id: item.typeId, name: `Type ${item.typeId}` },
    officeUserId: item.officeUserId,
    relatedEntity: item.relatedEntity,
    status: item.status,
  };
}

export function normalizeUserData(data: UserDataApiResponse): UserDataResponse {
  return {
    newNotifications: (data.newNotifications ?? []).map(normalizeNotification),
    activeNotifications: (data.activeNotifications ?? []).map(normalizeNotification),
    roles: Array.from(new Set(data.roles ?? [])),
  };
}

/** Уведомления и роли текущего пользователя: кто он, сервер определяет по токену. */
export async function getUserData(): Promise<UserDataResponse> {
  const data = await get<UserDataApiResponse>("/DataUpdate/getdata");

  return normalizeUserData(data);
}
