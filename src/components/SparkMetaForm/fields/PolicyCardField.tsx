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
// each with a title + description + radio indicator). The icon chip color,
// and Adaptive's title/description color, are fixed per-card in the design
// (not selection-dependent) — see PolicyCardField.module.scss.
export const PolicyCardField: React.FC<PolicyCardFieldProps> = ({ name, label, required, disabled }) => {
  const lbl = useLabels();
  const { control } = useFormContext();

  const cards = [
    {
      value: 'strict', Icon: Lock, iconVariant: styles.cardIconPrimary,
      title: lbl.learningPath.policyStrictLabel, titleVariant: '',
      description: <>{lbl.learningPath.policyStrictDescription}</>, descriptionVariant: '',
    },
    {
      value: 'adaptive', Icon: Zap, iconVariant: styles.cardIconPrimary,
      title: lbl.learningPath.policyAdaptiveLabel, titleVariant: styles.cardTitleInk,
      description: (
        <>
          {lbl.learningPath.policyAdaptiveDescriptionPre}
          <span className={fieldStyles.required}>*</span>
          {lbl.learningPath.policyAdaptiveDescriptionPost}
        </>
      ),
      descriptionVariant: styles.cardDescriptionCharcoal,
    },
    {
      value: 'priorLearning', Icon: ShieldCheck, iconVariant: styles.cardIconHover,
      title: lbl.learningPath.policyPriorLearningLabel, titleVariant: '',
      description: <>{lbl.learningPath.policyPriorLearningDescription}</>, descriptionVariant: '',
    },
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
            {cards.map(({ value, Icon, iconVariant, title, titleVariant, description, descriptionVariant }) => {
              const isActive = field.value === value;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  className={[styles.card, isActive ? styles.cardActive : ''].join(' ')}
                  onClick={() => field.onChange(value)}
                >
                  <span className={[styles.cardIcon, iconVariant].join(' ')}>
                    <Icon size={16} />
                  </span>
                  <span className={[styles.radioDot, isActive ? styles.radioDotActive : ''].join(' ')} />
                  <span className={[styles.cardTitle, titleVariant].join(' ')}>{title}</span>
                  <span className={[styles.cardDescription, descriptionVariant].join(' ')}>{description}</span>
                </button>
              );
            })}
          </div>
        )}
      />
    </div>
  );
};
