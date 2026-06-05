import type {
  NotificationRelatedAccessRequest,
  OfficeNotification,
  UserDataApiNotification,
  UserDataResponse,
} from "../../Interfaces/UserData";

export const formatNotificationDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

export const normalizeNotification = (
  item: UserDataApiNotification
): OfficeNotification => ({
  id: item.id,
  dateTime: item.dateTime,
  typeId: item.typeId,
  officeNotificationType: item.officeNotificationType ?? {
    id: item.typeId,
    name: `Тип ${item.typeId}`,
  },
  officeUserId: item.officeUserId,
  relatedEntity: item.relatedEntity,
  status: item.status,
  relatedEntityData: item.relatedEntityData ?? null,
});

export const resolveNotificationUserId = (userIdFromStore: number | null) => {
  if (typeof userIdFromStore === "number" && !Number.isNaN(userIdFromStore)) {
    return userIdFromStore;
  }

  const persistedUserId =
    localStorage.getItem("id") || localStorage.getItem("userId");
  if (!persistedUserId) {
    return null;
  }

  const parsedUserId = Number(persistedUserId);
  return Number.isNaN(parsedUserId) ? null : parsedUserId;
};

export const isAccessRequestData = (
  value: OfficeNotification["relatedEntityData"]
): value is NotificationRelatedAccessRequest =>
  typeof value === "object" &&
  value !== null &&
  "officeUserId" in value &&
  "dateTime" in value;

export const getNotificationEntityPreview = (item: OfficeNotification) => {
  if (typeof item.relatedEntityData === "string") {
    return item.relatedEntityData;
  }

  if (Array.isArray(item.relatedEntityData)) {
    return item.relatedEntityData.join(", ");
  }

  if (typeof item.relatedEntityData === "number") {
    return String(item.relatedEntityData);
  }

  if (isAccessRequestData(item.relatedEntityData)) {
    const requestUser = item.relatedEntityData.officeUser;
    return requestUser
      ? [requestUser.surname, requestUser.name, requestUser.patronymic]
          .filter(Boolean)
          .join(" ")
      : `Пользователь #${item.relatedEntityData.officeUserId}`;
  }

  return String(item.relatedEntity);
};

export const sortNotificationsByDateDesc = (
  notifications: OfficeNotification[]
) =>
  [...notifications].sort(
    (left, right) =>
      new Date(right.dateTime).getTime() - new Date(left.dateTime).getTime()
  );

export const markNotificationsAsViewed = (
  notifications: OfficeNotification[],
  notificationIds: number[]
) =>
  notifications.map((item) =>
    notificationIds.includes(item.id) ? { ...item, status: 1 } : item
  );

export const removeNotificationById = (
  notifications: OfficeNotification[],
  notificationId: number
) => notifications.filter((item) => item.id !== notificationId);

export const markNotificationAsArchived = (
  notifications: OfficeNotification[],
  notificationId: number
) =>
  notifications.map((item) =>
    item.id === notificationId ? { ...item, status: 2 } : item
  );

export const toUserDataPayload = (
  notifications: OfficeNotification[],
  roles: string[]
): UserDataResponse => ({
  newNotifications: notifications.filter((item) => item.status === 0),
  activeNotifications: notifications.filter((item) => item.status === 1),
  roles,
});
