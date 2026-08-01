import type { DiagPanelProps } from './DiagPanel.types';
import './DiagPanel.scss';

/** Framed panel with the designer's centred caption bar. */
export function DiagPanel({
  title,
  children,
  style,
  className = '',
  captionOffsetX = 0,
}: DiagPanelProps) {
  return (
    <section className={`diag-panel ${className}`.trim()} style={style}>
      {/* Shifting the caption is done by padding one side of the centring grid,
          so the text stays centred in whatever space is left. */}
      <h2
        className="diag-panel__caption"
        style={captionOffsetX ? { paddingRight: -captionOffsetX * 2 } : undefined}
      >
        {title}
      </h2>
      <div className="diag-panel__body">{children}</div>
    </section>
  );
}
