import styles from "./Tile.module.css"
import { MenuPart } from '../../menuParts/menuParts'
import { Link } from 'react-router-dom'

const Tile = ({ partData }: { partData: MenuPart }) => {
  return (
    <Link to={partData.path} className={styles.tile}>
      <img src='/img/logo.svg' alt="" />
      <p>{partData.name}</p>
    </Link>
  )
}

export default Tile
