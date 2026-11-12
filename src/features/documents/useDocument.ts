import { useStore } from "zustand";
import type { DocumentId } from "./documentId";
import { documents } from "./documentStore";
import type { DocumentState } from "./documentStore";

/**
 * 열려 있는 문서의 현재 상태(내용, 수정됨 여부 등)를 구독합니다.
 * 열려 있지 않으면 `undefined`. 문서를 열고 닫는 일은 하지 않습니다.
 */
export function useDocument(id: DocumentId | null): DocumentState | undefined {
  return useStore(documents.state, (state) =>
    id === null ? undefined : state.documents[id],
  );
}
