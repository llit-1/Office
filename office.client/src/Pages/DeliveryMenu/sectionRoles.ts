// Keep existing role codes so current group assignments and sessions remain valid.
export const deliveryMenuRoles = ["MenuMarketing", "MenuAdmin"];
export const deliveryRequestRoles = ["DeliveryRequests", "MenuAdmin"];
export const deliveryRoles = ["MenuMarketing", "DeliveryRequests", "MenuAdmin"];
export const cashRoles = ["MenuAuditor"];
// «Стопы (Яндекс)» — только сотрудник кассы; у аудитора свои вкладки «Стопы (Аудит)» и «Сообщения».
export const cashQuickRoles = ["Menu"];
export const cashUpdateRoles = ["CashUpdate"];
// раздел «Касса» целиком: хотя бы одна из его вкладок
export const cashSectionRoles = ["MenuAuditor", "Menu", "CashUpdate"];

export const hasAnyRole = (roles: string[], required: string[]) => required.some((role) => roles.includes(role));
