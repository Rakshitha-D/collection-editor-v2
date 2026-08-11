import React from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../shared/Button';
import { useLabels } from '../../hooks/useLabels';
import styles from './modals.module.scss';

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Generic in-app replacement for window.confirm — a styled popup instead of
 * the browser's native "localhost:5173 says..." alert, which can't be
 * themed and looks out of place next to the rest of the editor's UI.
 * Callers open it via useUiStore's openModal('confirmDelete', { message,
 * onConfirm }); rendered once from Topbar.tsx alongside the other
 * activeModal-driven modals.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ message, onConfirm, onCancel }) => {
  const lbl = useLabels();
  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span id="confirm-dialog-title">{lbl.confirmDialog.title}</span>
          <button className={styles.modalHeaderClose} onClick={onCancel} aria-label={lbl.confirmDialog.closeAriaLabel}>
            ×
          </button>
        </div>
        <div className={styles.modalBody}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{message}</p>
        </div>
        <div className={styles.modalFooter}>
          <Button variant="ghost" onClick={onCancel}>
            {lbl.confirmDialog.cancelButton}
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {lbl.confirmDialog.confirmButton}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
