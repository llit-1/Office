import { ApiError, del, get, patch, post, put } from "../../Services/api";
import type {
  DeliveryGroup,
  DeliveryGroupPayload,
  DeliveryItem,
  DeliveryItemPayload,
  RkReference,
  StopLocation,
  StopPack,
  StopPackPayload,
} from "./deliveryMenu.types";

const baseUrl = "/DeliveryMenu";

export function getDeliveryGroups() {
  return get<DeliveryGroup[]>(`${baseUrl}/groups`);
}

export function getDeliveryGroupItems(groupId: number) {
  return get<DeliveryItem[]>(`${baseUrl}/groups/${groupId}/items`);
}

export async function findDeliveryItem(id: number) {
  try {
    return await get<DeliveryItem>(`${baseUrl}/items/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export function getRkReference() {
  return get<RkReference>(`${baseUrl}/source-menu`);
}

export function createDeliveryGroup(payload: DeliveryGroupPayload) {
  return post<void>(`${baseUrl}/groups`, payload);
}

export function updateDeliveryGroup(id: number, payload: DeliveryGroupPayload) {
  return put<void>(`${baseUrl}/groups/${id}`, payload);
}

export function deleteDeliveryGroup(id: number) {
  return del<void>(`${baseUrl}/groups/${id}`);
}

export function createDeliveryItem(payload: DeliveryItemPayload) {
  return post<DeliveryItem>(`${baseUrl}/items`, {
    ...payload,
    imageHash: "",
    group: null,
  });
}

export function updateDeliveryItem(id: number, payload: DeliveryItemPayload) {
  return put<void>(`${baseUrl}/items/${id}`, {
    ...payload,
    imageHash: "",
    group: null,
  });
}

export function setDeliveryItemActual(id: number, actual: boolean) {
  return patch<void>(`${baseUrl}/items/${id}/actual`, { actual });
}

export function getStopLocations() {
  return get<StopLocation[]>(`${baseUrl}/stop-locations`);
}

export function getStopItems() {
  return get<DeliveryItem[]>(`${baseUrl}/stop-items`);
}

export function getStopPacks() {
  return get<StopPack[]>(`${baseUrl}/stops`);
}

export function createStopPack(payload: StopPackPayload) {
  return post<void>(`${baseUrl}/stops`, payload);
}

export function updateStopPack(id: number, payload: StopPackPayload) {
  return put<void>(`${baseUrl}/stops/${id}`, payload);
}

export function deleteStopPack(id: number) {
  return del<void>(`${baseUrl}/stops/${id}`);
}

export function removeLevelTwoStops(itemId: number, locationGuid: string) {
  return del<void>(`${baseUrl}/stops/items/${itemId}/locations/${locationGuid}/level-2`);
}
