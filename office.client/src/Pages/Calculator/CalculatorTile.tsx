import React from 'react'
import styles from "./CalculatorTile.module.css"

interface CalculatorTileProps {
  value: string;
  switchState: React.Dispatch<React.SetStateAction<number>>;
}

const CalculatorTile: React.FC<CalculatorTileProps> = ({ value, switchState }) => {


  return <div className={styles.calculator_tile} onClick={() => switchState(3)}>{value}</div>;
};

export default CalculatorTile