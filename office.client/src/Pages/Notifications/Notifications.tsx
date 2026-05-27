import styles from "./Notifications.module.css";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNotifications } from "@toolpad/core";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { visibleSet, pathSet } from "../../Store/stateForBackButtonSlice";
import type { RootState } from "../../Store";
import { callApi, get, post } from "../../Services/api";
import type { OfficeNotification, UserDataApiNotification } from "../../Interfaces/UserData";
import { setUserData } from "../../Store/userDataSlice";

const formatDate = (value: string) => {
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

const normalizeNotification = (item: UserDataApiNotification): OfficeNotification => ({
  id: item.id,
  dateTime: item.dateTime,
  typeId: item.typeId,
  officeUserId: item.officeUserId,
  relatedEntity: item.relatedEntity,
  status: item.status,
});

const resolveUserId = (userIdFromStore: number | null) => {
  if (typeof userIdFromStore === "number" && !Number.isNaN(userIdFromStore)) {
    return userIdFromStore;
  }

  const persistedUserId = localStorage.getItem("id") || localStorage.getItem("userId");
  if (!persistedUserId) {
    return null;
  }

  const parsedUserId = Number(persistedUserId);
  return Number.isNaN(parsedUserId) ? null : parsedUserId;
};

const Notifications = () => {
  const dispatch = useDispatch();
  const pageNotifications = useNotifications();
  const userIdFromStore = useSelector((state: RootState) => state.auth.id);
  const roles = useSelector((state: RootState) => state.userData.roles);
  const fallbackNotifications = useSelector((state: RootState) => [
    ...state.userData.newNotifications,
    ...state.userData.activeNotifications,
  ]);
  const [notifications, setNotifications] = useState<OfficeNotification[]>([]);

  useEffect(() => {
    dispatch(pathSet({ path: "/Main" }));
    dispatch(visibleSet({ visible: true }));
    dispatch(titleSet({ title: "Запросы" }));
  }, [dispatch]);

  useEffect(() => {
    const userId = resolveUserId(userIdFromStore);
    if (userId === null) {
      return;
    }

    let cancelled = false;

    const loadNotifications = async () => {
      const listResult = await callApi(
        get<UserDataApiNotification[]>("/Notification/getactivenotifications", {
          params: { userId },
        }),
        { notifications: pageNotifications }
      );

      if (!listResult.ok || cancelled) {
        return;
      }

      let normalizedNotifications = listResult.data.map(normalizeNotification);
      const newNotificationIds = normalizedNotifications
        .filter((item) => item.status === 0)
        .map((item) => item.id);

      if (newNotificationIds.length > 0) {
        const markViewedResult = await callApi(
          post("/Notification/setnotificationsstatusone", newNotificationIds),
          { notifications: pageNotifications }
        );

        if (markViewedResult.ok) {
          normalizedNotifications = normalizedNotifications.map((item) =>
            newNotificationIds.includes(item.id) ? { ...item, status: 1 } : item
          );
        }
      }

      if (cancelled) {
        return;
      }

      setNotifications(normalizedNotifications);
      dispatch(
        setUserData({
          newNotifications: normalizedNotifications.filter((item) => item.status === 0),
          activeNotifications: normalizedNotifications.filter((item) => item.status === 1),
          roles,
        })
      );
    };

    void loadNotifications();

    return () => {
      cancelled = true;
    };
  }, [dispatch, pageNotifications, roles, userIdFromStore]);

  const displayedNotifications = (notifications.length > 0 ? notifications : fallbackNotifications).sort(
    (left, right) => new Date(right.dateTime).getTime() - new Date(left.dateTime).getTime()
  );

  return (
    <div className={styles.notifications_wrapper}>
      {displayedNotifications.length === 0 ? (
        <div className={styles.empty_state}>Новых уведомлений нет.</div>
      ) : (
        displayedNotifications.map((item) => (
          <div className={styles.notification_item} key={item.id}>
            <span>{formatDate(item.dateTime)}</span>
            <span>Уведомление #{item.id}</span>
            <span>Тип: {item.typeId}</span>
            <span>Связанная сущность: {item.relatedEntity}</span>
            <span>Пользователь: {item.officeUserId}</span>
            <span className={styles.report}>{item.status === 0 ? "Новое" : "Активное"}</span>
          </div>
        ))
      )}
    </div>
  );
};

export default Notifications;
