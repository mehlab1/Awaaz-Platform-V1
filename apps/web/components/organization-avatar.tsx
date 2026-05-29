'use client';

import { Building2 } from 'lucide-react';

import { cn } from '@/lib/utils';

interface OrganizationAvatarProps {
  name?: string | null;
  className?: string;
  textClassName?: string;
}

const DESCRIPTOR_WORDS = new Set([
  'co',
  'company',
  'inc',
  'llc',
  'ltd',
  'limited',
  'solution',
  'solutions',
]);

export function OrganizationAvatar({
  name,
  className,
  textClassName,
}: OrganizationAvatarProps) {
  const initials = getOrganizationInitials(name);

  if (!initials) {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full bg-foreground text-background',
          className,
        )}
        aria-hidden="true"
      >
        <Building2 className="size-4" />
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-foreground text-background',
        className,
      )}
      aria-hidden="true"
    >
      <span className={cn('font-bold leading-none', textClassName)}>
        {initials}
      </span>
    </span>
  );
}

export function getOrganizationInitials(name?: string | null): string {
  const meaningfulWords = (name ?? '')
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ''))
    .filter((word) => /[A-Za-z]/.test(word));

  if (meaningfulWords.length === 0) {
    return 'A';
  }

  const first = firstLetter(meaningfulWords[0]);
  const remainingWords = meaningfulWords.slice(1);
  const secondWord =
    remainingWords.find((word) => !DESCRIPTOR_WORDS.has(word.toLowerCase()))
    ?? remainingWords[0]
    ?? '';
  const second = firstLetter(secondWord);

  return `${first}${second}`.toUpperCase().slice(0, 2);
}

function firstLetter(value: string): string {
  return value.match(/[A-Za-z]/)?.[0] ?? '';
}
