export type FileKind =
  | "folder"
  | "pdf"
  | "word"
  | "excel"
  | "powerpoint"
  | "image"
  | "video"
  | "audio"
  | "archive"
  | "text"
  | "code"
  | "other";

const KIND_BY_EXTENSION: Record<string, FileKind> = {
  ".pdf": "pdf",

  ".doc": "word", ".docx": "word", ".docm": "word", ".dot": "word", ".dotx": "word",
  ".rtf": "word", ".odt": "word", ".pages": "word",

  ".xls": "excel", ".xlsx": "excel", ".xlsm": "excel", ".xlsb": "excel", ".xlt": "excel",
  ".xltx": "excel", ".csv": "excel", ".tsv": "excel", ".ods": "excel", ".numbers": "excel",

  ".ppt": "powerpoint", ".pptx": "powerpoint", ".pptm": "powerpoint", ".pps": "powerpoint",
  ".ppsx": "powerpoint", ".pot": "powerpoint", ".potx": "powerpoint", ".odp": "powerpoint", ".key": "powerpoint",

  ".jpg": "image", ".jpeg": "image", ".png": "image", ".gif": "image", ".webp": "image",
  ".bmp": "image", ".svg": "image", ".tif": "image", ".tiff": "image", ".heic": "image", ".ico": "image",

  ".mp4": "video", ".mov": "video", ".m4v": "video", ".webm": "video", ".avi": "video",
  ".mkv": "video", ".wmv": "video", ".mpg": "video", ".mpeg": "video", ".flv": "video",

  ".mp3": "audio", ".wav": "audio", ".ogg": "audio", ".m4a": "audio", ".flac": "audio", ".aac": "audio", ".wma": "audio",

  ".zip": "archive", ".rar": "archive", ".7z": "archive", ".tar": "archive", ".gz": "archive", ".bz2": "archive",

  ".txt": "text", ".md": "text", ".log": "text", ".ini": "text", ".cfg": "text",

  ".xml": "code", ".json": "code", ".yml": "code", ".yaml": "code", ".html": "code", ".htm": "code",
  ".css": "code", ".js": "code", ".ts": "code", ".sql": "code", ".cs": "code", ".py": "code",
  ".sh": "code", ".bat": "code", ".ps1": "code",
};

export function getFileKind(extension: string, isDirectory = false): FileKind {
  if (isDirectory) return "folder";
  const normalized = extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  return KIND_BY_EXTENSION[normalized] ?? "other";
}

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  folder: "Папка",
  pdf: "PDF-документ",
  word: "Документ Word",
  excel: "Таблица Excel",
  powerpoint: "Презентация",
  image: "Изображение",
  video: "Видео",
  audio: "Аудио",
  archive: "Архив",
  text: "Текстовый файл",
  code: "Файл разметки/кода",
  other: "Файл",
};
