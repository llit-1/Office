export interface DeliveryGroup {
  id: number;
  yaName: string;
  items?: DeliveryItem[];
  imgUpdated: string;
  actual: number;
  image: string | number[];
}

export interface DeliveryItem {
  rkcode: number;
  yeGroup: number;
  rkName: string;
  yeName: string;
  description: string;
  price: number;
  measure: number;
  measureUnit: string;
  imageHash: string;
  actual: number;
  image: string | number[];
  stops?: unknown[];
}

export interface RkReference {
  categories: RkCategory[];
}

export interface RkCategory {
  code: number;
  name: string;
  categories: RkCategory[];
  items: RkMenuItem[];
}

export interface RkMenuItem {
  code: number;
  name: string;
  price: number;
}

export interface RkMenuOption extends RkMenuItem {
  categoryPath: string;
}

export interface DeliveryGroupPayload {
  id?: number;
  yaName: string;
  items: DeliveryItem[];
  imgUpdated: string;
  actual: number;
  image: string;
}

export interface DeliveryItemPayload {
  rkcode: number;
  yeGroup: number;
  rkName: string;
  yeName: string;
  description: string;
  price: number;
  measure: number;
  measureUnit: string;
  imageHash: string;
  actual: number;
  image: string;
  stops: unknown[];
}

export interface StopLocation {
  guid: string;
  name: string;
  actual: number;
  rkCode: number | null;
  aggregatorsCode: number | null;
}

export interface DeliveryStop {
  id: number;
  locationGUID: string;
  item: number;
  packId: number;
  begin: string;
  end: string;
}

export interface StopPack {
  id: number;
  itemId: number | null;
  itemName: string | null;
  locationGUID: string | null;
  locationName: string | null;
  begin: string;
  end: string;
  user: string;
  permissionLevel: 1 | 2;
  stops: DeliveryStop[];
}

export interface StopPackPayload {
  itemId: number | null;
  itemName: string | null;
  locationGUID: string | null;
  locationName: string | null;
  begin: string;
  end: string;
  permissionLevel: 1 | 2;
  stops: Array<{
    locationGUID: string | null;
    item: number | null;
  }>;
}
