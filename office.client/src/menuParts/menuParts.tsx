import HomeIcon from '@mui/icons-material/HomeOutlined';
import CalculateRoundedIcon from '@mui/icons-material/CalculateOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import QuestionMarkOutlinedIcon from '@mui/icons-material/QuestionMarkOutlined';

const stylesForIcon = {
  width: "30px",
  height: "30px",
  fill: "#333333",
  marginLeft: "13px"
};

export interface MenuPart {
  name: string;
  component: JSX.Element;
  path: string;
};

// Экспортируем массив данных
export const menuParts : MenuPart[] = [
  { name: "Главная страница", component: <HomeIcon sx={stylesForIcon} />, path: "/Main" },
  { name: "Калькулятор", component: <CalculateRoundedIcon sx={stylesForIcon} />, path: "/Calculator"},
  { name: "Торговые точки", component: <StorefrontOutlinedIcon sx={stylesForIcon} />, path: "/TT" },
  { name: "Пользователи", component: <GroupOutlinedIcon sx={stylesForIcon} />, path: "/Users"},
  { name: "Настройки", component: <SettingsOutlinedIcon sx={stylesForIcon} />, path: "/Settings"},
  { name: "Помощь", component: <QuestionMarkOutlinedIcon sx={stylesForIcon} />, path: "/Help"},
];
