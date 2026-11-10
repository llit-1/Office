import { useEffect, useState, type ReactNode } from "react";
import { loadKnowledgeImage } from "./knowledgeLibrary.api";

type Props = {
  path: string;
  alt: string;
  className?: string;
  fallback?: ReactNode;
};

/**
 * <img> не умеет отправлять Authorization, а токен в адресе оседает в логах IIS/прокси.
 * Поэтому картинку грузим через axios (с заголовком) и показываем из blob.
 */
export default function KnowledgeImage({ path, alt, className, fallback = null }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    setSrc(null);
    loadKnowledgeImage(path)
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return src ? <img className={className} src={src} alt={alt} /> : <>{fallback}</>;
}
