import styles from './Notifications.module.css';
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { titleSet } from '../../Store/stateForPageTitleSlice';
import { visibleSet, pathSet } from '../../Store/stateForBackButtonSlice';
import { useNavigate } from 'react-router-dom';

const Notifications = () => {

    const dispatch = useDispatch();
    const navigate = useNavigate();
    
    useEffect(() => {
        dispatch(pathSet({ path: "/Main" }));
        dispatch(visibleSet({ visible: true }));
        dispatch(titleSet({ title: "Запросы" }));
    }, [dispatch]);

  return (
    <div className={styles.notifications_wrapper}>
      <div className={styles.notification_item}>
        <span>22.12.2025</span>
        <span>Кургузов Владислав</span>
        <span>Программист-разработчик</span>
        <span>Доступ к порталу</span>
        <span> - </span>
        <button className={styles.action_button} onClick={() => navigate("/Users/Edit/2")}>Перейти в профиль</button>
      </div>

      <div className={styles.notification_item}>
        <span>22.12.2025</span>
        <span>Крамаренко Александр</span>
        <span>Ведущий программист-разработчик</span>
        <span>Доступ к разделу</span>
        <span>Калькулятор, Склад, Учет сотрудников, Калькулятор, Склад, Учет сотрудников</span>
        <span className={`${styles.report} ${styles.report_bad}`}>Рассмотрено</span>
      </div>

    </div>
  )
}

export default Notifications