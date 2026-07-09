import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '../../utils/cn';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  className,
}) => (
  <div className={cn('surface-subtle flex flex-col items-start gap-4 p-6', className)}>
    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-ink-100 dark:bg-slate-800 dark:ring-slate-700">
      <Icon className="h-5 w-5 text-primary-700 dark:text-sky-300" />
    </div>
    <div className="space-y-1">
      <h3 className="text-lg font-semibold text-ink-900 dark:text-white">{title}</h3>
      <p className="max-w-xl text-sm leading-6 text-ink-600 dark:text-slate-300">{description}</p>
    </div>
    {action}
  </div>
);

export default EmptyState;
