import React, { useState } from 'react';
import { Search } from 'lucide-react';
import styles from './UnitContentList.module.scss';

interface SkillPickerProps {
  options: string[];
  selected: string[];
  /** Selected skills that fell outside the scope after the prior assessment changed —
   *  flagged for re-selection rather than silently dropped. */
  outOfScope: string[];
  onChange: (skills: string[]) => void;
  isEditable: boolean;
  note: string;
}

// Searchable skill multi-select for a Level's "Skills" field (design:
// lvl.hasSkillPicker, "No matching skills" empty state).
export const SkillPicker: React.FC<SkillPickerProps> = ({
  options, selected, outOfScope, onChange, isEditable, note,
}) => {
  const [query, setQuery] = useState('');
  const filtered = query
    ? options.filter(o => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  const toggle = (skill: string) => {
    if (!isEditable) return;
    onChange(selected.includes(skill) ? selected.filter(s => s !== skill) : [...selected, skill]);
  };

  return (
    <div className={styles.skillPicker}>
      <div className={styles.header}>
        <span className={styles.heading}>Skills</span>
        <span className={styles.count}>{selected.length}</span>
      </div>

      {outOfScope.length > 0 && (
        <div className={styles.skillWarning} role="alert">
          Out of scope, please re-select: {outOfScope.join(', ')}
        </div>
      )}

      {isEditable && (
        <div className={styles.skillSearchWrap}>
          <Search size={13} className={styles.searchIcon} />
          <input
            type="search"
            className={styles.skillSearchInput}
            placeholder="Search skills"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search skills"
          />
        </div>
      )}

      {options.length === 0 ? (
        <span className={styles.emptyHint}>No skills available yet</span>
      ) : filtered.length === 0 ? (
        <span className={styles.emptyHint}>No matching skills</span>
      ) : (
        <div className={styles.chips}>
          {filtered.map((skill) => {
            const isSelected = selected.includes(skill);
            const isFlagged = outOfScope.includes(skill);
            return (
              <button
                key={skill}
                type="button"
                disabled={!isEditable}
                className={[
                  styles.chip,
                  styles.chipToggle,
                  isSelected ? styles.chipActive : '',
                  isFlagged ? styles.chipFlagged : '',
                ].join(' ')}
                onClick={() => toggle(skill)}
              >
                {skill}
              </button>
            );
          })}
        </div>
      )}

      <span className={styles.skillPickerNote}>{note}</span>
    </div>
  );
};
