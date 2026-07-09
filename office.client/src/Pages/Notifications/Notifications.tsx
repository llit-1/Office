import { useEffect, useState } from "react";
import { useNotifications } from "@toolpad/core";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import Checkbox from "../../Components/Checkbox/Checkbox";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import type { OfficeNotification, UserDataApiNotification } from "../../Interfaces/UserData";
import { callApi, get, post } from "../../Services/api";
import type { RootState } from "../../Store";
import { visibleSet, pathSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { setUserData } from "../../Store/userDataSlice";
import styles from "./Notifications.module.css";
import {
  formatNotificationDate,
  getNotificationEntityPreview,
  isAccessRequestData,
  markNotificationsAsViewed,
  normalizeNotification,
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
  const newNotificationsFromStore = useSelector(
    (state: RootState) => state.userData.newNotifications,
  );
  const activeNotificationsFromStore = useSelector(
    (state: RootState) => state.userData.activeNotifications,
  );

  const [activeNotifications, setActiveNotifications] = useState<OfficeNotification[]>([]);
  const [activeLoaded, setActiveLoaded] = useState(false);
  const [archivedNotifications, setArchivedNotifications] = useState<OfficeNotification[]>([]);
  const [archivedLoaded, setArchivedLoaded] = useState(false);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const fallbackNotifications = [
    ...newNotificationsFromStore,
    ...activeNotificationsFromStore,
  ];

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
        { notifications: pageNotifications },
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
          { notifications: pageNotifications },
        );

        if (markViewedResult.ok) {
          normalizedNotifications = markNotificationsAsViewed(
            normalizedNotifications,
            newNotificationIds,
          );
        }
      }

      if (cancelled) {
        return;
      }

      setActiveNotifications(normalizedNotifications);
      setActiveLoaded(true);
      dispatch(setUserData(toUserDataPayload(normalizedNotifications, roles)));
    };

    void loadNotifications();

    return () => {
      cancelled = true;
    };
  }, [dispatch, pageNotifications, userIdFromStore]);

  useEffect(() => {
    const userId = resolveNotificationUserId(userIdFromStore);
    if (userId === null || !showArchived || archivedLoaded) {
      return;
    }

    let cancelled = false;

    const loadArchivedNotifications = async () => {
      setArchivedLoading(true);

      const listResult = await callApi(
        get<UserDataApiNotification[]>("/Notification/getinactivenotifications", {
          params: { userId },
        }),
        { notifications: pageNotifications },
      );

      if (cancelled) {
        return;
      }

      setArchivedLoading(false);

      if (!listResult.ok) {
        return;
      }

      setArchivedNotifications(listResult.data.map(normalizeNotification));
      setArchivedLoaded(true);
    };

    void loadArchivedNotifications();

    return () => {
      cancelled = true;
    };
  }, [archivedLoaded, pageNotifications, showArchived, userIdFromStore]);

  const updateActiveNotificationsState = (nextNotifications: OfficeNotification[]) => {
    setActiveNotifications(nextNotifications);
    setActiveLoaded(true);
    dispatch(setUserData(toUserDataPayload(nextNotifications, roles)));
  };

  const acknowledgeNotification = async (notificationId: number) => {
    const result = await callApi(
      post("/Notification/setnotificationsstatustwo", notificationId),
      { notifications: pageNotifications },
    );

    if (!result.ok) {
      return false;
    }

    const sourceNotifications =
      activeNotifications.length > 0 ? activeNotifications : fallbackNotifications;
    const archivedNotification =
      sourceNotifications.find((item) => item.id === notificationId) ?? null;
    const nextNotifications = sourceNotifications.filter(
      (item) => item.id !== notificationId,
    );

    updateActiveNotificationsState(nextNotifications);

    if (archivedNotification) {
      setArchivedNotifications((current) =>
        sortNotificationsByDateDesc([
          { ...archivedNotification, status: 2 },
          ...current.filter((item) => item.id !== notificationId),
        ]),
      );
    }

    return true;
  };

  const handleAcknowledge = async (notificationId: number) => {
    await acknowledgeNotification(notificationId);
  };

  const handleNavigateToNotificationTarget = async (
    notificationId: number,
    targetPath: string,
  ) => {
    const isAcknowledged = await acknowledgeNotification(notificationId);
    if (!isAcknowledged) {
      return;
    }

    navigate(targetPath);
  };

  const activeNotificationsSource = activeLoaded
    ? activeNotifications
    : fallbackNotifications;

  const displayedNotifications = sortNotificationsByDateDesc([
    ...activeNotificationsSource,
    ...(showArchived ? archivedNotifications : []),
  ]);

  return (
    <div className={styles.notifications_wrapper}>
      <div className={styles.notifications_toolbar}>
        <Checkbox
          size="sm"
          checked={showArchived}
          onChange={(event) => setShowArchived(event.target.checked)}
          label="Показывать архивные"
          labelClassName={styles.archivedToggle}
        />
      </div>

      {showArchived && archivedLoading && (
        <div className={styles.archivedLoader}>
          <LoadingSpinner />
          <span>Загружаем архивные уведомления...</span>
        </div>
      )}

      {displayedNotifications.length === 0 ? (
        <div className={styles.empty_state}>
          {showArchived ? "Уведомлений нет." : "Новых уведомлений нет."}
        </div>
      ) : (
        displayedNotifications.map((item) => {
          const accessRequestData = isAccessRequestData(item.relatedEntityData)
            ? item.relatedEntityData
            : null;

          return (
            <div
              className={`${styles.notification_item} ${
                item.status === 2 ? styles.notification_item_archived : ""
              }`}
              key={item.id}
            >
              <span>{formatNotificationDate(item.dateTime)}</span>
              <span>{item.officeNotificationType.name}</span>
              <span>{getNotificationEntityPreview(item)}</span>
              <div className={styles.actions}>
                {item.status !== 2 ? (
                  <button
                    type="button"
                    className={styles.secondary_button}
                    onClick={() => void handleAcknowledge(item.id)}
                  >
                    Ознакомлен
                  </button>
                ) : (
                  <span className={styles.archivedLabel}>В архиве</span>
                )}

                {accessRequestData && item.typeId === 1 ? (
                  <button
                    type="button"
                    className={styles.action_button}
                    onClick={() => {
                      if (item.status === 2) {
                        navigate(`/Users/Edit/${accessRequestData.officeUserId}`);
                        return;
                      }

                      void handleNavigateToNotificationTarget(
                        item.id,
                        `/Users/Edit/${accessRequestData.officeUserId}`,
                      );
                    }}
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
