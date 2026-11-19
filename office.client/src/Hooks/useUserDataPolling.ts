import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "../Store";
import { accessTokenRolesMatch, getAccessToken, post, refreshSession } from "../Services/api";
import { login } from "../Store/authSlice";
import { clearUserData, setUserData } from "../Store/userDataSlice";
import { getUserData } from "../Services/userData";

/**
 * Данные пользователя раз в 30 секунд: роли, уведомления. Новые уведомления помечаются прочитанными
 * со звуком, но не под чужой учёткой: админ их не читал, и у пользователя они должны остаться новыми.
 */
export default function useUserDataPolling(playBeep: () => Promise<void>) {
  const dispatch = useDispatch();
  const userId = useSelector((state: RootState) => state.auth.id);
  const token = useSelector((state: RootState) => state.auth.token);
  const notificationSoundEnabled = useSelector(
    (state: RootState) => state.preferences.notificationSoundEnabled
  );
  const impersonating = useSelector((state: RootState) => Boolean(state.auth.impersonatedBy));

  const effectiveUserId =
    typeof userId === "number" && !Number.isNaN(userId) ? userId : null;

  useEffect(() => {
    if (!token || effectiveUserId === null) {
      dispatch(clearUserData());
      return;
    }

    let cancelled = false;

    const loadUserData = async () => {
      try {
        const normalizedData = await getUserData();

        if (!accessTokenRolesMatch(getAccessToken(), normalizedData.roles)) {
          const refreshedSession = await refreshSession();
          if (refreshedSession?.responseCode === 1 && refreshedSession.token) {
            dispatch(login({
              id: refreshedSession.id,
              token: refreshedSession.token,
              fullName: refreshedSession.fullName,
              position: refreshedSession.position,
              impersonatedBy: refreshedSession.impersonatedBy ?? null,
            }));
          }
        }

        const newNotificationIds = normalizedData.newNotifications.map((item) => item.id);

        // Under someone else's account his notifications stay new for him: no beep, no "read" mark.
        if (newNotificationIds.length > 0 && !impersonating) {
          if (notificationSoundEnabled) {
            await playBeep();
          }

          try {
            await post("/Notification/setnotificationsstatusone", newNotificationIds);
            normalizedData.activeNotifications = [
              ...normalizedData.newNotifications.map((item) => ({ ...item, status: 1 })),
              ...normalizedData.activeNotifications,
            ].sort(
              (left, right) =>
                new Date(right.dateTime).getTime() - new Date(left.dateTime).getTime()
            );
            normalizedData.newNotifications = [];
          } catch (statusUpdateError) {
            console.error("Failed to update notification statuses", statusUpdateError);
          }
        }

        if (!cancelled) {
          dispatch(setUserData(normalizedData));
        }
      } catch (error) {
        console.error("Failed to refresh user data", error);
      }
    };

    void loadUserData();

    const intervalId = window.setInterval(() => {
      void loadUserData();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [dispatch, token, effectiveUserId, notificationSoundEnabled, impersonating, playBeep]);
}
