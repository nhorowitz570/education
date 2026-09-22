'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './icons';
export function Button({
  children,
  onClick,
  kind = '',
  disabled = false,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      className={'button ' + kind}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function Pill({ children }: { children: ReactNode }) {
  return <span className="pill">{children}</span>;
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current,
      previous = document.activeElement as HTMLElement;
    el?.showModal();
    return () => {
      el?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="row between">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="page-heading">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </header>
  );
}
export function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob(
      [typeof data === 'string' ? data : JSON.stringify(data, null, 2)],
      { type: 'application/json' },
    ),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function dateLabel(date: string, short = false) {
  return new Intl.DateTimeFormat('en-US', {
    month: short ? 'short' : 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date + 'T12:00:00Z'));
}
