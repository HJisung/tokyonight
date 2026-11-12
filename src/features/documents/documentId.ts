declare const documentIdBrand: unique symbol;

/**
 * 문서 ID. 파일 문서는 경로에서, 임시 메모는 임시 ID에서 만듭니다.
 * 문자열이라 React key나 의존성 배열에 그대로 쓸 수 있습니다.
 * 직접 조립하지 말고 `fileDocumentId`·`scratchDocumentId`로 만듭니다.
 */
export type DocumentId = string & { readonly [documentIdBrand]: true };

/** 문서 ID가 가리키는 것. 파일 경로 또는 임시 메모 ID입니다. */
export type DocumentSource =
  { type: "file"; path: string } | { type: "scratch"; scratchId: string };

export type DocumentKind = "markdown" | "text";

const FILE_PREFIX = "file:";
const SCRATCH_PREFIX = "scratch:";

/** 경로는 받은 그대로 씁니다. 같은 파일을 가리키는 다른 표기를 하나로 합치지 않습니다. */
export function fileDocumentId(path: string): DocumentId {
  return `${FILE_PREFIX}${path}` as DocumentId;
}

export function scratchDocumentId(scratchId: string): DocumentId {
  return `${SCRATCH_PREFIX}${scratchId}` as DocumentId;
}

export function documentSource(id: DocumentId): DocumentSource {
  if (id.startsWith(FILE_PREFIX)) {
    return { type: "file", path: id.slice(FILE_PREFIX.length) };
  }
  if (id.startsWith(SCRATCH_PREFIX)) {
    return { type: "scratch", scratchId: id.slice(SCRATCH_PREFIX.length) };
  }
  throw new Error(`알 수 없는 문서 ID입니다: ${id}`);
}

/** 파일 문서면 경로, 임시 메모면 `null`. */
export function documentPath(id: DocumentId): string | null {
  const source = documentSource(id);
  return source.type === "file" ? source.path : null;
}

/**
 * 경로의 확장자로 문서 종류를 정합니다. Rust `fs::ops::classify_file`과 같은 규칙입니다:
 * `.md`(대소문자 무시)만 Markdown이고, 그 밖의 확장자와 확장자 없는 파일은 일반 텍스트입니다.
 */
export function kindFromPath(path: string): DocumentKind {
  const name = path.slice(
    Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1,
  );
  const dot = name.lastIndexOf(".");
  if (dot > 0 && name.slice(dot + 1).toLowerCase() === "md") {
    return "markdown";
  }
  return "text";
}
