import React from 'react'
import styles from "./CalculatorTile.module.css"
import { useNavigate } from 'react-router-dom';

interface CalculatorTileProps {
  value: string;
}

const CalculatorTile: React.FC<CalculatorTileProps> = ({ value }) => {
  const navigate = useNavigate()

  return <div className={styles.calculator_tile} onClick={() => navigate("/Calculator/Calculate")}>{value}</div>;
};

export default CalculatorTile