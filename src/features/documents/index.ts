// 문서 저장소. 편집기 라이브러리에 의존하지 않습니다.
// 내용 읽기(`documents.getContent`), 변경 적용(`documents.applyChanges`), 변경 구독(`documents.subscribe`).
export {
  documentPath,
  documentSource,
  fileDocumentId,
  kindFromPath,
} from "./documentId";
export type { DocumentId, DocumentKind, DocumentSource } from "./documentId";
export { documents } from "./documentStore";
export type {
  ChangeOrigin,
  CloseOptions,
  CloseResult,
  DocumentChangeEvent,
  DocumentChangeListener,
  DocumentError,
  DocumentIdChange,
  DocumentIdChangeListener,
  DocumentState,
  DocumentStore,
  DocumentStoreError,
  PathChangeResult,
  SaveResult,
} from "./documentStore";
export type { TextChange } from "./textChange";
export { useDocument } from "./useDocument";
