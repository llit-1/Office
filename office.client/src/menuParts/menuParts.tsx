import HomeIcon from "@mui/icons-material/HomeOutlined";
import CalculateRoundedIcon from "@mui/icons-material/CalculateOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import CameraAltOutlinedIcon from "@mui/icons-material/CameraAltOutlined";
import type { SvgIconComponent } from "@mui/icons-material";
import AddShoppingCartOutlinedIcon from "@mui/icons-material/AddShoppingCartOutlined";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import FactoryOutlinedIcon from "@mui/icons-material/FactoryOutlined";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";

export interface MenuPart {
  name: string;
  Icon: SvgIconComponent;
  path: string;
  img: string;
  requiredRole?: string;
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
  { name: "Торговые точки", Icon: StorefrontOutlinedIcon, path: "/TT", img: "/img/shop.svg", requiredRole: "Location", },
  { name: "Пользователи", Icon: GroupOutlinedIcon, path: "/Users", img: "/img/users.svg", requiredRole: "Users", },
  { name: "NX Завод", Icon: CameraAltOutlinedIcon, path: "/FactoryNX", img: "/img/photo-camera.svg", requiredRole: "FactoryNX", },
  { name: "Заказы ТТ", Icon: AddShoppingCartOutlinedIcon, path: "/Orders", img: "/img/shopping-basket.svg", requiredRole: "OrdersTT", },
  { name: "Сотрудники завода", Icon: FactoryOutlinedIcon, path: "/FactoryPerson", img: "/img/factory.svg", requiredRole: "FactoryPerson", },
  { name: "Склад", Icon: StorageOutlinedIcon, path: "/Stock", img: "/img/stock.svg", requiredRole: "Stock", },
  { name: "Зарплата", Icon: PaymentsOutlinedIcon, path: "/Salary", img: "/img/salary.svg", requiredRole: "Salary", },
  { name: "Уведомления", Icon: NotificationsNoneIcon, path: "/Notifications", img: "/img/notification.svg"},
];
