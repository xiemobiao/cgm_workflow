import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, type ButtonProps } from '@/components/ui/button';

export const pageHeaderActionButtonClass =
  'h-8 rounded-md border-border/60 bg-background/40 text-foreground/90 hover:bg-accent/80 hover:border-border/80';

type PageHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <Card className={cn('glass border-white/[0.08]', className)}>
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold tracking-tight">{title}</CardTitle>
            {subtitle ? (
              <CardDescription className="text-sm text-muted-foreground">
                {subtitle}
              </CardDescription>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>
      </CardHeader>
    </Card>
  );
}

export function PageHeaderActionButton({
  className,
  variant = 'outline',
  size = 'sm',
  ...props
}: ButtonProps) {
  return (
    <Button
      variant={variant}
      size={size}
      className={cn(pageHeaderActionButtonClass, className)}
      {...props}
    />
  );
}
