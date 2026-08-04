import React from 'react';

interface LearningPathIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

// Custom icon (not in lucide-react): an inverted-S route connecting two
// waypoint nodes, representing a Learning Path. Used for the LP root's tree
// icon and the "Learning Path" profile badge in the Topbar. Stroke uses
// currentColor so it inherits color from its container, same as lucide icons.
export const LearningPathIcon: React.FC<LearningPathIconProps> = ({ size = 16, ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...rest}
  >
    <circle cx="58" cy="12" r="4" stroke="currentColor" strokeWidth="4" />
    <circle cx="8" cy="58" r="4" stroke="currentColor" strokeWidth="4" />
    <path
      d="M52 12 H24 A12 12 0 0 0 24 36 H40 A12 12 0 0 1 40 60 H12"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
