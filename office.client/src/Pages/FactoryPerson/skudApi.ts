import { del, get, post, put } from "../../Services/api";

export type SkudController = {
  id: number;
  name: string;
  ip: string;
  type: number;
  /** Сколько считывателей привязано к контроллеру. */
  readers: number;
};

export type SkudReader = {
  id: number;
  name: string;
  ip: string | null;
  controllerId: number | null;
  relay: number;
  commandType: number;
  commandTime: number;
  securityMonitor: string | null;
  /** В скольких группах СКУД состоит считыватель. */
  groups: number;
};

export type SkudGroup = {
  id: number;
  name: string;
  readerIds: number[];
  persons: number;
  /** Строки истории изменений сотрудников с этой группой — из-за них группу нельзя удалить. */
  historyRows: number;
};

export type SkudData = {
  controllers: SkudController[];
  readers: SkudReader[];
  groups: SkudGroup[];
};

export type SkudControllerBody = { name: string; ip: string; type: number; pwd: number | null };

export type SkudReaderBody = {
  name: string;
  ip: string | null;
  controllerId: number | null;
  relay: number;
  commandType: number;
  commandTime: number;
  securityMonitor: string | null;
};

export type SkudGroupBody = { name: string; readerIds: number[] };

export const getSkud = () => get<SkudData>("/FactorySkud");

export const saveSkudController = (id: number | null, body: SkudControllerBody) =>
  id == null ? post("/FactorySkud/controllers", body) : put(`/FactorySkud/controllers/${id}`, body);

export const deleteSkudController = (id: number) => del(`/FactorySkud/controllers/${id}`);

export const saveSkudReader = (id: number | null, body: SkudReaderBody) =>
  id == null ? post("/FactorySkud/readers", body) : put(`/FactorySkud/readers/${id}`, body);

export const deleteSkudReader = (id: number) => del(`/FactorySkud/readers/${id}`);

export const saveSkudGroup = (id: number | null, body: SkudGroupBody) =>
  id == null ? post("/FactorySkud/groups", body) : put(`/FactorySkud/groups/${id}`, body);

export const deleteSkudGroup = (id: number) => del(`/FactorySkud/groups/${id}`);
