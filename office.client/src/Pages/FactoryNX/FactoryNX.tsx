import { useEffect, useState, useRef } from "react";
import { getFactoryNXReports, getUserReports } from "../Requests";
import { FactoryNXReport } from "./FactoryNXReport"
import { FactoryNXPersonReport } from "./FactoryNXPersonReport"
import styles from "./FactoryNX.module.css"
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { useDispatch } from "react-redux";

const FactoryNX = () => {
    const [data, setData] = useState<FactoryNXReport[]>([]);
    const [activePerson, setActivePerson] = useState<number | string | null>(null);
    const [mainPhoto, setMainPhoto] = useState<FactoryNXPersonReport | null>(null);
    const [photoLoading, setPhotoLoading] = useState(true);
    const dispatch = useDispatch();

    useEffect(() => {
        dispatch(titleSet({ title: "NX Завод" }));
        dispatch(visibleSet({ visible: true }));
        dispatch(pathSet({ path: "/" }));
      }, [dispatch]);

    useEffect(() => {
        const load = async () => {
            try {
                const resp = await getFactoryNXReports();
                setData(resp);
                if (resp.length > 0) {
                    await loadPersonReport(resp[0].personID);
                }
            } catch (err) {
                console.error("Load reports error:", err);
            }
        };
        load();
    }, []);

    const personSelectRef = useRef<HTMLDivElement | null>(null);
    const isDownRef = useRef(false);
    const startXRef = useRef(0);
    const scrollLeftRef = useRef(0);
    const movedRef = useRef(false);
    const suppressClickRef = useRef(false);

    // Для инерции
    const lastXRef = useRef(0);
    const lastTimeRef = useRef(0);
    const velocityRef = useRef(0); // px/ms
    const momentumFrameRef = useRef<number | null>(null);

    const stopMomentum = () => {
        if (momentumFrameRef.current != null) {
            cancelAnimationFrame(momentumFrameRef.current);
            momentumFrameRef.current = null;
        }
        velocityRef.current = 0;
    };

    const startMomentum = (el: HTMLDivElement, initialVelocity: number) => {
        let v = initialVelocity; // px/ms
        let last = performance.now();

        const tick = (now: number) => {
            const dt = Math.max(1, now - last);
            last = now;
            // смещение за этот кадр
            el.scrollLeft += v * dt;
            // демпфирование (экспоненциальное)
            const decay = Math.pow(0.95, dt / (1000 / 60)); // прибл. 0.95 per frame
            v *= decay;
            // остановка при малой скорости
            if (Math.abs(v) < 0.02) {
                stopMomentum();
                return;
            }
            momentumFrameRef.current = requestAnimationFrame(tick);
        };

        stopMomentum();
        momentumFrameRef.current = requestAnimationFrame(tick);
    };

    const onPointerDown = (e: React.PointerEvent) => {
        const el = personSelectRef.current;
        if (!el) return;
        stopMomentum();
        isDownRef.current = true;
        movedRef.current = false;
        el.setPointerCapture(e.pointerId);
        startXRef.current = e.clientX - el.offsetLeft;
        scrollLeftRef.current = el.scrollLeft;
        lastXRef.current = e.clientX;
        lastTimeRef.current = performance.now();
        el.style.cursor = "grabbing";
    };

    const onPointerMove = (e: React.PointerEvent) => {
        const el = personSelectRef.current;
        if (!isDownRef.current || !el) return;
        const x = e.clientX - el.offsetLeft;
        const walk = (x - startXRef.current) * 1; // скорость прокрутки
        if (Math.abs(walk) > 3) movedRef.current = true;
        el.scrollLeft = scrollLeftRef.current - walk;

        // вычисляем скорость (px / ms) на основе последних движений
        const now = performance.now();
        const dt = Math.max(1, now - lastTimeRef.current);
        const dx = e.clientX - lastXRef.current;
        // scrollLeft меняется как: scrollLeft = start - (x - startX)
        // поэтому скорость прокрутки (px/ms) = -dx/dt
        velocityRef.current = -dx / dt;
        lastXRef.current = e.clientX;
        lastTimeRef.current = now;
    };

    const onPointerUp = (e: React.PointerEvent) => {
        const el = personSelectRef.current;
        if (!el) return;
        // завершение захвата
        isDownRef.current = false;
        try { el.releasePointerCapture(e.pointerId); } catch { /* noop */ }
        el.style.cursor = "grab";

        const wasMoved = movedRef.current;
        // сброс moved сразу — дальше считаем по wasMoved
        movedRef.current = false;

        // если не было drag — считаем это кликом: находим элемент под курсором и выбираем
        if (!wasMoved) {
            const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
            const item = target?.closest('[data-person-id]') as HTMLElement | null;
            const idAttr = item?.getAttribute('data-person-id');
            if (idAttr != null) {
                // приводим к числу если нужно, но loadPersonReport принимает string|number
                loadPersonReport(isNaN(Number(idAttr)) ? idAttr : Number(idAttr));
            }
        } else {
            // стартуем инерцию: velocityRef (px/ms)
            const initialV = velocityRef.current * 1.2;
            // порог, чтобы не запускать при очень медленном движении
            if (Math.abs(initialV) > 0.02) {
                startMomentum(el, initialV);
            }
            velocityRef.current = 0;
        }

        // подавляем click после drag (если был)
        suppressClickRef.current = wasMoved;
        setTimeout(() => (suppressClickRef.current = false), 0);
    };

    const onPointerLeave = () => {
        const el = personSelectRef.current;
        if (!el) return;
        isDownRef.current = false;
        el.style.cursor = "grab";
    };

    const loadPersonReport = async ( id : number | string) => {
        setPhotoLoading(true);
        try {
            const personReport = await getUserReports(id);
            if (personReport && personReport.userMainPhoto) {
                setMainPhoto(personReport);
            } else {
                setMainPhoto(null);
            }
            setActivePerson(id);
        } catch (err) {
            console.error("Load person report error:", err);
            setMainPhoto(null);
        } finally {
            setPhotoLoading(false);
        }
    }

    return (
        <div className={styles.factoryNX_wrapper}>
            <div
                ref={personSelectRef}
                className={styles.factoryNX_wrapper_personSelect}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerLeave}
            >
                { data?.map((groups) => (
                    <div
                        key={groups.personID}
                        data-person-id={String(groups.personID)}
                        className={`${styles.factoryNX_item} ${activePerson === groups.personID ? styles.factoryNX_itemActive : ''}`}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                // клавиши работают как раньше
                                loadPersonReport(groups.personID);
                            }
                        }}
                        aria-pressed={activePerson === groups.personID}
                    >
                        <div>{groups.personID}</div>
                        <span> {groups.count} </span>
                    </div>
                ))}        
            </div> 

            <div className={styles.factoryNX_wrapper_photos}>

                <div className={styles.mainPhoto_wrapper}>
                    <div className={styles.mainPhoto_box}>
                        {photoLoading ? (
                            <LoadingSpinner />
                        ) : mainPhoto && mainPhoto.userMainPhoto ? (
                            <img className={styles.mainPhoto} src={mainPhoto.userMainPhoto} alt="User" />
                        ) : (
                            <div className={styles.mainPhoto_placeholder}>Нет фото</div>
                        )}
                    </div>

                     <div className={styles.buttonWrapper}>
                         <button className={styles.otherControl}> Еще какой-то функционал </button>
                         <button className={styles.handControl}> Включить ручной контроль </button>
                     </div>
                 </div>
                
                <div className={styles.photosToSelect_wrapper}>
                    { mainPhoto?.userReports?.map((personAlterPhoto) => (
                        personAlterPhoto?.photo ? (
                            <img
                                className={personAlterPhoto.error == 1 ? styles.photoToSelectRed : styles.photoToSelectGreen}
                                key={personAlterPhoto.id}
                                src={personAlterPhoto.photo}
                                alt={`photo-${personAlterPhoto.id}`}
                            />
                        ) : null
                    ))}
                </div>

            </div>

        </div>

        
    )
};

export default FactoryNX;
