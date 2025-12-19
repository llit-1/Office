import React from 'react'
import styles from "./CalculatorTile.module.css"
import { useNavigate } from 'react-router-dom';
import { useDispatch } from "react-redux"
import { setIdTT } from "../../Store/calculatorSlice"

interface CalculatorTileProps {
  id: string;
  value: string;
}

const CalculatorTile: React.FC<CalculatorTileProps> = ({ id, value }) => {
  const navigate = useNavigate()
  const dispatch = useDispatch();

  const ttPickerHandle = () => {
    dispatch(setIdTT(id))
    navigate("/Calculator/Calculate/" + id)
  }

  return <div className={styles.calculator_tile} onClick={() => ttPickerHandle()}>{value}</div>;
};

export default CalculatorTile