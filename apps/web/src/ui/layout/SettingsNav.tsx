import { Link } from 'react-aria-components';
import { cn } from '../cn';

export interface SettingsNavSection {
  label: string;
  items: readonly { id: string; label: string; href: string; isCurrent?: boolean }[];
}

/** 220px settings sidebar on --band: title, section captions, links with an accent bar on the current one. */
export function SettingsNav({
  title = 'Settings',
  sections,
  className,
}: {
  title?: string;
  sections: readonly SettingsNavSection[];
  className?: string;
}) {
  return (
    <nav
      aria-label={title}
      className={cn(
        'flex w-[220px] shrink-0 flex-col gap-0.5 border-r border-line bg-band px-3 py-[22px]',
        className,
      )}
    >
      <div className="px-3 pb-1 text-[15px] font-semibold">{title}</div>
      {sections.map((section) => (
        <div key={section.label} className="flex flex-col gap-0.5">
          <div className="caps px-3 pt-3.5 pb-1.5">{section.label}</div>
          {section.items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              aria-current={item.isCurrent ? 'page' : undefined}
              className={cn(
                'flex h-[30px] items-center px-3 outline-none focus-visible:focus-ring-inset',
                item.isCurrent
                  ? 'bg-surface font-semibold text-fg shadow-[inset_2px_0_0_var(--accent)]'
                  : 'text-muted hover:text-fg',
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
