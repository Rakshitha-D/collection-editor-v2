import React, { useEffect, useRef, useState } from 'react';
import { Search, X, Check } from 'lucide-react';
import { useLabels } from '../../hooks/useLabels';
import styles from './UnitContentList.module.scss';

interface SkillPickerProps {
  options: string[];
  selected: string[];
  /** Selected skills that fell outside the scope after the prior assessment changed —
   *  flagged for re-selection rather than silently dropped. */
  outOfScope: string[];
  /** Selected skills with zero linked course under this Level actually
   *  tagged for them — covered in name only. Independent of outOfScope; a
   *  skill can be flagged for both at once. */
  uncovered: string[];
  onChange: (skills: string[]) => void;
  isEditable: boolean;
  /** Explains where the options come from — prior assessment scope, or the
   *  manual-selection fallback. Rendered directly under the heading. */
  description: string;
}

// Searchable skill multi-select for a Level's "Skills" field (design:
// lvl.hasSkillPicker) — selected skills render as removable pills; a search
// box opens a checkbox dropdown of the remaining options, so the picker
// stays compact regardless of how many skills the catalog/scope has.
export const SkillPicker: React.FC<SkillPickerProps> = ({
  options, selected, outOfScope, uncovered, onChange, isEditable, description,
}) => {
  const lbl = useLabels();
  const [query, setQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const filtered = query
    ? options.filter(o => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  const toggle = (skill: string) => {
    if (!isEditable) return;
    onChange(selected.includes(skill) ? selected.filter(s => s !== skill) : [...selected, skill]);
  };

  const remove = (skill: string) => {
    if (!isEditable) return;
    onChange(selected.filter(s => s !== skill));
  };

  return (
    <div className={styles.skillPicker}>
      <div className={styles.header}>
        <span className={styles.heading}>{lbl.learningPath.skillsHeading}</span>
        <span className={styles.count}>{selected.length}</span>
      </div>
      <span className={styles.skillPickerNote}>{description}</span>

      {outOfScope.length > 0 && (
        <div className={styles.skillWarning} role="alert">
          {lbl.learningPath.skillsOutOfScopeWarning.replace('{skills}', outOfScope.join(', '))}
        </div>
      )}

      {uncovered.length > 0 && (
        <div className={styles.skillWarning} role="alert">
          {lbl.learningPath.skillsUncoveredWarning.replace('{skills}', uncovered.join(', '))}
        </div>
      )}

      {selected.length > 0 && (
        <div className={styles.selectedSkills}>
          {selected.map((skill) => {
            const isFlagged = outOfScope.includes(skill);
            const isUncovered = uncovered.includes(skill);
            return (
              <span
                key={skill}
                className={[
                  styles.skillPill,
                  isFlagged ? styles.skillPillFlagged : '',
                  isUncovered ? styles.skillPillUncovered : '',
                ].filter(Boolean).join(' ')}
                title={isUncovered ? lbl.learningPath.skillUncoveredPillTitle : undefined}
              >
                {skill}
                {isEditable && (
                  <button
                    type="button"
                    className={styles.skillPillRemove}
                    onClick={() => remove(skill)}
                    aria-label={lbl.learningPath.removeSkillAriaLabel.replace('{skill}', skill)}
                  >
                    <X size={11} />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {isEditable ? (
        <div className={styles.skillSearchBox} ref={wrapRef}>
          <div className={styles.skillSearchWrap} onClick={() => setDropdownOpen(true)}>
            <input
              type="search"
              className={styles.skillSearchInput}
              placeholder={lbl.learningPath.searchSkillsPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setDropdownOpen(true)}
              aria-label={lbl.learningPath.searchSkillsPlaceholder}
            />
            <Search size={14} className={styles.searchIcon} />
          </div>

          {dropdownOpen && (
            <div className={styles.skillDropdown} role="listbox">
              {options.length === 0 ? (
                <div className={styles.skillDropdownEmpty}>{lbl.learningPath.noSkillsAvailable}</div>
              ) : filtered.length === 0 ? (
                <div className={styles.skillDropdownEmpty}>{lbl.learningPath.noMatchingSkills}</div>
              ) : (
                filtered.map((skill) => {
                  const isSelected = selected.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={styles.skillOption}
                      onClick={() => toggle(skill)}
                    >
                      <span className={[styles.skillCheckbox, isSelected ? styles.skillCheckboxChecked : ''].join(' ')}>
                        {isSelected && <Check size={12} />}
                      </span>
                      {skill}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      ) : (
        selected.length === 0 && (
          <span className={styles.emptyHint}>{lbl.learningPath.noSkillsSelectedYet}</span>
        )
      )}
    </div>
  );
};
