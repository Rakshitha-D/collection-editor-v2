import React from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import { Lock, Zap, ShieldCheck } from 'lucide-react';
import { useLabels } from '../../../hooks/useLabels';
import fieldStyles from './Field.module.scss';
import styles from './StrategyCardField.module.scss';

interface StrategyCardFieldProps {
  name: string;
  label: string;
  required?: boolean;
  disabled?: boolean;
}

// Custom 3-card selector for the LP root's `strategy` (consumption policy)
// field — replaces the generic SelectField rendering for this one field code
// (design: Strict/lock, Adaptive/lightning, Prior learning/shield-check,
// each with a title + description + radio indicator).
export const StrategyCardField: React.FC<StrategyCardFieldProps> = ({ name, label, required, disabled }) => {
  const lbl = useLabels();
  const { control } = useFormContext();

  const cards = [
    { value: 'Fixed', Icon: Lock, title: lbl.learningPath.strategyStrictLabel, description: lbl.learningPath.strategyStrictDescription },
    { value: 'Diagnostic', Icon: Zap, title: lbl.learningPath.strategyAdaptiveLabel, description: lbl.learningPath.strategyAdaptiveDescription },
    { value: 'PriorLearning', Icon: ShieldCheck, title: lbl.learningPath.strategyPriorLearningLabel, description: lbl.learningPath.strategyPriorLearningDescription },
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
