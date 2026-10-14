import type { SvgIconComponent } from "@mui/icons-material";
import AddShoppingCartOutlinedIcon from "@mui/icons-material/AddShoppingCartOutlined";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import CalculateRoundedIcon from "@mui/icons-material/CalculateOutlined";
import CameraAltOutlinedIcon from "@mui/icons-material/CameraAltOutlined";
import DeviceThermostatOutlinedIcon from "@mui/icons-material/DeviceThermostatOutlined";
import FactoryOutlinedIcon from "@mui/icons-material/FactoryOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import HomeIcon from "@mui/icons-material/HomeOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import PointOfSaleOutlinedIcon from "@mui/icons-material/PointOfSaleOutlined";
import RestaurantMenuOutlinedIcon from "@mui/icons-material/RestaurantMenuOutlined";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import TvOutlinedIcon from "@mui/icons-material/TvOutlined";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import { reportRoles } from "../Pages/Reports/reportRoles";

export interface MenuPart {
  name: string;
  Icon: SvgIconComponent;
  path: string;
  img: string;
  requiredRole?: string | string[];
}

export const menuParts: MenuPart[] = [
  { name: "Главная страница", Icon: HomeIcon, path: "/Main", img: "" },
  {
    name: "Калькулятор",
    Icon: CalculateRoundedIcon,
    path: "/Calculator/SelectCategory",
    img: "/img/calculator.svg",
    requiredRole: "Calculator",
  },
  {
    name: "Торговые точки",
    Icon: StorefrontOutlinedIcon,
    path: "/TT",
    img: "/img/shop.svg",
    requiredRole: "Location",
  },
  {
    name: "Пользователи",
    Icon: GroupOutlinedIcon,
    path: "/Users",
    img: "/img/users.svg",
    requiredRole: "Users",
  },
  {
    name: "NX Завод",
    Icon: CameraAltOutlinedIcon,
    path: "/FactoryNX",
    img: "/img/photo-camera.svg",
    requiredRole: "FactoryNX",
  },
  {
    name: "Заказы ТТ",
    Icon: AddShoppingCartOutlinedIcon,
    path: "/Orders",
    img: "/img/shopping-basket.svg",
    requiredRole: ["OrdersTTAdmin", "Order_man", "Order_woman"],
  },
  {
    name: "Сотрудники завода",
    Icon: FactoryOutlinedIcon,
    path: "/FactoryPerson",
    img: "/img/factory.svg",
    requiredRole: "FactoryPerson",
  },
  {
    name: "Склад",
    Icon: StorageOutlinedIcon,
    path: "/Stock",
    img: "/img/stock.svg",
    requiredRole: ["Stock", "StockAdmin"],
  },
  {
    name: "Доставка",
    Icon: RestaurantMenuOutlinedIcon,
    path: "/Delivery",
    img: "/img/menu.svg",
    requiredRole: ["MenuMarketing", "DeliveryRequests", "MenuAdmin"],
  },
  {
    name: "Касса",
    Icon: PointOfSaleOutlinedIcon,
    path: "/Cash",
    img: "/img/cash-register.svg",
    requiredRole: ["MenuAuditor", "Menu", "CashUpdate"],
  },
  {
    name: "Видео на ТТ",
    Icon: TvOutlinedIcon,
    path: "/VideoDevices",
    img: "/img/video.svg",
    requiredRole: "VideoDevices",
  },
  {
    name: "Датчики",
    Icon: DeviceThermostatOutlinedIcon,
    path: "/Sensors",
    img: "/img/thermometer.svg",
    requiredRole: ["Sensors", "SensorsView", "SensorsEdit"],
  },
  {
    name: "Зарплата",
    Icon: PaymentsOutlinedIcon,
    path: "/Salary",
    img: "/img/salary.svg",
    requiredRole: "Salary",
  },
  {
    name: "Библиотека знаний",
    Icon: MenuBookOutlinedIcon,
    path: "/KnowledgeLibrary",
    img: "/img/book.svg",
    requiredRole: ["KnowledgeLibrary", "KnowledgeLibraryAdmin"],
  },
  {
    name: "Отчёты",
    Icon: AssessmentOutlinedIcon,
    path: "/Reports",
    img: "/img/reports.svg",
    requiredRole: reportRoles,
  },
];
