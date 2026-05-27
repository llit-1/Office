export interface OfficeNotification {
  id: number;
  dateTime: string;
  typeId: number;
  officeUserId: number;
  relatedEntity: number;
  status: number;
}

export interface UserDataResponse {
  newNotifications: OfficeNotification[];
  activeNotifications: OfficeNotification[];
  roles: string[];
}

export interface UserDataApiNotification extends OfficeNotification {
  officeNotificationType?: unknown;
  officeUser?: unknown;
}

export interface UserDataApiResponse {
  newNotifications?: UserDataApiNotification[];
  activeNotifications?: UserDataApiNotification[];
  roles?: string[];
}
