import HomeIcon from '@mui/icons-material/HomeOutlined';
import CalculateRoundedIcon from '@mui/icons-material/CalculateOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';
import type { SvgIconComponent } from "@mui/icons-material";
import AddShoppingCartOutlinedIcon from '@mui/icons-material/AddShoppingCartOutlined';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';

export interface MenuPart {
  name: string;
  Icon: SvgIconComponent;
  path: string;
  img: string;
};

// Экспортируем массив данных
export const menuParts : MenuPart[] = [
  { name: "Главная страница", Icon: HomeIcon, path: "/Main", img: "" },
  { name: "Калькулятор", Icon: CalculateRoundedIcon, path: "/Calculator/SelectCategory", img: "/img/calculator.svg"},
  { name: "Торговые точки", Icon: StorefrontOutlinedIcon, path: "/TT", img: "/img/shop.svg" },
  { name: "Пользователи", Icon: GroupOutlinedIcon, path: "/Users", img: "/img/users.svg"},
  { name: "NX Завод", Icon: CameraAltOutlinedIcon, path: "/FactoryNX", img: "/img/photo-camera.svg"},
  { name: "Заказы ТТ", Icon: AddShoppingCartOutlinedIcon, path: "/Orders", img: "/img/shopping-basket.svg"},
  { name: "Запросы", Icon: NotificationsNoneIcon, path: "/Notifications", img: "/img/notification.svg"},
];
