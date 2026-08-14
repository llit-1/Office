import AudiotrackRoundedIcon from "@mui/icons-material/AudiotrackRounded";
import CodeRoundedIcon from "@mui/icons-material/CodeRounded";
import DescriptionRoundedIcon from "@mui/icons-material/DescriptionRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import FolderZipRoundedIcon from "@mui/icons-material/FolderZipRounded";
import ImageRoundedIcon from "@mui/icons-material/ImageRounded";
import InsertDriveFileRoundedIcon from "@mui/icons-material/InsertDriveFileRounded";
import MovieRoundedIcon from "@mui/icons-material/MovieRounded";
import PictureAsPdfRoundedIcon from "@mui/icons-material/PictureAsPdfRounded";
import SlideshowRoundedIcon from "@mui/icons-material/SlideshowRounded";
import TableChartRoundedIcon from "@mui/icons-material/TableChartRounded";
import TextSnippetRoundedIcon from "@mui/icons-material/TextSnippetRounded";
import { FILE_KIND_LABEL, getFileKind, type FileKind } from "./fileTypes";
import styles from "./FileTypeIcon.module.css";

const ICON_BY_KIND: Record<FileKind, typeof FolderRoundedIcon> = {
  folder: FolderRoundedIcon,
  pdf: PictureAsPdfRoundedIcon,
  word: DescriptionRoundedIcon,
  excel: TableChartRoundedIcon,
  powerpoint: SlideshowRoundedIcon,
  image: ImageRoundedIcon,
  video: MovieRoundedIcon,
  audio: AudiotrackRoundedIcon,
  archive: FolderZipRoundedIcon,
  text: TextSnippetRoundedIcon,
  code: CodeRoundedIcon,
  other: InsertDriveFileRoundedIcon,
};

interface FileTypeIconProps {
  extension: string;
  isDirectory?: boolean;
  /** Показать бейдж с расширением поверх иконки. */
  showBadge?: boolean;
  className?: string;
}

export default function FileTypeIcon({ extension, isDirectory = false, showBadge = false, className }: FileTypeIconProps) {
  const kind = getFileKind(extension, isDirectory);
  const Icon = ICON_BY_KIND[kind];
  const badge = extension.replace(/^\./, "").toUpperCase();

  return (
    <span
      className={`${styles.wrapper} ${className ?? ""}`}
      data-kind={kind}
      title={FILE_KIND_LABEL[kind]}
      aria-label={FILE_KIND_LABEL[kind]}
    >
      <Icon className={styles.icon} />
      {showBadge && !isDirectory && badge && badge.length <= 5 && (
        <span className={styles.badge}>{badge}</span>
      )}
    </span>
  );
}
