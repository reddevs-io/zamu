// Settings › Appearance: the theme as three cards (Light, Dark, System), saved to the account.
import { THEME_LABELS, type Theme } from '@zamu/contracts';
import { Radio, RadioGroup } from 'react-aria-components';
import { Banner, Button, cn, FieldDescription, Label, PageHeader, RadioDot } from '~/ui';
import { useThemeChoice } from './ThemeChoice';
import { useSystemTheme } from './theme';

const CARD_ORDER: readonly Theme[] = ['light', 'dark', 'system'];

export function AppearancePage() {
  const theme = useThemeChoice();
  const system = useSystemTheme();
  return (
    <>
      <PageHeader title="Appearance" />
      <div className="flex min-h-0 flex-1 flex-col gap-5.5 overflow-y-auto px-10 py-7">
        <RadioGroup
          value={theme.value}
          onChange={(value) => theme.change(value as Theme)}
          className="flex max-w-190 flex-col gap-3.5"
        >
          <div className="flex flex-col gap-1">
            <Label>Theme</Label>
            <FieldDescription>
              Saved to your account, so it follows you to other browsers. System follows your operating
              system.
            </FieldDescription>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {CARD_ORDER.map((choice) => (
              <ThemeCard
                key={choice}
                theme={choice}
                note={choice === 'system' && system ? `now ${system}` : undefined}
              />
            ))}
          </div>
        </RadioGroup>
        {theme.error ? (
          <Banner
            className="max-w-190"
            action={
              <Button variant="secondary" size="sm" onPress={theme.dismissError}>
                Dismiss
              </Button>
            }
          >
            Couldn't save your theme, so it was switched back. {theme.error}
          </Banner>
        ) : null}
      </div>
    </>
  );
}

function ThemeCard({ theme, note }: { theme: Theme; note?: string }) {
  return (
    <Radio
      value={theme}
      className={({ isSelected, isFocusVisible }) =>
        cn(
          'flex cursor-pointer flex-col gap-2.5 rounded-md border p-2.5 outline-none',
          isSelected ? 'border-accent bg-accent-soft' : 'border-line hover:bg-bg-lane',
          isFocusVisible && 'focus-ring',
        )
      }
    >
      {({ isSelected }) => (
        <>
          <ThemePreview theme={theme} />
          <span className="flex items-center gap-2">
            <RadioDot selected={isSelected} />
            <span className="font-semibold">{THEME_LABELS[theme]}</span>
            {note ? <span className="text-xs text-fg-3">{note}</span> : null}
          </span>
        </>
      )}
    </Radio>
  );
}

/**
 * A miniature page: the rail and three text bars. Each half carries the .light or .dark class, so it
 * shows that theme's tokens whatever the page uses. System is half light, half dark.
 */
function ThemePreview({ theme }: { theme: Theme }) {
  if (theme === 'system') {
    return (
      <span aria-hidden className="relative block h-22 overflow-hidden rounded-sm border border-line">
        <span className="light absolute inset-y-0 left-0 w-1/2 bg-bg" />
        <span className="dark absolute inset-y-0 right-0 w-1/2 bg-bg" />
        <span className="light absolute inset-y-0 left-0 w-4.5 bg-bg-side" />
        <span className="absolute inset-y-0 right-0 left-4.5 flex flex-col gap-1.5 p-2.5">
          <span className="h-1.5 w-[60%] bg-fg-2" />
          <span className="h-1.5 w-[85%] bg-fg-3" />
          <span className="h-1.5 w-[40%] bg-fg-3" />
        </span>
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        theme,
        'grid h-22 grid-cols-[18px_minmax(0,1fr)] overflow-hidden rounded-sm border border-line bg-bg',
      )}
    >
      <span className="bg-bg-side" />
      <span className="flex flex-col gap-1.5 p-2.5">
        <span className="h-1.5 w-[60%] bg-fg" />
        <span className="h-1.5 w-[85%] bg-line" />
        <span className="h-1.5 w-[40%] bg-line" />
      </span>
    </span>
  );
}
