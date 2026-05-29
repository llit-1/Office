export interface OfficeNotificationType {
  id: number;
  name: string;
}

export interface NotificationRelatedOfficeUser {
  id: number;
  login: string;
  name: string;
  surname: string;
  patronymic: string | null;
  position: string | null;
}

export interface NotificationRelatedAccessRequest {
  id: number;
  officeUserId: number;
  dateTime: string;
  status: number;
  comment: string | null;
  officeUser?: NotificationRelatedOfficeUser | null;
}

export interface OfficeNotification {
  id: number;
  dateTime: string;
  typeId: number;
  officeNotificationType: OfficeNotificationType;
  officeUserId: number;
  relatedEntity: number;
  status: number;
  relatedEntityData?: string | number | number[] | NotificationRelatedAccessRequest | null;
}

export interface UserDataResponse {
  newNotifications: OfficeNotification[];
  activeNotifications: OfficeNotification[];
  roles: string[];
}

export interface UserDataApiNotification extends Omit<OfficeNotification, "officeNotificationType"> {
  officeNotificationType?: OfficeNotificationType;
  officeUser?: number;
}

export interface UserDataApiResponse {
  newNotifications?: UserDataApiNotification[];
  activeNotifications?: UserDataApiNotification[];
  roles?: string[];
}
