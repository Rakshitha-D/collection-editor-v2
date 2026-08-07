import { create } from 'zustand';

export type ModalType =
  | 'publishChecklist'
  | 'qualityParams'
  | 'manageCollaborators'
  | 'csvUpload'
  | 'confirmDelete'
  | 'resourceReorder'
  | 'assignPageNumber'
  | null;

interface UiState {
  activeModal: ModalType;
  modalData: Record<string, unknown>;
  openModal: (modal: ModalType, data?: Record<string, unknown>) => void;
  closeModal: () => void;
  // LP profile only: which pre/post assessment slot the Library dock's "add"
  // action should fill — set by OutlineTree's dashed slot rows, consumed (and
  // cleared) by LibraryDock. null means normal Level-content browsing/adding.
  activeAssessmentSlot: 'pre' | 'post' | null;
  setActiveAssessmentSlot: (slot: 'pre' | 'post' | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeModal: null,
  modalData: {},
  activeAssessmentSlot: null,
  openModal: (modal, data = {}) => set({ activeModal: modal, modalData: data }),
  closeModal: () => set({ activeModal: null, modalData: {} }),
  setActiveAssessmentSlot: (slot) => set({ activeAssessmentSlot: slot }),
}));
