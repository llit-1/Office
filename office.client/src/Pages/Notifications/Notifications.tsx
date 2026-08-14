import { useEffect, useState } from "react";
import { useNotifications } from "@toolpad/core";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import NotificationsNoneRoundedIcon from "@mui/icons-material/NotificationsNoneRounded";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import Checkbox from "../../Components/Checkbox/Checkbox";
import Button from "../../Components/Button/Button";
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
  const [processingNotificationId, setProcessingNotificationId] = useState<number | null>(null);

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
    setProcessingNotificationId(notificationId);
    try {
      await acknowledgeNotification(notificationId);
    } finally {
      setProcessingNotificationId(null);
    }
  };

  const handleNavigateToNotificationTarget = async (
    notificationId: number,
    targetPath: string,
  ) => {
    setProcessingNotificationId(notificationId);
    try {
      const isAcknowledged = await acknowledgeNotification(notificationId);
      if (isAcknowledged) {
        navigate(targetPath);
      }
    } finally {
      setProcessingNotificationId(null);
    }
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
        <div className={styles.notificationsSummary}>
          <span className={styles.summaryIcon} aria-hidden="true">
            <NotificationsNoneRoundedIcon />
          </span>
          <div>
            <strong>{activeNotificationsSource.length}</strong>
            <span>активных уведомлений</span>
          </div>
        </div>
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
          <LoadingSpinner label="Загружаем архивные уведомления…" />
        </div>
      )}

      {displayedNotifications.length === 0 ? (
        <div className={styles.empty_state}>
          <NotificationsNoneRoundedIcon aria-hidden="true" />
          <strong>{showArchived ? "Уведомлений нет" : "Новых уведомлений нет"}</strong>
          <span>
            {showArchived
              ? "Здесь появятся активные и архивные уведомления."
              : "Когда появится что-то важное, мы покажем это здесь."}
          </span>
        </div>
      ) : (
        displayedNotifications.map((item) => {
          const accessRequestData = isAccessRequestData(item.relatedEntityData)
            ? item.relatedEntityData
            : null;

          return (
            <article
              className={`${styles.notification_item} ${
                item.status === 2 ? styles.notification_item_archived : ""
              }`}
              key={item.id}
            >
              <span className={styles.notificationIcon} aria-hidden="true">
                {item.status === 2 ? <ArchiveOutlinedIcon /> : <NotificationsNoneRoundedIcon />}
              </span>

              <div className={styles.notificationContent}>
                <div className={styles.notificationHeading}>
                  <strong title={item.officeNotificationType.name}>
                    {item.officeNotificationType.name}
                  </strong>
                  {item.status === 2 ? (
                    <span className={styles.archivedLabel}>В архиве</span>
                  ) : null}
                </div>
                <div className={styles.notificationMeta}>
                  <span title={getNotificationEntityPreview(item)}>
                    <PersonOutlineRoundedIcon aria-hidden="true" />
                    {getNotificationEntityPreview(item)}
                  </span>
                  <time dateTime={item.dateTime}>{formatNotificationDate(item.dateTime)}</time>
                </div>
              </div>

              <div className={styles.actions}>
                {item.status !== 2 ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    leadingIcon={<CheckRoundedIcon />}
                    loading={processingNotificationId === item.id}
                    onClick={() => void handleAcknowledge(item.id)}
                  >
                    Ознакомлен
                  </Button>
                ) : null}

                {accessRequestData && item.typeId === 1 ? (
                  <Button
                    variant="primary"
                    size="sm"
                    type="button"
                    trailingIcon={<ArrowForwardRoundedIcon />}
                    loading={processingNotificationId === item.id}
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
                  </Button>
                ) : null}
              </div>
            </article>
          );
        })
      )}
    </div>
  );
};

export default Notifications;
