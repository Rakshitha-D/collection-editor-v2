import React from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { Lock, Zap, ShieldCheck } from 'lucide-react';
import { useLabels } from '../../../hooks/useLabels';
import fieldStyles from './Field.module.scss';
import styles from './PolicyCardField.module.scss';

interface PolicyCardFieldProps {
  name: string;
  label: string;
  required?: boolean;
  disabled?: boolean;
}

// Custom 3-card selector for the LP root's `policy` (consumption policy)
// field — replaces the generic SelectField rendering for this one field code
// (design: Strict/lock, Adaptive/lightning, Prior learning/shield-check,
// each with a title + description + radio indicator).
export const PolicyCardField: React.FC<PolicyCardFieldProps> = ({ name, label, required, disabled }) => {
  const lbl = useLabels();
  const { control } = useFormContext();

  const cards = [
    { value: 'Fixed', Icon: Lock, title: lbl.learningPath.policyStrictLabel, description: lbl.learningPath.policyStrictDescription },
    { value: 'Diagnostic', Icon: Zap, title: lbl.learningPath.policyAdaptiveLabel, description: lbl.learningPath.policyAdaptiveDescription },
    { value: 'PriorLearning', Icon: ShieldCheck, title: lbl.learningPath.policyPriorLearningLabel, description: lbl.learningPath.policyPriorLearningDescription },
  ];

  return (
    <div className={fieldStyles.field}>
      <label className={fieldStyles.label}>{label}{required && <span className={fieldStyles.required}>*</span>}</label>
      <Controller
        name={name}
        control={control}
        rules={{ required: required ? lbl.selectField.requiredError.replace('{field}', label) : false }}
        render={({ field }) => (
          <div className={styles.cards}>
            {cards.map(({ value, Icon, title, description }) => {
              const isActive = field.value === value;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  className={[styles.card, isActive ? styles.cardActive : ''].join(' ')}
                  onClick={() => field.onChange(value)}
                >
                  <div className={styles.cardHeader}>
                    <span className={[styles.cardIcon, isActive ? styles.cardIconActive : ''].join(' ')}>
                      <Icon size={16} />
                    </span>
                    <span className={[styles.radioDot, isActive ? styles.radioDotActive : ''].join(' ')} />
                  </div>
                  <span className={styles.cardTitle}>{title}</span>
                  <span className={styles.cardDescription}>{description}</span>
                </button>
              );
            })}
          </div>
        )}
      />
    </div>
  );
};
