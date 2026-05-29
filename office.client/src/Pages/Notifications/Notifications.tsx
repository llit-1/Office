import styles from "./Notifications.module.css";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNotifications } from "@toolpad/core";
import { useNavigate } from "react-router-dom";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { visibleSet, pathSet } from "../../Store/stateForBackButtonSlice";
import type { RootState } from "../../Store";
import { callApi, get, post } from "../../Services/api";
import type {
  OfficeNotification,
  UserDataApiNotification,
} from "../../Interfaces/UserData";
import { setUserData } from "../../Store/userDataSlice";
import {
  formatNotificationDate,
  getNotificationEntityPreview,
  isAccessRequestData,
  markNotificationsAsViewed,
  normalizeNotification,
  removeNotificationById,
  resolveNotificationUserId,
  sortNotificationsByDateDesc,
  toUserDataPayload,
} from "./notifications.helpers";

const Notifications = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
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
    dispatch(titleSet({ title: "Уведомления" }));
  }, [dispatch]);

  useEffect(() => {
    const userId = resolveNotificationUserId(userIdFromStore);
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
          normalizedNotifications = markNotificationsAsViewed(
            normalizedNotifications,
            newNotificationIds
          );
        }
      }

      if (cancelled) {
        return;
      }

      setNotifications(normalizedNotifications);
      dispatch(setUserData(toUserDataPayload(normalizedNotifications, roles)));
    };

    void loadNotifications();

    return () => {
      cancelled = true;
    };
  }, [dispatch, pageNotifications, roles, userIdFromStore]);

  const updateNotificationsState = (nextNotifications: OfficeNotification[]) => {
    setNotifications(nextNotifications);
    dispatch(setUserData(toUserDataPayload(nextNotifications, roles)));
  };

  const handleAcknowledge = async (notificationId: number) => {
    const result = await callApi(
      post("/Notification/setnotificationsstatustwo", notificationId),
      { notifications: pageNotifications }
    );

    if (!result.ok) {
      return;
    }

    const sourceNotifications =
      notifications.length > 0 ? notifications : fallbackNotifications;
    const nextNotifications = removeNotificationById(
      sourceNotifications,
      notificationId
    );
    updateNotificationsState(nextNotifications);
  };

  const displayedNotifications = sortNotificationsByDateDesc(
    notifications.length > 0 ? notifications : fallbackNotifications
  );

  return (
    <div className={styles.notifications_wrapper}>
      {displayedNotifications.length === 0 ? (
        <div className={styles.empty_state}>Новых уведомлений нет.</div>
      ) : (
        displayedNotifications.map((item) => {
          const accessRequestData = isAccessRequestData(item.relatedEntityData)
            ? item.relatedEntityData
            : null;

          return (
            <div className={styles.notification_item} key={item.id}>
              <span>{formatNotificationDate(item.dateTime)}</span>
              <span>{item.officeNotificationType.name}</span>
              <span>{getNotificationEntityPreview(item)}</span>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondary_button}
                  onClick={() => void handleAcknowledge(item.id)}
                >
                  Ознакомлен
                </button>

                {accessRequestData && item.typeId === 1 ? (
                  <button
                    type="button"
                    className={styles.action_button}
                    onClick={() =>
                      navigate(`/Users/Edit/${accessRequestData.officeUserId}`)
                    }
                  >
                    Перейти
                  </button>
                ) : null}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

export default Notifications;
