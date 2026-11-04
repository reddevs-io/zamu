import { M5Gallery } from './M5Gallery';
import { TokensSheet } from './TokensSheet';

/**
 * /__ui: the M5 Margin kit (frames 001 and 002, light and dark, then the pickers and dialogs), then the
 * tokens sheet (colours, type scale, radii, elevation, spacing) with the kit components on them.
 */
export function UIGallery() {
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <M5Gallery />
      <div className="border-t border-line">
        <TokensSheet />
      </div>
    </div>
  );
}
