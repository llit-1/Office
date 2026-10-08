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
  /** id декларации соответствия (закон о платформенной экономике). */
  declaration?: number | null;
  /** Код ТН ВЭД позиции — один из кодов её декларации. */
  tnvedCode?: string | null;
  yeDeclaration?: Declaration | null;
}

/** Декларация соответствия, сохранённая в нашей базе. */
export interface Declaration {
  id: number;
  docNumber: string;
  fsaId: number | null;
  dateFrom: string | null;
  dateTo: string | null;
  manufacturerName: string;
  legalAddress: string;
  productionAddress: string | null;
  productName: string | null;
  /** Коды ТН ВЭД через запятую. */
  tnvedCodes: string | null;
}

export type DeclarationPayload = Omit<Declaration, "id">;

export interface DeclarationTnved {
  code: string | null;
  name: string | null;
}

/** Декларация, найденная в реестре (ещё не сохранена у нас — без id). */
export interface DeclarationLookup {
  docNumber: string | null;
  fsaId: number;
  dateFrom: string | null;
  dateTo: string | null;
  manufacturerName: string | null;
  legalAddress: string | null;
  productionAddress: string | null;
  productName: string | null;
  tnvedCodes: DeclarationTnved[] | null;
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
  declaration: number | null;
  tnvedCode: string | null;
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
